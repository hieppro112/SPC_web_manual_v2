// ============================================================
// routes/auth.ts — Đăng nhập / đăng ký / tài khoản admin đầu tiên
// ============================================================
//   GET  /api/auth/me            user đang đăng nhập (hoặc null nếu là khách)
//   GET  /api/auth/setup-status  { needsSetup, allowedEmailDomains }
//   POST /api/auth/setup         tạo admin ĐẦU TIÊN (chỉ khi chưa có ai)
//   POST /api/auth/register      tự đăng ký -> tài khoản CHỜ admin duyệt
//   POST /api/auth/login         bằng tên đăng nhập HOẶC email
//   POST /api/auth/logout
//   PUT  /api/auth/password      tự đổi mật khẩu

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { clearAuthCookie, currentUser, requireAuth, setAuthCookie } from '../middleware/auth.ts';
import { countUsers, createUser, findUserForLogin, getPasswordHash, updateUser, userToJson } from '../repositories/users.ts';

export const authRouter = Router();

// Độ "khó" của bcrypt: 10 vòng = ~100ms mỗi lần băm. Đủ chậm để dò mật
// khẩu hàng loạt rất tốn thời gian, đủ nhanh để người dùng không thấy.
export const BCRYPT_ROUNDS = 10;
export const passwordSchema = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(200);

// Luật tên đăng nhập (hồi MongoDB nằm trong schema của Mongoose).
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Tên đăng nhập 3–32 ký tự: chữ không dấu, số, dấu . _ -');

export const displayNameSchema = z.string().trim().min(1, 'Nhập tên hiển thị').max(100);

// Email hợp lệ + (nếu có cấu hình) đúng đuôi email công ty.
export const companyEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Email không hợp lệ'))
  .refine(
    (email) => config.allowedEmailDomains.length === 0 || config.allowedEmailDomains.includes(email.split('@')[1] ?? ''),
    { message: `Chỉ chấp nhận email công ty (@${config.allowedEmailDomains.join(', @')})` },
  );

const loginSchema = z.object({
  // Một ô nhập chung: có "@" thì hiểu là email, không thì là tên đăng nhập.
  username: z.string().trim().toLowerCase().min(1, 'Nhập tên đăng nhập hoặc email'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});

const setupSchema = z.object({ username: usernameSchema, displayName: displayNameSchema, password: passwordSchema });

const registerSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: companyEmailSchema,
  password: passwordSchema,
});

authRouter.get('/me', (_req, res) => {
  // Trả 200 + null thay vì 401 cho khách: khách là trạng thái BÌNH THƯỜNG
  // của app này, không phải lỗi (tránh console trình duyệt đỏ lòm).
  const user = res.locals.user;
  res.json({ user: user ? userToJson(user) : null });
});

authRouter.get('/setup-status', async (_req, res) => {
  // Gửi kèm đuôi email cho phép để form đăng ký hiện gợi ý.
  res.json({ needsSetup: (await countUsers()) === 0, allowedEmailDomains: config.allowedEmailDomains });
});

authRouter.post('/setup', async (req, res) => {
  if ((await countUsers()) > 0) throw new HttpError(409, 'Đã có tài khoản, không thể setup lại');
  const { username, displayName, password } = setupSchema.parse(req.body ?? {});
  const user = await createUser({
    username,
    displayName,
    email: null,
    role: 'admin',
    status: 'active',
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  setAuthCookie(res, user);
  res.status(201).json({ user: userToJson(user) });
});

authRouter.post('/register', async (req, res) => {
  // Chưa có admin thì không ai duyệt được -> phải setup trước.
  if ((await countUsers()) === 0) {
    throw new HttpError(409, 'Hệ thống chưa có admin. Hãy tạo tài khoản admin trước.');
  }
  const { password, ...data } = registerSchema.parse(req.body ?? {});
  // Luôn là editor + pending, client gửi role/status gì cũng bị bỏ qua.
  await createUser({ ...data, role: 'editor', status: 'pending', passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
  // KHÔNG đăng nhập luôn: phải đợi admin duyệt.
  res.status(201).json({ pending: true });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body ?? {});
  const found = await findUserForLogin(username);
  // Sai tên hay sai mật khẩu đều báo CÙNG một câu: không cho kẻ dò biết
  // tên đăng nhập nào có tồn tại.
  const ok = found ? await bcrypt.compare(password, found.passwordHash) : false;
  if (!found || !ok) throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  // Chỉ báo "đang chờ duyệt" khi mật khẩu ĐÚNG — người ngoài không dò được.
  if (found.user.status !== 'active') throw new HttpError(403, 'Tài khoản đang chờ admin duyệt');

  setAuthCookie(res, found.user);
  res.json({ user: userToJson(found.user) });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'), newPassword: passwordSchema })
    .parse(req.body ?? {});

  const me = currentUser(res);
  const hash = await getPasswordHash(me.id);
  if (!hash || !(await bcrypt.compare(currentPassword, hash))) {
    throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  }
  await updateUser(me.id, { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
  res.status(204).end();
});

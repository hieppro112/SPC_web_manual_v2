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
//
// "Setup lần đầu" thay cho việc phải mở DB tạo admin bằng tay: cài app
// xong, mở trang đăng nhập là được mời tạo tài khoản admin.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { config } from '../config.ts';
import { UserModel } from '../models/User.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { clearAuthCookie, currentUser, requireAuth, setAuthCookie } from '../middleware/auth.ts';

export const authRouter = Router();

// Độ "khó" của bcrypt: 10 vòng = ~100ms mỗi lần băm. Đủ chậm để dò mật
// khẩu hàng loạt rất tốn thời gian, đủ nhanh để người dùng không thấy.
export const BCRYPT_ROUNDS = 10;
export const passwordSchema = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(200);

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

const setupSchema = z.object({
  username: z.string().trim().toLowerCase(),
  displayName: z.string().trim().min(1, 'Nhập tên hiển thị'),
  password: passwordSchema,
});

const registerSchema = z.object({
  username: z.string().trim().toLowerCase(),
  displayName: z.string().trim().min(1, 'Nhập họ tên'),
  email: companyEmailSchema,
  password: passwordSchema,
});

authRouter.get('/me', (_req, res) => {
  // Trả 200 + null thay vì 401 cho khách: khách là trạng thái BÌNH THƯỜNG
  // của app này, không phải lỗi (tránh console trình duyệt đỏ lòm).
  res.json({ user: res.locals.user ?? null });
});

authRouter.get('/setup-status', async (_req, res) => {
  const count = await UserModel.countDocuments();
  // Gửi kèm đuôi email cho phép để form đăng ký hiện gợi ý.
  res.json({ needsSetup: count === 0, allowedEmailDomains: config.allowedEmailDomains });
});

authRouter.post('/setup', async (req, res) => {
  if ((await UserModel.countDocuments()) > 0) {
    throw new HttpError(409, 'Đã có tài khoản, không thể setup lại');
  }
  const { username, displayName, password } = setupSchema.parse(req.body ?? {});
  const user = await UserModel.create({
    username,
    displayName,
    role: 'admin',
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  setAuthCookie(res, user);
  res.status(201).json({ user });
});

authRouter.post('/register', async (req, res) => {
  // Chưa có admin thì không ai duyệt được -> phải setup trước.
  if ((await UserModel.countDocuments()) === 0) {
    throw new HttpError(409, 'Hệ thống chưa có admin. Hãy tạo tài khoản admin trước.');
  }
  const { password, ...data } = registerSchema.parse(req.body ?? {});
  // Luôn là editor + pending, client gửi role/status gì cũng bị bỏ qua.
  await UserModel.create({
    ...data,
    role: 'editor',
    status: 'pending',
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  // KHÔNG đăng nhập luôn: phải đợi admin duyệt.
  res.status(201).json({ pending: true });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body ?? {});
  const filter = username.includes('@') ? { email: username } : { username };
  const user = await UserModel.findOne(filter).select('+passwordHash');
  // Sai tên hay sai mật khẩu đều báo CÙNG một câu: không cho kẻ dò biết
  // tên đăng nhập nào có tồn tại.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
  // Chỉ báo "đang chờ duyệt" khi mật khẩu ĐÚNG — người ngoài không dò được.
  if (user.status !== 'active') throw new HttpError(403, 'Tài khoản đang chờ admin duyệt');

  setAuthCookie(res, user);
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().min(1, 'Nhập mật khẩu hiện tại'), newPassword: passwordSchema })
    .parse(req.body ?? {});

  const user = await UserModel.findById(currentUser(res).id).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
  }
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();
  res.status(204).end();
});

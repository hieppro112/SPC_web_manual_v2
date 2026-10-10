// ============================================================
// routes/auth.ts — Đăng nhập / đăng xuất / tài khoản admin đầu tiên
// ============================================================
//   GET  /api/auth/me            user đang đăng nhập (hoặc null nếu là khách)
//   GET  /api/auth/setup-status  { needsSetup } — DB chưa có tài khoản nào?
//   POST /api/auth/setup         tạo admin ĐẦU TIÊN (chỉ khi chưa có ai)
//   POST /api/auth/login
//   POST /api/auth/logout
//   PUT  /api/auth/password      tự đổi mật khẩu
//
// "Setup lần đầu" thay cho việc phải mở DB tạo admin bằng tay: cài app
// xong, mở trang đăng nhập là được mời tạo tài khoản admin.

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserModel } from '../models/User.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { clearAuthCookie, currentUser, requireAuth, setAuthCookie } from '../middleware/auth.ts';

export const authRouter = Router();

// Độ "khó" của bcrypt: 10 vòng = ~100ms mỗi lần băm. Đủ chậm để dò mật
// khẩu hàng loạt rất tốn thời gian, đủ nhanh để người dùng không thấy.
export const BCRYPT_ROUNDS = 10;
export const passwordSchema = z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự').max(200);

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Nhập tên đăng nhập'),
  password: z.string().min(1, 'Nhập mật khẩu'),
});

const setupSchema = z.object({
  username: z.string().trim().toLowerCase(),
  displayName: z.string().trim().min(1, 'Nhập tên hiển thị'),
  password: passwordSchema,
});

authRouter.get('/me', (_req, res) => {
  // Trả 200 + null thay vì 401 cho khách: khách là trạng thái BÌNH THƯỜNG
  // của app này, không phải lỗi (tránh console trình duyệt đỏ lòm).
  res.json({ user: res.locals.user ?? null });
});

authRouter.get('/setup-status', async (_req, res) => {
  const count = await UserModel.countDocuments();
  res.json({ needsSetup: count === 0 });
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

authRouter.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body ?? {});
  const user = await UserModel.findOne({ username }).select('+passwordHash');
  // Sai tên hay sai mật khẩu đều báo CÙNG một câu: không cho kẻ dò biết
  // tên đăng nhập nào có tồn tại.
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !ok) throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');

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

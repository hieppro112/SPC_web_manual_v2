// ============================================================
// routes/users.ts — Admin quản lý tài khoản editor/admin
// ============================================================
// Cả router chỉ dành cho admin (requireAdmin gắn ở index.ts).
//   GET    /api/users                 tất cả (cả tài khoản chờ duyệt)
//   POST   /api/users                 { username, displayName, email?, password, role }
//   PUT    /api/users/:id             { displayName?, role?, password? }  (password = đặt lại)
//   POST   /api/users/:id/approve     { role } — duyệt tài khoản tự đăng ký
//   DELETE /api/users/:id             xóa (cũng dùng để TỪ CHỐI tài khoản chờ duyệt)

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ROLES, UserModel } from '../models/User.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser } from '../middleware/auth.ts';
import { BCRYPT_ROUNDS, passwordSchema } from './auth.ts';

export const usersRouter = Router();

const createSchema = z.object({
  username: z.string().trim().toLowerCase(),
  displayName: z.string().trim().min(1, 'Nhập tên hiển thị'),
  // Admin tạo thì email không bắt buộc và không giới hạn đuôi email.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([z.literal(''), z.email('Email không hợp lệ')]))
    .optional(),
  password: passwordSchema,
  role: z.enum(ROLES).default('editor'),
});

const updateSchema = z.object({
  displayName: z.string().trim().min(1, 'Nhập tên hiển thị').optional(),
  role: z.enum(ROLES).optional(),
  password: passwordSchema.optional(),
});

// Không được để hệ thống mất admin cuối cùng — mất là không ai quản lý
// được tài khoản nữa. Chỉ đếm admin ĐANG HOẠT ĐỘNG.
async function assertNotLastAdmin(userId: string) {
  const otherAdmins = await UserModel.countDocuments({ role: 'admin', status: { $ne: 'pending' }, _id: { $ne: userId } });
  if (otherAdmins === 0) throw new HttpError(409, 'Phải còn ít nhất một admin');
}

usersRouter.get('/', async (_req, res) => {
  res.json(await UserModel.find().sort({ createdAt: 1 }));
});

usersRouter.post('/', async (req, res) => {
  const { password, email, ...data } = createSchema.parse(req.body ?? {});
  const user = await UserModel.create({
    ...data,
    // Chuỗi rỗng -> không lưu email (để index `sparse` không coi các
    // tài khoản không email là trùng nhau).
    ...(email ? { email } : {}),
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  res.status(201).json(user);
});

usersRouter.put('/:id', async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');

  const { displayName, role, password } = updateSchema.parse(req.body ?? {});
  if (role && role !== 'admin' && user.role === 'admin') await assertNotLastAdmin(user.id);

  if (displayName !== undefined) user.displayName = displayName;
  if (role !== undefined) user.role = role;
  if (password !== undefined) user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await user.save();
  res.json(user);
});

usersRouter.post('/:id/approve', async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');
  if (user.status === 'active') throw new HttpError(409, 'Tài khoản này đã được duyệt');

  const { role } = z.object({ role: z.enum(ROLES).default('editor') }).parse(req.body ?? {});
  user.status = 'active';
  user.role = role;
  await user.save();
  res.json(user);
});

usersRouter.delete('/:id', async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');
  if (user.id === currentUser(res).id) throw new HttpError(409, 'Không thể tự xóa tài khoản của mình');
  if (user.role === 'admin' && user.status === 'active') await assertNotLastAdmin(user.id);

  await user.deleteOne();
  res.status(204).end();
});

// ============================================================
// routes/users.ts — Admin quản lý tài khoản editor/admin
// ============================================================
// Cả router chỉ dành cho admin (requireAdmin gắn ở index.ts).
//   GET    /api/users
//   POST   /api/users       { username, displayName, password, role }
//   PUT    /api/users/:id   { displayName?, role?, password? }  (password = đặt lại)
//   DELETE /api/users/:id

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
  password: passwordSchema,
  role: z.enum(ROLES).default('editor'),
});

const updateSchema = z.object({
  displayName: z.string().trim().min(1, 'Nhập tên hiển thị').optional(),
  role: z.enum(ROLES).optional(),
  password: passwordSchema.optional(),
});

// Không được để hệ thống mất admin cuối cùng — mất là không ai quản lý
// được tài khoản nữa.
async function assertNotLastAdmin(userId: string) {
  const otherAdmins = await UserModel.countDocuments({ role: 'admin', _id: { $ne: userId } });
  if (otherAdmins === 0) throw new HttpError(409, 'Phải còn ít nhất một admin');
}

usersRouter.get('/', async (_req, res) => {
  res.json(await UserModel.find().sort({ createdAt: 1 }));
});

usersRouter.post('/', async (req, res) => {
  const { password, ...data } = createSchema.parse(req.body ?? {});
  const user = await UserModel.create({ ...data, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) });
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

usersRouter.delete('/:id', async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');
  if (user.id === currentUser(res).id) throw new HttpError(409, 'Không thể tự xóa tài khoản của mình');
  if (user.role === 'admin') await assertNotLastAdmin(user.id);

  await user.deleteOne();
  res.status(204).end();
});

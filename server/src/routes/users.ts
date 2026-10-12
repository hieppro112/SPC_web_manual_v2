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
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser } from '../middleware/auth.ts';
import {
  ROLES,
  countOtherActiveAdmins,
  createUser,
  deleteUser,
  findUserById,
  listUsers,
  updateUser,
  userToJson,
} from '../repositories/users.ts';
import { parseId } from '../utils/ids.ts';
import { BCRYPT_ROUNDS, displayNameSchema, passwordSchema, usernameSchema } from './auth.ts';

export const usersRouter = Router();

const createSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
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
  displayName: displayNameSchema.optional(),
  role: z.enum(ROLES).optional(),
  password: passwordSchema.optional(),
});

// Không được để hệ thống mất admin cuối cùng — mất là không ai quản lý
// được tài khoản nữa. Chỉ đếm admin ĐANG HOẠT ĐỘNG.
async function assertNotLastAdmin(userId: number) {
  if ((await countOtherActiveAdmins(userId)) === 0) throw new HttpError(409, 'Phải còn ít nhất một admin');
}

async function findOr404(id: unknown) {
  const user = await findUserById(parseId(id));
  if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản');
  return user;
}

usersRouter.get('/', async (_req, res) => {
  res.json((await listUsers()).map(userToJson));
});

usersRouter.post('/', async (req, res) => {
  const { password, email, ...data } = createSchema.parse(req.body ?? {});
  const user = await createUser({
    ...data,
    // Chuỗi rỗng -> NULL: nhiều tài khoản không có email không bị coi là trùng.
    email: email || null,
    status: 'active',
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
  });
  res.status(201).json(userToJson(user));
});

usersRouter.put('/:id', async (req, res) => {
  const user = await findOr404(req.params.id);
  const { displayName, role, password } = updateSchema.parse(req.body ?? {});
  if (role && role !== 'admin' && user.role === 'admin') await assertNotLastAdmin(user.id);

  const updated = await updateUser(user.id, {
    displayName,
    role,
    passwordHash: password !== undefined ? await bcrypt.hash(password, BCRYPT_ROUNDS) : undefined,
  });
  res.json(userToJson(updated!));
});

usersRouter.post('/:id/approve', async (req, res) => {
  const user = await findOr404(req.params.id);
  if (user.status === 'active') throw new HttpError(409, 'Tài khoản này đã được duyệt');

  const { role } = z.object({ role: z.enum(ROLES).default('editor') }).parse(req.body ?? {});
  const updated = await updateUser(user.id, { status: 'active', role });
  res.json(userToJson(updated!));
});

usersRouter.delete('/:id', async (req, res) => {
  const user = await findOr404(req.params.id);
  if (user.id === currentUser(res).id) throw new HttpError(409, 'Không thể tự xóa tài khoản của mình');
  if (user.role === 'admin' && user.status === 'active') await assertNotLastAdmin(user.id);

  await deleteUser(user.id);
  res.status(204).end();
});

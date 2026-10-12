// ============================================================
// routes/categories.ts — Mọi API của thể loại
// ============================================================
//   GET    /api/categories      danh sách + số tài liệu mỗi thể loại (ai cũng xem)
//   POST   /api/categories      tạo mới   (admin)
//   PUT    /api/categories/:id  sửa       (admin)
//   DELETE /api/categories/:id  xóa       (admin, chỉ khi không còn tài liệu)

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { requireAdmin } from '../middleware/auth.ts';
import {
  countDocumentsInCategory,
  createCategory,
  deleteCategory,
  findCategoryById,
  listCategoriesWithCount,
  updateCategory,
} from '../repositories/categories.ts';
import { parseId } from '../utils/ids.ts';

export const categoriesRouter = Router();

const nameSchema = z.string().trim().min(1, 'Tên thể loại không được để trống').max(100, 'Tên thể loại tối đa 100 ký tự');
const iconSchema = z.string().trim().min(1).max(50);

async function findOr404(id: unknown) {
  const category = await findCategoryById(parseId(id));
  if (!category) throw new HttpError(404, 'Thể loại không tồn tại');
  return category;
}

categoriesRouter.get('/', async (_req, res) => {
  res.json(await listCategoriesWithCount(!res.locals.user));
});

categoriesRouter.post('/', requireAdmin, async (req, res) => {
  const { name, iconName } = z.object({ name: nameSchema, iconName: iconSchema.default('Folder') }).parse(req.body ?? {});
  // Trùng tên -> SQL Server báo vi phạm UQ_Categories_Name -> errorHandler trả 409.
  res.status(201).json(await createCategory(name, iconName));
});

categoriesRouter.put('/:id', requireAdmin, async (req, res) => {
  const category = await findOr404(req.params.id);
  const { name, iconName } = z
    .object({ name: nameSchema.optional(), iconName: iconSchema.optional() })
    .parse(req.body ?? {});
  res.json(await updateCategory(Number(category.id), name ?? category.name, iconName ?? category.iconName));
});

categoriesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const category = await findOr404(req.params.id);
  const count = await countDocumentsInCategory(Number(category.id));
  if (count > 0) throw new HttpError(409, `Còn ${count} tài liệu thuộc thể loại này, không thể xóa`);

  await deleteCategory(Number(category.id));
  res.status(204).end();
});

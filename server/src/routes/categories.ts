// ============================================================
// routes/categories.ts — Mọi API của thể loại (dạng cây)
// ============================================================
//   GET    /api/categories      danh sách phẳng { ..., parentId, docCount } (ai cũng xem)
//   POST   /api/categories      tạo mới   { name, iconName?, parentId? }   (admin)
//   PUT    /api/categories/:id  sửa       { name?, iconName?, parentId? }  (admin)
//   DELETE /api/categories/:id  xóa       (admin, chỉ khi không còn tài liệu và thể loại con)

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { isEditor, requireAdmin } from '../middleware/auth.ts';
import {
  categoryExists,
  countChildCategories,
  countDocumentsInCategory,
  createCategory,
  deleteCategory,
  findCategoryById,
  listCategoriesWithCount,
  listCategoryLinks,
  updateCategory,
} from '../repositories/categories.ts';
import { wouldCreateCycle } from '../services/categoryTree.ts';
import { parseId } from '../utils/ids.ts';

export const categoriesRouter = Router();

const nameSchema = z.string().trim().min(1, 'Tên thể loại không được để trống').max(100, 'Tên thể loại tối đa 100 ký tự');
const iconSchema = z.string().trim().min(1).max(50);

async function findOr404(id: unknown) {
  const category = await findCategoryById(parseId(id));
  if (!category) throw new HttpError(404, 'Thể loại không tồn tại');
  return category;
}

// parentId gửi lên: null / '' = cấp cao nhất; còn lại phải là thể loại có thật.
async function parseParent(value: unknown): Promise<number | null> {
  if (value === null || value === undefined || value === '') return null;
  const id = parseId(value, 'parentId');
  if (!(await categoryExists(id))) throw new HttpError(400, 'Thể loại cha không tồn tại');
  return id;
}

categoriesRouter.get('/', async (_req, res) => {
  // Khách / role "user" chỉ đếm bài đã xuất bản (không lộ số bài nháp).
  res.json(await listCategoriesWithCount(!isEditor(res.locals.user)));
});

categoriesRouter.post('/', requireAdmin, async (req, res) => {
  const body = req.body ?? {};
  const { name, iconName } = z.object({ name: nameSchema, iconName: iconSchema.default('Folder') }).parse(body);
  const parentId = await parseParent(body.parentId);
  // Trùng tên -> SQL Server báo vi phạm UQ_WebManualCategories_Name -> errorHandler trả 409.
  res.status(201).json(await createCategory(name, iconName, parentId));
});

categoriesRouter.put('/:id', requireAdmin, async (req, res) => {
  const category = await findOr404(req.params.id);
  const id = Number(category.id);
  const body = req.body ?? {};
  const { name, iconName } = z.object({ name: nameSchema.optional(), iconName: iconSchema.optional() }).parse(body);

  // Không gửi parentId = giữ nguyên cha hiện tại.
  const parentId = body.parentId === undefined ? (category.parentId === null ? null : Number(category.parentId)) : await parseParent(body.parentId);
  if (wouldCreateCycle(await listCategoryLinks(), id, parentId)) {
    throw new HttpError(400, 'Không thể đặt thể loại làm con của chính nó hoặc của thể loại con của nó');
  }

  res.json(await updateCategory(id, name ?? category.name, iconName ?? category.iconName, parentId));
});

categoriesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const category = await findOr404(req.params.id);
  const id = Number(category.id);

  const children = await countChildCategories(id);
  if (children > 0) throw new HttpError(409, `Còn ${children} thể loại con, hãy chuyển hoặc xóa chúng trước`);
  const docs = await countDocumentsInCategory(id);
  // Chỉ dấu backtick ` mới thay ${} bằng giá trị; nháy đơn in nguyên chữ.
  if (docs > 0) throw new HttpError(409, `Còn ${docs} tài liệu thuộc thể loại này, không thể xóa`);

  await deleteCategory(id);
  res.status(204).end();
});

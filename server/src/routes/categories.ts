// ============================================================
// routes/categories.ts — Mọi API của thể loại (dạng cây)
// ============================================================
//   GET    /api/categories      danh sách phẳng { ..., parentId, isShared, docCount } (lọc theo bộ phận)
//   POST   /api/categories      tạo mới   { name, iconName?, parentId?, isShared? }   (admin)
//                               tạo bộ phận (cấp cao nhất, không dùng chung) -> tự có các mục mặc định
//   POST   /api/categories/sync-defaults   thêm mục mặc định còn thiếu vào mọi bộ phận  (admin)
//   PUT    /api/categories/:id  sửa       { name?, iconName?, parentId?, isShared? }  (admin)
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
import { withTransaction } from '../db/pool.ts';
import { canSee, invalidateAccessCache, isSharedCategory, requestScope } from '../services/access.ts';
import { applyDefaults, applyDefaultsTx } from '../services/categoryDefaults.ts';
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
  const all = await listCategoriesWithCount(!isEditor(res.locals.user));
  // Phân quyền theo bộ phận: chỉ thấy thể loại của bộ phận mình + thể loại dùng chung.
  // (Thể loại cha bị ẩn thì client tự coi thể loại con là cấp cao nhất.)
  const scope = await requestScope(res);
  res.json(scope.all ? all : all.filter((c) => canSee(scope, c.id)));
});

categoriesRouter.post('/', requireAdmin, async (req, res) => {
  const body = req.body ?? {};
  const { name, iconName, isShared } = z
    .object({ name: nameSchema, iconName: iconSchema.default('Folder'), isShared: z.boolean().default(false) })
    .parse(body);
  const parentId = await parseParent(body.parentId);
  // Trùng tên trong cùng thể loại cha -> SQL Server báo vi phạm UX_WebManualCategories_Parent_Name -> errorHandler trả 409.
  // Tạo BỘ PHẬN (cấp cao nhất, không dùng chung) -> tự có luôn các mục mặc định.
  // Chung một transaction: chép mục mặc định lỗi thì bộ phận cũng không được tạo dở dang.
  const created = await withTransaction(async (tx) => {
    const category = await createCategory(name, iconName, parentId, isShared, tx);
    const isDepartment = parentId === null && !isSharedCategory({ name, isShared });
    const defaultsCreated = isDepartment ? await applyDefaultsTx(tx, [Number(category.id)]) : 0;
    return { ...category, defaultsCreated };
  });
  invalidateAccessCache();
  res.status(201).json(created);
});

// "Đồng bộ mục mặc định": thêm các mục mặc định còn thiếu vào MỌI bộ phận (không xóa / sửa gì).
categoriesRouter.post('/sync-defaults', requireAdmin, async (_req, res) => {
  res.json({ created: await applyDefaults() });
});

categoriesRouter.put('/:id', requireAdmin, async (req, res) => {
  const category = await findOr404(req.params.id);
  const id = Number(category.id);
  const body = req.body ?? {};
  const { name, iconName, isShared } = z
    .object({ name: nameSchema.optional(), iconName: iconSchema.optional(), isShared: z.boolean().optional() })
    .parse(body);

  // Không gửi parentId = giữ nguyên cha hiện tại.
  const parentId = body.parentId === undefined ? (category.parentId === null ? null : Number(category.parentId)) : await parseParent(body.parentId);
  if (wouldCreateCycle(await listCategoryLinks(), id, parentId)) {
    throw new HttpError(400, 'Không thể đặt thể loại làm con của chính nó hoặc của thể loại con của nó');
  }

  const updated = await updateCategory(id, name ?? category.name, iconName ?? category.iconName, parentId, isShared ?? category.isShared);
  // Đổi tên / cha / "dùng chung" làm đổi quyền xem -> tính lại ngay.
  invalidateAccessCache();
  res.json(updated);
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
  invalidateAccessCache();
  res.status(204).end();
});

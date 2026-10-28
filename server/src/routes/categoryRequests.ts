// ============================================================
// routes/categoryRequests.ts — Đề xuất thể loại mới (biên tập gửi, admin duyệt)
// ============================================================
//   POST   /api/category-requests              gửi đề xuất { parentId, name, iconName?, note? }  biên tập
//   GET    /api/category-requests/mine         đề xuất của tôi (mới nhất trước)                   biên tập
//   DELETE /api/category-requests/:id          hủy đề xuất ĐANG CHỜ của chính mình                biên tập
//   GET    /api/category-requests?status=      danh sách theo trạng thái (mặc định pending)       admin
//   GET    /api/category-requests/pending-count   số đang chờ (số đỏ trên avatar)                 admin
//   POST   /api/category-requests/:id/approve  duyệt (sửa được tên / icon) -> tạo thể loại       admin
//   POST   /api/category-requests/:id/reject   từ chối { reason? }                                admin
//
// Đang chờ duyệt thì thể loại CHƯA tồn tại: không ai thấy, không đăng bài vào được.
// Biên tập chỉ đề xuất được bên trong thể loại mình xem được (bộ phận của mình).

import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db/pool.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, requireAdmin, requireEditor } from '../middleware/auth.ts';
import { createCategory, findCategoryById, findChildByName, listCategoriesForAccess } from '../repositories/categories.ts';
import {
  countPendingRequests,
  createRequest,
  deletePendingRequest,
  findRequest,
  hasPendingDuplicate,
  listRequestsByStatus,
  listRequestsByUser,
  markApproved,
  markRejected,
  type CategoryRequest,
} from '../repositories/categoryRequests.ts';
import { canSee, invalidateAccessCache, requestScope } from '../services/access.ts';
import { parseId } from '../utils/ids.ts';

export const categoryRequestsRouter = Router();

const nameSchema = z.string().trim().min(1, 'Tên thể loại không được để trống').max(100, 'Tên thể loại tối đa 100 ký tự');
const iconSchema = z.string().trim().min(1).max(50);

// Kèm đường dẫn thể loại cha cho dễ đọc: "PE IT › Biểu mẫu".
async function withParentPath(list: CategoryRequest[]) {
  const rows = await listCategoriesForAccess();
  const byId = new Map(rows.map((c) => [c.id, c]));
  const pathOf = (id: number) => {
    const names: string[] = [];
    const seen = new Set<number>();
    for (let cur = byId.get(id); cur && !seen.has(cur.id); cur = cur.parentId === null ? undefined : byId.get(cur.parentId)) {
      seen.add(cur.id);
      names.unshift(cur.name);
    }
    return names.join(' › ');
  };
  return list.map((r) => ({ ...r, parentPath: pathOf(Number(r.parentId)) }));
}

// ---------- Biên tập ----------

categoryRequestsRouter.post('/', requireEditor, async (req, res) => {
  const body = req.body ?? {};
  const { name, iconName, note } = z
    .object({ name: nameSchema, iconName: iconSchema.default('Folder'), note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự').default('') })
    .parse(body);
  const parent = await findCategoryById(parseId(body.parentId, 'parentId'));
  if (!parent || !canSee(await requestScope(res), parent.id)) throw new HttpError(404, 'Thể loại cha không tồn tại');
  const parentId = Number(parent.id);
  if (await findChildByName(parentId, name)) throw new HttpError(409, `"${parent.name}" đã có thể loại "${name}"`);
  if (await hasPendingDuplicate(parentId, name)) throw new HttpError(409, `Đã có đề xuất "${name}" trong "${parent.name}" đang chờ duyệt`);
  const created = await createRequest({ parentId, name, iconName, note, userId: currentUser(res).id });
  res.status(201).json((await withParentPath([created]))[0]);
});

categoryRequestsRouter.get('/mine', requireEditor, async (_req, res) => {
  res.json(await withParentPath(await listRequestsByUser(currentUser(res).id)));
});

categoryRequestsRouter.delete('/:id', requireEditor, async (req, res) => {
  const removed = await deletePendingRequest(parseId(req.params.id), currentUser(res).id);
  if (!removed) throw new HttpError(404, 'Không tìm thấy đề xuất đang chờ của bạn');
  res.status(204).end();
});

// ---------- Admin ----------

const STATUSES = ['pending', 'approved', 'rejected'] as const;

categoryRequestsRouter.get('/', requireAdmin, async (req, res) => {
  const status = z.enum(STATUSES).default('pending').parse(req.query.status || undefined);
  res.json(await withParentPath(await listRequestsByStatus(status)));
});

categoryRequestsRouter.get('/pending-count', requireAdmin, async (_req, res) => {
  res.json({ count: await countPendingRequests() });
});

categoryRequestsRouter.post('/:id/approve', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const edits = z.object({ name: nameSchema.optional(), iconName: iconSchema.optional() }).parse(req.body ?? {});
  const result = await withTransaction(async (tx) => {
    const request = await findRequest(id, tx);
    if (!request) throw new HttpError(404, 'Không tìm thấy đề xuất');
    if (request.status !== 'pending') throw new HttpError(409, 'Đề xuất này đã được xử lý');
    const name = edits.name ?? request.name;
    const iconName = edits.iconName ?? request.iconName;
    // Trùng tên trong cùng cha -> unique index báo lỗi -> errorHandler trả 409, transaction tự hủy.
    const category = await createCategory(name, iconName, Number(request.parentId), false, tx);
    const updated = await markApproved(id, { name, iconName, categoryId: Number(category.id), adminId: currentUser(res).id }, tx);
    if (!updated) throw new HttpError(409, 'Đề xuất này đã được xử lý');
    return category;
  });
  invalidateAccessCache();
  res.json(result);
});

categoryRequestsRouter.post('/:id/reject', requireAdmin, async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự').optional() }).parse(req.body ?? {});
  const updated = await markRejected(parseId(req.params.id), reason || null, currentUser(res).id);
  if (!updated) throw new HttpError(409, 'Đề xuất không tồn tại hoặc đã được xử lý');
  res.status(204).end();
});

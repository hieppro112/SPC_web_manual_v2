// ============================================================
// routes/documents.ts — Mọi API của tài liệu
// ============================================================
// Khách (chưa đăng nhập) chỉ ĐỌC được bài đã xuất bản.
// Editor/admin đọc được cả nháp và được ghi.
//
//   GET    /                       ?q=&category=&status=   danh sách
//   GET    /slug/:slug                                      đọc theo slug (link chia sẻ)
//   GET    /:id                                             đọc theo id
//   POST   /                       (editor)                 tạo
//   PUT    /:id                    (editor)                 sửa
//   DELETE /:id                    (editor)                 xóa (kèm mọi phiên bản)
//   GET    /:id/versions           (editor)                 danh sách phiên bản
//   GET    /:id/versions/:version  (editor)                 một phiên bản đầy đủ
//   POST   /:id/versions/:version/restore (editor)          khôi phục

import { Router, type Response } from 'express';
import { z } from 'zod';
import { parseBlocks } from '../blocks/schemas.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, requireAuth } from '../middleware/auth.ts';
import { categoryExists, listCategoryLinks } from '../repositories/categories.ts';
import { descendantIds } from '../services/categoryTree.ts';
import {
  DOC_STATUSES,
  deleteDocument,
  findDocumentById,
  findDocumentBySlug,
  findVersion,
  findVersionForRestore,
  listDocuments,
  listVersions,
  type FullDocument,
} from '../repositories/documents.ts';
import { createDocument, updateDocument, type DocumentInput } from '../services/documents.ts';
import { parseId, tryParseId } from '../utils/ids.ts';
import { removeDiacritics } from '../utils/slugify.ts';

export const documentsRouter = Router();

// "Type guard": nếu hàm trả true thì TS hiểu `value` CHẮC CHẮN là
// 'draft' | 'published'. 🔸 Dart: giống `if (x is String)`.
function isDocStatus(value: unknown): value is (typeof DOC_STATUSES)[number] {
  return typeof value === 'string' && (DOC_STATUSES as readonly string[]).includes(value);
}

// Luật dữ liệu gửi lên khi tạo/sửa. Hồi MongoDB một phần nằm trong schema
// Mongoose; giờ gom hết vào zod cho rõ ràng.
const titleSchema = z.string().trim().min(1, 'Tiêu đề không được để trống').max(300, 'Tiêu đề tối đa 300 ký tự');
const statusSchema = z.string().refine(isDocStatus, { error: (issue) => `Trạng thái không hợp lệ: ${String(issue.input)}` });

// Khách mở link bài nháp -> 404 (giả như không tồn tại), không phải 403,
// để người ngoài không biết là có bài đó.
function assertReadable(doc: FullDocument | null, res: Response): asserts doc is FullDocument {
  if (!doc || (!res.locals.user && doc.status !== 'published')) {
    throw new HttpError(404, 'Không tìm thấy tài liệu');
  }
}

async function findOr404(id: unknown): Promise<FullDocument> {
  const doc = await findDocumentById(parseId(id));
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  return doc;
}

// Thể loại phải CÓ THẬT. (Khóa ngoại trong DB cũng chặn, nhưng kiểm tra
// trước để báo lỗi dễ hiểu thay vì lỗi SQL chung chung.)
async function parseCategory(value: unknown): Promise<number> {
  if (value === undefined || value === null || value === '') throw new HttpError(400, 'Phải chọn thể loại');
  const id = tryParseId(value);
  if (!id || !(await categoryExists(id))) throw new HttpError(400, 'Thể loại không tồn tại');
  return id;
}

documentsRouter.get('/', async (req, res) => {
  const { q, category, status } = req.query;
  // Lọc theo thể loại = thể loại đó + toàn bộ thể loại con cháu.
  const categoryId = tryParseId(category);
  const categoryIds = categoryId ? descendantIds(await listCategoryLinks(), categoryId) : undefined;
  res.json(
    await listDocuments({
      // Khách: luôn chỉ bài đã xuất bản, bỏ qua ?status gửi lên.
      status: !res.locals.user ? 'published' : isDocStatus(status) ? status : undefined,
      categoryIds,
      // Tìm kiếm: bỏ dấu câu hỏi rồi yêu cầu MỌI từ đều có trong SearchText.
      words: typeof q === 'string' ? removeDiacritics(q).split(/\s+/).filter(Boolean).slice(0, 8) : [],
    }),
  );
});

// '/slug/:slug' có HAI đoạn nên không xung đột với '/:id' (một đoạn).
documentsRouter.get('/slug/:slug', async (req, res) => {
  const doc = await findDocumentBySlug(String(req.params.slug));
  assertReadable(doc, res);
  res.json(doc);
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await findDocumentById(parseId(req.params.id));
  assertReadable(doc, res);
  res.json(doc);
});

documentsRouter.post('/', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const input: DocumentInput = {
    title: titleSchema.parse(body.title ?? ''),
    categoryId: await parseCategory(body.category),
    status: body.status === undefined ? 'draft' : (statusSchema.parse(body.status) as DocumentInput['status']),
    blocks: parseBlocks(body.blocks ?? []),
  };
  res.status(201).json(await createDocument(input, currentUser(res).id));
});

documentsRouter.put('/:id', requireAuth, async (req, res) => {
  const doc = await findOr404(req.params.id);
  const body = req.body ?? {};
  // Field nào không gửi thì giữ nguyên giá trị hiện tại.
  const input: DocumentInput = {
    title: body.title !== undefined ? titleSchema.parse(body.title) : doc.title,
    categoryId: body.category !== undefined ? await parseCategory(body.category) : Number(doc.category?.id),
    status: body.status !== undefined ? (statusSchema.parse(body.status) as DocumentInput['status']) : doc.status,
    blocks: body.blocks !== undefined ? parseBlocks(body.blocks) : doc.blocks!,
  };
  res.json(await updateDocument(Number(doc.id), input, currentUser(res).id));
});

documentsRouter.delete('/:id', requireAuth, async (req, res) => {
  if (!(await deleteDocument(parseId(req.params.id)))) throw new HttpError(404, 'Không tìm thấy tài liệu');
  // 204 No Content: thành công, không có gì để trả về.
  res.status(204).end();
});

// ---------- Lịch sử phiên bản ----------

documentsRouter.get('/:id/versions', requireAuth, async (req, res) => {
  res.json(await listVersions(parseId(req.params.id)));
});

documentsRouter.get('/:id/versions/:version', requireAuth, async (req, res) => {
  const version = await findVersion(parseId(req.params.id), parseId(req.params.version, 'version'));
  if (!version) throw new HttpError(404, 'Không tìm thấy phiên bản');
  res.json(version);
});

// Khôi phục = tạo một phiên bản MỚI có nội dung của bản cũ. Lịch sử
// không bao giờ bị xóa, nên khôi phục nhầm vẫn quay lại được.
// Giữ nguyên trạng thái xuất bản hiện tại: khôi phục nội dung không nên
// vô tình làm bài đang công khai biến thành nháp (hoặc ngược lại).
documentsRouter.post('/:id/versions/:version/restore', requireAuth, async (req, res) => {
  const doc = await findOr404(req.params.id);
  const old = await findVersionForRestore(Number(doc.id), parseId(req.params.version, 'version'));
  if (!old) throw new HttpError(404, 'Không tìm thấy phiên bản');

  // Thể loại cũ có thể đã bị xóa -> giữ thể loại hiện tại.
  const keepOldCategory = old.categoryId !== null && (await categoryExists(old.categoryId));
  const input: DocumentInput = {
    title: old.title,
    categoryId: keepOldCategory ? old.categoryId! : Number(doc.category?.id),
    status: doc.status,
    blocks: old.blocks,
  };
  res.json(await updateDocument(Number(doc.id), input, currentUser(res).id, old.version));
});

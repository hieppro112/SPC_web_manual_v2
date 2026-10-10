// ============================================================
// routes/documents.ts — Mọi API của tài liệu
// ============================================================
// Router là một "mini app": gom các route cùng nhóm vào một file, rồi
// index.ts gắn cả nhóm vào tiền tố '/api/documents'.
// 🔸 Flutter: giống một GoRoute cha có nhiều route con.
//
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
import { isValidObjectId, type Types } from 'mongoose';
import { CategoryModel } from '../models/Category.ts';
import { DOC_STATUSES, DocumentModel, type DocumentDoc } from '../models/Document.ts';
import { DocumentVersionModel } from '../models/DocumentVersion.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, requireAuth } from '../middleware/auth.ts';
import { parseBlocks } from '../blocks/schemas.ts';
import { saveWithVersion } from '../services/documents.ts';
import { escapeRegex, removeDiacritics } from '../utils/slugify.ts';

export const documentsRouter = Router();

// Thông tin cần hiển thị khi populate.
const CATEGORY_FIELDS = 'name iconName';
const USER_FIELDS = 'displayName';

// "Type guard": nếu hàm trả true thì TS hiểu `value` CHẮC CHẮN là
// 'draft' | 'published'. 🔸 Dart: giống `if (x is String)`.
function isDocStatus(value: unknown): value is (typeof DOC_STATUSES)[number] {
  return typeof value === 'string' && (DOC_STATUSES as readonly string[]).includes(value);
}

// ObjectId đúng định dạng nhưng KHÔNG có trong DB thì Mongoose vẫn cho
// lưu (nó chỉ kiểm tra định dạng). Phải tự kiểm tra thể loại có thật.
async function assertCategoryExists(id: Types.ObjectId | null | undefined) {
  if (!id) return; // thiếu hẳn -> để schema báo lỗi "Phải chọn thể loại"
  const exists = await CategoryModel.exists({ _id: id });
  if (!exists) throw new HttpError(400, 'Thể loại không tồn tại');
}

// Khách mở link bài nháp -> 404 (giả như không tồn tại), không phải 403,
// để người ngoài không biết là có bài đó.
function assertReadable(doc: DocumentDoc | null, res: Response): asserts doc is DocumentDoc {
  if (!doc || (!res.locals.user && doc.status !== 'published')) {
    throw new HttpError(404, 'Không tìm thấy tài liệu');
  }
}

// Kiểu của req.params trong Express 5 là `string | string[]`, nên nhận
// `unknown` rồi ép về chuỗi tại đây cho gọn ở nơi gọi.
async function findForEdit(id: unknown): Promise<DocumentDoc> {
  const doc = await DocumentModel.findById(String(id));
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  return doc;
}

async function populateForResponse(doc: DocumentDoc) {
  await doc.populate([
    { path: 'category', select: CATEGORY_FIELDS },
    { path: 'updatedBy', select: USER_FIELDS },
  ]);
  return doc;
}

documentsRouter.get('/', async (req, res) => {
  const { q, category, status } = req.query;
  const filter: Record<string, unknown> = {};

  // Khách: luôn chỉ bài đã xuất bản, bỏ qua ?status gửi lên.
  if (!res.locals.user) filter.status = 'published';
  else if (isDocStatus(status)) filter.status = status;

  if (typeof category === 'string' && isValidObjectId(category)) filter.category = category;

  // Tìm kiếm: bỏ dấu câu hỏi rồi yêu cầu MỌI từ đều có trong searchText.
  // "bao tri cnc" khớp bài có cả "bảo", "trì", "CNC" ở bất kỳ đâu.
  // Dùng regex trên một field: đủ nhanh cho vài nghìn tài liệu nội bộ.
  if (typeof q === 'string' && q.trim()) {
    const words = removeDiacritics(q).split(/\s+/).filter(Boolean).slice(0, 8);
    filter.$and = words.map((w) => ({ searchText: { $regex: escapeRegex(w) } }));
  }

  const docs = await DocumentModel.find(filter)
    // '-blocks': trang danh sách chỉ cần tiêu đề + mô tả, không cần nội dung.
    .select('-blocks')
    .sort({ updatedAt: -1 })
    .limit(500)
    .populate('category', CATEGORY_FIELDS)
    .populate('updatedBy', USER_FIELDS);
  res.json(docs);
});

// '/slug/:slug' có HAI đoạn nên không xung đột với '/:id' (một đoạn).
documentsRouter.get('/slug/:slug', async (req, res) => {
  const doc = await DocumentModel.findOne({ slug: req.params.slug });
  assertReadable(doc, res);
  res.json(await populateForResponse(doc));
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await DocumentModel.findById(req.params.id);
  assertReadable(doc, res);
  res.json(await populateForResponse(doc));
});

documentsRouter.post('/', requireAuth, async (req, res) => {
  // Chỉ lấy đúng các field cho phép — desc, slug, version... do server tự lo.
  const { title, category, blocks, status } = req.body ?? {};

  const doc = new DocumentModel({ title, category, status, blocks: parseBlocks(blocks ?? []) });
  await assertCategoryExists(doc.category);
  await saveWithVersion(doc, currentUser(res)._id);
  res.status(201).json(await populateForResponse(doc));
});

documentsRouter.put('/:id', requireAuth, async (req, res) => {
  // Tải về -> sửa -> save() (thay vì findByIdAndUpdate) để mọi hook và
  // luật schema đều chạy giống hệt lúc tạo.
  const doc = await findForEdit(req.params.id);
  const { title, category, blocks, status } = req.body ?? {};

  // Field nào không gửi thì giữ nguyên (đặt undefined trong Mongoose là XÓA).
  if (title !== undefined) doc.title = title;
  if (category !== undefined) doc.set('category', category);
  if (status !== undefined) doc.set('status', status);
  if (blocks !== undefined) doc.set('blocks', parseBlocks(blocks));

  await assertCategoryExists(doc.category);
  await saveWithVersion(doc, currentUser(res)._id);
  res.json(await populateForResponse(doc));
});

documentsRouter.delete('/:id', requireAuth, async (req, res) => {
  const doc = await DocumentModel.findByIdAndDelete(req.params.id);
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  await DocumentVersionModel.deleteMany({ document: doc._id });
  // 204 No Content: thành công, không có gì để trả về.
  res.status(204).end();
});

// ---------- Lịch sử phiên bản ----------

documentsRouter.get('/:id/versions', requireAuth, async (req, res) => {
  const versions = await DocumentVersionModel.find({ document: req.params.id })
    .select('-blocks')
    .sort({ version: -1 })
    .populate('savedBy', USER_FIELDS);
  res.json(versions);
});

async function findVersion(docId: unknown, version: unknown) {
  const v = await DocumentVersionModel.findOne({ document: String(docId), version: Number(version) })
    .populate('savedBy', USER_FIELDS)
    .populate('category', CATEGORY_FIELDS);
  if (!v) throw new HttpError(404, 'Không tìm thấy phiên bản');
  return v;
}

documentsRouter.get('/:id/versions/:version', requireAuth, async (req, res) => {
  res.json(await findVersion(req.params.id, req.params.version));
});

// Khôi phục = tạo một phiên bản MỚI có nội dung của bản cũ. Lịch sử
// không bao giờ bị xóa, nên khôi phục nhầm vẫn quay lại được.
// Giữ nguyên trạng thái xuất bản hiện tại: khôi phục nội dung không nên
// vô tình làm bài đang công khai biến thành nháp (hoặc ngược lại).
documentsRouter.post('/:id/versions/:version/restore', requireAuth, async (req, res) => {
  const doc = await findForEdit(req.params.id);
  const old = await DocumentVersionModel.findOne({ document: doc._id, version: Number(req.params.version) });
  if (!old) throw new HttpError(404, 'Không tìm thấy phiên bản');

  doc.title = old.title;
  doc.set('blocks', old.blocks);
  // Thể loại cũ có thể đã bị xóa -> giữ thể loại hiện tại.
  if (old.category && (await CategoryModel.exists({ _id: old.category }))) doc.category = old.category;

  await saveWithVersion(doc, currentUser(res)._id, old.version);
  res.json(await populateForResponse(doc));
});

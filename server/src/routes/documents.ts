// ============================================================
// routes/documents.ts — Mọi API của tài liệu
// ============================================================
// Khách (chưa đăng nhập) và role "user" chỉ ĐỌC được bài đã xuất bản.
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
import { currentUser, isEditor, requireEditor } from '../middleware/auth.ts';
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
import { getRule, setRule } from '../repositories/reading.ts';
import { translatedTitles } from '../repositories/translations.ts';
import { requestIndexSync } from '../services/ai/searchIndex.ts';
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

// Mọi lần ghi (tạo / sửa / xóa / khôi phục) thành công -> báo trợ lý AI
// cập nhật chỉ mục, để AI biết bài mới gần như ngay lập tức.
documentsRouter.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) requestIndexSync();
    });
  }
  next();
});

// Khách mở link bài nháp -> 404 (giả như không tồn tại), không phải 403,
// để người ngoài không biết là có bài đó.
function assertReadable(doc: FullDocument | null, res: Response): asserts doc is FullDocument {
  if (!doc || (!isEditor(res.locals.user) && doc.status !== 'published')) {
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
  const { q, category, status, lang } = req.query;
  // Lọc theo thể loại = thể loại đó + toàn bộ thể loại con cháu.
  const categoryId = tryParseId(category);
  const categoryIds = categoryId ? descendantIds(await listCategoryLinks(), categoryId) : undefined;
  const docs = await listDocuments({
    // Khách / role "user": luôn chỉ bài đã xuất bản, bỏ qua ?status gửi lên.
    status: !isEditor(res.locals.user) ? 'published' : isDocStatus(status) ? status : undefined,
    categoryIds,
    // Tìm kiếm: bỏ dấu câu hỏi rồi yêu cầu MỌI từ đều có trong SearchText.
    words: typeof q === 'string' ? removeDiacritics(q).split(/\s+/).filter(Boolean).slice(0, 8) : [],
  });
  // ?lang=ja: kèm tiêu đề + mô tả đã dịch (nếu có) để thẻ tài liệu hiện đúng ngôn ngữ người đọc.
  const titles = typeof lang === 'string' && /^(vi|en|ja)$/.test(lang) ? await translatedTitles(lang, docs.map((d) => Number(d.id))) : new Map();
  res.json(docs.map((d) => ({ ...d, translated: titles.get(d.id) ?? null })));
});

// Kèm thời gian đọc tối thiểu (giây, null = không bắt buộc) — bảng riêng của migration 008.
const withReading = async (doc: FullDocument) => ({ ...doc, readingSeconds: await getRule(Number(doc.id)) });

// '/slug/:slug' có HAI đoạn nên không xung đột với '/:id' (một đoạn).
documentsRouter.get('/slug/:slug', async (req, res) => {
  const doc = await findDocumentBySlug(String(req.params.slug));
  assertReadable(doc, res);
  res.json(await withReading(doc));
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await findDocumentById(parseId(req.params.id));
  assertReadable(doc, res);
  res.json(await withReading(doc));
});

// Thời gian đọc gửi kèm khi lưu: số giây (0 / null = bỏ bắt buộc); không gửi = giữ nguyên.
const readingSchema = z.number().int().min(0).max(36_000).nullable().optional();
async function saveReading(doc: FullDocument, value: unknown, userId: number) {
  const seconds = readingSchema.parse(value);
  if (seconds !== undefined) await setRule(Number(doc.id), seconds, userId);
  return withReading(doc);
}

documentsRouter.post('/', requireEditor, async (req, res) => {
  const body = req.body ?? {};
  const input: DocumentInput = {
    title: titleSchema.parse(body.title ?? ''),
    categoryId: await parseCategory(body.category),
    status: body.status === undefined ? 'draft' : (statusSchema.parse(body.status) as DocumentInput['status']),
    blocks: parseBlocks(body.blocks ?? []),
  };
  const doc = await createDocument(input, currentUser(res).id);
  res.status(201).json(await saveReading(doc, body.readingSeconds, currentUser(res).id));
});

documentsRouter.put('/:id', requireEditor, async (req, res) => {
  const doc = await findOr404(req.params.id);
  const body = req.body ?? {};
  // Field nào không gửi thì giữ nguyên giá trị hiện tại.
  const input: DocumentInput = {
    title: body.title !== undefined ? titleSchema.parse(body.title) : doc.title,
    categoryId: body.category !== undefined ? await parseCategory(body.category) : Number(doc.category?.id),
    status: body.status !== undefined ? (statusSchema.parse(body.status) as DocumentInput['status']) : doc.status,
    blocks: body.blocks !== undefined ? parseBlocks(body.blocks) : doc.blocks!,
  };
  const saved = await updateDocument(Number(doc.id), input, currentUser(res).id);
  res.json(await saveReading(saved, body.readingSeconds, currentUser(res).id));
});

documentsRouter.delete('/:id', requireEditor, async (req, res) => {
  if (!(await deleteDocument(parseId(req.params.id)))) throw new HttpError(404, 'Không tìm thấy tài liệu');
  // 204 No Content: thành công, không có gì để trả về.
  res.status(204).end();
});

// ---------- Lịch sử phiên bản ----------

documentsRouter.get('/:id/versions', requireEditor, async (req, res) => {
  res.json(await listVersions(parseId(req.params.id)));
});

documentsRouter.get('/:id/versions/:version', requireEditor, async (req, res) => {
  const version = await findVersion(parseId(req.params.id), parseId(req.params.version, 'version'));
  if (!version) throw new HttpError(404, 'Không tìm thấy phiên bản');
  res.json(version);
});

// Khôi phục = tạo một phiên bản MỚI có nội dung của bản cũ. Lịch sử
// không bao giờ bị xóa, nên khôi phục nhầm vẫn quay lại được.
// Giữ nguyên trạng thái xuất bản hiện tại: khôi phục nội dung không nên
// vô tình làm bài đang công khai biến thành nháp (hoặc ngược lại).
documentsRouter.post('/:id/versions/:version/restore', requireEditor, async (req, res) => {
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
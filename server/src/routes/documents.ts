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
//   GET    /:id/pptx-info                                   ngôn ngữ tải được PowerPoint + số slide
//   GET    /:id/pptx           ?lang=vi|en|ja               tải file PowerPoint của bài

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
import { statsFor } from '../repositories/engagement.ts';
import { docEngagement } from './engagement.ts';
import { assertCanPostTo, assertDocVisible, canSee, requestScope } from '../services/access.ts';
import { translatedTitles } from '../repositories/translations.ts';
import { requestIndexSync } from '../services/ai/searchIndex.ts';
import { createDocument, updateDocument, type DocumentInput } from '../services/documents.ts';
import { deckInfo, ensureDeck } from '../services/pptx/exportStore.ts';
import { LANGS, detectLang, type Lang } from '../services/translate/texts.ts';
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
// để người ngoài không biết là có bài đó. Bài của bộ phận khác: xem assertDocVisible.
async function readable(doc: FullDocument | null, res: Response): Promise<FullDocument> {
  if (!doc || (!isEditor(res.locals.user) && doc.status !== 'published')) {
    throw new HttpError(404, 'Không tìm thấy tài liệu');
  }
  await assertDocVisible(doc, res);
  return doc;
}

// Dùng cho các thao tác GHI của biên tập: bài phải nằm trong phạm vi (bộ phận) của người sửa.
async function findOr404(id: unknown, res: Response): Promise<FullDocument> {
  const doc = await findDocumentById(parseId(id));
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  await assertDocVisible(doc, res);
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
  const { q, category, status, lang, sort } = req.query;
  // Lọc theo thể loại = thể loại đó + toàn bộ thể loại con cháu.
  const categoryId = tryParseId(category);
  let categoryIds = categoryId ? descendantIds(await listCategoryLinks(), categoryId) : undefined;
  // Phân quyền theo bộ phận: chỉ trong các thể loại được xem.
  const scope = await requestScope(res);
  if (!scope.all) {
    categoryIds = (categoryIds ?? [...scope.categoryIds]).filter((id) => scope.categoryIds.has(id));
    if (!categoryIds.length) {
      res.json([]);
      return;
    }
  }
  const docs = await listDocuments({
    // Khách / role "user": luôn chỉ bài đã xuất bản, bỏ qua ?status gửi lên.
    status: !isEditor(res.locals.user) ? 'published' : isDocStatus(status) ? status : undefined,
    categoryIds,
    // Tìm kiếm: bỏ dấu câu hỏi rồi yêu cầu MỌI từ đều có trong SearchText.
    words: typeof q === 'string' ? removeDiacritics(q).split(/\s+/).filter(Boolean).slice(0, 8) : [],
  });
  // ?lang=ja: kèm tiêu đề + mô tả đã dịch (nếu có) để thẻ tài liệu hiện đúng ngôn ngữ người đọc.
  const ids = docs.map((d) => Number(d.id));
  const titles = typeof lang === 'string' && /^(vi|en|ja)$/.test(lang) ? await translatedTitles(lang, ids) : new Map();
  // Lượt xem + tim cho thẻ tài liệu; ?sort=views|likes sắp xếp theo đó (mặc định: mới cập nhật).
  const stats = await statsFor(ids);
  const list = docs.map((d) => ({ ...d, translated: titles.get(d.id) ?? null, stats: stats.get(Number(d.id)) }));
  if (sort === 'views' || sort === 'likes') list.sort((a, b) => (b.stats?.[sort] ?? 0) - (a.stats?.[sort] ?? 0));
  res.json(list);
});

// Kèm thời gian đọc tối thiểu (giây, null = không bắt buộc) — bảng riêng của migration 008.
const withReading = async (doc: FullDocument) => ({ ...doc, readingSeconds: await getRule(Number(doc.id)) });

// '/slug/:slug' có HAI đoạn nên không xung đột với '/:id' (một đoạn).
// Trang đọc: kèm lượt xem / tim + "tôi đã thả tim chưa".
documentsRouter.get('/slug/:slug', async (req, res) => {
  const doc = await readable(await findDocumentBySlug(String(req.params.slug)), res);
  res.json({ ...(await withReading(doc)), stats: await docEngagement(Number(doc.id), res) });
});

documentsRouter.get('/:id', async (req, res) => {
  const doc = await readable(await findDocumentById(parseId(req.params.id)), res);
  res.json({ ...(await withReading(doc)), stats: await docEngagement(Number(doc.id), res) });
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
  await assertCanPostTo(input.categoryId, res);
  const doc = await createDocument(input, currentUser(res).id);
  res.status(201).json(await saveReading(doc, body.readingSeconds, currentUser(res).id));
});

documentsRouter.put('/:id', requireEditor, async (req, res) => {
  const doc = await findOr404(req.params.id, res);
  const body = req.body ?? {};
  // Field nào không gửi thì giữ nguyên giá trị hiện tại.
  const input: DocumentInput = {
    title: body.title !== undefined ? titleSchema.parse(body.title) : doc.title,
    categoryId: body.category !== undefined ? await parseCategory(body.category) : Number(doc.category?.id),
    status: body.status !== undefined ? (statusSchema.parse(body.status) as DocumentInput['status']) : doc.status,
    blocks: body.blocks !== undefined ? parseBlocks(body.blocks) : doc.blocks!,
  };
  await assertCanPostTo(input.categoryId, res);
  const saved = await updateDocument(Number(doc.id), input, currentUser(res).id);
  res.json(await saveReading(saved, body.readingSeconds, currentUser(res).id));
});

documentsRouter.delete('/:id', requireEditor, async (req, res) => {
  const doc = await findOr404(req.params.id, res);
  if (!(await deleteDocument(Number(doc.id)))) throw new HttpError(404, 'Không tìm thấy tài liệu');
  // 204 No Content: thành công, không có gì để trả về.
  res.status(204).end();
});

// ---------- PowerPoint của bài ----------
// Ai đọc được bài thì tải được (readable: nháp chỉ editor, đúng bộ phận).

documentsRouter.get('/:id/pptx-info', async (req, res) => {
  const doc = await readable(await findDocumentById(parseId(req.params.id)), res);
  res.json(await deckInfo(doc));
});

documentsRouter.get('/:id/pptx', async (req, res) => {
  const doc = await readable(await findDocumentById(parseId(req.params.id)), res);
  const lang = (LANGS as readonly string[]).includes(String(req.query.lang)) ? (req.query.lang as Lang) : detectLang(doc.title, doc.blocks ?? []);
  const deck = await ensureDeck(doc, lang);
  // Tên file tiếng Việt / tiếng Nhật: dạng filename* (UTF-8) cho trình duyệt hiển thị đúng.
  const name = `${doc.title.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120)} (${lang.toUpperCase()}).pptx`;
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'Content-Disposition': `attachment; filename="slides-${doc.id}-${lang}.pptx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-cache',
  });
  res.sendFile(deck.file);
});

// ---------- Lịch sử phiên bản ----------

documentsRouter.get('/:id/versions', requireEditor, async (req, res) => {
  const doc = await findOr404(req.params.id, res);
  res.json(await listVersions(Number(doc.id)));
});

documentsRouter.get('/:id/versions/:version', requireEditor, async (req, res) => {
  const doc = await findOr404(req.params.id, res);
  const version = await findVersion(Number(doc.id), parseId(req.params.version, 'version'));
  if (!version) throw new HttpError(404, 'Không tìm thấy phiên bản');
  res.json(version);
});

// Khôi phục = tạo một phiên bản MỚI có nội dung của bản cũ. Lịch sử
// không bao giờ bị xóa, nên khôi phục nhầm vẫn quay lại được.
// Giữ nguyên trạng thái xuất bản hiện tại: khôi phục nội dung không nên
// vô tình làm bài đang công khai biến thành nháp (hoặc ngược lại).
documentsRouter.post('/:id/versions/:version/restore', requireEditor, async (req, res) => {
  const doc = await findOr404(req.params.id, res);
  const old = await findVersionForRestore(Number(doc.id), parseId(req.params.version, 'version'));
  if (!old) throw new HttpError(404, 'Không tìm thấy phiên bản');

  // Thể loại cũ có thể đã bị xóa, hoặc nằm ngoài bộ phận của người khôi phục -> giữ thể loại hiện tại.
  const keepOldCategory =
    old.categoryId !== null && (await categoryExists(old.categoryId)) && canSee(await requestScope(res), old.categoryId);
  const input: DocumentInput = {
    title: old.title,
    categoryId: keepOldCategory ? old.categoryId! : Number(doc.category?.id),
    status: doc.status,
    blocks: old.blocks,
  };
  res.json(await updateDocument(Number(doc.id), input, currentUser(res).id, old.version));
});
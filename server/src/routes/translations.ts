// ============================================================
// routes/translations.ts — Bản dịch tự động của tài liệu
// ============================================================
//   GET  /api/translations/:docId?lang=ja        bản để đọc (ghép theo cấu trúc hiện tại của bài gốc)
//   PUT  /api/translations/:docId/:lang          editor sửa tay   { title, blocks: { idKhối: { khóa: chữ } } }
//   POST /api/translations/:docId/retranslate    editor: dịch lại từ đầu (bỏ phần đã sửa tay)
//
//   Worker (header x-worker-token, dùng chung khóa với tạo đề):
//   POST /api/worker/translate-jobs/claim          -> { job: { id, title, version, sourceLang, parts: [{ lang, system, prompt, schema }] } }
//   POST /api/worker/translate-jobs/:id/complete   { version, results: [{ lang, output }] }
//   POST /api/worker/translate-jobs/:id/fail       { error }
//
// Ai đọc được bài gốc thì đọc được bản dịch (bài nháp: chỉ editor / admin).

import { Router, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, isEditor, requireEditor } from '../middleware/auth.ts';
import { findDocumentById, findVersionForRestore, type FullDocument } from '../repositories/documents.ts';
import {
  claimNextTranslation,
  dropTranslationJob,
  enqueueTranslation,
  failTranslationJob,
  finishTranslationJob,
  jobForceFlag,
  listTranslations,
  saveTranslationEdit,
  translationJobState,
  translationsReady,
} from '../repositories/translations.ts';
import { assertDocVisible } from '../services/access.ts';
import { requestIndexSync } from '../services/ai/searchIndex.ts';
import { isLegacyGuideCopy } from '../services/translate/queue.ts';
import { requestDeckExports } from '../services/pptx/exportStore.ts';
import { buildDesc, buildSearchText } from '../services/documentText.ts';
import { applyTranslation, mergeForRead, planHasWork, planParts, planTranslation } from '../services/translate/engine.ts';
import { LANGS, applyTexts, detectLang, extractTexts, type Texts } from '../services/translate/texts.ts';
import { parseId } from '../utils/ids.ts';
import { requireWorkerToken } from './quizJobs.ts';

export const translationsRouter = Router();

const langSchema = z.enum(LANGS);

async function readableDoc(id: unknown, res: Response): Promise<FullDocument> {
  const doc = await findDocumentById(parseId(id));
  if (!doc || (!isEditor(res.locals.user) && doc.status !== 'published')) throw new HttpError(404, 'Không tìm thấy tài liệu');
  await assertDocVisible(doc, res); // bài của bộ phận khác -> như không tồn tại
  return doc;
}

const isGuide = (doc: FullDocument) => isLegacyGuideCopy(doc.slug);

translationsRouter.get('/:docId', async (req, res) => {
  const doc = await readableDoc(req.params.docId, res);
  const lang = langSchema.parse(req.query.lang);
  const blocks = doc.blocks ?? [];
  const sourceLang = detectLang(doc.title, blocks);
  if (!config.translate.enabled || !(await translationsReady()) || isGuide(doc)) {
    res.json({ available: false, sourceLang, lang });
    return;
  }
  const job = await translationJobState(Number(doc.id));
  if (lang === sourceLang) {
    res.json({ available: true, sourceLang, lang, status: 'original', job });
    return;
  }
  const row = (await listTranslations(Number(doc.id))).find((r) => r.lang === lang);
  if (!row) {
    res.json({ available: true, sourceLang, lang, status: 'missing', job });
    return;
  }
  const merged = mergeForRead({ title: doc.title, blocks }, row);
  res.json({
    available: true,
    sourceLang,
    lang,
    status: merged.untranslated ? 'partial' : 'ready',
    job,
    title: merged.title,
    blocks: merged.blocks,
    translatedIds: merged.translatedIds,
    untranslated: merged.untranslated,
    editedBy: row.editedBy,
    editedAt: row.editedAt,
    updatedAt: row.updatedAt,
  });
});

const editSchema = z.object({
  title: z.string().trim().min(1).max(300),
  blocks: z.record(z.string(), z.record(z.string(), z.string().max(20_000))),
});

translationsRouter.put('/:docId/:lang', requireEditor, async (req, res) => {
  const doc = await readableDoc(req.params.docId, res);
  const lang = langSchema.parse(req.params.lang);
  const row = (await listTranslations(Number(doc.id))).find((r) => r.lang === lang);
  if (!row) throw new HttpError(404, 'Bài này chưa có bản dịch để sửa');
  const body = editSchema.parse(req.body ?? {});

  // Chỉ nhận chữ cho đúng khối + đúng khóa đang có; cấu trúc bài (ảnh, thứ tự) không đổi được ở đây.
  const blocks = row.blocks.map((block) => {
    const edits = body.blocks[block.id];
    if (!edits) return block;
    const allowed = extractTexts(block);
    const texts: Texts = {};
    for (const [key, text] of Object.entries(edits)) if (key in allowed) texts[key] = text;
    return applyTexts(block, texts);
  });
  await saveTranslationEdit(
    Number(doc.id),
    lang,
    { title: body.title, desc: buildDesc(blocks), blocks, searchText: buildSearchText(body.title, blocks) },
    currentUser(res).id,
  );
  requestIndexSync();
  requestDeckExports(doc.id); // bản dịch sửa tay -> tạo lại PowerPoint ngôn ngữ đó
  res.status(204).end();
});

translationsRouter.post('/:docId/retranslate', requireEditor, async (req, res) => {
  const doc = await readableDoc(req.params.docId, res);
  if (isGuide(doc)) throw new HttpError(400, 'Đây là bản hướng dẫn en/ja cũ (viết tay), không dịch — hãy xóa bài này');
  if (!(await translationsReady())) throw new HttpError(503, 'Chưa tạo bảng bản dịch — admin chạy server/sql/007_translations.sql');
  await enqueueTranslation(Number(doc.id), doc.version, 1, true);
  res.status(204).end();
});

// ---------- Worker ----------

export const translateWorkerRouter = Router();
translateWorkerRouter.use(requireWorkerToken);

translateWorkerRouter.post('/claim', async (_req, res) => {
  if (!config.translate.enabled || !(await translationsReady())) {
    res.json({ job: null });
    return;
  }
  // Việc không cần gọi Claude (chỉ đổi thứ tự / xóa khối, đổi ảnh) -> làm luôn ở đây rồi nhận việc tiếp.
  for (let i = 0; i < 25; i++) {
    const claimed = await claimNextTranslation(config.translate.leaseMinutes);
    if (!claimed) break;
    const doc = await findDocumentById(claimed.documentId);
    if (!doc || isGuide(doc)) {
      await dropTranslationJob(claimed.documentId);
      continue;
    }
    const source = { id: Number(doc.id), version: doc.version, title: doc.title, blocks: doc.blocks ?? [] };
    const plan = planTranslation(source, await listTranslations(source.id), claimed.force);
    if (!planHasWork(plan)) {
      await applyTranslation(plan, [], claimed.force);
      await finishTranslationJob(source.id, source.version);
      requestIndexSync();
      requestDeckExports(source.id);
      continue;
    }
    const parts = planParts(plan, config.translate.maxCharsPerPart);
    console.log(`🌐 Worker nhận việc dịch bài #${doc.id} "${doc.title}" (${plan.sourceLang} -> ${plan.targets.map((t) => t.lang).join(', ')}, ${parts.length} phần)`);
    res.json({ job: { id: doc.id, title: doc.title, version: doc.version, sourceLang: plan.sourceLang, parts } });
    return;
  }
  res.json({ job: null });
});

const completeSchema = z.object({
  version: z.number().int().positive(),
  results: z.array(z.object({ lang: langSchema, output: z.unknown() })).max(100),
});

translateWorkerRouter.post('/:id/complete', async (req, res) => {
  const id = parseId(req.params.id);
  const { version, results } = completeSchema.parse(req.body ?? {});
  // Dịch theo ĐÚNG phiên bản worker đã nhận (bài có thể đã được sửa tiếp trong lúc dịch).
  const snapshot = await findVersionForRestore(id, version);
  if (!snapshot || !(await findDocumentById(id))) {
    await dropTranslationJob(id);
    throw new HttpError(404, 'Tài liệu không còn tồn tại');
  }
  const force = await jobForceFlag(id);
  const plan = planTranslation({ id, version, title: snapshot.title, blocks: snapshot.blocks }, await listTranslations(id), force);
  const missing = await applyTranslation(plan, results, force);
  if (missing) await failTranslationJob(id, `Claude bỏ sót ${missing} mục, sẽ dịch lại phần còn thiếu`);
  else await finishTranslationJob(id, version);
  requestIndexSync();
  requestDeckExports(id); // có bản dịch mới -> tạo PowerPoint EN / JA
  console.log(`✅ Dịch bài #${id} (v${version}) xong${missing ? `, còn thiếu ${missing} mục` : ''}`);
  res.json({ missing });
});

translateWorkerRouter.post('/:id/fail', async (req, res) => {
  const { error } = z.object({ error: z.string().max(2000).default('Lỗi không rõ') }).parse(req.body ?? {});
  await failTranslationJob(parseId(req.params.id), error);
  res.status(204).end();
});

// ============================================================
// routes/importJobs.ts — Nhập bài từ PowerPoint (hàng đợi cho Claude)
// ============================================================
//   Editor / admin (requireEditor ở index.ts):
//   POST /api/import-jobs            multipart: file (.pptx), categoryId, language -> đọc file + tạo yêu cầu
//   GET  /api/import-jobs            yêu cầu của mình (admin: mọi người)
//   GET  /api/import-jobs/unseen-count
//   POST /api/import-jobs/:id/seen
//   POST /api/import-jobs/:id/cancel
//
//   Worker (header x-worker-token):
//   POST /api/worker/import-jobs/claim          -> { job: { id, fileName, parts: [{ system, prompt, schema }] } }
//   POST /api/worker/import-jobs/:id/complete   { outputs: [kết quả từng phần] } -> tạo BÀI NHÁP
//   POST /api/worker/import-jobs/:id/fail       { error }
//
// Đọc file (chữ, bảng, ảnh, ghi chú) làm NGAY lúc tải lên, không cần AI;
// Claude chỉ sắp xếp + dịch thành khối (services/pptx/importPrompt.ts).

import fs from 'node:fs';
import path from 'node:path';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { parseBlocks } from '../blocks/schemas.ts';
import { config } from '../config.ts';
import { currentUser } from '../middleware/auth.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { categoryExists } from '../repositories/categories.ts';
import { assertCanPostTo } from '../services/access.ts';
import {
  cancelImportJob,
  claimNextImportJob,
  completeImportJob,
  countUnseenImports,
  createImportJob,
  expireOldImportJobs,
  failImportJob,
  findImportJob,
  getImportPayload,
  listImportJobs,
  markImportSeen,
  type ImportJob,
} from '../repositories/importJobs.ts';
import { createDocument } from '../services/documents.ts';
import { discardUpload, fixFileName, storeImageBuffer, storeUpload, uploadSingle } from '../services/media.ts';
import { extractPptx } from '../services/pptx/extract.ts';
import { assembleBlocks, buildImportParts, type ImportPayload, type PayloadSlide } from '../services/pptx/importPrompt.ts';
import { QUIZ_LANGS } from '../services/quiz/types.ts';
import { parseId, tryParseId } from '../utils/ids.ts';
import { requireWorkerToken } from './quizJobs.ts';

export const importJobsRouter = Router();

// Tải file + đọc nội dung. Lỗi giữa chừng -> xóa file tạm của multer.
importJobsRouter.post('/', uploadSingle, async (req, res) => {
  const file = req.file;
  try {
    if (!file) throw new HttpError(400, 'Chưa chọn file');
    const user = currentUser(res);
    const fileName = fixFileName(file.originalname);
    if (!/\.pptx$/i.test(fileName)) throw new HttpError(400, 'Chỉ nhận file PowerPoint .pptx');
    if (file.size > config.pptxImport.maxMb * 1024 * 1024) throw new HttpError(413, `File tối đa ${config.pptxImport.maxMb} MB`);

    const categoryId = tryParseId(req.body?.categoryId);
    if (!categoryId || !(await categoryExists(categoryId))) throw new HttpError(400, 'Hãy chọn thể loại cho bài viết');
    await assertCanPostTo(categoryId, res); // chỉ thể loại trong bộ phận của người gửi
    const language = z.enum(QUIZ_LANGS).catch('vi').parse(req.body?.language);

    // 1. Đọc nội dung slide (nhanh, < 1 giây với file 25 MB).
    const deck = extractPptx(new Uint8Array(await fs.promises.readFile(file.path)), config.pptxImport.maxSlides);

    // 2. Upload ảnh (thu nhỏ + WebP như ảnh thường), 4 ảnh một lúc.
    const urls = new Map<string, { url: string; width: number; height: number }>();
    const entries = Object.entries(deck.media);
    const base = fileName.replace(/\.pptx$/i, '');
    for (let i = 0; i < entries.length; i += 4) {
      await Promise.all(
        entries.slice(i, i + 4).map(async ([mediaPath, data]) => {
          const media = await storeImageBuffer(data, `${base} - ${path.posix.basename(mediaPath)}`, user.id);
          if (media) urls.set(mediaPath, { url: media.url, width: media.width ?? 0, height: media.height ?? 0 });
        }),
      );
    }

    // 3. Lưu file .pptx gốc làm file đính kèm cuối bài (multer chuyển file tạm vào uploads/files).
    const attachment = await storeUpload(file, user.id);

    const slides: PayloadSlide[] = deck.slides.map((s) => ({
      n: s.n,
      texts: s.texts,
      tables: s.tables,
      notes: s.notes,
      images: s.images.flatMap((img) => {
        const stored = urls.get(img.media);
        return stored ? [{ id: img.id, url: stored.url, width: img.width || stored.width, height: img.height || stored.height }] : [];
      }),
    }));
    const payload: ImportPayload = {
      attachment: { url: attachment.url, name: fileName, size: attachment.size },
      removedLines: deck.removedLines,
      slides,
    };
    const job = await createImportJob({ fileName, categoryId, language, payload, requestedById: user.id });
    res.status(201).json({
      job,
      summary: {
        slides: slides.length,
        images: slides.reduce((n, s) => n + s.images.length, 0),
        tables: slides.reduce((n, s) => n + s.tables.length, 0),
        notes: slides.filter((s) => s.notes).length,
        removedLines: deck.removedLines,
      },
    });
  } catch (err) {
    await discardUpload(file).catch(() => {}); // file tạm còn đó nếu lỗi trước bước 3
    throw err;
  }
});

importJobsRouter.get('/', async (_req, res) => {
  await expireOldImportJobs(config.quiz.jobTimeoutHours);
  const user = currentUser(res);
  res.json({ timeoutHours: config.quiz.jobTimeoutHours, jobs: await listImportJobs(user.role === 'admin' ? null : user.id) });
});

importJobsRouter.get('/unseen-count', async (_req, res) => {
  res.json({ count: await countUnseenImports(currentUser(res).id) });
});

async function findOwnOr404(id: unknown, res: Parameters<RequestHandler>[1]): Promise<ImportJob> {
  const job = await findImportJob(parseId(id));
  const user = currentUser(res);
  if (!job || (user.role !== 'admin' && job.requestedById !== String(user.id))) throw new HttpError(404, 'Không tìm thấy yêu cầu');
  return job;
}

importJobsRouter.post('/:id/seen', async (req, res) => {
  await markImportSeen(Number((await findOwnOr404(req.params.id, res)).id));
  res.status(204).end();
});

importJobsRouter.post('/:id/cancel', async (req, res) => {
  const job = await findOwnOr404(req.params.id, res);
  if (!(await cancelImportJob(Number(job.id)))) throw new HttpError(409, 'Yêu cầu này đã xong hoặc đã đóng, không hủy được');
  res.status(204).end();
});

// ---------- Worker ----------

export const importWorkerRouter = Router();
importWorkerRouter.use(requireWorkerToken);

importWorkerRouter.post('/claim', async (_req, res) => {
  await expireOldImportJobs(config.quiz.jobTimeoutHours);
  const job = await claimNextImportJob(config.pptxImport.leaseMinutes);
  if (!job) {
    res.json({ job: null });
    return;
  }
  const payload = await getImportPayload(Number(job.id));
  const parts = buildImportParts(payload!, job.language);
  console.log(`🤖 Worker nhận yêu cầu nhập PowerPoint #${job.id}: "${job.fileName}" (${job.slideCount} slide, ${parts.length} phần)`);
  res.json({ job: { id: job.id, fileName: job.fileName, parts: parts.map(({ system, prompt, schema }) => ({ system, prompt, schema })) } });
});

const completeSchema = z.object({ outputs: z.array(z.unknown()).max(50) });

importWorkerRouter.post('/:id/complete', async (req, res) => {
  const job = await findImportJob(parseId(req.params.id));
  if (!job || job.status !== 'processing') throw new HttpError(409, 'Yêu cầu không còn ở trạng thái đang xử lý (có thể đã bị hủy / quá hạn)');
  const { outputs } = completeSchema.parse(req.body ?? {});

  try {
    if (!job.categoryId) throw new HttpError(400, 'Thể loại đã chọn không còn tồn tại');
    if (!job.requestedById) throw new HttpError(400, 'Tài khoản người gửi yêu cầu không còn tồn tại');
    const payload = (await getImportPayload(Number(job.id)))!;
    // Kiểm tra khối bằng ĐÚNG luật như khi lưu bài thường (blocks/schemas.ts).
    const blocks = parseBlocks(assembleBlocks(payload, outputs));
    const doc = await createDocument(
      { title: job.fileName.replace(/\.pptx$/i, '').slice(0, 300), categoryId: Number(job.categoryId), status: 'draft', blocks },
      Number(job.requestedById),
    );
    await completeImportJob(Number(job.id), Number(doc.id));
    console.log(`✅ Nhập PowerPoint #${job.id} xong -> bài nháp "${doc.slug}" (${blocks.length} khối)`);
    res.json({ documentId: doc.id, slug: doc.slug, blocks: blocks.length });
  } catch (err) {
    await failImportJob(Number(job.id), err instanceof Error ? err.message : String(err));
    throw err;
  }
});

importWorkerRouter.post('/:id/fail', async (req, res) => {
  const { error } = z.object({ error: z.string().max(2000).default('Lỗi không rõ') }).parse(req.body ?? {});
  await failImportJob(parseId(req.params.id), error);
  res.status(204).end();
});

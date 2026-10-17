// ============================================================
// routes/quizJobs.ts — Hàng đợi "nhờ Claude tạo đề"
// ============================================================
//   Editor / admin (cookie đăng nhập, gắn requireEditor ở index.ts):
//   POST /api/quiz-jobs                    { docIds, count?, language? } -> tạo yêu cầu
//   GET  /api/quiz-jobs                    yêu cầu của mình (admin: của mọi người)
//   GET  /api/quiz-jobs/unseen-count       số đề Claude đã tạo xong mà mình chưa mở
//   POST /api/quiz-jobs/:id/seen           đánh dấu đã mở
//   POST /api/quiz-jobs/:id/cancel         hủy yêu cầu chưa xong
//
//   Worker (script quiz-worker trên máy có Claude, header x-worker-token):
//   POST /api/worker/quiz-jobs/claim       nhận việc -> { job: null } hoặc { job: { id, system, prompt, schema } }
//   POST /api/worker/quiz-jobs/:id/complete { questions } -> lưu thành ĐỀ NHÁP
//   POST /api/worker/quiz-jobs/:id/fail     { error }
//
// Lời dặn + khuôn JSON do SERVER soạn (dùng chung với nút "Tạo đề bằng AI"
// nội bộ) — worker chỉ chuyển qua lại, không tự quyết định gì.

import { timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { currentUser } from '../middleware/auth.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import {
  cancelJob,
  claimNextJob,
  completeJob,
  countJobsToday,
  countUnseenDone,
  createJob,
  expireOldJobs,
  failJob,
  findJob,
  listJobs,
  markSeen,
  type QuizJob,
} from '../repositories/quizJobs.ts';
import { createQuiz } from '../repositories/quizzes.ts';
import { normalizeQuestions, prepareQuizPrompt } from '../services/quiz/generate.ts';
import { QUIZ_LANGS, type QuizLang } from '../services/quiz/types.ts';
import { parseId } from '../utils/ids.ts';

// ---------- Editor ----------

export const quizJobsRouter = Router();

const createSchema = z.object({
  docIds: z.array(z.string()).min(1, 'Chọn ít nhất một tài liệu').max(10, 'Tối đa 10 tài liệu'),
  count: z.number().int().min(1).max(20).default(10),
  language: z.enum(QUIZ_LANGS).default('vi'),
});

// Editor chỉ thao tác yêu cầu của chính mình; admin thao tác được mọi yêu cầu.
async function findOwnOr404(id: unknown, res: Parameters<RequestHandler>[1]): Promise<QuizJob> {
  const job = await findJob(parseId(id));
  const user = currentUser(res);
  if (!job || (user.role !== 'admin' && job.requestedById !== String(user.id))) throw new HttpError(404, 'Không tìm thấy yêu cầu');
  return job;
}

quizJobsRouter.post('/', async (req, res) => {
  const user = currentUser(res);
  const body = createSchema.parse(req.body ?? {});
  if (user.role !== 'admin' && (await countJobsToday(user.id)) >= config.quiz.claudeJobsPerDay) {
    throw new HttpError(429, `Mỗi ngày chỉ được gửi ${config.quiz.claudeJobsPerDay} yêu cầu tạo đề cho Claude.`);
  }
  // Kiểm tra tài liệu ngay lúc gửi (đã xuất bản) + lấy tên để hiện trong danh sách.
  const prompt = await prepareQuizPrompt(
    body.docIds.map((id) => parseId(id, 'docIds')),
    body.count,
    body.language,
    1, // chỉ cần kiểm tra + lấy tên tài liệu, chưa cần nội dung
  );
  res.status(201).json(await createJob({ sourceDocs: prompt.sourceDocs, language: body.language, questionCount: body.count, requestedById: user.id }));
});

quizJobsRouter.get('/', async (_req, res) => {
  await expireOldJobs(config.quiz.jobTimeoutHours);
  const user = currentUser(res);
  res.json({ timeoutHours: config.quiz.jobTimeoutHours, jobs: await listJobs(user.role === 'admin' ? null : user.id) });
});

quizJobsRouter.get('/unseen-count', async (_req, res) => {
  res.json({ count: await countUnseenDone(currentUser(res).id) });
});

quizJobsRouter.post('/:id/seen', async (req, res) => {
  const job = await findOwnOr404(req.params.id, res);
  await markSeen(Number(job.id));
  res.status(204).end();
});

quizJobsRouter.post('/:id/cancel', async (req, res) => {
  const job = await findOwnOr404(req.params.id, res);
  if (!(await cancelJob(Number(job.id)))) throw new HttpError(409, 'Yêu cầu này đã xong hoặc đã đóng, không hủy được');
  res.status(204).end();
});

// ---------- Worker ----------

export const workerRouter = Router();

// Khóa máy: so sánh thời gian cố định (không lộ "đúng mấy ký tự đầu").
const requireWorkerToken: RequestHandler = (req, _res, next) => {
  if (!config.quiz.workerToken) throw new HttpError(404, 'API không tồn tại');
  const given = Buffer.from(req.get('x-worker-token') ?? '');
  const want = Buffer.from(config.quiz.workerToken);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw new HttpError(401, 'Sai hoặc thiếu x-worker-token');
  next();
};
workerRouter.use(requireWorkerToken);

workerRouter.post('/claim', async (_req, res) => {
  await expireOldJobs(config.quiz.jobTimeoutHours);
  const job = await claimNextJob(config.quiz.jobLeaseMinutes);
  if (!job) {
    res.json({ job: null });
    return;
  }
  try {
    const prompt = await prepareQuizPrompt(
      job.sourceDocs.map((d) => Number(d.id)),
      job.questionCount,
      job.language as QuizLang,
      config.quiz.claudeMaxChars,
    );
    console.log(`🤖 Worker nhận yêu cầu tạo đề #${job.id} (${job.questionCount} câu, ${job.sourceDocs.length} tài liệu)`);
    res.json({ job: { id: job.id, questionCount: job.questionCount, system: prompt.system, prompt: prompt.user, schema: prompt.schema } });
  } catch (err) {
    // Tài liệu đã bị xóa / chuyển về nháp sau khi gửi yêu cầu.
    await failJob(Number(job.id), err instanceof Error ? err.message : String(err));
    res.json({ job: null });
  }
});

const completeSchema = z.object({ questions: z.array(z.unknown()).max(100) });

workerRouter.post('/:id/complete', async (req, res) => {
  const job = await findJob(parseId(req.params.id));
  if (!job || job.status !== 'processing') throw new HttpError(409, 'Yêu cầu không còn ở trạng thái đang xử lý (có thể đã bị hủy / quá hạn)');
  const { questions: raws } = completeSchema.parse(req.body ?? {});

  // Kiểm tra + chuẩn hóa bằng ĐÚNG bộ luật của nút AI nội bộ.
  const lang = job.language as QuizLang;
  const prompt = await prepareQuizPrompt(job.sourceDocs.map((d) => Number(d.id)), job.questionCount, lang, 1);
  const questions = normalizeQuestions(raws, lang, prompt.urlTitle, job.questionCount);
  if (!questions.length) {
    await failJob(Number(job.id), 'Claude không tạo được câu hỏi hợp lệ');
    throw new HttpError(422, 'Không có câu hỏi hợp lệ');
  }

  const titles = job.sourceDocs.map((d) => d.title);
  const quizId = await createQuiz(
    {
      title: titles.length === 1 ? titles[0] : `${titles[0]} (+${titles.length - 1})`,
      kind: 'practice',
      status: 'draft', // luôn là NHÁP: editor duyệt rồi mới xuất bản
      language: lang,
      questions,
      sourceDocs: prompt.sourceDocs,
      passPercent: 85,
      maxAttempts: 3,
      dueAt: null,
      assigneeIds: [],
    },
    job.requestedById !== null ? Number(job.requestedById) : null,
  );
  await completeJob(Number(job.id), quizId);
  console.log(`✅ Claude đã tạo đề #${quizId} cho yêu cầu #${job.id} (${questions.length}/${raws.length} câu hợp lệ)`);
  res.json({ quizId: String(quizId), accepted: questions.length, received: raws.length });
});

workerRouter.post('/:id/fail', async (req, res) => {
  const { error } = z.object({ error: z.string().max(2000).default('Lỗi không rõ') }).parse(req.body ?? {});
  await failJob(parseId(req.params.id), error);
  res.status(204).end();
});

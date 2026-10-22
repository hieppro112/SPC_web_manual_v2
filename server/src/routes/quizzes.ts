// ============================================================
// routes/quizzes.ts — Bài kiểm tra trắc nghiệm
// ============================================================
// Mọi API cần đăng nhập (requireAuth gắn ở index.ts).
//
//   Người làm bài (mọi role):
//   GET    /api/quizzes                      bộ đề mình được làm + kết quả của mình
//   GET    /api/quizzes/:id/take             đề để làm (ĐÃ XÁO, KHÔNG có đáp án)
//   POST   /api/quizzes/:id/submit           { answers: { questionId: [optionId] } } -> chấm điểm
//
//   Editor / admin:
//   GET    /api/quizzes/manage               mọi bộ đề
//   GET    /api/quizzes/users                tài khoản để chọn "giao bài"
//   POST   /api/quizzes/generate             { docIds, count, language } -> stream NDJSON tiến độ + đề AI tạo
//   POST   /api/quizzes                      lưu bộ đề
//   GET    /api/quizzes/:id/edit             bộ đề đầy đủ (có đáp án) để sửa
//   PUT    /api/quizzes/:id                  sửa
//   DELETE /api/quizzes/:id                  xóa (kèm mọi bài làm)
//
//   Admin:
//   GET    /api/quizzes/:id/results          bảng điểm (lần làm gần nhất của mỗi người)
//   GET    /api/quizzes/:id/results.xlsx     xuất Excel
//
// Chấm điểm luôn ở SERVER: trình duyệt không bao giờ nhận đáp án đúng trước
// khi nộp, nên không "xem trộm" đáp án bằng công cụ của trình duyệt được.

import { randomInt } from 'node:crypto';
import { Router, type Response } from 'express';
import ExcelJS from 'exceljs';
import { mustReadFor, mustReadForMany, type MustRead } from '../services/reading.ts';
import { assertDocsVisible, quizzesVisible, requestScope } from '../services/access.ts';
import { z } from 'zod';
import { config } from '../config.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, isEditor, requireAdmin, requireEditor } from '../middleware/auth.ts';
import {
  countAttempts,
  createQuiz,
  deleteQuiz,
  findQuiz,
  hasAssignees,
  insertAttempt,
  isAssigned,
  listAllQuizzes,
  listAssignableUsers,
  listQuizzesForUser,
  listResults,
  updateQuiz,
  type FullQuiz,
  type QuizRecord,
} from '../repositories/quizzes.ts';
import type { User } from '../repositories/users.ts';
import { AiUnavailableError } from '../services/ai/llm.ts';
import { generateQuiz } from '../services/quiz/generate.ts';
import { QUIZ_LANGS, isAnswerCorrect, questionSchema, type QuizQuestion } from '../services/quiz/types.ts';
import { parseId } from '../utils/ids.ts';
import { slugify } from '../utils/slugify.ts';

export const quizzesRouter = Router();

// Đề tạo từ tài liệu của bộ phận khác -> như không tồn tại (phân quyền theo bộ phận).
async function findOr404(id: unknown, res: Response): Promise<FullQuiz> {
  const quiz = await findQuiz(parseId(id));
  if (!quiz || !(await quizzesVisible(await requestScope(res), [quiz])).length) throw new HttpError(404, 'Không tìm thấy bài kiểm tra');
  return quiz;
}

// ---------- Quyền làm bài ----------

type Access = {
  // Lần nộp này có được LƯU điểm không (chỉ bài "Kiểm tra" đã xuất bản).
  records: boolean;
  attemptsUsed: number;
  // Lý do không được nộp nữa ('' = được nộp).
  blocked: '' | 'expired' | 'no_attempts_left' | 'must_read';
  // Bài nguồn phải đọc đủ thời gian trước (quyền "Người dùng"); null = không cần.
  mustRead: MustRead | null;
};

async function checkAccess(quiz: FullQuiz, user: User): Promise<Access> {
  const editor = isEditor(user);
  // Người làm bài không thấy đề nháp / đề không giao cho mình (404: như không tồn tại).
  if (!editor) {
    if (quiz.status !== 'published') throw new HttpError(404, 'Không tìm thấy bài kiểm tra');
    if (quiz.kind === 'exam' && (await hasAssignees(Number(quiz.id))) && !(await isAssigned(Number(quiz.id), user.id))) {
      throw new HttpError(404, 'Không tìm thấy bài kiểm tra');
    }
  }
  // Áp dụng cho cả bài ôn tập lẫn bài kiểm tra.
  const mustRead = await mustReadFor(user, quiz);
  const records = quiz.kind === 'exam' && quiz.status === 'published';
  if (!records) return { records, attemptsUsed: 0, blocked: mustRead ? 'must_read' : '', mustRead };

  const attemptsUsed = await countAttempts(Number(quiz.id), user.id);
  let blocked: Access['blocked'] = '';
  if (quiz.dueAt && new Date(quiz.dueAt).getTime() < Date.now()) blocked = 'expired';
  else if (attemptsUsed >= quiz.maxAttempts) blocked = 'no_attempts_left';
  else if (mustRead) blocked = 'must_read';
  return { records, attemptsUsed, blocked, mustRead };
}

// Xáo trộn mảng (Fisher–Yates) — mỗi lần làm bài thứ tự câu + đáp án khác nhau.
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Người làm bài ----------

quizzesRouter.get('/', async (_req, res) => {
  const user = currentUser(res);
  // Chỉ đề tạo từ tài liệu người này được xem (phân quyền theo bộ phận).
  const quizzes = await quizzesVisible(await requestScope(res), await listQuizzesForUser(user.id));
  // Đề nào còn khóa vì chưa đọc đủ bài nguồn -> kèm danh sách bài cần đọc.
  const mustRead = await mustReadForMany(user, quizzes);
  res.json(quizzes.map((q) => ({ ...q, mustRead: mustRead.get(q.id) ?? null })));
});

quizzesRouter.get('/manage', requireEditor, async (_req, res) => {
  res.json(await quizzesVisible(await requestScope(res), await listAllQuizzes()));
});

quizzesRouter.get('/users', requireEditor, async (_req, res) => {
  res.json(await listAssignableUsers());
});

quizzesRouter.get('/:id/take', async (req, res) => {
  const quiz = await findOr404(req.params.id, res);
  const access = await checkAccess(quiz, currentUser(res));
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      kind: quiz.kind,
      status: quiz.status,
      language: quiz.language,
      passPercent: quiz.passPercent,
      maxAttempts: quiz.maxAttempts,
      dueAt: quiz.dueAt,
      sourceDocs: quiz.sourceDocs,
    },
    records: access.records,
    attemptsUsed: access.attemptsUsed,
    blocked: access.blocked,
    mustRead: access.mustRead,
    // Câu Đúng/Sai giữ thứ tự "Đúng" trước "Sai" cho dễ đọc; câu khác xáo đáp án.
    // KHÔNG gửi `correct` và `source` (source gợi ý chỗ có đáp án).
    // Chưa đọc đủ bài nguồn -> không gửi câu hỏi (khỏi xem trước đề).
    questions: (access.blocked === 'must_read' ? [] : shuffle(quiz.questions)).map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      options: q.type === 'truefalse' ? q.options : shuffle(q.options),
    })),
  });
});

const submitSchema = z.object({
  answers: z.record(z.string().max(50), z.array(z.string().max(50)).max(3)).default({}),
});

quizzesRouter.post('/:id/submit', async (req, res) => {
  const quiz = await findOr404(req.params.id, res);
  const user = currentUser(res);
  const access = await checkAccess(quiz, user);
  if (access.blocked === 'expired') throw new HttpError(403, 'Bài kiểm tra đã hết hạn');
  if (access.blocked === 'no_attempts_left') throw new HttpError(403, `Bạn đã làm đủ ${quiz.maxAttempts} lần`);
  if (access.blocked === 'must_read') throw new HttpError(403, 'Bạn cần đọc đủ thời gian tài liệu nguồn trước khi làm bài');

  const { answers } = submitSchema.parse(req.body ?? {});
  const results = quiz.questions.map((q) => {
    const chosen = answers[q.id] ?? [];
    return { questionId: q.id, chosen, correct: q.correct, isCorrect: isAnswerCorrect(q, chosen), source: q.source };
  });
  const score = results.filter((r) => r.isCorrect).length;
  const total = quiz.questions.length;
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const passed = percentage >= quiz.passPercent;

  if (access.records) {
    await insertAttempt({ quizId: Number(quiz.id), userId: user.id, score, total, percentage, passed, answers });
  }
  const attemptsUsed = access.attemptsUsed + (access.records ? 1 : 0);
  res.json({
    score,
    total,
    percentage,
    passed,
    passPercent: quiz.passPercent,
    recorded: access.records,
    attemptsUsed,
    attemptsLeft: access.records ? Math.max(0, quiz.maxAttempts - attemptsUsed) : null,
    // Sau khi nộp mới gửi đáp án đúng + link về mục tài liệu.
    results,
  });
});

// ---------- Editor: tạo đề bằng AI ----------

// Đếm số lần tạo đề trong ngày, giữ trong bộ nhớ (khởi động lại server thì đếm lại).
const generatedToday = new Map<string, number>();
const todayKey = (userId: number) => `${userId}:${new Date().toISOString().slice(0, 10)}`;

const generateSchema = z.object({
  docIds: z.array(z.string()).min(1, 'Chọn ít nhất một tài liệu').max(10, 'Tối đa 10 tài liệu'),
  count: z.number().int().min(1).max(20),
  language: z.enum(QUIZ_LANGS).default('vi'),
});

quizzesRouter.post('/generate', requireEditor, async (req, res) => {
  if (!config.ai.baseUrl) throw new HttpError(404, 'Trợ lý AI chưa được bật');
  const user = currentUser(res);
  const body = generateSchema.parse(req.body ?? {});
  const docIds = body.docIds.map((id) => parseId(id, 'docIds'));
  await assertDocsVisible(docIds, res);

  const limit = config.quiz.generatePerDay;
  if (user.role !== 'admin' && (generatedToday.get(todayKey(user.id)) ?? 0) >= limit) {
    throw new HttpError(429, `Mỗi ngày chỉ được tạo ${limit} đề bằng AI. Hãy thử lại vào ngày mai.`);
  }

  // Stream NDJSON: {"type":"progress","done":3,"total":10} ... {"type":"result",...}
  // Tạo đề có thể mất vài phút -> báo tiến độ để người dùng biết đang chạy.
  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (data: object) => res.write(`${JSON.stringify(data)}\n`);
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  let lastDone = -1;
  try {
    send({ type: 'progress', done: 0, total: body.count });
    const result = await generateQuiz({ docIds, count: body.count, lang: body.language }, controller.signal, (done) => {
      const value = Math.min(done, body.count);
      if (value !== lastDone) {
        lastDone = value;
        send({ type: 'progress', done: value, total: body.count });
      }
    });
    generatedToday.set(todayKey(user.id), (generatedToday.get(todayKey(user.id)) ?? 0) + 1);
    send({ type: 'result', ...result });
  } catch (err) {
    if (!controller.signal.aborted) {
      const message =
        err instanceof HttpError ? err.message : err instanceof AiUnavailableError ? 'Trợ lý AI đang không hoạt động, hãy thử lại sau' : 'Lỗi khi tạo đề';
      if (!(err instanceof HttpError)) console.error('❌ Tạo đề:', err instanceof Error ? err.message : err);
      send({ type: 'error', message });
    }
  } finally {
    res.end();
  }
});

// ---------- Editor: lưu / sửa / xóa bộ đề ----------

const quizSchema = z.object({
  title: z.string().trim().min(1, 'Tên bài kiểm tra không được để trống').max(300),
  kind: z.enum(['practice', 'exam']),
  status: z.enum(['draft', 'published']).default('draft'),
  language: z.enum(QUIZ_LANGS).default('vi'),
  questions: z.array(questionSchema).min(1, 'Bài kiểm tra phải có ít nhất 1 câu hỏi').max(50),
  sourceDocs: z.array(z.object({ id: z.string().max(20), title: z.string().max(300), slug: z.string().max(200) })).max(10).default([]),
  passPercent: z.number().int().min(1).max(100).default(85),
  maxAttempts: z.number().int().min(1).max(100).default(3),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  assigneeIds: z.array(z.string()).max(1000).default([]),
});

function toRecord(body: z.infer<typeof quizSchema>): QuizRecord {
  // Trùng id câu hỏi -> chấm điểm sẽ sai, chặn từ lúc lưu.
  if (new Set(body.questions.map((q: QuizQuestion) => q.id)).size !== body.questions.length) {
    throw new HttpError(400, 'Trùng id câu hỏi');
  }
  return {
    ...body,
    dueAt: body.dueAt ? new Date(body.dueAt) : null,
    // Bài Ôn tập không giao bài / không hạn chót.
    assigneeIds: body.kind === 'exam' ? body.assigneeIds.map((id) => parseId(id, 'assigneeIds')) : [],
  };
}

quizzesRouter.post('/', requireEditor, async (req, res) => {
  const body = quizSchema.parse(req.body ?? {});
  await assertDocsVisible(body.sourceDocs.map((d) => parseId(d.id, 'sourceDocs')), res);
  const id = await createQuiz(toRecord(body), currentUser(res).id);
  res.status(201).json(await findQuiz(id));
});

quizzesRouter.get('/:id/edit', requireEditor, async (req, res) => {
  res.json(await findOr404(req.params.id, res));
});

quizzesRouter.put('/:id', requireEditor, async (req, res) => {
  const quiz = await findOr404(req.params.id, res);
  const body = quizSchema.parse(req.body ?? {});
  await assertDocsVisible(body.sourceDocs.map((d) => parseId(d.id, 'sourceDocs')), res);
  await updateQuiz(Number(quiz.id), toRecord(body), currentUser(res).id);
  res.json(await findQuiz(Number(quiz.id)));
});

quizzesRouter.delete('/:id', requireEditor, async (req, res) => {
  if (!(await deleteQuiz(parseId(req.params.id)))) throw new HttpError(404, 'Không tìm thấy bài kiểm tra');
  res.status(204).end();
});

// ---------- Admin: bảng điểm + Excel ----------

quizzesRouter.get('/:id/results', requireAdmin, async (req, res) => {
  const quiz = await findOr404(req.params.id, res);
  res.json({ quiz: { id: quiz.id, title: quiz.title, kind: quiz.kind, passPercent: quiz.passPercent, maxAttempts: quiz.maxAttempts, dueAt: quiz.dueAt, questionCount: quiz.questionCount }, rows: await listResults(Number(quiz.id)) });
});

// Excel lưu ngày giờ theo giờ "trên đồng hồ" (không có múi giờ) -> đổi sang giờ máy chủ.
const localDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000);

quizzesRouter.get('/:id/results.xlsx', requireAdmin, async (req, res: Response) => {
  const quiz = await findOr404(req.params.id, res);
  const rows = await listResults(Number(quiz.id));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Kết quả');
  ws.addRow([quiz.title]).font = { bold: true, size: 14 };
  ws.addRow([`Điểm đạt: ${quiz.passPercent}% · Số câu: ${quiz.questionCount} · Tối đa ${quiz.maxAttempts} lần · Tính lần làm gần nhất`]);
  ws.addRow([`Xuất lúc: ${localDate(new Date()).toISOString().slice(0, 16).replace('T', ' ')}`]);
  ws.addRow([]);
  const header = ws.addRow(['STT', 'Họ tên', 'Tên đăng nhập', 'Được giao', 'Số lần làm', 'Điểm', '%', 'Kết quả', 'Nộp lần cuối']);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  rows.forEach((r, i) => {
    const row = ws.addRow([
      i + 1,
      r.displayName,
      r.username,
      r.assigned ? 'Có' : '',
      r.attempts,
      r.total !== null ? `${r.score}/${r.total}` : '',
      r.percentage ?? '',
      r.passed === null ? 'Chưa làm' : r.passed ? 'Đạt' : 'Không đạt',
      r.submittedAt ? localDate(new Date(r.submittedAt)) : '',
    ]);
    row.getCell(9).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(8).font = { color: { argb: r.passed === null ? 'FF64748B' : r.passed ? 'FF16A34A' : 'FFDC2626' } };
  });
  [6, 24, 18, 11, 11, 9, 7, 12, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const filename = `ket-qua-${slugify(quiz.title)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

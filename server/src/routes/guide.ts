// ============================================================
// routes/guide.ts — Hướng dẫn sử dụng + nhiệm vụ thực hành
// ============================================================
//   GET    /api/guide/docs?lang=vi     bài hướng dẫn của một ngôn ngữ         ai cũng xem
//   GET    /api/guide/progress         nhiệm vụ của tôi + cái đã xong          đã đăng nhập
//   POST   /api/guide/progress/:key    báo "tôi vừa làm xong nhiệm vụ này"     đã đăng nhập
//   DELETE /api/guide/progress         làm lại từ đầu                          đã đăng nhập
//   GET    /api/guide/report           tiến độ của mọi người                   admin
//   POST   /api/guide/seed             nạp bài hướng dẫn + bài ôn tập mẫu      admin

import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { listDoneTasks, listGuideDocs, markTaskDone, progressReport, resetProgress } from '../repositories/guide.ts';
import { translatedTitles } from '../repositories/translations.ts';
import { seedGuide } from '../services/guide/seed.ts';
import { QUIZ_LANGS } from '../services/quiz/types.ts';
import { tasksForRole } from '../services/guide/tasks.ts';

export const guideRouter = Router();

// Bài hướng dẫn chỉ có bản gốc tiếng Việt; người đọc tiếng khác thấy tiêu đề / mô tả
// đã dịch (nếu bản dịch có rồi), mở bài thì trang đọc tự hiện bản dịch.
guideRouter.get('/docs', async (req, res) => {
  const lang = z.enum(QUIZ_LANGS).catch('vi').parse(req.query.lang);
  const docs = await listGuideDocs('vi');
  const titles = lang === 'vi' ? new Map<string, { title: string; desc: string }>() : await translatedTitles(lang, docs.map((d) => Number(d.id)));
  res.json({ lang, docs: docs.map((d) => ({ ...d, title: titles.get(d.id)?.title ?? d.title, desc: titles.get(d.id)?.desc || d.desc })) });
});

guideRouter.get('/progress', requireAuth, async (_req, res) => {
  const user = currentUser(res);
  res.json({ tasks: tasksForRole(user.role).map(({ key, group }) => ({ key, group })), done: await listDoneTasks(user.id) });
});

guideRouter.post('/progress/:key', requireAuth, async (req, res) => {
  const user = currentUser(res);
  const key = String(req.params.key);
  // Chỉ nhận nhiệm vụ có thật và hợp với quyền của người này.
  if (!tasksForRole(user.role).some((t) => t.key === key)) throw new HttpError(400, 'Nhiệm vụ không hợp lệ');
  const firstTime = await markTaskDone(user.id, key);
  res.json({ key, firstTime });
});

guideRouter.delete('/progress', requireAuth, async (_req, res) => {
  await resetProgress(currentUser(res).id);
  res.status(204).end();
});

guideRouter.get('/report', requireAdmin, async (_req, res) => {
  const users = await progressReport();
  res.json({
    users: users.map((u) => {
      const keys = tasksForRole(u.role).map((t) => t.key);
      return { ...u, done: u.done.filter((k) => keys.includes(k)).length, total: keys.length };
    }),
  });
});

guideRouter.post('/seed', requireAdmin, async (_req, res) => {
  res.json(await seedGuide(currentUser(res).id));
});

// ============================================================
// index.ts — Điểm khởi động backend
// ============================================================
// File này CHỈ lắp ráp. Các phần nằm ở:
//   src/db/          — kết nối SQL Server + migration (tạo bảng)
//   src/repositories/— mọi câu SQL, mỗi bảng một file
//   src/blocks/      — luật dữ liệu của từng loại khối (zod)
//   src/routes/      — các nhóm API
//   src/services/    — logic dùng chung giữa nhiều route (media, phiên bản)
//   src/middleware/  — xử lý lỗi, đăng nhập

import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { config } from './config.ts';
import { connectDb, isDbConnected } from './db/pool.ts';
import { runMigrations } from './db/migrate.ts';
import { deleteExpiredSessions } from './repositories/media.ts';
import { startLogCleanup } from './services/ai/chatLog.ts';
import { startIndexing } from './services/ai/searchIndex.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { loadUser, requireAdmin, requireAuth, requireEditor } from './middleware/auth.ts';
import { aiRouter } from './routes/ai.ts';
import { authRouter } from './routes/auth.ts';
import { categoriesRouter } from './routes/categories.ts';
import { categoryRequestsRouter } from './routes/categoryRequests.ts';
import { categoryTemplatesRouter } from './routes/categoryTemplates.ts';
import { documentsRouter } from './routes/documents.ts';
import { mediaRouter } from './routes/media.ts';
import { quizzesRouter } from './routes/quizzes.ts';
import { quizJobsRouter, workerRouter } from './routes/quizJobs.ts';
import { importJobsRouter, importWorkerRouter } from './routes/importJobs.ts';
import { guideRouter } from './routes/guide.ts';
import { translateWorkerRouter, translationsRouter } from './routes/translations.ts';
import { readingRouter } from './routes/reading.ts';
import { engagementRouter } from './routes/engagement.ts';
import { thumbsRouter } from './routes/thumbs.ts';
import { startTranslationSweep } from './services/translate/queue.ts';
import { deleteOldAttempts } from './repositories/quizzes.ts';
import { metaRouter } from './routes/meta.ts';
import { uploadSessionsRouter } from './routes/uploadSessions.ts';
import { usersRouter } from './routes/users.ts';
import { ensureUploadDirs } from './services/media.ts';

const app = express();

// Middleware: hàm chạy XEN GIỮA, trước khi request tới route.
// express.json() đọc body JSON vào req.body. Nâng giới hạn lên 5 MB vì
// tài liệu quy trình dài có thể có hàng trăm khối.
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// ---------- API ----------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: isDbConnected() ? 'connected' : 'disconnected' });
});

app.get('/api/hello/:name', (req, res) => {
  res.json({ message: `Hello, ${req.params.name}!` });
});

// Gắn user (nếu có cookie đăng nhập hợp lệ) cho MỌI request /api phía sau.
app.use('/api', loadUser);

// Thứ tự app.use() QUAN TRỌNG: Express duyệt từ trên xuống, gặp cái nào
// khớp trước thì dùng cái đó.
app.use('/api/auth', authRouter);
app.use('/api/meta', metaRouter);
app.use('/api/categories', categoriesRouter);
// Mục mặc định của mọi bộ phận: chỉ admin sửa.
app.use('/api/category-templates', requireAdmin, categoryTemplatesRouter);
// Đề xuất thể loại: biên tập gửi, admin duyệt (quyền chi tiết trong router).
app.use('/api/category-requests', requireAuth, categoryRequestsRouter);
app.use('/api/documents', documentsRouter);
// Gắn middleware kiểm tra quyền cho CẢ nhóm route ngay tại đây.
// Upload ảnh/video/file chỉ dành cho người soạn tài liệu (role "user" không được).
app.use('/api/media', requireEditor, mediaRouter);
app.use('/api/users', requireAdmin, usersRouter);
// Không gắn requireAuth cho cả nhóm: điện thoại upload bằng token, không đăng nhập.
app.use('/api/upload-sessions', uploadSessionsRouter);
// Khách cũng hỏi được (có giới hạn số câu) -> không gắn requireAuth.
app.use('/api/ai', aiRouter);
// Bài kiểm tra: phải đăng nhập; quyền chi tiết (editor/admin) nằm trong router.
app.use('/api/quizzes', requireAuth, quizzesRouter);
// Hàng đợi "nhờ Claude tạo đề": editor gửi yêu cầu; worker (khóa máy, không cookie) nhận việc.
app.use('/api/quiz-jobs', requireEditor, quizJobsRouter);
app.use('/api/worker/quiz-jobs', workerRouter);
// Nhập bài từ PowerPoint: cùng cách làm (editor gửi file, worker nhờ Claude dựng bài nháp).
app.use('/api/import-jobs', requireEditor, importJobsRouter);
app.use('/api/worker/import-jobs', importWorkerRouter);
// Hướng dẫn sử dụng: bài hướng dẫn ai cũng xem; tiến độ / nạp mẫu kiểm tra quyền trong router.
app.use('/api/guide', guideRouter);
// Bản dịch tự động: ai đọc được bài thì đọc được bản dịch; worker dịch dùng chung khóa máy.
app.use('/api/translations', translationsRouter);
app.use('/api/worker/translate-jobs', translateWorkerRouter);
// Thời gian đọc tối thiểu: ai đọc được bài thì xem quy định; đếm giờ / báo cáo kiểm tra quyền trong router.
app.use('/api/reading', readingRouter);
// Lượt xem / thả tim: ai đọc được bài thì xem được; tim, yêu thích, thống kê kiểm tra quyền trong router.
app.use('/api/engagement', engagementRouter);

// Không khớp route nào ở trên -> 404 dạng JSON.
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API không tồn tại' });
});

// ---------- File upload ----------

ensureUploadDirs();
// File tạm đang upload dở: không cho ai truy cập.
app.use('/uploads/tmp', (_req, res) => {
  res.status(404).end();
});
// Ảnh thu nhỏ cho thẻ ở trang chủ: tạo lần đầu khi có người xin (xem routes/thumbs.ts).
app.use('/uploads/thumbs', thumbsRouter);
app.use(
  '/uploads',
  express.static(config.uploadDir, {
    // Tên file là chuỗi ngẫu nhiên, không bao giờ bị ghi đè -> cho trình
    // duyệt lưu đệm lâu, mở lại tài liệu dài nhiều ảnh sẽ rất nhanh.
    maxAge: '30d',
    immutable: true,
    setHeaders(res, filePath) {
      // Cấm trình duyệt "đoán" loại file (vd đoán một file là HTML rồi chạy).
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // File đính kèm luôn bị TẢI VỀ, không bao giờ mở ngay trong trình duyệt.
      if (filePath.includes(`${path.sep}files${path.sep}`)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
      // Ảnh SVG của sơ đồ: chỉ cho vẽ, cấm chạy script, kể cả khi mở thẳng link.
      if (filePath.endsWith('.svg')) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox");
      }
    },
  }),
);

// ---------- draw.io (khối "Sơ đồ") ----------
// Trang tĩnh của draw.io, mở trong iframe khi soạn sơ đồ. Chưa cài thì 404
// (không rơi xuống SPA fallback bên dưới, kẻo iframe hiện trang của app).
app.use('/drawio', express.static(config.drawioDir, { maxAge: '7d' }));
app.use('/drawio', (_req, res) => {
  res.status(404).end();
});

// ---------- Giao diện (production) ----------
// Sau khi `npm run build` trong client/, server phục vụ luôn giao diện:
// chỉ cần MỘT tiến trình, MỘT cổng. Lúc dev thì Vite lo phần này.
const indexHtml = path.join(config.clientDist, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.clientDist));
  // Mọi đường dẫn còn lại (/docs/abc, /login...) đều trả về index.html,
  // để React Router ở trình duyệt tự xử lý. ("SPA fallback")
  // Cú pháp '/{*splat}' của Express 5 = "khớp mọi đường dẫn".
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(indexHtml);
  });
  console.log(`🖥️  Phục vụ giao diện từ ${config.clientDist}`);
}

// Xử lý lỗi PHẢI đứng cuối cùng, sau mọi route.
app.use(errorHandler);

// Nối DB + tạo/cập nhật bảng XONG rồi mới mở cổng nhận request.
try {
  await connectDb();
  console.log(`✅ Đã kết nối SQL Server (${config.db.server}/${config.db.database})`);
  const ran = await runMigrations();
  if (ran.length) console.log(`🗂️  Đã chạy migration: ${ran.join(', ')}`);
} catch (err) {
  console.error('❌ Không kết nối / khởi tạo được SQL Server:', err instanceof Error ? err.message : err);
  process.exit(1);
}

// Dọn phiên QR hết hạn mỗi 15 phút (MongoDB tự làm bằng TTL index, SQL
// Server thì phải tự làm). .unref(): bộ hẹn giờ không giữ tiến trình sống.
setInterval(() => {
  deleteExpiredSessions().catch((err) => console.error('❌ Dọn phiên QR lỗi:', err.message));
}, 15 * 60 * 1000).unref();

// Kết quả bài kiểm tra là dữ liệu đánh giá cá nhân -> chỉ giữ QUIZ_RESULT_DAYS ngày.
const cleanQuizResults = () =>
  deleteOldAttempts(config.quiz.resultDays)
    .then((n) => n && console.log(`🧹 Đã xóa ${n} bài làm cũ hơn ${config.quiz.resultDays} ngày`))
    .catch((err) => console.error('❌ Dọn bài làm cũ lỗi:', err.message));
void cleanQuizResults();
setInterval(cleanQuizResults, 6 * 60 * 60 * 1000).unref();

// Dịch tự động: đưa bài thiếu bản dịch vào hàng đợi (lần đầu = dịch bù bài cũ), lặp lại định kỳ.
startTranslationSweep();

// Trợ lý AI (nếu bật AI_BASE_URL): dựng chỉ mục tài liệu chạy nền + dọn log cũ.
if (config.ai.baseUrl) {
  console.log(`🤖 AI trả lời (${config.ai.api}): ${config.ai.baseUrl} — ${config.ai.chatModel}`);
  console.log(`🤖 AI embedding (${config.ai.embedApi}): ${config.ai.embedBaseUrl} — ${config.ai.embedModel}`);
  startIndexing();
  startLogCleanup();
}

app.listen(config.port, () => {
  console.log(`🚀 API chạy tại http://localhost:${config.port}`);
});

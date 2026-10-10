// ============================================================
// index.ts — Điểm khởi động backend
// ============================================================
// Bản cũ nhồi mọi thứ (schema, route, middleware) vào 1 file 467 dòng.
// Bản mới: file này CHỈ lắp ráp. Các phần sẽ nằm ở:
//   src/models/      — schema Mongoose
//   src/routes/      — các nhóm API
//   src/middleware/  — xử lý lỗi, (bước 4) requireAuth

import express from 'express';
import mongoose from 'mongoose';
import { config } from './config.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { categoriesRouter } from './routes/categories.ts';
import { documentsRouter } from './routes/documents.ts';

const app = express();

// Middleware: hàm chạy XEN GIỮA, trước khi request tới route.
// express.json() đọc body dạng JSON và gắn vào req.body.
// Thiếu dòng này thì req.body luôn là undefined — lỗi rất hay gặp.
app.use(express.json());

// Route kiểm tra sức khỏe: mở http://localhost:5000/api/health để biết
// server còn sống và đã nối được MongoDB chưa.
// `_req`: có dấu gạch dưới vì ta không dùng tới request — quy ước để
// TypeScript không báo "biến khai báo mà không dùng".
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    // readyState === 1 nghĩa là đã kết nối. (0 = ngắt, 2 = đang nối)
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

//router hello name 
app.get('/api/hello/:name', (req, res) => {
  const name = req.params.name;
  res.json({ message: `Hello, ${name}!` });
});

// Gắn cả nhóm route vào một tiền tố. Thứ tự app.use() QUAN TRỌNG:
// Express duyệt từ trên xuống, gặp cái nào khớp trước thì dùng cái đó.
app.use('/api/documents', documentsRouter);
app.use('/api/categories', categoriesRouter);

// Không khớp route nào ở trên -> 404 dạng JSON (mặc định Express trả về
// một trang HTML "Cannot GET ...", client không đọc được).
app.use('/api', (_req, res) => {
  res.status(404).json({ message: 'API không tồn tại' });
});

// Xử lý lỗi PHẢI đứng cuối cùng, sau mọi route.
app.use(errorHandler);

// Nối DB XONG rồi mới mở cổng nhận request. Bản cũ làm song song nên có
// khoảng thời gian server nhận request trong khi DB chưa sẵn sàng.
//
// `await` ở top-level (ngoài mọi hàm async) dùng được vì package.json
// khai báo "type": "module".
try {
  await mongoose.connect(config.mongoUri);
  console.log('✅ Đã kết nối MongoDB');
} catch (err) {
  console.error('❌ Không kết nối được MongoDB:', err);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`🚀 API chạy tại http://localhost:${config.port}`);
});

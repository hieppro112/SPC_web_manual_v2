// ============================================================
// errorHandler.ts — Xử lý lỗi TẬP TRUNG cho mọi route
// ============================================================
// Express 5: hàm route `async` mà NÉM LỖI thì Express tự chuyển lỗi đó
// tới đây. Route chỉ việc `throw`, không cần try/catch. Và client luôn
// nhận đúng một dạng: { message }.
//
//   route ──throw──▶ errorHandler ──▶ res.status(...).json({ message })
//
// 🔸 Flutter: giống một interceptor onError của Dio gom mọi lỗi về một chỗ,
//    nhưng ở phía server.

import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

// Lỗi "có chủ đích" kèm mã HTTP. Route dùng: throw new HttpError(404, '...')
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Tên ràng buộc UNIQUE trong SQL (xem db/migrations/001_init.sql) -> câu
// báo lỗi dễ hiểu khi trùng.
const DUPLICATE_LABELS: [RegExp, string][] = [
  [/Users_Username/, 'Tên đăng nhập'],
  [/Users_Email/, 'Email'],
  // Migration 011: tên thể loại / mục mặc định chỉ cần khác nhau TRONG CÙNG cha.
  [/CategoryTemplates_Parent_Name/, 'Tên mục mặc định (trong cùng mục cha)'],
  [/Categories_Parent_Name/, 'Tên thể loại (trong cùng thể loại cha)'],
  [/Categories_Name/, 'Tên thể loại'],
  [/Documents_Slug/, 'Đường dẫn tài liệu'],
];

// Một số mã lỗi của SQL Server (err.number):
const SQL_UNIQUE_CONSTRAINT = 2627; // vi phạm ràng buộc UNIQUE
const SQL_UNIQUE_INDEX = 2601; // vi phạm unique index (vd UX_Users_Email)
const SQL_CONSTRAINT_CONFLICT = 547; // vi phạm khóa ngoại / CHECK
const SQL_TRUNCATION = [8152, 2628]; // chuỗi dài hơn cột cho phép

// Express nhận ra đây là middleware xử lý lỗi nhờ nó có ĐÚNG 4 tham số.
// Bỏ `_next` đi là Express coi nó như middleware thường — lỗi khó tìm.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // 1. Lỗi do chính ta ném ra
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  // 2. Body sai khuôn zod (vd mật khẩu quá ngắn) -> 400
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join('.');
    const message = issue?.message ?? 'Dữ liệu không hợp lệ';
    // Câu báo lỗi tự viết (tiếng Việt) đã đủ rõ -> hiện nguyên văn. Câu mặc
    // định của zod (tiếng Anh, vd "Invalid input") thì kèm tên field cho dễ tìm.
    const isDefaultZodMessage = /^(Invalid|Expected|Too )/.test(message);
    res.status(400).json({ message: field && isDefaultZodMessage ? `${field}: ${message}` : message });
    return;
  }

  // 3. Lỗi upload: file quá lớn -> 413, lỗi khác của multer -> 400
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'File quá lớn' });
      return;
    }
    res.status(400).json({ message: `Lỗi upload: ${err.message}` });
    return;
  }

  // 4. Body JSON hỏng hoặc quá lớn (lỗi từ express.json())
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Body JSON không hợp lệ' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn' });
    return;
  }

  // 5. Lỗi từ SQL Server (thư viện mssql đặt mã lỗi SQL vào err.number)
  if (err?.name === 'RequestError' && typeof err.number === 'number') {
    const message: string = err.message ?? '';
    if (err.number === SQL_UNIQUE_CONSTRAINT || err.number === SQL_UNIQUE_INDEX) {
      const label = DUPLICATE_LABELS.find(([pattern]) => pattern.test(message))?.[1] ?? 'Dữ liệu này';
      res.status(409).json({ message: `${label} đã tồn tại` });
      return;
    }
    if (err.number === SQL_CONSTRAINT_CONFLICT) {
      res.status(409).json({ message: 'Dữ liệu đang liên kết với dữ liệu khác hoặc không hợp lệ' });
      return;
    }
    if (SQL_TRUNCATION.includes(err.number)) {
      res.status(400).json({ message: 'Dữ liệu quá dài' });
      return;
    }
  }

  // 6. Mất kết nối tới SQL Server -> 503 (dịch vụ tạm thời không sẵn sàng)
  if (err?.name === 'ConnectionError') {
    console.error('❌ Mất kết nối SQL Server:', err.message);
    res.status(503).json({ message: 'Không kết nối được cơ sở dữ liệu' });
    return;
  }

  // 7. Còn lại là lỗi không lường trước: ghi log đầy đủ cho dev,
  //    nhưng KHÔNG gửi chi tiết cho client (có thể lộ cấu trúc hệ thống).
  console.error('❌ Lỗi không xử lý:', err);
  res.status(500).json({ message: 'Lỗi máy chủ' });
};
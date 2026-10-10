// ============================================================
// errorHandler.ts — Xử lý lỗi TẬP TRUNG cho mọi route
// ============================================================
// Bản cũ: route nào cũng try/catch, mỗi chỗ trả lỗi một kiểu
// (chỗ thì { message }, chỗ thì { error }), nên client phải đoán.
//
// Bản mới dựa vào một tính năng của Express 5: hàm route `async` mà
// NÉM LỖI thì Express tự chuyển lỗi đó tới đây. Route chỉ việc `throw`,
// không cần try/catch. Và client luôn nhận đúng một dạng: { message }.
//
//   route ──throw──▶ errorHandler ──▶ res.status(...).json({ message })
//
// 🔸 Flutter: giống một interceptor onError của Dio gom mọi lỗi về một chỗ,
//    nhưng ở phía server.

import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
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

// Tên dễ hiểu của các field `unique`, dùng trong câu báo trùng.
const DUPLICATE_LABELS: Record<string, string> = {
  username: 'Tên đăng nhập',
  email: 'Email',
  name: 'Tên thể loại',
  slug: 'Đường dẫn tài liệu',
};

// Express nhận ra đây là middleware xử lý lỗi nhờ nó có ĐÚNG 4 tham số.
// Bỏ `_next` đi là Express coi nó như middleware thường — lỗi khó tìm.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // 1. Lỗi do chính ta ném ra
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  // 2. Dữ liệu sai luật schema (thiếu title, sai enum...) -> 400
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    res.status(400).json({ message: first?.message ?? 'Dữ liệu không hợp lệ' });
    return;
  }

  // 3. id sai định dạng, ví dụ /api/documents/abc -> 400
  //    (bản cũ để lọt thành 500 "lỗi máy chủ")
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: `Giá trị không hợp lệ: ${err.path}` });
    return;
  }

  // 4. Body sai khuôn zod (vd mật khẩu quá ngắn) -> 400
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

  // 5. Lỗi upload: file quá lớn -> 413, lỗi khác của multer -> 400
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'File quá lớn' });
      return;
    }
    res.status(400).json({ message: `Lỗi upload: ${err.message}` });
    return;
  }

  // 6. Body JSON hỏng hoặc quá lớn (lỗi từ express.json())
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'Body JSON không hợp lệ' });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Dữ liệu gửi lên quá lớn' });
    return;
  }

  // 7. Trùng giá trị `unique` (vd tên thể loại đã có) -> 409 Conflict
  if (err?.code === 11000) {
    // err.keyValue = { email: '...' } -> biết trùng field nào để báo rõ.
    const field = Object.keys(err.keyValue ?? {})[0] ?? '';
    res.status(409).json({ message: `${DUPLICATE_LABELS[field] ?? 'Dữ liệu này'} đã tồn tại` });
    return;
  }

  // 8. Còn lại là lỗi không lường trước: ghi log đầy đủ cho dev,
  //    nhưng KHÔNG gửi chi tiết cho client (có thể lộ cấu trúc hệ thống).
  console.error('❌ Lỗi không xử lý:', err);
  res.status(500).json({ message: 'Lỗi máy chủ' });
};

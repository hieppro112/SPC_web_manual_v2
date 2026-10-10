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

// Lỗi "có chủ đích" kèm mã HTTP. Route dùng: throw new HttpError(404, '...')
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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

  // 4. Trùng giá trị `unique` (vd tên thể loại đã có) -> 409 Conflict
  if (err?.code === 11000) {
    res.status(409).json({ message: 'Dữ liệu này đã tồn tại' });
    return;
  }

  // 5. Còn lại là lỗi không lường trước: ghi log đầy đủ cho dev,
  //    nhưng KHÔNG gửi chi tiết cho client (có thể lộ cấu trúc hệ thống).
  console.error('❌ Lỗi không xử lý:', err);
  res.status(500).json({ message: 'Lỗi máy chủ' });
};

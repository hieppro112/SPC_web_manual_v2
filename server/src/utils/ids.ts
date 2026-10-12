// ============================================================
// utils/ids.ts — Đọc id từ URL / body một cách an toàn
// ============================================================
// Trong SQL Server, id là số nguyên tự tăng (INT IDENTITY). Client vẫn
// nhận id dạng CHUỖI ("12") như hồi dùng MongoDB, để phía giao diện không
// phải sửa gì. Khi id đi ngược vào server thì đổi lại thành số ở đây.

import { HttpError } from '../middleware/errorHandler.ts';

// "12" -> 12. "abc", "-1", "1.5" -> lỗi 400.
export function parseId(value: unknown, field = 'id'): number {
  const id = typeof value === 'number' ? value : Number(String(value ?? ''));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Giá trị không hợp lệ: ${field}`);
  return id;
}

// Giống parseId nhưng trả null thay vì báo lỗi (dùng cho bộ lọc tùy chọn).
export function tryParseId(value: unknown): number | null {
  const id = Number(String(value ?? ''));
  return Number.isInteger(id) && id > 0 ? id : null;
}

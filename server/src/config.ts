// ============================================================
// config.ts — Nơi DUY NHẤT đọc biến môi trường (process.env)
// ============================================================
// Các file khác import `config` từ đây, không ai được đọc process.env
// trực tiếp. Lợi ích: thiếu biến nào là báo lỗi ngay lúc khởi động,
// thay vì chạy được nửa chừng mới sập.
//
// Biến môi trường được nạp từ file .env nhờ cờ `--env-file=.env` trong
// script `npm run dev` (Node có sẵn, không cần thư viện dotenv như bản cũ).

// Hàm nhỏ: lấy biến bắt buộc, thiếu thì dừng chương trình.
// `: string` sau tham số và sau dấu `)` là khai báo KIỂU — giống Dart:
//   String required(String name) { ... }
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Thiếu biến môi trường ${name}. Xem file .env.example`);
    process.exit(1);
  }
  return value;
}

// `as const` = đóng băng object: TypeScript hiểu các giá trị này
// không bao giờ bị gán lại. 🔸 Dart: giống `const` object.
export const config = {
  port: Number(process.env.PORT ?? 5000), // `??` y hệt Dart: null thì lấy vế phải
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/doc_app_v2',
  jwtSecret: required('JWT_SECRET'),
} as const;

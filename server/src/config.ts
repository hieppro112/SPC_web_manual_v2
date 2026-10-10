// ============================================================
// config.ts — Nơi DUY NHẤT đọc biến môi trường (process.env)
// ============================================================
// Các file khác import `config` từ đây, không ai được đọc process.env
// trực tiếp. Lợi ích: thiếu biến nào là báo lỗi ngay lúc khởi động,
// thay vì chạy được nửa chừng mới sập.
//
// Biến môi trường được nạp từ file .env nhờ cờ `--env-file=.env` trong
// script `npm run dev` (Node có sẵn, không cần thư viện dotenv như bản cũ).
// Biến đặt sẵn trong môi trường (vd lúc chạy test) được ƯU TIÊN hơn .env.

import path from 'node:path';

// Lấy biến bắt buộc, thiếu thì dừng chương trình.
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
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/doc_app_v2',
  jwtSecret: required('JWT_SECRET'),

  // Thư mục lưu ảnh/video/file upload. Đường dẫn tương đối tính từ thư
  // mục chạy lệnh (server/).
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 500),

  // Địa chỉ mà ĐIỆN THOẠI dùng để mở trang upload khi quét QR, vd
  // http://192.168.1.20:5000. Để trống thì client tự đoán theo IP mạng LAN.
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',

  // Đuôi email được phép tự đăng ký, cách nhau dấu phẩy: "spclt.com.vn,abc.vn".
  // Để trống = chấp nhận mọi email (chỉ kiểm tra đúng định dạng).
  allowedEmailDomains: (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),

  // Chỉ bật khi chạy HTTPS. Bật trên HTTP thì trình duyệt không gửi
  // cookie đăng nhập -> không đăng nhập được.
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  // Bản build của client (npm run build trong client/). Nếu có, server
  // phục vụ luôn giao diện -> production chỉ cần chạy MỘT tiến trình.
  clientDist: path.resolve(process.env.CLIENT_DIST ?? '../client/dist'),
} as const;

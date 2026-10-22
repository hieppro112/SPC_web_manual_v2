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
  jwtSecret: required('JWT_SECRET'),

  // Kết nối SQL Server. Mật khẩu CHỈ nằm trong file .env (không commit).
  db: {
    server: process.env.DB_SERVER ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 1433),
    // Tên instance (vd SQLEXPRESS). Để trống khi dùng instance mặc định
    // hoặc đã chỉ định cổng — có instance thì cần dịch vụ SQL Browser.
    instanceName: process.env.DB_INSTANCE || undefined,
    database: process.env.DB_NAME ?? 'KVH',
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    // SQL Server 2022 mặc định mã hóa kết nối. Máy chủ nội bộ thường dùng
    // chứng chỉ tự ký -> phải "tin" chứng chỉ đó, nếu không sẽ bị từ chối.
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    // false = app KHÔNG tự tạo / sửa bảng lúc khởi động (tài khoản app chỉ có quyền
    // đọc/ghi, cấu trúc do người quản trị tạo tay trong SSMS). Mặc định true.
    autoMigrate: process.env.DB_AUTO_MIGRATE !== 'false',
  },

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

  // Nếu có biến COMPANY_EMPLOYEE_VIEW, thì khi đăng ký sẽ kiểm tra
  companyEmployeeView: process.env.COMPANY_EMPLOYEE_VIEW ?? '',

  // Chỉ bật khi chạy HTTPS. Bật trên HTTP thì trình duyệt không gửi
  // cookie đăng nhập -> không đăng nhập được.
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  // Trợ lý AI chạy local (LM Studio / Ollama). AI_BASE_URL trống = tắt AI (ẩn nút chat).
  ai: {
    // 'openai' = API chuẩn OpenAI (LM Studio, cổng 1234); 'ollama' = API riêng của Ollama (cổng 11434)
    api: process.env.AI_API === 'ollama' ? ('ollama' as const) : ('openai' as const),
    baseUrl: (process.env.AI_BASE_URL ?? '').replace(/\/+$/, ''), // vd http://localhost:1234
    apiKey: process.env.AI_API_KEY ?? '', // chỉ cần nếu LM Studio bật yêu cầu xác thực
    chatModel: process.env.AI_CHAT_MODEL ?? 'qwen3.5-9b', // model trả lời (tên y như trong LM Studio)
    embedModel: process.env.AI_EMBED_MODEL ?? 'bge-m3', // model "đánh dấu" để tìm đoạn liên quan
    // Model embedding chạy ở phần mềm KHÁC (vd trả lời bằng LM Studio, embedding bằng
    // Ollama vì LM Studio không tải được model). Để trống = dùng chung AI_API / AI_BASE_URL.
    embedApi: (process.env.AI_EMBED_API || process.env.AI_API) === 'ollama' ? ('ollama' as const) : ('openai' as const),
    embedBaseUrl: (process.env.AI_EMBED_BASE_URL || process.env.AI_BASE_URL || '').replace(/\/+$/, ''),
    // Độ dài ngữ cảnh (token). Ollama: app gửi kèm mỗi câu hỏi. LM Studio: phải đặt
    // Context Length của model >= số này trong LM Studio. App cắt tài liệu dài theo số này.
    numCtx: Number(process.env.AI_NUM_CTX ?? 16384),
    guestLimitPerHour: Number(process.env.AI_GUEST_LIMIT_PER_HOUR ?? 10), // khách chưa đăng nhập
    syncMinutes: Number(process.env.AI_SYNC_MINUTES ?? 5), // quét lại tài liệu định kỳ
    // Thư mục chứa chỉ mục tìm kiếm (index.json, xóa được, tự tạo lại) + log hỏi đáp.
    dataDir: path.resolve(process.env.AI_DATA_DIR ?? 'ai-data'),
    logDays: Number(process.env.AI_LOG_DAYS ?? 7), // giữ log hỏi đáp bao nhiêu ngày
    // Khóa cho công cụ ngoài đọc tài liệu qua GET /api/ai/documents. Trống = tắt API này.
    exportKey: process.env.AI_EXPORT_KEY ?? '',
  },

  // Bài kiểm tra trắc nghiệm do AI ra đề.
  quiz: {
    generatePerDay: Number(process.env.QUIZ_GENERATE_PER_DAY ?? 3), // số lần tạo đề / editor / ngày (admin không giới hạn)
    resultDays: Number(process.env.QUIZ_RESULT_DAYS ?? 30), // giữ kết quả làm bài bao nhiêu ngày rồi tự xóa
    // Hàng đợi "Gửi cho Claude" (quiz-worker chạy trên máy có Claude).
    // Khóa máy để worker gọi API; TRỐNG = tắt hẳn API worker. Chuỗi ngẫu nhiên dài, KHÔNG gửi qua chat.
    workerToken: process.env.QUIZ_WORKER_TOKEN ?? '',
    claudeJobsPerDay: Number(process.env.QUIZ_CLAUDE_JOBS_PER_DAY ?? 10), // yêu cầu / editor / ngày (admin không giới hạn)
    jobTimeoutHours: Number(process.env.QUIZ_JOB_TIMEOUT_HOURS ?? 48), // quá giờ chưa xong -> "quá hạn"
    jobLeaseMinutes: Number(process.env.QUIZ_JOB_LEASE_MINUTES ?? 30), // worker nhận việc quá lâu không xong -> cho nhận lại
    claudeMaxChars: Number(process.env.QUIZ_CLAUDE_MAX_CHARS ?? 200_000), // độ dài tài liệu tối đa gửi Claude (ngữ cảnh lớn)
  },

  // Nhập bài từ PowerPoint (qua hàng đợi, dùng chung worker + khóa máy với tạo đề).
  pptxImport: {
    maxMb: Number(process.env.IMPORT_MAX_MB ?? 50),
    maxSlides: Number(process.env.IMPORT_MAX_SLIDES ?? 100),
    leaseMinutes: Number(process.env.IMPORT_LEASE_MINUTES ?? 120), // file dài cần nhiều lần gọi Claude
  },

  // Dịch tự động bài viết sang 2 ngôn ngữ còn lại (qua hàng đợi, dùng chung worker).
  translate: {
    enabled: (process.env.TRANSLATE_ENABLED ?? 'true') !== 'false',
    leaseMinutes: Number(process.env.TRANSLATE_LEASE_MINUTES ?? 60),
    maxCharsPerPart: Number(process.env.TRANSLATE_MAX_CHARS ?? 20_000), // mỗi lần gọi Claude dịch tối đa bấy nhiêu ký tự
    sweepHours: Number(process.env.TRANSLATE_SWEEP_HOURS ?? 6), // quét bài thiếu bản dịch (lần đầu = dịch bù bài cũ)
  },

  // draw.io tự host cho khối "Sơ đồ" (cài bằng `npm run install-drawio`).
  drawioDir: path.resolve(process.env.DRAWIO_DIR ?? 'drawio'),

  // Bản build của client (npm run build trong client/). Nếu có, server
  // phục vụ luôn giao diện -> production chỉ cần chạy MỘT tiến trình.
  clientDist: path.resolve(process.env.CLIENT_DIST ?? '../client/dist'),
} as const;

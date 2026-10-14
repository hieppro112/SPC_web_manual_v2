# KVH IT Docs

Web lưu tài liệu hướng dẫn / quy trình nội bộ. Chạy trong mạng nội bộ: **ai vào được mạng là đọc được** tài liệu đã xuất bản, **người đăng nhập** (editor/admin) mới được soạn.

- Soạn theo **khối** (form từng khối): tiêu đề mục, văn bản (Markdown), bước thực hiện tự đánh số, ảnh, video, **sơ đồ (draw.io)**, **biểu đồ** (cột, đường, tròn... nhập số hoặc dán từ Excel), hộp lưu ý, checklist, bảng, mã lệnh, file đính kèm, đường kẻ
- Ảnh/video: chọn từ máy, kéo thả, dán (Ctrl+V), thư viện media, dán URL, hoặc **quét QR chụp bằng điện thoại**
- Lịch sử phiên bản (xem + khôi phục), nháp / đã xuất bản
- Chia sẻ link + mã QR của tài liệu, link tới từng mục, in / xuất PDF
- Tìm kiếm không dấu trên toàn bộ nội dung
- Giao diện sáng / tối, tiếng Việt / English / 日本語
- **Trợ lý AI chạy local** (LM Studio / Ollama): hỏi đáp trên toàn bộ tài liệu kèm link nguồn, hỏi về bài đang đọc, tóm tắt — xem DEPLOY.md bước 9

## Cấu trúc

```
doc_app_v2/
├── client/                 React + Vite + TypeScript + Tailwind
│   └── src/
│       ├── app/            router, layout (header, menu)
│       ├── blocks/         ★ BLOCK REGISTRY — mỗi loại khối một thư mục (Edit + View)
│       ├── features/       theo tính năng: auth, categories, documents, editor, media, users
│       │   └── <tên>/      api.ts (gọi HTTP) · queries.ts (TanStack Query) · các trang/component
│       ├── components/     component dùng chung (ui/ = nút, ô nhập, hộp thoại...)
│       ├── i18n/           chữ giao diện vi / en / ja
│       ├── lib/            http.ts (nơi DUY NHẤT gọi fetch), types, tiện ích
│       └── index.css       ★ DESIGN TOKENS — toàn bộ màu sáng/tối
└── server/                 Express + SQL Server + TypeScript (Node chạy thẳng file .ts)
    ├── sql/                create-tables.sql (tạo bảng WebManual trong KVH) + setup-database.sql (cấp quyền cho app)
    └── src/
        ├── db/             kết nối SQL Server (pool.ts) + migrations/*.sql (app tự tạo/cập nhật bảng)
        ├── repositories/   ★ mọi câu SQL, mỗi bảng một file (users, categories, documents, media)
        ├── blocks/         luật dữ liệu từng loại khối (zod)
        ├── routes/         auth, users, categories, documents, media, upload-sessions, meta
        ├── services/       xử lý upload (thu nhỏ ảnh), lưu kèm phiên bản
        └── middleware/     đăng nhập (cookie JWT), xử lý lỗi tập trung
```

Quy tắc:
- Client: component → hook (`queries.ts`) → `api.ts` → `lib/http.ts`. Component không gọi `fetch`.
- Server: route → (service) → `repositories/*.ts` → `db/pool.ts`. Chỉ repository viết SQL; giá trị luôn truyền qua tham số `@ten`, không ghép chuỗi.

## Chạy khi phát triển

Cần: Node 24+, SQL Server (2019+) có các bảng WebManual (tạo bằng `server/sql/create-tables.sql`) + tài khoản app có quyền (`server/sql/setup-database.sql`).

```bash
cd server
npm install
npm run install-drawio    # một lần: tải draw.io về server/drawio (cho khối Sơ đồ)
npm run dev               # API :5000 — lần đầu tự tạo bảng
```

`server/.env` cần các biến: `JWT_SECRET`, `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (xem mẫu đầy đủ trong DEPLOY.md bước 3).

```bash
cd client
npm install
npm run dev               # giao diện :5173 (tự chuyển /api, /uploads, /drawio sang :5000)
```

Mở http://localhost:5173 → **Đăng nhập** → lần đầu sẽ được mời tạo tài khoản admin.

Test API: mở `server/requests.http` bằng extension REST Client của VS Code.

## Triển khai trong mạng nội bộ

**Hướng dẫn từng bước cho máy chủ Windows: xem [DEPLOY.md](DEPLOY.md)** (chuẩn bị SQL Server, cấu hình, chạy nền, cập nhật, sao lưu, chuyển dữ liệu từ MongoDB cũ). Các script nằm trong `deploy/`.

Production chỉ cần **một tiến trình** — server phục vụ luôn giao diện đã build. Trong `server/.env` nên đặt:

| Biến | Ví dụ | Ghi chú |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `http://192.168.1.20:5000` | Địa chỉ điện thoại / đồng nghiệp mở được (dùng trong mã QR, link chia sẻ). Để trống thì tự đoán theo IP LAN |
| `ALLOWED_EMAIL_DOMAINS` | `spclt.com.vn` | Đuôi email được tự đăng ký (nhiều đuôi: cách nhau dấu phẩy). Để trống = mọi email |
| `MAX_UPLOAD_MB` | `500` | Giới hạn mỗi file (video) |
| `UPLOAD_DIR` | `uploads` | Nơi lưu ảnh/video/file |
| `COOKIE_SECURE` | `false` | Chỉ `true` khi chạy HTTPS |

**Sao lưu:** cần sao lưu CẢ HAI — các bảng WebManual trong database `KVH` (lịch backup SQL Server của IT) và thư mục upload (`deploy/backup.ps1`).

**Quên mật khẩu admin:** chạy trên máy chủ `npm run reset-password -- <tên đăng nhập> <mật khẩu mới>`.

## Tài khoản

| Ai | Cách có tài khoản | Được làm gì |
| --- | --- | --- |
| Người xem | Không cần | Đọc tài liệu đã xuất bản, tìm kiếm, in |
| Editor | Tự **Đăng ký** (email công ty) → admin **duyệt**; hoặc admin tạo | Soạn, sửa, xóa tài liệu, upload |
| Admin | Tài khoản tạo ở lần chạy đầu; hoặc admin khác nâng quyền | Như editor + thể loại + tài khoản |

- Đăng ký xong tài khoản ở trạng thái **chờ duyệt**, chưa đăng nhập được. Admin thấy số người chờ (chấm đỏ trên avatar) → **Quản lý tài khoản** → chọn quyền → **Duyệt** hoặc **Từ chối**.
- Đăng nhập bằng **tên đăng nhập hoặc email**.
- App chưa gửi email (không xác thực email). Admin nên kiểm tra tên + email trước khi duyệt.

## Thêm một loại khối mới

1. `client/src/blocks/types.ts` — thêm kiểu props vào `BlockPropsMap`
2. `client/src/blocks/<tên>/` — tạo `Edit.tsx`, `View.tsx`, `index.ts` (copy từ khối giống nhất)
3. `client/src/blocks/registry.ts` — thêm một dòng
4. `server/src/blocks/schemas.ts` — thêm tên vào `BLOCK_TYPES` + schema zod
5. `client/src/i18n/vi.ts`, `en.ts`, `ja.ts` — thêm `blocks.<tên>.label` / `desc`

TypeScript báo lỗi nếu quên bước 1, 3, 4 hoặc 5. Menu "Thêm khối", trình soạn, trang đọc, mục lục tự nhận khối mới.

**Không phải sửa database**: mọi khối nằm chung trong cột JSON `Documents.Blocks`, nên thêm loại khối không cần migration.

## Đổi màu / thương hiệu

Sửa biến trong `client/src/index.css` (`:root` cho theme sáng, `.dark` cho theme tối). Màu nhấn là `--app-accent`. Tên app ở `app.name` trong `client/src/i18n/*.ts`.

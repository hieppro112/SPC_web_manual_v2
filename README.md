# KVH IT Docs

Web lưu tài liệu hướng dẫn / quy trình nội bộ. Chạy trong mạng nội bộ: **ai vào được mạng là đọc được** tài liệu đã xuất bản, **người đăng nhập** (editor/admin) mới được soạn.

- Soạn theo **khối** (form từng khối): tiêu đề mục, văn bản (Markdown), bước thực hiện tự đánh số, ảnh, video, hộp lưu ý, checklist, bảng, mã lệnh, file đính kèm, đường kẻ
- Ảnh/video: chọn từ máy, kéo thả, dán (Ctrl+V), thư viện media, dán URL, hoặc **quét QR chụp bằng điện thoại**
- Lịch sử phiên bản (xem + khôi phục), nháp / đã xuất bản
- Chia sẻ link + mã QR của tài liệu, link tới từng mục, in / xuất PDF
- Tìm kiếm không dấu trên toàn bộ nội dung
- Giao diện sáng / tối, tiếng Việt / English / 日本語

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
└── server/                 Express + MongoDB + TypeScript (Node chạy thẳng file .ts)
    └── src/
        ├── blocks/         luật dữ liệu từng loại khối (zod)
        ├── models/         User, Category, Document, DocumentVersion, Media, UploadSession
        ├── routes/         auth, users, categories, documents, media, upload-sessions, meta
        ├── services/       xử lý upload (thu nhỏ ảnh), lưu kèm phiên bản
        └── middleware/     đăng nhập (cookie JWT), xử lý lỗi tập trung
```

Quy tắc: component → hook (`queries.ts`) → `api.ts` → `lib/http.ts`. Component không gọi `fetch`.

## Chạy khi phát triển

Cần: Node 24+, MongoDB đang chạy.

```bash
cd server
cp .env.example .env      # rồi điền JWT_SECRET
npm install
npm run dev               # API :5000
```

```bash
cd client
npm install
npm run dev               # giao diện :5173 (tự chuyển /api, /uploads sang :5000)
```

Mở http://localhost:5173 → **Đăng nhập** → lần đầu sẽ được mời tạo tài khoản admin.

Test API: mở `server/requests.http` bằng extension REST Client của VS Code.

## Triển khai trong mạng nội bộ

Production chỉ cần **một tiến trình** — server phục vụ luôn giao diện đã build.

```bash
cd client && npm ci && npm run build      # tạo client/dist
cd ../server && npm ci
npm start                                  # http://<IP-máy-chủ>:5000
```

Trong `server/.env` nên đặt:

| Biến | Ví dụ | Ghi chú |
| --- | --- | --- |
| `PUBLIC_BASE_URL` | `http://192.168.1.20:5000` | Địa chỉ điện thoại / đồng nghiệp mở được (dùng trong mã QR, link chia sẻ). Để trống thì tự đoán theo IP LAN |
| `MAX_UPLOAD_MB` | `500` | Giới hạn mỗi file (video) |
| `UPLOAD_DIR` | `uploads` | Nơi lưu ảnh/video/file |
| `COOKIE_SECURE` | `false` | Chỉ `true` khi chạy HTTPS |

Để chạy nền và tự khởi động lại khi máy chủ reboot, dùng một trình quản lý tiến trình (vd `pm2` trên Linux, NSSM / Task Scheduler trên Windows) — chọn theo chính sách hạ tầng của công ty.

**Sao lưu:** cần sao lưu CẢ HAI — database (`mongodump`) và thư mục `server/uploads/`.

**Quên mật khẩu admin:** chạy trên máy chủ `npm run reset-password -- <tên đăng nhập> <mật khẩu mới>`.

## Thêm một loại khối mới

1. `client/src/blocks/types.ts` — thêm kiểu props vào `BlockPropsMap`
2. `client/src/blocks/<tên>/` — tạo `Edit.tsx`, `View.tsx`, `index.ts` (copy từ khối giống nhất)
3. `client/src/blocks/registry.ts` — thêm một dòng
4. `server/src/blocks/schemas.ts` — thêm tên vào `BLOCK_TYPES` + schema zod
5. `client/src/i18n/vi.ts`, `en.ts`, `ja.ts` — thêm `blocks.<tên>.label` / `desc`

TypeScript báo lỗi nếu quên bước 1, 3, 4 hoặc 5. Menu "Thêm khối", trình soạn, trang đọc, mục lục tự nhận khối mới.

## Đổi màu / thương hiệu

Sửa biến trong `client/src/index.css` (`:root` cho theme sáng, `.dark` cho theme tối). Màu nhấn là `--app-accent`. Tên app ở `app.name` trong `client/src/i18n/*.ts`.

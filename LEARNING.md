# Sổ tay Doc App v2

Ghi lại từng bước xây lại app, kèm đối chiếu Flutter (🔸). Bản cũ nằm ở `../vite_hiep_test` để so sánh.

## Lộ trình

- [x] **Bước 0** — Khung dự án: client (Vite + React + TS + Tailwind) và server (Express + TS)
- [ ] **Bước 1** — Backend: models + routes cho documents và categories
- [ ] **Bước 2** — Tầng `api/` + hook tự viết, hiện danh sách tài liệu
- [ ] **Bước 3** — React Router: Home / Detail / Editor
- [ ] **Bước 4** — Đăng nhập JWT + route bảo vệ
- [ ] **Bước 5** — Editor theo khối + quản lý thể loại (chốt tính năng thêm ở đây)
- [ ] **Bước 6** — Chatbot Dify
- [ ] **Bước 7** — Chuyển hook sang TanStack Query, hoàn thiện UI

## Cấu trúc

```
doc_app_v2/
├── client/            # React — chạy trong TRÌNH DUYỆT  (npm run dev → :5173)
│   ├── index.html     # trang HTML duy nhất, có <div id="root">
│   ├── vite.config.ts # plugin + proxy /api → :5000
│   └── src/
│       ├── main.tsx   # 🔸 main() { runApp() }
│       └── App.tsx    # component gốc
└── server/            # Express — chạy bằng NODE            (npm run dev → :5000)
    ├── .env           # bí mật thật, KHÔNG commit
    └── src/
        ├── config.ts  # nơi duy nhất đọc process.env
        └── index.ts   # lắp ráp app + nối DB
```

**Khác bản cũ:** client và server có `package.json` RIÊNG. Bản cũ gộp chung nên `express`, `mongoose`, `bcryptjs` nằm lẫn trong dependency của frontend.

## Bước 0 — những gì cần nhớ

### TypeScript = JavaScript + kiểu, giống Dart

| Dart | TypeScript |
| --- | --- |
| `String name` | `name: string` |
| `int`, `double` | `number` (chỉ một kiểu số) |
| `String?` | `string \| null` hoặc `name?: string` |
| `value!` | `value!` |
| `a ?? b` | `a ?? b` |
| `class User { final String id; }` | `type User = { id: string }` |
| `List<User>` | `User[]` |

Khác lớn nhất: **kiểu TS chỉ tồn tại lúc viết code**. Khi chạy, mọi khai báo kiểu bị xóa sạch, chỉ còn JavaScript. Vì vậy JSON từ server trả về sai kiểu thì TS không bắt được lúc chạy (Dart cũng vậy nếu bạn ép `as`).

### Hai thế giới: trình duyệt vs Node

Code trong `client/src` được tải về máy người dùng và **ai cũng đọc được** (F12). Code trong `server/` chạy trên máy chủ, người dùng không thấy. ⇒ Mọi bí mật (JWT secret, API key Dify) chỉ được nằm ở server.

### Proxy của Vite

Client chỉ gọi `/api/...`. Vite chuyển tiếp sang `:5000`. Không cần CORS, không phải nhớ URL backend ở client. Xem `client/vite.config.ts`.

### Chạy dự án (2 terminal)

```bash
cd server && npm run dev
cd client && npm run dev
```

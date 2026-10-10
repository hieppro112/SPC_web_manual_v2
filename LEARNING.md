# Sổ tay Doc App v2

Ghi lại từng bước xây lại app, kèm đối chiếu Flutter (🔸). Bản cũ nằm ở `../vite_hiep_test` để so sánh.

## Lộ trình

Lộ trình chỉnh lại ngày 2026-10-10 sau khi chốt yêu cầu: chạy trong mạng nội bộ, khách chỉ xem, editor đăng nhập để sửa; tài liệu quy trình có ảnh/video; ưu tiên ra sản phẩm nhanh.

- [x] **Bước 0** — Khung dự án: client (Vite + React + TS + Tailwind) và server (Express + TS)
- [x] **Bước 1** — Backend: models + routes cho documents và categories; khối dạng `props`, `slug`, `status`
- [ ] **Bước 2** — Khung client: Router + TanStack Query + shadcn/ui + theme sáng/tối + khung i18n
- [ ] **Bước 3** — Trang đọc cho khách: danh sách theo thể loại, chi tiết, mục lục, tìm kiếm
- [ ] **Bước 4** — Đăng nhập JWT, phân quyền editor/admin
- [ ] **Bước 5** — Block registry + editor + 5 khối đầu (heading, paragraph, image, callout, divider) + kéo thả
- [ ] **Bước 6** — Media: upload ảnh/video/file (multer + sharp)
- [ ] **Bước 7** — Các khối còn lại: table, code, checklist, step, video, file
- [ ] **Bước 8** — Quét QR bằng điện thoại để đưa ảnh vào khối
- [ ] **Bước 9** — Lịch sử phiên bản
- [ ] **Bước 10** — Chia sẻ (slug, link neo, QR tài liệu) + in PDF
- [ ] **Bước 11** — Chatbot Dify

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

## Bước 1 — Backend: model + route

### Luồng một request

```
POST /api/documents
  → express.json()           đọc body
  → documentsRouter.post()   lấy field, new Model, save()
      → pre('save')          tính desc
      → throw?               ─┐
  → res.json(doc)             │
  → errorHandler  ◀───────────┘  đổi lỗi thành { message } + mã HTTP
```

### 5 điều mới so với bản cũ

| Bản cũ | Bản mới | Vì sao |
| --- | --- | --- |
| try/catch trong mọi route | Chỉ `throw`, `errorHandler` lo hết | Express 5 tự bắt lỗi của hàm `async` |
| Lỗi khi `{ message }` khi `{ error }` | Luôn `{ message }` | Client chỉ đọc một chỗ |
| `category: "Mạng"` (tên) | `category: ObjectId` + `ref` + `.populate()` | Đổi tên thể loại không làm tài liệu mồ côi |
| `findByIdAndUpdate` | `findById` → `set` → `save` | `findByIdAndUpdate` bỏ qua hook và kiểm tra schema |
| Trả `_id`, `__v` | Trả `id` (xem `models/toJSON.ts`) | Không cần `getDocId()` đoán nữa |

### Bẫy `this`: `function` vs arrow

```ts
schema.pre('save', function () { this.desc = ... })  // ✅ this = tài liệu
schema.pre('save', () => { this.desc = ... })        // ❌ this = undefined
```

Arrow function không có `this` riêng, nó mượn `this` của chỗ bao quanh. Dart không có khác biệt này. Quy tắc: thư viện nào nói "`this` là ..." (hook Mongoose, một số API cũ) thì dùng `function`, còn lại dùng arrow.

### Khối = `{ id, type, props }`

```json
{ "id": "b3", "type": "callout", "props": { "variant": "danger", "text": "Không mở nắp khi máy chạy" } }
```

Bản cũ mỗi khối chỉ có `content: string` nên ảnh không có chỗ lưu chú thích, bảng không có chỗ lưu hàng/cột. `props` kiểu `Mixed` cho mỗi loại khối tự có dữ liệu riêng. 🔸 Flutter: như `Map<String, dynamic> props` rồi factory theo `type`.

Bẫy: Mongoose mặc định xóa object rỗng (`minimize`), nên `props: {}` của divider biến mất. `minimize: false` phải đặt ở **chính schema con** `blockSchema`.

### Slug và thứ tự hook

`"Quy trình bảo trì máy CNC"` → `quy-trinh-bao-tri-may-cnc` (xem `utils/slugify.ts`). Sinh một lần lúc tạo, đổi tiêu đề không đổi slug, nên link đã chia sẻ không gãy.

```
save() → pre('validate') → kiểm tra required/enum → pre('save') → ghi DB
          sinh slug ở đây                            tính desc ở đây
```

Slug phải sinh ở `pre('validate')`: nếu để ở `pre('save')` thì bước kiểm tra `required` chạy trước và báo thiếu slug.

### REST: id nằm trên URL

`PUT /api/categories/:id`, `DELETE /api/categories/:id`, không đặt id trong body. Request `DELETE` có body thì nhiều thư viện/proxy bỏ đi.

### Template string chỉ chạy với backtick

```ts
'Còn ${n} tài liệu'   // ❌ in nguyên chữ "${n}"
`Còn ${n} tài liệu`   // ✅ 🔸 Dart thì nháy nào cũng được: 'Còn $n tài liệu'
```

### Mã HTTP dùng trong dự án

`200` OK · `201` Đã tạo · `204` Xong, không có body · `400` Client gửi sai · `401` Chưa đăng nhập · `404` Không có · `409` Trùng · `500` Lỗi server

### Test API

Cài extension VS Code **REST Client**, mở `server/requests.http`, bấm "Send Request".

### Chạy dự án (2 terminal)

```bash
cd server && npm run dev
cd client && npm run dev
```

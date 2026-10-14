# Sổ tay Doc App v2

Ghi lại từng bước xây lại app, kèm đối chiếu Flutter (🔸). Bản cũ nằm ở `../vite_hiep_test` để so sánh.

## Lộ trình

Lộ trình chỉnh lại ngày 2026-10-10 sau khi chốt yêu cầu: chạy trong mạng nội bộ, khách chỉ xem, editor đăng nhập để sửa; tài liệu quy trình có ảnh/video; ưu tiên ra sản phẩm nhanh.

- [x] **Bước 0** — Khung dự án: client (Vite + React + TS + Tailwind) và server (Express + TS)
- [x] **Bước 1** — Backend: models + routes cho documents và categories; khối dạng `props`, `slug`, `status`
- [x] **Bước 2** — Khung client: Router + TanStack Query + UI dùng chung + theme sáng/tối + i18n vi/en/ja
- [x] **Bước 3** — Trang đọc cho khách: danh sách theo thể loại, chi tiết, mục lục, tìm kiếm
- [x] **Bước 4** — Đăng nhập JWT (cookie httpOnly), setup admin lần đầu, phân quyền editor/admin
- [x] **Bước 5** — Block registry + trình soạn + kéo thả
- [x] **Bước 6** — Media: upload ảnh/video/file (multer + sharp), thư viện media
- [x] **Bước 7** — Đủ 11 loại khối
- [x] **Bước 8** — Quét QR bằng điện thoại để đưa ảnh/video vào khối
- [x] **Bước 9** — Lịch sử phiên bản
- [x] **Bước 10** — Chia sẻ (slug, link neo, QR tài liệu) + in PDF
- [ ] **Bước 11** — Chatbot Dify

Từ bước 2, mentor tự xây toàn bộ theo yêu cầu (không còn bài tập). Cách chạy, triển khai, thêm khối mới: xem `README.md`.

## Cấu trúc

Xem sơ đồ đầy đủ trong `README.md`. Hai chỗ quan trọng nhất để đọc trước:

- `client/src/blocks/` — **block registry**. Mỗi loại khối là một thư mục `Edit.tsx` + `View.tsx` + `index.ts`. Trình soạn, trang đọc, menu "Thêm khối" đều tra `registry.ts`, không có `switch` theo type nào. 🔸 Flutter: `Map<String, WidgetBuilder>` chọn widget theo `type` trong JSON.
- `client/src/features/<tính năng>/` — mỗi tính năng tự chứa `api.ts` (gọi HTTP) + `queries.ts` (hook TanStack Query) + trang/component. Sửa phần nào thì mở đúng một thư mục.

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

## Bước 2–10 — những điều đáng nhớ ở client

### TanStack Query thay cho hook tự viết

| Việc | Hook | 🔸 Flutter |
| --- | --- | --- |
| Đọc (GET) | `useQuery({ queryKey, queryFn })` | FutureBuilder + cache dùng chung |
| Ghi (POST/PUT/DELETE) | `useMutation({ mutationFn, onSuccess })` | gọi Repository rồi `ref.invalidate` |
| Làm mới sau khi ghi | `queryClient.invalidateQueries({ queryKey: ['documents'] })` | `ref.invalidate(provider)` |
| Hỏi lại định kỳ (QR) | `refetchInterval: 2000` | `Stream.periodic` |

Query key có cấu trúc (`['documents', 'slug', slug]`) để làm mới theo nhóm.

### Trạng thái nằm trên URL

Bộ lọc thể loại, từ khóa tìm kiếm, trạng thái nằm ở `?category=&q=&status=` (dùng `useSearchParams`), không nằm trong `useState`. F5, nút Back, gửi link cho người khác đều giữ nguyên.

### Tài liệu dài vẫn mượt: `memo` + `useCallback`

`SortableBlockCard` bọc `memo`: gõ vào MỘT khối thì các khối khác không vẽ lại. Điều kiện: cha truyền callback ổn định (`useCallback` + `setDraft(prev => ...)`) và giá trị đơn giản (`stepNumber`), không truyền object mới mỗi lần vẽ.

### Bẫy "secure context" khi chạy mạng nội bộ qua http://

`crypto.randomUUID()` và `navigator.clipboard` chỉ có trên HTTPS hoặc `localhost`. Mở app qua `http://192.168.x.x` thì hai thứ này là `undefined`. Vì vậy `lib/utils.ts` có `newId()` và `copyText()` tự viết. Ngược lại, `<input type="file" capture>` (mở camera điện thoại) chạy được trên HTTP.

### Chặn rời trang khi chưa lưu

`useBlocker` (React Router) chặn chuyển trang trong app; `beforeunload` chặn đóng tab / F5. Xem `features/editor/useUnsavedGuard.ts`.

### `cn()` = nối class + gộp class xung đột

`cn('w-full', 'w-auto')` → `w-auto` nhờ `tailwind-merge`. Thiếu nó, component dùng chung có sẵn `w-full` thì nơi dùng không ghi đè được.

### Nhúng một app khác vào trang: `<iframe>` + `postMessage` (khối Sơ đồ)

draw.io là một web app riêng, chạy trong `<iframe>`. App của mình và draw.io không gọi thẳng hàm của nhau, chỉ gửi tin nhắn JSON qua `window.postMessage`. Bên nhận nghe sự kiện `message` và **luôn kiểm tra `e.source`** để chỉ tin tin nhắn từ đúng iframe đó. Xem `blocks/diagram/DrawioEditor.tsx`. 🔸 Flutter: giống `WebView` + `JavascriptChannel`.

Trình vẽ dùng `createPortal(..., document.body)` để phủ toàn màn hình. Nếu vẽ ngay trong khung khối thì `position: fixed` bị lệch, vì khung kéo-thả có `transform`.

### Thư viện nặng thì tải "lười": `React.lazy` + `<Suspense>` (khối Biểu đồ)

Recharts khá nặng (~120 KB nén). `blocks/chart/View.tsx` dùng `lazy(() => import('./ChartRenderer.tsx'))`. Vite tách file đó (cùng Recharts) thành một file JS riêng, và trình duyệt chỉ tải nó khi trang thật sự có biểu đồ. Trong lúc tải, `<Suspense fallback={...}>` hiện vòng quay. 🔸 Flutter: giống `import '...' deferred as charts;` rồi `await charts.loadLibrary()`.

Luật đi kèm: chỉ MỘT file được import `recharts` (`ChartRenderer.tsx`). Phần xử lý số liệu (`data.ts`) là hàm thuần, nên trình soạn dùng được mà không kéo theo thư viện chart.

### Trợ lý AI: RAG + stream (server/src/services/ai/, client/src/features/ai/)

- **RAG** (tìm rồi mới hỏi): AI không tự biết tài liệu của công ty. Trước mỗi câu hỏi, app tìm 6 đoạn tài liệu liên quan nhất rồi gửi kèm câu hỏi, và dặn AI "chỉ trả lời dựa trên các đoạn này, kèm link nguồn".
- **Tìm theo ý nghĩa bằng vector:** model *embedding* đổi mỗi đoạn chữ thành một dãy ~1000 số. Hai đoạn cùng ý thì hai dãy số "gần nhau" (độ giống cosine). Câu hỏi "cách thêm tool" vẫn tìm ra đoạn "Bước 3: Khai báo công cụ mới" dù không trùng chữ nào.
- **Stream:** server gửi câu trả lời thành nhiều dòng JSON (NDJSON). Client đọc bằng `res.body.getReader()` trong `lib/http.ts → postStream`, mỗi mẩu chữ tới là nối vào tin nhắn, nên chữ hiện ra dần. 🔸 Flutter: giống `StreamBuilder` nghe `http.Client().send()` theo từng chunk.
- **Dừng giữa chừng:** `AbortController`. Client hủy fetch, server thấy kết nối đóng (`res.on('close')`) nên hủy luôn request sang LM Studio, đỡ tốn GPU.

### Bài kiểm tra: bắt AI trả JSON đúng khuôn + chấm điểm ở server

- **Structured output:** gửi kèm một *JSON Schema* (`response_format: json_schema`). LM Studio/Ollama ép từng token AI viết ra phải khớp khuôn, nên kết quả luôn `JSON.parse` được. Server vẫn kiểm tra lại bằng zod (`services/quiz/types.ts`): bỏ câu trùng đáp án, sửa câu "nhiều đáp án" mà chỉ có 1 đáp án đúng thành "một đáp án".
- **Không lộ đáp án:** API `/take` chỉ gửi câu hỏi + đáp án **đã xáo**, không có `correct`. Nộp bài thì server chấm. Nếu chấm ở trình duyệt, người rành máy chỉ cần mở DevTools (tab Network) là thấy đáp án.
- **Đáp án có id riêng** (không dùng vị trí 0/1/2): xáo trộn thế nào cũng chấm đúng theo id. 🔸 Flutter: giống dùng `ValueKey(id)` thay vì index cho item trong list.

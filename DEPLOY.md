# Triển khai WebManual lên máy chủ Windows (mạng nội bộ)

Mô hình: **máy chủ app** chạy Node.js (cổng 5000, gồm cả giao diện). Dữ liệu nằm trên **SQL Server của công ty**. Ảnh/video nằm trên ổ đĩa máy chủ app. Code lấy về bằng **Git**.

```
Máy bạn ──git push──▶ GitLab/GitHub nội bộ ──git pull──▶ Máy chủ app 192.168.122.15
                                                          ├─ Node.js :5000 (app + giao diện)
                                                          └─ D:\kvh-it-docs-data\uploads (ảnh, video, file)
                                                                    │
                                                                    │ cổng 1433
                                                                    ▼
                                                       SQL Server công ty 192.168.122.2
                                                          └─ database KVH (bảng WebManual...)
Đồng nghiệp / điện thoại ──http://192.168.122.15:5000──▶ app
```

## Thông số

| | Giá trị |
| --- | --- |
| Máy chủ app (IP cố định) | `192.168.122.15` |
| Địa chỉ người dùng mở | **http://192.168.122.15:5000** |
| SQL Server | `192.168.122.2`, cổng `1433` — SQL Server 2022 Standard |
| Database | `KVH` (các bảng `WebManualUsers`, `WebManualDocuments`...) |
| Tài khoản SQL của app | `kvh_write` (mật khẩu chỉ nằm trong `server\.env`) |
| Thư mục code trên máy chủ (ví dụ) | `D:\Hiep\manual_web_2\SPC_web_manual_v2` |

> ⚠️ Một số bước cần **quyền Administrator** và đụng tới **tường lửa / Task Scheduler**. Máy công ty có Defender for Endpoint — **báo IT trước** hoặc nhờ IT làm các bước đó.
>
> 🔑 **Không gửi mật khẩu SQL / JWT_SECRET qua chat, email, hay commit vào Git.** Chỉ điền trực tiếp vào `server\.env` trên máy.

---

## Bước 0 — Trên máy của bạn: đẩy code lên Git

```powershell
cd D:\jobs\IT\pcx\REACT\NEWDEMO\hiep_test2\doc_app_v2
git switch main
git merge chuyen-sqlserver
git push
```

## Bước 1 — Chuẩn bị database trên SQL Server (một lần)

App dùng database **`KVH` có sẵn** của công ty; mọi bảng có tiền tố **`WebManual`** để không đụng bảng của hệ thống khác.

1. **Tạo bảng**: SSMS → kết nối `192.168.122.2` → New Query → dán toàn bộ **`server\sql\create-tables.sql`** → F5. Kết quả cuối phải liệt kê **7 bảng** `WebManual...` (schema `dbo`). Script tự dừng nếu không đứng đúng database `KVH` hoặc bảng đã có.
2. **Cấp quyền cho tài khoản app** (IT hoặc người có quyền db_owner): chạy **`server\sql\setup-database.sql`**. `kvh_write` chỉ được đọc/ghi **đúng 7 bảng WebManual**, không phải cả database KVH.
3. Login `kvh_write` do IT tạo (mật khẩu mạnh, không gửi qua chat/email).

Lưu ý: SQL Server phải bật **Mixed Mode** (đăng nhập bằng tài khoản SQL). Nếu đăng nhập `kvh_write` báo lỗi *"Login failed"* dù đúng mật khẩu → nhờ IT kiểm tra Mixed Mode.

## Bước 2 — Cài phần mềm trên máy chủ app

| Phần mềm | Ghi chú |
| --- | --- |
| **Node.js 24 LTS** (Windows x64 `.msi`) | Cài thư mục mặc định `C:\Program Files\nodejs`. |
| **Git for Windows** | Để `git clone` / `git pull`. |

**Không cần cài MongoDB hay SQL Server** trên máy chủ app.

Kiểm tra máy chủ app **thông được** tới SQL Server:

```powershell
node -v
Test-NetConnection 192.168.122.2 -Port 1433     # TcpTestSucceeded : True
```

`False` → tường lửa / mạng đang chặn từ 192.168.122.15 tới 192.168.122.2 cổng 1433 → nhờ IT mở.

## Bước 3 — Lấy code + tạo `server\.env`

```powershell
git clone <URL repo> D:\Hiep\manual_web_2\SPC_web_manual_v2   # nếu đã clone rồi: cd vào rồi git pull
cd D:\Hiep\manual_web_2\SPC_web_manual_v2
New-Item -ItemType Directory -Force D:\kvh-it-docs-data\uploads | Out-Null
```

Tạo file `.env` (chuỗi bí mật JWT tự sinh, không hiện ra màn hình):

```powershell
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
@"
PORT=5000
JWT_SECRET=$secret
DB_SERVER=192.168.122.2
DB_PORT=1433
DB_NAME=KVH
DB_USER=kvh_write
DB_PASSWORD=
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true
UPLOAD_DIR=D:\kvh-it-docs-data\uploads
MAX_UPLOAD_MB=500
PUBLIC_BASE_URL=http://192.168.122.15:5000
ALLOWED_EMAIL_DOMAINS=spclt.com.vn
COOKIE_SECURE=false
"@ | Out-File -FilePath server\.env -Encoding ascii
Remove-Variable secret
notepad server\.env
```

Notepad mở ra → điền mật khẩu SQL vào sau `DB_PASSWORD=` → **Ctrl + S** → đóng.

| Biến | Ý nghĩa |
| --- | --- |
| `DB_SERVER`, `DB_PORT`, `DB_NAME` | SQL Server và database |
| `DB_USER`, `DB_PASSWORD` | Tài khoản SQL đã tạo ở bước 1 |
| `DB_INSTANCE` | (tùy chọn) tên instance, vd `SQLEXPRESS` — chỉ dùng khi không kết nối bằng cổng |
| `DB_TRUST_SERVER_CERTIFICATE` | `true`: chấp nhận chứng chỉ tự ký của SQL Server nội bộ |
| `DB_AUTO_MIGRATE` | (tùy chọn) `false` = app **không bao giờ tự tạo / sửa bảng**; thiếu thay đổi nào thì báo chạy file `server\sql\00X_...sql` rồi dừng. Bảng / cột đã được tạo tay thì app tự nhận ra (dòng `-- @applied-if:` đầu mỗi file migration) và chỉ ghi dấu đã chạy |
| `PUBLIC_BASE_URL` | Địa chỉ in trong mã QR / link chia sẻ |
| `ALLOWED_EMAIL_DOMAINS` | Đuôi email được tự đăng ký |

## Bước 4 — Build

```powershell
.\deploy\update.ps1 -SkipPull
```

### Bước 4b — Cài draw.io (cho khối "Sơ đồ"), làm MỘT lần

Khối "Sơ đồ" mở draw.io **tự host trên chính máy chủ app** (máy người dùng không cần internet). Cài một lần, cập nhật code sau này không cần cài lại:

```powershell
cd server
npm run install-drawio
```

Máy chủ không ra được internet: trên máy khác tải `draw.war` (bản ghi trong `server/src/scripts/installDrawio.ts`, ~55 MB) từ https://github.com/jgraph/drawio/releases, chép sang máy chủ rồi chạy `npm run install-drawio -- D:\đường\dẫn\draw.war`.

Bản draw.io nằm ở `server\drawio` (không nằm trong git). Chưa cài thì app vẫn chạy bình thường, chỉ có nút vẽ sơ đồ bị khóa kèm hướng dẫn cài. Ảnh sơ đồ lưu ở `UPLOAD_DIR\diagrams`, được sao lưu chung với thư mục upload.

## Bước 5 — Chạy thử bằng tay

```powershell
cd server
npm start
```

Lần đầu sẽ thấy:

```
✅ Đã kết nối SQL Server (192.168.122.2/KVH)
🗂️  Đã chạy migration: 001_init.sql        ← app tự tạo các bảng
🚀 API chạy tại http://localhost:5000
```

Mở http://localhost:5000 trên máy chủ. Nếu **chuyển dữ liệu cũ từ MongoDB** (bước 5b) thì làm trước khi tạo admin.

### Bước 5b (tùy chọn) — Chuyển dữ liệu cũ từ MongoDB

Chạy **trên máy đang có MongoDB cũ** (máy phát triển của bạn), với `server\.env` trỏ tới SQL Server công ty như trên:

```powershell
cd D:\jobs\IT\pcx\REACT\NEWDEMO\hiep_test2\doc_app_v2\server
npm run migrate-from-mongo
```

Script chép tài khoản (giữ mật khẩu cũ), thể loại, tài liệu, lịch sử phiên bản, thông tin media; tự đổi các bài kiểu cũ sang dạng khối mới. Sau đó **chép thư mục `server\uploads\`** của máy bạn vào `D:\kvh-it-docs-data\uploads` trên máy chủ app.

### ⚠️ Tạo tài khoản admin NGAY

Nếu **không** chuyển dữ liệu cũ: lần đầu mở app, **ai vào trước sẽ tạo được tài khoản admin** → bấm **Đăng nhập** → tạo admin ngay trên máy chủ, **trước khi** mở tường lửa.
(Nếu đã chuyển dữ liệu cũ thì tài khoản admin cũ dùng được luôn.)

Xong thì `Ctrl + C` để tắt.

## Bước 6 — Mở tường lửa cổng 5000 (Admin / IT)

```powershell
New-NetFirewallRule -DisplayName "WebManual (5000)" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Domain,Private
```

## Bước 7 — Chạy nền, tự khởi động cùng Windows

PowerShell **Run as Administrator**:

```powershell
cd D:\Hiep\manual_web_2\SPC_web_manual_v2
.\deploy\install-task.ps1
```

Log: `logs\server.log` trong thư mục code.

## Bước 8 — Kiểm tra từ máy khác

```powershell
Test-NetConnection 192.168.122.15 -Port 5000
```

Rồi mở **http://192.168.122.15:5000**. Điện thoại (Wi-Fi công ty) mở cùng địa chỉ để dùng được tính năng quét QR chụp ảnh.

## Cập nhật lên bản có Bài kiểm tra (migration 003) — làm MỘT lần

Bản này thêm role **user** (chỉ đọc + làm bài) và 3 bảng bài kiểm tra. Tài khoản app `kvh_write` không có quyền sửa cấu trúc, nên:

1. **Trước khi** cập nhật code: mở SSMS bằng tài khoản quản trị → mở `server\sql\003_quiz.sql` → Execute. Kết quả cuối phải có: ràng buộc Role chứa `user`, 3 bảng `WebManualQuiz...`, quyền của `kvh_write` trên 3 bảng đó, 3 dòng đánh dấu `001`, `002`, `003`.
2. Cập nhật code như thường lệ (`git pull`, `npm ci` + build client, **`npm ci --omit=dev` bên server** vì có thư viện mới `exceljs`), restart.

Chưa chạy bước 1 mà đã chạy code mới thì app dừng ngay lúc khởi động và báo cần chạy script — không hỏng dữ liệu.

Tùy chọn trong `server\.env`:

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `QUIZ_GENERATE_PER_DAY` | `3` | Số lần tạo đề bằng AI / editor / ngày (admin không giới hạn) |
| `QUIZ_RESULT_DAYS` | `30` | Kết quả làm bài tự xóa sau số ngày này (dữ liệu đánh giá cá nhân) |

Tạo đề bằng AI cần bật trợ lý AI (bước 9). Không bật AI thì vẫn làm bài / sửa đề / xem điểm được, chỉ không có nút tạo đề tự động.

## Tạo đề bằng Claude qua hàng đợi (migration 004 + quiz-worker)

Editor bấm **Tạo bài kiểm tra → Gửi cho Claude** → yêu cầu vào bảng `WebManualQuizJobs`. Script **quiz-worker** chạy trên một máy có **Claude Code đã đăng nhập** (tài khoản Claude của công ty), cứ 5 phút hỏi hàng đợi; có việc thì gọi Claude (không công cụ, ép khuôn JSON) và gửi đề về → web lưu **đề nháp** + chấm đỏ báo editor.

**1. Database (một lần):** SSMS, tài khoản quản trị → chạy `server\sql\004_quiz_jobs.sql` (cần đã chạy 003). Phải thấy bảng `WebManualQuizJobs`, quyền của `kvh_write`, 4 dòng đánh dấu 001–004.

**2. Máy chủ app** — thêm vào `server\.env` rồi restart:

```
QUIZ_WORKER_TOKEN=<chuỗi ngẫu nhiên dài — tự tạo, KHÔNG gửi qua chat>
```

Tạo chuỗi ngẫu nhiên an toàn (PowerShell, dùng bộ sinh số ngẫu nhiên mật mã):

```powershell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

**3. Máy chạy Claude** (hiện là máy dev) — trong thư mục `server`:

- Chép `quiz-worker.env.example` thành `quiz-worker.env`, điền `WORKER_API_URL` (địa chỉ web) và `QUIZ_WORKER_TOKEN` (**giống hệt** máy chủ).
- Chạy thử: `npm run quiz-worker` → thấy `🚀 quiz-worker chạy...`.
- Chạy nền bằng **Tool Manager**: File chạy `C:\Program Files\nodejs\node.exe`, Tham số `--env-file=quiz-worker.env src\scripts\quizWorker.ts`, Thư mục làm việc `...\doc_app_v2\server`, bật tự chạy + tự chạy lại.

| Biến (`server\.env`) | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `QUIZ_WORKER_TOKEN` | (trống = tắt) | Khóa máy cho worker |
| `QUIZ_CLAUDE_JOBS_PER_DAY` | `10` | Yêu cầu gửi Claude / editor / ngày (admin không giới hạn) |
| `QUIZ_JOB_TIMEOUT_HOURS` | `48` | Quá giờ chưa xong → "Quá hạn", gợi ý dùng AI nội bộ |

Máy chạy Claude tắt thì yêu cầu nằm chờ, máy bật lại là worker làm tiếp. Mỗi đề dùng lượt của tài khoản Claude đã đăng nhập; đặt `CLAUDE_MODEL=haiku` trong `quiz-worker.env` để tiết kiệm hạn mức.

## Nhập bài từ PowerPoint (migration 005, dùng chung quiz-worker)

Editor/admin bấm **Nhập PowerPoint** trên thanh trên cùng → chọn file `.pptx` (≤ 50 MB, ≤ 100 slide), thể loại, ngôn ngữ. Web đọc ngay chữ / bảng / ảnh / ghi chú của từng slide (ảnh được nén WebP vào thư viện media, file gốc lưu làm đính kèm), rồi đưa yêu cầu vào bảng `WebManualImportJobs`. **Cùng script quiz-worker** ở trên nhận việc này: chia file thành từng nhóm ~10 slide, mỗi nhóm một lần gọi Claude → web tạo **một bài NHÁP** trong thể loại đã chọn + chấm đỏ trên nút **Nhập PowerPoint**. File 70 slide mất khoảng 5–7 phút.

**1. Database (một lần):** SSMS, tài khoản quản trị → chạy `server\sql\005_import_jobs.sql` (cần đã chạy 004). Phải thấy bảng `WebManualImportJobs`, quyền của `kvh_write`, dòng đánh dấu 005.

**2. Máy chủ app:** `git pull` → trong `server` chạy `npm ci --omit=dev` (thêm thư viện `fflate` đọc file .pptx) → build client → restart web **và** restart quiz-worker (bản worker mới mới biết hỏi hàng đợi nhập bài).

| Biến (`server\.env`) | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `IMPORT_MAX_MB` | `50` | Dung lượng tối đa file .pptx |
| `IMPORT_MAX_SLIDES` | `100` | Số slide tối đa (slide ẩn không tính) |
| `IMPORT_LEASE_MINUTES` | `120` | Worker nhận việc mà quá thời gian này chưa xong → worker khác được nhận lại |

Yêu cầu nhập cũng hết hạn sau `QUIZ_JOB_TIMEOUT_HOURS` nếu không máy nào xử lý. Giới hạn: SmartArt / hình vẽ chỉ giữ phần chữ; video, hiệu ứng không lấy; chữ lặp lại ở nhiều slide (chân trang, logo chữ) và ảnh lặp (logo) tự bỏ.

## Hướng dẫn sử dụng & thực hành (migration 006)

Nút **Hướng dẫn (?)** trên thanh trên cùng mở trang `/guide`: tour dẫn đường, nhiệm vụ thực hành tự chấm, bài hướng dẫn chi tiết (vi / en / ja). Lần đầu đăng nhập, tour giới thiệu tự chạy ở trang chủ.

**1. Database (một lần):** SSMS, tài khoản quản trị → chạy `server\sql\006_guide_progress.sql`. Phải thấy bảng `WebManualGuideProgress`, quyền của `kvh_write`, dòng đánh dấu 006. Chưa có bảng thì tour và bài hướng dẫn vẫn dùng được, chỉ phần nhiệm vụ báo "Chưa tạo bảng tiến độ".

**2. Máy chủ app:** `git pull` → build client → restart web (không có thư viện mới).

**3. Nạp nội dung (admin, một lần):** đăng nhập admin → **Hướng dẫn** → mục **Nạp bài hướng dẫn mẫu** → bấm nút. Web tạo thể loại *Hướng dẫn sử dụng*, **7 bài hướng dẫn tiếng Việt** và 3 bài ôn tập (vi / en / ja). Bản tiếng Anh / tiếng Nhật của bài hướng dẫn do tính năng dịch tự động tạo (mục 007 bên dưới). Bấm lại chỉ tạo phần còn thiếu; bài đã có (kể cả đã sửa) giữ nguyên. Muốn lấy lại bản gốc của một bài: xóa bài đó rồi bấm lại.

> **Bản cũ có 21 bài (en / ja viết tay):** xóa tay 14 bài `guide-en-...`, `guide-ja-...` và thể loại con *English*, *日本語*. Có thể chuyển 7 bài tiếng Việt lên thẳng *Hướng dẫn sử dụng* rồi xóa thể loại *Tiếng Việt*. Xong bấm **Nạp bài hướng dẫn mẫu** một lần để sửa link "Xem lại" của bài ôn tập en / ja về bài gốc. Bản en / ja cũ không bị máy dịch (đỡ tốn lượt) trong lúc chờ xóa.

Bài hướng dẫn nhận ra nhờ slug `guide-vi-...`, nên đổi tên hay chuyển thể loại vẫn hiện ở trang Hướng dẫn. Admin xem **Tiến độ của mọi người** ở cuối trang.

## Dịch tự động bài viết vi / en / ja (migration 007, dùng chung quiz-worker)

Mỗi lần lưu bài (cả bài nháp), web đưa bài vào hàng đợi dịch. **quiz-worker** nhờ Claude dịch sang **2 ngôn ngữ còn lại** (ngôn ngữ gốc tự nhận ra theo chữ viết). Bài gốc không bị đụng tới, bản dịch lưu ở bảng riêng.

- Người đọc mở bài: tự hiện bản theo **ngôn ngữ giao diện** đang chọn, có nút chuyển **Tiếng Việt | English | 日本語** và nút **Xem bản gốc**.
- Sửa một đoạn ở bài gốc: chỉ đoạn đó được dịch lại. Trong lúc chờ, đoạn đó tạm hiện chữ gốc.
- Editor bấm **Sửa bản dịch** để chỉnh câu dịch sai. Phần sửa tay được giữ cho tới khi đoạn đó ở bài gốc bị sửa. Nút **Dịch lại từ đầu** bỏ hết phần sửa tay.
- Tìm kiếm và trợ lý AI tìm được bằng chữ của bản dịch (người Nhật gõ tiếng Nhật vẫn ra bài tiếng Việt).
- **Tên nút** được dịch đúng chữ trên giao diện: web lấy chữ giao diện 3 ngôn ngữ (`client/src/i18n`) làm bảng thuật ngữ, gửi kèm lời dặn những tên nút có trong đoạn cần dịch (tên nút ghi trong ngoặc kép hoặc **in đậm**).
- Bài hướng dẫn en / ja viết tay của bản cũ (slug `guide-en-...`, `guide-ja-...`) không được dịch; hãy xóa chúng.

**1. Database — chạy TRƯỚC khi restart web:** SSMS, tài khoản quản trị → chạy `server\sql\007_translations.sql` (cần đã chạy 006). Phải thấy 2 bảng `WebManualDocTranslations`, `WebManualTranslationJobs`, quyền của `kvh_write`, dòng đánh dấu 007.
⚠️ Thiếu bảng thì **web không khởi động** (báo "Database còn thiếu thay đổi 007..."). Máy dev dùng chung database nên cũng vậy.

**2. Máy chủ app:** Stop WEB_MANUAL và QUIZ_WORKER → `git pull` → build client → Start lại cả hai (không có thư viện mới, không cần `npm ci`).

**3. Dịch bù bài cũ:** lúc khởi động, web tự đưa **mọi bài chưa có bản dịch** vào hàng đợi (ưu tiên thấp). Worker dịch dần, mỗi vòng 5 bài (`TRANSLATE_PER_ROUND` trong `quiz-worker.env`), rồi quay lại xem yêu cầu tạo đề / nhập PowerPoint trước, nên không ai phải chờ. Mỗi bài khoảng 2 lần gọi Claude (Haiku: ~30 giây / lần).
⚠️ Đợt dịch bù dùng khá nhiều hạn mức gói Team. Nên đặt `CLAUDE_MODEL=haiku` trong `quiz-worker.env`.

| Biến (`server\.env`) | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `TRANSLATE_ENABLED` | `true` | `false` = tắt hẳn dịch tự động (không thêm việc, ẩn nút chọn ngôn ngữ) |
| `TRANSLATE_MAX_CHARS` | `20000` | Mỗi lần gọi Claude dịch tối đa bấy nhiêu ký tự (bài dài chia nhiều phần) |
| `TRANSLATE_SWEEP_HOURS` | `6` | Bao lâu quét lại bài thiếu bản dịch (việc lỗi quá 24 giờ được thử lại) |
| `TRANSLATE_LEASE_MINUTES` | `60` | Worker nhận việc quá lâu không xong → cho nhận lại |

## Thời gian đọc tối thiểu + bài kiểm tra theo từng bài (migration 008)

- Trang đọc bài có nút **Bài kiểm tra**: mở danh sách đề **có bài này làm tài liệu nguồn** (`/quizzes?doc=<id>`). Khách bấm vào thì được mời đăng nhập.
- Editor đặt **Thời gian đọc tối thiểu (phút)** trong trình soạn (để trống = không bắt buộc). Tài khoản quyền **Người dùng** mở bài sẽ thấy đồng hồ ở góc trái dưới:
  - Chạy khi tab đang mở **và** vừa cuộn trang trong 20 giây. Bài ngắn không cuộn được thì chỉ cần mở trang.
  - Đứng khi 20 giây không cuộn hoặc chuyển tab.
  - Xong khi đủ thời gian **và** đã cuộn tới cuối bài. Lúc đó đồng hồ thành nút **Làm bài kiểm tra**.
- Chưa đọc xong thì **không làm được** bài ôn tập / kiểm tra tạo từ bài đó. Server chặn cả xem đề lẫn nộp bài. Đề tạo từ nhiều bài: đọc xong **một** bài có quy định là đủ.
- Tiến độ lưu theo **phiên bản bài**: bài được sửa và lưu thì mọi người đọc lại từ đầu.
- Server chỉ cộng tối đa bằng thời gian thật đã trôi qua, nên sửa đồng hồ ở trình duyệt cũng không "tua" được.
- Admin: menu tài khoản → **Báo cáo đọc tài liệu**: ai đã đọc xong / đang đọc / chưa đọc, xuất Excel.

**1. Database — chạy TRƯỚC khi restart web:** SSMS, tài khoản quản trị → chạy `server\sql\008_reading.sql`. Phải thấy 2 bảng `WebManualReadingRules`, `WebManualReadingProgress`, quyền của `kvh_write`, dòng đánh dấu 008. Thiếu bảng thì web không khởi động.

**2. Máy chủ app:** Stop WEB_MANUAL → `git pull` → build client → Start (không có thư viện mới).

## Phân quyền xem theo bộ phận (migration 009)

Chỉ bật khi đã cấu hình view nhân viên `COMPANY_EMPLOYEE_VIEW` trong `server\.env`. View có cột `Code` (mã nhân viên) và `Section` (bộ phận). Khi bật:

| Ai | Xem / đăng bài được ở đâu |
| --- | --- |
| Admin | Mọi thể loại |
| Tài khoản **chưa có mã nhân viên** (tài khoản cũ) | Mọi thể loại, như trước đây |
| Tài khoản có mã, bộ phận "PE IT" | Thể loại **cấp cao nhất tên đúng "PE IT"** + mọi thể loại con cháu, cộng các thể loại **dùng chung** + con cháu |
| Khách (chưa đăng nhập, gồm người quét QR) | Chỉ thể loại dùng chung. Mở bài khác thì được mời đăng nhập rồi quay lại đúng bài |

- **Dùng chung** = tick ô "Dùng chung" trong Quản lý thể loại, hoặc thể loại tên **Community**.
- Thể loại không trùng tên bộ phận nào và không dùng chung thì chỉ admin (và tài khoản cũ) thấy.
- Biên tập chỉ đăng / sửa / xóa bài, tạo đề, nhập PowerPoint **trong phạm vi của mình**.
- Lọc ở mọi nơi: trang chủ, cây thể loại, tìm kiếm, "cùng thể loại", đọc bài, bản dịch, thời gian đọc, trợ lý AI, bài kiểm tra (đề chỉ hiện khi **mọi** tài liệu nguồn đều xem được), trang Hướng dẫn.
- Bộ phận được tra từ view lúc đăng ký và **mỗi lần đăng nhập**. Chuyển bộ phận thì quyền đổi theo ở lần đăng nhập sau. Mã không còn trong view thì chỉ còn xem được thể loại dùng chung. View lỗi thì giữ bộ phận cũ, vẫn cho đăng nhập.
- Admin "gán bộ phận" cho tài khoản cũ: **Quản lý tài khoản** → bấm vào ô mã nhân viên → nhập mã → web tra ngay bộ phận. Xóa mã thì tài khoản lại xem được tất cả.

**1. Database — chạy TRƯỚC khi restart web:** SSMS, tài khoản quản trị → `server\sql\009_departments.sql` (thêm `Users.Department`, `Categories.IsShared`; `Users.EmployeeCode` nếu chưa có). Thiếu cột thì web không khởi động.

**2. Thể loại:** mỗi bộ phận một thể loại **cấp cao nhất** đặt **đúng tên** bộ phận trong view (vd `PE IT`). Tick **Dùng chung** cho *Community* (tên này tự được coi là dùng chung) và *Hướng dẫn sử dụng*. Nếu không tick, nhân viên các bộ phận sẽ không thấy bài hướng dẫn.

**3. Máy chủ app:** Stop WEB_MANUAL → `git pull` → build client → Start.

**Giới hạn:** file ảnh / video / file đính kèm (`/uploads/...`) vẫn mở được bằng link trực tiếp (không kiểm tra bộ phận); chỉ trang tài liệu chứa chúng bị ẩn. Thư viện media của biên tập vẫn thấy ảnh của mọi bộ phận.

## Lượt xem 👁 + thả tim ❤ (migration 010)

- **Lượt xem:** mỗi người tính tối đa **1 lượt / bài / ngày**, kể cả editor, admin và khách.
  - Tài khoản đăng nhập được nhận theo tài khoản.
  - Khách được nhận theo IP + trình duyệt, nên chỉ gần đúng: nhiều máy dùng chung một IP và cùng loại trình duyệt sẽ bị tính là một người.
- **Tim:** chỉ người đã đăng nhập thả được; bấm lần nữa để bỏ tim. Không hiện danh sách ai đã thả tim.
- Số lượt xem và số tim hiện cho mọi người, ở thẻ bài trang chủ và trang đọc. Trang chủ có thêm ô **Sắp xếp**: Mới cập nhật / Xem nhiều nhất / Được thích nhiều nhất.
- Sửa bài vẫn giữ nguyên số liệu. Xóa bài thì số liệu của bài đó mất theo.
- Menu tài khoản:
  - **Bài tôi yêu thích**: các bài đã thả tim, cho mọi tài khoản.
  - **Thống kê tài liệu**: chỉ admin. Chọn khoảng ngày (mặc định 30 ngày) để xem lượt xem, số người xem, tim trong kỳ và tổng tim của từng bài; xuất được Excel.

**1. Database — chạy TRƯỚC khi restart web:** SSMS, tài khoản quản trị → chạy `server\sql\010_engagement.sql`. Kết quả đúng: có 2 bảng `WebManualDocViews` và `WebManualDocLikes`, `kvh_write` có quyền trên 2 bảng, và có dòng đánh dấu 010. Thiếu bảng thì web không khởi động.

**2. Máy chủ app:** Stop WEB_MANUAL → `git pull` → build client → Start. Không cần cài thư viện mới.

## Bước 9 (tùy chọn) — Trợ lý AI chạy local

Nút 💬 ở góc màn hình: hỏi đáp trên toàn bộ tài liệu, hỏi về bài đang đọc, tóm tắt bài. App tự tìm đoạn tài liệu liên quan (RAG), phần mềm AI chỉ việc trả lời. Không bật thì nút 💬 tự ẩn, app chạy bình thường.

**1. Trong LM Studio (cùng máy với app):**

- Tải và **nạp (Load)** một model trả lời, vd `qwen3.5-9b`. Khi nạp, đặt **Context Length ≥ 16384** (bằng `AI_NUM_CTX` bên dưới). Model Qwen có tùy chọn "thinking" thì nên tắt để trả lời nhanh hơn.
- Tải thêm một model **embedding** đọc tốt tiếng Việt/Nhật: tìm `bge-m3` (bản GGUF).
- Tab **Developer** → bật server (Status: **Running**), cổng `1234`.
- Lấy **tên chính xác** của 2 model: mở http://localhost:1234/v1/models trên máy chủ, copy giá trị `"id"`.

GPU dùng chung: model nào đang nạp sẵn trong LM Studio thì dùng luôn model đó cho app là tiết kiệm VRAM nhất.

**2. Thêm vào `server\.env`:**

```
AI_API=openai
AI_BASE_URL=http://localhost:1234
AI_CHAT_MODEL=<id model trả lời, lấy từ /v1/models>
AI_EMBED_MODEL=<id model bge-m3, lấy từ /v1/models>
AI_NUM_CTX=16384
AI_GUEST_LIMIT_PER_HOUR=10
AI_DATA_DIR=D:\kvh-it-docs-data\ai-data
AI_LOG_DAYS=7
```

Restart app (Tool Manager). Log sẽ có `🤖 AI (openai): ...` rồi `🤖 AI: cập nhật chỉ mục N tài liệu`.

| Biến | Ý nghĩa |
| --- | --- |
| `AI_API` | `openai` = LM Studio (và mọi phần mềm theo chuẩn OpenAI); `ollama` = dùng Ollama (`AI_BASE_URL=http://localhost:11434`) |
| `AI_NUM_CTX` | Độ dài ngữ cảnh. Với LM Studio phải ≤ Context Length đã đặt khi nạp model |
| `AI_GUEST_LIMIT_PER_HOUR` | Số câu hỏi / giờ / máy cho khách chưa đăng nhập (người đăng nhập không giới hạn) |
| `AI_DATA_DIR` | Chỉ mục tìm kiếm (`index.json`, xóa được, tự tạo lại) + log hỏi đáp (`logs\`, tự xóa sau `AI_LOG_DAYS` ngày) |
| `AI_EMBED_API`, `AI_EMBED_BASE_URL` | (tùy chọn) model embedding chạy ở phần mềm khác. Vd LM Studio không tải được `bge-m3` (mạng chặn Hugging Face) thì tải bằng Ollama (`ollama pull bge-m3`) và đặt `AI_EMBED_API=ollama`, `AI_EMBED_BASE_URL=http://localhost:11434`, `AI_EMBED_MODEL=bge-m3`. Để trống = dùng chung `AI_API` / `AI_BASE_URL` |
| `AI_API_KEY` | (tùy chọn) chỉ khi LM Studio bật yêu cầu xác thực |
| `AI_EXPORT_KEY` | (tùy chọn) bật `GET /api/ai/documents` cho công cụ AI khác đọc tài liệu dạng Markdown (gửi header `x-api-key`). Tự tạo chuỗi ngẫu nhiên dài, **không gửi qua chat** |

Log hỏi đáp có IP, tên đăng nhập và nội dung câu hỏi → chỉ giữ 7 ngày, không đưa vào sao lưu.

---

## Cập nhật phiên bản mới

1. Máy bạn: commit → `git push`
2. Máy chủ (PowerShell Run as Administrator): `.\deploy\update.ps1`

Nếu bản mới có thay đổi cấu trúc bảng (file `server/src/db/migrations/00X_...sql` mới), app **tự áp dụng** khi khởi động lại.

## Sao lưu

| Dữ liệu | Nằm ở | Cách sao lưu |
| --- | --- | --- |
| Tài liệu, tài khoản, lịch sử | Các bảng `WebManual...` trong database `KVH` (192.168.122.2) | Nằm trong lịch **backup database KVH** của IT — nhờ IT xác nhận |
| Ảnh, video, file | `D:\kvh-it-docs-data\uploads` trên máy chủ app | `.\deploy\backup.ps1` (hẹn giờ hằng ngày) |

```powershell
.\deploy\backup.ps1 -UploadDir D:\kvh-it-docs-data\uploads -BackupRoot E:\kvh-it-docs-backup
```

Hẹn giờ: **Task Scheduler** → *Create Basic Task* → Daily 02:00 → *Start a program*:
`powershell.exe` với Arguments `-File <thư mục code>\deploy\backup.ps1 -UploadDir D:\kvh-it-docs-data\uploads -BackupRoot E:\kvh-it-docs-backup`

## Lệnh hay dùng

| Việc | Lệnh |
| --- | --- |
| Xem log | `Get-Content logs\server.log -Tail 50` |
| Tắt / bật app | `Stop-ScheduledTask KVH-IT-Docs` / `Start-ScheduledTask KVH-IT-Docs` |
| Kiểm tra | mở `http://localhost:5000/api/health` → `"db":"connected"` |
| Quên mật khẩu admin | `cd server; npm run reset-password -- <tên đăng nhập> <mật khẩu mới>` |

## Sự cố thường gặp

| Hiện tượng (trong log) | Cách xử lý |
| --- | --- |
| `Thiếu biến môi trường DB_PASSWORD` | Chưa điền mật khẩu trong `server\.env` |
| `Login failed for user 'kvh_write'` | Sai mật khẩu, hoặc SQL Server chưa bật Mixed Mode (hỏi IT) |
| `Failed to connect ... 1433` / timeout | Máy chủ app không thông tới 192.168.122.2:1433 → `Test-NetConnection`, nhờ IT mở |
| `self signed certificate` / lỗi chứng chỉ | Đặt `DB_TRUST_SERVER_CERTIFICATE=true` |
| `The SELECT permission was denied on the object 'WebManual...'` | Chưa chạy `setup-database.sql` (bước 1) |
| `Invalid object name 'WebManual...'` | Chưa chạy `create-tables.sql`, hoặc `DB_NAME` trong `.env` không phải `KVH` |
| `EADDRINUSE` | Cổng 5000 bị chương trình khác dùng |
| Máy khác không vào được | Tường lửa cổng 5000 (bước 6) |

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
| `PUBLIC_BASE_URL` | Địa chỉ in trong mã QR / link chia sẻ |
| `ALLOWED_EMAIL_DOMAINS` | Đuôi email được tự đăng ký |

## Bước 4 — Build

```powershell
.\deploy\update.ps1 -SkipPull
```

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

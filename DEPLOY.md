# Triển khai KVH IT Docs lên máy chủ Windows (mạng nội bộ)

Mô hình: **một máy chủ Windows** chạy cả app (Node.js, cổng 5000) và MongoDB. Code lấy về bằng **Git**. App tự chạy nền và tự bật lại khi máy chủ khởi động.

```
Máy bạn ──git push──▶ GitLab/GitHub nội bộ ──git pull──▶ Máy chủ Windows
                                                          ├─ Node.js  :5000  (app + giao diện)
                                                          ├─ MongoDB  :27017 (chỉ nội bộ máy)
                                                          └─ D:\kvh-it-docs-data\uploads (ảnh, video)
Đồng nghiệp / điện thoại ──http://<IP-máy-chủ>:5000──▶ app
```

## Thông số máy chủ của công ty

| | Giá trị |
| --- | --- |
| IP máy chủ (cố định) | `192.168.122.15` |
| Địa chỉ người dùng mở | **http://192.168.122.15:5000** |
| `PUBLIC_BASE_URL` trong `.env` | `http://192.168.122.15:5000` |
| Cổng | 5000 (đã kiểm tra còn trống) |

> ⚠️ Một số bước cần **quyền Administrator** trên máy chủ và đụng tới **tường lửa / Task Scheduler**. Máy công ty có Defender for Endpoint, việc tạo tác vụ nền có thể bị cảnh báo. **Báo bộ phận IT trước**, hoặc nhờ IT thực hiện các bước đó.

---

## Bước 0 — Trên máy của bạn: đẩy code lên Git

```powershell
cd D:\jobs\IT\pcx\REACT\NEWDEMO\hiep_test2\doc_app_v2
git switch master
git merge xay-dung-app
git remote add origin <URL repo trên GitLab/GitHub nội bộ>
git push -u origin master
```

File `.env`, thư mục `uploads/`, `logs/`, `node_modules/`, `dist/` **không** bị đẩy lên (đã có trong `.gitignore`).

## Bước 1 — Cài phần mềm trên máy chủ

| Phần mềm | Ghi chú |
| --- | --- |
| **Node.js 24 LTS** (bản Windows x64 `.msi`) | Cài vào thư mục mặc định `C:\Program Files\nodejs`. App cần Node **24 trở lên**. |
| **Git for Windows** | Để `git clone` / `git pull`. |
| **MongoDB Community Server** (`.msi`) | Chọn **"Install MongoD as a Service"**. Nên đặt thư mục dữ liệu ở ổ D: (vd `D:\MongoDB\data`). Giữ mặc định chỉ nghe `127.0.0.1` — **không** mở cổng 27017 ra mạng. |
| **MongoDB Database Tools** | Có `mongodump`/`mongorestore` để sao lưu. |

Tải từ trang chính thức của từng phần mềm (hoặc kho phần mềm nội bộ nếu công ty có). Kiểm tra sau khi cài, mở PowerShell mới:

```powershell
node -v      # v24.x
git --version
Get-Service MongoDB   # Status: Running
```

## Bước 2 — Lấy code về máy chủ

```powershell
git clone <URL repo> C:\apps\kvh-it-docs
cd C:\apps\kvh-it-docs
```

Nếu repo cần đăng nhập: dùng tài khoản/token **chỉ đọc** theo quy định của công ty. Không dán mật khẩu, token vào file trong repo.

## Bước 3 — Tạo file cấu hình `server\.env`

Tạo thư mục dữ liệu trước:

```powershell
New-Item -ItemType Directory -Force D:\kvh-it-docs-data\uploads
```

Tạo chuỗi bí mật cho JWT (chạy rồi copy kết quả):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Tạo file `C:\apps\kvh-it-docs\server\.env` với nội dung (thay các giá trị trong `< >`):

```ini
PORT=5000
MONGO_URI=mongodb://localhost:27017/doc_app_v2
JWT_SECRET=<chuỗi vừa tạo ở trên>
UPLOAD_DIR=D:\kvh-it-docs-data\uploads
MAX_UPLOAD_MB=500
PUBLIC_BASE_URL=http://192.168.122.15:5000
ALLOWED_EMAIL_DOMAINS=spclt.com.vn
COOKIE_SECURE=false
```

- `PUBLIC_BASE_URL`: địa chỉ mà **đồng nghiệp và điện thoại** gõ vào trình duyệt (dùng cho mã QR, link chia sẻ). Xem IP máy chủ bằng `ipconfig`. Nên xin IT một **IP cố định** hoặc **tên máy** (DNS nội bộ).
- `.env` chứa bí mật: **không** commit, **không** gửi qua chat/email.

## Bước 4 — Build lần đầu

```powershell
cd C:\apps\kvh-it-docs
.\deploy\update.ps1 -SkipPull
```

Script cài thư viện, build giao diện, cài thư viện server. Lần đầu chưa có tác vụ nền nên chỉ build.

> Nếu PowerShell báo không cho chạy script: **hỏi IT** về Execution Policy. Đừng tự tắt chính sách bảo mật.

## Bước 5 — Chạy thử bằng tay

```powershell
cd C:\apps\kvh-it-docs\server
npm start
```

Mở trình duyệt **ngay trên máy chủ**: http://localhost:5000 → thấy trang chủ là chạy được. Kiểm tra http://localhost:5000/api/health phải có `"db":"connected"`.

### ⚠️ Tạo tài khoản admin NGAY lúc này

Lần đầu mở app, **ai vào trước sẽ được tạo tài khoản admin**. Vì vậy hãy bấm **Đăng nhập** → tạo admin ngay trên máy chủ, **trước khi** mở tường lửa và gửi link cho mọi người.

Xong thì nhấn `Ctrl + C` để tắt.

## Bước 6 — Mở tường lửa cho mạng nội bộ (cần quyền Admin / IT)

Cho phép máy khác trong mạng nội bộ vào cổng 5000:

```powershell
New-NetFirewallRule -DisplayName "KVH IT Docs (5000)" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Domain,Private
```

Chỉ mở cho profile **Domain/Private** (mạng công ty), không mở cho Public.

## Bước 7 — Cho app chạy nền, tự khởi động cùng Windows

PowerShell **Run as Administrator**:

```powershell
cd C:\apps\kvh-it-docs
.\deploy\install-task.ps1
```

Script tạo tác vụ `KVH-IT-Docs` trong Task Scheduler: chạy khi máy chủ bật (không cần ai đăng nhập), tự chạy lại sau 1 phút nếu bị tắt bất thường. Log nằm ở `C:\apps\kvh-it-docs\logs\server.log`.

## Bước 8 — Kiểm tra từ máy khác

- Từ máy tính khác: mở `http://<IP-máy-chủ>:5000`
- Từ điện thoại (Wi-Fi công ty): mở cùng địa chỉ. Nếu không vào được, có thể Wi-Fi bị tách mạng với máy chủ → hỏi IT (tính năng **quét QR chụp ảnh** cần điện thoại vào được máy chủ).
- Thử: đăng ký một tài khoản → admin duyệt → đăng nhập → tạo tài liệu có ảnh.

---

## Cập nhật phiên bản mới

1. Trên máy bạn: sửa code → commit → `git push`
2. Trên máy chủ (PowerShell Run as Administrator):

```powershell
cd C:\apps\kvh-it-docs
.\deploy\update.ps1
```

Script tự `git pull` → build → khởi động lại → kiểm tra `/api/health`. Người dùng chỉ bị gián đoạn vài giây.

## Sao lưu (nên làm hằng ngày)

Phải sao lưu **cả database lẫn thư mục upload**:

```powershell
.\deploy\backup.ps1 -UploadDir D:\kvh-it-docs-data\uploads -BackupRoot E:\kvh-it-docs-backup
```

Nên để `BackupRoot` ở **ổ khác / máy khác** (ổ mạng), không cùng ổ với dữ liệu. Bản cũ hơn 14 ngày tự xóa.

Hẹn giờ hằng ngày: mở **Task Scheduler** → *Create Basic Task* → Daily, 02:00 → *Start a program*:
- Program: `powershell.exe`
- Arguments: `-File C:\apps\kvh-it-docs\deploy\backup.ps1 -UploadDir D:\kvh-it-docs-data\uploads -BackupRoot E:\kvh-it-docs-backup`

**Khôi phục**: `mongorestore --uri=mongodb://localhost:27017/doc_app_v2 --drop <thư mục backup>\db\doc_app_v2`, rồi chép lại thư mục `uploads\` về `UPLOAD_DIR`. Nên thử khôi phục một lần để chắc bản sao lưu dùng được.

## Lệnh hay dùng

| Việc | Lệnh |
| --- | --- |
| Xem log | `Get-Content C:\apps\kvh-it-docs\logs\server.log -Tail 50` |
| Tắt / bật app | `Stop-ScheduledTask KVH-IT-Docs` / `Start-ScheduledTask KVH-IT-Docs` |
| Trạng thái app | `Get-ScheduledTask KVH-IT-Docs` và mở `http://localhost:5000/api/health` |
| Quên mật khẩu admin | `cd server; npm run reset-password -- <tên đăng nhập> <mật khẩu mới>` |
| Gỡ tác vụ nền | `Unregister-ScheduledTask -TaskName KVH-IT-Docs` |

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
| --- | --- |
| Log có `EADDRINUSE` | Cổng 5000 đang bị chương trình khác dùng → đổi `PORT` trong `.env` (nhớ sửa luôn tường lửa + `PUBLIC_BASE_URL`). |
| Log có `Không kết nối được MongoDB` | Dịch vụ MongoDB chưa chạy: `Start-Service MongoDB`. |
| Máy chủ mở được, máy khác không | Tường lửa (bước 6), hoặc sai IP. |
| Điện thoại quét QR không mở được | Điện thoại không cùng mạng với máy chủ, hoặc `PUBLIC_BASE_URL` sai. |
| Đăng nhập xong lại bị đăng xuất | `COOKIE_SECURE=true` trong khi đang chạy `http://` → đặt `false`. |
| Upload video lớn bị lỗi "File quá lớn" | Tăng `MAX_UPLOAD_MB` rồi khởi động lại app. |

## Về sau (không bắt buộc)

- **HTTPS**: đặt app sau IIS (URL Rewrite + ARR) hoặc reverse proxy mà IT đang dùng, có chứng chỉ nội bộ; khi đó đặt `COOKIE_SECURE=true`.
- **Bỏ `:5000` khỏi địa chỉ**: dùng reverse proxy ở cổng 80/443, hoặc đặt `PORT=80` nếu máy chủ không chạy web server nào khác.

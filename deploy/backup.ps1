# ============================================================
# backup.ps1 - Sao luu database + file upload
# ============================================================
# Can sao luu CA HAI: MongoDB (noi dung tai lieu) va thu muc upload (anh,
# video, file). Thieu mot trong hai la khoi phuc khong day du.
#
#   .\deploy\backup.ps1 -UploadDir D:\kvh-it-docs-data\uploads
#
# Moi lan chay tao thu muc <BackupRoot>\<ngay-gio>\ gom db\ va uploads\,
# xoa cac ban cu hon KeepDays ngay. Nen hen gio chay hang ngay bang
# Task Scheduler (xem DEPLOY.md).
#
# Khoi phuc database:  mongorestore --uri=<MongoUri> --drop <thu muc db\doc_app_v2>
# Khoi phuc file:      chep thu muc uploads\ ve lai UPLOAD_DIR

param(
  [Parameter(Mandatory = $true)][string]$UploadDir,
  [string]$BackupRoot = 'D:\kvh-it-docs-backup',
  [string]$MongoUri = 'mongodb://localhost:27017/doc_app_v2',
  [int]$KeepDays = 14,
  # mongodump nam trong goi "MongoDB Database Tools", mac dinh KHONG co trong PATH.
  [string]$Mongodump = 'C:\Program Files\MongoDB\Tools\100\bin\mongodump.exe'
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Mongodump)) { throw "Khong thay mongodump: $Mongodump (cai MongoDB Database Tools)" }
if (-not (Test-Path $UploadDir)) { throw "Khong thay thu muc upload: $UploadDir" }

$dest = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmm')
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "==> Sao luu database -> $dest\db" -ForegroundColor Cyan
& $Mongodump "--uri=$MongoUri" "--out=$dest\db" --quiet
if ($LASTEXITCODE -ne 0) { throw 'mongodump that bai' }

Write-Host "==> Sao luu file upload -> $dest\uploads" -ForegroundColor Cyan
robocopy $UploadDir "$dest\uploads" /E /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy: ma 0-7 la thanh cong, tu 8 tro len moi la loi.
if ($LASTEXITCODE -ge 8) { throw "robocopy that bai (ma $LASTEXITCODE)" }

Write-Host "==> Xoa ban sao luu cu hon $KeepDays ngay" -ForegroundColor Cyan
Get-ChildItem $BackupRoot -Directory |
  Where-Object { $_.Name -match '^\d{8}-\d{4}$' -and $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Recurse -Force

Write-Host "Xong: $dest" -ForegroundColor Green

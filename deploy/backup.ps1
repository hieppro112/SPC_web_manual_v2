# ============================================================
# backup.ps1 - Sao luu thu muc upload (anh, video, file dinh kem)
# ============================================================
# Database WebManual nam tren SQL Server cong ty (192.168.122.2) va duoc
# sao luu theo lich backup SQL Server cua IT - script nay KHONG dong vao DB.
#
#   .\deploy\backup.ps1 -UploadDir D:\kvh-it-docs-data\uploads -BackupRoot E:\kvh-it-docs-backup
#
# Moi lan chay tao thu muc <BackupRoot>\<ngay-gio>\uploads\, xoa cac ban
# cu hon KeepDays ngay. Nen hen gio chay hang ngay bang Task Scheduler.
#
# Khoi phuc: chep thu muc uploads\ cua ban sao luu ve lai UPLOAD_DIR.

param(
  [Parameter(Mandatory = $true)][string]$UploadDir,
  [string]$BackupRoot = 'D:\kvh-it-docs-backup',
  [int]$KeepDays = 14
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $UploadDir)) { throw "Khong thay thu muc upload: $UploadDir" }

$dest = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmm')
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "==> Sao luu file upload -> $dest\uploads" -ForegroundColor Cyan
robocopy $UploadDir "$dest\uploads" /E /NFL /NDL /NJH /NJS /NP | Out-Null
# robocopy: ma 0-7 la thanh cong, tu 8 tro len moi la loi.
if ($LASTEXITCODE -ge 8) { throw "robocopy that bai (ma $LASTEXITCODE)" }

Write-Host "==> Xoa ban sao luu cu hon $KeepDays ngay" -ForegroundColor Cyan
Get-ChildItem $BackupRoot -Directory |
  Where-Object { $_.Name -match '^\d{8}-\d{4}$' -and $_.CreationTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item -Recurse -Force

Write-Host "Xong: $dest" -ForegroundColor Green

# ============================================================
# install-task.ps1 - Dang ky app chay nen, tu khoi dong cung Windows
# ============================================================
# Chay MOT LAN tren may chu, trong PowerShell "Run as Administrator":
#   .\deploy\install-task.ps1
#
# Tao mot tac vu trong Task Scheduler:
#   - chay deploy\start.cmd khi may chu khoi dong (khong can ai dang nhap)
#   - tu chay lai sau 1 phut neu server bi tat bat thuong
# Go bo: Unregister-ScheduledTask -TaskName KVH-IT-Docs
#
# Luu y: Windows Defender / EDR co the canh bao khi tao Scheduled Task.
# Hay bao bo phan IT truoc khi chay script nay.

param(
  [string]$TaskName = 'KVH-IT-Docs'
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$startCmd = Join-Path $PSScriptRoot 'start.cmd'

if (-not (Test-Path (Join-Path $root 'server\.env'))) {
  throw 'Chua co file server\.env - xem DEPLOY.md buoc 3'
}
if (-not (Test-Path (Join-Path $root 'client\dist\index.html'))) {
  throw 'Chua build giao dien - chay .\deploy\update.ps1 truoc'
}
if (-not (Test-Path "$env:ProgramFiles\nodejs\node.exe")) {
  throw "Khong thay Node.js tai $env:ProgramFiles\nodejs - cai Node.js 24 LTS ban mac dinh"
}

$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$startCmd`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
# SYSTEM: chay ca khi khong ai dang nhap. Neu IT yeu cau tai khoan dich vu
# rieng, doi -UserId va cap quyen ghi cho thu muc logs + UPLOAD_DIR.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Description 'KVH IT Docs - web tai lieu noi bo' -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Da dang ky va khoi dong tac vu '$TaskName'." -ForegroundColor Green
Write-Host 'Kiem tra: mo http://localhost:5000/api/health (doi khoang 5 giay).'

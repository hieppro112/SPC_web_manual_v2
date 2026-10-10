# ============================================================
# update.ps1 - Lay code moi tu Git, build, khoi dong lai app
# ============================================================
# Chay tren may chu (PowerShell "Run as Administrator"):
#   .\deploy\update.ps1              lay code moi + build + khoi dong lai
#   .\deploy\update.ps1 -SkipPull    chi build lai (vd lan cai dat dau tien)
#
# Lan dau (chua co tac vu nen) script chi build, khong khoi dong lai.

param(
  [string]$TaskName = 'KVH-IT-Docs',
  [int]$Port = 5000,
  [switch]$SkipPull
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Chay mot lenh ngoai (git/npm); loi thi dung ngay, khong chay tiep buoc sau.
function Invoke-Step([string]$Title, [string]$Dir, [scriptblock]$Command) {
  Write-Host "==> $Title" -ForegroundColor Cyan
  Push-Location $Dir
  try {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Buoc '$Title' that bai (ma loi $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

if (-not $SkipPull) {
  # --ff-only: chi nhan code moi neu khong xung dot; khong bao gio tu tron code.
  Invoke-Step 'Lay code moi (git pull)' $root { git pull --ff-only }
}
Invoke-Step 'Cai thu vien giao dien' (Join-Path $root 'client') { npm ci }
Invoke-Step 'Build giao dien' (Join-Path $root 'client') { npm run build }
# --omit=dev: may chu khong can cong cu phat trien (TypeScript...).
Invoke-Step 'Cai thu vien server' (Join-Path $root 'server') { npm ci --omit=dev }

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Chua co tac vu '$TaskName' - build xong. Lan dau hay chay .\deploy\install-task.ps1" -ForegroundColor Yellow
  return
}

Write-Host '==> Khoi dong lai app' -ForegroundColor Cyan
Stop-ScheduledTask -TaskName $TaskName
# Phong khi tien trinh node con chay sau khi dung tac vu: dung DUNG tien
# trinh node cua app nay. start.cmd goi index.ts bang duong dan tuyet doi,
# nen loc theo duong dan do, khong dung nham app node khac tren may chu.
$entry = Join-Path $root 'server\src\index.ts'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($entry) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 6

try {
  $health = Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 10
  Write-Host "Xong! Server: ok=$($health.ok), database=$($health.db)" -ForegroundColor Green
} catch {
  Write-Host "Server chua tra loi. Xem log: $root\logs\server.log" -ForegroundColor Red
  exit 1
}

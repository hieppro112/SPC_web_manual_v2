@echo off
rem ============================================================
rem start.cmd - Chay server KVH IT Docs (Task Scheduler goi file nay)
rem ============================================================
rem Ghi toan bo log vao thu muc logs\ o goc du an.
rem Node.js phai cai o vi tri mac dinh (C:\Program Files\nodejs).

cd /d "%~dp0..\server"
if not exist "..\logs" mkdir "..\logs"

echo [%date% %time%] Khoi dong server >> "..\logs\server.log"
rem Duong dan TUYET DOI toi index.ts: update.ps1 dua vao do de nhan ra
rem dung tien trinh node cua app nay (khong dung nham app node khac).
"%ProgramFiles%\nodejs\node.exe" --env-file=.env "%CD%\src\index.ts" >> "..\logs\server.log" 2>&1

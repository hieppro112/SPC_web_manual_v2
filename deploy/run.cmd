@echo off
rem ============================================================
rem run.cmd - Chay server o che do "tien canh" (log in thang ra man hinh)
rem ============================================================
rem Dung khi dua app vao Tool Manager (SPC_eviroment_run_tool) ma Tool
rem Manager chi cho chon file, khong co o nhap tham so. Tool Manager tu
rem bat log, tu luu log theo ngay, tu khoi dong lai khi app bi tat.
rem
rem Khac start.cmd: start.cmd ghi log ra file logs\server.log (cho Task
rem Scheduler); file nay KHONG ghi file, de Tool Manager tu quan ly log.
rem
rem CHI dung MOT cach chay nen (Tool Manager HOAC Task Scheduler), dung
rem ca hai se chay 2 ban cung luc -> trung cong 5000.

rem Hien dung tieng Viet / emoji trong log (bang ma UTF-8)
chcp 65001 >nul
cd /d "%~dp0..\server"
"%ProgramFiles%\nodejs\node.exe" --env-file=.env "%CD%\src\index.ts"

@echo off
rem =====================================================================
rem  QLTB-CNTT - Tien trinh chay nen (duoc Task Scheduler goi khi khoi dong)
rem  Tu khoi dong lai neu phan mem bi dung bat thuong.
rem =====================================================================
setlocal
cd /d "%~dp0.."
set "PORT=3000"
set "NODE_EXE="
if exist "%~dp0config.cmd" call "%~dp0config.cmd"
if not defined NODE_EXE if exist "%CD%\runtime\node.exe" set "NODE_EXE=%CD%\runtime\node.exe"
if not defined NODE_EXE set "NODE_EXE=node"
if not exist "data\logs" mkdir "data\logs"

:loop
rem Xoay vong nhat ky khi vuot qua 10 MB
if exist "data\logs\server.log" for %%A in ("data\logs\server.log") do if %%~zA GTR 10485760 move /y "data\logs\server.log" "data\logs\server.old.log" >nul
echo [%date% %time%] Khoi dong may chu tren cong %PORT% >> "data\logs\server.log"
"%NODE_EXE%" --disable-warning=ExperimentalWarning server.js >> "data\logs\server.log" 2>&1
echo [%date% %time%] May chu da dung (ma thoat %errorlevel%), khoi dong lai sau 10 giay >> "data\logs\server.log"
ping -n 11 127.0.0.1 >nul
goto loop

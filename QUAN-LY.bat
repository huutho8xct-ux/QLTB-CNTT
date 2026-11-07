@echo off
title Quan ly dich vu QLTB-CNTT
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "PS=powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\service.ps1""
:menu
cls
echo ================================================================
echo   QUAN LY DICH VU QLTB-CNTT
echo ================================================================
%PS% -Action status
echo ----------------------------------------------------------------
echo   1. Mo phan mem tren trinh duyet
echo   2. Khoi dong
echo   3. Dung
echo   4. Khoi dong lai
echo   5. Xem nhat ky (log)
echo   6. Mo thu muc sao luu du lieu
echo   7. Dat lai mat khau tai khoan admin
echo   8. Doi cong truy cap (port)
echo   0. Thoat
echo ----------------------------------------------------------------
choice /C 123456780 /N /M "Chon chuc nang [0-8]: "
set "C=%errorlevel%"
if "%C%"=="1" %PS% -Action open
if "%C%"=="2" %PS% -Action start
if "%C%"=="3" %PS% -Action stop
if "%C%"=="4" %PS% -Action restart
if "%C%"=="5" %PS% -Action logs
if "%C%"=="6" %PS% -Action backups
if "%C%"=="7" %PS% -Action reset-admin
if "%C%"=="8" %PS% -Action set-port
if "%C%"=="9" exit /b
echo.
pause
goto menu

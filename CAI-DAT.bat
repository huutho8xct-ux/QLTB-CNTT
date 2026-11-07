@echo off
title Cai dat QLTB-CNTT - Phan mem quan ly thiet bi CNTT
cd /d "%~dp0"
rem Tu yeu cau quyen Administrator
net session >nul 2>&1
if errorlevel 1 (
  echo Dang yeu cau quyen Administrator...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo ================================================================
echo   CAI DAT PHAN MEM QUAN LY THIET BI CONG NGHE THONG TIN
echo   (QLTB-CNTT) - Danh cho don vi su nghiep cong lap
echo ================================================================
echo   - Phan mem se chay nen nhu mot dich vu, tu khoi dong cung may.
echo   - Nhan Enter de chap nhan gia tri mac dinh trong [ngoac vuong].
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\service.ps1" -Action install -Interactive
echo.
pause

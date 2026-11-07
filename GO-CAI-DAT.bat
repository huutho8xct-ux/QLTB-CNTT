@echo off
title Go cai dat QLTB-CNTT
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo Go dich vu QLTB-CNTT khoi may tinh nay.
echo Du lieu (thu muc data) se DUOC GIU LAI.
choice /C YN /M "Ban chac chan muon go cai dat"
if errorlevel 2 exit /b
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\service.ps1" -Action uninstall
echo.
pause

@echo off
title QLTB-CNTT - Chay thu (khong cai dich vu)
cd /d "%~dp0"
rem Chay phan mem trong cua so nay. De chay nen tu dong cung Windows, hay dung CAI-DAT.bat
set "NODE_EXE=node"
if exist "%~dp0runtime\node.exe" set "NODE_EXE=%~dp0runtime\node.exe"
"%NODE_EXE%" -v >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Tai va cai dat tai https://nodejs.org ^(phien ban 22 tro len^)
  pause
  exit /b 1
)
if not exist node_modules (
  echo Dang cai dat thu vien lan dau...
  call npm install --omit=dev
)
"%NODE_EXE%" --disable-warning=ExperimentalWarning server.js
pause

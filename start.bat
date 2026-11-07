@echo off
chcp 65001 >nul
title QLTB-CNTT - Phan mem quan ly thiet bi CNTT
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Vui long tai va cai dat tai https://nodejs.org ^(phien ban 22 tro len^)
  pause
  exit /b 1
)
if not exist node_modules (
  echo Dang cai dat thu vien lan dau...
  call npm install --omit=dev
)
call npm start
pause

@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fitness App - Web Modunda Baslat
cd /d "%~dp0"

echo ============================================================
echo        FITNESS APP - WEB TARAYICI MODUNDA BASLAT
echo ============================================================
echo.

netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto :BACKEND_OK

echo [1/2] Backend API sunucusu arka pencerede baslatiliyor (Port 8000)...
start "Fitness Backend API (Port 8000)" /D "%~dp0backend" cmd /k start_backend.bat
timeout /t 4 /nobreak >nul
goto :RUN_WEB

:BACKEND_OK
echo [1/2] Backend API (Port 8000) zaten aktif.

:RUN_WEB
echo [2/2] Web uygulamasi baslatiliyor (http://localhost:8081)...
echo.
cd /d "%~dp0mobile-ios"
call start_mobile.bat --web

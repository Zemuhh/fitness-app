@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fitness App - Sunuculari Durdur
cd /d "%~dp0"

echo ============================================================
echo          FITNESS APP - ACIK SUNUCULARI DURDUR
echo ============================================================
echo.

echo [1/2] Port 8000 (Backend FastAPI) kontrol ediliyor...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo   - Backend sureci sonlandiriliyor (PID: %%a)
    taskkill /F /T /PID %%a >nul 2>&1
)

echo [2/2] Port 8081 (Expo Metro Bundler) kontrol ediliyor...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8081 " ^| findstr "LISTENING"') do (
    echo   - Expo sureci sonlandiriliyor (PID: %%a)
    taskkill /F /T /PID %%a >nul 2>&1
)

echo.
echo [TAMAM] Aktif sunucu portlari (8000 ve 8081) temizlendi.
timeout /t 3 >nul
exit /b 0

@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fitness App - Sistem Baslatici
cd /d "%~dp0"

echo ============================================================
echo        FITNESS APP - TUM SISTEMI BASLAT (BACKEND + EXPO)
echo ============================================================
echo.

netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto :BACKEND_RUNNING

echo [1/2] Backend API sunucusu yeni pencerede baslatiliyor (Port 8000)...
start "Fitness Backend API (Port 8000)" /D "%~dp0backend" cmd /k start_backend.bat
timeout /t 3 /nobreak >nul
goto :START_MOBILE

:BACKEND_RUNNING
echo [1/2] Backend API (Port 8000) zaten calisiyor, mevcut sunucu kullanilacak.

:START_MOBILE
netstat -ano | findstr ":8081 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto :MOBILE_RUNNING

echo [2/2] Mobil / Web (Expo) sunucusu yeni pencerede baslatiliyor (Port 8081)...
start "Fitness Mobil ve Web (Expo)" /D "%~dp0mobile-ios" cmd /k start_mobile.bat
goto :SUMMARY

:MOBILE_RUNNING
echo [2/2] Expo Sunucusu (Port 8081) zaten calisiyor.

:SUMMARY
echo.
echo ============================================================
echo   SISTEM BASLATILDI! ERISIM ADRESLERI:
echo ------------------------------------------------------------
echo   * Backend API        : http://127.0.0.1:8000
echo   * Swagger API Docs   : http://127.0.0.1:8000/docs
echo   * Web Uygulamasi     : http://localhost:8081 (Expo penceresinde 'w' basin)
echo   * Mobil (Expo Go)    : Expo penceresindeki QR kodu telefonla okutun
echo ============================================================
echo.
echo Tum sunuculari tek tikla kapatmak icin "durdur_sistem.bat" calistirabilirsiniz.
echo Bu bilgi penceresi 5 saniye icinde kapanacaktir...
timeout /t 5 >nul
exit /b 0

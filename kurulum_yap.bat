@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fitness App - Ilk Kurulum ve Bagimlilik Yukleyici
cd /d "%~dp0"

echo ============================================================
echo     FITNESS APP - BAGIMLILIK VE ORTAM KURULUM SIHIRBAZI
echo ============================================================
echo.

echo [ADIM 1/2] Backend ortami (.venv ve requirements.txt) kontrol ediliyor...
echo ------------------------------------------------------------
pushd "%~dp0backend"
call start_backend.bat --install-only
set "BE_ERR=%errorlevel%"
popd
if not "%BE_ERR%"=="0" goto :FAIL

echo.
echo [ADIM 2/2] Mobil / Web paketleri (node_modules) kontrol ediliyor...
echo ------------------------------------------------------------
pushd "%~dp0mobile-ios"
call start_mobile.bat --install-only
set "FE_ERR=%errorlevel%"
popd
if not "%FE_ERR%"=="0" goto :FAIL

echo.
echo ============================================================
echo   [BASARILI] Tum kurulumlar tamamlandi!
echo   Sistemi baslatmak icin "baslat_sistem.bat" calistirabilirsiniz.
echo ============================================================
echo.
pause
exit /b 0

:FAIL
echo.
echo [HATA] Kurulum sirasinda bir sorun olustu. Yukaridaki hata mesajini kontrol edin.
pause
exit /b 1

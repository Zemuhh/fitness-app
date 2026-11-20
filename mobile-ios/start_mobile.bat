@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fitness App - Mobil ve Web Sunucusu (Expo)
cd /d "%~dp0"

set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"

echo ============================================================
echo   FITNESS APP - MOBIL / WEB UYGULAMASI (Expo Router)
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 goto :NO_NODE

if exist "node_modules\expo\package.json" goto :DEPS_OK

echo [1/2] Mobil uygulama paketleri (node_modules) kuruluyor...
echo       (Ilk kurulum internet hizina bagli olarak 1-3 dakika surebilir)
echo.
call npm.cmd install
if errorlevel 1 goto :NPM_FAIL

:DEPS_OK
if /i "%~1"=="--install-only" goto :INSTALL_DONE

set "EXPO_ARGS=--lan"
if /i "%~1"=="--web" set "EXPO_ARGS=--web"
if /i "%~1"=="--tunnel" set "EXPO_ARGS=--tunnel"
if /i "%~1"=="--clear" set "EXPO_ARGS=--lan --clear"

echo.
echo [HAZIR] Expo gelistirme sunucusu baslatiliyor (%EXPO_ARGS%)...
echo   - Web Tarayici : Acildiginda 'w' tusuna basin veya http://localhost:8081
echo   - Mobil Cihaz  : Telefondan Expo Go ile ekrandaki QR kodu okutun
echo.
echo Durdurmak icin bu pencerede CTRL+C tuslarina basabilirsiniz.
echo ============================================================
echo.

call npx.cmd expo start %EXPO_ARGS%
echo.
echo [BILGI] Expo sunucusu durduruldu.
pause
exit /b 0

:INSTALL_DONE
echo [TAMAM] Mobil / Web (node_modules) bagimliliklari hazir.
exit /b 0

:NO_NODE
echo [HATA] Bilgisayarda Node.js bulunamadi!
where winget >nul 2>&1
if errorlevel 1 goto :NO_NODE_MANUAL

choice /c EH /n /m "Node.js LTS simdi winget ile otomatik kurulsun mu? [E/H]: "
if errorlevel 2 goto :NO_NODE_MANUAL

winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo [BILGI] Kurulum tamamlandiysa pencereyi kapatip tekrar calistirin.
pause
exit /b 1

:NO_NODE_MANUAL
echo Lutfen https://nodejs.org/ adresinden Node.js LTS surumunu kurun.
pause
exit /b 1

:NPM_FAIL
echo.
echo [HATA] npm install sirasinda bir hata olustu! Internet baglantinizi kontrol edin.
pause
exit /b 1

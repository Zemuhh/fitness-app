@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Fitness App - Backend API (Port 8000)
cd /d "%~dp0"

:: .env yoksa varsayilandan olustur
if not exist ".env" (
    if exist ".env.example" (
        copy /y ".env.example" ".env" >nul
        echo [BILGI] .env dosyasi varsayilan ayarlarla olusturuldu.
    )
)

:: Argumanlari ayristir
set "INSTALL_ONLY=0"
set "NO_PAUSE=0"
set "UVICORN_FLAGS=--no-access-log"
set "MODE_LABEL=Hizli Uretim Modu (Aninda Acilis)"

for %%A in (%*) do (
    if /i "%%~A"=="--install-only" set "INSTALL_ONLY=1"
    if /i "%%~A"=="--no-pause" set "NO_PAUSE=1"
    if /i "%%~A"=="--dev" (
        set "UVICORN_FLAGS=--reload --reload-include *.py"
        set "MODE_LABEL=Gelistirici Modu (--reload aktif)"
    )
    if /i "%%~A"=="--reload" (
        set "UVICORN_FLAGS=--reload --reload-include *.py"
        set "MODE_LABEL=Gelistirici Modu (--reload aktif)"
    )
)

:: 1. Hazir .venv kontrolu (Once ust dizindeki ortak backend\.venv, yoksa yerel .venv)
set "VENV_PY="
if exist "%~dp0..\..\backend\.venv\Scripts\python.exe" (
    set "VENV_PY=%~dp0..\..\backend\.venv\Scripts\python.exe"
) else if exist "%~dp0.venv\Scripts\python.exe" (
    set "VENV_PY=%~dp0.venv\Scripts\python.exe"
)

if defined VENV_PY (
    if "%INSTALL_ONLY%"=="1" goto :VERIFY_DEPS
    goto :START_SERVER
)

:: 2. Hic .venv yoksa sistemdeki Python ile olustur
:FIND_PYTHON
echo ============================================================
echo   FITNESS APP - BACKEND ILK KURULUM SIHIRBAZI
echo ============================================================
echo [1/3] Sistemde Python kurulumu araniyor...
set "PY_MODE="
set "PY_EXE="

py -3 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY_MODE=LAUNCHER"
if defined PY_MODE goto :CREATE_VENV

python -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY_MODE=PATH"
if defined PY_MODE goto :CREATE_VENV

call :CHECK_PY_PATH "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
call :CHECK_PY_PATH "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
call :CHECK_PY_PATH "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
call :CHECK_PY_PATH "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
call :CHECK_PY_PATH "C:\Program Files\Python313\python.exe"
call :CHECK_PY_PATH "C:\Program Files\Python312\python.exe"
call :CHECK_PY_PATH "C:\Program Files\Python311\python.exe"
call :CHECK_PY_PATH "C:\Program Files\Python310\python.exe"
call :CHECK_PY_PATH "%USERPROFILE%\anaconda3\python.exe"
call :CHECK_PY_PATH "%USERPROFILE%\miniconda3\python.exe"
if defined PY_EXE goto :CREATE_VENV

echo.
echo [HATA] Bilgisayarda kurulu bir Python 3 bulunamadi!
echo Lutfen https://www.python.org/downloads/ adresinden Python 3.12 kurun.
if "%NO_PAUSE%"=="0" pause
exit /b 1

:CREATE_VENV
echo [2/3] Python sanal ortami (.venv) olusturuluyor...
if "%PY_MODE%"=="LAUNCHER" py -3 -m venv ".venv"
if "%PY_MODE%"=="PATH" python -m venv ".venv"
if defined PY_EXE "%PY_EXE%" -m venv ".venv"

if not exist ".venv\Scripts\python.exe" goto :VENV_FAIL
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

:VERIFY_DEPS
"%VENV_PY%" -c "import fastapi, uvicorn, sqlalchemy, pydantic, jwt, bcrypt, multipart, dotenv, httpx" >nul 2>&1
if not errorlevel 1 goto :DEPS_OK

echo [3/3] Backend Python paketleri yukleniyor (requirements.txt)...
"%VENV_PY%" -m pip install -r "requirements.txt"
if errorlevel 1 goto :PIP_FAIL

:DEPS_OK
if "%INSTALL_ONLY%"=="1" (
    echo [TAMAM] Backend sanal ortami ve bagimliliklari hazir.
    exit /b 0
)

:START_SERVER
:: Port 8000 cakisma korumasi (Errno 10048 onleyici)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000 " ^| findstr "LISTENING" 2^>nul') do (
    if not "%%P"=="0" (
        echo [BILGI] Port 8000 uzerindeki eski sunucu sureci ^(PID: %%P^) sonlandiriliyor...
        taskkill /F /PID %%P >nul 2>&1
    )
)

echo ============================================================
echo   FITNESS APP - BACKEND API SUNUCUSU (FastAPI + SQLite)
echo ============================================================
echo   Calisma Modu      : %MODE_LABEL%
echo   Yerel API Adresi  : http://127.0.0.1:8000
echo   Swagger API Docs  : http://127.0.0.1:8000/docs
echo   Saglik Kontrolu   : http://127.0.0.1:8000/health
echo ------------------------------------------------------------
echo   Not: Gelistirici auto-reload icin "--dev" parametresi verin.
echo   Durdurmak icin bu pencerede CTRL+C tuslarina basabilirsiniz.
echo ============================================================
echo.

:RUN_UVICORN
"%VENV_PY%" -m uvicorn main:app --host 0.0.0.0 --port 8000 %UVICORN_FLAGS%
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
    "%VENV_PY%" -c "import fastapi, uvicorn, sqlalchemy, pydantic, jwt, bcrypt, multipart, dotenv, httpx" >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [ONARIM] Eksik Python paketi tespit edildi, otomatik yukleniyor...
        "%VENV_PY%" -m pip install -r "requirements.txt"
        if not errorlevel 1 (
            echo [ONARIM] Paketler tamamlandi, sunucu yeniden baslatiliyor...
            echo.
            goto :RUN_UVICORN
        )
    )
)

echo.
echo [BILGI] Backend sunucusu durduruldu.
if "%NO_PAUSE%"=="0" pause
exit /b %EXIT_CODE%

:VENV_FAIL
echo [HATA] Sanal ortam (.venv) olusturulamadi!
if "%NO_PAUSE%"=="0" pause
exit /b 1

:PIP_FAIL
echo [HATA] Python paketleri yuklenirken hata olustu! Internet baglantinizi kontrol edin.
if "%NO_PAUSE%"=="0" pause
exit /b 1

:CHECK_PY_PATH
if defined PY_EXE exit /b 0
if exist "%~1" set "PY_EXE=%~1"
exit /b 0

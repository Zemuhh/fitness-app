@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Fitness App - Backend API (Port 8000)
cd /d "%~dp0"

echo ============================================================
echo   FITNESS APP - BACKEND API SUNUCUSU (FastAPI + SQLite)
echo ============================================================
echo.

if exist ".env" goto :CHECK_VENV
if not exist ".env.example" goto :CHECK_VENV
copy /y ".env.example" ".env" >nul
echo [BILGI] .env dosyasi varsayilan ayarlarla olusturuldu.

:CHECK_VENV
if not exist ".venv\Scripts\python.exe" goto :FIND_PYTHON
".venv\Scripts\python.exe" -c "import sys" >nul 2>&1
if not errorlevel 1 goto :CHECK_DEPS
echo [UYARI] Mevcut .venv ortami gecersiz, yeniden olusturuluyor...
rmdir /s /q ".venv" >nul 2>&1

:FIND_PYTHON
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
where winget >nul 2>&1
if errorlevel 1 goto :NO_WINGET

echo Python 3.12 paket yoneticisi (winget) ile otomatik kurulabilir.
choice /c EH /n /m "Python 3.12 simdi otomatik kurulsun mu? [E/H]: "
if errorlevel 2 goto :NO_WINGET

echo.
echo [KURULUM] Python 3.12 indiriliyor ve kuruluyor, lutfen bekleyin...
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
call :CHECK_PY_PATH "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if defined PY_EXE goto :CREATE_VENV

echo.
echo [BILGI] Python kurulduysa bu pencereyi kapatip dosyayi tekrar calistirin.
pause
exit /b 1

:NO_WINGET
echo Lutfen https://www.python.org/downloads/ adresinden Python 3.12 kurun
echo (Kurulumda "Add python.exe to PATH" secenegini isaretleyin).
echo.
pause
exit /b 1

:CREATE_VENV
echo [2/3] Python sanal ortami (.venv) olusturuluyor...
if "%PY_MODE%"=="LAUNCHER" py -3 -m venv ".venv"
if "%PY_MODE%"=="PATH" python -m venv ".venv"
if defined PY_EXE "%PY_EXE%" -m venv ".venv"

if not exist ".venv\Scripts\python.exe" goto :VENV_FAIL

:CHECK_DEPS
".venv\Scripts\python.exe" -c "import fastapi, uvicorn, sqlalchemy, pydantic, dotenv, httpx" >nul 2>&1
if not errorlevel 1 goto :DEPS_OK

echo [3/3] Backend Python paketleri yukleniyor (requirements.txt)...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r "requirements.txt"
if errorlevel 1 goto :PIP_FAIL

:DEPS_OK
if /i "%~1"=="--install-only" goto :INSTALL_DONE

echo.
echo [HAZIR] Backend API sunucusu baslatiliyor:
echo   - Yerel API Adresi : http://127.0.0.1:8000
echo   - Swagger API Docs : http://127.0.0.1:8000/docs
echo   - Saglik Kontrolu  : http://127.0.0.1:8000/health
echo.
echo Durdurmak icin bu pencerede CTRL+C tuslarina basabilirsiniz.
echo ============================================================
echo.

".venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
echo.
echo [BILGI] Backend sunucusu durduruldu.
pause
exit /b 0

:INSTALL_DONE
echo [TAMAM] Backend sanal ortami ve bagimliliklari hazir.
exit /b 0

:VENV_FAIL
echo [HATA] Sanal ortam (.venv) olusturulamadi!
pause
exit /b 1

:PIP_FAIL
echo [HATA] Python paketleri yuklenirken hata olustu! Internet baglantinizi kontrol edin.
pause
exit /b 1

:CHECK_PY_PATH
if defined PY_EXE exit /b 0
if exist "%~1" set "PY_EXE=%~1"
exit /b 0

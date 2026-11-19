@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo FastAPI Sunucusu baslatiliyor (http://localhost:8000/docs)...
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) else if exist "..\..\backend\.venv\Scripts\python.exe" (
    "..\..\backend\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
) else (
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
)
pause

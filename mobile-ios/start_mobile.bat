@echo off
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
npx.cmd expo start --lan

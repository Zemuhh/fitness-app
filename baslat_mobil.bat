@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0mobile-ios"
call start_mobile.bat %*

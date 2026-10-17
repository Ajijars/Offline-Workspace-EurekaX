@echo off
TITLE EurekaX Enterprise Platform
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0run.ps1"
pause

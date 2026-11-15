@echo off
rem Starts the CHC (Cabin Health Companion) Python server and opens the app in your browser.
cd /d "%~dp0python"
set PY=python
where py >nul 2>nul && set PY=py -3
start "" http://127.0.0.1:8000
%PY% server.py %*
pause

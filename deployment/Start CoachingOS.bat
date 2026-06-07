@echo off
cd /d "%~dp0"
start "CoachingOS Server" /min "%~dp0CoachingOS.exe"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5000"

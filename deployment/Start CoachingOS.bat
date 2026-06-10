@echo off
cd /d "%~dp0"
if not exist logs mkdir logs
start "CoachingOS Server" /min cmd /c ""%~dp0CoachingOS.exe" > "%~dp0logs\server.log" 2>&1"
timeout /t 5 /nobreak >nul
start "" "http://127.0.0.1:5000"

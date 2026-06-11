@echo off
cd /d "%~dp0"
if not exist "%~dp0certificates\coachingos.pfx" (
  call "%~dp0Enable HTTPS.bat" --no-pause
  if not exist "%~dp0certificates\coachingos.pfx" (
    echo.
    echo CoachingOS could not start because HTTPS setup was not completed.
    echo Run Enable HTTPS.bat as administrator and try again.
    pause
    exit /b 1
  )
)
if not exist logs mkdir logs
start "CoachingOS Server" /min cmd /c ""%~dp0CoachingOS.exe" > "%~dp0logs\server.log" 2>&1"
timeout /t 5 /nobreak >nul
if exist "%~dp0certificates\coachingos.pfx" (
  start "" "https://127.0.0.1:5000"
) else (
  start "" "http://127.0.0.1:5000"
)

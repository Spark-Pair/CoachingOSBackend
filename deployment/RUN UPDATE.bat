@echo off
setlocal
set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=C:\CoachingOS"

echo CoachingOS Manual Updater
echo =========================
echo Target: %TARGET%
echo.

"%~dp0CoachingOSUpdater.exe" "%TARGET%"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
  echo Update did not complete. Read the error above.
  echo Log: C:\ProgramData\CoachingOS\Updates\updater.log
) else (
  echo You may close this window.
)
echo.
pause
exit /b %RESULT%

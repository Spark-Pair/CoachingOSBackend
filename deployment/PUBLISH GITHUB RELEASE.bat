@echo off
setlocal
cd /d "%~dp0.."

echo CoachingOS GitHub Release Publisher
echo ===================================
echo.
set /p VERSION=Version without v, for example 1.2.0: 
set /p UPDATE_TYPE=Update type, optional or mandatory [optional]: 
if "%UPDATE_TYPE%"=="" set "UPDATE_TYPE=optional"
set /p NOTES=Short release notes: 
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\src\scripts\publishGithubRelease.ps1" -Version "%VERSION%" -UpdateType "%UPDATE_TYPE%" -Notes "%NOTES%"
set "RESULT=%ERRORLEVEL%"

echo.
if not "%RESULT%"=="0" (
  echo Release was not published. Read the error above.
) else (
  echo Release completed successfully.
)
echo.
pause
exit /b %RESULT%

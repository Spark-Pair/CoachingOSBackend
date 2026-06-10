@echo off
setlocal
cd /d "%~dp0.."

echo CoachingOS GitHub Release Publisher
echo ===================================
echo.

:ask_version
set "VERSION="
set /p VERSION=Version without v, for example 1.2.0: 
if not defined VERSION (
  echo Version is required.
  echo.
  goto ask_version
)
powershell.exe -NoProfile -Command "if ($env:VERSION -match '^\d+\.\d+\.\d+$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Use three numbers separated by dots, for example 1.2.0.
  echo.
  goto ask_version
)

:ask_update_type
set "UPDATE_TYPE="
set /p UPDATE_TYPE=Update type, optional or mandatory [optional]: 
if "%UPDATE_TYPE%"=="" set "UPDATE_TYPE=optional"
if /I not "%UPDATE_TYPE%"=="optional" if /I not "%UPDATE_TYPE%"=="mandatory" (
  echo Enter optional or mandatory.
  echo.
  goto ask_update_type
)

set "NOTES="
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

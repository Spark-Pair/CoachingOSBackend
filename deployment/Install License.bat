@echo off
setlocal
if "%~1"=="" (
  echo Drag a .license.json file onto this BAT file.
  echo.
  pause
  exit /b 1
)
if not exist "C:\ProgramData\CoachingOS" mkdir "C:\ProgramData\CoachingOS"
copy /Y "%~1" "C:\ProgramData\CoachingOS\license.json" >nul
echo License installed at C:\ProgramData\CoachingOS\license.json
pause

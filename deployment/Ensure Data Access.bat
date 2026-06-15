@echo off
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Ensure Data Access.ps1" -CheckOnly
if %errorlevel% equ 0 exit /b 0

powershell -NoProfile -Command "$process = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0Ensure Data Access.ps1""' -Verb RunAs -Wait -PassThru; exit $process.ExitCode"
exit /b %errorlevel%

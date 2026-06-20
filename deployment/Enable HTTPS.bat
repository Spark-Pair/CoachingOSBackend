@echo off
cd /d "%~dp0"
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '%*' -Verb RunAs"
  exit /b
)

set NO_PAUSE=
if /i "%~1"=="--no-pause" set NO_PAUSE=-NoPause

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Enable HTTPS.ps1" %NO_PAUSE%

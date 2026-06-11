@echo off
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '--no-pause' -Verb RunAs -Wait"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Enable HTTPS.ps1"
if %errorlevel% neq 0 (
  echo.
  echo HTTPS setup failed. Read the error above.
)
echo.
if /I not "%~1"=="--no-pause" pause

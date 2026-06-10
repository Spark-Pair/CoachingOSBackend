@echo off
net session >nul 2>&1
if not "%ERRORLEVEL%"=="0" (
  powershell.exe -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="CoachingOS TCP 5000" >nul 2>&1
netsh advfirewall firewall add rule name="CoachingOS TCP 5000" dir=in action=allow protocol=TCP localport=5000 profile=any remoteip=localsubnet

echo.
echo CoachingOS network access is enabled for devices on the local subnet.
echo Other devices can use this PC's IPv4 address with port 5000.
echo.
pause

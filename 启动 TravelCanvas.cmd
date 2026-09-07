@echo off
setlocal
set "LAUNCHER=%~dp0scripts\start-travelcanvas.ps1"

where pwsh.exe >nul 2>nul
if %errorlevel% equ 0 (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER%"
)

if %errorlevel% neq 0 (
  echo.
  echo TravelCanvas could not be started. See the message above.
  pause
)

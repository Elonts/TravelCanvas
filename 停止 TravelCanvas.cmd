@echo off
setlocal
set "STOPPER=%~dp0scripts\stop-travelcanvas.ps1"

where pwsh.exe >nul 2>nul
if %errorlevel% equ 0 (
  pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%STOPPER%"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%STOPPER%"
)

if %errorlevel% neq 0 pause

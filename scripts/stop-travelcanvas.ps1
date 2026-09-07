param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'TravelCanvas'
$pidFile = Join-Path $runtimeRoot "server-$Port.pid"

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "TravelCanvas is not running on port $Port."
  exit 0
}

$savedPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
$expectedCli = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
if ($processInfo -and $processInfo.ExecutablePath -like '*\node.exe' -and $processInfo.CommandLine -like "*$expectedCli*") {
  Stop-Process -Id $savedPid -Force
  Write-Host 'TravelCanvas has been stopped.'
} elseif ($processInfo) {
  Write-Host 'The saved process ID now belongs to another application, so it was not stopped.' -ForegroundColor Yellow
} else {
  Write-Host 'TravelCanvas was already stopped.'
}

Remove-Item -LiteralPath $pidFile -Force

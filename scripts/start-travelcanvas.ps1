param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3000,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:$Port"
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'TravelCanvas'
$pidFile = Join-Path $runtimeRoot "server-$Port.pid"
$outputLog = Join-Path $runtimeRoot "server-$Port.log"
$errorLog = Join-Path $runtimeRoot "server-$Port-error.log"

function Stop-WithMessage([string]$Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Get-LocalPage {
  try {
    return Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
  } catch {
    return $null
  }
}

function Test-TravelCanvasPage($Response) {
  return $null -ne $Response -and $Response.StatusCode -eq 200 -and $Response.Content -match 'TRAVELCANVAS'
}

function Open-TravelCanvas {
  if (-not $NoBrowser) { Start-Process $url }
}

Set-Location -LiteralPath $projectRoot

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
  Stop-WithMessage 'Node.js was not found. Install Node.js first, then double-click the launcher again.'
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\next\package.json'))) {
  Stop-WithMessage 'Project dependencies are missing. Run npm install once in this project, then use the launcher.'
}

$existing = Get-LocalPage
if (Test-TravelCanvasPage $existing) {
  Write-Host "TravelCanvas is already running at $url"
  Open-TravelCanvas
  exit 0
}
if ($existing) {
  Stop-WithMessage "Port $Port is already used by another web application. Close it or start TravelCanvas on another port."
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (Test-Path -LiteralPath $pidFile) {
  $savedPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  $savedProcess = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
  if ($savedProcess) {
    Stop-WithMessage "A TravelCanvas background process still exists but is not responding. Double-click Stop TravelCanvas, then start it again. Logs: $errorLog"
  }
  Remove-Item -LiteralPath $pidFile -Force
}

$buildMarker = Join-Path $projectRoot '.next\BUILD_ID'
$needsBuild = -not (Test-Path -LiteralPath $buildMarker)
if (-not $needsBuild) {
  $buildTime = (Get-Item -LiteralPath $buildMarker).LastWriteTimeUtc
  $sourceRoots = @('app', 'lib', 'public') | ForEach-Object { Join-Path $projectRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
  $newerSource = Get-ChildItem -LiteralPath $sourceRoots -Recurse -File | Where-Object { $_.LastWriteTimeUtc -gt $buildTime } | Select-Object -First 1
  $configFiles = @('package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json') | ForEach-Object { Join-Path $projectRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
  $newerConfig = Get-Item -LiteralPath $configFiles | Where-Object { $_.LastWriteTimeUtc -gt $buildTime } | Select-Object -First 1
  $needsBuild = $null -ne $newerSource -or $null -ne $newerConfig
}

if ($needsBuild) {
  Write-Host 'Building the latest TravelCanvas version. This may take a moment...'
  & $npm.Source run build
  if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage 'The production build failed. Review the build output before starting the site.'
  }
}

Write-Host "Starting TravelCanvas at $url ..."
$nextCli = Join-Path $projectRoot 'node_modules\next\dist\bin\next'
$serverArguments = "`"$nextCli`" start --hostname 127.0.0.1 --port $Port"
$server = Start-Process -FilePath $node.Source -ArgumentList $serverArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
[System.IO.File]::WriteAllText($pidFile, [string]$server.Id)

for ($attempt = 0; $attempt -lt 100; $attempt++) {
  if ($server.HasExited) {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    $details = if (Test-Path -LiteralPath $errorLog) { (Get-Content -LiteralPath $errorLog -Tail 8) -join [Environment]::NewLine } else { 'No error log was written.' }
    Stop-WithMessage "The server stopped before it was ready. $details"
  }
  $response = Get-LocalPage
  if (Test-TravelCanvasPage $response) {
    Write-Host 'TravelCanvas is ready. Opening the browser...'
    Open-TravelCanvas
    exit 0
  }
  Start-Sleep -Milliseconds 300
}

Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Stop-WithMessage "TravelCanvas did not become ready within 30 seconds. Logs: $outputLog and $errorLog"

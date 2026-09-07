param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:$Port"

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
  Start-Process $url
  exit 0
}
if ($existing) {
  Stop-WithMessage "Port $Port is already used by another web application. Close it or start TravelCanvas on another port."
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
$server = Start-Process -FilePath $npm.Source -ArgumentList @('run', 'start', '--', '--hostname', '127.0.0.1', '--port', [string]$Port) -WorkingDirectory $projectRoot -WindowStyle Normal -PassThru

for ($attempt = 0; $attempt -lt 100; $attempt++) {
  if ($server.HasExited) {
    Stop-WithMessage "The server stopped before it was ready. Port $Port may be occupied; check the server window for details."
  }
  $response = Get-LocalPage
  if (Test-TravelCanvasPage $response) {
    Write-Host 'TravelCanvas is ready. Opening the browser...'
    Start-Process $url
    exit 0
  }
  Start-Sleep -Milliseconds 300
}

Stop-WithMessage "TravelCanvas did not become ready within 30 seconds. Check the server window for details."

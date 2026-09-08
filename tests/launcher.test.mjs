import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const command = readFileSync(new URL('../启动 TravelCanvas.cmd', import.meta.url), 'utf8');
const script = readFileSync(new URL('../scripts/start-travelcanvas.ps1', import.meta.url), 'utf8');
const stopCommand = readFileSync(new URL('../停止 TravelCanvas.cmd', import.meta.url), 'utf8');
const stopScript = readFileSync(new URL('../scripts/stop-travelcanvas.ps1', import.meta.url), 'utf8');

test('one-click launcher starts the production server and opens only the local URL', () => {
  assert.match(command, /start-travelcanvas\.ps1/);
  assert.match(script, /npm\.cmd/);
  assert.match(script, /node_modules\\next\\dist\\bin\\next/);
  assert.match(script, /serverArguments = .*nextCli/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /Start-Process \$url/);
  assert.doesNotMatch(script, /0\.0\.0\.0/);
  assert.match(script, /WindowStyle Hidden/);
  assert.match(script, /RedirectStandardError/);
});

test('launcher never installs dependencies or writes provider secrets', () => {
  assert.doesNotMatch(script, /&\s*\$npm\.Source\s+(install|i|ci)\b/i);
  assert.doesNotMatch(script, /ArgumentList[^\n]*(install|'i'|'ci')/i);
  assert.doesNotMatch(script, /API_KEY|\.env\.local/);
  assert.match(script, /Project dependencies are missing/);
});

test('launcher rebuilds only when the production build is missing or older than source', () => {
  assert.match(script, /\.next\\BUILD_ID/);
  assert.match(script, /LastWriteTimeUtc/);
  assert.match(script, /run build/);
  assert.match(script, /TravelCanvas is already running/);
});

test('launcher restarts only the verified project server when its recorded build is stale', () => {
  assert.match(script, /server-\$Port\.build-id/);
  assert.match(script, /startedBuildId -eq \$currentBuildId/);
  assert.match(script, /A newer TravelCanvas build is available/);
  assert.match(script, /Stop-Process -Id \$listener\.OwningProcess/);
  assert.match(script, /\$existing = \$null/);
  assert.ok(script.indexOf('if (-not $isThisProject)') < script.indexOf('Stop-Process -Id $listener.OwningProcess'));
  assert.match(stopScript, /server-\$Port\.build-id/);
});

test('launcher records the background process and the stop command only terminates the matching Next process', () => {
  assert.match(script, /server-\$Port\.pid/);
  assert.match(script, /Get-NetTCPConnection -LocalPort \$Port/);
  assert.match(script, /listener\.OwningProcess/);
  assert.match(stopCommand, /stop-travelcanvas\.ps1/);
  assert.match(stopScript, /Get-CimInstance Win32_Process/);
  assert.match(stopScript, /CommandLine -like/);
  assert.match(stopScript, /\*\$projectRoot\*/);
  assert.match(stopScript, /Stop-Process -Id \$savedPid/);
});

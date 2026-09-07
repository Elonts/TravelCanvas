import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const command = readFileSync(new URL('../启动 TravelCanvas.cmd', import.meta.url), 'utf8');
const script = readFileSync(new URL('../scripts/start-travelcanvas.ps1', import.meta.url), 'utf8');

test('one-click launcher starts the production server and opens only the local URL', () => {
  assert.match(command, /start-travelcanvas\.ps1/);
  assert.match(script, /npm\.cmd/);
  assert.match(script, /'run', 'start'/);
  assert.match(script, /127\.0\.0\.1/);
  assert.match(script, /Start-Process \$url/);
  assert.doesNotMatch(script, /0\.0\.0\.0/);
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

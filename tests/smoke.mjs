import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 3101;
const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: '', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });

async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (output.includes(`http://localhost:${port}`)) return;
    if (server.exitCode !== null) throw new Error(`Server exited early: ${output}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not start: ${output}`);
}

try {
  await waitForServer();
  const page = await fetch(`http://localhost:${port}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /TripCanvas/);

  const plan = await fetch(`http://localhost:${port}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: '杭州', days: '2', budget: '3000' })
  });
  assert.equal(plan.status, 200);
  assert.deepEqual(await plan.json(), { demo: true });
  console.log('Smoke test passed.');
} finally {
  server.kill();
}

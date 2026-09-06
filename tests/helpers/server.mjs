import { spawn } from 'node:child_process';
import net from 'node:net';
import { testEnv } from './food-fixture.mjs';

export async function startServer(mode = 'fixtures') {
  const port = await new Promise(resolve => {
    const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
  const args = ['--import', new URL('./provider-preload.mjs', import.meta.url).href, 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)];
  const env = { ...process.env, TRAVELCANVAS_TEST_MODE: mode, DEEPSEEK_API_KEY: '', AMAP_API_KEY: '', TAVILY_API_KEY: '', ...(mode === 'fixtures' ? testEnv : {}) };
  const child = spawn(process.execPath, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${port}`;
  let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const stop = () => child.kill();
  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw Error(`Test server exited: ${output}`);
      try { if ((await fetch(base)).ok) return { base, stop }; } catch { /* Wait for startup. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error(`Test server startup timed out: ${output}`);
  } catch (error) { stop(); throw error; }
}

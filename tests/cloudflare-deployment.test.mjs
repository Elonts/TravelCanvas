import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Cloudflare deployment keeps both production custom domains', async () => {
  const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));

  assert.deepEqual(config.routes, [
    { pattern: 'travelcanvasc.com', custom_domain: true },
    { pattern: 'www.travelcanvasc.com', custom_domain: true },
  ]);
});

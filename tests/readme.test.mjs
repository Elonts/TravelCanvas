import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('README covers the required project, install, usage and example sections', async () => {
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  for (const heading of [
    '## 1. 项目解决什么问题',
    '## 2. 主要功能',
    '## 3. 安装方法',
    '## 4. 使用方法',
    '## 5. 输入输出示例',
  ]) assert.match(readme, new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));

  assert.match(readme, /Node\.js `>= 22\.12\.0`/);
  assert.match(readme, /npm ci/);
  assert.match(readme, /npm run dev/);
  assert.match(readme, /npm run check/);
  assert.match(readme, /仅支持中国境内旅行/);
  assert.match(readme, /不处理支付、订单或售后/);
});

test('README documents every supported environment variable from the example file', async () => {
  const [readme, envExample] = await Promise.all([
    readFile(resolve(root, 'README.md'), 'utf8'),
    readFile(resolve(root, '.env.example'), 'utf8'),
  ]);
  const variableNames = envExample.split(/\r?\n/)
    .map(line => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
    .filter(Boolean);

  for (const variableName of variableNames) assert.match(readme, new RegExp(`\\b${variableName}\\b`));
});

test('README relative file links point to files in this repository', async () => {
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  const links = [...readme.matchAll(/\]\((\.\/[^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.length > 0);

  for (const link of links) await assert.doesNotReject(readFile(resolve(root, link)));
});

test('README input and output examples are valid JSON', async () => {
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  const examples = [...readme.matchAll(/```json\r?\n([\s\S]*?)\r?\n```/g)].map(match => match[1]);
  assert.equal(examples.length, 4);

  for (const example of examples) assert.doesNotThrow(() => JSON.parse(example));
});

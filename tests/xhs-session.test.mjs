import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { xhsSessionSchema, sessionHeatScore } from '../lib/xhs-session.mjs';

await import('../browser-extension/xhs-session/parser.js');
const parser = globalThis.TravelCanvasXhsParser;

const base = { discoveryId: '00000000-0000-4000-8000-000000000000', city: '珠海', category: 'attractions', query: '珠海 旅游攻略 必去景点', queriedAt: '2026-09-24T04:00:00.000Z' };

test('login-session import accepts only bounded Xiaohongshu note-card data', () => {
  const valid = { title: '珠海圆明新园攻略', snippet: '圆明新园适合慢慢游览', url: 'https://www.xiaohongshu.com/explore/abc123?xsec_token=visible', author: '旅行者', rank: 1, visibleLikes: 12800, publishedAt: '2026-09-20' };
  assert.equal(xhsSessionSchema.safeParse({ ...base, results: [valid] }).success, true);
  assert.equal(xhsSessionSchema.safeParse({ ...base, results: [{ ...valid, url: 'https://evil.example/explore/abc' }] }).success, false);
  assert.equal(xhsSessionSchema.safeParse({ ...base, results: [{ ...valid, cookie: 'secret' }] }).success, false);
  assert.equal(xhsSessionSchema.safeParse({ ...base, results: Array.from({ length: 21 }, (_, index) => ({ ...valid, url: `https://www.xiaohongshu.com/explore/id${index}`, rank: Math.min(20, index + 1) })) }).success, false);
});

test('visible-result parser handles compact interaction counts, deduplication and card limits', () => {
  assert.equal(parser.visibleLikes('1.2万'), 12000);
  assert.equal(parser.visibleLikes('3.4k'), 3400);
  assert.equal(parser.noteUrl('https://www.xiaohongshu.com/search_result?keyword=x'), null);
  const element = value => ({ textContent: value });
  const card = (id, title) => ({ querySelector(selector) {
    if (selector.startsWith('a[')) return { href: `https://www.xiaohongshu.com/explore/${id}` };
    if (selector.includes('title')) return element(title);
    if (selector.includes('author')) return element('公开作者');
    if (selector.includes('like')) return element('2.5万');
    if (selector.startsWith('time')) return element('09-20');
    if (selector.includes('desc')) return element(`${title}的可见摘要`);
    return null;
  } });
  const cards = [card('one', '圆明新园'), card('one', '重复'), ...Array.from({ length: 25 }, (_, index) => card(`id${index}`, `珠海景点${index}`))];
  const doc = { querySelectorAll(selector) { return selector === 'section.note-item' ? cards : []; } };
  const results = parser.parseVisibleCards(doc, 20);
  assert.equal(results.length, 20);
  assert.equal(results[0].visibleLikes, 25000);
  assert.equal(new Set(results.map(item => item.url)).size, 20);
});

test('parser stops on verification or login walls and heat proxy uses only session evidence', () => {
  assert.equal(parser.pageFailure({ body: { innerText: '请完成滑块验证码' } }), 'captcha');
  assert.equal(parser.pageFailure({ body: { innerText: '请先登录后查看' } }), 'login_required');
  const score = sessionHeatScore([
    { sourceId: 'a', sourceKind: 'xhs_session', searchRank: 1, visibleLikes: 10000 },
    { sourceId: 'b', sourceKind: 'tavily_public', searchRank: 1, visibleLikes: 999999 },
  ]);
  assert.ok(score > 80 && score < 130);
});

test('extension requests no credential or network-inspection permissions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../browser-extension/xhs-session/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.permissions, ['tabs']);
  const background = await readFile(new URL('../browser-extension/xhs-session/background.js', import.meta.url), 'utf8');
  assert.doesNotMatch(background, /chrome\.(?:cookies|webRequest)|localStorage|requestHeaders/i);
});

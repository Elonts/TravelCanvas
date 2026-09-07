import assert from 'node:assert/strict';
import test from 'node:test';
import { DiscoveryStore } from '../lib/discovery-store.mjs';
import { amapNavigationUrl } from '../lib/navigation.mjs';
import { proxiedAmapImageUrl, safeAmapImageUrl } from '../lib/provider-urls.mjs';
import { normalizeDiscoveryPoi } from '../lib/food-providers.mjs';

const request = { destinations: ['杭州', '北京'] };
const candidate = (id, city, kind = 'attraction') => ({ id, city, kind });

test('discovery store only accepts server-issued candidates and requires a non-food place per city', () => {
  let clock = 1000;
  const store = new DiscoveryStore({ ttl: 100, clock: () => clock });
  const saved = store.save({ request, candidates: [candidate('hz', '杭州'), candidate('bj', '北京'), candidate('food', '杭州', 'food')] });
  assert.deepEqual(store.select(saved.discoveryId, ['hz', 'bj']).candidates.map(item => item.id), ['hz', 'bj']);
  assert.throws(() => store.select(saved.discoveryId, ['hz', 'forged']), /无效候选/);
  assert.throws(() => store.select(saved.discoveryId, ['hz', 'food']), /北京至少选择/);
  clock = 1100;
  assert.throws(() => store.select(saved.discoveryId, ['hz', 'bj']), /过期/);
});

test('discovery store appends verified custom candidates without duplicating server ids', () => {
  const store = new DiscoveryStore();
  const saved = store.save({ request: { destinations: ['杭州'] }, candidates: [candidate('hz', '杭州')], warnings: [], sources: { updatedAt: new Date(0).toISOString() } });
  const updated = store.append(saved.discoveryId, [candidate('hz', '杭州'), candidate('custom', '杭州', 'food')], ['自定义地点提示']);
  assert.deepEqual(updated.candidates.map(item => item.id), ['hz', 'custom']);
  assert.deepEqual(updated.warnings, ['自定义地点提示']);
});

test('AMap navigation links encode a verified China coordinate and transport mode', () => {
  const url = new URL(amapNavigationUrl({ name: '西湖风景名胜区', lng: 120.1, lat: 30.2 }, 'drive'));
  assert.equal(url.origin, 'https://uri.amap.com');
  assert.equal(url.searchParams.get('to'), '120.1,30.2,西湖风景名胜区');
  assert.equal(url.searchParams.get('mode'), 'car');
  assert.equal(url.searchParams.get('callnative'), '1');
  assert.equal(amapNavigationUrl({ name: '境外坐标', lng: 1, lat: 1 }), null);
});

test('image proxy only accepts AMap-owned HTTPS targets and blocks credential, port and lookalike URLs', () => {
  assert.equal(safeAmapImageUrl('http://store.is.autonavi.com/a.jpg'), 'https://store.is.autonavi.com/a.jpg');
  assert.equal(proxiedAmapImageUrl('https://img.amap.com/a.jpg'), '/api/poi-image?url=https%3A%2F%2Fimg.amap.com%2Fa.jpg');
  for (const value of ['https://autonavi.com/a.jpg', 'https://autonavi.com.evil.test/a.jpg', 'https://user@img.amap.com/a.jpg', 'https://img.amap.com:8443/a.jpg', 'file:///etc/passwd']) assert.equal(safeAmapImageUrl(value), null);
});

test('discovery POIs must match the requested category and expose proxied image plus navigation', () => {
  const raw = { id: 'poi-1', name: '测试剧场', location: '120.1,30.2', address: ['杭州', '测试路'], type: '体育休闲服务;娱乐场所', typecode: '080301', photos: [{ url: 'https://store.is.autonavi.com/showpic/a.jpg' }] };
  const venue = normalizeDiscoveryPoi(raw, '杭州', 'entertainment', 'transit');
  assert.equal(venue.address, '杭州测试路');
  assert.ok(venue.imageUrl.startsWith('/api/poi-image?url='));
  assert.ok(venue.navigationUrl.includes('mode=bus'));
  assert.equal(normalizeDiscoveryPoi(raw, '杭州', 'food'), null);
});

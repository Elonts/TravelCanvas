import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendHotels } from '../lib/hotels.mjs';

test('creates three transparent Ctrip hotel search recommendations', () => {
  const hotels = recommendHotels({ destination: '杭州', days: 2, budget: 4000, travelers: 2, preferences: '美食', stops: [{ name: '西湖风景名胜区' }, { name: '河坊街' }] });
  assert.equal(hotels.length, 3);
  assert.match(hotels[0].area, /西湖风景名胜区/);
  assert.match(hotels[0].filters, /餐饮/);
  assert.equal(hotels[0].ctripUrl, 'https://hotels.ctrip.com/hotels');
});

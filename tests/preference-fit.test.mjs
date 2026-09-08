import test from 'node:test';
import assert from 'node:assert/strict';
import { attractionPreferenceFit, foodPreferenceTerms } from '../lib/preference-fit.mjs';

test('senior preferences favor low-intensity cultural places and exclude strenuous activities', () => {
  const request = { preferences: '适合老年人活动', constraints: '少走路，不爬山' };
  const museum = attractionPreferenceFit({ name: '城市博物馆', category: '博物馆' }, request);
  const climbing = attractionPreferenceFit({ name: '峡谷高空攀岩', category: '极限运动' }, request);
  assert.ok(museum.score > climbing.score);
  assert.equal(museum.excluded, false);
  assert.equal(climbing.excluded, true);
  assert.match(museum.caution, /步行距离/);
});

test('food preferences expand into provider search and ranking terms', () => {
  assert.deepEqual(foodPreferenceTerms('川菜'), ['川菜', '四川菜', '麻辣']);
  assert.ok(foodPreferenceTerms('清淡、面食').includes('面馆'));
  assert.notDeepEqual(foodPreferenceTerms('川菜'), foodPreferenceTerms('日料'));
});

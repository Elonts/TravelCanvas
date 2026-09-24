import test from 'node:test';
import assert from 'node:assert/strict';
import { collapseScenicChildren } from '../lib/scenic-groups.mjs';

const candidate = (poiId, name, parentPoiId = null) => ({ poiId, parentPoiId, rootPoiId: parentPoiId || poiId, scenicRole: parentPoiId ? 'child' : 'main', city: '珠海', name, introduction: `${name}介绍`, guideEvidence: [], guideScore: 0 });

test('provider-declared child scenic POIs collapse into the main scenic area', () => {
  const result = collapseScenicChildren([candidate('main', '圆明新园'), candidate('child', '圆明新园-万花阵', 'main')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, '圆明新园');
  assert.match(result[0].introduction, /万花阵.*主景区/);
});

test('a child without its parent remains available for explicit manual selection', () => {
  const result = collapseScenicChildren([candidate('child', '圆明新园-万花阵', 'main')]);
  assert.equal(result.length, 1);
  assert.equal(result[0].scenicRole, 'child');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorIntercityDays, buildIntercityTransfers, verifyIntercityLegs } from '../lib/intercity.mjs';
import { requestSchema } from '../lib/requests.mjs';

const place = (poiId, name) => ({ poiId, name, address: `${name}地址`, lng: 120, lat: 30 });
const base = { origin: '上海', destinations: ['杭州'], startDate: '2026-10-01', days: 2, budget: 4000, travelers: 2, transport: 'transit' };

test('public intercity legs require confirmed hubs and planned times', () => {
  const incomplete = { fromCity: '上海', toCity: '杭州', mode: 'high_speed_rail', tripNo: '' };
  assert.equal(requestSchema.safeParse({ ...base, intercityLegs: [incomplete] }).success, false);
  const complete = { ...incomplete, departureHub: place('s1', '上海虹桥站'), arrivalHub: place('s2', '杭州东站'), departureAt: '2026-10-01T00:00:00.000Z', arrivalAt: '2026-10-01T01:00:00.000Z' };
  assert.equal(requestSchema.safeParse({ ...base, intercityLegs: [complete] }).success, true);
});

test('verified arrival and departure hubs become daily route anchors', async () => {
  const request = { intercityLegs: [{ fromCity: '上海', toCity: '杭州', mode: 'high_speed_rail', departureHub: place('s1', '上海虹桥站'), arrivalHub: place('s2', '杭州东站'), departureAt: '2026-10-01T00:00:00.000Z', arrivalAt: '2026-10-01T01:00:00.000Z', tripNo: 'G1' }] };
  const map = { poi: async (id) => id === 's1' ? place('s1', '上海虹桥站') : place('s2', '杭州东站') };
  const legs = await verifyIntercityLegs(request, map);
  const days = anchorIntercityDays([{ city: '杭州', date: '2026-10-01', title: '', stops: [] }], legs);
  assert.equal(days[0].startHub.name, '杭州东站');
  assert.equal(days[0].startHub.tripNo, 'G1');
  const transfers = await buildIntercityTransfers(request, legs, null, new Map());
  assert.equal(transfers[0].minutes, 60);
  assert.equal(transfers[0].mode, 'high_speed_rail');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { distributeDays, parseCandidatePlaces, targetStopCount, uniqueStops } from '../lib/itinerary.mjs';

const request = { days: 3, startDate: '2026-12-30' };
const candidates = count => Array.from({ length: count }, (_, i) => ({
  id: `s-${i}`, poiId: `poi-${i}`, name: `独立景点${i}`, address: '测试地址',
  lng: 120.1 + i * .001, lat: 30.2, verified: true,
  time: '', duration: '约 1 小时', cost: 0, indoor: false, detail: '',
}));

test('three, five and ten day itineraries consume unique candidates instead of replaying day two', () => {
  for (const length of [1, 2, 3, 5, 10]) {
    const original = candidates(targetStopCount(length));
    const before = structuredClone(original);
    const days = distributeDays(original, { ...request, days: length });
    const assigned = days.flatMap(day => day.stops);
    assert.equal(assigned.length, targetStopCount(length));
    assert.equal(new Set(assigned.map(stop => stop.poiId)).size, assigned.length);
    assert.equal(new Set(assigned.map(stop => stop.name)).size, assigned.length);
    assert.ok(days.every(day => day.stops.length === (length === 1 ? 4 : 3)));
    assert.equal(new Set(days.map(day => JSON.stringify(day.stops.map(stop => stop.id)))).size, length);
    assert.deepEqual(original, before);
    const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    for (const day of days) assert.ok(day.stops.every((stop, i) => !i || minutes(stop.time) >= minutes(day.stops[i - 1].time) + day.stops[i - 1].durationMinutes + 30));
  }
});
test('POI aliases and normalized repeated names are removed globally', () => {
  const stops = candidates(3);
  const unique = uniqueStops([...stops, { ...stops[0], id: 'alias', name: '景点别名' }, { ...stops[1], id: 'another-id', poiId: 'new-poi', name: ` ${stops[1].name} ` }]);
  assert.equal(unique.length, 3);
});
test('insufficient candidates do not fill later days with repeats', () => {
  const days = distributeDays(candidates(4), { ...request, days: 5 });
  assert.deepEqual(days.map(day => day.stops.length), [1, 1, 1, 1, 0]);
  assert.ok(days.every(day => day.warning));
  assert.equal(new Set(days.flatMap(day => day.stops.map(stop => stop.name))).size, 4);
  assert.equal(days[2].date, '2027-01-01');
});
test('AI response is not truncated to four fixture slots and does not borrow unrelated coordinates', () => {
  const stops = parseCandidatePlaces(JSON.stringify({ places: Array.from({ length: 15 }, (_, i) => `新地点${i}`) }), candidates(4), 15);
  assert.equal(stops.length, 15);
  assert.ok(stops.every(stop => stop.lng === 0 && stop.lat === 0 && !stop.verified && stop.costPending));
  assert.equal(new Set(stops.map(stop => stop.id)).size, 15);
  assert.throws(() => parseCandidatePlaces('{"places":[42]}', [], 3));
});

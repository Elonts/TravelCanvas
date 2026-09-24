import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleAnchoredDays } from '../lib/day-timing.mjs';

const point = (name, kind) => ({ name, kind, lng: 120, lat: 30 });
const stop = (id, name, durationMinutes = 90) => ({ id, name, city: '杭州', lng: 120, lat: 30, durationMinutes });
const request = { transport: 'transit' };
const map = { route: async () => ({ state: 'live', minutes: 20 }) };

test('arrival time controls the first attraction and preserves station to hotel order', async () => {
  const [day] = await scheduleAnchoredDays([{ city: '杭州', date: '2026-09-28', stops: [stop('a', '西湖')], startHub: { ...point('杭州东站', 'station'), time: '2026-09-28T15:20:00+08:00' }, arrivalHotel: point('测试酒店', 'hotel'), endHotel: point('测试酒店', 'hotel') }], request, map);
  assert.equal(day.arrivalHotelTime, '15:55');
  assert.equal(day.availableFrom, '16:25');
  assert.equal(day.stops[0].time, '16:45');
  assert.ok(day.scheduleIssues.some(issue => issue.includes('15 分钟')));
  assert.ok(day.scheduleIssues.some(issue => issue.includes('30 分钟')));
});

test('arrival date must match the destination itinerary date', async () => {
  await assert.rejects(() => scheduleAnchoredDays([{ city: '杭州', date: '2026-09-28', stops: [], startHub: { ...point('杭州东站', 'station'), time: '2026-09-29T08:00:00+08:00' } }], request, map), /预计到达日期.*不一致/);
});

test('self-drive arrival starts at the booked hotel before the first attraction', async () => {
  const [day] = await scheduleAnchoredDays([{ city: '杭州', date: '2026-09-28', stops: [stop('a', '西湖')], arrivalHotel: point('测试酒店', 'hotel'), endHotel: point('测试酒店', 'hotel') }], { transport: 'drive' }, map);
  assert.equal(day.arrivalHotelTime, '09:00');
  assert.equal(day.availableFrom, '09:30');
  assert.equal(day.stops[0].time, '09:50');
  assert.ok(day.scheduleIssues.some(issue => issue.includes('先到已预订酒店')));
});

test('an attraction that cannot fit is moved to a later day in the same city', async () => {
  const result = await scheduleAnchoredDays([
    { city: '杭州', date: '2026-09-28', stops: [stop('late', '晚到后景点', 180)], startHub: { ...point('萧山机场', 'airport'), time: '2026-09-28T19:00:00+08:00' } },
    { city: '杭州', date: '2026-09-29', stops: [] },
  ], request, map);
  assert.equal(result[0].stops.length, 0);
  assert.equal(result[1].stops[0].name, '晚到后景点');
  assert.ok(result[0].scheduleIssues.some(issue => issue.includes('顺延')));
});

test('an attraction is never silently removed when no later day can hold it', async () => {
  await assert.rejects(() => scheduleAnchoredDays([{ city: '杭州', date: '2026-09-28', stops: [stop('late', '晚到后景点', 180)], startHub: { ...point('萧山机场', 'airport'), time: '2026-09-28T19:00:00+08:00' } }], request, map), /无法.*容纳.*晚到后景点/);
});

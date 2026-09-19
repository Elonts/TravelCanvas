import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDay } from '../lib/day-schedule.mjs';

const attraction = (id, durationMinutes = 90) => ({ id, name: id, kind: 'attraction', durationMinutes });
const entertainment = (id, period, routeMeters = 1000) => ({ id, name: id, kind: 'entertainment', period, durationMinutes: 90, routeMeters });

test('entertainment is fixed inside the selected period and attractions move around it', () => {
  const result = scheduleDay([attraction('景点甲'), attraction('景点乙')], [entertainment('娱乐', 'afternoon')]);
  assert.equal(result.find(stop => stop.id === '娱乐').time, '13:30');
  assert.deepEqual(result.map(stop => stop.time), [...result.map(stop => stop.time)].sort());
});

test('same-period entertainment is ordered by route distance and impossible drafts report a conflict', () => {
  const result = scheduleDay([], [entertainment('远', 'morning', 2000), entertainment('近', 'morning', 500)]);
  assert.deepEqual(result.map(stop => stop.id), ['近', '远']);
  assert.throws(() => scheduleDay([], [entertainment('一', 'morning'), entertainment('二', 'morning'), entertainment('三', 'morning')]), /无法容纳/);
});

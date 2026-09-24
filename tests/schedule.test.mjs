import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleEntertainmentByAnchors } from '../lib/day-schedule.mjs';

const attraction = (id, time) => ({ id, name: id, time, durationMinutes: 60 });
const entertainment = (id, anchorPointId, position, extra = 0) => ({ id, name: id, anchorPointId, position, durationMinutes: 90, insertionExtraMinutes: extra });
const anchors = [
  { id: 'hotel:start', name: '酒店', start: 510, end: 510, hotelRole: 'start' },
  { id: 'stop:a', name: '景点甲', start: 600, end: 660, stopId: 'a' },
  { id: 'stop:b', name: '景点乙', start: 900, end: 960, stopId: 'b' },
  { id: 'hotel:end', name: '酒店', start: 1260, end: 1260, hotelRole: 'end' },
];

test('entertainment is inserted immediately after the selected itinerary point', () => {
  const result = scheduleEntertainmentByAnchors([attraction('a', '10:00'), attraction('b', '15:00')], [entertainment('娱乐', 'stop:a', 'after', 15)], anchors, 510, 1260);
  const attractionIndex = result.findIndex(item => item.id === 'a');
  const entertainmentIndex = result.findIndex(item => item.id === '娱乐');
  assert.equal(entertainmentIndex, attractionIndex + 1);
  assert.ok(result.find(item => item.id === 'b').time > result.find(item => item.id === '娱乐').time);
});

test('multiple activities at one anchor preserve user order and impossible insertions fail', () => {
  const result = scheduleEntertainmentByAnchors([attraction('a', '10:00'), attraction('b', '15:00')], [entertainment('一', 'stop:b', 'after'), entertainment('二', 'stop:b', 'after')], anchors, 510, 1260);
  assert.ok(result.findIndex(item => item.id === '一') < result.findIndex(item => item.id === '二'));
  assert.throws(() => scheduleEntertainmentByAnchors([attraction('a', '10:00')], [entertainment('过长', 'stop:a', 'after', 300)], anchors, 510, 700), /超出|无法/);
});

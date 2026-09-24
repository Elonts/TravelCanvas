import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoutePoints } from '../lib/route-points.mjs';

const origin = { lng: 121.47, lat: 31.23, verified: true };
const request = { origin: '上海', startDate: '2026-09-10' };
const stops = [
  { id: 'a', city: '杭州', name: '景点甲', time: '09:00', lng: 120.1, lat: 30.2, verified: true },
  { id: 'b', city: '杭州', name: '景点乙', time: '14:30', lng: 120.2, lat: 30.3, verified: true },
];
const days = [{ city: '杭州', date: '2026-09-10', stops }];
const restaurant = { id: 'r1', name: '测试餐厅', lng: 120.15, lat: 30.25 };
const food = { meals: [{ slot: { id: 'lunch', dayIndex: 0, previous: stops[0], earliest: 720, label: '午餐' }, options: [{ restaurant }], selectedId: 'r1' }] };

test('map points include origin, attractions and selected meals in chronological order', () => {
  const points = createRoutePoints(origin, request, days, food);
  assert.deepEqual(points.map(point => point.name), ['上海', '景点甲', '测试餐厅', '景点乙']);
  assert.deepEqual(points.map(point => point.order), [1, 2, 3, 4]);
  assert.deepEqual(points.map(point => point.kind), ['origin', 'attraction', 'restaurant', 'attraction']);
});

test('unlocated and unselected places are not shown as verified map markers', () => {
  const noSelection = { meals: [{ ...food.meals[0], selectedId: null }] };
  const input = [{ ...days[0], stops: [...stops, { ...stops[0], id: 'unknown', name: '待核验', lng: 0, lat: 0 }] }];
  assert.deepEqual(createRoutePoints(null, request, input, noSelection).map(point => point.name), ['景点甲', '景点乙']);
});

test('booked hotels appear as the verified start and end points of each day', () => {
  const hotel = { poiId: 'hotel-1', name: '测试酒店', address: '酒店地址', lng: 120.12, lat: 30.22, verified: true };
  const anchored = [{ ...days[0], startHotel: hotel, endHotel: hotel }];
  const points = createRoutePoints(null, request, anchored, { meals: [] });
  assert.deepEqual(points.map(point => point.kind), ['hotel', 'attraction', 'attraction', 'hotel']);
  assert.deepEqual(points.filter(point => point.kind === 'hotel').map(point => point.time), ['08:30', '返程']);
});

test('arrival day map order is station, arrival hotel, attractions and return hotel', () => {
  const hotel = { poiId: 'hotel-1', name: '测试酒店', address: '酒店地址', lng: 120.12, lat: 30.22, verified: true };
  const hub = { poiId: 'station-1', name: '杭州东站', address: '车站地址', lng: 120.21, lat: 30.29, verified: true, kind: 'station', time: '2026-09-10T15:20:00+08:00' };
  const anchored = [{ ...days[0], startHub: hub, arrivalHotel: hotel, arrivalHotelTime: '15:55', endHotel: hotel, endHotelTime: '20:30' }];
  const points = createRoutePoints(null, request, anchored, { meals: [] });
  assert.deepEqual(points.map(point => point.kind), ['station', 'hotel', 'attraction', 'attraction', 'hotel']);
  assert.deepEqual(points.slice(0, 2).map(point => point.name), ['杭州东站', '测试酒店']);
});

test('self-drive arrival still visits the booked hotel before attractions', () => {
  const hotel = { poiId: 'hotel-1', name: '测试酒店', address: '酒店地址', lng: 120.12, lat: 30.22, verified: true };
  const anchored = [{ ...days[0], arrivalHotel: hotel, arrivalHotelTime: '09:00', endHotel: hotel }];
  const points = createRoutePoints(null, request, anchored, { meals: [] });
  assert.deepEqual(points.map(point => point.kind), ['hotel', 'attraction', 'attraction', 'hotel']);
  assert.deepEqual(points.filter(point => point.kind === 'hotel').map(point => point.hotelRole), ['arrival', 'end']);
});

test('entertainment route points stay immediately before or after their selected anchor', () => {
  const anchoredStopId = `stop:${days[0].date}:${stops[0].id}`;
  const entertainment = { id: 'fun', poiId: 'fun-poi', kind: 'entertainment', name: '测试剧本杀', time: '11:00', lng: 120.11, lat: 30.21, verified: true, anchorPointId: anchoredStopId, position: 'after' };
  const points = createRoutePoints(null, request, [{ ...days[0], stops: [stops[0], entertainment, stops[1]] }], { meals: [] });
  assert.deepEqual(points.map(point => point.name), ['景点甲', '测试剧本杀', '景点乙']);
});

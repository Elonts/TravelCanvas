import test from 'node:test';
import assert from 'node:assert/strict';
import { attachHotelAnchors, verifyBookedHotels } from '../lib/booked-hotels.mjs';

const hotel = (name, checkIn, checkOut) => ({ id: name, poiId: name, city: '杭州', name, address: '测试地址', addressHint: '', checkIn, checkOut, lng: 120, lat: 30, verified: true });
const days = ['2026-09-10', '2026-09-11', '2026-09-12'].map(date => ({ city: '杭州', date, stops: [{ name: `${date}景点`, lng: 121, lat: 31 }] }));

test('hotel anchors follow check-in, middle-night, checkout and same-day switch rules', () => {
  const result = attachHotelAnchors(days, [hotel('酒店甲', '2026-09-10', '2026-09-11'), hotel('酒店乙', '2026-09-11', '2026-09-12')], stops => stops);
  assert.equal(result[0].startHotel, null); assert.equal(result[0].arrivalHotel.name, '酒店甲'); assert.equal(result[0].endHotel.name, '酒店甲');
  assert.equal(result[1].startHotel.name, '酒店甲'); assert.equal(result[1].arrivalHotel.name, '酒店乙'); assert.equal(result[1].endHotel.name, '酒店乙');
  assert.equal(result[2].startHotel.name, '酒店乙'); assert.equal(result[2].endHotel, null);
});

test('booked hotel must be verified and is never silently replaced by a city center', async () => {
  const request = { bookedHotels: [{ city: '杭州', name: '准确酒店', addressHint: '', checkIn: '2026-09-10', checkOut: '2026-09-11' }] };
  const verified = await verifyBookedHotels(request, { hotel: async name => ({ poiId: 'p1', name, address: '地址', lng: 120, lat: 30 }) });
  assert.equal(verified[0].name, '准确酒店');
  await assert.rejects(() => verifyBookedHotels(request, { hotel: async () => null }), /没有准确找到/);
});

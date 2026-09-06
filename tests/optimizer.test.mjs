import test from 'node:test';
import assert from 'node:assert/strict';
import { orderStops } from '../lib/optimizer.mjs';

test('keeps the first stop and orders remaining stops by proximity', () => {
  const stops = [{ id: 'start', lng: 0, lat: 0 }, { id: 'far', lng: 9, lat: 9 }, { id: 'near', lng: 1, lat: 1 }];
  assert.deepEqual(orderStops(stops).map(stop => stop.id), ['start', 'near', 'far']);
});

test('does not mutate the original stop collection', () => {
  const stops = [{ lng: 0, lat: 0 }, { lng: 2, lat: 2 }];
  orderStops(stops);
  assert.equal(stops.length, 2);
});

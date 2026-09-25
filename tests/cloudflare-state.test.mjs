import test from 'node:test';
import assert from 'node:assert/strict';
import { TravelState } from '../workers/travel-state.mjs';

function fakeState() {
  const values = new Map(); let alarm = null;
  return {
    values,
    get alarm() { return alarm; },
    storage: {
      async get(key) { return structuredClone(values.get(key)); },
      async put(key, value) { values.set(key, structuredClone(value)); },
      async deleteAll() { values.clear(); },
      async setAlarm(value) { alarm = value; },
    },
  };
}

const rateRequest = body => new Request('https://state.internal/rate-limit', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('Cloudflare state object persists records and rejects stale revisions', async () => {
  const state = fakeState(); const object = new TravelState(state);
  const created = await object.fetch(new Request('https://state.internal/record', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: { revision: 0, name: '方案' }, expectedVersion: 0 }),
  }));
  assert.equal(created.status, 200);
  assert.ok(state.alarm > Date.now());
  const read = await object.fetch(new Request('https://state.internal/record'));
  assert.deepEqual((await read.json()).value, { revision: 0, name: '方案' });
  const updated = await object.fetch(new Request('https://state.internal/record', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: { revision: 1 }, expectedValueRevision: 0 }),
  }));
  assert.equal(updated.status, 200);
  const stale = await object.fetch(new Request('https://state.internal/record', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: { revision: 1 }, expectedValueRevision: 0 }),
  }));
  assert.equal(stale.status, 409);
});

test('Cloudflare state object enforces a bounded rate window', async () => {
  const object = new TravelState(fakeState());
  assert.equal((await object.fetch(rateRequest({ limit: 2, windowMs: 60000 }))).status, 200);
  assert.equal((await object.fetch(rateRequest({ limit: 2, windowMs: 60000 }))).status, 200);
  const blocked = await object.fetch(rateRequest({ limit: 2, windowMs: 60000 }));
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).allowed, false);
});

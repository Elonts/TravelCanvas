import test from 'node:test';
import assert from 'node:assert/strict';
import { queryWeather } from '../lib/weather.mjs';

const location = { lng: 120.15, lat: 30.27, adcode: '330100' };

test('uses AMap for a date returned by its short-range forecast', async () => {
  const calls = [];
  const result = await queryWeather('杭州', '2026-09-20', location, { AMAP_API_KEY: 'test' }, async url => {
    calls.push(String(url));
    return new Response(JSON.stringify({ status: '1', forecasts: [{ reporttime: '2026-09-19 11:00:00', casts: [{ date: '2026-09-20', dayweather: '晴', nightweather: '多云', daytemp: '28', nighttemp: '20' }] }] }));
  });
  assert.equal(result.provider, '高德天气');
  assert.equal(result.high, 28);
  assert.equal(calls.length, 1);
});

test('falls back to Open-Meteo with verified AMap coordinates and never geocodes by city name', async () => {
  const calls = [];
  const result = await queryWeather('杭州', '2026-10-01', location, { AMAP_API_KEY: 'test' }, async url => {
    calls.push(String(url));
    if (String(url).includes('restapi.amap.com')) return new Response(JSON.stringify({ status: '1', forecasts: [{ casts: [] }] }));
    return new Response(JSON.stringify({ daily: { weather_code: [61], temperature_2m_max: [23.4], temperature_2m_min: [17.2], precipitation_probability_max: [70] } }));
  });
  assert.equal(result.provider, 'Open-Meteo');
  assert.match(calls[1], /latitude=30\.27/);
  assert.doesNotMatch(calls[1], /geocoding-api/);
});

test('out-of-range or incomplete forecasts remain pending instead of becoming zeroes', async () => {
  const result = await queryWeather('杭州', '2030-01-01', location, {}, async () => new Response(JSON.stringify({ reason: 'past or too far' }), { status: 400 }));
  assert.equal(result.state, 'pending');
  assert.equal(result.high, null);
  assert.equal(result.low, null);
  assert.equal(result.rain, null);
});

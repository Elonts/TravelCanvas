// Only loaded by the smoke-test child process; never imported by application code.
import { fixtureFetch } from './food-fixture.mjs';
const mode = process.env.TRAVELCANVAS_TEST_MODE;
if (!['fixtures', 'offline'].includes(mode)) throw Error('Test preload requires explicit test mode');
const original = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return original(input, options);
  if (mode === 'offline') throw Error('Offline test: external network disabled');
  return fixtureFetch(url, options);
};

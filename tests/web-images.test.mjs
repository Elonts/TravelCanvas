import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingWebImages } from '../lib/web-images.mjs';
import { getWebImage, getWebImages, registerWebImage, registerWebImages } from '../lib/web-image-store.mjs';
import { ImageProxyError, proxyFirstAvailableImage, proxyImage } from '../lib/image-proxy.mjs';

const secret = 'test-secret';

test('missing AMap image gets a Tavily image through an opaque server proxy', async () => {
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.include_images, true);
    assert.equal(body.include_image_descriptions, true);
    assert.match(body.query, /杭州.*西湖/);
    return Response.json({ images: [{ url: 'https://images.example.com/west-lake.jpg', description: '西湖实景' }], results: [{ url: 'https://example.com/west-lake', title: '西湖' }] });
  };
  const [candidate] = await fillMissingWebImages([{ city: '杭州', name: '西湖', imageUrl: null }], { TAVILY_API_KEY: secret }, fetcher);
  assert.match(candidate.imageUrl, /^\/api\/web-image\?t=/);
  assert.equal(candidate.imageAttribution.kind, 'web');
  assert.equal(candidate.imageAttribution.sourceUrl, 'https://example.com/west-lake');
  const token = new URL(`http://local${candidate.imageUrl}`).searchParams.get('t');
  assert.equal(await getWebImage(token, secret), 'https://images.example.com/west-lake.jpg');
});

test('existing images skip search and unsafe image URLs are rejected', async () => {
  const item = { city: '杭州', name: '西湖', imageUrl: '/api/poi-image?url=x' };
  assert.equal((await fillMissingWebImages([item], { TAVILY_API_KEY: 'test' }, () => assert.fail('must not fetch')))[0], item);
  assert.equal(await registerWebImage('http://127.0.0.1/private.png', secret), null);
  assert.equal(await registerWebImage('https://user:pass@example.com/private.png', secret), null);
  assert.equal(await registerWebImage('https://127.0.0.1/private.png', secret), null);
  assert.equal(await registerWebImage('https://metadata.internal/private.png', secret), null);
});

test('web image token rejects tampering and expiration', async () => {
  const now = Date.now();
  const proxyUrl = await registerWebImage('https://images.example.com/photo.jpg', secret, now);
  const token = new URL(`http://local${proxyUrl}`).searchParams.get('t');
  assert.equal(await getWebImage(`${token}x`, secret, now), null);
  assert.equal(await getWebImage(token, secret, now + 30 * 60 * 1000 + 1), null);
});

test('web image token keeps several safe fallbacks for blocked source sites', async () => {
  const proxyUrl = await registerWebImages([
    'https://blocked.example.com/photo.jpg',
    'http://127.0.0.1/private.png',
    'https://working.example.com/photo.jpg',
  ], secret);
  const token = new URL(`http://local${proxyUrl}`).searchParams.get('t');
  assert.deepEqual(await getWebImages(token, secret), [
    'https://blocked.example.com/photo.jpg',
    'https://working.example.com/photo.jpg',
  ]);
});

test('image proxy uses Worker-compatible fetch options and bounds the response', async () => {
  let receivedInit;
  const response = await proxyImage('https://images.example.com/photo.jpg', {
    fetcher: async (_url, init) => {
      receivedInit = init;
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    },
  });
  assert.equal('cache' in receivedInit, false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2, 3]));

  await assert.rejects(() => proxyImage('https://images.example.com/large.jpg', {
    maxBytes: 2,
    fetcher: async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
  }), error => error instanceof ImageProxyError && error.code === 'too_large');
});

test('image proxy tries the next search result when a source blocks hotlinking', async () => {
  const attempts = [];
  const response = await proxyFirstAvailableImage(['https://blocked.example.com/a.jpg', 'https://working.example.com/b.jpg'], {
    fetcher: async url => {
      attempts.push(url);
      return url.includes('blocked')
        ? new Response('forbidden', { status: 403, headers: { 'content-type': 'text/plain' } })
        : new Response(new Uint8Array([4, 5, 6]), { headers: { 'content-type': 'image/jpeg' } });
    },
  });
  assert.deepEqual(attempts, ['https://blocked.example.com/a.jpg', 'https://working.example.com/b.jpg']);
  assert.equal(response.status, 200);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { fillMissingWebImages } from '../lib/web-images.mjs';
import { clearWebImagesForTest, getWebImage, registerWebImage } from '../lib/web-image-store.mjs';

test('missing AMap image gets a Tavily image through an opaque server proxy', async () => {
  clearWebImagesForTest();
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.include_images, true);
    assert.equal(body.include_image_descriptions, true);
    assert.match(body.query, /杭州.*西湖/);
    return Response.json({ images: [{ url: 'https://images.example.com/west-lake.jpg', description: '西湖实景' }], results: [{ url: 'https://example.com/west-lake', title: '西湖' }] });
  };
  const [candidate] = await fillMissingWebImages([{ city: '杭州', name: '西湖', imageUrl: null }], { TAVILY_API_KEY: 'test' }, fetcher);
  assert.match(candidate.imageUrl, /^\/api\/web-image\?id=/);
  assert.equal(candidate.imageAttribution.kind, 'web');
  assert.equal(candidate.imageAttribution.sourceUrl, 'https://example.com/west-lake');
  const id = new URL(`http://local${candidate.imageUrl}`).searchParams.get('id');
  assert.equal(getWebImage(id), 'https://images.example.com/west-lake.jpg');
});

test('existing images skip search and unsafe image URLs are rejected', async () => {
  const item = { city: '杭州', name: '西湖', imageUrl: '/api/poi-image?url=x' };
  assert.equal((await fillMissingWebImages([item], { TAVILY_API_KEY: 'test' }, () => assert.fail('must not fetch')))[0], item);
  assert.equal(registerWebImage('http://127.0.0.1/private.png'), null);
  assert.equal(registerWebImage('https://user:pass@example.com/private.png'), null);
});

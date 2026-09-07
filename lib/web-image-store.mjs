import { randomUUID } from 'node:crypto';

const STORE = Symbol.for('travelcanvas.webImageStore');
const root = globalThis;
if (!root[STORE]) root[STORE] = new Map();
const images = root[STORE];
const TTL = 30 * 60 * 1000;

export function registerWebImage(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const id = randomUUID();
    images.set(id, { url: url.toString(), expiresAt: Date.now() + TTL });
    return `/api/web-image?id=${encodeURIComponent(id)}`;
  } catch { return null; }
}

export function getWebImage(id) {
  const value = images.get(id);
  if (!value || value.expiresAt <= Date.now()) { images.delete(id); return null; }
  return value.url;
}

export function clearWebImagesForTest() { images.clear(); }

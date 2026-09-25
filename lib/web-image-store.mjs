const TTL = 30 * 60 * 1000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function blockedIpv4(hostname) {
  const parts = hostname.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

export function safeWebImageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!hostname.includes('.') || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.home.arpa')) return null;
    if (blockedIpv4(hostname) || hostname.includes(':')) return null;
    return url.toString();
  } catch { return null; }
}

async function encryptionKey(secret) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`travelcanvas:web-image:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function registerWebImages(rawUrls, secret, now = Date.now()) {
  const urls = [...new Set(rawUrls.map(safeWebImageUrl).filter(Boolean))].slice(0, 5);
  if (!urls.length || !secret) return null;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const payload = encoder.encode(JSON.stringify({ urls, expiresAt: now + TTL }));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), payload));
    return `/api/web-image?t=${encodeURIComponent(`${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`)}`;
  } catch { return null; }
}

export function registerWebImage(rawUrl, secret, now = Date.now()) {
  return registerWebImages([rawUrl], secret, now);
}

export async function getWebImages(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  try {
    const [rawIv, rawEncrypted, extra] = token.split('.');
    if (!rawIv || !rawEncrypted || extra) return null;
    const iv = base64UrlToBytes(rawIv);
    if (iv.byteLength !== 12) return null;
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await encryptionKey(secret), base64UrlToBytes(rawEncrypted));
    const payload = JSON.parse(decoder.decode(decrypted));
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) return null;
    const urls = Array.isArray(payload.urls) ? payload.urls.map(safeWebImageUrl).filter(Boolean).slice(0, 5) : [];
    return urls.length ? urls : null;
  } catch { return null; }
}

export async function getWebImage(token, secret, now = Date.now()) {
  return (await getWebImages(token, secret, now))?.[0] || null;
}

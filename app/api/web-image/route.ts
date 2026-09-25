import { NextRequest } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getWebImage } from '../../../lib/web-image-store.mjs';

function blockedAddress(address: string) {
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return blockedAddress(lower.slice(7));
  if (lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || /^fe[89ab]/.test(lower) || lower.startsWith('ff') || lower.startsWith('2001:db8')) return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  const parts = address.split('.').map(Number);
  const c = parts[2];
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

export async function GET(request: NextRequest) {
  if (process.env.TRAVELCANVAS_WEB_IMAGES === 'off') return Response.json({ error: '联网补图在当前部署中已关闭' }, { status: 404 });
  const url = getWebImage(request.nextUrl.searchParams.get('id') || '');
  if (!url) return Response.json({ error: '图片链接已失效，请重新查询' }, { status: 404 });
  try {
    const target = new URL(url);
    const addresses = await lookup(target.hostname, { all: true });
    if (!addresses.length || addresses.some(item => blockedAddress(item.address))) throw Error('unsafe host');
    const upstream = await fetch(target, { signal: AbortSignal.timeout(8000), redirect: 'manual', headers: { Accept: 'image/avif,image/webp,image/*' } });
    const type = upstream.headers.get('content-type') || '';
    const length = Number(upstream.headers.get('content-length') || 0);
    if (!upstream.ok || !type.startsWith('image/') || length > 5_000_000) throw Error('invalid image');
    const body = await upstream.arrayBuffer();
    if (body.byteLength > 5_000_000) throw Error('image too large');
    return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=1800', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: '联网图片暂时无法加载' }, { status: 502 }); }
}

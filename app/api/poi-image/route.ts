import { safeAmapImageUrl } from '../../../lib/provider-urls.mjs';

export const runtime = 'nodejs';
const maxImageBytes = 5 * 1024 * 1024;

async function readBoundedImage(response: Response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxImageBytes) throw Error('too large');
  if (!response.body) throw Error('empty image');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxImageBytes) { await reader.cancel(); throw Error('too large'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}

export async function GET(request: Request) {
  const source = safeAmapImageUrl(new URL(request.url).searchParams.get('url') || '');
  if (!source) return new Response('Invalid image source', { status: 400 });
  try {
    const response = await fetch(source, { cache: 'force-cache', redirect: 'error', signal: AbortSignal.timeout(8000) });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.startsWith('image/')) return new Response('Image unavailable', { status: 404 });
    const bytes = await readBoundedImage(response);
    return new Response(bytes, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'too large') return new Response('Image too large', { status: 413 });
    return new Response('Image unavailable', { status: 404 });
  }
}

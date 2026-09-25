import { safeAmapImageUrl } from '../../../lib/provider-urls.mjs';
import { ImageProxyError, proxyImage } from '../../../lib/image-proxy.mjs';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const source = safeAmapImageUrl(new URL(request.url).searchParams.get('url') || '');
  if (!source) return new Response('Invalid image source', { status: 400 });
  try {
    return await proxyImage(source, { cacheControl: 'public, max-age=86400, stale-while-revalidate=604800' });
  } catch (error) {
    if (error instanceof ImageProxyError && error.code === 'too_large') return new Response('Image too large', { status: 413 });
    return new Response('Image unavailable', { status: 404 });
  }
}

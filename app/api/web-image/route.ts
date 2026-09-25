import { NextRequest } from 'next/server';
import { getWebImages } from '../../../lib/web-image-store.mjs';
import { ImageProxyError, proxyFirstAvailableImage } from '../../../lib/image-proxy.mjs';

export async function GET(request: NextRequest) {
  if (process.env.TRAVELCANVAS_WEB_IMAGES === 'off') return Response.json({ error: '联网补图在当前部署中已关闭' }, { status: 404 });
  const urls = await getWebImages(request.nextUrl.searchParams.get('t') || '', process.env.TAVILY_API_KEY);
  if (!urls) return Response.json({ error: '图片链接已失效，请重新查询' }, { status: 404 });
  try {
    return await proxyFirstAvailableImage(urls, { maxBytes: 5_000_000, cacheControl: 'public, max-age=1800' });
  } catch (error) {
    const status = error instanceof ImageProxyError && error.code === 'too_large' ? 413 : 502;
    return Response.json({ error: status === 413 ? '联网图片过大' : '联网图片暂时无法加载' }, { status });
  }
}

import { registerWebImages } from './web-image-store.mjs';

const attribution = (label, sourceUrl, queriedAt, kind) => ({ label, sourceUrl, queriedAt, kind });
const safeSourceUrl = raw => {
  try { const url = new URL(raw); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
};

export async function fillMissingWebImages(items, env = process.env, fetcher = fetch) {
  if (!env.TAVILY_API_KEY || env.TRAVELCANVAS_WEB_IMAGES === 'off') return items;
  const updated = [...items];
  for (let index = 0; index < updated.length; index++) {
    const item = updated[index];
    if (item.imageUrl) continue;
    try {
      const queriedAt = new Date().toISOString();
      const response = await fetcher('https://api.tavily.com/search', {
        method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${item.city} ${item.name} 实景 图片`, search_depth: 'basic', max_results: 5, include_answer: false, include_images: true, include_image_descriptions: true }),
      });
      if (!response.ok) continue;
      const json = await response.json();
      const images = (json.images || []).map(image => typeof image === 'string' ? { url: image, description: '' } : image).filter(image => image?.url);
      const proxyUrl = await registerWebImages(images.map(image => image.url), env.TAVILY_API_KEY);
      if (!proxyUrl) continue;
      const sourceUrl = safeSourceUrl(json.results?.find(result => result?.url)?.url || '');
      updated[index] = { ...item, imageUrl: proxyUrl, imageAttribution: attribution('联网搜索图片，版权归来源站点', sourceUrl, queriedAt, 'web') };
    } catch { }
  }
  return updated;
}

export function amapImageAttribution(imageUrl, queriedAt) {
  return imageUrl ? attribution('高德地点图片', null, queriedAt, 'amap') : null;
}

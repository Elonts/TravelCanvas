import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createMapProvider } from '../../../../lib/food-providers.mjs';
import { readJson } from '../../../../lib/requests.mjs';
import { enforceRateLimit } from '../../../../lib/runtime-stores';

export const runtime = 'nodejs';
const schema = z.object({ city: z.string().trim().min(2).max(60), query: z.string().trim().min(2).max(160), kind: z.enum(['hotel', 'station', 'airport', 'origin']) });

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'places-search', 30);
  if (limited) return limited;
  const body = await readJson(request).catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请输入有效的地点名称。' }, { status: 400 });
  if (!process.env.AMAP_API_KEY) return NextResponse.json({ error: '未配置高德服务，暂时无法核验地点。' }, { status: 503 });
  const map = createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 250 });
  const kind = parsed.data.kind === 'origin' ? 'place' : parsed.data.kind;
  const candidates = await map.searchPlaces(parsed.data.query, parsed.data.city, kind);
  return NextResponse.json({ candidates: candidates.slice(0, 5), queriedAt: new Date().toISOString(), source: '高德地图 POI' }, { headers: { 'Cache-Control': 'no-store' } });
}

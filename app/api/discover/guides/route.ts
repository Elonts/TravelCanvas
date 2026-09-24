import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enrichDiscoveryWithGuides } from '../../../../lib/discovery';
import { discoveryStore } from '../../../../lib/discovery-store.mjs';
import { readJson } from '../../../../lib/requests.mjs';

export const runtime = 'nodejs';
const schema = z.object({ discoveryId: z.string().uuid() });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '攻略检索请求无效。' }, { status: 400 });
  try {
    const current = discoveryStore.get(parsed.data.discoveryId);
    const enriched = await enrichDiscoveryWithGuides(current);
    return NextResponse.json(discoveryStore.replace(parsed.data.discoveryId, enriched), { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '公开攻略检索失败，请稍后重试。' }, { status: 503 });
  }
}

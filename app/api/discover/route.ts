import { NextResponse } from 'next/server';
import { discoverCandidates } from '../../../lib/discovery';
import { enforceRateLimit, runtimeDiscoveryStore } from '../../../lib/runtime-stores';
import { requestSchema, readJson } from '../../../lib/requests.mjs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'discover', 4);
  if (limited) return limited;
  const body = await readJson(request).catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请求无效：请检查出发地、目的地数量、日期、预算、人数、已订酒店日期和帖子链接。' }, { status: 400 });
  try {
    return NextResponse.json(await runtimeDiscoveryStore.save(await discoverCandidates(parsed.data)), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: '候选发现服务暂不可用，请稍后重试。' }, { status: 503 });
  }
}

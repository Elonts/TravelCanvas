import { NextResponse } from 'next/server';
import { discoverCustomCandidates } from '../../../../lib/discovery';
import { enforceRateLimit, runtimeDiscoveryStore } from '../../../../lib/runtime-stores';
import { customCandidateSchema, readJson } from '../../../../lib/requests.mjs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'discover-custom', 12);
  if (limited) return limited;
  const body = await readJson(request).catch(() => null);
  const parsed = customCandidateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请检查城市、地点类型和地点名称。' }, { status: 400 });
  try {
    const discovery = await runtimeDiscoveryStore.get(parsed.data.discoveryId);
    const result = await discoverCustomCandidates(discovery.request, parsed.data.city, parsed.data.kind, parsed.data.names);
    if (!result.candidates.length) return NextResponse.json({ error: '没有找到准确地点，请补充完整景点名或饭店分店名。' }, { status: 404 });
    return NextResponse.json(await runtimeDiscoveryStore.append(parsed.data.discoveryId, result.candidates, result.warnings), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '自定义地点查询暂不可用。';
    return NextResponse.json({ error: message }, { status: message.includes('过期') ? 409 : 503 });
  }
}

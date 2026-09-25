import { NextResponse } from 'next/server';
import { mergeDiscoveryWithXhsSession } from '../../../../lib/discovery';
import { enforceRateLimit, runtimeDiscoveryStore } from '../../../../lib/runtime-stores';
import { readJson } from '../../../../lib/requests.mjs';
import { xhsSessionSchema } from '../../../../lib/xhs-session.mjs';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'discover-xhs', 8);
  if (limited) return limited;
  const parsed = xhsSessionSchema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '登录态搜索结果格式无效，已拒绝导入。' }, { status: 400 });
  try {
    const current = await runtimeDiscoveryStore.getVersioned(parsed.data.discoveryId);
    const merged = await mergeDiscoveryWithXhsSession(current.value, parsed.data);
    return NextResponse.json(await runtimeDiscoveryStore.replace(parsed.data.discoveryId, merged, current.version), { headers: { 'Cache-Control': 'no-store' } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : '登录态搜索结果处理失败。' }, { status: 503 });
  }
}

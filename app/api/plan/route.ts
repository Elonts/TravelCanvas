import { NextResponse } from 'next/server';
import { buildPlan } from '../../../lib/plan';
import { planStore } from '../../../lib/plan-store.mjs';
import { discoveryStore } from '../../../lib/discovery-store.mjs';
import { planSelectionSchema, readJson } from '../../../lib/requests.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const body = await readJson(request).catch(() => null);
  const parsed = planSelectionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请选择有效的候选地点后再生成路线。' }, { status: 400 });
  try {
    const discovery = discoveryStore.select(parsed.data.discoveryId, parsed.data.selectedIds);
    return NextResponse.json(planStore.save(await buildPlan(discovery.request, discovery.candidates, discovery.guideSources || [])), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '规划服务暂不可用，请稍后重试。';
    return NextResponse.json({ error: message }, { status: message.includes('过期') || message.includes('候选') || message.includes('选择') ? 409 : 503 });
  }
}

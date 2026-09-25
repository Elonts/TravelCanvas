import { NextResponse } from 'next/server';
import { enforceRateLimit, runtimePlanStore } from '../../../../lib/runtime-stores';
import { dayReplanSchema, readJson } from '../../../../lib/requests.mjs';
import { replanDay } from '../../../../lib/replan';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'plan-day', 20);
  if (limited) return limited;
  const body = await readJson(request).catch(() => null);
  const parsed = dayReplanSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '当天修改内容无效，请检查景点名称和娱乐选项。' }, { status: 400 });
  try {
    const plan = await runtimePlanStore.get(parsed.data.planId, parsed.data.revision);
    const updated = await replanDay(plan, parsed.data);
    return NextResponse.json(await runtimePlanStore.replace(parsed.data.planId, parsed.data.revision, updated), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '当天路线重新规划失败。';
    return NextResponse.json({ error: message }, { status: /过期|版本|变化|失效|无法容纳|无法安排/.test(message) ? 409 : 503 });
  }
}

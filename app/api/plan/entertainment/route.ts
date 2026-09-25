import { NextResponse } from 'next/server';
import { enforceRateLimit, runtimePlanStore } from '../../../../lib/runtime-stores';
import { entertainmentSearchSchema, readJson } from '../../../../lib/requests.mjs';
import { searchEntertainment } from '../../../../lib/replan';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'plan-entertainment', 20);
  if (limited) return limited;
  const body = await readJson(request).catch(() => null);
  const parsed = entertainmentSearchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请检查日期、娱乐类型和搜索内容。' }, { status: 400 });
  try {
    const plan = await runtimePlanStore.get(parsed.data.planId, parsed.data.revision);
    const updated = await searchEntertainment(plan, parsed.data);
    return NextResponse.json(await runtimePlanStore.replace(parsed.data.planId, parsed.data.revision, updated), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '娱乐地点查询失败。';
    return NextResponse.json({ error: message }, { status: /过期|版本|不存在|请选择/.test(message) ? 409 : 503 });
  }
}

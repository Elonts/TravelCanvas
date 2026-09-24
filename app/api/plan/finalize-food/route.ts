import { NextResponse } from 'next/server';
import { planStore } from '../../../../lib/plan-store.mjs';
import { finalizeFoodSchema, readJson } from '../../../../lib/requests.mjs';
import { finalizeFoodPlan } from '../../../../lib/replan';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const parsed = finalizeFoodSchema.safeParse(await readJson(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '餐厅确认请求无效。' }, { status: 400 });
  try {
    const plan = planStore.get(parsed.data.planId, parsed.data.revision);
    const updated = await finalizeFoodPlan(plan, parsed.data.selections);
    return NextResponse.json(planStore.replace(parsed.data.planId, parsed.data.revision, updated), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '最终路线生成失败。';
    return NextResponse.json({ error: message }, { status: /过期|版本|失效/.test(message) ? 409 : 422 });
  }
}

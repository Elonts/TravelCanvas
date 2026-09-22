import { NextResponse } from 'next/server';
import { planStore } from '../../../../lib/plan-store.mjs';
import { readJson, restaurantSearchSchema } from '../../../../lib/requests.mjs';
import { addRestaurantCandidates } from '../../../../lib/replan';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const body = await readJson(request).catch(() => null);
  const parsed = restaurantSearchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请填写有效的餐厅或分店名称。' }, { status: 400 });
  try {
    const plan = planStore.get(parsed.data.planId, parsed.data.revision);
    const updated = await addRestaurantCandidates(plan, parsed.data);
    return NextResponse.json(planStore.replace(parsed.data.planId, parsed.data.revision, updated), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '餐厅查询失败。';
    return NextResponse.json({ error: message }, { status: /过期|版本/.test(message) ? 409 : 503 });
  }
}

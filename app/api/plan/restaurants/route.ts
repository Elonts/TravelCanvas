import { NextResponse } from 'next/server';
import { enforceRateLimit, runtimePlanStore } from '../../../../lib/runtime-stores';
import { readJson, restaurantSearchSchema } from '../../../../lib/requests.mjs';
import { addRestaurantCandidates, resolveRestaurantBranch } from '../../../../lib/replan';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'plan-restaurants', 20);
  if (limited) return limited;
  const body = await readJson(request).catch(() => null);
  const parsed = restaurantSearchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请填写有效的餐厅或分店名称。' }, { status: 400 });
  try {
    const plan = await runtimePlanStore.get(parsed.data.planId, parsed.data.revision);
    const updated = 'names' in parsed.data
      ? await addRestaurantCandidates(plan, parsed.data)
      : await resolveRestaurantBranch(plan, parsed.data);
    return NextResponse.json(await runtimePlanStore.replace(parsed.data.planId, parsed.data.revision, updated), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '餐厅查询失败。';
    return NextResponse.json({ error: message }, { status: /过期|版本/.test(message) ? 409 : /多个分店|完整分店名|没有找到准确餐厅/.test(message) ? 422 : 503 });
  }
}

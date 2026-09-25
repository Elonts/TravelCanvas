import { NextResponse } from 'next/server';
import { enforceRateLimit, runtimePlanStore } from '../../../lib/runtime-stores';
import { changeSchema, readJson } from '../../../lib/requests.mjs';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'plan-change', 30);
  if (limited) return limited;
  const body = await readJson(request, 4000).catch(() => null);
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '换店请求无效。' }, { status: 400 });
  try {
    return NextResponse.json(await runtimePlanStore.change(parsed.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '调整失败，请重试。' }, { status: 409 });
  }
}

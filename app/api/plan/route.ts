import { NextResponse } from 'next/server';
import { buildPlan, requestSchema } from '../../../lib/plan';
import { planStore } from '../../../lib/plan-store.mjs';
import { readJson } from '../../../lib/requests.mjs';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const body = await readJson(request).catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '请求无效：请检查日期、预算、人数和帖子链接。' }, { status: 400 });
  try { return NextResponse.json(planStore.save(await buildPlan(parsed.data)), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: '规划服务暂不可用，请稍后重试。' }, { status: 503 }); }
}

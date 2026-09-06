import { NextResponse } from 'next/server';
import { buildPlan, requestSchema } from '../../../lib/plan';
export async function POST(request: Request) {
  try { return NextResponse.json(await buildPlan(requestSchema.parse(await request.json()))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '请求无效' }, { status: 400 }); }
}

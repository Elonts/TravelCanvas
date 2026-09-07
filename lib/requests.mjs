import { z } from 'zod';
import { safeSourceUrl } from './food-providers.mjs';
import { chinaCitySet } from './china-regions.mjs';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效').refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, '日期不存在');
export const requestSchema = z.object({
  origin: z.string().trim().min(2).max(60),
  destinations: z.array(z.string().trim().min(2).max(60)).min(1).max(10)
    .refine(cities => new Set(cities).size === cities.length, '目的地不能重复')
    .refine(cities => cities.every(city => chinaCitySet.has(city)), '目的地必须从城市列表中选择'),
  startDate: date,
  days: z.coerce.number().int().min(1).max(10), budget: z.coerce.number().min(500).max(1000000),
  budgetBasis: z.enum(['group', 'person']).default('group'), travelers: z.coerce.number().int().min(1).max(8),
  transport: z.enum(['walk', 'transit', 'drive']), preferences: z.string().max(300).default(''), constraints: z.string().max(300).default(''),
  entertainmentPreferences: z.string().max(300).default(''),
  foodPreferences: z.string().max(300).default(''), dietary: z.string().max(200).default(''),
  foodMode: z.enum(['route', 'food']).default('route'), maxDetour: z.coerce.number().int().min(0).max(90).default(20),
  mealMinutes: z.coerce.number().int().min(30).max(120).default(60), queueMinutes: z.coerce.number().int().min(0).max(120).default(20),
  noteText: z.string().max(12000).default(''), noteUrl: z.string().max(2000).default('').refine(value => !value || safeSourceUrl(value) !== null, '请提供有效的小红书 HTTPS 帖子或分享链接'),
  noteDate: z.union([z.literal(''), date]).default(''),
}).superRefine((value, context) => {
  if (value.destinations.length > value.days) context.addIssue({ code: 'custom', path: ['destinations'], message: '每个目的地至少需要安排一天' });
});
export const changeSchema = z.object({ planId: z.string().uuid(), revision: z.number().int().nonnegative(), mealId: z.string().min(1).max(80), action: z.enum(['lock', 'cheaper', 'closer', 'select']), restaurantId: z.string().min(1).max(100).optional() });
export const planSelectionSchema = z.object({ discoveryId: z.string().uuid(), selectedIds: z.array(z.string().min(3).max(300)).min(1).max(60).refine(ids => new Set(ids).size === ids.length, '候选不能重复') });
export const customCandidateSchema = z.object({
  discoveryId: z.string().uuid(), city: z.string().trim().min(2).max(60),
  kind: z.enum(['attraction', 'food']), names: z.array(z.string().trim().min(2).max(100)).min(1).max(12),
});
export const dayReplanSchema = z.object({
  planId: z.string().uuid(), revision: z.number().int().nonnegative(), dayIndex: z.number().int().min(0).max(9),
  replacements: z.array(z.object({ stopId: z.string().min(1).max(200), name: z.string().trim().min(2).max(100) })).max(12).default([]),
  removedStopIds: z.array(z.string().min(1).max(200)).max(12).default([]),
  entertainmentId: z.string().min(1).max(200).nullable().default(null),
});

/** Read a bounded UTF-8 body without trusting Content-Length. */
export async function readJson(request, maxBytes = 64000) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('请求内容为空');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw Error('请求内容过长'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}

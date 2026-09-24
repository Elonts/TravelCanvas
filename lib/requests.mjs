import { z } from 'zod';
import { safeSourceUrl } from './food-providers.mjs';
import { chinaCitySet } from './china-regions.mjs';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式无效').refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, '日期不存在');
const bookedHotel = z.object({
  city: z.string().trim().min(2).max(60), name: z.string().trim().min(2).max(120), addressHint: z.string().trim().max(160).default(''),
  checkIn: date, checkOut: date,
  poiId: z.string().trim().min(1).max(120).optional(), address: z.string().trim().max(240).optional(),
  lng: z.number().min(73).max(135).optional(), lat: z.number().min(18).max(54).optional(),
}).refine(value => value.checkOut > value.checkIn, { message: '酒店退房日期必须晚于入住日期', path: ['checkOut'] });
const verifiedPlace = z.object({
  poiId: z.string().trim().min(1).max(120), name: z.string().trim().min(2).max(160), address: z.string().trim().max(240),
  lng: z.number().min(73).max(135), lat: z.number().min(18).max(54),
});
const intercityLeg = z.object({
  fromCity: z.string().trim().min(2).max(60), toCity: z.string().trim().min(2).max(60),
  mode: z.enum(['high_speed_rail', 'train', 'flight', 'drive']),
  departureHub: verifiedPlace.optional(), arrivalHub: verifiedPlace.optional(),
  departureAt: z.string().datetime({ offset: true }).optional(), arrivalAt: z.string().datetime({ offset: true }).optional(),
  tripNo: z.string().trim().max(40).default(''),
});
export const requestSchema = z.object({
  origin: z.string().trim().min(2).max(60),
  destinations: z.array(z.string().trim().min(2).max(60)).min(1).max(10)
    .refine(cities => new Set(cities).size === cities.length, '目的地不能重复')
    .refine(cities => cities.every(city => chinaCitySet.has(city)), '目的地必须从城市列表中选择'),
  startDate: date,
  days: z.coerce.number().int().min(1).max(10), budget: z.coerce.number().min(500).max(1000000),
  budgetBasis: z.enum(['group', 'person']).default('group'), travelers: z.coerce.number().int().min(1).max(8),
  localTransport: z.enum(['walk', 'transit', 'drive']).optional(), transport: z.enum(['walk', 'transit', 'drive']).default('transit'),
  intercityLegs: z.array(intercityLeg).max(10).default([]), preferences: z.string().max(300).default(''), constraints: z.string().max(300).default(''),
  entertainmentPreferences: z.string().max(300).default(''),
  foodPreferences: z.string().max(300).default(''), dietary: z.string().max(200).default(''),
  foodMode: z.enum(['route', 'food']).default('route'), maxDetour: z.coerce.number().int().min(0).max(90).default(20),
  mealMinutes: z.coerce.number().int().min(30).max(120).default(60), queueMinutes: z.coerce.number().int().min(0).max(120).default(20),
  noteText: z.string().max(12000).default(''), noteUrl: z.string().max(2000).default('').refine(value => !value || safeSourceUrl(value) !== null, '请提供有效的小红书 HTTPS 帖子或分享链接'),
  noteDate: z.union([z.literal(''), date]).default(''),
  bookedHotels: z.array(bookedHotel).max(10).default([]),
}).superRefine((value, context) => {
  if (value.destinations.length > value.days) context.addIssue({ code: 'custom', path: ['destinations'], message: '每个目的地至少需要安排一天' });
  const tripEnd = new Date(Date.parse(`${value.startDate}T00:00:00Z`) + value.days * 86400000).toISOString().slice(0, 10);
  value.bookedHotels.forEach((hotel, index) => {
    if (!value.destinations.includes(hotel.city)) context.addIssue({ code: 'custom', path: ['bookedHotels', index, 'city'], message: '酒店城市必须是已选目的地' });
    if (hotel.checkIn < value.startDate || hotel.checkIn >= tripEnd || hotel.checkOut > tripEnd) context.addIssue({ code: 'custom', path: ['bookedHotels', index], message: '酒店入住日期必须在本次行程范围内' });
    if (value.bookedHotels.some((other, otherIndex) => otherIndex < index && other.city === hotel.city && hotel.checkIn < other.checkOut && other.checkIn < hotel.checkOut)) context.addIssue({ code: 'custom', path: ['bookedHotels', index], message: '同一城市的酒店入住日期不能重叠' });
  });
  if (value.intercityLegs.length) {
    const expected = [value.origin, ...value.destinations];
    if (value.intercityLegs.length !== expected.length - 1) context.addIssue({ code: 'custom', path: ['intercityLegs'], message: '请为每一段跨城行程选择交通方式' });
    value.intercityLegs.forEach((leg, index) => {
      if (leg.fromCity !== expected[index] || leg.toCity !== expected[index + 1]) context.addIssue({ code: 'custom', path: ['intercityLegs', index], message: '跨城行程顺序与目的地不一致' });
      if (leg.mode !== 'drive' && (!leg.departureHub || !leg.arrivalHub)) context.addIssue({ code: 'custom', path: ['intercityLegs', index], message: '请确认出发站和到达站' });
      if (leg.mode !== 'drive' && (!leg.departureAt || !leg.arrivalAt)) context.addIssue({ code: 'custom', path: ['intercityLegs', index], message: '请填写预计出发和到达时间' });
      if (leg.departureAt && leg.arrivalAt && leg.arrivalAt <= leg.departureAt) context.addIssue({ code: 'custom', path: ['intercityLegs', index, 'arrivalAt'], message: '预计到达时间必须晚于出发时间' });
    });
  }
});
export const changeSchema = z.object({ planId: z.string().uuid(), revision: z.number().int().nonnegative(), mealId: z.string().min(1).max(80), action: z.enum(['lock', 'cheaper', 'closer', 'select', 'selectAndLock', 'skip', 'move']), restaurantId: z.string().min(1).max(100).optional() });
export const restaurantSearchSchema = z.object({ planId: z.string().uuid(), revision: z.number().int().nonnegative(), mealId: z.string().min(1).max(80).optional(), names: z.array(z.string().trim().min(2).max(100)).min(1).max(8) });
export const finalizeFoodSchema = z.object({
  planId: z.string().uuid(), revision: z.number().int().nonnegative(),
  selections: z.array(z.object({ mealId: z.string().min(1).max(80), restaurantId: z.string().min(1).max(120).nullable(), acceptWarnings: z.boolean().default(false) })).max(20),
  skippedManualInputs: z.array(z.string().trim().min(2).max(100)).max(8).default([]),
});
export const planSelectionSchema = z.object({ discoveryId: z.string().uuid(), selectedIds: z.array(z.string().min(3).max(300)).min(1).max(60).refine(ids => new Set(ids).size === ids.length, '候选不能重复') });
export const customCandidateSchema = z.object({
  discoveryId: z.string().uuid(), city: z.string().trim().min(2).max(60),
  kind: z.enum(['attraction', 'food']), names: z.array(z.string().trim().min(2).max(100)).min(1).max(12),
});
export const dayReplanSchema = z.object({
  planId: z.string().uuid(), revision: z.number().int().nonnegative(), dayIndex: z.number().int().min(0).max(9),
  replacements: z.array(z.object({ stopId: z.string().min(1).max(200), name: z.string().trim().min(2).max(100) })).max(12).default([]),
  removedStopIds: z.array(z.string().min(1).max(200)).max(12).default([]),
  entertainmentSelections: z.array(z.object({ id: z.string().min(1).max(200), period: z.enum(['morning', 'afternoon', 'evening']) })).max(3)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, '娱乐地点不能重复').default([]),
});
export const entertainmentSearchSchema = z.object({
  planId: z.string().uuid(), revision: z.number().int().nonnegative(), dayIndex: z.number().int().min(0).max(9),
  preference: z.string().trim().min(1).max(40), query: z.string().trim().max(100).default(''),
  selectedIds: z.array(z.string().min(1).max(200)).max(3).default([]),
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

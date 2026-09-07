import { z } from 'zod';
import { orderStops } from './optimizer.mjs';

const normalizedName = name => name.replace(/[\s（）()·]/g, '').toLowerCase();
export const targetStopCount = days => days === 1 ? 4 : days * 3;

/** @param {import('./fixtures').Stop[]} stops
 * @returns {import('./fixtures').Stop[]} */
export function uniqueStops(stops) {
  const names = new Set(), pois = new Set();
  return stops.filter(stop => {
    const name = normalizedName(stop.name);
    if (!name || names.has(name) || (stop.poiId && pois.has(stop.poiId))) return false;
    names.add(name); if (stop.poiId) pois.add(stop.poiId);
    return true;
  });
}

/** AI names start without coordinates; a different city's fixture must never supply them.
 * @param {import('./fixtures').Stop[]} fallback
 * @returns {import('./fixtures').Stop[]} */
export function parseCandidatePlaces(content, fallback, limit) {
  const parsed = z.object({ places: z.array(z.string().trim().min(2).max(100)).min(1).max(60) }).parse(JSON.parse(content));
  const stops = parsed.places.map((name, i) => {
    const known = fallback.find(s => normalizedName(s.name) === normalizedName(name));
    return known ? { ...known, id: `candidate-${i}` } : {
      id: `candidate-${i}`, city: fallback[0]?.city || '', name, address: '地址待高德确认', lng: 0, lat: 0, verified: false,
      time: '', detail: 'AI 候选地点，营业时间、门票及预约规则待确认。',
      duration: '约 1.5 小时', durationMinutes: 90, cost: 0, costPending: true, indoor: false,
    };
  });
  return uniqueStops(stops).slice(0, limit);
}

/** Partition once into disjoint days. A shortage stays visible instead of recycling stops.
 * @param {import('./fixtures').Stop[]} stops
 * @param {{days: number, startDate: string, destinations?: string[]}} request
 * @param {{lng: number, lat: number} | null} origin
 * @returns {import('./fixtures').Day[]} */
export function distributeDays(stops, request, origin = null) {
  const candidates = uniqueStops(stops).slice(0, targetStopCount(request.days));
  // Only known coordinates participate in geographic ordering.
  const ordered = [...orderStops(candidates.filter(s => s.lng !== 0 && s.lat !== 0), origin), ...candidates.filter(s => s.lng === 0 || s.lat === 0)];
  let offset = 0;
  return Array.from({ length: request.days }, (_, index) => {
    const count = Math.ceil((ordered.length - offset) / (request.days - index));
    const group = ordered.slice(offset, offset + count); offset += count;
    const times = group.length <= 2 ? ['09:00', '14:30'] : group.length === 3 ? ['09:00', '14:30', '16:30'] : ['09:00', '11:00', '14:30', '16:30'];
    return {
      title: `第 ${index + 1} 天 · ${group[0]?.name || '待补充地点'}`,
      city: group[0]?.city || request.destinations?.[0] || '',
      date: new Date(Date.parse(`${request.startDate}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10),
      warning: count < (request.days === 1 ? 4 : 3) ? '不重复的候选地点不足，本日保留空余时间，不复用其他日期景点。' : undefined,
      stops: group.map((stop, i) => ({ ...stop, time: times[i], durationMinutes: group.length === 4 && i === 1 ? 60 : 90, duration: group.length === 4 && i === 1 ? '约 1 小时' : '约 1.5 小时' })),
    };
  });
}

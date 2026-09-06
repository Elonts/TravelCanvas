import 'server-only';
import { z } from 'zod';
import { candidateStops, type Day, type Stop } from './fixtures';
import { recommendHotels } from './hotels.mjs';
import { orderStops } from './optimizer.mjs';

export const requestSchema = z.object({ destination: z.string().min(2).max(60), startDate: z.string().min(8), days: z.coerce.number().int().min(1).max(10), budget: z.coerce.number().min(500), travelers: z.coerce.number().int().min(1).max(8), transport: z.enum(['walk','transit','drive']), preferences: z.string().max(300).optional(), constraints: z.string().max(300).optional() });
export type TripRequest = z.infer<typeof requestSchema>;
export type DataState = 'live' | 'demo' | 'pending';
type HotelRecommendation = { id: string; title: string; area: string; rationale: string; filters: string; priceGuide: string; ctripUrl: string; query: string };
export type Plan = { request: TripRequest; days: Day[]; budget: Record<string, number>; weather: { date: string; summary: string; high: number; low: number; rain: number; state: DataState; updatedAt: string }; hotels: HotelRecommendation[]; sources: { ai: DataState; map: DataState; weather: DataState; hotel: DataState; updatedAt: string }; risks: string[] };

async function mapStops(stops: Stop[], destination: string) {
  if (!process.env.AMAP_API_KEY) return { stops, state: 'demo' as const };
  const enriched = await Promise.all(stops.map(async stop => {
    const url = new URL('https://restapi.amap.com/v5/place/text');
    url.search = new URLSearchParams({ key: process.env.AMAP_API_KEY!, keywords: stop.name, city: destination, citylimit: 'true', page_size: '1' }).toString();
    const result = await fetch(url, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const poi = result.pois?.[0];
    if (!poi?.location) return stop;
    const [lng, lat] = poi.location.split(',').map(Number);
    return { ...stop, name: poi.name || stop.name, address: poi.address || stop.address, lng, lat, verified: true };
  }));
  return { stops: enriched, state: 'live' as const };
}
async function aiCandidateNames(request: TripRequest, fallback: Stop[]) {
  if (!process.env.DEEPSEEK_API_KEY) return { stops: fallback, state: 'demo' as const };
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: '你是中国境内旅行规划助手。只输出 JSON。' }, { role: 'user', content: `为${request.destination}推荐 ${fallback.length} 个可在高德地图检索的正式景点、博物馆、餐饮街或公园名称。偏好：${request.preferences || '综合体验'}；限制：${request.constraints || '无'}。返回 {"places":["名称"]}，不要写泛称。` }] })
    });
    const content = (await response.json()).choices?.[0]?.message?.content;
    const places = JSON.parse(content || '{}').places;
    if (!Array.isArray(places) || places.length < 3 || !places.every(place => typeof place === 'string' && place.length >= 3)) throw Error('invalid places');
    return { stops: fallback.map((stop, index) => ({ ...stop, name: places[index] || stop.name })), state: 'live' as const };
  } catch { return { stops: fallback, state: 'demo' as const }; }
}
async function weather(destination: string, date: string) {
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=zh`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const place = geo.results?.[0]; if (!place) throw Error('no city');
    const forecast = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${date}&end_date=${date}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const code = forecast.daily?.weather_code?.[0] ?? 0;
    return { date, summary: code >= 60 ? '有雨，建议优先室内活动' : code >= 3 ? '多云，出行舒适' : '晴朗，适合户外活动', high: Math.round(forecast.daily.temperature_2m_max[0]), low: Math.round(forecast.daily.temperature_2m_min[0]), rain: forecast.daily.precipitation_probability_max[0] || 0, state: 'live' as const, updatedAt: new Date().toISOString() };
  } catch { return { date, summary: '天气服务暂不可用', high: 0, low: 0, rain: 0, state: 'pending' as const, updatedAt: new Date().toISOString() }; }
}
export async function buildPlan(request: TripRequest): Promise<Plan> {
  const candidates = await aiCandidateNames(request, candidateStops(request.destination));
  const mapped = await mapStops(candidates.stops, request.destination);
  const ordered = orderStops(mapped.stops);
  const dayStops = request.days === 1 ? ordered : ordered.slice(0, Math.ceil(ordered.length / Math.min(request.days, 2)));
  const days = Array.from({ length: request.days }, (_, index) => ({ title: `第 ${index + 1} 天 · ${index === 0 ? '城市核心体验' : '慢游与在地探索'}`, date: new Date(new Date(request.startDate).getTime() + index * 86400000).toISOString().slice(0, 10), stops: index === 0 ? dayStops : ordered.slice().reverse().slice(0, Math.max(2, dayStops.length)) }));
  const weatherData = await weather(request.destination, days[0].date);
  return { request, days, budget: { transport: Math.round(request.budget * .2), stay: Math.round(request.budget * .38), food: Math.round(request.budget * .22), activities: Math.round(request.budget * .1), buffer: Math.round(request.budget * .1) }, weather: weatherData, hotels: recommendHotels({ ...request, preferences: request.preferences || '', stops: ordered }), sources: { ai: candidates.state, map: mapped.state, weather: weatherData.state, hotel: 'demo', updatedAt: new Date().toISOString() }, risks: ['门票、营业时间与预约规则可能变动，请在出发前确认。', '酒店推荐按路线与预算计算，不包含实时房态或价格；请以携程页面为准。', weatherData.rain >= 50 ? '降雨概率较高，已建议优先选择室内活动。' : '建议保留至少 10% 机动预算应对价格变化。'] };
}

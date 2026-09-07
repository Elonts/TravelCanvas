import 'server-only';
import { z } from 'zod';
import { candidateStops, type Day, type Stop } from './fixtures';
import { recommendHotels } from './hotels.mjs';
import { requestSchema } from './requests.mjs';
import { allocateBudget } from './food.mjs';
import { buildFoodPlan, createMapProvider } from './food-providers.mjs';
import { distributeDays, parseCandidatePlaces, targetStopCount, uniqueStops } from './itinerary.mjs';
import { orderStops } from './optimizer.mjs';
import { createRoutePoints } from './route-points.mjs';
import type { FoodPlan, RouteLeg } from './food-types';
import type { DiscoveryCandidate } from './discovery-types';
import { amapNavigationUrl } from './navigation.mjs';
import { verifyDayReservations } from './reservations.mjs';

export { requestSchema };
export type TripRequest = z.infer<typeof requestSchema>;
export type DataState = 'live' | 'demo' | 'pending';
type HotelRecommendation = { id: string; title: string; area: string; rationale: string; filters: string; priceGuide: string; ctripUrl: string; query: string };
export type RoutePoint = { id: string; order: number; name: string; city: string; date: string; time: string; kind: 'origin' | 'attraction' | 'entertainment' | 'restaurant'; lng: number; lat: number; verified: boolean; poiId?: string; address: string; introduction: string; imageUrl: string | null; navigationUrl: string | null };
export type RoutePath = RouteLeg & { fromId: string; toId: string; date: string; transport: 'walk' | 'transit' | 'drive' };
export type RouteOverview = { points: RoutePoint[]; paths: RoutePath[]; transfers: (RouteLeg & { transport: 'transit' | 'drive' })[]; cityOrder: string[]; source: '高德地图' | '顺序示意'; state: DataState; queriedAt: string; note: string };
type Weather = { city: string; date: string; summary: string; high: number; low: number; rain: number; state: DataState; updatedAt: string };
export type DayGuide = { date: string; city: string; weather: Weather; hotels: HotelRecommendation[]; reminders: string[] };
export type EntertainmentOption = Stop & { routeMinutes: number | null; routeMeters: number | null; preference: string };
export type DayEntertainment = { dayIndex: number; anchorName: string; selectedId: string | null; options: EntertainmentOption[]; warning?: string };
export type Plan = { planId?: string; revision?: number; food: FoodPlan; request: TripRequest; days: Day[]; route: RouteOverview; budget: Record<string, number>; weather: Weather; hotels: HotelRecommendation[]; dayGuides: DayGuide[]; entertainmentDays: DayEntertainment[]; sources: { ai: DataState; map: DataState; weather: DataState; hotel: DataState; updatedAt: string }; risks: string[] };

type MapProvider = ReturnType<typeof createMapProvider>;
type GeoPoint = { name: string; address: string; lng: number; lat: number; verified: boolean };
const stateOf = (states: DataState[]): DataState => states.every(state => state === 'live') ? 'live' : states.every(state => state === 'demo') ? 'demo' : 'pending';
const addDays = (date: string, count: number) => new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);

function allocateDestinationDays(totalDays: number, count: number) {
  const base = Math.floor(totalDays / count);
  return Array.from({ length: count }, (_, index) => base + (index < totalDays % count ? 1 : 0));
}

async function orderDestinations(request: TripRequest, map: MapProvider | null) {
  if (!map) return { origin: null, destinations: request.destinations.map(name => ({ name, location: null })), state: 'demo' as const };
  const [origin, ...locations] = await Promise.all([request.origin, ...request.destinations].map(name => map.geocode(name)));
  const known = request.destinations.map((name, index) => ({ name, location: locations[index] })).filter(item => item.location) as { name: string; location: GeoPoint }[];
  const orderedKnown = orderStops(known.map(item => ({ ...item, lng: item.location.lng, lat: item.location.lat })), origin);
  const unknown = request.destinations.filter(name => !known.some(item => item.name === name)).map(name => ({ name, location: null }));
  return { origin, destinations: [...orderedKnown, ...unknown], state: origin && !unknown.length ? 'live' as const : 'pending' as const };
}

async function mapStops(stops: Stop[], destination: string, count: number, map: MapProvider | null) {
  if (!map) return { stops, state: 'demo' as const };
  const enriched = await Promise.all(stops.map(async stop => {
    const poi = await map.place(stop.name, destination);
    return poi ? { ...stop, ...poi, city: destination, verified: true, navigationUrl: amapNavigationUrl(poi) } : stop;
  }));
  const unique = uniqueStops(enriched);
  const supplemental = unique.length < count ? await map.attractions(destination, count) : [];
  const completed = uniqueStops([...unique, ...supplemental]).slice(0, count).map(stop => ({ ...stop, city: destination }));
  return { stops: completed, state: completed.length === count && completed.every(stop => stop.verified) ? 'live' as const : 'pending' as const };
}

async function aiCandidateNames(request: TripRequest, destination: string, days: number, fallback: Stop[]) {
  const count = targetStopCount(days);
  if (!process.env.DEEPSEEK_API_KEY) return { stops: fallback, state: 'demo' as const };
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', thinking: { type: 'disabled' }, max_tokens: 1200, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: '你是中国境内旅行规划助手。只输出 JSON。' }, { role: 'user', content: `为${destination}的${days}天旅行推荐 ${count} 个互不重复、可在高德地图检索的正式景点、博物馆或公园名称。按相邻片区组织候选，避免同一景点不同入口、别名重复，不用餐厅或餐饮街代替正餐。偏好：${request.preferences || '综合体验'}；限制：${request.constraints || '无'}。返回 {"places":["名称"]}，不要写泛称。` }] })
    });
    const content = (await response.json()).choices?.[0]?.message?.content;
    const places = parseCandidatePlaces(content || '{}', fallback, count).map((stop: Stop) => ({ ...stop, city: destination }));
    return { stops: uniqueStops([...places, ...fallback]).slice(0, count), state: 'live' as const };
  } catch { return { stops: fallback, state: 'demo' as const }; }
}

async function weather(destination: string, date: string) {
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=zh`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const place = geo.results?.[0]; if (!place) throw Error('no city');
    const forecast = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${date}&end_date=${date}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const code = forecast.daily?.weather_code?.[0] ?? 0;
    return { city: destination, date, summary: code >= 60 ? '有雨，建议优先室内活动' : code >= 3 ? '多云，出行舒适' : '晴朗，适合户外活动', high: Math.round(forecast.daily.temperature_2m_max[0]), low: Math.round(forecast.daily.temperature_2m_min[0]), rain: forecast.daily.precipitation_probability_max[0] || 0, state: 'live' as const, updatedAt: new Date().toISOString() };
  } catch { return { city: destination, date, summary: '天气服务暂不可用', high: 0, low: 0, rain: 0, state: 'pending' as const, updatedAt: new Date().toISOString() }; }
}

async function transferRoutes(request: TripRequest, map: MapProvider | null, origin: GeoPoint | null, destinations: { name: string; location: GeoPoint | null }[]) {
  const transport: 'drive' | 'transit' = request.transport === 'drive' ? 'drive' : 'transit';
  const places = [origin && { ...origin, city: request.origin }, ...destinations.map(item => item.location && { ...item.location, city: item.name })].filter(Boolean) as (GeoPoint & { city: string })[];
  const legs = [];
  for (let index = 1; index < places.length; index++) {
    const from = places[index - 1], to = places[index];
    const leg = map ? await map.route(from, to, transport, from.city, to.city) : { from: from.name, to: to.name, minutes: null, meters: null, fare: null, state: 'pending' as const, queriedAt: new Date().toISOString() };
    legs.push({ ...leg, transport });
  }
  return legs;
}

function selectedStops(candidates: DiscoveryCandidate[], city: string): Stop[] {
  return candidates.filter((candidate): candidate is DiscoveryCandidate & { kind: 'attraction' } => candidate.city === city && candidate.kind === 'attraction').map(candidate => ({
    id: `selected-${candidate.poiId}`, poiId: candidate.poiId, city, kind: candidate.kind, name: candidate.name, address: candidate.address,
    lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl, imageUrl: candidate.imageUrl, time: '', detail: `${candidate.introduction} 推荐理由：${candidate.recommendationReason}`,
    duration: `约 ${Math.round(candidate.durationMinutes / 30) / 2} 小时`, durationMinutes: candidate.durationMinutes,
    cost: candidate.estimatedCost || 0, costPending: candidate.estimatedCost === null, indoor: false,
    reservation: { status: 'unknown' as const, message: '预约要求待确认，请在出发前查看景区官方渠道。', sourceUrl: null, queriedAt: candidate.queriedAt },
  }));
}

function entertainmentStop(candidate: any, preference: string, route: RouteLeg): EntertainmentOption {
  return {
    id: `entertainment-${candidate.poiId}`, poiId: candidate.poiId, city: candidate.city, kind: 'entertainment', name: candidate.name,
    address: candidate.address, lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl,
    imageUrl: candidate.imageUrl, time: '19:30', detail: `根据“${preference}”偏好，在当天路线附近筛选的娱乐地点；营业时间和消费请出发前确认。`,
    duration: '约 1.5 小时', durationMinutes: 90, cost: 0, costPending: true, indoor: true,
    routeMinutes: route.minutes, routeMeters: route.meters, preference,
  };
}

async function discoverEntertainment(days: Day[], request: TripRequest, map: MapProvider | null): Promise<DayEntertainment[]> {
  const preferences = request.entertainmentPreferences.split(/[，,、;；\s]+/).filter(Boolean);
  if (!preferences.length) return days.map((_, dayIndex) => ({ dayIndex, anchorName: '', selectedId: null, options: [] }));
  const result: DayEntertainment[] = [];
  const used = new Set<string>();
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex], anchor = day.stops.at(-1);
    if (!map || !anchor?.verified) { result.push({ dayIndex, anchorName: anchor?.name || '', selectedId: null, options: [], warning: '缺少可用路线坐标，暂未添加娱乐活动。' }); continue; }
    const candidates = await map.discover(day.city, 'entertainment', preferences, 14, request.transport);
    const routed = await Promise.all(candidates.map(async (candidate: any) => {
      const route = await map.route(anchor, candidate, request.transport, day.city);
      const preference = preferences.find(item => `${candidate.name} ${candidate.category}`.includes(item)) || preferences[0];
      return entertainmentStop(candidate, preference, route);
    }));
    const options = routed.filter(option => option.routeMinutes !== null && option.routeMinutes <= 45)
      .sort((a, b) => (a.routeMinutes ?? 999) - (b.routeMinutes ?? 999)).slice(0, 6);
    const selected = options.find(option => !used.has(option.poiId || normalizeStopName(option.name)));
    const selectedId = selected?.id || null;
    if (selected) { day.stops.push(selected); used.add(selected.poiId || normalizeStopName(selected.name)); }
    result.push({ dayIndex, anchorName: anchor.name, selectedId, options, ...(!options.length ? { warning: '当天路线 45 分钟交通范围内没有找到匹配娱乐地点。' } : {}) });
  }
  return result;
}

const normalizeStopName = (value: string) => value.replace(/[\s（）()·]/g, '').toLowerCase();

async function routePaths(points: RoutePoint[], map: MapProvider | null, transport: TripRequest['transport']): Promise<RoutePath[]> {
  if (!map) return [];
  const paths: RoutePath[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from.date !== to.date && from.kind !== 'origin') continue;
    const leg = await map.route(from, to, transport, from.city, to.city);
    paths.push({ ...leg, fromId: from.id, toId: to.id, date: to.date, transport });
  }
  return paths;
}

function selectedFood(candidates: DiscoveryCandidate[]) {
  return candidates.filter(candidate => candidate.kind === 'food').map(candidate => ({
    id: candidate.poiId, city: candidate.city, preferred: true, name: candidate.name, address: candidate.address, lng: candidate.lng, lat: candidate.lat,
    category: candidate.category, price: candidate.price, hours: candidate.hours, source: candidate.source, queriedAt: candidate.queriedAt,
    imageUrl: candidate.imageUrl, navigationUrl: candidate.navigationUrl, tips: candidate.evidence.map((evidence, index) => ({ id: `discovery-tip-${index}`, sourceId: evidence.sourceId, placeName: candidate.name, text: evidence.quote, quote: evidence.quote, dishes: evidence.dishes, category: 'food' as const, state: 'pending' as const })),
    featuredDishes: candidate.featuredDishes || [],
  }));
}

function discoverySources(candidates: DiscoveryCandidate[]) {
  const sources = new Map<string, { id: string; title: string; url: string | null; content: string; kind: 'search'; publishedAt: string | null; queriedAt: string }>();
  candidates.flatMap(candidate => candidate.evidence).forEach(evidence => {
    const previous = sources.get(evidence.sourceId);
    sources.set(evidence.sourceId, { id: evidence.sourceId, title: evidence.title, url: evidence.url, content: [previous?.content, evidence.quote].filter(Boolean).join('。'), kind: 'search', publishedAt: evidence.publishedAt, queriedAt: evidence.queriedAt });
  });
  return [...sources.values()];
}

export async function buildPlan(request: TripRequest, selected: DiscoveryCandidate[] | null = null): Promise<Plan> {
  const testMapInterval = process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400;
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: testMapInterval }) : null;
  const orderedCities = await orderDestinations(request, map);
  const dayCounts = allocateDestinationDays(request.days, orderedCities.destinations.length);
  const days: Day[] = [];
  const aiStates: DataState[] = [], mapStates: DataState[] = [orderedCities.state];
  let elapsedDays = 0;
  let routeAnchor: GeoPoint | null = orderedCities.origin;
  for (let index = 0; index < orderedCities.destinations.length; index++) {
    const destination = orderedCities.destinations[index].name;
    const cityDays = dayCounts[index];
    const fallback = candidateStops(destination);
    const candidates = selected ? { stops: selectedStops(selected, destination), state: 'live' as const } : await aiCandidateNames(request, destination, cityDays, fallback);
    const mapped = selected ? { stops: candidates.stops, state: candidates.stops.every(stop => stop.verified) ? 'live' as const : 'pending' as const } : await mapStops(candidates.stops, destination, targetStopCount(cityDays), map);
    const cityRequest = { ...request, destinations: [destination], days: cityDays, startDate: addDays(request.startDate, elapsedDays) };
    const cityDaysResult = distributeDays(mapped.stops, cityRequest, routeAnchor).map((day: Day) => ({ ...day, city: destination }));
    days.push(...cityDaysResult);
    routeAnchor = cityDaysResult.flatMap(day => day.stops).at(-1) || orderedCities.destinations[index].location || routeAnchor;
    elapsedDays += cityDays;
    aiStates.push(candidates.state); mapStates.push(mapped.state);
  }
  days.forEach((day, index) => { day.title = `第 ${index + 1} 天 · ${day.city} · ${day.stops[0]?.name || '待补充地点'}`; });
  const reservationDays = await Promise.all(days.map(day => verifyDayReservations(day)));
  days.splice(0, days.length, ...reservationDays);
  const budget = allocateBudget(request);
  const primaryCity = orderedCities.destinations[0].name;
  const preferredRestaurants = selected ? selectedFood(selected) : [];
  const selectedSources = selected ? discoverySources(selected) : [];
  const reusedSources = selectedSources.length ? selectedSources : null;
  const buildSelectedFoodPlan = buildFoodPlan as unknown as (request: TripRequest, days: Day[], budget: Record<string, number>, env: NodeJS.ProcessEnv, fetcher: typeof fetch, options: { mapIntervalMs: number; preferredRestaurants: ReturnType<typeof selectedFood>; discoverySources: ReturnType<typeof discoverySources> | null }) => Promise<FoodPlan>;
  // Meal slots are calculated from the daytime attraction skeleton first.
  // Evening entertainment is attached afterwards so it cannot displace dinner.
  const [dailyWeather, food] = await Promise.all([Promise.all(days.map(day => weather(day.city, day.date))), buildSelectedFoodPlan(request, days, budget, process.env, fetch, { mapIntervalMs: testMapInterval, preferredRestaurants, discoverySources: reusedSources })]);
  const entertainmentDays = await discoverEntertainment(days, request, map);
  const orderedStops = days.flatMap(day => day.stops);
  const weatherData = dailyWeather[0] || await weather(primaryCity, request.startDate);
  const transfers = await transferRoutes(request, map, orderedCities.origin, orderedCities.destinations);
  const points = createRoutePoints(orderedCities.origin, request, days, food);
  const paths = await routePaths(points, map, request.transport);
  const routeState: DataState = map && orderedCities.state === 'live' && transfers.every(leg => leg.state === 'live') && paths.every(leg => leg.state === 'live') ? 'live' : 'pending';
  const route: RouteOverview = {
    points, paths, transfers, cityOrder: orderedCities.destinations.map(item => item.name),
    source: map ? '高德地图' : '顺序示意', state: routeState, queriedAt: new Date().toISOString(),
    note: map ? '城市顺序按出发地与城市坐标减少明显折返；点位连线表示访问顺序，实际道路与耗时以高德查询结果为准。' : '未配置高德地图，保留用户选择顺序；地图仅显示已有坐标的访问顺序。',
  };
  const destinationLabel = route.cityOrder.join('、');
  const hotels = recommendHotels({ destination: destinationLabel, days: request.days, budget: Object.values(budget).reduce((a, b) => a + b, 0), travelers: request.travelers, preferences: request.preferences || '', stops: orderedStops });
  const dayGuides = days.map((day, index) => ({ date: day.date, city: day.city, weather: dailyWeather[index], hotels: recommendHotels({ destination: day.city, days: 1, budget: Object.values(budget).reduce((a, b) => a + b, 0) / request.days, travelers: request.travelers, preferences: request.preferences || '', stops: day.stops }), reminders: [dailyWeather[index].rain >= 50 ? '降水概率较高，带伞并优先保留室内备选。' : '天气适合按计划出行，仍建议准备防晒和饮水。', day.stops.some(stop => !stop.indoor) ? '当天包含户外地点，请穿舒适鞋并留意温差。' : '当天以室内活动为主，留意预约与入场时间。', day.stops.some(stop => stop.kind === 'entertainment') ? '夜间娱乐请提前确认营业时间、年龄限制与返程方式。' : '相邻地点已按少折返排序，实时路况仍以高德为准。'] }));
  return { request, days, route, budget, food, weather: weatherData, hotels, dayGuides, entertainmentDays, sources: { ai: stateOf(aiStates), map: stateOf(mapStates), weather: stateOf(dailyWeather.map(item => item.state)), hotel: 'demo', updatedAt: new Date().toISOString() }, risks: ['多城市顺序采用就近启发式减少明显折返，不等于承诺全程最短；跨城交通方式和班次仍需确认。', '门票、营业时间与预约规则可能变动，请在出发前确认。', '酒店推荐按路线与预算计算，不包含实时房态或价格；请以携程页面为准。', '餐饮价格为高德人均参考上下浮动 20% 的估算；餐厅营业和帖子经验仍需出发前确认。', '餐饮路线为当前查询估算；驾车新增费用按每车 15 元起计加每公里 3 元及路段收费估算，4 人一车。晚餐不包含返回酒店。', weatherData.rain >= 50 ? '首站降雨概率较高，建议优先选择室内活动。' : '建议保留至少 10% 机动预算应对价格变化。'] };
}

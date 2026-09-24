import 'server-only';
import { z } from 'zod';
import { candidateStops, type Day, type Stop } from './fixtures';
import { recommendHotels } from './hotels.mjs';
import { requestSchema } from './requests.mjs';
import { allocateBudget, asDraftFood } from './food.mjs';
import { buildFoodPlan, createMapProvider } from './food-providers.mjs';
import { distributeDays, parseCandidatePlaces, targetStopCount, uniqueStops } from './itinerary.mjs';
import { orderStops } from './optimizer.mjs';
import { createRoutePoints } from './route-points.mjs';
import type { FoodPlan, RouteLeg } from './food-types';
import type { DiscoveryCandidate, GuideSource } from './discovery-types';
import { amapNavigationUrl } from './navigation.mjs';
import { verifyDayReservations } from './reservations.mjs';
import { attachHotelAnchors, verifyBookedHotels } from './booked-hotels.mjs';
import { queryWeather, type WeatherSnapshot } from './weather.mjs';
import { anchorIntercityDays, buildIntercityTransfers, verifyIntercityLegs } from './intercity.mjs';
import { scheduleAnchoredDays } from './day-timing.mjs';

export { requestSchema };
export type TripRequest = z.infer<typeof requestSchema>;
export type DataState = 'live' | 'demo' | 'pending';
type HotelRecommendation = { id: string; title: string; area: string; rationale: string; filters: string; priceGuide: string; ctripUrl: string; query: string; booked?: boolean; address?: string; navigationUrl?: string | null };
export type RoutePoint = { id: string; order: number; name: string; city: string; date: string; time: string; kind: 'origin' | 'hotel' | 'station' | 'airport' | 'attraction' | 'entertainment' | 'restaurant'; hotelRole?: 'start' | 'arrival' | 'end'; lng: number; lat: number; verified: boolean; poiId?: string; address: string; introduction: string; imageUrl: string | null; imageAttribution?: import('./web-images.mjs').ImageAttribution | null; navigationUrl: string | null };
export type RoutePath = RouteLeg & { fromId: string; toId: string; date: string; transport: 'walk' | 'transit' | 'drive' };
export type IntercityTransfer = RouteLeg & { transport: 'transit' | 'drive'; mode: 'high_speed_rail' | 'train' | 'flight' | 'drive'; departureAt: string | null; arrivalAt: string | null; tripNo: string };
export type RouteOverview = { points: RoutePoint[]; paths: RoutePath[]; transfers: IntercityTransfer[]; cityOrder: string[]; source: '高德地图' | '顺序示意'; state: DataState; queriedAt: string; note: string };
type Weather = WeatherSnapshot;
export type DayGuide = { date: string; city: string; weather: Weather; hotels: HotelRecommendation[]; reminders: string[] };
export type EntertainmentOption = Stop & { routeMinutes: number | null; routeMeters: number | null; insertionExtraMinutes: number | null; preference: string; anchorPointId: string; position: 'before' | 'after' };
export type EntertainmentSelection = { id: string; anchorPointId: string; position: 'before' | 'after' };
export type DayEntertainment = { dayIndex: number; anchorName: string; selections: EntertainmentSelection[]; options: EntertainmentOption[]; warning?: string };
export type BudgetMeta = { transportMode: string; rule: string; knownTransportCost: number; pendingLegs: number };
export type Plan = { planId?: string; revision?: number; phase: 'food_selection' | 'final'; food: FoodPlan; guides: GuideSource[]; request: TripRequest; days: Day[]; route: RouteOverview; budget: Record<string, number>; budgetMeta: BudgetMeta; weather: Weather; hotels: HotelRecommendation[]; dayGuides: DayGuide[]; entertainmentDays: DayEntertainment[]; sources: { ai: DataState; map: DataState; weather: DataState; hotel: DataState; updatedAt: string }; risks: string[] };

type MapProvider = ReturnType<typeof createMapProvider>;
type GeoPoint = { name: string; address: string; lng: number; lat: number; adcode?: string; verified: boolean };
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
  const orderedKnown = request.intercityLegs.length ? known : orderStops(known.map(item => ({ ...item, lng: item.location.lng, lat: item.location.lat })), origin);
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

function selectedStops(candidates: DiscoveryCandidate[], city: string): Stop[] {
  return candidates.filter((candidate): candidate is DiscoveryCandidate & { kind: 'attraction' } => candidate.city === city && candidate.kind === 'attraction').map(candidate => ({
    id: `selected-${candidate.poiId}`, poiId: candidate.poiId, city, kind: candidate.kind, name: candidate.name, address: candidate.address,
    lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl, imageUrl: candidate.imageUrl, imageAttribution: candidate.imageAttribution, time: '', detail: `${candidate.introduction} 推荐理由：${candidate.recommendationReason}`,
    duration: `约 ${Math.round(candidate.durationMinutes / 30) / 2} 小时`, durationMinutes: candidate.durationMinutes,
    cost: candidate.estimatedCost || 0, costPending: candidate.estimatedCost === null, indoor: false,
    reservation: { status: 'unknown' as const, message: '预约要求待确认，请在出发前查看景区官方渠道。', sourceUrl: null, queriedAt: candidate.queriedAt },
  }));
}

async function routePaths(points: RoutePoint[], map: MapProvider | null, transport: TripRequest['transport']): Promise<RoutePath[]> {
  if (!map) return [];
  const paths: RoutePath[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from.date !== to.date && from.kind !== 'origin') continue;
    if (from.kind === 'origin') continue;
    const leg = await map.route(from, to, transport, from.city, to.city);
    paths.push({ ...leg, fromId: from.id, toId: to.id, date: to.date, transport });
  }
  return paths;
}

function selectedFood(candidates: DiscoveryCandidate[], preferred = true) {
  return candidates.filter(candidate => candidate.kind === 'food').map(candidate => ({
    id: candidate.poiId, city: candidate.city, preferred, name: candidate.name, address: candidate.address, lng: candidate.lng, lat: candidate.lat,
    category: candidate.category, price: candidate.price, hours: candidate.hours, source: candidate.source, queriedAt: candidate.queriedAt,
    imageUrl: candidate.imageUrl, imageAttribution: candidate.imageAttribution, navigationUrl: candidate.navigationUrl, tips: candidate.evidence.map((evidence, index) => ({ id: `discovery-tip-${index}`, sourceId: evidence.sourceId, placeName: candidate.name, text: evidence.quote, quote: evidence.quote, dishes: evidence.dishes, category: 'food' as const, state: 'pending' as const })),
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

export function budgetMeta(request: TripRequest, route: RouteOverview): BudgetMeta {
  const legs = [...route.transfers, ...route.paths.filter(path => path.fromId !== 'origin')];
  const fareForGroup = (leg: RouteLeg & { transport?: 'walk' | 'transit' | 'drive' }) => {
    if (leg.fare === null) return 0;
    const mode = leg.transport || request.transport;
    return leg.fare * (mode === 'transit' ? request.travelers : mode === 'drive' ? Math.ceil(request.travelers / 4) : 1);
  };
  const labels = { walk: '步行优先', transit: '公共交通', drive: '驾车/打车' };
  const rules = { walk: '步行段按 0 元估算，跨城或必要接驳另按实际交通查询。', transit: '公交地铁按人数汇总，高铁等跨城票价以实际班次为准。', drive: '按约 4 人一车汇总驾车/打车估算，停车、过路费可能另计。' };
  return { transportMode: labels[request.transport], rule: rules[request.transport], knownTransportCost: Math.round(legs.reduce((sum, leg) => sum + fareForGroup(leg), 0)), pendingLegs: legs.filter(leg => leg.fare === null || leg.state !== 'live').length };
}

export async function buildPlan(request: TripRequest, selected: DiscoveryCandidate[] | null = null, guides: GuideSource[] = [], guideFoodCandidates: DiscoveryCandidate[] = []): Promise<Plan> {
  const testMapInterval = process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400;
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: testMapInterval }) : null;
  const orderedCities = await orderDestinations(request, map);
  const bookedHotels = await verifyBookedHotels(request, map);
  const intercityLegs = await verifyIntercityLegs(request, map);
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
  const hotelDays = attachHotelAnchors(days, bookedHotels, orderStops);
  const anchoredDays = anchorIntercityDays(hotelDays, intercityLegs).map((day: Day) => ({ ...day, stops: orderStops(day.stops, day.arrivalHotel || day.startHotel || day.startHub || null) }));
  const timedDays = await scheduleAnchoredDays(anchoredDays, request, map);
  days.splice(0, days.length, ...timedDays);
  const reservationDays = await Promise.all(days.map(day => verifyDayReservations(day)));
  days.splice(0, days.length, ...reservationDays);
  const budget = allocateBudget(request);
  const primaryCity = orderedCities.destinations[0].name;
  const preferredRestaurants = [...(selected ? selectedFood(selected) : []), ...selectedFood(guideFoodCandidates, false)];
  const selectedSources = discoverySources([...(selected || []), ...guideFoodCandidates]);
  const reusedSources = selectedSources.length ? selectedSources : null;
  const buildSelectedFoodPlan = buildFoodPlan as unknown as (request: TripRequest, days: Day[], budget: Record<string, number>, env: NodeJS.ProcessEnv, fetcher: typeof fetch, options: { mapIntervalMs: number; preferredRestaurants: ReturnType<typeof selectedFood>; discoverySources: ReturnType<typeof discoverySources> | null }) => Promise<FoodPlan>;
  const dailyWeatherPromise = Promise.all(days.map(day => queryWeather(day.city, day.date, orderedCities.destinations.find(item => item.name === day.city)?.location || null)));
  const [dailyWeather, generatedFood] = await Promise.all([dailyWeatherPromise, buildSelectedFoodPlan(request, days, budget, process.env, fetch, { mapIntervalMs: testMapInterval, preferredRestaurants, discoverySources: reusedSources })]);
  const food = asDraftFood(generatedFood);
  const entertainmentDays: DayEntertainment[] = days.map((day, dayIndex) => ({ dayIndex, anchorName: day.stops.at(-1)?.name || day.startHotel?.name || '', selections: [], options: [], warning: '请先选择当天一个行程点及“之前/之后”，再查找附近娱乐地点。' }));
  const orderedStops = days.flatMap(day => day.stops);
  const weatherData = dailyWeather[0] || await queryWeather(primaryCity, request.startDate, orderedCities.destinations[0]?.location || null);
  const cityLocations = new Map<string, GeoPoint>();
  if (orderedCities.origin) cityLocations.set(request.origin, orderedCities.origin);
  orderedCities.destinations.forEach(item => { if (item.location) cityLocations.set(item.name, item.location); });
  const transfers = intercityLegs.length ? await buildIntercityTransfers(request, intercityLegs, map, cityLocations) : [];
  const points = createRoutePoints(orderedCities.origin, request, days, food);
  const paths = await routePaths(points, map, request.transport);
  const routeState: DataState = map && orderedCities.state === 'live' && transfers.every(leg => leg.mode !== 'drive' || leg.state === 'live') && paths.every(leg => leg.state === 'live') ? 'live' : 'pending';
  const route: RouteOverview = {
    points, paths, transfers, cityOrder: orderedCities.destinations.map(item => item.name),
    source: map ? '高德地图' : '顺序示意', state: routeState, queriedAt: new Date().toISOString(),
    note: map ? '跨城方式按用户逐段选择；站点、酒店和景区作为路线锚点，实际道路与耗时以高德查询结果为准。' : '未配置高德地图，保留用户选择顺序；地图仅显示已有坐标的访问顺序。',
  };
  const destinationLabel = route.cityOrder.join('、');
  const hotels = recommendHotels({ destination: destinationLabel, days: request.days, budget: Object.values(budget).reduce((a, b) => a + b, 0), travelers: request.travelers, preferences: request.preferences || '', stops: orderedStops });
  const dayGuides = days.map((day, index) => {
    const booked = day.endHotel || day.startHotel;
    const guideHotels = booked ? [{ id: booked.id, title: '已预订酒店', area: booked.name, rationale: '酒店已作为当天路线起点或终点参与道路规划。', filters: '地点已由高德核验', priceGuide: '已预订，费用未计入实时估算', ctripUrl: '', query: booked.name, booked: true, address: booked.address, navigationUrl: booked.navigationUrl }] : recommendHotels({ destination: day.city, days: 1, budget: Object.values(budget).reduce((a, b) => a + b, 0) / request.days, travelers: request.travelers, preferences: request.preferences || '', stops: day.stops });
    return { date: day.date, city: day.city, weather: dailyWeather[index], hotels: guideHotels, reminders: [(dailyWeather[index].rain ?? 0) >= 50 ? '降水概率较高，带伞并优先保留室内备选。' : dailyWeather[index].state === 'pending' ? '该日期暂无可靠天气预报，请临近出发时再次查询。' : '天气适合按计划出行，仍建议准备防晒和饮水。', day.stops.some(stop => !stop.indoor) ? '当天包含户外地点，请穿舒适鞋并留意温差。' : '当天以室内活动为主，留意预约与入场时间。', booked ? '已按预订酒店位置计算当天起终点，实时道路仍以高德为准。' : day.stops.some(stop => stop.kind === 'entertainment') ? '娱乐活动请提前确认营业时间、年龄限制与返程方式。' : '相邻地点已按少折返排序，实时路况仍以高德为准。'] };
  });
  return { phase: 'food_selection', request, days, route, budget, budgetMeta: budgetMeta(request, route), food, guides, weather: weatherData, hotels, dayGuides, entertainmentDays, sources: { ai: stateOf(aiStates), map: stateOf(mapStates), weather: stateOf(dailyWeather.map(item => item.state)), hotel: bookedHotels.length ? 'live' : 'demo', updatedAt: new Date().toISOString() }, risks: ['多城市顺序采用就近启发式减少明显折返，不等于承诺全程最短；跨城交通方式和班次仍需确认。', '门票、营业时间与预约规则可能变动，请在出发前确认。', bookedHotels.length ? '已预订酒店地点经高德核验并参与路线，订单、入住政策和费用仍以预订平台为准。' : '酒店推荐按路线与预算计算，不包含实时房态或价格；请以携程页面为准。', '餐厅当前只是选择草稿，只有确认后才会进入最终路线。', '餐饮路线为当前查询估算；驾车新增费用按每车 15 元起计加每公里 3 元及路段收费估算，4 人一车。', (weatherData.rain ?? 0) >= 50 ? '首站降雨概率较高，建议保留一部分未安排预算应对价格变化。' : '预算中的“剩余可用”不是费用，只有实际下单或购票后才算支出。'] };
}

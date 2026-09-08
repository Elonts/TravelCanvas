import 'server-only';
import { budgetMeta, type Plan, type RoutePath } from './plan';
import type { Stop } from './fixtures';
import { buildFoodPlan, createMapProvider } from './food-providers.mjs';
import { createRoutePoints } from './route-points.mjs';
import { orderStops } from './optimizer.mjs';
import { recommendHotels } from './hotels.mjs';
import type { FoodPlan, Restaurant } from './food-types';
import { verifyDayReservations } from './reservations.mjs';
import { amapImageAttribution, fillMissingWebImages } from './web-images.mjs';
import { ENTERTAINMENT_RADIUS_METERS, ENTERTAINMENT_TYPES } from './entertainment';

const normalize = (value: string) => value.replace(/[\s（）()·]/g, '').toLowerCase();
const rebuildFoodPlan = buildFoodPlan as unknown as (request: Plan['request'], days: Plan['days'], budget: Plan['budget'], env: NodeJS.ProcessEnv, fetcher: typeof fetch, options: { mapIntervalMs: number; preferredRestaurants: Restaurant[]; discoverySources: FoodPlan['sources'] }) => Promise<FoodPlan>;

function asAttraction(candidate: any, old: Stop, queriedAt: string): Stop {
  return {
    ...old, id: `replacement-${candidate.poiId}`, poiId: candidate.poiId, kind: 'attraction', name: candidate.name,
    address: candidate.address, lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl,
    imageUrl: candidate.imageUrl, imageAttribution: amapImageAttribution(candidate.imageUrl, queriedAt), detail: '你指定并经高德重新核验的景点；门票、开放时间和预约规则请在出发前确认。',
    reservation: { status: 'unknown', message: '预约要求待确认，请在出发前查看景区官方渠道。', sourceUrl: null, queriedAt },
  };
}

function schedule(stops: Stop[]) {
  const base = ['09:00', '11:00', '14:30', '16:30', '19:30'];
  let entertainmentIndex = 0;
  return stops.map((stop, index) => ({ ...stop, time: stop.kind === 'entertainment' ? ['19:30', '21:00', '22:30'][entertainmentIndex++] : base[Math.min(index, 3)] }));
}

async function routePaths(plan: Plan, points: Plan['route']['points'], map: ReturnType<typeof createMapProvider>): Promise<RoutePath[]> {
  const paths: RoutePath[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from.date !== to.date && from.kind !== 'origin') continue;
    const leg = await map.route(from, to, plan.request.transport, from.city, to.city);
    paths.push({ ...leg, fromId: from.id, toId: to.id, date: to.date, transport: plan.request.transport });
  }
  return paths;
}

export async function replanDay(plan: Plan, change: { dayIndex: number; replacements: { stopId: string; name: string }[]; removedStopIds: string[]; entertainmentIds: string[] }): Promise<Plan> {
  const day = plan.days[change.dayIndex];
  if (!day) throw Error('要修改的日期不存在');
  if (!process.env.AMAP_API_KEY) throw Error('高德服务未配置，无法重新核验地点和路线');
  const map = createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 });
  const removed = new Set(change.removedStopIds);
  let attractions = day.stops.filter(stop => stop.kind !== 'entertainment' && !removed.has(stop.id));
  for (const item of change.replacements) {
    const index = attractions.findIndex(stop => stop.id === item.stopId);
    if (index < 0) throw Error('要替换的景点已发生变化，请刷新后重试');
    const matches = await map.discover(day.city, 'attraction', [item.name], 5, plan.request.transport);
    const matched = matches.find((candidate: any) => normalize(candidate.name) === normalize(item.name))
      || matches.find((candidate: any) => normalize(candidate.name).includes(normalize(item.name)) || normalize(item.name).includes(normalize(candidate.name)));
    if (!matched) throw Error(`没有找到准确景点“${item.name}”，请填写更完整的正式名称`);
    const [replacement] = await fillMissingWebImages([asAttraction(matched, attractions[index], new Date().toISOString())], process.env, fetch);
    attractions[index] = replacement;
  }
  const previousAnchor = change.dayIndex > 0 ? plan.days[change.dayIndex - 1].stops.at(-1) || null : plan.route.points.find(point => point.kind === 'origin') || null;
  attractions = orderStops(attractions, previousAnchor);
  const entertainment = plan.entertainmentDays[change.dayIndex];
  const selectedEntertainment = change.entertainmentIds.map(id => entertainment?.options.find(option => option.id === id));
  if (selectedEntertainment.some(option => !option)) throw Error('娱乐地点选项已失效，请重新生成方案');
  const selectedEntertainmentStops = selectedEntertainment.filter((option): option is NonNullable<typeof option> => Boolean(option));
  let newDay = { ...day, stops: schedule([...attractions, ...selectedEntertainmentStops]) };
  newDay = await verifyDayReservations(newDay);
  newDay.title = `第 ${change.dayIndex + 1} 天 · ${day.city} · ${newDay.stops[0]?.name || '待补充地点'}`;
  const days = plan.days.map((value, index) => index === change.dayIndex ? newDay : value);
  const preferredRestaurants = plan.food.meals.flatMap(meal => meal.options.map(option => option.restaurant));
  const foodDays = days.map(value => ({ ...value, stops: value.stops.filter(stop => stop.kind !== 'entertainment') }));
  const food = await rebuildFoodPlan(plan.request, foodDays, plan.budget, process.env, fetch, { mapIntervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400, preferredRestaurants, discoverySources: plan.food.sources });
  const origin = plan.route.points.find(point => point.kind === 'origin') || null;
  const points = createRoutePoints(origin, plan.request, days, food);
  const paths = await routePaths(plan, points, map);
  const route = { ...plan.route, points, paths, state: paths.length && paths.every(path => path.state === 'live') ? 'live' as const : 'pending' as const, queriedAt: new Date().toISOString() };
  const dayBudget = Object.values(plan.budget).reduce((sum, value) => sum + value, 0) / plan.request.days;
  const hotels = recommendHotels({ destination: day.city, days: 1, budget: dayBudget, travelers: plan.request.travelers, preferences: plan.request.preferences || '', stops: newDay.stops });
  const dayGuides = plan.dayGuides.map((guide, index) => index === change.dayIndex ? { ...guide, hotels, reminders: [guide.weather.rain >= 50 ? '降水概率较高，带伞并优先保留室内备选。' : '天气适合按计划出行，仍建议准备防晒和饮水。', newDay.stops.some(stop => stop.kind === 'entertainment') ? '已按当天路线加入娱乐活动，请再次确认营业时间、消费和返程方式。' : '本日未安排娱乐活动，可在下拉框选择后统一保存。', '景区预约要求会变化，状态为待确认时请查看景区官方渠道。'] } : guide);
  const entertainmentDays = plan.entertainmentDays.map((value, index) => index === change.dayIndex ? { ...value, selectedIds: change.entertainmentIds } : value);
  return { ...plan, days, food, route, budgetMeta: budgetMeta(plan.request, route), dayGuides, entertainmentDays, sources: { ...plan.sources, map: route.state, updatedAt: new Date().toISOString() } };
}

export async function searchEntertainment(plan: Plan, input: { dayIndex: number; preference: string; query: string; selectedIds: string[] }): Promise<Plan> {
  const day = plan.days[input.dayIndex];
  if (!day) throw Error('要查询的日期不存在');
  if (!process.env.AMAP_API_KEY) throw Error('高德服务未配置，无法查询娱乐地点');
  const anchor = day.stops.filter(stop => stop.kind !== 'entertainment').at(-1);
  if (!anchor?.verified) throw Error('当天路线缺少已核验坐标，无法筛选顺路地点');
  if (!(ENTERTAINMENT_TYPES as readonly string[]).includes(input.preference) && input.preference !== '其他') throw Error('请选择有效的娱乐类型');
  if (input.preference === '其他' && input.query.length < 2) throw Error('选择“其他”时，请输入想找的娱乐项目');
  const currentEntertainment = plan.entertainmentDays[input.dayIndex];
  if (input.selectedIds.some(id => !currentEntertainment.options.some(option => option.id === id))) throw Error('娱乐草稿已失效，请重新选择地点');
  const map = createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 });
  const activity = input.preference === '其他' ? input.query : input.preference;
  const keywords = input.preference === '其他'
    ? [activity, `${day.city} ${activity}`, `${anchor.name}附近 ${activity}`]
    : input.query ? [`${activity} ${input.query}`, `${input.query} ${activity}`, `${anchor.name}附近 ${activity}`, activity] : [`${anchor.name}附近 ${activity}`, `${day.city} ${activity}`, activity];
  const candidates = await map.discover(day.city, 'entertainment', keywords, 30, plan.request.transport);
  const routed = await Promise.all(candidates.map(async (candidate: any) => {
    const route = await map.route(anchor, candidate, plan.request.transport, day.city);
    const queriedAt = new Date().toISOString();
    return { id: `entertainment-${candidate.poiId}`, poiId: candidate.poiId, city: candidate.city, kind: 'entertainment' as const, name: candidate.name,
      address: candidate.address, lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl, imageUrl: candidate.imageUrl, imageAttribution: amapImageAttribution(candidate.imageUrl, queriedAt),
      time: '19:30', detail: `按“${activity}${input.preference !== '其他' && input.query ? ` · ${input.query}` : ''}”查询并结合当天路线筛选；营业和消费请确认。`, duration: '约 1.5 小时', durationMinutes: 90,
      cost: 0, costPending: true, indoor: true, routeMinutes: route.minutes, routeMeters: route.meters, preference: input.preference === '其他' ? `其他：${activity}` : input.preference };
  }));
  const found = await fillMissingWebImages(routed.filter(option => option.routeMeters !== null && option.routeMeters <= ENTERTAINMENT_RADIUS_METERS).sort((a, b) => (a.routeMeters ?? Infinity) - (b.routeMeters ?? Infinity) || (a.routeMinutes ?? Infinity) - (b.routeMinutes ?? Infinity)).slice(0, 12), process.env, fetch);
  const entertainmentDays = plan.entertainmentDays.map((value, index) => index === input.dayIndex ? {
    ...value, anchorName: anchor.name, selectedIds: input.selectedIds, options: [...value.options.filter(option => input.preference === '其他' ? !option.preference.startsWith('其他：') : option.preference !== input.preference), ...found],
    warning: found.length ? found.length < 4 ? `在当天路线 15 公里范围内仅核验到 ${found.length} 个${activity}地点，可补充区域或店名再次查询。` : undefined : `没有找到距当天路线 15 公里以内的${activity}地点。`,
  } : value);
  return { ...plan, entertainmentDays, sources: { ...plan.sources, updatedAt: new Date().toISOString() } };
}

import 'server-only';
import { budgetMeta, type EntertainmentSelection, type Plan, type RoutePath } from './plan';
import type { Stop } from './fixtures';
import { buildFoodPlan, createMapProvider } from './food-providers.mjs';
import { createRoutePoints } from './route-points.mjs';
import { orderStops } from './optimizer.mjs';
import { recommendHotels } from './hotels.mjs';
import type { FoodPlan, Restaurant } from './food-types';
import { verifyDayReservations } from './reservations.mjs';
import { amapImageAttribution, fillMissingWebImages } from './web-images.mjs';
import { ENTERTAINMENT_RADIUS_METERS, ENTERTAINMENT_TYPES } from './entertainment';
import { scheduleEntertainmentByAnchors } from './day-schedule.mjs';
import { asDraftFood, summarizeFood } from './food.mjs';

const normalize = (value: string) => value.replace(/[\s（）()·]/g, '').toLowerCase();
const rebuildFoodPlan = buildFoodPlan as unknown as (request: Plan['request'], days: Plan['days'], budget: Plan['budget'], env: NodeJS.ProcessEnv, fetcher: typeof fetch, options: { mapIntervalMs: number; preferredRestaurants: Restaurant[]; discoverySources: FoodPlan['sources'] | null }) => Promise<FoodPlan>;
const minutes = (value?: string | null) => value && /^\d{2}:\d{2}$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
const clockTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

function entertainmentAnchors(plan: Plan, dayIndex: number) {
  const day = plan.days[dayIndex];
  return plan.route.points.filter(point => point.date === day.date && ['hotel', 'attraction', 'restaurant'].includes(point.kind)).map(point => {
    if (point.kind === 'attraction') {
      const stop = day.stops.find(candidate => `stop:${day.date}:${candidate.id}` === point.id);
      const start = minutes(stop?.time) ?? 540;
      return { id: point.id, name: point.name, start, end: start + (stop?.durationMinutes || 90), stopId: stop?.id };
    }
    if (point.kind === 'restaurant') {
      const meal = plan.food.meals.find(candidate => `meal:${candidate.slot.id}` === point.id);
      const option = meal?.options.find(candidate => candidate.restaurant.id === meal.selectedId);
      return { id: point.id, name: point.name, start: option?.arrival ?? meal?.slot.earliest ?? 720, end: option?.finish ?? ((meal?.slot.earliest ?? 720) + plan.request.mealMinutes + plan.request.queueMinutes) };
    }
    const start = point.hotelRole === 'start' ? 510 : point.hotelRole === 'arrival' ? minutes(day.arrivalHotelTime) ?? 540 : minutes(day.endHotelTime) ?? minutes(day.mustFinishBy) ?? 1290;
    return { id: point.id, name: point.name, start, end: point.hotelRole === 'arrival' ? start + 30 : start, hotelRole: point.hotelRole };
  }).sort((a, b) => a.start - b.start);
}

function asAttraction(candidate: any, old: Stop, queriedAt: string): Stop {
  return {
    ...old, poiId: candidate.poiId, kind: 'attraction', name: candidate.name,
    address: candidate.address, lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl,
    imageUrl: candidate.imageUrl, imageAttribution: amapImageAttribution(candidate.imageUrl, queriedAt), detail: '你指定并经高德重新核验的景点；门票、开放时间和预约规则请在出发前确认。',
    reservation: { status: 'unknown', message: '预约要求待确认，请在出发前查看景区官方渠道。', sourceUrl: null, queriedAt },
  };
}

export async function routePaths(plan: Plan, points: Plan['route']['points'], map: ReturnType<typeof createMapProvider>): Promise<RoutePath[]> {
  const paths: RoutePath[] = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    if (from.date !== to.date && from.kind !== 'origin') continue;
    if (from.kind === 'origin') continue;
    const leg = await map.route(from, to, plan.request.transport, from.city, to.city);
    paths.push({ ...leg, fromId: from.id, toId: to.id, date: to.date, transport: plan.request.transport });
  }
  return paths;
}

export async function addRestaurantCandidates(plan: Plan, input: { mealId?: string; names: string[] }): Promise<Plan> {
  const meal = input.mealId ? plan.food.meals.find(item => item.slot.id === input.mealId) : null;
  if (input.mealId && !meal) throw Error('要补充的餐次不存在');
  if (!process.env.AMAP_API_KEY) throw Error('高德服务未配置，无法核验餐厅分店');
  const map = createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 });
  const cities = meal ? [meal.slot.city] : [...new Set(plan.food.meals.map(item => item.slot.city))];
  const candidatesByName = new Map(input.names.map(name => [name, [] as any[]]));
  for (const city of cities) {
    const places = await map.discover(city, 'food', input.names, Math.min(20, input.names.length * 4), plan.request.transport);
    for (const name of input.names) {
      const exact = places.filter((place: any) => normalize(place.name) === normalize(name));
      const possible = exact.length ? exact : places.filter((place: any) => normalize(place.name).includes(normalize(name)) || normalize(name).includes(normalize(place.name)));
      for (const place of possible) if (!candidatesByName.get(name)?.some(candidate => candidate.poiId === place.poiId)) candidatesByName.get(name)?.push({ ...place, city });
    }
  }
  const matches: any[] = [];
  const decisions: import('./food-types').ManualRestaurantDecision[] = [];
  for (const [name, candidates] of candidatesByName) {
    if (candidates.length > 1) {
      decisions.push({ input: name, status: 'needs_branch', candidates: candidates.slice(0, 5).map(candidate => ({ restaurantId: candidate.poiId, name: candidate.name, address: candidate.address })), reasons: ['匹配到多个分店，请输入完整分店名称后重新核验。'] });
      continue;
    }
    if (candidates[0]) matches.push({ ...candidates[0], inputName: name });
    else decisions.push({ input: name, status: 'unassigned', reasons: ['没有在本次目的地中找到可核验的具体餐厅，请检查名称或补充分店。'] });
  }
  const previousDecisions = (plan.food.manualRestaurants || []).filter(item => !input.names.includes(item.input));
  if (!matches.length) return { ...plan, food: { ...plan.food, manualRestaurants: [...previousDecisions, ...decisions] }, sources: { ...plan.sources, updatedAt: new Date().toISOString() } };
  const existing = plan.food.meals.flatMap(item => item.options.map(option => option.restaurant));
  const preferredRestaurants: Restaurant[] = [...existing, ...matches.map((place: any) => ({ id: place.poiId, city: place.city, preferred: true, ...(meal ? { preferredMealId: meal.slot.id } : {}), name: place.name, address: place.address, lng: place.lng, lat: place.lat, category: place.category, price: place.price || null, hours: place.hours || '', source: '用户输入 + 高德地图 POI', queriedAt: new Date().toISOString(), imageUrl: place.imageUrl || null, navigationUrl: place.navigationUrl || null, tips: [] }))];
  const generated = await rebuildFoodPlan(plan.request, plan.days, plan.budget, process.env, fetch, { mapIntervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400, preferredRestaurants, discoverySources: null });
  if (!meal) {
    const claimedMeals = new Set<string>();
    for (const place of matches) {
      generated.meals.forEach(candidateMeal => { if (candidateMeal.selectedId === place.poiId) { candidateMeal.selectedId = null; candidateMeal.locked = false; } });
      const choices = generated.meals.flatMap(candidateMeal => candidateMeal.options
        .filter(option => option.restaurant.id === place.poiId && !option.hardBlocked)
        .map(option => ({ meal: candidateMeal, option })))
        .sort((a, b) => Number(a.option.reasons.length > 0) - Number(b.option.reasons.length > 0)
          || (a.option.extraMinutes ?? Number.MAX_SAFE_INTEGER) - (b.option.extraMinutes ?? Number.MAX_SAFE_INTEGER));
      const best = choices.find(choice => !claimedMeals.has(choice.meal.slot.id));
      if (best) { best.meal.selectedId = place.poiId; best.meal.locked = true; claimedMeals.add(best.meal.slot.id); }
    }
    generated.summary = summarizeFood(generated);
  }
  const food: FoodPlan = plan.phase === 'food_selection' ? asDraftFood(generated) : generated;
  for (const place of matches) {
    const assigned = food.meals.find(candidateMeal => (plan.phase === 'food_selection' ? candidateMeal.draftSelectedId : candidateMeal.selectedId) === place.poiId);
    const option = assigned?.options.find(candidate => candidate.restaurant.id === place.poiId);
    if (!assigned || !option) decisions.push({ input: place.inputName, restaurantId: place.poiId, matchedName: place.name, address: place.address, status: 'unassigned', reasons: ['已核验具体分店，但当前没有可容纳它的午餐或晚餐位置。'] });
    else decisions.push({ input: place.inputName, restaurantId: place.poiId, matchedName: place.name, address: place.address, mealId: assigned.slot.id, mealLabel: `${assigned.slot.date} ${assigned.slot.label}`, dayIndex: assigned.slot.dayIndex, extraMinutes: option.extraMinutes, status: option.reasons.length || option.pending.length ? 'needs_risk_confirmation' : 'scheduled_draft', reasons: [...option.reasons, ...option.pending] });
  }
  food.manualRestaurants = [...previousDecisions, ...decisions];
  if (plan.phase === 'food_selection') return { ...plan, food, sources: { ...plan.sources, updatedAt: new Date().toISOString() } };
  const origin = plan.route.points.find(point => point.kind === 'origin') || null;
  const points = createRoutePoints(origin, plan.request, plan.days, food);
  const paths = await routePaths(plan, points, map);
  const route = { ...plan.route, points, paths, state: paths.length && paths.every(path => path.state === 'live') ? 'live' as const : 'pending' as const, queriedAt: new Date().toISOString() };
  return { ...plan, food, route, budgetMeta: budgetMeta(plan.request, route), sources: { ...plan.sources, map: route.state, updatedAt: new Date().toISOString() } };
}

export async function finalizeFoodPlan(plan: Plan, selections: { mealId: string; restaurantId: string | null; acceptWarnings: boolean }[], skippedManualInputs: string[] = []): Promise<Plan> {
  if (plan.phase !== 'food_selection') throw Error('餐厅已经确认，无需重复生成最终路线');
  if (!process.env.AMAP_API_KEY) throw Error('高德服务未配置，无法生成含餐厅的最终路线');
  const selectedByMeal = new Map(selections.map(item => [item.mealId, item]));
  const food = structuredClone(plan.food);
  const skipped = new Set(skippedManualInputs);
  for (const decision of food.manualRestaurants || []) {
    if (skipped.has(decision.input)) { decision.status = 'explicitly_skipped'; continue; }
    if (!decision.restaurantId || !decision.mealId) throw Error(`指定餐厅“${decision.input}”尚未安排：${decision.reasons[0] || '请先处理分店或餐次'}`);
    const chosen = selectedByMeal.get(decision.mealId);
    const restaurantId = chosen ? chosen.restaurantId : food.meals.find(meal => meal.slot.id === decision.mealId)?.draftSelectedId;
    if (restaurantId !== decision.restaurantId) throw Error(`指定餐厅“${decision.matchedName || decision.input}”没有进入任何餐次，请重新选择它或明确跳过`);
  }
  for (const meal of food.meals) {
    const selection = selectedByMeal.get(meal.slot.id);
    const restaurantId = selection ? selection.restaurantId : meal.draftSelectedId || null;
    if (!restaurantId) { meal.selectedId = null; meal.draftSelectedId = null; continue; }
    const option = meal.options.find(item => item.restaurant.id === restaurantId);
    if (!option) throw Error(`${meal.slot.label}的餐厅候选已失效，请重新选择`);
    if (option.hardBlocked) throw Error(`${option.restaurant.name}存在明确饮食禁忌冲突，不能加入路线`);
    if (option.reasons.length && !selection?.acceptWarnings) throw Error(`${option.restaurant.name}存在“${option.reasons.join('、')}”，请先确认风险后再生成路线`);
    meal.selectedId = restaurantId; meal.draftSelectedId = restaurantId; meal.locked = Boolean(option.reasons.length || option.pending.length);
  }
  food.summary = summarizeFood(food);
  food.manualRestaurants = (food.manualRestaurants || []).map(decision => decision.status === 'explicitly_skipped' ? decision : { ...decision, status: 'finalized' as const, reasons: decision.reasons });
  const map = createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 });
  const origin = plan.route.points.find(point => point.kind === 'origin') || null;
  const points = createRoutePoints(origin, plan.request, plan.days, food);
  const paths = await routePaths(plan, points, map);
  const route = { ...plan.route, points, paths, state: paths.length && paths.every(path => path.state === 'live') ? 'live' as const : 'pending' as const, queriedAt: new Date().toISOString(), note: '已按用户确认的餐厅重新计算最终路线；实时道路与营业情况仍以出发前查询为准。' };
  return { ...plan, phase: 'final', food, route, budgetMeta: budgetMeta(plan.request, route), sources: { ...plan.sources, map: route.state, updatedAt: new Date().toISOString() } };
}

export async function replanDay(plan: Plan, change: { dayIndex: number; replacements: { stopId: string; name: string }[]; removedStopIds: string[]; entertainmentSelections: EntertainmentSelection[] }): Promise<Plan> {
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
  const previousAnchor = day.startHotel || (change.dayIndex > 0 ? plan.days[change.dayIndex - 1].endHotel || plan.days[change.dayIndex - 1].stops.at(-1) || null : plan.route.points.find(point => point.kind === 'origin') || null);
  attractions = orderStops(attractions, previousAnchor);
  const entertainment = plan.entertainmentDays[change.dayIndex];
  const selectedEntertainment = change.entertainmentSelections.map(selection => {
    const option = entertainment?.options.find(candidate => candidate.id === selection.id);
    return option && option.anchorPointId === selection.anchorPointId && option.position === selection.position ? option : null;
  });
  if (selectedEntertainment.some(option => !option)) throw Error('娱乐地点选项已失效，请重新生成方案');
  const selectedEntertainmentStops = selectedEntertainment.filter((option): option is NonNullable<typeof option> => Boolean(option));
  const anchors = entertainmentAnchors(plan, change.dayIndex);
  const scheduledStops = scheduleEntertainmentByAnchors(attractions, selectedEntertainmentStops, anchors, minutes(day.availableFrom) ?? 540, minutes(day.mustFinishBy) ?? 1290) as Stop[];
  const lastStop = scheduledStops.at(-1);
  const recalculatedHotelTime = lastStop && day.endHotel ? clockTime((minutes(lastStop.time) ?? 0) + (lastStop.durationMinutes || 90) + 30) : day.endHotelTime;
  let newDay = { ...day, stops: scheduledStops, endHotelTime: recalculatedHotelTime };
  newDay = await verifyDayReservations(newDay);
  newDay.title = `第 ${change.dayIndex + 1} 天 · ${day.city} · ${newDay.stops[0]?.name || '待补充地点'}`;
  const days = plan.days.map((value, index) => index === change.dayIndex ? newDay : value);
  const preferredRestaurants = plan.food.meals.flatMap(meal => meal.options.map(option => option.restaurant));
  const foodDays = days;
  const food = await rebuildFoodPlan(plan.request, foodDays, plan.budget, process.env, fetch, { mapIntervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400, preferredRestaurants, discoverySources: plan.food.sources });
  food.manualRestaurants = plan.food.manualRestaurants || [];
  const origin = plan.route.points.find(point => point.kind === 'origin') || null;
  const points = createRoutePoints(origin, plan.request, days, food);
  const paths = await routePaths(plan, points, map);
  const route = { ...plan.route, points, paths, state: paths.length && paths.every(path => path.state === 'live') ? 'live' as const : 'pending' as const, queriedAt: new Date().toISOString() };
  const dayBudget = Object.values(plan.budget).reduce((sum, value) => sum + value, 0) / plan.request.days;
  const booked = newDay.endHotel || newDay.startHotel;
  const hotels = booked ? [{ id: booked.id, title: '已预订酒店', area: booked.name, rationale: '酒店已作为当天路线起点或终点参与道路规划。', filters: '地点已由高德核验', priceGuide: '已预订，费用未计入实时估算', ctripUrl: '', query: booked.name, booked: true, address: booked.address, navigationUrl: booked.navigationUrl }] : recommendHotels({ destination: day.city, days: 1, budget: dayBudget, travelers: plan.request.travelers, preferences: plan.request.preferences || '', stops: newDay.stops });
  const dayGuides = plan.dayGuides.map((guide, index) => index === change.dayIndex ? { ...guide, hotels, reminders: [(guide.weather.rain ?? 0) >= 50 ? '降水概率较高，带伞并优先保留室内备选。' : guide.weather.state === 'pending' ? '该日期暂无可靠天气预报，请临近出发时再次查询。' : '天气适合按计划出行，仍建议准备防晒和饮水。', newDay.stops.some(stop => stop.kind === 'entertainment') ? '娱乐活动已按指定行程点前后插入，请再次确认营业时间、消费和返程方式。' : '本日未安排娱乐活动，可选择行程点前后再查询。', '景区预约要求会变化，状态为待确认时请查看景区官方渠道。'] } : guide);
  const entertainmentDays = plan.entertainmentDays.map((value, index) => index === change.dayIndex ? { ...value, selections: change.entertainmentSelections } : value);
  return { ...plan, days, food, route, budgetMeta: budgetMeta(plan.request, route), dayGuides, entertainmentDays, sources: { ...plan.sources, map: route.state, updatedAt: new Date().toISOString() } };
}

export async function searchEntertainment(plan: Plan, input: { dayIndex: number; preference: string; query: string; anchorPointId: string; position: 'before' | 'after'; selectedIds: string[] }): Promise<Plan> {
  const day = plan.days[input.dayIndex];
  if (!day) throw Error('要查询的日期不存在');
  if (!process.env.AMAP_API_KEY) throw Error('高德服务未配置，无法查询娱乐地点');
  const routePoints = plan.route.points.filter(point => point.date === day.date && point.kind !== 'origin' && point.kind !== 'entertainment');
  const anchorIndex = routePoints.findIndex(point => point.id === input.anchorPointId);
  const anchor = routePoints[anchorIndex];
  if (!anchor?.verified) throw Error('当天路线缺少已核验坐标，无法筛选顺路地点');
  if (!['hotel', 'attraction', 'restaurant'].includes(anchor.kind)) throw Error('请选择酒店、景点或已确认餐厅作为娱乐活动锚点');
  if (anchor.kind === 'hotel' && anchor.hotelRole === 'start' && input.position === 'before') throw Error('当天出发酒店之前不能安排娱乐活动');
  if (anchor.kind === 'hotel' && anchor.hotelRole === 'end' && input.position === 'after') throw Error('当天返回酒店之后不能安排娱乐活动');
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
  const adjacent = input.position === 'before' ? routePoints[anchorIndex - 1] : routePoints[anchorIndex + 1];
  const routed = await Promise.all(candidates.map(async (candidate: any) => {
    const first = await map.route(input.position === 'before' ? adjacent || anchor : anchor, candidate, plan.request.transport, day.city);
    const second = adjacent ? await map.route(candidate, input.position === 'before' ? anchor : adjacent, plan.request.transport, day.city) : null;
    const direct = adjacent ? await map.route(input.position === 'before' ? adjacent : anchor, input.position === 'before' ? anchor : adjacent, plan.request.transport, day.city) : null;
    const routeMinutes = first.minutes === null || (second && second.minutes === null) ? null : (first.minutes || 0) + (second?.minutes || 0);
    const routeMeters = first.meters === null || (second && second.meters === null) ? null : (first.meters || 0) + (second?.meters || 0);
    const insertionExtraMinutes = routeMinutes === null ? null : Math.max(0, routeMinutes - (direct?.minutes || 0));
    const queriedAt = new Date().toISOString();
    return { id: `entertainment-${candidate.poiId}-${input.dayIndex}-${input.position}`, poiId: candidate.poiId, city: candidate.city, kind: 'entertainment' as const, name: candidate.name,
      address: candidate.address, lng: candidate.lng, lat: candidate.lat, verified: true, navigationUrl: candidate.navigationUrl, imageUrl: candidate.imageUrl, imageAttribution: amapImageAttribution(candidate.imageUrl, queriedAt),
      time: '', detail: `安排在“${anchor.name}”${input.position === 'before' ? '之前' : '之后'}；营业和消费请确认。`, duration: '约 1.5 小时', durationMinutes: 90,
      cost: 0, costPending: true, indoor: true, routeMinutes, routeMeters, insertionExtraMinutes, anchorPointId: anchor.id, position: input.position, preference: input.preference === '其他' ? `其他：${activity}` : input.preference };
  }));
  const found = await fillMissingWebImages(routed.filter(option => option.routeMeters !== null && option.routeMeters <= ENTERTAINMENT_RADIUS_METERS).sort((a, b) => (a.routeMeters ?? Infinity) - (b.routeMeters ?? Infinity) || (a.routeMinutes ?? Infinity) - (b.routeMinutes ?? Infinity)).slice(0, 12), process.env, fetch);
  const entertainmentDays = plan.entertainmentDays.map((value, index) => index === input.dayIndex ? {
    ...value, anchorName: anchor.name, options: [...value.options.filter(option => !(option.anchorPointId === anchor.id && option.position === input.position && (input.preference === '其他' ? option.preference.startsWith('其他：') : option.preference === input.preference))), ...found],
    warning: found.length ? found.length < 4 ? `在当天路线 15 公里范围内仅核验到 ${found.length} 个${activity}地点，可补充区域或店名再次查询。` : undefined : `没有找到距当天路线 15 公里以内的${activity}地点。`,
  } : value);
  return { ...plan, entertainmentDays, sources: { ...plan.sources, updatedAt: new Date().toISOString() } };
}

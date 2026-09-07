/** Pure constraints: providers and UI must use the same rules. */
export const clockTime = minutes => minutes == null ? '待确认' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const toMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function allocateBudget(request) {
  const total = Math.round(request.budget * (request.budgetBasis === 'person' ? request.travelers : 1));
  const result = { transport: Math.floor(total * .2), stay: Math.floor(total * .38), food: Math.floor(total * .22), activities: Math.floor(total * .1), buffer: 0 };
  result.buffer = total - result.transport - result.stay - result.food - result.activities;
  return result;
}

/** Inspect the larger POI pool before spending route calls on a small shortlist. */
export function shortlistRestaurants(restaurants, slot, request, used = new Set()) {
  const terms = (request.foodPreferences || '').split(/[，,、;；\s]+/).filter(Boolean);
  const priority = restaurant => {
    const affordable = restaurant.price && restaurant.price.high * request.travelers <= slot.foodLimit;
    const open = isOpenDuring(restaurant.hours, slot.earliest, slot.earliest + request.mealMinutes + request.queueMinutes);
    return (used.has(restaurant.id) ? -1000 : 0) + (restaurant.preferred ? 500 : 0) + (affordable ? 100 : restaurant.price ? -100 : 0)
      + (open === true ? 30 : open === false ? -30 : 0)
      + terms.filter(term => `${restaurant.name} ${restaurant.category}`.includes(term)).length * 15
      + Math.min(3, restaurant.tips.length) * 5;
  };
  return restaurants.slice().sort((a, b) => priority(b) - priority(a));
}

/** @returns {import('./food-types').MealSlot[]} */
export function createMealSlots(days, budget) {
  const perDay = Math.floor(Math.floor(budget.food * .8) / days.length);
  const transportLimit = Math.floor(budget.transport / (days.length * 2));
  return days.flatMap((day, dayIndex) => {
    if (!day.stops.length) return [];
    const lunchIndex = Math.max(0, day.stops.findLastIndex(stop => toMinutes(stop.time) < 12 * 60));
    return [{ label: '午餐', index: lunchIndex, earliest: 720, latest: 840, share: .4 },
      { label: '晚餐', index: day.stops.length - 1, earliest: 1080, latest: 1200, share: .6 }].map((meal, i) => ({
      id: `${day.date}-${i ? 'dinner' : 'lunch'}`, dayIndex, city: day.city, label: meal.label, date: day.date,
      previous: day.stops[meal.index], next: i ? null : day.stops[meal.index + 1] || null,
      earliest: meal.earliest, latest: meal.latest,
      depart: toMinutes(day.stops[meal.index].time) + (day.stops[meal.index].durationMinutes || 90),
      nextDeadline: i || !day.stops[meal.index + 1] ? 1440 : toMinutes(day.stops[meal.index + 1].time),
      foodLimit: Math.floor(perDay * meal.share), transportLimit,
    }));
  });
}

export function isOpenDuring(hours, start, end) {
  const value = (hours || '').trim();
  if (/^(全天|24小时|00:00[-–—~至]24:00)$/.test(value)) return true;
  // AMap often returns weekday labels and split sessions. We can safely evaluate the
  // listed time ranges; holiday/seasonal/free-text schedules remain unknown.
  if (!value || /周末|工作日|节假日|法定假日|季节|另行通知|电话咨询|不定时/.test(value)) return null;
  const normalized = value.replace(/(?:每天|周[一二三四五六日天](?:至|到|[-–—~])周[一二三四五六日天]?|星期[一二三四五六日](?:至|到|[-–—~])星期[一二三四五六日]?)[：:]?\s*/g, '');
  const ranges = [...normalized.matchAll(/(\d{1,2}):(\d{2})\s*[-–—~至]\s*(\d{1,2}):(\d{2})/g)];
  if (!ranges.length) return null;
  if (ranges.some(m => +m[1] > 23 || +m[2] > 59 || +m[3] > 24 || +m[4] > 59 || (+m[3] === 24 && +m[4] !== 0))) return null;
  return ranges.some(m => {
    const from = +m[1] * 60 + +m[2];
    let to = +m[3] * 60 + +m[4];
    if (to <= from) to += 1440;
    return (start >= from && end <= to) || (start + 1440 >= from && end + 1440 <= to);
  });
}

/** @param {import('./food-types').Restaurant} restaurant
 * @param {import('./food-types').MealSlot} slot
 * @param {import('./food-types').RouteLeg[]} route
 * @param {import('./food-types').RouteLeg | null} direct
 * @returns {import('./food-types').MealOption} */
export function evaluateRestaurant(restaurant, slot, route, direct, request) {
  const reasons = [], pending = [];
  const routeKnown = route.length === (slot.next ? 2 : 1) && route.every(r => r.state === 'live' && Number.isFinite(r.minutes)) && (!slot.next || (direct?.state === 'live' && Number.isFinite(direct.minutes)));
  const extraMinutes = routeKnown ? Math.max(0, route.reduce((n, leg) => n + leg.minutes, 0) - (direct?.minutes || 0)) : null;
  const fareKnown = routeKnown && route.every(r => r.fare !== null) && (!slot.next || direct?.fare !== null);
  const extraFare = fareKnown ? Math.max(0, Math.ceil((route.reduce((n, leg) => n + leg.fare, 0) - (direct?.fare || 0)) * (request.transport === 'drive' ? Math.ceil(request.travelers / 4) : request.travelers))) : null;
  const totalLow = restaurant.price ? restaurant.price.low * request.travelers : null;
  const totalHigh = restaurant.price ? restaurant.price.high * request.travelers : null;
  const arrival = routeKnown ? Math.max(slot.earliest, slot.depart + route[0].minutes) : null;
  const finish = arrival === null ? null : arrival + request.mealMinutes + request.queueMinutes;
  if (totalHigh === null) pending.push('人均价格缺失，预算待确认');
  else if (totalHigh > slot.foodLimit) reasons.push('全员本餐费用超过分配预算');
  if (extraMinutes === null) pending.push('路线待确认');
  else if (extraMinutes > request.maxDetour) reasons.push('额外交通时间超过绕路上限');
  if (extraFare === null) pending.push('额外交通费用待确认');
  else if (extraFare > slot.transportLimit) reasons.push('额外交通费超过本餐交通预留');
  if (finish !== null && (finish > slot.latest || (slot.next && finish + route[1].minutes > slot.nextDeadline))) reasons.push('用餐或排队时间与行程冲突');
  const open = arrival === null || (restaurant.hoursDate && restaurant.hoursDate !== slot.date) ? null : isOpenDuring(restaurant.hours, arrival, finish);
  if (open === false) reasons.push('营业时段不覆盖完整用餐时间');
  if (open === null) pending.push('营业时间待确认');
  // A post or category cannot certify ingredients, allergens or cross contamination.
  const restrictions = (request.dietary || '').trim();
  if (restrictions) {
    const forbidden = restrictions.split(/[，,、;；\s]+/).map(x => x.replace(/^(不吃|忌|避免|不能吃|不要)/, '')).filter(Boolean);
    if (forbidden.some(word => restaurant.name.includes(word) || restaurant.category.includes(word))) reasons.push('门店类型与饮食禁忌冲突');
    else pending.push('饮食禁忌需向门店确认，不自动入选');
  }
  if (/过敏|不吃|忌口|清真|素食/.test(request.constraints || '') && !restrictions) pending.push('旅行限制含饮食要求，需向门店确认');
  const terms = (request.foodPreferences || request.preferences || '').split(/[，,、;；\s]+/).filter(Boolean);
  const haystack = `${restaurant.name} ${restaurant.category} ${restaurant.tips.map(t => t.quote).join(' ')}`;
  const matches = terms.filter(term => haystack.includes(term));
  const evidenceCount = new Set(restaurant.tips.map(t => t.sourceId)).size;
  const rankEvidence = restaurant.tips.some(t => t.category === 'ranking');
  const score = matches.length * 15 + Math.min(3, evidenceCount) * 5 + (rankEvidence ? 3 : 0) - (extraMinutes ?? 999) * (request.foodMode === 'food' ? .3 : 2) - (totalHigh ?? 9999) / 100;
  const hardBlocked = reasons.some(reason => /饮食禁忌冲突|营业时段不覆盖|用餐或排队时间与行程冲突/.test(reason));
  const canAcceptPending = !hardBlocked && (pending.length > 0 || reasons.length > 0);
  return { restaurant, route, direct, extraMinutes, extraFare, totalLow, totalHigh, arrival, finish,
    eligible: !reasons.length && !pending.length, canAcceptPending, hardBlocked, reasons, pending, score,
    explanation: [matches.length ? `匹配口味：${matches.join('、')}` : '按当前路线与预算筛选', evidenceCount ? `${evidenceCount} 个来源线索（待确认）` : '高德周边门店', rankEvidence ? '含榜单线索，未认证上榜' : '', extraMinutes !== null ? `额外交通约 ${extraMinutes} 分钟` : '路线尚未确认'].filter(Boolean).join('；') };
}

/** @param {import('./food-types').FoodPlan} food */
export function summarizeFood(food) {
  const chosen = food.meals.map(m => m.options.find(o => o.restaurant.id === m.selectedId)).filter(Boolean);
  return { ...food.summary, selectedLow: chosen.reduce((n, o) => n + o.totalLow, 0),
    selectedHigh: chosen.reduce((n, o) => n + o.totalHigh, 0), extraTransport: chosen.reduce((n, o) => n + o.extraFare, 0),
    unresolved: food.meals.length - chosen.length,
    remaining: food.summary.allocated - food.summary.breakfastReserve - chosen.reduce((n, o) => n + o.totalHigh, 0) };
}

/** @param {import('./food-types').FoodPlan} food
 * @returns {import('./food-types').FoodPlan} */
export function changeMeal(food, mealId, action, restaurantId) {
  const next = structuredClone(food);
  const meal = next.meals.find(m => m.slot.id === mealId);
  if (!meal) throw Error('餐次不存在');
  if (action === 'lock') {
    if (!meal.selectedId) throw Error('尚无可锁定的门店');
    meal.locked = !meal.locked;
  } else {
    if (meal.locked) throw Error('请先解锁这顿饭');
    const selected = meal.options.find(o => o.restaurant.id === meal.selectedId);
    const used = new Set(next.meals.filter(m => m !== meal).map(m => m.selectedId));
    let candidates = meal.options.filter(o => (o.eligible || (action === 'select' && o.canAcceptPending)) && o.restaurant.id !== meal.selectedId && !used.has(o.restaurant.id));
    if (action === 'cheaper') candidates = candidates.filter(o => !selected || o.totalHigh < selected.totalHigh).sort((a, b) => a.totalHigh - b.totalHigh);
    else if (action === 'closer') candidates = candidates.filter(o => !selected || o.extraMinutes < selected.extraMinutes).sort((a, b) => a.extraMinutes - b.extraMinutes);
    else if (action === 'select') candidates = candidates.filter(o => o.restaurant.id === restaurantId);
    else throw Error('不支持的操作');
    if (!candidates.length) throw Error('该门店存在明确冲突，或没有符合当前条件的替代门店');
    meal.selectedId = candidates[0].restaurant.id;
  }
  next.summary = summarizeFood(next);
  if (next.summary.remaining < 0) throw Error('替换将超出餐饮预算');
  return next;
}

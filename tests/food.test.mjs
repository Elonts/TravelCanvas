import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateBudget, asDraftFood, changeDraftMeal, createMealSlots, evaluateRestaurant, isOpenDuring, changeMeal, summarizeFood, shortlistRestaurants } from '../lib/food.mjs';
import { requestSchema, restaurantSearchSchema, dayReplanSchema, readJson } from '../lib/requests.mjs';
import { PlanStore } from '../lib/plan-store.mjs';

const request = requestSchema.parse({ origin: '上海', destinations: ['杭州'], startDate: '2026-09-10', days: 1, budget: 4000, travelers: 2, transport: 'walk' });
const stop = { id: 's1', name: '景点甲', time: '09:00', durationMinutes: 90, verified: true, lng: 120.1, lat: 30.2 };
const days = [{ city: '杭州', date: request.startDate, stops: [{ ...stop, city: '杭州' }, { ...stop, city: '杭州', id: 's2', name: '景点乙', time: '14:30' }] }];
const slot = createMealSlots(days, allocateBudget(request))[0];
const restaurant = { id: 'r1', name: '测试餐厅（西湖店）', category: '杭帮菜', address: '测试地址', lng: 120.1, lat: 30.2, price: { low: 40, high: 60 }, hours: '10:00-22:00', tips: [] };
const leg = (minutes, fare = 0) => ({ minutes, fare, meters: 500, state: 'live', from: '甲', to: '乙', queriedAt: '2026-09-06T00:00:00Z' });
const evaluate = (r = restaurant, s = slot, req = request, route = [leg(10), leg(10)], direct = leg(10)) => evaluateRestaurant(r, s, route, direct, req);
const option = evaluate();
const food = { meals: [{ slot, options: [option, { ...option, restaurant: { ...restaurant, id: 'r2' }, totalLow: 60, totalHigh: 80, extraMinutes: 15 }, { ...option, restaurant: { ...restaurant, id: 'r3' }, totalLow: 90, totalHigh: 100, extraMinutes: 2 }], selectedId: 'r1', locked: false }], sources: [], tips: [], warnings: [], summary: { allocated: 880, breakfastReserve: 176 } };
food.summary = summarizeFood(food);

test('budget basis, rounding and all meal caps conserve group budget', () => {
  for (const basis of ['person', 'group']) for (const count of [1, 2, 8]) for (const length of [1, 2, 10]) {
    const input = { ...request, budget: 4001, travelers: count, days: length, budgetBasis: basis };
    const budget = allocateBudget(input);
    assert.equal(Object.values(budget).reduce((a, b) => a + b), 4001 * (basis === 'person' ? count : 1));
    const slots = createMealSlots(Array.from({ length }, () => days[0]), budget);
    assert.ok(slots.reduce((n, s) => n + s.foodLimit, 0) <= Math.floor(budget.food * .8));
    assert.ok(slots.reduce((n, s) => n + s.transportLimit, 0) <= budget.transport);
  }
});
test('budget transport cap follows selected mode and one-day trips do not reserve lodging', () => {
  const walk = allocateBudget({ ...request, days: 1, transport: 'walk' });
  const transit = allocateBudget({ ...request, days: 1, transport: 'transit' });
  const drive = allocateBudget({ ...request, days: 1, transport: 'drive' });
  assert.equal(walk.stay, 0);
  assert.ok(walk.transport < transit.transport && transit.transport < drive.transport);
  assert.ok(walk.remaining > 0 && !('buffer' in walk));
});
test('uses directed route insertion delta and multiplies food cost by travelers', () => {
  assert.equal(option.extraMinutes, 10); assert.equal(option.extraMeters, 500); assert.equal(option.totalHigh, 120); assert.equal(option.eligible, true);
  assert.equal(evaluate(restaurant, slot, request, [leg(3), leg(3)], leg(10)).extraMinutes, 0);
});
test('restaurant endpoint accepts either names or a server-issued branch selection shape', () => {
  const base = { planId: '00000000-0000-4000-8000-000000000000', revision: 2 };
  assert.equal(restaurantSearchSchema.safeParse({ ...base, names: ['测试餐厅'] }).success, true);
  assert.equal(restaurantSearchSchema.safeParse({ ...base, manualInput: '测试', restaurantId: 'poi-1', mealId: 'meal-1' }).success, true);
  assert.equal(restaurantSearchSchema.safeParse({ ...base, manualInput: '测试', restaurantId: 'forged' }).success, false);
  assert.equal(restaurantSearchSchema.safeParse({ ...base, names: ['测试餐厅'], cookie: 'secret' }).success, false);
});
test('hard caps cannot be overridden by food-first ranking', () => {
  assert.match(evaluate(restaurant, { ...slot, foodLimit: 100 }).reasons.join(), /预算/);
  assert.match(evaluate(restaurant, slot, { ...request, maxDetour: 5, foodMode: 'food' }).reasons.join(), /绕路/);
  assert.match(evaluate(restaurant, { ...slot, transportLimit: 5 }, { ...request, transport: 'transit' }, [leg(5, 4), leg(5, 4)], leg(5, 2)).reasons.join(), /交通费/);
});
test('missing or empty price, route, fare and hours never satisfy constraints', () => {
  assert.equal(evaluate({ ...restaurant, price: null }).eligible, false);
  assert.equal(evaluate({ ...restaurant, hours: '' }).eligible, false);
  assert.equal(evaluate(restaurant, slot, request, [{ ...leg(0), minutes: null, state: 'pending' }]).eligible, false);
  assert.equal(evaluate(restaurant, slot, request, [leg(5, null), leg(5)], leg(5)).eligible, false);
});
test('unknown data is explicitly acceptable while hard conflicts remain blocked', () => {
  const unknown = evaluate({ ...restaurant, price: null, hours: '' }, slot, request, [{ ...leg(0), state: 'pending', minutes: null }]);
  assert.equal(unknown.eligible, false); assert.equal(unknown.canAcceptPending, true);
  const conflict = evaluate({ ...restaurant, price: { low: 9999, high: 9999 } }, slot, request);
  assert.equal(conflict.canAcceptPending, true); assert.equal(conflict.hardBlocked, false); assert.ok(conflict.reasons.length);
  const allergy = evaluate({ ...restaurant, name: '牛肉面馆' }, slot, { ...request, dietary: '不吃牛肉' });
  assert.equal(allergy.canAcceptPending, false); assert.equal(allergy.hardBlocked, true);
});
test('login-session heat cannot override a dietary hard conflict', () => {
  const popularConflict = evaluate({ ...restaurant, name: '牛肉面馆', tips: [{ id: 'x', sourceId: 'x', placeName: '牛肉面馆', text: '牛肉面馆', quote: '牛肉面馆', category: 'ranking', state: 'pending', sourceKind: 'xhs_session', searchRank: 1, visibleLikes: 999999 }] }, slot, { ...request, dietary: '不吃牛肉' });
  assert.equal(popularConflict.hardBlocked, true);
  assert.equal(popularConflict.canAcceptPending, false);
});
test('unknown prices are reported as pending instead of zero', () => {
  const unknown = evaluate({ ...restaurant, price: null });
  const pendingFood = { ...food, meals: [{ ...food.meals[0], options: [unknown], selectedId: unknown.restaurant.id }] };
  const summary = summarizeFood(pendingFood);
  assert.equal(summary.selectedHigh, 0);
  assert.equal(summary.selectedCostPending, 1);
});
test('a soft budget conflict can be explicitly selected and locked with its warning preserved', () => {
  const expensive = evaluate({ ...restaurant, id: 'expensive', price: { low: 2000, high: 2200 } });
  assert.match(expensive.reasons.join(), /超过分配预算/);
  assert.equal(expensive.canAcceptPending, true);
  const unlocked = { ...food, meals: [{ ...food.meals[0], options: [...food.meals[0].options, expensive] }] };
  const changed = changeMeal(unlocked, slot.id, 'selectAndLock', 'expensive');
  assert.equal(changed.meals[0].selectedId, 'expensive');
  assert.equal(changed.meals[0].locked, true);
  assert.ok(changed.summary.remaining < 0);
});
test('opening ranges cover entire meal and parse overnight conservatively', () => {
  assert.equal(isOpenDuring('10:00-14:00;17:00-22:00', 720, 800), true);
  assert.equal(isOpenDuring('10:00-12:30', 720, 800), false);
  assert.equal(isOpenDuring('18:00-02:00', 60, 100), true);
  assert.equal(isOpenDuring('周末 10:00-22:00', 720, 800), null);
  assert.equal(isOpenDuring('25:00-26:00', 720, 800), null);
  assert.equal(isOpenDuring('全天', 720, 800), true);
  assert.equal(isOpenDuring('周一至周日 10:00-22:00', 720, 800), true);
  assert.equal(evaluate({ ...restaurant, hoursDate: '2026-09-06' }).eligible, false, 'today-only hours cannot certify a future meal');
});
test('queue duration, next appointment and closing time are enforced', () => {
  assert.match(evaluate(restaurant, { ...slot, nextDeadline: 760 }).reasons.join(), /冲突/);
  assert.match(evaluate(restaurant, slot, { ...request, queueMinutes: 100 }).reasons.join(), /冲突/);
  assert.match(evaluate({ ...restaurant, hours: '17:00-22:00' }).reasons.join(), /营业/);
});
test('diet conflicts exclude; absent ingredient evidence remains pending', () => {
  assert.match(evaluate({ ...restaurant, name: '牛肉面馆' }, slot, { ...request, dietary: '不吃牛肉' }).reasons.join(), /禁忌/);
  assert.equal(evaluate(restaurant, slot, { ...request, dietary: '花生过敏' }).eligible, false);
  assert.equal(evaluate(restaurant, slot, { ...request, constraints: '不吃牛肉' }).eligible, false);
});
test('dinner has no fictional return leg and cars are counted per four travelers', () => {
  const dinner = createMealSlots(days, allocateBudget(request))[1];
  const result = evaluate(restaurant, dinner, { ...request, transport: 'drive', travelers: 5 }, [leg(10, 20)], null);
  assert.equal(result.extraMinutes, 10); assert.equal(result.extraFare, 40);
});
test('evening entertainment moves dinner early enough to finish before the activity', () => {
  const anchoredDays = [{ ...days[0], stops: [...days[0].stops, { ...stop, id: 'fun', name: '酒馆', kind: 'entertainment', time: '19:00' }] }];
  const dinner = createMealSlots(anchoredDays, allocateBudget(request))[1];
  assert.equal(dinner.earliest, 1020);
  assert.equal(dinner.latest, 1080);
  assert.equal(dinner.next.id, 'fun');
});
test('swap recalculates totals without mutating snapshot; lock and unavailable target reject', () => {
  const cheaper = changeMeal(food, slot.id, 'cheaper');
  assert.equal(cheaper.meals[0].selectedId, 'r2'); assert.equal(cheaper.summary.selectedHigh, 80);
  assert.equal(food.meals[0].selectedId, 'r1');
  const closer = changeMeal(cheaper, slot.id, 'closer');
  assert.equal(closer.meals[0].selectedId, 'r3');
  const locked = changeMeal(closer, slot.id, 'lock');
  assert.throws(() => changeMeal(locked, slot.id, 'cheaper'), /解锁/);
  assert.throws(() => changeMeal(food, slot.id, 'select', 'forged-id'), /没有符合/);
  assert.throws(() => changeMeal(food, 'missing', 'lock'), /不存在/);
});
test('draft meals keep restaurant choices out of the route until final confirmation', () => {
  const draft = asDraftFood(food);
  assert.equal(draft.meals[0].selectedId, null);
  assert.equal(draft.meals[0].draftSelectedId, 'r1');
  const cheaper = changeDraftMeal(draft, slot.id, 'cheaper');
  assert.equal(cheaper.meals[0].selectedId, null);
  assert.equal(cheaper.meals[0].draftSelectedId, 'r2');
  const skipped = changeDraftMeal(cheaper, slot.id, 'skip');
  assert.equal(skipped.meals[0].draftSelectedId, null);
});
test('a draft restaurant can move to its least-detour alternative meal', () => {
  const secondSlot = { ...slot, id: 'dinner-2', label: '晚餐', date: '2026-09-11' };
  const shared = { ...option, extraMinutes: 3 };
  const draft = asDraftFood({ ...food, meals: [food.meals[0], { ...food.meals[0], slot: secondSlot, options: [shared], selectedId: null }] });
  const moved = changeDraftMeal(draft, slot.id, 'move');
  assert.equal(moved.meals[0].draftSelectedId, null);
  assert.equal(moved.meals[1].draftSelectedId, 'r1');
});
test('server store enforces revision, immutable snapshots, expiry and bounded capacity', () => {
  let time = 0; const store = new PlanStore({ clock: () => time, ttl: 100, limit: 1 });
  const plan = store.save({ food, days });
  plan.food.meals[0].options[1].totalHigh = 0;
  const next = store.change({ planId: plan.planId, revision: 0, mealId: slot.id, action: 'cheaper' });
  assert.equal(next.food.summary.selectedHigh, 80);
  assert.deepEqual(next.days, days);
  assert.throws(() => store.change({ planId: plan.planId, revision: 0 }), /版本/);
  time = 101; assert.throws(() => store.change({ planId: plan.planId, revision: 1 }), /过期/);
  store.save({ food }); store.save({ food }); assert.equal(store.plans.size, 1);
});
test('schema rejects impossible dates, oversized notes, forged links and missing limits', async () => {
  assert.equal(requestSchema.safeParse({ ...request, startDate: '2026-02-30' }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, noteText: 'x'.repeat(12001) }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, maxDetour: -1 }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, noteUrl: 'https://evil.com/a' }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, travelers: 0 }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, destinations: ['杭州', '北京'], days: 1 }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, destinations: ['不存在市'] }).success, false);
  const validHotel = { city: '杭州', name: '测试酒店', addressHint: '', checkIn: '2026-09-10', checkOut: '2026-09-11' };
  assert.equal(requestSchema.safeParse({ ...request, bookedHotels: [validHotel] }).success, true);
  assert.equal(requestSchema.safeParse({ ...request, bookedHotels: [{ ...validHotel, city: '北京' }] }).success, false);
  assert.equal(requestSchema.safeParse({ ...request, days: 2, bookedHotels: [validHotel, { ...validHotel, name: '重叠酒店', checkOut: '2026-09-12' }] }).success, false);
  assert.equal(dayReplanSchema.safeParse({ planId: '123e4567-e89b-12d3-a456-426614174000', revision: 0, dayIndex: 0, entertainmentSelections: [{ id: 'venue-1', period: 'morning' }, { id: 'venue-1', period: 'evening' }] }).success, false);
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(100) }), 10), /过长/);
});

test('affordable full-meal candidates beyond the first eight POIs make the route shortlist', () => {
  const expensive = Array.from({ length: 8 }, (_, i) => ({ ...restaurant, id: `expensive-${i}`, price: { low: 1000, high: 1200 } }));
  const affordable = { ...restaurant, id: 'affordable' };
  const ranked = shortlistRestaurants([...expensive, affordable], slot, request);
  assert.equal(ranked[0].id, 'affordable');
  const unused = { ...affordable, id: 'unused' };
  assert.equal(shortlistRestaurants([affordable, unused], slot, request, new Set(['affordable']))[0].id, 'unused');
});

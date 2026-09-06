import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateBudget, createMealSlots, evaluateRestaurant, isOpenDuring, changeMeal, summarizeFood } from '../lib/food.mjs';
import { requestSchema, readJson } from '../lib/requests.mjs';
import { PlanStore } from '../lib/plan-store.mjs';

const request = requestSchema.parse({ destination: '杭州', startDate: '2026-09-10', days: 1, budget: 4000, travelers: 2, transport: 'walk' });
const stop = { id: 's1', name: '景点甲', time: '09:00', durationMinutes: 90, verified: true, lng: 120.1, lat: 30.2 };
const days = [{ date: request.startDate, stops: [stop, { ...stop, id: 's2', name: '景点乙', time: '14:30' }] }];
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
test('uses directed route insertion delta and multiplies food cost by travelers', () => {
  assert.equal(option.extraMinutes, 10); assert.equal(option.totalHigh, 120); assert.equal(option.eligible, true);
  assert.equal(evaluate(restaurant, slot, request, [leg(3), leg(3)], leg(10)).extraMinutes, 0);
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
  await assert.rejects(readJson(new Request('http://localhost', { method: 'POST', body: 'x'.repeat(100) }), 10), /过长/);
});

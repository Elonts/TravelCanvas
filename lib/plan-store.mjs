import { randomUUID } from 'node:crypto';
import { changeDraftMeal, changeMeal } from './food.mjs';
import { createRoutePoints } from './route-points.mjs';

export class PlanStore {
  constructor({ ttl = 30 * 60 * 1000, limit = 30, clock = Date.now } = {}) {
    this.ttl = ttl; this.limit = limit; this.clock = clock; this.plans = new Map();
  }
  save(plan) {
    for (const [id, entry] of this.plans) if (entry.expires <= this.clock()) this.plans.delete(id);
    while (this.plans.size >= this.limit) this.plans.delete(this.plans.keys().next().value);
    const saved = { ...structuredClone(plan), planId: randomUUID(), revision: 0 };
    this.plans.set(saved.planId, { value: saved, expires: this.clock() + this.ttl });
    return structuredClone(saved);
  }
  change({ planId, revision, mealId, action, restaurantId }) {
    const entry = this.plans.get(planId);
    if (!entry || entry.expires <= this.clock()) { this.plans.delete(planId); throw Error('方案已过期，请重新生成'); }
    if (revision !== entry.value.revision) throw Error('方案版本已变更，请重新生成后再调整');
    entry.value = changeStoredPlan(entry.value, { mealId, action, restaurantId });
    return structuredClone(entry.value);
  }
  get(planId, revision) {
    const entry = this.plans.get(planId);
    if (!entry || entry.expires <= this.clock()) { this.plans.delete(planId); throw Error('方案已过期，请重新生成'); }
    if (revision !== entry.value.revision) throw Error('方案版本已变更，请刷新后再调整');
    return structuredClone(entry.value);
  }
  replace(planId, revision, plan) {
    const entry = this.plans.get(planId);
    if (!entry || entry.expires <= this.clock()) { this.plans.delete(planId); throw Error('方案已过期，请重新生成'); }
    if (revision !== entry.value.revision) throw Error('方案版本已变更，请刷新后再调整');
    entry.value = { ...structuredClone(plan), planId, revision: revision + 1 };
    entry.expires = this.clock() + this.ttl;
    return structuredClone(entry.value);
  }
}

export function changeStoredPlan(plan, { mealId, action, restaurantId }) {
  const food = plan.phase === 'food_selection' ? changeDraftMeal(plan.food, mealId, action, restaurantId) : changeMeal(plan.food, mealId, action, restaurantId);
  let route = null;
  if (plan.route && plan.phase !== 'food_selection') {
    const points = createRoutePoints(plan.route.points.find(point => point.kind === 'origin') || null, plan.request, plan.days, food);
    const replacements = new Map();
    for (const meal of food.meals) {
      const option = meal.options.find(item => item.restaurant.id === meal.selectedId);
      if (!option) continue;
      const nextMealId = `meal:${meal.slot.id}`;
      replacements.set(`stop:${meal.slot.date}:${meal.slot.previous.id}->${nextMealId}`, option.route[0]);
      if (meal.slot.next && option.route[1]) replacements.set(`${nextMealId}->stop:${meal.slot.date}:${meal.slot.next.id}`, option.route[1]);
    }
    const paths = plan.route.paths.map(path => {
      const replacement = replacements.get(`${path.fromId}->${path.toId}`);
      return replacement ? { ...replacement, fromId: path.fromId, toId: path.toId, date: path.date, transport: path.transport } : path;
    });
    route = { ...plan.route, points, paths, queriedAt: new Date().toISOString() };
  }
  return { ...plan, food, ...(route ? { route } : {}), revision: plan.revision + 1 };
}

// Route bundles share the process singleton. No keys or provider responses are retained.
const symbol = Symbol.for('travelcanvas.plan-store');
export const planStore = globalThis[symbol] ||= new PlanStore();

import { randomUUID } from 'node:crypto';
import { changeMeal } from './food.mjs';

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
    // Synchronous update is atomic within this single-process MVP.
    const food = changeMeal(entry.value.food, mealId, action, restaurantId);
    entry.value = { ...entry.value, food, revision: revision + 1 };
    return structuredClone(entry.value);
  }
}

// Route bundles share the process singleton. No keys or provider responses are retained.
const symbol = Symbol.for('travelcanvas.plan-store');
export const planStore = globalThis[symbol] ||= new PlanStore();

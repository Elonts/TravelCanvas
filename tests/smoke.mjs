import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { fixtureRequest } from './helpers/food-fixture.mjs';

for (const mode of ['fixtures', 'offline']) {
  const server = await startServer(mode);
  const post = async (path, body) => {
    const response = await fetch(server.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() };
  };
  try {
    assert.equal((await post('/api/plan', { ...fixtureRequest, startDate: '2026-02-30' })).status, 400);
    const generated = await post('/api/plan', fixtureRequest);
    assert.equal(generated.status, 200, JSON.stringify(generated.value));
    let plan = generated.value;
    assert.equal(plan.food.meals.length, 2); assert.ok(plan.planId);
    assert.ok(!JSON.stringify(plan).includes('test-only-'));
    assert.equal((await post('/api/food', { planId: 'forged' })).status, 400);
    if (mode === 'offline') {
      assert.equal(plan.food.summary.unresolved, 2); assert.equal(plan.food.sources.length, 0);
      assert.ok(plan.food.warnings.some(w => w.includes('未配置')));
    } else {
      assert.equal(plan.food.summary.unresolved, 0);
      const originalStops = structuredClone(plan.days);
      const mealId = plan.food.meals[0].slot.id;
      const previousCost = plan.food.summary.selectedHigh;
      const action = async (name, restaurantId) => post('/api/food', { planId: plan.planId, revision: plan.revision, mealId, action: name, restaurantId });
      const cheaper = await action('cheaper'); assert.equal(cheaper.status, 200, JSON.stringify(cheaper.value)); plan = cheaper.value;
      assert.ok(plan.food.summary.selectedHigh < previousCost); assert.deepEqual(plan.days, originalStops);
      const locked = await action('lock'); assert.equal(locked.status, 200); plan = locked.value;
      assert.equal((await action('closer')).status, 409);
      const unlocked = await action('lock'); assert.equal(unlocked.status, 200); plan = unlocked.value;
      const closer = await action('closer'); assert.equal(closer.status, 200); plan = closer.value;
      assert.equal((await action('select', 'forged-id')).status, 409);
      const stale = await post('/api/food', { planId: plan.planId, revision: 0, mealId, action: 'lock' }); assert.equal(stale.status, 409);
      assert.equal(plan.food.tips.length, 2);
    }
    console.log(`PASS production HTTP smoke: ${mode}`);
  } finally { server.stop(); }
}

import assert from 'node:assert/strict';
import { startServer } from './helpers/server.mjs';
import { fixtureRequest } from './helpers/food-fixture.mjs';

for (const mode of ['fixtures', 'offline']) {
  const server = await startServer(mode);
  const post = async (path, body) => {
    const response = await fetch(server.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, value: await response.json() };
  };
  const discover = request => post('/api/discover', request);
  const generate = async request => {
    const found = await discover(request);
    assert.equal(found.status, 200, JSON.stringify(found.value));
    if (!found.value.candidates.length) return { found, generated: null };
    const generated = await post('/api/plan', { discoveryId: found.value.discoveryId, selectedIds: found.value.candidates.map(candidate => candidate.id) });
    return { found, generated };
  };
  try {
    assert.equal((await discover({ ...fixtureRequest, startDate: '2026-02-30' })).status, 400);
    const initial = await generate(fixtureRequest);
    assert.ok(!JSON.stringify(initial).includes('test-only-'));
    assert.equal((await post('/api/plan', { discoveryId: initial.found.value.discoveryId, selectedIds: ['forged'] })).status, 409);
    assert.equal((await post('/api/food', { planId: 'forged' })).status, 400);
    if (mode === 'offline') {
      assert.equal(initial.found.value.candidates.length, 0);
      assert.equal(initial.found.value.sources.map, 'pending');
      assert.ok(initial.found.value.warnings.some(warning => warning.includes('未配置')));
      console.log('PASS production HTTP smoke: offline discovery degrades transparently');
      continue;
    }

    assert.ok(initial.found.value.candidates.some(candidate => candidate.kind === 'attraction'));
    assert.ok(initial.found.value.candidates.some(candidate => candidate.kind === 'food' && candidate.evidence.length));
    assert.ok(initial.found.value.candidates.every(candidate => candidate.kind !== 'entertainment'));
    assert.ok(initial.found.value.candidates.every(candidate => candidate.navigationUrl.startsWith('https://uri.amap.com/navigation')));
    assert.ok(initial.found.value.candidates.some(candidate => candidate.imageUrl?.startsWith('/api/poi-image?url=')));
    const customAttraction = await post('/api/discover/custom', { discoveryId: initial.found.value.discoveryId, city: '杭州', kind: 'attraction', names: ['雷峰塔'] });
    assert.equal(customAttraction.status, 200, JSON.stringify(customAttraction.value));
    assert.ok(customAttraction.value.candidates.some(candidate => candidate.name === '雷峰塔' && candidate.kind === 'attraction'));
    const customFood = await post('/api/discover/custom', { discoveryId: initial.found.value.discoveryId, city: '杭州', kind: 'food', names: ['测试江南餐厅（西湖店）'] });
    assert.equal(customFood.status, 200, JSON.stringify(customFood.value));
    assert.ok(customFood.value.candidates.some(candidate => candidate.name === '测试江南餐厅（西湖店）' && candidate.kind === 'food'));
    assert.equal(initial.generated.status, 200, JSON.stringify(initial.generated.value));
    let plan = initial.generated.value;
    assert.equal(plan.food.meals.length, 2); assert.ok(plan.planId);
    assert.ok(plan.days.flatMap(day => day.stops).every(stop => stop.navigationUrl));
    assert.equal(plan.food.summary.unresolved, 0);
    assert.equal(plan.dayGuides.length, plan.days.length);
    assert.equal(plan.entertainmentDays.length, plan.days.length);
    assert.equal(plan.entertainmentDays[0].options.length, 0);
    assert.equal(plan.days[0].stops.some(stop => stop.kind === 'entertainment'), false);
    assert.ok(plan.days[0].stops.filter(stop => stop.kind !== 'entertainment').every(stop => stop.reservation?.status === 'unknown'));
    assert.ok(plan.route.paths.length > 0);
    assert.ok(plan.route.paths.every(path => path.state === 'live'));
    const originalStops = structuredClone(plan.days);
    const mealId = plan.food.meals[0].slot.id;
    if (plan.food.meals[0].locked) {
      const unlock = await post('/api/food', { planId: plan.planId, revision: plan.revision, mealId, action: 'lock' });
      assert.equal(unlock.status, 200); plan = unlock.value;
    }
    const previousCost = plan.food.summary.selectedHigh;
    const action = async (name, restaurantId) => post('/api/food', { planId: plan.planId, revision: plan.revision, mealId, action: name, restaurantId });
    const cheaper = await action('cheaper'); assert.equal(cheaper.status, 200, JSON.stringify(cheaper.value)); plan = cheaper.value;
    assert.ok(plan.food.summary.selectedHigh <= previousCost); assert.deepEqual(plan.days, originalStops);
    const locked = await action('lock'); assert.equal(locked.status, 200); plan = locked.value;
    assert.equal((await action('closer')).status, 409);
    const unlocked = await action('lock'); assert.equal(unlocked.status, 200); plan = unlocked.value;
    assert.equal((await action('select', 'forged-id')).status, 409);
    assert.equal((await post('/api/food', { planId: plan.planId, revision: 0, mealId, action: 'lock' })).status, 409);

    const searchedEntertainment = await post('/api/plan/entertainment', { planId: plan.planId, revision: plan.revision, dayIndex: 0, preference: '足浴', query: '' });
    assert.equal(searchedEntertainment.status, 200, JSON.stringify(searchedEntertainment.value));
    plan = searchedEntertainment.value;
    assert.ok(plan.entertainmentDays[0].options.length > 0);
    assert.ok(plan.entertainmentDays[0].options.every(option => option.preference === '足浴'));
    const entertainmentId = plan.entertainmentDays[0].options[0].id;
    const addedEntertainment = await post('/api/plan/day', { planId: plan.planId, revision: plan.revision, dayIndex: 0, replacements: [], removedStopIds: [], entertainmentIds: [entertainmentId] });
    assert.equal(addedEntertainment.status, 200, JSON.stringify(addedEntertainment.value));
    plan = addedEntertainment.value;
    assert.ok(plan.days[0].stops.some(stop => stop.kind === 'entertainment'));
    assert.deepEqual(plan.entertainmentDays[0].selectedIds, [entertainmentId]);

    const replacementStop = plan.days[0].stops.find(stop => stop.kind !== 'entertainment');
    const changedDay = await post('/api/plan/day', { planId: plan.planId, revision: plan.revision, dayIndex: 0, replacements: [{ stopId: replacementStop.id, name: '雷峰塔' }], removedStopIds: [], entertainmentIds: [] });
    assert.equal(changedDay.status, 200, JSON.stringify(changedDay.value));
    plan = changedDay.value;
    assert.ok(plan.days[0].stops.some(stop => stop.name === '雷峰塔'));
    assert.equal(plan.days[0].stops.some(stop => stop.kind === 'entertainment'), false);
    assert.deepEqual(plan.entertainmentDays[0].selectedIds, []);

    const multi = await generate({ ...fixtureRequest, days: 3 });
    assert.equal(multi.generated.status, 200, JSON.stringify(multi.generated.value));
    const stops = multi.generated.value.days.flatMap(day => day.stops);
    assert.equal(new Set(stops.map(stop => stop.name)).size, stops.length);
    const attractionStops = stops.filter(stop => stop.kind !== 'entertainment');
    assert.equal(attractionStops.length, 9);
    assert.ok(multi.generated.value.days.every(day => day.stops.filter(stop => stop.kind !== 'entertainment').length === 3));
    assert.equal(multi.generated.value.food.meals.length, 6);

    const failedModel = await generate({ ...fixtureRequest, days: 3, preferences: '模拟AI失败' });
    assert.equal(failedModel.generated.status, 200);
    assert.equal(failedModel.found.value.sources.ai, 'demo');

    const cities = await generate({ ...fixtureRequest, destinations: ['北京', '杭州'], days: 2 });
    assert.equal(cities.generated.status, 200, JSON.stringify(cities.generated.value));
    assert.equal(cities.generated.value.route.cityOrder.length, 2);
    assert.deepEqual(cities.generated.value.days.map(day => day.city), cities.generated.value.route.cityOrder);
    assert.deepEqual(cities.generated.value.route.points.map(point => point.order), cities.generated.value.route.points.map((_, index) => index + 1));
    assert.deepEqual(cities.generated.value.route.cityOrder, ['杭州', '北京']);
    assert.equal(cities.generated.value.route.transfers.length, 2);
    assert.equal(cities.generated.value.route.state, 'live');
    console.log('PASS production HTTP smoke: fixtures discovery, selection and route generation');
  } finally { server.stop(); }
}

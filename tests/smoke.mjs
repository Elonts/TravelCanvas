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
    const base = await discover(request);
    assert.equal(base.status, 200, JSON.stringify(base.value));
    const found = await post('/api/discover/guides', { discoveryId: base.value.discoveryId });
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
    assert.equal(initial.found.value.guideSources.length, 8);
    assert.ok(initial.found.value.guideSources.every((source, index) => source.rank === index + 1 && source.contentState === 'summary' && !('content' in source)));
    assert.equal(initial.found.value.sources.guides, 'live');
    assert.ok(['live', 'partial'].includes(initial.found.value.guideSearch.state));
    assert.ok(initial.found.value.candidates.some(candidate => candidate.kind === 'attraction' && candidate.guideEvidence.length && candidate.guideScore > 0));
    const guideRankedAttractions = initial.found.value.candidates.filter(candidate => candidate.kind === 'attraction');
    assert.equal(guideRankedAttractions[0].name, '西湖风景名胜区');
    assert.ok(guideRankedAttractions[0].guideScore > guideRankedAttractions[1].guideScore);
    assert.ok(initial.found.value.candidates.every(candidate => candidate.kind === 'attraction'));
    assert.ok(initial.found.value.candidates.every(candidate => candidate.kind !== 'entertainment'));
    assert.ok(initial.found.value.candidates.every(candidate => candidate.navigationUrl.startsWith('https://uri.amap.com/navigation')));
    assert.ok(initial.found.value.candidates.some(candidate => candidate.imageUrl?.startsWith('/api/poi-image?url=')));
    const senior = await discover({ ...fixtureRequest, preferences: '适合老年人活动', constraints: '少走路，不爬山' });
    assert.equal(senior.status, 200, JSON.stringify(senior.value));
    const seniorAttractions = senior.value.candidates.filter(candidate => candidate.kind === 'attraction');
    assert.ok(seniorAttractions.some(candidate => /博物馆|公园|文化馆/.test(candidate.name)));
    assert.ok(seniorAttractions.every(candidate => !/攀岩|漂流|蹦极|高空/.test(candidate.name)));
    assert.ok(seniorAttractions.some(candidate => candidate.constraintWarning?.includes('步行距离')));
    const customAttraction = await post('/api/discover/custom', { discoveryId: initial.found.value.discoveryId, city: '杭州', kind: 'attraction', names: ['雷峰塔'] });
    assert.equal(customAttraction.status, 200, JSON.stringify(customAttraction.value));
    assert.ok(customAttraction.value.candidates.some(candidate => candidate.name === '雷峰塔' && candidate.kind === 'attraction'));
    assert.equal(initial.generated.status, 200, JSON.stringify(initial.generated.value));
    let plan = initial.generated.value;
    assert.equal(plan.phase, 'food_selection');
    assert.equal(plan.guides.length, 8);
    assert.equal(plan.food.meals.length, 2); assert.ok(plan.planId);
    assert.ok(plan.food.sources.length > 0, 'food evidence is searched only after the attraction route exists');
    assert.ok(plan.days.flatMap(day => day.stops).every(stop => stop.navigationUrl));
    assert.equal(plan.food.summary.unresolved, 0);
    assert.equal(plan.dayGuides.length, plan.days.length);
    assert.equal(plan.dayGuides[0].weather.provider, '高德天气');
    assert.ok(plan.dayGuides[0].weather.queriedAt);
    assert.equal(plan.entertainmentDays.length, plan.days.length);
    assert.equal(plan.entertainmentDays[0].options.length, 0);
    assert.equal(plan.days[0].stops.some(stop => stop.kind === 'entertainment'), false);
    assert.ok(plan.days[0].stops.filter(stop => stop.kind !== 'entertainment').every(stop => stop.reservation?.status === 'unknown'));
    assert.ok(plan.route.paths.length > 0);
    assert.ok(plan.route.paths.every(path => path.state === 'live'));
    assert.equal(plan.route.points.some(point => point.kind === 'restaurant'), false);
    assert.ok(plan.food.meals.every(meal => meal.selectedId === null && meal.draftSelectedId));
    const originalStops = structuredClone(plan.days);
    let mealId = plan.food.meals[0].slot.id;
    const customFood = await post('/api/plan/restaurants', { planId: plan.planId, revision: plan.revision, names: ['测试江南餐厅（西湖店）'] });
    assert.equal(customFood.status, 200, JSON.stringify(customFood.value));
    plan = customFood.value;
    assert.ok(plan.food.meals.find(meal => meal.slot.id === mealId).options.some(option => option.restaurant.name === '测试江南餐厅（西湖店）'));
    assert.ok(plan.food.manualRestaurants.some(item => item.input === '测试江南餐厅（西湖店）' && item.mealId));
    assert.equal(plan.route.points.some(point => point.kind === 'restaurant'), false);
    const ambiguousFood = await post('/api/plan/restaurants', { planId: plan.planId, revision: plan.revision, names: ['测试'] });
    assert.equal(ambiguousFood.status, 200, JSON.stringify(ambiguousFood.value)); plan = ambiguousFood.value;
    assert.equal(plan.food.manualRestaurants.find(item => item.input === '测试').status, 'needs_branch');
    const blockedFinalize = await post('/api/plan/finalize-food', { planId: plan.planId, revision: plan.revision, selections: plan.food.meals.map(meal => ({ mealId: meal.slot.id, restaurantId: meal.draftSelectedId, acceptWarnings: true })) });
    assert.equal(blockedFinalize.status, 422); assert.match(blockedFinalize.value.error, /指定餐厅.*尚未安排/);
    const finalized = await post('/api/plan/finalize-food', { planId: plan.planId, revision: plan.revision, selections: plan.food.meals.map(meal => ({ mealId: meal.slot.id, restaurantId: meal.draftSelectedId, acceptWarnings: true })), skippedManualInputs: ['测试'] });
    assert.equal(finalized.status, 200, JSON.stringify(finalized.value));
    plan = finalized.value;
    assert.equal(plan.phase, 'final');
    assert.ok(plan.route.points.some(point => point.kind === 'restaurant'));
    assert.equal(plan.food.manualRestaurants.find(item => item.input === '测试').status, 'explicitly_skipped');
    mealId = plan.food.meals.find(meal => meal.selectedId).slot.id;
    if (plan.food.meals.find(meal => meal.slot.id === mealId).locked) {
      const unlockedDraft = await post('/api/food', { planId: plan.planId, revision: plan.revision, mealId, action: 'lock' });
      assert.equal(unlockedDraft.status, 200, JSON.stringify(unlockedDraft.value)); plan = unlockedDraft.value;
    }
    const action = async (name, restaurantId) => post('/api/food', { planId: plan.planId, revision: plan.revision, mealId, action: name, restaurantId });
    const locked = await action('lock'); assert.equal(locked.status, 200); plan = locked.value;
    assert.deepEqual(plan.days, originalStops);
    assert.equal((await action('closer')).status, 409);
    const unlocked = await action('lock'); assert.equal(unlocked.status, 200); plan = unlocked.value;
    assert.equal((await action('select', 'forged-id')).status, 409);
    assert.equal((await post('/api/food', { planId: plan.planId, revision: 0, mealId, action: 'lock' })).status, 409);

    const customEntertainment = await post('/api/plan/entertainment', { planId: plan.planId, revision: plan.revision, dayIndex: 0, preference: '其他', query: '密室逃脱' });
    assert.equal(customEntertainment.status, 200, JSON.stringify(customEntertainment.value));
    plan = customEntertainment.value;
    assert.ok(plan.entertainmentDays[0].options.some(option => option.preference === '其他：密室逃脱'));
    const searchedEntertainment = await post('/api/plan/entertainment', { planId: plan.planId, revision: plan.revision, dayIndex: 0, preference: '足浴', query: '', selectedIds: [] });
    assert.equal(searchedEntertainment.status, 200, JSON.stringify(searchedEntertainment.value));
    plan = searchedEntertainment.value;
    const footMassageOptions = plan.entertainmentDays[0].options.filter(option => option.preference === '足浴');
    assert.ok(footMassageOptions.length > 6);
    assert.ok(footMassageOptions.length <= 12);
    assert.ok(footMassageOptions.every(option => option.routeMeters !== null && option.routeMeters <= 15000));
    const entertainmentId = footMassageOptions[0].id;
    const addedEntertainment = await post('/api/plan/day', { planId: plan.planId, revision: plan.revision, dayIndex: 0, replacements: [], removedStopIds: [], entertainmentSelections: [{ id: entertainmentId, period: 'afternoon' }] });
    assert.equal(addedEntertainment.status, 200, JSON.stringify(addedEntertainment.value));
    plan = addedEntertainment.value;
    assert.ok(plan.days[0].stops.some(stop => stop.kind === 'entertainment'));
    assert.deepEqual(plan.entertainmentDays[0].selections, [{ id: entertainmentId, period: 'afternoon' }]);
    assert.equal(plan.days[0].stops.find(stop => stop.id === entertainmentId).time, '13:30');

    const replacementStop = plan.days[0].stops.find(stop => stop.kind !== 'entertainment');
    const changedDay = await post('/api/plan/day', { planId: plan.planId, revision: plan.revision, dayIndex: 0, replacements: [{ stopId: replacementStop.id, name: '雷峰塔' }], removedStopIds: [], entertainmentSelections: [] });
    assert.equal(changedDay.status, 200, JSON.stringify(changedDay.value));
    plan = changedDay.value;
    assert.ok(plan.days[0].stops.some(stop => stop.name === '雷峰塔'));
    assert.equal(plan.days[0].stops.some(stop => stop.kind === 'entertainment'), false);
    assert.deepEqual(plan.entertainmentDays[0].selections, []);

    const withHotel = await generate({ ...fixtureRequest, bookedHotels: [{ city: '杭州', name: '测试酒店', addressHint: '', checkIn: '2026-09-10', checkOut: '2026-09-11' }] });
    assert.equal(withHotel.generated.status, 200, JSON.stringify(withHotel.generated.value));
    assert.equal(withHotel.generated.value.days[0].endHotel.name, '测试酒店');
    assert.ok(withHotel.generated.value.route.points.some(point => point.kind === 'hotel'));
    assert.equal(withHotel.generated.value.dayGuides[0].hotels[0].booked, true);

    const arrivalPlan = await generate({ ...fixtureRequest, days: 2, bookedHotels: [{ city: '杭州', name: '测试酒店', addressHint: '', checkIn: '2026-09-10', checkOut: '2026-09-12' }], intercityLegs: [{ fromCity: '上海', toCity: '杭州', mode: 'high_speed_rail', departureHub: { poiId: 'station-shanghai', name: '上海虹桥站', address: '测试车站地址', lng: 121.32, lat: 31.19 }, arrivalHub: { poiId: 'station-hangzhou', name: '杭州东站', address: '测试车站地址', lng: 120.21, lat: 30.29 }, departureAt: '2026-09-10T04:00:00.000Z', arrivalAt: '2026-09-10T07:20:00.000Z', tripNo: 'G1' }] });
    assert.equal(arrivalPlan.generated.status, 200, JSON.stringify(arrivalPlan.generated.value));
    assert.equal(arrivalPlan.generated.value.days[0].availableFrom, '16:15');
    assert.equal(arrivalPlan.generated.value.days[0].route, undefined);
    assert.deepEqual(arrivalPlan.generated.value.route.points.filter(point => point.date === '2026-09-10').slice(1, 3).map(point => point.kind), ['station', 'hotel']);
    assert.ok(arrivalPlan.generated.value.days[0].stops.every(stop => stop.time >= '16:15'));
    assert.ok(arrivalPlan.generated.value.days[0].scheduleIssues.some(issue => issue.includes('15 分钟')));

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
    assert.equal(cities.generated.value.route.transfers.length, 0);
    assert.equal(cities.generated.value.route.state, 'live');
    console.log('PASS production HTTP smoke: fixtures discovery, selection and route generation');
  } finally { server.stop(); }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { attachEvidence, buildFoodPlan, createMapProvider, extractTips, isMealRestaurant, normalizeRestaurant, parseTransitSteps, safeSourceUrl, searchNotes, validateExtraction } from '../lib/food-providers.mjs';
import { allocateBudget } from '../lib/food.mjs';
import { fixtureRequest as request, fixtureDays as days, fixtureFetch, testEnv, poi, fixtureContent } from './helpers/food-fixture.mjs';

test('only valid HTTPS note URLs are accepted, including genuine share links', () => {
  for (const url of ['javascript:alert(1)', 'http://www.xiaohongshu.com/explore/abc', 'https://www.xiaohongshu.com.evil.test/explore/abc', 'https://evil@www.xiaohongshu.com/explore/abc', 'https://www.xiaohongshu.com/user/profile/abc', 'https://127.0.0.1/']) assert.equal(safeSourceUrl(url), null);
  assert.ok(safeSourceUrl('https://www.xiaohongshu.com/explore/abc123'));
  assert.ok(safeSourceUrl('https://xhslink.com/a/test'));
});
test('automatic search restricts domain, validates result URLs and deduplicates', async () => {
  let calls = 0;
  const result = await searchNotes(request, days[0].stops, testEnv, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.tavily.com/search');
    const body = JSON.parse(options.body); assert.deepEqual(body.include_domains, ['xiaohongshu.com']); assert.ok(body.query.includes('杭州'));
    assert.equal(body.search_depth, 'advanced'); assert.equal(body.chunks_per_source, 3);
    assert.ok(options.signal); assert.equal(options.redirect, 'manual');
    return new Response(JSON.stringify({ results: [{ title: '杭州美食A', url: 'https://www.xiaohongshu.com/explore/abc123?token=one', content: '杭州正文' }, { title: '杭州美食A', url: 'https://www.xiaohongshu.com/explore/abc123?token=two', content: '杭州正文' }, { title: '伪造', url: 'https://evil.test', content: '杭州正文' }] }));
  });
  assert.equal(calls, 3);
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].publishedAt, null);
});
test('verified restaurant names use one focused advanced follow-up query', async () => {
  let calls = 0;
  await searchNotes({ ...request, verifiedFoodNames: ['测试江南餐厅（西湖店）', '测试面馆（西湖店）'] }, [], testEnv, async (_url, options) => {
    calls++; const body = JSON.parse(options.body); assert.ok(body.query.includes('测试江南餐厅（西湖店）')); assert.equal(body.search_depth, 'advanced');
    return new Response('{"results":[]}');
  });
  assert.equal(calls, 1);
});
test('no keys, failed search, empty results and user text degrade without invented notes', async () => {
  const noKeys = await searchNotes({ ...request, noteText: '用户正文' }, [], {}, () => assert.fail('must not fetch'));
  assert.equal(noKeys.sources.length, 1); assert.equal(noKeys.sources[0].kind, 'pasted'); assert.equal(noKeys.state, 'pending');
  const failed = await searchNotes(request, [], testEnv, async () => { throw Error('private provider error'); });
  assert.equal(failed.sources.length, 0); assert.equal(failed.state, 'pending'); assert.ok(!failed.warnings.join().includes('private'));
  const empty = await searchNotes(request, [], testEnv, async () => new Response('{"results":[]}'));
  assert.match(empty.warnings.join(), /没有检索/);
});
test('model evidence must be an exact quote from the declared source including the place', () => {
  const sources = [{ id: 'a', content: fixtureContent }];
  const valid = { sourceId: 'a', placeName: '测试江南餐厅（西湖店）', quote: '测试江南餐厅（西湖店）在美食推荐榜中被提到', category: 'ranking' };
  const result = validateExtraction({ tips: [valid, { ...valid, quote: '这家餐厅保证没有过敏原' }, { ...valid, sourceId: 'forged' }, { ...valid, placeName: '别的店' }, valid] }, sources);
  assert.equal(result.length, 1); assert.equal(result[0].state, 'pending');
  assert.deepEqual(validateExtraction({ tips: [{ unexpected: true }] }, sources), []);
});
test('brands and other branches cannot inherit source endorsement', () => {
  const restaurant = normalizeRestaurant(poi(0));
  const attached = attachEvidence([restaurant], [{ placeName: '测试江南餐厅', sourceId: 'a' }, { placeName: '测试江南餐厅（别处店）', sourceId: 'b' }, { placeName: '测试江南餐厅(西湖店)', sourceId: 'c' }]);
  assert.deepEqual(attached[0].tips.map(t => t.sourceId), ['c']);
});
test('POI parsing rejects malformed location/category, empty prices stay unknown', () => {
  assert.equal(normalizeRestaurant({ ...poi(0), location: 'oops' }), null);
  assert.equal(normalizeRestaurant({ ...poi(0), typecode: '110000' }), null);
  assert.equal(normalizeRestaurant({ ...poi(0), location: '0,0' }), null);
  assert.equal(normalizeRestaurant(poi(4)).price, null);
  assert.deepEqual(normalizeRestaurant(poi(0)).price, { low: 48, high: 72 });
});
test('exact POI detail can fill price and weekly opening hours', async () => {
  const provider = createMapProvider(testEnv, async input => {
    const url = new URL(String(input)); assert.ok(url.pathname.endsWith('/v5/place/detail')); assert.equal(url.searchParams.get('id'), 'shop-1');
    return new Response(JSON.stringify({ status: '1', pois: [{ ...poi(0), id: 'shop-1', business: { cost: '88', opentime_week: '周一至周日 11:00-22:00' } }] }));
  }, { intervalMs: 0 });
  const detail = await provider.restaurantDetail('shop-1');
  assert.deepEqual(detail.price, { low: 70, high: 106 }); assert.equal(detail.hours, '周一至周日 11:00-22:00');
});
test('model failure falls back to literal location-bound excerpts', async () => {
  const tips = await extractTips([{ id: 'pasted-1', content: fixtureContent }], ['西湖风景名胜区'], testEnv, async () => { throw Error('timeout'); });
  assert.equal(tips.length, 1); assert.ok(fixtureContent.includes(tips[0].quote));
});
test('map route caching is directed and failed values do not become zeros', async () => {
  let count = 0;
  const provider = createMapProvider(testEnv, async (...args) => { count++; return fixtureFetch(...args); }, { intervalMs: 0 });
  const [from, to] = days[0].stops;
  await provider.route(from, to, 'walk', '杭州'); await provider.route(from, to, 'walk', '杭州');
  assert.equal(count, 1); await provider.route(to, from, 'walk', '杭州'); assert.equal(count, 2);
  const broken = createMapProvider(testEnv, async () => new Response('{"status":"1","route":{"paths":[{"duration":"","distance":""}]}}'));
  const result = await broken.route(from, to, 'walk', '杭州'); assert.equal(result.state, 'pending'); assert.equal(result.minutes, null);
});

test('route 2.0 returns validated geometry for the real map', async () => {
  const provider = createMapProvider(testEnv, async input => {
    assert.ok(new URL(String(input)).pathname.startsWith('/v5/direction/'));
    return new Response(JSON.stringify({ status: '1', route: { paths: [{ cost: { duration: '600' }, distance: '1200', steps: [{ polyline: '120.1,30.2;120.15,30.25;120.2,30.2' }] }] } }));
  }, { intervalMs: 0 });
  const result = await provider.route(days[0].stops[0], days[0].stops[1], 'walk', '杭州');
  assert.equal(result.state, 'live');
  assert.deepEqual(result.polyline, [[120.1, 30.2], [120.15, 30.25], [120.2, 30.2]]);
});
test('route 2.0 also accepts nested polyline objects returned by transit', async () => {
  const provider = createMapProvider(testEnv, async input => {
    const url = new URL(String(input));
    if (url.pathname.includes('/geocode/')) return new Response(JSON.stringify({ status: '1', geocodes: [{ citycode: '0571' }] }));
    return new Response(JSON.stringify({ status: '1', route: { transits: [{ cost: { duration: '600', transit_fee: '3' }, distance: '1200', segments: [{ walking: { steps: [{ polyline: { polyline: '120.1,30.2;120.15,30.25' } }] }, bus: { buslines: [{ polyline: { polyline: '120.15,30.25;120.2,30.2' } }] } }] }] } }));
  }, { intervalMs: 0 });
  const result = await provider.route(days[0].stops[0], days[0].stops[1], 'transit', '杭州');
  assert.deepEqual(result.polyline, [[120.1, 30.2], [120.15, 30.25], [120.15, 30.25], [120.2, 30.2]]);
});

test('transit parsing preserves line, stops, walking and service window without inventing live departures', () => {
  const steps = parseTransitSteps({ segments: [{ walking: { distance: '420', cost: { duration: '360' }, steps: [{ instruction: '步行至湖滨站' }] }, bus: { buslines: [{ name: '地铁1号线(萧山国际机场-湘湖)', type: '地铁', departure_stop: { name: '龙翔桥' }, arrival_stop: { name: '火车东站' }, via_num: '5', distance: '8200', cost: { duration: '1200' }, start_time: '0600', end_time: '2300' }] } }] });
  assert.deepEqual(steps.map(step => step.kind), ['walk', 'subway']);
  assert.equal(steps[1].lineName, '地铁1号线');
  assert.equal(steps[1].fromStop, '龙翔桥');
  assert.equal(steps[1].toStop, '火车东站');
  assert.equal(steps[1].firstTime, '0600');
  assert.equal('liveDeparture' in steps[1], false);
});

test('a user-selected restaurant with unknown fields is arranged unless it has a hard conflict', async () => {
  const preferred = { ...normalizeRestaurant(poi(4)), city: '杭州', preferred: true };
  const food = await buildFoodPlan(request, days, allocateBudget(request), testEnv, fixtureFetch, { mapIntervalMs: 0, preferredRestaurants: [preferred], discoverySources: [] });
  const chosen = food.meals[0].options.find(option => option.restaurant.id === food.meals[0].selectedId);
  assert.equal(chosen.restaurant.id, preferred.id);
  assert.equal(chosen.eligible, false);
  assert.equal(chosen.canAcceptPending, true);
});
test('integrated generation produces unique feasible branches and evidence with group budget', async () => {
  const food = await buildFoodPlan(request, days, allocateBudget(request), testEnv, fixtureFetch, { mapIntervalMs: 0 });
  assert.equal(food.meals.length, 2); assert.equal(food.summary.unresolved, 0);
  assert.equal(new Set(food.meals.map(m => m.selectedId)).size, 2);
  assert.ok(food.summary.remaining >= 0); assert.ok(food.tips.length >= 2);
  for (const meal of food.meals) {
    const chosen = meal.options.find(o => o.restaurant.id === meal.selectedId);
    assert.equal(chosen.eligible, true); assert.ok(chosen.totalHigh <= meal.slot.foodLimit);
    assert.ok(meal.options.some(o => o.reasons.length));
    assert.ok(meal.options.some(o => o.pending.length));
  }
  assert.ok(food.meals[0].options[0].restaurant.tips.some(t => t.category === 'ranking'));
});
test('integrated no-provider path returns transparent unresolved meals', async () => {
  const food = await buildFoodPlan(request, days, allocateBudget(request), {}, () => assert.fail('must not call network'));
  assert.equal(food.summary.unresolved, 2); assert.equal(food.summary.selectedHigh, 0);
  assert.equal(food.sources.length, 0); assert.ok(food.warnings.length > 0);
});

test('transient map QPS failures retry; invalid credentials do not retry', async () => {
  let calls = 0;
  const map = createMapProvider(testEnv, async (...args) => {
    calls++; return calls === 1 ? new Response('{"status":"0","infocode":"10021"}') : fixtureFetch(...args);
  }, { intervalMs: 0 });
  const result = await map.route(days[0].stops[0], days[0].stops[1], 'walk', '杭州');
  assert.equal(result.state, 'live'); assert.equal(calls, 2);
  calls = 0;
  const invalid = createMapProvider(testEnv, async () => { calls++; return new Response('{"status":"0","infocode":"10001"}'); }, { intervalMs: 0 });
  assert.equal((await invalid.route(days[0].stops[0], days[0].stops[1], 'walk', '杭州')).state, 'pending');
  assert.equal(calls, 1);
});

test('restaurant search covers both ends of a lunch route and reads beyond eight results', async () => {
  const anchors = [];
  const map = createMapProvider(testEnv, async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/around')) {
      anchors.push(parsed.searchParams.get('location'));
      assert.equal(parsed.searchParams.get('page_size'), '20');
    }
    return fixtureFetch(url, options);
  }, { intervalMs: 0 });
  await map.restaurants({ previous: days[0].stops[0], next: days[0].stops[1] }, '杭州', []);
  assert.deepEqual(anchors, ['120.1,30.2', '120.2,30.2']);
});
test('food preferences become explicit AMap text-search keywords', async () => {
  const keywords = [];
  const map = createMapProvider(testEnv, async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/text')) keywords.push(parsed.searchParams.get('keywords'));
    return fixtureFetch(url, options);
  }, { intervalMs: 0 });
  await map.restaurants({ previous: days[0].stops[0], next: days[0].stops[1] }, '杭州', ['川菜', '四川菜', '麻辣']);
  assert.deepEqual(keywords, ['川菜', '四川菜', '麻辣']);
});

test('restaurant pool with expensive first page still produces a specific affordable choice', async () => {
  const fetcher = async (url, options) => {
    if (new URL(url).pathname.endsWith('/around')) {
      const expensive = Array.from({ length: 8 }, (_, i) => ({ ...poi(3), id: `expensive-${i}` }));
      return new Response(JSON.stringify({ status: '1', pois: [...expensive, poi(0), poi(1), poi(2)] }));
    }
    return fixtureFetch(url, options);
  };
  const food = await buildFoodPlan(request, days, allocateBudget(request), { AMAP_API_KEY: testEnv.AMAP_API_KEY }, fetcher, { mapIntervalMs: 0 });
  assert.equal(food.summary.unresolved, 0);
  assert.ok(food.meals.every(meal => meal.options.find(o => o.restaurant.id === meal.selectedId)?.eligible));
});

test('cheap milk tea and coffee shops cannot become lunch or dinner recommendations', () => {
  assert.equal(isMealRestaurant({ name: '茶百道(某分店)', category: '餐饮服务;休闲餐饮场所;休闲餐饮场所' }), false);
  assert.equal(isMealRestaurant({ name: '测试咖啡厅', category: '餐饮服务;咖啡厅' }), false);
  assert.equal(isMealRestaurant({ name: '玉泉里餐厅', category: '餐饮服务;餐饮相关场所;餐饮相关' }), true);
  assert.equal(isMealRestaurant({ name: '翠薇面斋', category: '餐饮服务;中餐厅;中式素菜馆' }), true);
  assert.equal(isMealRestaurant({ name: '不明店铺', category: '餐饮服务;餐饮相关场所' }), false);
});

test('map can supplement an unavailable AI without accepting restaurant POIs as attractions', async () => {
  const provider = createMapProvider(testEnv, async () => new Response(JSON.stringify({ status: '1', pois: [
    { id: 'park', name: '测试公园', address: '杭州', location: '120.1,30.2', typecode: '110101' },
    { id: 'food', name: '测试餐厅', address: '杭州', location: '120.1,30.2', typecode: '050100' },
  ] })), { intervalMs: 0 });
  const stops = await provider.attractions('杭州', 9);
  assert.ok(stops.length > 0);
  assert.ok(stops.every(stop => stop.poiId === 'park' && stop.verified && stop.costPending));
});

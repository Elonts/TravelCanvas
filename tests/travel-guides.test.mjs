import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichGuideBodies, extractGuideFoodInsights, extractGuideInsights, isGuideRelevant, searchTravelGuides, validateGuideFoodInsights, validateGuideInsights } from '../lib/travel-guides.mjs';

const env = { TAVILY_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' };
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('guide search starts with a lower-latency destination query and keeps at most eight unique public notes', async () => {
  let body;
  const result = await searchTravelGuides('杭州', env, async (_url, options) => {
    body = JSON.parse(options.body);
    return response({ results: [
      ...Array.from({ length: 9 }, (_, index) => ({ title: `杭州攻略${index}`, url: `https://www.xiaohongshu.com/explore/abcde${index}`, content: `杭州西湖风景名胜区攻略${index}`, score: index / 10 })),
      { title: '重复', url: 'https://www.xiaohongshu.com/explore/abcde8?token=2', content: '杭州重复文本', score: 1 },
      { title: '非法', url: 'https://example.com/post', content: '非法来源', score: 2 },
    ] });
  });
  assert.match(body.query, /杭州.*旅游攻略.*必去.*避雷/);
  assert.deepEqual(body.include_domains, ['xiaohongshu.com']);
  assert.equal(body.search_depth, 'basic');
  assert.equal(body.max_results, 12);
  assert.equal(result.sources.length, 8);
  assert.equal(result.sources[0].title, '重复');
  assert.deepEqual(result.sources.map(item => item.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('guide search keeps a broad pool so body and verified POIs can establish destination relevance later', async () => {
  assert.equal(isGuideRelevant('杭州', { title: '成都三日游', content: '宽窄巷子和熊猫基地' }), false);
  assert.equal(isGuideRelevant('杭州市', { title: '周末攻略', content: '杭州西湖清晨人少' }), true);
  const result = await searchTravelGuides('杭州', '茶文化', '少走路', env, async () => response({ results: [
    { title: '成都攻略', url: 'https://www.xiaohongshu.com/explore/cd001', content: '成都熊猫基地', score: 1 },
    { title: '杭州慢游', url: 'https://www.xiaohongshu.com/explore/hz001', content: '杭州茶文化和西湖路线', score: .8 },
  ] }));
  assert.deepEqual(result.sources.map(source => source.title), ['成都攻略', '杭州慢游']);
  assert.equal(result.stats.searched, 4);
});

test('public body enrichment marks each article independently and keeps summaries when reading fails', async () => {
  const sources = [
    { id: 'a', url: 'https://www.xiaohongshu.com/explore/abcdef1', content: '摘要A', contentState: 'summary' },
    { id: 'b', url: 'https://www.xiaohongshu.com/explore/abcdef2', content: '摘要B', contentState: 'summary' },
  ];
  const enriched = await enrichGuideBodies(sources, async () => new Map([[sources[0].url, '公开正文中的西湖风景名胜区建议，这是足够长的测试文本。']]));
  assert.equal(enriched[0].contentState, 'full');
  assert.equal(enriched[1].contentState, 'summary');
  assert.equal(enriched[1].content, '摘要B');
});

test('guide insights require a literal place name and continuous quote from the declared source', async () => {
  const sources = [{ id: 'g1', city: '杭州', content: '西湖风景名胜区游客多，建议清晨到达。' }];
  const valid = { sourceId: 'g1', placeName: '西湖风景名胜区', quote: '西湖风景名胜区游客多，建议清晨到达', advice: '早到' };
  assert.deepEqual(validateGuideInsights({ insights: [valid, { ...valid, sourceId: 'forged' }, { ...valid, quote: '西湖风景名胜区不用排队' }] }, sources), [valid]);
  const extracted = await extractGuideInsights(sources, env, async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.messages[0].content, /旅行攻略证据抽取器/);
    return response({ choices: [{ message: { content: JSON.stringify({ insights: [valid] }) } }] });
  });
  assert.deepEqual(extracted, [valid]);
});

test('food mentions in travel guides require a literal branch and continuous evidence', async () => {
  const sources = [{ id: 'g1', city: '杭州', content: '测试江南餐厅（西湖店）的东坡肉值得尝试。' }];
  const valid = { sourceId: 'g1', placeName: '测试江南餐厅（西湖店）', quote: '测试江南餐厅（西湖店）的东坡肉值得尝试', dishes: ['东坡肉'] };
  assert.deepEqual(validateGuideFoodInsights({ insights: [valid, { ...valid, placeName: '另一家店' }] }, sources), [valid]);
  const extracted = await extractGuideFoodInsights(sources, env, async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.messages[0].content, /餐饮证据抽取器/);
    return response({ choices: [{ message: { content: JSON.stringify({ insights: [valid] }) } }] });
  });
  assert.deepEqual(extracted, [valid]);
});

test('missing Tavily and failed search degrade without blocking discovery', async () => {
  const missing = await searchTravelGuides('杭州', {}, () => assert.fail());
  assert.equal(missing.code, 'not_configured');
  const failed = await searchTravelGuides('杭州', env, async () => { throw Object.assign(Error('timeout'), { name: 'TimeoutError' }); });
  assert.equal(failed.sources.length, 0);
  assert.equal(failed.code, 'timeout');
  assert.equal(failed.retryable, true);
});

test('guide search distinguishes credentials, rate limits and quota failures', async () => {
  const unauthorized = await searchTravelGuides('北京', env, async () => new Response('{}', { status: 401 }));
  assert.equal(unauthorized.code, 'unauthorized'); assert.equal(unauthorized.retryable, false);
  let rateCalls = 0;
  const rateLimited = await searchTravelGuides('成都', env, async () => { rateCalls++; return new Response('{}', { status: 429 }); });
  assert.equal(rateLimited.code, 'rate_limited'); assert.equal(rateCalls, 2);
  const quota = await searchTravelGuides('西安', env, async () => new Response('{}', { status: 432 }));
  assert.equal(quota.code, 'quota_exceeded'); assert.equal(quota.retryable, false);
});

test('sparse basic results trigger one preference-aware advanced query', async () => {
  const bodies = [];
  const result = await searchTravelGuides('苏州', '园林', '少走路', env, async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    return response({ results: [{ title: '苏州园林攻略', url: `https://www.xiaohongshu.com/explore/${body.search_depth}123`, content: '苏州园林慢游路线', score: .8 }] });
  });
  assert.deepEqual(bodies.map(body => body.search_depth), ['basic', 'advanced']);
  assert.match(bodies[1].query, /园林.*少走路/);
  assert.equal(result.sources.length, 2);
});

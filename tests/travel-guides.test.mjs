import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichGuideBodies, extractGuideInsights, isGuideRelevant, searchTravelGuides, validateGuideInsights } from '../lib/travel-guides.mjs';

const env = { TAVILY_API_KEY: 'test', DEEPSEEK_API_KEY: 'test' };
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('guide search uses one destination query and keeps at most eight unique public notes in relevance order', async () => {
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
  assert.equal(body.max_results, 8);
  assert.equal(result.sources.length, 8);
  assert.equal(result.sources[0].title, '重复');
  assert.deepEqual(result.sources.map(item => item.rank), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('guide results must mention the requested destination before they can be shown', async () => {
  assert.equal(isGuideRelevant('杭州', { title: '成都三日游', content: '宽窄巷子和熊猫基地' }), false);
  assert.equal(isGuideRelevant('杭州市', { title: '周末攻略', content: '杭州西湖清晨人少' }), true);
  const result = await searchTravelGuides('杭州', '茶文化', '少走路', env, async () => response({ results: [
    { title: '成都攻略', url: 'https://www.xiaohongshu.com/explore/cd001', content: '成都熊猫基地', score: 1 },
    { title: '杭州慢游', url: 'https://www.xiaohongshu.com/explore/hz001', content: '杭州茶文化和西湖路线', score: .8 },
  ] }));
  assert.deepEqual(result.sources.map(source => source.title), ['杭州慢游']);
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

test('missing Tavily and failed search degrade without blocking discovery', async () => {
  assert.equal((await searchTravelGuides('杭州', {}, () => assert.fail())).state, 'pending');
  assert.equal((await searchTravelGuides('杭州', env, async () => { throw Error('timeout'); })).sources.length, 0);
});

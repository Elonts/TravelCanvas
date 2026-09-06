export const fixtureRequest = { destination: '杭州', startDate: '2026-09-10', days: 1, budget: 6000, budgetBasis: 'group', travelers: 2, transport: 'walk', preferences: '', constraints: '', foodPreferences: '杭帮菜', dietary: '', foodMode: 'route', maxDetour: 30, mealMinutes: 60, queueMinutes: 20, noteText: '', noteUrl: '', noteDate: '' };
export const fixtureDays = [{ date: '2026-09-10', stops: [{ id: 's1', name: '西湖风景名胜区', address: '杭州', lng: 120.1, lat: 30.2, verified: true, time: '09:00', durationMinutes: 90 }, { id: 's2', name: '灵隐寺', address: '杭州', lng: 120.2, lat: 30.2, verified: true, time: '14:30', durationMinutes: 90 }] }];
export const fixtureContent = '测试江南餐厅（西湖店）在美食推荐榜中被提到，建议提前取号。西湖风景名胜区步行距离较长，建议穿舒适鞋。';
export const testEnv = { AMAP_API_KEY: 'test-only-map', TAVILY_API_KEY: 'test-only-search', DEEPSEEK_API_KEY: 'test-only-model' };
export function poi(index, branch = '西湖') {
  return { id: `${branch}-${index}`, name: `${['测试江南餐厅', '测试面馆', '测试家常菜', '测试昂贵餐厅', '测试未知餐厅', '测试远方餐厅'][index]}（${branch}店）`, location: `${120.101 + index * .001},30.21`, address: '杭州测试地址（仅测试）', type: index === 0 ? '餐饮服务;杭帮菜' : '餐饮服务;中餐厅', typecode: '050100', business: { cost: [60, 30, 45, 2000, '', 40][index], opentime_week: '每天 10:00-22:00' } };
}
export async function fixtureFetch(input, options = {}) {
  const url = new URL(String(input));
  const reply = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'api.tavily.com') return reply({ results: [{ title: '杭州美食经验（测试）', url: 'https://www.xiaohongshu.com/explore/abcdef123', content: fixtureContent, published_date: '2026-09-01' }] });
  if (url.hostname === 'api.deepseek.com') {
    const body = JSON.parse(options.body);
    const extraction = body.messages[0].content.includes('不可信资料');
    const content = extraction ? { tips: [{ sourceId: 'search-0', placeName: '测试江南餐厅（西湖店）', quote: '测试江南餐厅（西湖店）在美食推荐榜中被提到，建议提前取号', category: 'ranking' }, { sourceId: 'search-0', placeName: '西湖风景名胜区', quote: '西湖风景名胜区步行距离较长，建议穿舒适鞋', category: 'travel' }] } : { places: ['西湖风景名胜区', '中国茶叶博物馆（双峰馆区）', '灵隐寺', '河坊街'] };
    return reply({ choices: [{ message: { content: JSON.stringify(content) } }] });
  }
  if (url.hostname === 'restapi.amap.com') {
    if (url.pathname.includes('/place/')) {
      if (url.searchParams.get('types') === '050000') return reply({ status: '1', pois: Array.from({ length: 6 }, (_, i) => poi(i)) });
      return reply({ status: '1', pois: [{ id: 'attraction', name: url.searchParams.get('keywords'), address: '杭州测试景点地址', location: '120.1,30.2' }] });
    }
    const lngs = [url.searchParams.get('origin'), url.searchParams.get('destination')].map(s => Number(s.split(',')[0]));
    const index = lngs.map(lng => Math.round((lng - 120.101) * 1000)).find(i => i >= 0 && i < 6);
    const duration = (index === undefined ? 10 : [8, 12, 6, 8, 8, 50][index]) * 60;
    const path = { duration: String(duration), distance: '600', cost: '2', tolls: '0' };
    return reply({ status: '1', route: { paths: [path], transits: [path] } });
  }
  if (url.hostname.includes('open-meteo.com')) throw Error('Offline weather fixture');
  throw Error('Unexpected external request in fixture');
}

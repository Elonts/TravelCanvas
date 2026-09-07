export const fixtureRequest = { origin: '上海', destinations: ['杭州'], startDate: '2026-09-10', days: 1, budget: 6000, budgetBasis: 'group', travelers: 2, transport: 'walk', preferences: '', constraints: '', entertainmentPreferences: '台球、足浴', foodPreferences: '杭帮菜', dietary: '', foodMode: 'route', maxDetour: 30, mealMinutes: 60, queueMinutes: 20, noteText: '', noteUrl: '', noteDate: '' };
export const fixtureDays = [{ city: '杭州', date: '2026-09-10', stops: [{ id: 's1', city: '杭州', name: '西湖风景名胜区', address: '杭州', lng: 120.1, lat: 30.2, verified: true, time: '09:00', durationMinutes: 90 }, { id: 's2', city: '杭州', name: '灵隐寺', address: '杭州', lng: 120.2, lat: 30.2, verified: true, time: '14:30', durationMinutes: 90 }] }];
export const fixtureContent = '测试江南餐厅（西湖店）在美食推荐榜中被提到，建议提前取号。西湖风景名胜区步行距离较长，建议穿舒适鞋。';
export const testEnv = { AMAP_API_KEY: 'test-only-map', TAVILY_API_KEY: 'test-only-search', DEEPSEEK_API_KEY: 'test-only-model' };
export function poi(index, branch = '西湖') {
  return { id: `${branch}-${index}`, name: `${['测试江南餐厅', '测试面馆', '测试家常菜', '测试昂贵餐厅', '测试未知餐厅', '测试远方餐厅'][index]}（${branch}店）`, location: `${120.101 + index * .001},30.21`, address: '杭州测试地址（仅测试）', type: index === 0 ? '餐饮服务;杭帮菜' : '餐饮服务;中餐厅', typecode: '050100', business: { cost: [60, 30, 45, 2000, '', 40][index], opentime_week: '每天 10:00-22:00' }, photos: [{ url: 'https://store.is.autonavi.com/showpic/test-food.jpg?v=valid' }] };
}
export async function fixtureFetch(input, options = {}) {
  const url = new URL(String(input));
  const reply = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'api.tavily.com') return reply({ results: [{ title: '杭州美食经验（测试）', url: 'https://www.xiaohongshu.com/explore/abcdef123', content: fixtureContent, published_date: '2026-09-01' }] });
  if (url.hostname === 'api.deepseek.com') {
    const body = JSON.parse(options.body);
    if (body.messages[1].content.includes('模拟AI失败')) throw Error('Simulated model outage');
    const extraction = body.messages[0].content.includes('不可信资料');
    const discovery = body.messages[0].content.includes('旅行候选发现助手');
    const count = Number(body.messages[1].content.match(/推荐 (\d+) 个/)?.[1] || 4);
    const places = ['西湖风景名胜区', '中国茶叶博物馆（双峰馆区）', '灵隐寺', '河坊街', ...Array.from({ length: 26 }, (_, i) => `测试景点${i + 5}`)];
    const sourceId = extraction ? JSON.parse(body.messages[1].content)[0]?.id || 'search-0' : 'search-0';
    const content = extraction ? { tips: [{ sourceId, placeName: '测试江南餐厅（西湖店）', quote: '测试江南餐厅（西湖店）在美食推荐榜中被提到，建议提前取号', category: 'ranking' }, { sourceId, placeName: '西湖风景名胜区', quote: '西湖风景名胜区步行距离较长，建议穿舒适鞋', category: 'travel' }] }
      : discovery ? { attractions: places.slice(0, 4).map(name => ({ name, reason: '符合测试旅行偏好，地点仍需高德核验。' })), entertainment: ['测试剧场', '测试乐园', '测试文化馆'].map(name => ({ name, reason: '适合轻松体验，营业信息待确认。' })) }
      : { places: places.slice(0, count) };
    return reply({ choices: [{ message: { content: JSON.stringify(content) } }] });
  }
  if (url.hostname === 'restapi.amap.com') {
    if (url.pathname.includes('/geocode/geo')) {
      const name = url.searchParams.get('address');
      const coordinates = { 上海: '121.4737,31.2304', 杭州: '120.1551,30.2741', 北京: '116.4074,39.9042', 成都: '104.0665,30.5723' };
      const citycodes = { 上海: '021', 杭州: '0571', 北京: '010', 成都: '028' };
      return reply({ status: '1', geocodes: [{ formatted_address: `${name}（测试）`, location: coordinates[name] || '113.2644,23.1291', citycode: citycodes[name] || '020' }] });
    }
    if (url.pathname.includes('/place/')) {
      if (url.searchParams.get('types') === '050000') return reply({ status: '1', pois: Array.from({ length: 6 }, (_, i) => poi(i)) });
      if (url.searchParams.get('types') === '110000') return reply({ status: '1', pois: Array.from({ length: 12 }, (_, i) => ({
        id: `${url.searchParams.get('keywords')}-${i}`, name: i === 0 ? url.searchParams.get('keywords') : `地图补充公园${i}`, address: '杭州测试景点地址', location: `${120.1 + i * .001},30.2`, type: '风景名胜;公园广场', typecode: '110101', photos: [{ url: 'https://store.is.autonavi.com/showpic/test-attraction.jpg?v=valid' }],
      })) });
      if (url.searchParams.get('types') === '080000') return reply({ status: '1', pois: Array.from({ length: 8 }, (_, i) => ({
        id: `entertainment-${i}`, name: i === 0 ? url.searchParams.get('keywords') : `测试休闲场所${i}`, address: '杭州测试娱乐地址', location: `${120.12 + i * .001},30.22`, type: '体育休闲服务;娱乐场所', typecode: '080301', photos: [{ url: 'https://store.is.autonavi.com/showpic/test-entertainment.jpg?v=valid' }],
      })) });
      return reply({ status: '1', pois: [{ id: `attraction-${url.searchParams.get('keywords')}`, name: url.searchParams.get('keywords'), address: '杭州测试景点地址', location: '120.1,30.2' }] });
    }
    const lngs = [url.searchParams.get('origin'), url.searchParams.get('destination')].map(s => Number(s.split(',')[0]));
    const index = lngs.map(lng => Math.round((lng - 120.101) * 1000)).find(i => i >= 0 && i < 6);
    const duration = (index === undefined ? 10 : [8, 12, 6, 8, 8, 50][index]) * 60;
    const path = { duration: String(duration), distance: '600', cost: { duration: String(duration), transit_fee: '2', tolls: '0' }, tolls: '0', steps: [{ polyline: `${url.searchParams.get('origin')};${url.searchParams.get('destination')}` }] };
    return reply({ status: '1', route: { paths: [path], transits: [path] } });
  }
  if (url.hostname === 'store.is.autonavi.com') {
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    return new Response(image, { status: 200, headers: { 'Content-Type': 'image/png', 'Content-Length': String(image.byteLength) } });
  }
  if (url.hostname.includes('open-meteo.com')) throw Error('Offline weather fixture');
  throw Error('Unexpected external request in fixture');
}

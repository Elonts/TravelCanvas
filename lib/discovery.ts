import 'server-only';
import { z } from 'zod';
import { candidateStops } from './fixtures';
import { createMapProvider, extractTips, searchNotes } from './food-providers.mjs';
import type { DiscoveryCandidate, DiscoveryEvidence } from './discovery-types';
import type { TripRequest, DataState } from './plan';

const suggestionSchema = z.object({
  attractions: z.array(z.object({ name: z.string().trim().min(2).max(100), reason: z.string().trim().min(2).max(240) })).max(8),
  entertainment: z.array(z.object({ name: z.string().trim().min(2).max(100), reason: z.string().trim().min(2).max(240) })).max(8),
});
const normalize = (value: string) => value.replace(/[\s（）()·]/g, '').toLowerCase();
const stateOf = (states: DataState[]): DataState => states.length > 0 && states.every(state => state === 'live') ? 'live' : states.length > 0 && states.every(state => state === 'demo') ? 'demo' : 'pending';

async function aiSuggestions(request: TripRequest, city: string) {
  const fallback = { attractions: candidateStops(city).map(stop => ({ name: stop.name, reason: '本地演示候选，需由高德核验后展示。' })), entertainment: [] };
  if (!process.env.DEEPSEEK_API_KEY) return { value: fallback, state: 'demo' as const };
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', thinking: { type: 'disabled' }, max_tokens: 1600, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: '你是中国境内旅行候选发现助手，只输出 JSON。地点名称必须具体、可在高德检索。你的内容只是建议，不能编造实时营业、门票、价格或安全信息。' },
        { role: 'user', content: `为${city}推荐 4 个景区和 6 个娱乐项目。旅行偏好：${request.preferences || '综合体验'}；娱乐偏好：${request.entertainmentPreferences || '台球、足浴、剧本杀、酒馆、本地演出与文化体验'}；旅行限制：${request.constraints || '无'}。返回 {"attractions":[{"name":"正式名称","reason":"与偏好或限制的关系"}],"entertainment":[{"name":"正式名称","reason":"与偏好、景区片区或限制的关系"}]}。娱乐项目应包含用户勾选的类型，并尽量选择景区周边具体分店；不要返回餐厅。` },
      ] }),
    });
    if (!response.ok) throw Error('model unavailable');
    const json = await response.json();
    return { value: suggestionSchema.parse(JSON.parse(json.choices?.[0]?.message?.content || '{}')), state: 'live' as const };
  } catch { return { value: fallback, state: 'demo' as const }; }
}

function evidenceFor(name: string, tips: Awaited<ReturnType<typeof extractTips>>, sources: Awaited<ReturnType<typeof searchNotes>>['sources']): DiscoveryEvidence[] {
  return tips.filter(tip => normalize(tip.placeName) === normalize(name)).map(tip => {
    const source = sources.find(item => item.id === tip.sourceId)!;
    return { sourceId: source.id, title: source.title, url: source.url, quote: tip.quote, dishes: tip.dishes, publishedAt: source.publishedAt, queriedAt: source.queriedAt };
  }).filter(item => item.title).slice(0, 5);
}

function evidenceScore(evidence: DiscoveryEvidence[], candidate: { name: string; category: string }, request: TripRequest) {
  const independent = new Set(evidence.map(item => item.sourceId)).size;
  const recent = evidence.filter(item => item.publishedAt && Date.now() - Date.parse(`${item.publishedAt}T00:00:00Z`) < 366 * 86400000).length;
  const terms = (request.foodPreferences || request.preferences || '').split(/[，,、;；\s]+/).filter(Boolean);
  const text = `${candidate.name} ${candidate.category} ${evidence.map(item => item.quote).join(' ')}`;
  return independent * 40 + recent * 8 + terms.filter(term => text.includes(term)).length * 15;
}

function makeCandidate(place: any, kind: DiscoveryCandidate['kind'], request: TripRequest, reasons: Map<string, string>, tips: Awaited<ReturnType<typeof extractTips>>, sources: Awaited<ReturnType<typeof searchNotes>>['sources']): DiscoveryCandidate {
  const evidence = kind === 'food' ? evidenceFor(place.name, tips, sources) : [];
  const score = kind === 'food' ? evidenceScore(evidence, place, request) : 0;
  const reason = reasons.get(normalize(place.name)) || (kind === 'food'
    ? evidence.length ? `${new Set(evidence.map(item => item.sourceId)).size} 个公开笔记线索与餐饮偏好综合排序。` : '高德餐饮候选；暂未匹配到具体小红书证据。'
    : `根据“${request.preferences || '综合体验'}”生成，并已通过高德地点核验。`);
  return {
    id: `${kind}:${place.city}:${place.poiId}`, poiId: place.poiId, kind, city: place.city, name: place.name, address: place.address,
    lng: place.lng, lat: place.lat, category: place.category, imageUrl: place.imageUrl, durationMinutes: kind === 'attraction' ? 120 : kind === 'entertainment' ? 90 : 60,
    estimatedCost: kind === 'food' ? place.price?.high ?? null : null, price: place.price, hours: place.hours,
    introduction: evidence[0]?.quote || `${place.category} · ${place.address || `${place.city}，详细地址待确认`}`,
    recommendationReason: reason, source: kind === 'food' && evidence.length ? '高德地图 POI + 小红书公开笔记' : '高德地图 POI',
    queriedAt: new Date().toISOString(), verified: true, navigationUrl: place.navigationUrl, evidence, evidenceScore: score, featuredDishes: [...new Set(evidence.flatMap(item => item.dishes || []))],
  };
}

export async function discoverCandidates(request: TripRequest) {
  const warnings: string[] = [];
  const searches = await Promise.all(request.destinations.map(async city => {
    const result = await searchNotes({ ...request, destinations: [city] }, []);
    return { city, ...result, sources: result.sources.map(source => ({ ...source, id: `${city}:${source.id}` })) };
  }));
  const sources = searches.flatMap(search => search.sources);
  searches.forEach(search => warnings.push(...search.warnings.map(warning => `${search.city}：${warning}`)));
  const tips = await extractTips(sources, []);
  const suggestions = await Promise.all(request.destinations.map(city => aiSuggestions(request, city)));
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 }) : null;
  if (!map) warnings.push('高德服务未配置，无法核验候选地点、图片和导航坐标。');
  const candidates: DiscoveryCandidate[] = [];
  const mapStates: DataState[] = [];
  for (let index = 0; index < request.destinations.length; index++) {
    const city = request.destinations[index], suggestion = suggestions[index].value;
    const citySourceIds = new Set(searches[index].sources.map(source => source.id));
    const cityTips = tips.filter(tip => citySourceIds.has(tip.sourceId));
    const foodNames = cityTips.filter(tip => tip.category === 'food' || tip.category === 'ranking').map(tip => tip.placeName);
    const reasons = new Map([...suggestion.attractions, ...suggestion.entertainment].map(item => [normalize(item.name), item.reason]));
    if (!map) { mapStates.push('pending'); continue; }
    const [attractions, food, entertainment] = await Promise.all([
      map.discover(city, 'attraction', suggestion.attractions.map(item => item.name), 6, request.transport),
      map.discover(city, 'food', foodNames, 6, request.transport),
      map.discover(city, 'entertainment', [...suggestion.entertainment.map(item => item.name), ...(request.entertainmentPreferences || '台球 足浴 剧本杀 酒馆').split(/[，,、\s]+/).filter(Boolean)], 10, request.transport),
    ]);
    const targetedSearch = food.length ? await searchNotes({ ...request, destinations: [city], verifiedFoodNames: food.map(place => place.name) }, []) : { sources: [], warnings: [], state: 'pending' as const };
    const targetedSources = targetedSearch.sources.map(source => ({ ...source, id: `${city}:targeted:${source.id}` }));
    sources.push(...targetedSources);
    warnings.push(...targetedSearch.warnings.map(warning => `${city}精准分店检索：${warning}`));
    // If the model extractor is unavailable, exact full branch names from the
    // already verified AMap pool can still recover literal source excerpts.
    const targetedTips = await extractTips(targetedSources, food.map(place => place.name));
    const literalFoodTips = await extractTips([...searches[index].sources, ...targetedSources], food.map(place => place.name), {} as NodeJS.ProcessEnv, fetch);
    const verifiedTips = [...cityTips, ...targetedTips, ...literalFoodTips].filter((tip, tipIndex, all) => all.findIndex(other => other.sourceId === tip.sourceId && other.quote === tip.quote) === tipIndex);
    candidates.push(...attractions.map(place => makeCandidate(place, 'attraction', request, reasons, cityTips, sources)));
    candidates.push(...food.map(place => makeCandidate(place, 'food', request, reasons, verifiedTips, sources)).sort((a, b) => b.evidenceScore - a.evidenceScore));
    candidates.push(...entertainment.map(place => makeCandidate(place, 'entertainment', request, reasons, cityTips, sources)));
    mapStates.push(attractions.length && food.length && entertainment.length ? 'live' : 'pending');
  }
  if (!candidates.some(candidate => candidate.kind === 'food' && candidate.evidence.length)) warnings.push('本次没有匹配到带具体小红书证据的分店；无证据餐厅仅作为高德候选展示。');
  return {
    request, candidates, warnings,
    sources: { search: searches.every(search => search.state === 'live') ? 'live' as const : 'pending' as const, ai: stateOf(suggestions.map(item => item.state)), map: stateOf(mapStates), updatedAt: new Date().toISOString() },
  };
}

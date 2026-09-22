import 'server-only';
import { z } from 'zod';
import { candidateStops } from './fixtures';
import { createMapProvider, extractTips, searchNotes } from './food-providers.mjs';
import type { DiscoveryCandidate, DiscoveryEvidence } from './discovery-types';
import type { TripRequest, DataState } from './plan';
import { amapImageAttribution, fillMissingWebImages } from './web-images.mjs';
import { attractionPreferenceFit, foodPreferenceTerms } from './preference-fit.mjs';
import { enrichGuideBodies, extractGuideInsights, searchTravelGuides } from './travel-guides.mjs';

const suggestionSchema = z.object({
  attractions: z.array(z.object({ name: z.string().trim().min(2).max(100), reason: z.string().trim().min(2).max(240) })).max(8),
});
const normalize = (value: string) => value.replace(/[\s（）()·]/g, '').toLowerCase();
const stateOf = (states: DataState[]): DataState => states.length > 0 && states.every(state => state === 'live') ? 'live' : states.length > 0 && states.every(state => state === 'demo') ? 'demo' : 'pending';

async function aiSuggestions(request: TripRequest, city: string) {
  const fallback = { attractions: candidateStops(city).map(stop => ({ name: stop.name, reason: '本地演示候选，需由高德核验后展示。' })) };
  if (!process.env.DEEPSEEK_API_KEY) return { value: fallback, state: 'demo' as const };
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', thinking: { type: 'disabled' }, max_tokens: 1600, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: '你是中国境内旅行候选发现助手，只输出 JSON。地点名称必须具体、可在高德检索。你的内容只是建议，不能编造实时营业、门票、价格或安全信息。' },
        { role: 'user', content: `为${city}推荐 4 个景区。旅行偏好：${request.preferences || '综合体验'}；旅行限制：${request.constraints || '无'}。返回 {"attractions":[{"name":"正式名称","reason":"与偏好或限制的关系"}]}。不要返回餐厅或娱乐项目。` },
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
  const terms = foodPreferenceTerms(request.foodPreferences || '');
  const text = `${candidate.name} ${candidate.category} ${evidence.map(item => item.quote).join(' ')}`;
  return independent * 40 + recent * 8 + terms.filter(term => text.includes(term)).length * 15;
}

function guideEvidenceFor(name: string, insights: Awaited<ReturnType<typeof extractGuideInsights>>, sources: Awaited<ReturnType<typeof enrichGuideBodies>>) {
  return insights.filter(insight => normalize(insight.placeName) === normalize(name)).map(insight => {
    const source = sources.find(item => item.id === insight.sourceId)!;
    return { sourceId: source.id, city: source.city, rank: source.rank, title: source.title, url: source.url, quote: insight.quote, advice: insight.advice, contentState: source.contentState, publishedAt: source.publishedAt, queriedAt: source.queriedAt };
  }).filter(item => item.title).slice(0, 5);
}

function makeCandidate(place: any, kind: DiscoveryCandidate['kind'], request: TripRequest, reasons: Map<string, string>, tips: Awaited<ReturnType<typeof extractTips>>, sources: Awaited<ReturnType<typeof searchNotes>>['sources'], guideInsights: Awaited<ReturnType<typeof extractGuideInsights>> = [], guideSources: Awaited<ReturnType<typeof enrichGuideBodies>> = []): DiscoveryCandidate {
  const evidence = kind === 'food' ? evidenceFor(place.name, tips, sources) : [];
  const score = kind === 'food' ? evidenceScore(evidence, place, request) : 0;
  const guideEvidence = kind === 'attraction' ? guideEvidenceFor(place.name, guideInsights, guideSources) : [];
  const guideScore = new Set(guideEvidence.map(item => item.sourceId)).size * 30 + guideEvidence.reduce((sum, item) => sum + Math.max(0, 9 - item.rank) * 3, 0);
  const attractionFit = kind === 'attraction' ? attractionPreferenceFit(place, request) : null;
  const reason = reasons.get(normalize(place.name)) || (kind === 'food'
    ? evidence.length ? `${new Set(evidence.map(item => item.sourceId)).size} 个公开笔记线索与餐饮偏好综合排序。` : '高德餐饮候选；暂未匹配到具体小红书证据。'
    : guideEvidence.length ? `${new Set(guideEvidence.map(item => item.sourceId)).size} 篇公开攻略提及，并已通过高德地点核验。` : `根据“${request.preferences || '综合体验'}”生成，并已通过高德地点核验。`);
  const queriedAt = new Date().toISOString();
  return {
    id: `${kind}:${place.city}:${place.poiId}`, poiId: place.poiId, kind, city: place.city, name: place.name, address: place.address,
    lng: place.lng, lat: place.lat, category: place.category, imageUrl: place.imageUrl, imageAttribution: amapImageAttribution(place.imageUrl, queriedAt), durationMinutes: kind === 'attraction' ? 120 : kind === 'entertainment' ? 90 : 60,
    estimatedCost: kind === 'food' ? place.price?.high ?? null : null, price: place.price, hours: place.hours,
    introduction: evidence[0]?.quote || guideEvidence[0]?.quote || `${place.category} · ${place.address || `${place.city}，详细地址待确认`}`,
    recommendationReason: attractionFit ? `${reason} ${attractionFit.note}。` : reason, source: kind === 'food' && evidence.length ? '高德地图 POI + 小红书公开笔记' : kind === 'attraction' && guideEvidence.length ? '高德地图 POI + 公开小红书攻略' : '高德地图 POI',
    queriedAt, verified: true, navigationUrl: place.navigationUrl, evidence, evidenceScore: score, featuredDishes: [...new Set(evidence.flatMap(item => item.dishes || []))],
    guideEvidence, guideScore, preferenceFitScore: attractionFit?.score, constraintWarning: attractionFit?.caution || undefined,
  };
}

export async function discoverCandidates(request: TripRequest) {
  const warnings: string[] = [];
  const guideSearches = await Promise.all(request.destinations.map(city => searchTravelGuides(city, request.preferences, request.constraints)));
  guideSearches.forEach((search, index) => { if (search.warning) warnings.push(`${request.destinations[index]}攻略：${search.warning}`); });
  const guideSources = await enrichGuideBodies(guideSearches.flatMap(search => search.sources));
  const guideInsights = await extractGuideInsights(guideSources);
  const sources: Awaited<ReturnType<typeof searchNotes>>['sources'] = [];
  const tips: Awaited<ReturnType<typeof extractTips>> = [];
  const suggestions = await Promise.all(request.destinations.map(city => aiSuggestions(request, city)));
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 }) : null;
  if (!map) warnings.push('高德服务未配置，无法核验候选地点、图片和导航坐标。');
  const candidates: DiscoveryCandidate[] = [];
  const mapStates: DataState[] = [];
  for (let index = 0; index < request.destinations.length; index++) {
    const city = request.destinations[index], suggestion = suggestions[index].value;
    const cityGuideSources = guideSources.filter(source => source.city === city);
    const cityGuideIds = new Set(cityGuideSources.map(source => source.id));
    const cityGuideInsights = guideInsights.filter(insight => cityGuideIds.has(insight.sourceId));
    const guideNames = [...new Set(cityGuideInsights.sort((a, b) => (cityGuideSources.find(source => source.id === a.sourceId)?.rank || 9) - (cityGuideSources.find(source => source.id === b.sourceId)?.rank || 9)).map(insight => insight.placeName))];
    const cityTips: Awaited<ReturnType<typeof extractTips>> = [];
    const reasons = new Map(suggestion.attractions.map(item => [normalize(item.name), item.reason]));
    if (!map) { mapStates.push('pending'); continue; }
    const attractions = await map.discover(city, 'attraction', [...guideNames.slice(0, 6), ...suggestion.attractions.map(item => item.name)], Math.min(20, Math.max(6, request.days * 3 + 3)), request.transport);
    const rankedAttractions = attractions.map(place => makeCandidate(place, 'attraction', request, reasons, cityTips, sources, cityGuideInsights, cityGuideSources)).filter(candidate => !attractionPreferenceFit(candidate, request).excluded).sort((a, b) => b.guideScore - a.guideScore || (b.preferenceFitScore || 0) - (a.preferenceFitScore || 0));
    candidates.push(...rankedAttractions);
    mapStates.push(attractions.length ? 'live' : 'pending');
  }
  warnings.push('餐厅将在景区基础路线生成后，按午晚餐位置、口味和绕路成本查询。');
  const picturedCandidates = await fillMissingWebImages(candidates, process.env, fetch);
  return {
    request, candidates: picturedCandidates, warnings,
    guideSources: guideSources.map(({ content: _content, ...source }) => source),
    sources: { search: 'pending' as const, guides: guideSearches.every(search => search.state === 'live') ? 'live' as const : 'pending' as const, ai: stateOf(suggestions.map(item => item.state)), map: stateOf(mapStates), updatedAt: new Date().toISOString() },
  };
}

export async function discoverCustomCandidates(request: TripRequest, city: string, kind: 'attraction' | 'food', names: string[]) {
  if (!request.destinations.includes(city)) throw Error('只能向本次行程的目的地添加地点');
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 }) : null;
  if (!map) throw Error('高德服务未配置，暂时无法核验自定义地点');
  const places = await map.discover(city, kind, names, Math.min(12, Math.max(names.length * 2, 4)), request.transport);
  const chosen = names.map(name => places.find(place => normalize(place.name) === normalize(name))
    || places.find(place => normalize(place.name).includes(normalize(name)) || normalize(name).includes(normalize(place.name))))
    .filter((place, index, all): place is NonNullable<typeof place> => Boolean(place) && all.findIndex(other => other?.poiId === place?.poiId) === index);
  let sources: Awaited<ReturnType<typeof searchNotes>>['sources'] = [];
  let tips: Awaited<ReturnType<typeof extractTips>> = [];
  const warnings: string[] = [];
  if (kind === 'food' && chosen.length) {
    const result = await searchNotes({ ...request, destinations: [city], verifiedFoodNames: chosen.map(place => place.name) }, []);
    sources = result.sources.map(source => ({ ...source, id: `${city}:custom:${source.id}` }));
    tips = await extractTips(sources, chosen.map(place => place.name));
    warnings.push(...result.warnings.map(warning => `${city}自定义饭店检索：${warning}`));
  }
  const reasons = new Map(chosen.map(place => [normalize(place.name), '你手动添加并经高德核验的地点。']));
  const candidates = await fillMissingWebImages(chosen.map(place => makeCandidate(place, kind, request, reasons, tips, sources)), process.env, fetch);
  const missing = names.filter(name => !candidates.some(candidate => normalize(candidate.name) === normalize(name)));
  if (missing.length) warnings.push(`未精确匹配：${missing.join('、')}。请核对名称或补充分店名。`);
  return { candidates, warnings };
}

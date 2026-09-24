import 'server-only';
import { z } from 'zod';
import { candidateStops } from './fixtures';
import { createMapProvider, extractTips, searchNotes } from './food-providers.mjs';
import type { DiscoveryCandidate, DiscoveryEvidence } from './discovery-types';
import type { TripRequest, DataState } from './plan';
import { amapImageAttribution, fillMissingWebImages } from './web-images.mjs';
import { attractionPreferenceFit, foodPreferenceTerms } from './preference-fit.mjs';
import { enrichGuideBodies, extractGuideFoodInsights, extractGuideInsights, isGuideRelevant, searchTravelGuides } from './travel-guides.mjs';
import { collapseScenicChildren } from './scenic-groups.mjs';

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

function literalGuideInsights(candidates: DiscoveryCandidate[], sources: Awaited<ReturnType<typeof enrichGuideBodies>>) {
  const insights: { sourceId: string; placeName: string; quote: string; advice: string }[] = [];
  for (const source of sources) for (const candidate of candidates.filter(item => item.city === source.city && item.kind === 'attraction')) {
    const index = normalize(source.content).indexOf(normalize(candidate.name));
    if (index < 0) continue;
    const rawIndex = source.content.indexOf(candidate.name);
    const quote = rawIndex >= 0 ? source.content.slice(Math.max(0, rawIndex - 45), rawIndex + candidate.name.length + 90).trim() : `${candidate.name}（该名称出现在公开搜索摘要中）`;
    insights.push({ sourceId: source.id, placeName: candidate.name, quote, advice: '' });
  }
  return insights;
}

function withGuideEvidence(candidate: DiscoveryCandidate, insights: Awaited<ReturnType<typeof extractGuideInsights>>, sources: Awaited<ReturnType<typeof enrichGuideBodies>>): DiscoveryCandidate {
  const guideEvidence = guideEvidenceFor(candidate.name, insights, sources);
  if (!guideEvidence.length) return candidate;
  const guideScore = new Set(guideEvidence.map(item => item.sourceId)).size * 30 + guideEvidence.reduce((sum, item) => sum + Math.max(0, 9 - item.rank) * 3, 0);
  return { ...candidate, guideEvidence, guideScore, source: '高德地图 POI + 公开小红书攻略', introduction: guideEvidence[0].quote, recommendationReason: `${new Set(guideEvidence.map(item => item.sourceId)).size} 篇目的地相关公开攻略提及，并已通过高德地点核验。 ${candidate.recommendationReason}` };
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
    id: `${kind}:${place.city}:${place.poiId}`, poiId: place.poiId, parentPoiId: place.parentPoiId || null, rootPoiId: place.parentPoiId || place.poiId, scenicRole: place.parentPoiId ? 'child' : 'main', kind, city: place.city, name: place.name, address: place.address,
    lng: place.lng, lat: place.lat, category: place.category, imageUrl: place.imageUrl, imageAttribution: amapImageAttribution(place.imageUrl, queriedAt), durationMinutes: kind === 'attraction' ? 120 : kind === 'entertainment' ? 90 : 60,
    estimatedCost: kind === 'food' ? place.price?.high ?? null : null, price: place.price, hours: place.hours,
    introduction: evidence[0]?.quote || guideEvidence[0]?.quote || `${place.category} · ${place.address || `${place.city}，详细地址待确认`}`,
    recommendationReason: attractionFit ? `${reason} ${attractionFit.note}。` : reason, source: kind === 'food' && evidence.length ? '高德地图 POI + 小红书公开笔记' : kind === 'attraction' && guideEvidence.length ? '高德地图 POI + 公开小红书攻略' : '高德地图 POI',
    queriedAt, verified: true, navigationUrl: place.navigationUrl, evidence, evidenceScore: score, featuredDishes: [...new Set(evidence.flatMap(item => item.dishes || []))],
    guideEvidence, guideScore, preferenceFitScore: attractionFit?.score, constraintWarning: attractionFit?.caution || undefined,
  };
}

function sourceMatchesDestination(source: Awaited<ReturnType<typeof enrichGuideBodies>>[number], candidates: DiscoveryCandidate[]) {
  if (isGuideRelevant(source.city, source)) return true;
  const content = normalize(source.content);
  return candidates.some(candidate => candidate.city === source.city && content.includes(normalize(candidate.name)));
}

export async function discoverCandidates(request: TripRequest) {
  const warnings: string[] = [];
  const sources: Awaited<ReturnType<typeof searchNotes>>['sources'] = [];
  const tips: Awaited<ReturnType<typeof extractTips>> = [];
  const suggestions = await Promise.all(request.destinations.map(city => aiSuggestions(request, city)));
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 }) : null;
  if (!map) warnings.push('高德服务未配置，无法核验候选地点、图片和导航坐标。');
  const candidates: DiscoveryCandidate[] = [];
  const mapStates: DataState[] = [];
  for (let index = 0; index < request.destinations.length; index++) {
    const city = request.destinations[index], suggestion = suggestions[index].value;
    const cityTips: Awaited<ReturnType<typeof extractTips>> = [];
    const reasons = new Map(suggestion.attractions.map(item => [normalize(item.name), item.reason]));
    if (!map) { mapStates.push('pending'); continue; }
    const attractions = await map.discover(city, 'attraction', suggestion.attractions.map(item => item.name), Math.min(20, Math.max(6, request.days * 3 + 3)), request.transport);
    const rankedAttractions = collapseScenicChildren(attractions.map(place => makeCandidate(place, 'attraction', request, reasons, cityTips, sources))).filter(candidate => !attractionPreferenceFit(candidate, request).excluded).sort((a, b) => (b.preferenceFitScore || 0) - (a.preferenceFitScore || 0));
    candidates.push(...rankedAttractions);
    mapStates.push(attractions.length ? 'live' : 'pending');
  }
  warnings.push('餐厅将在景区基础路线生成后，按午晚餐位置、口味和绕路成本查询。');
  const picturedCandidates = await fillMissingWebImages(candidates, process.env, fetch);
  return {
    request, candidates: picturedCandidates, warnings,
    guideSources: [],
    guideSearch: { state: 'idle' as const, code: null, message: '基础景区已就绪，正在等待补充公开攻略。', attempts: 0, count: 0, retryable: true, queriedAt: null },
    sources: { search: 'pending' as const, guides: 'pending' as const, ai: stateOf(suggestions.map(item => item.state)), map: stateOf(mapStates), updatedAt: new Date().toISOString() },
  };
}

export async function enrichDiscoveryWithGuides(discovery: Awaited<ReturnType<typeof discoverCandidates>>) {
  const { request } = discovery;
  const searches = await Promise.all(request.destinations.map(city => searchTravelGuides(city, request.preferences, request.constraints, process.env, fetch,
    discovery.candidates.filter(candidate => candidate.city === city && candidate.kind === 'attraction').slice(0, 6).map(candidate => candidate.name))));
  const rawSources = searches.flatMap(search => search.sources);
  const allGuideSources = await enrichGuideBodies(rawSources);
  const aiInsights = await extractGuideInsights(allGuideSources);
  const literalInsights = literalGuideInsights(discovery.candidates, allGuideSources);
  const insightKeys = new Set(aiInsights.map(item => `${item.sourceId}:${normalize(item.placeName)}`));
  const insights = [...aiInsights, ...literalInsights.filter(item => !insightKeys.has(`${item.sourceId}:${normalize(item.placeName)}`))];
  let candidates = [...discovery.candidates];
  const map = process.env.AMAP_API_KEY ? createMapProvider(process.env, fetch, { intervalMs: process.env.TRAVELCANVAS_TEST_MODE ? 0 : 400 }) : null;
  if (map && aiInsights.length) {
    for (const city of request.destinations) {
      const citySources = allGuideSources.filter(source => source.city === city), sourceIds = new Set(citySources.map(source => source.id));
      const cityInsights = insights.filter(item => sourceIds.has(item.sourceId));
      const names = [...new Set(cityInsights.map(item => item.placeName))].filter(name => !candidates.some(candidate => candidate.city === city && normalize(candidate.name) === normalize(name)));
      if (!names.length) continue;
      const places = await map.discover(city, 'attraction', names.slice(0, 8), Math.min(12, names.length * 2), request.transport);
      const reasons = new Map(names.map(name => [normalize(name), '公开攻略提及，并经高德核验为当前目的地景区。']));
      const additions = places.map(place => makeCandidate(place, 'attraction', request, reasons, [], [])).filter(candidate => !candidates.some(existing => existing.poiId === candidate.poiId));
      candidates.push(...additions);
    }
  }
  candidates = collapseScenicChildren(candidates);
  const guideSources = allGuideSources.filter(source => sourceMatchesDestination(source, candidates)).map((source, index, all) => ({ ...source, rank: all.filter(item => item.city === source.city).findIndex(item => item.id === source.id) + 1 }));
  const relevantSourceIds = new Set(guideSources.map(source => source.id));
  const relevantInsights = insights.filter(insight => relevantSourceIds.has(insight.sourceId));
  candidates = candidates.map(candidate => withGuideEvidence(candidate, relevantInsights, guideSources));
  const guideFoodInsights = await extractGuideFoodInsights(guideSources);
  const guideFoodCandidates: DiscoveryCandidate[] = [];
  if (map && guideFoodInsights.length) {
    for (const city of request.destinations) {
      const citySourceIds = new Set(guideSources.filter(source => source.city === city).map(source => source.id));
      const cityInsights = guideFoodInsights.filter(insight => citySourceIds.has(insight.sourceId));
      const names = [...new Set(cityInsights.map(insight => insight.placeName))].slice(0, 20);
      if (!names.length) continue;
      const places = await map.discover(city, 'food', names, Math.min(40, Math.max(12, names.length * 3)), request.transport);
      const tips = cityInsights.map((insight, index) => ({ id: `guide-food-${index}`, sourceId: insight.sourceId, placeName: insight.placeName, text: insight.quote, quote: insight.quote, dishes: insight.dishes, category: 'ranking' as const, state: 'pending' as const }));
      const foodSources = guideSources.filter(source => citySourceIds.has(source.id)).map(source => ({ id: source.id, title: source.title, url: source.url, content: source.content, kind: 'search' as const, publishedAt: source.publishedAt, queriedAt: source.queriedAt }));
      const reasons = new Map(names.map(name => [normalize(name), '公开旅游攻略提及，并经高德核验到当前目的地具体餐饮 POI。']));
      const exactPlaces = places.filter(place => names.some(name => normalize(name) === normalize(place.name)));
      guideFoodCandidates.push(...exactPlaces.map(place => makeCandidate(place, 'food', request, reasons, tips, foodSources)).filter((candidate, index, all) => all.findIndex(other => other.poiId === candidate.poiId) === index));
    }
  }
  guideFoodCandidates.sort((a, b) => b.evidenceScore - a.evidenceScore);
  candidates = request.destinations.flatMap(city => candidates.filter(candidate => candidate.city === city).sort((a, b) => b.guideScore - a.guideScore || (b.preferenceFitScore || 0) - (a.preferenceFitScore || 0)));
  const warnings = [...discovery.warnings.filter(warning => !warning.includes('攻略：'))];
  searches.forEach((search, index) => { if (search.warning) warnings.push(`${request.destinations[index]}攻略：${search.warning}`); });
  const failed = searches.filter(search => !search.sources.length);
  const allSummary = guideSources.length > 0 && guideSources.every(source => source.contentState === 'summary');
  const state = !guideSources.length ? 'failed' : failed.length || allSummary ? 'partial' : 'live';
  const mainError = failed[0];
  const searchedCount = searches.reduce((sum, item) => sum + (item.stats?.searched || 0), 0);
  const duplicateCount = searches.reduce((sum, item) => sum + (item.stats?.duplicate || 0), 0);
  const invalidCount = searches.reduce((sum, item) => sum + (item.stats?.invalid || 0), 0);
  const unrelatedCount = Math.max(0, rawSources.length - guideSources.length);
  const bodyUnavailable = guideSources.filter(source => source.contentState === 'summary').length;
  const message = !guideSources.length ? mainError?.warning || `搜索了 ${searchedCount} 篇公开内容，但没有任何内容能通过目的地或高德地点核验。` : allSummary ? `搜索 ${searchedCount} 篇，保留 ${guideSources.length} 篇目的地相关摘要；公开正文暂不可读取。` : failed.length ? `搜索 ${searchedCount} 篇，保留 ${guideSources.length} 篇；部分目的地检索失败。` : `搜索 ${searchedCount} 篇，保留 ${guideSources.length} 篇目的地相关公开攻略。`;
  return {
    ...discovery, candidates, guideFoodCandidates: guideFoodCandidates.slice(0, 20), warnings,
    guideSources: guideSources.map(({ content: _content, ...source }) => source),
    guideSearch: { state, code: !guideSources.length ? 'irrelevant' : mainError?.code || (allSummary ? 'body_unavailable' : null), message, attempts: searches.reduce((sum, item) => sum + item.attempts, 0), count: guideSources.length, retryable: Boolean(!guideSources.length || mainError?.retryable || allSummary), queriedAt: new Date().toISOString(), stats: { searched: searchedCount, kept: guideSources.length, duplicate: duplicateCount, invalid: invalidCount, unrelated: unrelatedCount, bodyUnavailable } },
    sources: { ...discovery.sources, guides: guideSources.length ? 'live' as const : 'pending' as const, updatedAt: new Date().toISOString() },
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

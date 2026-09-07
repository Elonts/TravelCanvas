const now = () => new Date().toISOString();
const normalize = value => String(value || '').replace(/[\s（）()·]/g, '').toLowerCase();

function governmentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn')) && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function reservationEvidence(name, results, queriedAt = now()) {
  const relevant = results.map(item => ({ ...item, url: governmentUrl(item.url), text: `${item.title || ''} ${item.content || ''}` }))
    .filter(item => item.url && normalize(item.text).includes(normalize(name)));
  for (const item of relevant) {
    const sentence = item.text.split(/[。！？\n]/).find(value => value.includes(name) && /必须预约|须预约|需要预约|需提前预约|实行预约|预约入园|预约参观/.test(value));
    if (sentence) return { status: 'required', message: `政府公开页面提示需要预约：${sentence.slice(0, 100)}。规则可能变化，请点击来源复核。`, sourceUrl: item.url, queriedAt };
  }
  for (const item of relevant) {
    const sentence = item.text.split(/[。！？\n]/).find(value => value.includes(name) && /建议预约|推荐预约/.test(value));
    if (sentence) return { status: 'recommended', message: `政府公开页面建议预约：${sentence.slice(0, 100)}。请点击来源复核。`, sourceUrl: item.url, queriedAt };
  }
  return { status: 'unknown', message: '预约要求待确认，请在出发前查看景区官方渠道。', sourceUrl: null, queriedAt };
}

export async function verifyDayReservations(day, env = process.env, fetcher = fetch) {
  const attractions = day.stops.filter(stop => stop.kind !== 'entertainment');
  const queriedAt = now();
  if (!env.TAVILY_API_KEY || !attractions.length) return { ...day, stops: day.stops.map(stop => stop.kind === 'entertainment' ? stop : { ...stop, reservation: reservationEvidence(stop.name, [], queriedAt) }) };
  let results = [];
  try {
    const response = await fetcher('https://api.tavily.com/search', {
      method: 'POST', signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `site:gov.cn ${day.city} ${attractions.map(stop => stop.name).join(' ')} 预约 官方`, search_depth: 'advanced', include_domains: ['gov.cn'], max_results: 10, include_answer: false }),
    });
    if (response.ok) results = (await response.json()).results || [];
  } catch { /* A missing official result remains explicit instead of blocking planning. */ }
  return { ...day, stops: day.stops.map(stop => stop.kind === 'entertainment' ? stop : { ...stop, reservation: reservationEvidence(stop.name, results, queriedAt) }) };
}

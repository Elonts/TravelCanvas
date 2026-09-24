import { z } from 'zod';

const noteUrl = z.string().url().max(2000).refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.xiaohongshu.com' && /^\/(?:explore|discovery\/item)\/[A-Za-z0-9_-]+/.test(url.pathname);
  } catch { return false; }
}, '只接受小红书公开笔记链接');

export const xhsSessionSchema = z.object({
  discoveryId: z.string().uuid(), city: z.string().trim().min(2).max(60), category: z.enum(['attractions', 'food']),
  query: z.string().trim().min(2).max(200), queriedAt: z.string().datetime({ offset: true }),
  results: z.array(z.object({
    title: z.string().trim().min(1).max(200), snippet: z.string().trim().max(500).default(''), url: noteUrl,
    author: z.string().trim().max(80).nullable().default(null), rank: z.number().int().min(1).max(20),
    visibleLikes: z.number().int().min(0).max(1000000000).nullable().default(null),
    publishedAt: z.string().trim().max(40).nullable().default(null),
  }).strict()).max(20),
}).strict().transform(value => ({ ...value, results: value.results.filter((item, index, all) => all.findIndex(other => other.url === item.url) === index).slice(0, 20) }));

export function sessionHeatScore(evidence) {
  const sources = new Map();
  for (const item of evidence || []) {
    if (item.sourceKind !== 'xhs_session') continue;
    const current = sources.get(item.sourceId);
    if (!current || (item.visibleLikes || 0) > (current.visibleLikes || 0)) sources.set(item.sourceId, item);
  }
  return [...sources.values()].reduce((score, item) => score + Math.max(0, 21 - (item.searchRank || 20)) * 4 + Math.min(40, Math.log10((item.visibleLikes || 0) + 1) * 10), 0);
}

export type InternalGuideSource = {
  id: string; city: string; rank: number; title: string; url: string; content: string;
  contentState: 'full' | 'summary'; relevance: number | null;
  publishedAt: string | null; queriedAt: string;
};
export type GuideInsight = { sourceId: string; placeName: string; quote: string; advice: string };
export type GuideFoodInsight = { sourceId: string; placeName: string; quote: string; dishes: string[] };
export type GuideSearchStats = { searched: number; kept: number; duplicate: number; invalid: number };
export type GuideSearchCode = 'not_configured' | 'unauthorized' | 'rate_limited' | 'quota_exceeded' | 'timeout' | 'provider_error' | 'irrelevant' | null;
export function searchTravelGuides(city: string, preferences?: string, constraints?: string, env?: NodeJS.ProcessEnv, fetcher?: typeof fetch, corePlaces?: string[]): Promise<{ sources: InternalGuideSource[]; state: 'live' | 'pending'; warning: string | null; code: GuideSearchCode; attempts: number; retryable: boolean; queriedAt: string; stats?: GuideSearchStats; cached?: boolean }>;
export function isGuideRelevant(city: string, row: { title?: string; content?: string }): boolean;
export function readPublicGuideBodies(sources: InternalGuideSource[], env?: NodeJS.ProcessEnv): Promise<Map<string, string>>;
export function enrichGuideBodies(sources: InternalGuideSource[], reader?: (sources: InternalGuideSource[]) => Promise<Map<string, string>>): Promise<InternalGuideSource[]>;
export function validateGuideInsights(raw: unknown, sources: InternalGuideSource[]): GuideInsight[];
export function extractGuideInsights(sources: InternalGuideSource[], env?: NodeJS.ProcessEnv, fetcher?: typeof fetch): Promise<GuideInsight[]>;
export function validateGuideFoodInsights(raw: unknown, sources: InternalGuideSource[]): GuideFoodInsight[];
export function extractGuideFoodInsights(sources: InternalGuideSource[], env?: NodeJS.ProcessEnv, fetcher?: typeof fetch): Promise<GuideFoodInsight[]>;

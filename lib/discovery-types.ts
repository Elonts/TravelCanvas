import type { TripRequest } from './plan';
import type { ImageAttribution } from './web-images.mjs';

export type DiscoveryEvidence = {
  sourceId: string; title: string; url: string | null; quote: string;
  publishedAt: string | null; queriedAt: string;
  sourceKind?: 'tavily_public' | 'xhs_session'; searchRank?: number; visibleLikes?: number | null; query?: string; author?: string | null;
  dishes?: string[];
};

export type GuideEvidence = DiscoveryEvidence & {
  city: string; rank: number; contentState: 'full' | 'summary'; advice: string; url: string;
};

export type GuideSource = {
  id: string; city: string; rank: number; title: string; url: string;
  contentState: 'full' | 'summary'; relevance: number | null;
  publishedAt: string | null; queriedAt: string;
};

export type DiscoveryCandidate = {
  id: string; poiId: string; kind: 'attraction' | 'food' | 'entertainment';
  parentPoiId?: string | null; rootPoiId?: string; scenicRole?: 'main' | 'child';
  city: string; name: string; address: string; lng: number; lat: number;
  category: string; imageUrl: string | null; imageAttribution?: ImageAttribution | null; introduction: string;
  recommendationReason: string; durationMinutes: number; estimatedCost: number | null;
  price: { low: number; high: number } | null; hours: string;
  source: string; queriedAt: string; verified: true; navigationUrl: string;
  evidence: DiscoveryEvidence[]; evidenceScore: number; featuredDishes?: string[];
  guideEvidence: GuideEvidence[]; guideScore: number;
  sessionHeatScore?: number;
  preferenceFitScore?: number; constraintWarning?: string;
};

export type DiscoveryResult = {
  discoveryId: string; expiresAt: string; request: TripRequest;
  candidates: DiscoveryCandidate[];
  guideFoodCandidates?: DiscoveryCandidate[];
  guideSources: GuideSource[];
  guideSearch: {
    state: 'idle' | 'searching' | 'live' | 'partial' | 'failed';
    code: 'not_configured' | 'unauthorized' | 'rate_limited' | 'quota_exceeded' | 'timeout' | 'provider_error' | 'irrelevant' | 'body_unavailable' | null;
    message: string; attempts: number; count: number; retryable: boolean; queriedAt: string | null;
    stats?: { searched: number; kept: number; duplicate: number; invalid: number; unrelated: number; bodyUnavailable: number };
  };
  xhsSession: {
    state: 'idle' | 'searching' | 'live' | 'partial' | 'failed'; connection: 'disconnected' | 'connected';
    count: number; kept: number; code: 'not_connected' | 'busy' | 'captcha' | 'login_required' | 'structure_changed' | 'timeout' | 'extension_error' | 'invalid_results' | null;
    message: string; queriedAt: string | null;
    cities: Record<string, { attractions: number; food: number; queriedAt: string }>;
  };
  sources: { search: 'live' | 'pending'; guides: 'live' | 'pending'; ai: 'live' | 'demo' | 'pending'; map: 'live' | 'pending'; updatedAt: string };
  warnings: string[];
};

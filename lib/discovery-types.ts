import type { TripRequest } from './plan';

export type DiscoveryEvidence = {
  sourceId: string; title: string; url: string | null; quote: string;
  publishedAt: string | null; queriedAt: string;
  dishes?: string[];
};

export type DiscoveryCandidate = {
  id: string; poiId: string; kind: 'attraction' | 'food' | 'entertainment';
  city: string; name: string; address: string; lng: number; lat: number;
  category: string; imageUrl: string | null; introduction: string;
  recommendationReason: string; durationMinutes: number; estimatedCost: number | null;
  price: { low: number; high: number } | null; hours: string;
  source: string; queriedAt: string; verified: true; navigationUrl: string;
  evidence: DiscoveryEvidence[]; evidenceScore: number; featuredDishes?: string[];
};

export type DiscoveryResult = {
  discoveryId: string; expiresAt: string; request: TripRequest;
  candidates: DiscoveryCandidate[];
  sources: { search: 'live' | 'pending'; ai: 'live' | 'demo' | 'pending'; map: 'live' | 'pending'; updatedAt: string };
  warnings: string[];
};

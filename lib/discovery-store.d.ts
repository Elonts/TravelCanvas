import type { DiscoveryCandidate } from './discovery-types';
import type { TripRequest } from './plan';
export class DiscoveryStore {
  entries: Map<string, unknown>;
  constructor(options?: { ttl?: number; limit?: number; clock?: () => number });
  save(value: { request: TripRequest; candidates: DiscoveryCandidate[]; sources: unknown; warnings: string[] }): unknown;
  select(discoveryId: string, selectedIds: string[]): { request: TripRequest; candidates: DiscoveryCandidate[]; sources: unknown; warnings: string[] };
}
export const discoveryStore: DiscoveryStore;

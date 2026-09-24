import type { DiscoveryCandidate, GuideSource } from './discovery-types';
import type { TripRequest } from './plan';
export class DiscoveryStore {
  entries: Map<string, unknown>;
  constructor(options?: { ttl?: number; limit?: number; clock?: () => number });
  save(value: { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] }): unknown;
  select(discoveryId: string, selectedIds: string[]): { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] };
  get(discoveryId: string): { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] };
  replace(discoveryId: string, value: unknown): unknown;
}
export const discoveryStore: DiscoveryStore;

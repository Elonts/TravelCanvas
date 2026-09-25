import type { DiscoveryCandidate, GuideSource } from './discovery-types';
import type { TripRequest } from './plan';
export class DiscoveryStore {
  entries: Map<string, unknown>;
  constructor(options?: { ttl?: number; limit?: number; clock?: () => number });
  save(value: { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] }): unknown;
  select(discoveryId: string, selectedIds: string[]): { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] };
  get(discoveryId: string): { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] };
  getVersioned(discoveryId: string): { value: { request: TripRequest; candidates: DiscoveryCandidate[]; guideSources?: GuideSource[]; sources: unknown; warnings: string[] }; version: number; expiresAt: number };
  replace(discoveryId: string, value: unknown, expectedVersion?: number | null): unknown;
}
export const discoveryStore: DiscoveryStore;

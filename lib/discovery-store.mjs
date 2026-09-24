import { randomUUID } from 'node:crypto';

export class DiscoveryStore {
  constructor({ ttl = 30 * 60 * 1000, limit = 20, clock = Date.now } = {}) {
    this.ttl = ttl; this.limit = limit; this.clock = clock; this.entries = new Map();
  }
  save(value) {
    this.cleanup();
    while (this.entries.size >= this.limit) this.entries.delete(this.entries.keys().next().value);
    const discoveryId = randomUUID(), expiresAt = this.clock() + this.ttl;
    this.entries.set(discoveryId, { value: structuredClone(value), expiresAt });
    return { ...structuredClone(value), discoveryId, expiresAt: new Date(expiresAt).toISOString() };
  }
  select(discoveryId, selectedIds) {
    this.cleanup();
    const entry = this.entries.get(discoveryId);
    if (!entry) throw Error('候选已过期，请重新发现地点');
    const ids = new Set(selectedIds);
    const candidates = entry.value.candidates.filter(candidate => ids.has(candidate.id));
    if (candidates.length !== ids.size) throw Error('包含无效候选，请重新选择');
    const missingCity = entry.value.request.destinations.find(city => !candidates.some(candidate => candidate.city === city && candidate.kind === 'attraction'));
    if (missingCity) throw Error(`${missingCity}至少选择一个景区`);
    return { ...structuredClone(entry.value), candidates };
  }
  get(discoveryId) {
    this.cleanup();
    const entry = this.entries.get(discoveryId);
    if (!entry) throw Error('候选已过期，请重新发现地点');
    return structuredClone(entry.value);
  }
  append(discoveryId, candidates, warnings = []) {
    this.cleanup();
    const entry = this.entries.get(discoveryId);
    if (!entry) throw Error('候选已过期，请重新发现地点');
    const existing = new Set(entry.value.candidates.map(candidate => candidate.id));
    entry.value.candidates.push(...structuredClone(candidates.filter(candidate => !existing.has(candidate.id))));
    entry.value.warnings = [...new Set([...(entry.value.warnings || []), ...warnings])];
    entry.value.sources.updatedAt = new Date(this.clock()).toISOString();
    return { ...structuredClone(entry.value), discoveryId, expiresAt: new Date(entry.expiresAt).toISOString() };
  }
  replace(discoveryId, value) {
    this.cleanup();
    const entry = this.entries.get(discoveryId);
    if (!entry) throw Error('候选已过期，请重新发现地点');
    entry.value = structuredClone(value);
    return { ...structuredClone(entry.value), discoveryId, expiresAt: new Date(entry.expiresAt).toISOString() };
  }
  cleanup() {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= this.clock()) this.entries.delete(id);
  }
}

const symbol = Symbol.for('travelcanvas.discovery-store');
export const discoveryStore = globalThis[symbol] ||= new DiscoveryStore();

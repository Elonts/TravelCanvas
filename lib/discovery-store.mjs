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
    const selectedCandidates = entry.value.candidates.filter(candidate => ids.has(candidate.id));
    if (selectedCandidates.length !== ids.size) throw Error('包含无效候选，请重新选择');
    const seenCandidates = new Set();
    const candidates = selectedCandidates.filter(candidate => {
      const exactKey = candidate.poiId
        ? `${candidate.kind}:${candidate.city}:${candidate.poiId}`
        : `${candidate.kind}:${candidate.city}:${normalizePlaceName(candidate.name)}`;
      if (seenCandidates.has(exactKey)) return false;
      seenCandidates.add(exactKey);
      return true;
    });
    const scenicRoots = new Map();
    for (const candidate of candidates.filter(item => item.kind === 'attraction' && item.rootPoiId)) {
      const existing = scenicRoots.get(candidate.rootPoiId);
      if (existing && normalizePlaceName(existing.name) !== normalizePlaceName(candidate.name)) {
        throw Error(`景区选择冲突：“${existing.name}”与“${candidate.name}”属于同一主景区，请只保留一个`);
      }
      scenicRoots.set(candidate.rootPoiId, candidate);
    }
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

function normalizePlaceName(value) {
  return String(value || '').replace(/[\s\-—_·()（）]/g, '').toLowerCase();
}

const symbol = Symbol.for('travelcanvas.discovery-store');
export const discoveryStore = globalThis[symbol] ||= new DiscoveryStore();

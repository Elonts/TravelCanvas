import { randomUUID } from 'node:crypto';
import { discoveryStore as localDiscoveryStore } from './discovery-store.mjs';
import { changeStoredPlan, planStore as localPlanStore } from './plan-store.mjs';

const ttlMs = 30 * 60 * 1000;
const cloudflare = () => process.env.TRAVELCANVAS_PLATFORM === 'cloudflare';
const remote = () => import('./cloudflare-state-client');

async function readRemoteState<T>(kind: string, id: string, expiredMessage: string) {
  try {
    return await (await remote()).readState<T>(kind, id);
  } catch (error) {
    if (error instanceof Error && error.message.includes('状态已过期')) throw Error(expiredMessage);
    throw error;
  }
}

type DiscoveryRecord = {
  request: any; candidates: any[]; guideSources: any[]; guideFoodCandidates?: any[];
  guideSearch: any; xhsSession: any; sources: any; warnings: string[];
};
type VersionedDiscovery = { value: DiscoveryRecord; version: number; expiresAt: number };

function selectedDiscovery(value: DiscoveryRecord, selectedIds: string[]) {
  const ids = new Set(selectedIds);
  const selectedCandidates = value.candidates.filter(candidate => ids.has(candidate.id));
  if (selectedCandidates.length !== ids.size) throw Error('包含无效候选，请重新选择');
  const seenCandidates = new Set<string>();
  const candidates = selectedCandidates.filter(candidate => {
    const name = String(candidate.name || '').replace(/[\s\-—_·()（）]/g, '').toLowerCase();
    const key = candidate.poiId ? `${candidate.kind}:${candidate.city}:${candidate.poiId}` : `${candidate.kind}:${candidate.city}:${name}`;
    if (seenCandidates.has(key)) return false;
    seenCandidates.add(key); return true;
  });
  const scenicRoots = new Map<string, any>();
  for (const candidate of candidates.filter(item => item.kind === 'attraction' && item.rootPoiId)) {
    const rootPoiId = String(candidate.rootPoiId);
    const existing = scenicRoots.get(rootPoiId);
    if (existing && String(existing.name).replace(/[\s\-—_·()（）]/g, '').toLowerCase() !== String(candidate.name).replace(/[\s\-—_·()（）]/g, '').toLowerCase()) {
      throw Error(`景区选择冲突：“${existing.name}”与“${candidate.name}”属于同一主景区，请只保留一个`);
    }
    scenicRoots.set(rootPoiId, candidate);
  }
  const missingCity = value.request.destinations.find((city: string) => !candidates.some(candidate => candidate.city === city && candidate.kind === 'attraction'));
  if (missingCity) throw Error(`${missingCity}至少选择一个景区`);
  return { ...structuredClone(value), candidates };
}

export const runtimeDiscoveryStore = {
  async save(value: DiscoveryRecord) {
    if (!cloudflare()) return localDiscoveryStore.save(value) as any;
    const discoveryId = randomUUID();
    const record = await (await remote()).writeState('discovery', discoveryId, value, { ttlMs, expectedVersion: 0 });
    return { ...structuredClone(value), discoveryId, expiresAt: new Date(record.expiresAt).toISOString() };
  },
  async getVersioned(discoveryId: string): Promise<VersionedDiscovery> {
    if (!cloudflare()) return localDiscoveryStore.getVersioned(discoveryId) as VersionedDiscovery;
    return readRemoteState<DiscoveryRecord>('discovery', discoveryId, '候选已过期，请重新发现');
  },
  async get(discoveryId: string) { return (await this.getVersioned(discoveryId)).value; },
  async select(discoveryId: string, selectedIds: string[]) {
    if (!cloudflare()) return localDiscoveryStore.select(discoveryId, selectedIds);
    return selectedDiscovery((await this.getVersioned(discoveryId)).value, selectedIds);
  },
  async append(discoveryId: string, candidates: any[], warnings: string[]) {
    if (!cloudflare()) return localDiscoveryStore.append(discoveryId, candidates, warnings) as any;
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await this.getVersioned(discoveryId);
      const existing = new Set(current.value.candidates.map(candidate => candidate.id));
      const value = structuredClone(current.value);
      value.candidates.push(...structuredClone(candidates.filter(candidate => !existing.has(candidate.id))));
      value.warnings = [...new Set([...(value.warnings || []), ...warnings])];
      value.sources.updatedAt = new Date().toISOString();
      try {
        const record = await (await remote()).writeState('discovery', discoveryId, value, { ttlMs, expectedVersion: current.version });
        return { ...value, discoveryId, expiresAt: new Date(record.expiresAt).toISOString() };
      } catch (error) { if (attempt || !(error instanceof Error) || !error.message.includes('已变更')) throw error; }
    }
    throw Error('候选内容已变更，请重试');
  },
  async replace(discoveryId: string, value: DiscoveryRecord, expectedVersion?: number) {
    if (!cloudflare()) return localDiscoveryStore.replace(discoveryId, value, expectedVersion ?? null) as any;
    const record = await (await remote()).writeState('discovery', discoveryId, value, { ttlMs, expectedVersion });
    return { ...structuredClone(value), discoveryId, expiresAt: new Date(record.expiresAt).toISOString() };
  },
};

export const runtimePlanStore = {
  async save(plan: any) {
    if (!cloudflare()) return localPlanStore.save(plan);
    const planId = randomUUID();
    const saved = { ...structuredClone(plan), planId, revision: 0 };
    await (await remote()).writeState('plan', planId, saved, { ttlMs, expectedVersion: 0 });
    return saved;
  },
  async get(planId: string, revision: number) {
    if (!cloudflare()) return localPlanStore.get(planId, revision);
    const plan = (await readRemoteState<any>('plan', planId, '方案已过期，请重新生成')).value;
    if (plan.revision !== revision) throw Error('方案版本已变更，请刷新后再调整');
    return plan;
  },
  async change(input: { planId: string; revision: number; mealId: string; action: string; restaurantId?: string }) {
    if (!cloudflare()) return localPlanStore.change(input);
    const plan = await this.get(input.planId, input.revision);
    const updated = changeStoredPlan(plan, { mealId: input.mealId, action: input.action, restaurantId: input.restaurantId });
    return (await (await remote()).writeState('plan', input.planId, updated, { ttlMs, expectedValueRevision: input.revision })).value;
  },
  async replace(planId: string, revision: number, plan: any) {
    if (!cloudflare()) return localPlanStore.replace(planId, revision, plan);
    const updated = { ...structuredClone(plan), planId, revision: revision + 1 };
    return (await (await remote()).writeState('plan', planId, updated, { ttlMs, expectedValueRevision: revision })).value;
  },
};

const localRates = new Map<string, { count: number; resetAt: number }>();

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowMs = 10 * 60 * 1000) {
  if (process.env.TRAVELCANVAS_TEST_MODE) return null;
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const key = `${scope}:${Array.from(new Uint8Array(digest).slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  let result: { allowed: boolean; remaining: number; retryAfter: number };
  if (cloudflare()) result = await (await remote()).checkRemoteRateLimit(key, limit, windowMs);
  else {
    const now = Date.now(); const current = localRates.get(key);
    const record = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    result = record.count >= limit
      ? { allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) }
      : { allowed: true, remaining: limit - ++record.count, retryAfter: 0 };
    localRates.set(key, record);
  }
  return result.allowed ? null : Response.json({ error: '请求过于频繁，请稍后重试。' }, { status: 429, headers: { 'Retry-After': String(result.retryAfter), 'Cache-Control': 'no-store' } });
}

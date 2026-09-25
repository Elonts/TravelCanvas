import { env } from 'cloudflare:workers';

export type StateRecord<T> = { value: T; expiresAt: number; version: number };

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw Error(body.error || `状态服务失败（${response.status}）`);
  return body as T;
}

const stub = (kind: string, id: string) => env.TRAVEL_STATE.getByName(`${kind}:${id}`);

export async function readState<T>(kind: string, id: string) {
  return responseJson<StateRecord<T>>(await stub(kind, id).fetch('https://state.internal/record'));
}

export async function writeState<T>(kind: string, id: string, value: T, options: { ttlMs?: number; expectedVersion?: number; expectedValueRevision?: number } = {}) {
  return responseJson<StateRecord<T>>(await stub(kind, id).fetch('https://state.internal/record', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, ttlMs: options.ttlMs || 30 * 60 * 1000, expectedVersion: options.expectedVersion, expectedValueRevision: options.expectedValueRevision }),
  }));
}

export async function checkRemoteRateLimit(key: string, limit: number, windowMs: number) {
  const response = await stub('rate', key).fetch('https://state.internal/rate-limit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit, windowMs }),
  });
  const result = await response.json() as { allowed: boolean; remaining: number; retryAfter: number };
  return { ...result, allowed: response.ok && result.allowed };
}

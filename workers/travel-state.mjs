const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });

export class TravelState {
  constructor(state) { this.state = state; }

  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/record' && request.method === 'GET') return this.readRecord();
    if (pathname === '/record' && request.method === 'PUT') return this.writeRecord(request);
    if (pathname === '/rate-limit' && request.method === 'POST') return this.rateLimit(request);
    return new Response('Not found', { status: 404 });
  }

  async alarm() { await this.state.storage.deleteAll(); }

  async readRecord() {
    const record = await this.state.storage.get('record');
    if (!record || record.expiresAt <= Date.now()) {
      if (record) await this.state.storage.deleteAll();
      return json({ error: '状态已过期' }, 404);
    }
    return json(record, 200, { 'Cache-Control': 'no-store' });
  }

  async writeRecord(request) {
    const input = await request.json();
    const ttlMs = Math.min(60 * 60 * 1000, Math.max(60_000, Number(input.ttlMs) || 30 * 60 * 1000));
    const current = await this.state.storage.get('record');
    const active = current && current.expiresAt > Date.now() ? current : undefined;
    if (input.expectedVersion !== undefined && (active?.version || 0) !== input.expectedVersion) {
      return json({ error: '状态已变更，请重试' }, 409);
    }
    if (input.expectedValueRevision !== undefined && active?.value?.revision !== input.expectedValueRevision) {
      return json({ error: '方案版本已变更，请刷新后再调整' }, 409);
    }
    const record = { value: input.value, expiresAt: Date.now() + ttlMs, version: (active?.version || 0) + 1 };
    await this.state.storage.put('record', record);
    await this.state.storage.setAlarm(record.expiresAt);
    return json(record, 200, { 'Cache-Control': 'no-store' });
  }

  async rateLimit(request) {
    const input = await request.json();
    const limit = Math.min(200, Math.max(1, Number(input.limit) || 10));
    const windowMs = Math.min(24 * 60 * 60 * 1000, Math.max(60_000, Number(input.windowMs) || 10 * 60 * 1000));
    const now = Date.now();
    const current = await this.state.storage.get('rate');
    const record = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    if (record.count >= limit) return json({ allowed: false, remaining: 0, retryAfter: Math.max(1, Math.ceil((record.resetAt - now) / 1000)) }, 429);
    record.count++;
    await this.state.storage.put('rate', record);
    await this.state.storage.setAlarm(record.resetAt);
    return json({ allowed: true, remaining: Math.max(0, limit - record.count), retryAfter: 0 });
  }
}

export default { fetch: () => new Response('TravelCanvas internal state service', { status: 404 }) };

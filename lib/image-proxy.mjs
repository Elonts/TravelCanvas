const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export class ImageProxyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function readBoundedBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new ImageProxyError('too_large');
  if (!response.body) throw new ImageProxyError('unavailable');

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ImageProxyError('too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function proxyImage(source, options = {}) {
  const fetcher = options.fetcher || fetch;
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const upstream = await fetcher(source, {
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs || 8000),
    headers: { Accept: 'image/avif,image/webp,image/*' },
  });
  const contentType = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !contentType.startsWith('image/')) throw new ImageProxyError('unavailable');
  const bytes = await readBoundedBody(upstream, maxBytes);
  return new Response(bytes, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': options.cacheControl || 'public, max-age=1800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function proxyFirstAvailableImage(sources, options = {}) {
  let lastError;
  for (const source of sources) {
    try { return await proxyImage(source, options); }
    catch (error) { lastError = error; }
  }
  throw lastError || new ImageProxyError('unavailable');
}

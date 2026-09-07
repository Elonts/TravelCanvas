const allowedSuffixes = ['.autonavi.com', '.amap.com'];

export function safeAmapImageUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase();
    if (!allowedSuffixes.some(suffix => hostname.endsWith(suffix)) || hostname === 'autonavi.com' || hostname === 'amap.com') return null;
    url.protocol = 'https:';
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

export function proxiedAmapImageUrl(value) {
  const safe = safeAmapImageUrl(value);
  return safe ? `/api/poi-image?url=${encodeURIComponent(safe)}` : null;
}

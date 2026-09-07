export function parsePlaceNames(value, limit = 12) {
  const seen = new Set();
  return String(value || '')
    .split(/[、，,;；\n\r]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 2 && item.length <= 100)
    .filter(item => {
      const key = item.replace(/[\s（）()·]/g, '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

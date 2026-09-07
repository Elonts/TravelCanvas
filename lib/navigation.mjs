const transportMode = { walk: 'walk', transit: 'bus', drive: 'car' };

export function amapNavigationUrl(place, transport = 'transit') {
  if (!place || !Number.isFinite(place.lng) || !Number.isFinite(place.lat) || place.lng < 73 || place.lng > 135 || place.lat < 18 || place.lat > 54) return null;
  const query = new URLSearchParams({ to: `${place.lng},${place.lat},${String(place.name || '目的地').slice(0, 100)}`, mode: transportMode[transport] || 'bus', policy: '1', src: 'travelcanvas', coordinate: 'gaode', callnative: '1' });
  return `https://uri.amap.com/navigation?${query.toString()}`;
}

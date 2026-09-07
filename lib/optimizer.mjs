const distance = (a, b) => {
  const radians = (a.lat + b.lat) * Math.PI / 360;
  const dx = (a.lng - b.lng) * Math.cos(radians);
  const dy = a.lat - b.lat;
  return dx * dx + dy * dy;
};

/** Nearest-neighbour ordering from a known origin reduces obvious backtracking.
 * @template {{lng: number, lat: number}} T
 * @param {T[]} stops
 * @param {{lng: number, lat: number} | null} origin
 * @returns {T[]}
 */
export function orderStops(stops, origin = null) {
  if (stops.length < 2) return stops.slice();
  const remaining = stops.slice();
  const ordered = [];
  if (!origin) ordered.push(remaining.shift());
  while (remaining.length) {
    const last = ordered.at(-1) || origin;
    let index = 0;
    let best = Infinity;
    remaining.forEach((candidate, i) => {
      const score = distance(last, candidate);
      if (score < best) { best = score; index = i; }
    });
    ordered.push(remaining.splice(index, 1)[0]);
  }
  return ordered;
}

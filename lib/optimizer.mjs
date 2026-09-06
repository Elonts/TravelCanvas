export function orderStops(stops) {
  if (stops.length < 3) return stops;
  const remaining = stops.slice(1);
  const ordered = [stops[0]];
  while (remaining.length) {
    const last = ordered.at(-1);
    let index = 0;
    let best = Infinity;
    remaining.forEach((candidate, i) => {
      const dx = last.lng - candidate.lng;
      const dy = last.lat - candidate.lat;
      const distance = dx * dx + dy * dy;
      if (distance < best) { best = distance; index = i; }
    });
    ordered.push(remaining.splice(index, 1)[0]);
  }
  return ordered;
}

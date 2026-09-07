/** Build a serializable, chronological point list for the client-side route map.
 * @returns {import('./plan').RoutePoint[]}
 */
export function createRoutePoints(origin, request, days, food) {
  const points = [];
  if (origin) points.push({ id: 'origin', name: request.origin, city: request.origin, date: request.startDate, time: '出发', kind: /** @type {const} */ ('origin'), lng: origin.lng, lat: origin.lat, verified: origin.verified });
  days.forEach((day, dayIndex) => day.stops.forEach(stop => {
    points.push({ id: `stop:${day.date}:${stop.id}`, name: stop.name, city: day.city, date: day.date, time: stop.time, kind: /** @type {const} */ ('attraction'), lng: stop.lng, lat: stop.lat, verified: stop.verified });
    food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).sort((a, b) => a.slot.earliest - b.slot.earliest).forEach(meal => {
      const selected = meal.options.find(option => option.restaurant.id === meal.selectedId)?.restaurant;
      if (selected) points.push({ id: `meal:${meal.slot.id}`, name: selected.name, city: day.city, date: day.date, time: meal.slot.label, kind: /** @type {const} */ ('restaurant'), lng: selected.lng, lat: selected.lat, verified: true });
    });
  }));
  return points.filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat) && point.lng !== 0 && point.lat !== 0).map((point, index) => ({ ...point, order: index + 1 }));
}

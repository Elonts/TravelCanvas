/** Build a serializable, chronological point list for the client-side route map.
 * @returns {import('./plan').RoutePoint[]}
 */
export function createRoutePoints(origin, request, days, food) {
  const points = [];
  if (origin) points.push({ id: 'origin', name: request.origin, city: request.origin, date: request.startDate, time: '出发', kind: /** @type {const} */ ('origin'), address: origin.address || request.origin, introduction: '本次旅行出发地', imageUrl: null, navigationUrl: null, lng: origin.lng, lat: origin.lat, verified: origin.verified });
  const hotelPoint = (hotel, day, position) => ({ id: `hotel:${day.date}:${position}:${hotel.poiId}`, name: hotel.name, city: day.city, date: day.date, time: position === 'start' ? '08:30' : '22:30', kind: /** @type {const} */ ('hotel'), address: hotel.address, introduction: position === 'start' ? '已预订酒店 · 当天从这里出发' : '已预订酒店 · 当天行程终点', imageUrl: null, navigationUrl: hotel.navigationUrl || null, lng: hotel.lng, lat: hotel.lat, verified: true, poiId: hotel.poiId });
  days.forEach((day, dayIndex) => {
    if (day.startHotel) points.push(hotelPoint(day.startHotel, day, 'start'));
    day.stops.forEach(stop => {
    points.push({ id: `stop:${day.date}:${stop.id}`, name: stop.name, city: day.city, date: day.date, time: stop.time, kind: stop.kind === 'entertainment' ? /** @type {const} */ ('entertainment') : /** @type {const} */ ('attraction'), address: stop.address, introduction: stop.detail, imageUrl: stop.imageUrl || null, imageAttribution: stop.imageAttribution || null, navigationUrl: stop.navigationUrl || null, lng: stop.lng, lat: stop.lat, verified: stop.verified, poiId: stop.poiId });
    food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).sort((a, b) => a.slot.earliest - b.slot.earliest).forEach(meal => {
      const selected = meal.options.find(option => option.restaurant.id === meal.selectedId)?.restaurant;
      if (selected) points.push({ id: `meal:${meal.slot.id}`, name: selected.name, city: day.city, date: day.date, time: meal.slot.label, kind: /** @type {const} */ ('restaurant'), address: selected.address, introduction: `${selected.category}${selected.featuredDishes?.length ? `；招牌/特色菜线索：${selected.featuredDishes.join('、')}` : '；菜品线索待确认'}`, imageUrl: selected.imageUrl || null, imageAttribution: selected.imageAttribution || null, navigationUrl: selected.navigationUrl || null, lng: selected.lng, lat: selected.lat, verified: true, poiId: selected.id });
    });
    });
    if (day.endHotel) points.push(hotelPoint(day.endHotel, day, 'end'));
  });
  return points.filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat) && point.lng !== 0 && point.lat !== 0).map((point, index) => ({ ...point, order: index + 1 }));
}

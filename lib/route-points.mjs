/** Build a serializable, chronological point list for the client-side route map.
 * @returns {import('./plan').RoutePoint[]}
 */
export function createRoutePoints(origin, request, days, food) {
  const points = [];
  if (origin) points.push({ id: 'origin', name: request.origin, city: request.origin, date: request.startDate, time: '出发', kind: /** @type {const} */ ('origin'), address: origin.address || request.origin, introduction: '本次旅行出发地', imageUrl: null, navigationUrl: null, lng: origin.lng, lat: origin.lat, verified: origin.verified });
  const hotelPoint = (hotel, day, position) => ({ id: `hotel:${day.date}:${position}:${hotel.poiId}`, name: hotel.name, city: day.city, date: day.date, time: position === 'start' ? '08:30' : position === 'arrival' ? day.arrivalHotelTime || '抵达后' : day.endHotelTime || '返程', kind: /** @type {const} */ ('hotel'), address: hotel.address, introduction: position === 'start' ? '已预订酒店 · 当天从这里出发' : position === 'arrival' ? '已预订酒店 · 先办理入住或寄存行李，再开始游览' : '已预订酒店 · 当天行程终点', imageUrl: null, navigationUrl: hotel.navigationUrl || null, lng: hotel.lng, lat: hotel.lat, verified: true, poiId: hotel.poiId });
  const hubPoint = (hub, day, position) => ({ id: `hub:${day.date}:${position}:${hub.poiId}`, name: hub.name, city: day.city, date: day.date, time: hub.time ? new Date(hub.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : position === 'start' ? '抵达' : '出发', kind: hub.kind, address: hub.address, introduction: `${hub.kind === 'airport' ? '机场' : '车站'} · ${position === 'start' ? '当天行程起点' : '跨城行程出发点'}${hub.tripNo ? ` · ${hub.tripNo}` : ''}`, imageUrl: null, navigationUrl: hub.navigationUrl || null, lng: hub.lng, lat: hub.lat, verified: true, poiId: hub.poiId });
  days.forEach((day, dayIndex) => {
    if (day.startHub) points.push(hubPoint(day.startHub, day, 'start'));
    if (day.startHotel) points.push(hotelPoint(day.startHotel, day, 'start'));
    if (day.arrivalHotel && day.startHub) points.push(hotelPoint(day.arrivalHotel, day, 'arrival'));
    day.stops.forEach(stop => {
    points.push({ id: `stop:${day.date}:${stop.id}`, name: stop.name, city: day.city, date: day.date, time: stop.time, kind: stop.kind === 'entertainment' ? /** @type {const} */ ('entertainment') : /** @type {const} */ ('attraction'), address: stop.address, introduction: stop.detail, imageUrl: stop.imageUrl || null, imageAttribution: stop.imageAttribution || null, navigationUrl: stop.navigationUrl || null, lng: stop.lng, lat: stop.lat, verified: stop.verified, poiId: stop.poiId });
    food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).sort((a, b) => a.slot.earliest - b.slot.earliest).forEach(meal => {
      const selected = meal.options.find(option => option.restaurant.id === meal.selectedId)?.restaurant;
      if (selected) points.push({ id: `meal:${meal.slot.id}`, name: selected.name, city: day.city, date: day.date, time: meal.slot.label, kind: /** @type {const} */ ('restaurant'), address: selected.address, introduction: `${selected.category}${selected.featuredDishes?.length ? `；招牌/特色菜线索：${selected.featuredDishes.join('、')}` : '；菜品线索待确认'}`, imageUrl: selected.imageUrl || null, imageAttribution: selected.imageAttribution || null, navigationUrl: selected.navigationUrl || null, lng: selected.lng, lat: selected.lat, verified: true, poiId: selected.id });
    });
    });
    if (day.endHotel) points.push(hotelPoint(day.endHotel, day, 'end'));
    if (day.endHub) points.push(hubPoint(day.endHub, day, 'end'));
  });
  return points.filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat) && point.lng !== 0 && point.lat !== 0).map((point, index) => ({ ...point, order: index + 1 }));
}

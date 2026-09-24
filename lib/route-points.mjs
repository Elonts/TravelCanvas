/** Build a serializable, chronological point list for the client-side route map.
 * @returns {import('./plan').RoutePoint[]}
 */
export function createRoutePoints(origin, request, days, food) {
  const points = [];
  if (origin) points.push({ id: 'origin', name: request.origin, city: request.origin, date: request.startDate, time: '出发', kind: /** @type {const} */ ('origin'), address: origin.address || request.origin, introduction: '本次旅行出发地', imageUrl: null, navigationUrl: null, lng: origin.lng, lat: origin.lat, verified: origin.verified });
  const hotelPoint = (hotel, day, position) => ({ id: `hotel:${day.date}:${position}:${hotel.poiId}`, name: hotel.name, city: day.city, date: day.date, time: position === 'start' ? '08:30' : position === 'arrival' ? day.arrivalHotelTime || '抵达后' : day.endHotelTime || '返程', kind: /** @type {const} */ ('hotel'), hotelRole: position, address: hotel.address, introduction: position === 'start' ? '已预订酒店 · 当天从这里出发' : position === 'arrival' ? '已预订酒店 · 先办理入住或寄存行李，再开始游览' : '已预订酒店 · 当天行程终点', imageUrl: null, navigationUrl: hotel.navigationUrl || null, lng: hotel.lng, lat: hotel.lat, verified: true, poiId: hotel.poiId });
  const hubPoint = (hub, day, position) => ({ id: `hub:${day.date}:${position}:${hub.poiId}`, name: hub.name, city: day.city, date: day.date, time: hub.time ? new Date(hub.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : position === 'start' ? '抵达' : '出发', kind: hub.kind, address: hub.address, introduction: `${hub.kind === 'airport' ? '机场' : '车站'} · ${position === 'start' ? '当天行程起点' : '跨城行程出发点'}${hub.tripNo ? ` · ${hub.tripNo}` : ''}`, imageUrl: null, navigationUrl: hub.navigationUrl || null, lng: hub.lng, lat: hub.lat, verified: true, poiId: hub.poiId });
  const stopPoint = (stop, day) => ({ id: `stop:${day.date}:${stop.id}`, name: stop.name, city: day.city, date: day.date, time: stop.time, kind: stop.kind === 'entertainment' ? /** @type {const} */ ('entertainment') : /** @type {const} */ ('attraction'), address: stop.address, introduction: stop.detail, imageUrl: stop.imageUrl || null, imageAttribution: stop.imageAttribution || null, navigationUrl: stop.navigationUrl || null, lng: stop.lng, lat: stop.lat, verified: stop.verified, poiId: stop.poiId });
  days.forEach((day, dayIndex) => {
    const entertainment = day.stops.filter(stop => stop.kind === 'entertainment');
    const placedEntertainment = new Set();
    const pushEntertainment = (anchorPointId, position) => entertainment.filter(stop => stop.anchorPointId === anchorPointId && stop.position === position).forEach(stop => { points.push(stopPoint(stop, day)); placedEntertainment.add(stop.id); });
    if (day.startHub) points.push(hubPoint(day.startHub, day, 'start'));
    if (day.startHotel) { const point = hotelPoint(day.startHotel, day, 'start'); points.push(point); pushEntertainment(point.id, 'after'); }
    if (day.arrivalHotel) { const point = hotelPoint(day.arrivalHotel, day, 'arrival'); points.push(point); pushEntertainment(point.id, 'after'); }
    day.stops.filter(stop => stop.kind !== 'entertainment').forEach(stop => {
    const point = stopPoint(stop, day); pushEntertainment(point.id, 'before'); points.push(point); pushEntertainment(point.id, 'after');
    food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).sort((a, b) => a.slot.earliest - b.slot.earliest).forEach(meal => {
      const selected = meal.options.find(option => option.restaurant.id === meal.selectedId)?.restaurant;
      if (selected) { const mealPoint = { id: `meal:${meal.slot.id}`, name: selected.name, city: day.city, date: day.date, time: meal.slot.label, kind: /** @type {const} */ ('restaurant'), address: selected.address, introduction: `${selected.category}${selected.featuredDishes?.length ? `；招牌/特色菜线索：${selected.featuredDishes.join('、')}` : '；菜品线索待确认'}`, imageUrl: selected.imageUrl || null, imageAttribution: selected.imageAttribution || null, navigationUrl: selected.navigationUrl || null, lng: selected.lng, lat: selected.lat, verified: true, poiId: selected.id }; pushEntertainment(mealPoint.id, 'before'); points.push(mealPoint); pushEntertainment(mealPoint.id, 'after'); }
    });
    });
    if (day.endHotel) { const point = hotelPoint(day.endHotel, day, 'end'); pushEntertainment(point.id, 'before'); points.push(point); }
    if (day.endHub) points.push(hubPoint(day.endHub, day, 'end'));
    if (placedEntertainment.size !== entertainment.length) throw Error(`${day.date} 有娱乐活动没有找到对应行程锚点，请重新选择安排位置`);
  });
  const located = points.filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat) && point.lng !== 0 && point.lat !== 0).map((point, index) => ({ ...point, order: index + 1 }));
  for (const day of days) {
    for (const [role, hotel] of [['start', day.startHotel], ['arrival', day.arrivalHotel], ['end', day.endHotel]]) {
      if (hotel && !located.some(point => point.date === day.date && point.kind === 'hotel' && point.hotelRole === role && point.poiId === hotel.poiId)) throw Error(`${day.date} 的已预订酒店没有进入路线${role === 'start' ? '起点' : role === 'arrival' ? '到达节点' : '终点'}，请重新核验酒店位置`);
    }
  }
  return located;
}

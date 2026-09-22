export function attachHotelAnchors(days, hotels, orderStops) {
  return days.map(day => {
    const cityHotels = hotels.filter(hotel => hotel.city === day.city);
    const startHotel = cityHotels.find(hotel => hotel.checkIn < day.date && hotel.checkOut >= day.date) || null;
    const endHotel = cityHotels.find(hotel => hotel.checkIn <= day.date && hotel.checkOut > day.date) || null;
    return { ...day, startHotel, endHotel, stops: orderStops(day.stops, startHotel || null) };
  });
}

export async function verifyBookedHotels(request, map) {
  if (!request.bookedHotels?.length) return [];
  if (!map) throw Error('已添加预订酒店，但高德服务未配置，无法核验酒店位置');
  const verified = [];
  for (const hotel of request.bookedHotels) {
    const place = hotel.poiId ? await map.poi(hotel.poiId, 'hotel') : await map.hotel(hotel.name, hotel.city, hotel.addressHint || '');
    if (!place) throw Error(`没有准确找到已预订酒店“${hotel.name}”，请补充完整酒店名或地址`);
    verified.push({ ...hotel, ...place, id: `hotel-${place.poiId}`, verified: true });
  }
  return verified;
}

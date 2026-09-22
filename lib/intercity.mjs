const minutesBetween = (from, to) => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60000));

export async function verifyIntercityLegs(request, map) {
  if (!request.intercityLegs?.length) return [];
  const verified = [];
  for (const leg of request.intercityLegs) {
    if (leg.mode === 'drive') {
      verified.push({ ...leg, departureHub: null, arrivalHub: null });
      continue;
    }
    if (!map) throw Error('已设置跨城车站或机场，但高德服务未配置，无法核验站点');
    const expectedKind = leg.mode === 'flight' ? 'airport' : 'station';
    const [departureHub, arrivalHub] = await Promise.all([
      map.poi(leg.departureHub.poiId, expectedKind), map.poi(leg.arrivalHub.poiId, expectedKind),
    ]);
    if (!departureHub || !arrivalHub) throw Error(`${leg.fromCity}到${leg.toCity}的站点无法核验，请重新选择`);
    verified.push({ ...leg, departureHub, arrivalHub });
  }
  return verified;
}

export function attachIntercityAnchors(days, legs) {
  return days.map(day => ({ ...day }));
}

export function anchorIntercityDays(days, legs) {
  const next = days.map(day => ({ ...day }));
  for (const leg of legs) {
    if (leg.arrivalHub) {
      const first = next.find(day => day.city === leg.toCity);
      if (first) first.startHub = { ...leg.arrivalHub, city: leg.toCity, kind: leg.mode === 'flight' ? 'airport' : 'station', time: leg.arrivalAt, tripNo: leg.tripNo };
    }
    if (leg.departureHub) {
      const last = [...next].reverse().find(day => day.city === leg.fromCity);
      if (last) last.endHub = { ...leg.departureHub, city: leg.fromCity, kind: leg.mode === 'flight' ? 'airport' : 'station', time: leg.departureAt, tripNo: leg.tripNo };
    }
  }
  return next;
}

export async function buildIntercityTransfers(request, legs, map, cityLocations) {
  const transfers = [];
  for (const leg of legs) {
    if (leg.mode === 'drive') {
      const from = cityLocations.get(leg.fromCity), to = cityLocations.get(leg.toCity);
      const route = from && to && map ? await map.route(from, to, 'drive', leg.fromCity, leg.toCity) : { from: leg.fromCity, to: leg.toCity, minutes: null, meters: null, fare: null, state: 'pending', queriedAt: new Date().toISOString(), error: '跨城自驾地点待核验' };
      transfers.push({ ...route, mode: leg.mode, transport: 'drive', departureAt: leg.departureAt || null, arrivalAt: leg.arrivalAt || null, tripNo: '' });
      continue;
    }
    transfers.push({ from: leg.departureHub.name, to: leg.arrivalHub.name, minutes: minutesBetween(leg.departureAt, leg.arrivalAt), meters: null, fare: null, state: 'pending', queriedAt: new Date().toISOString(), error: '班次和票价由用户提供，出发前请再次确认', mode: leg.mode, transport: 'transit', departureAt: leg.departureAt, arrivalAt: leg.arrivalAt, tripNo: leg.tripNo || '' });
  }
  return transfers;
}

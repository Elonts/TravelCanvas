const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Insert entertainment next to the chosen route point, then move flexible stops forward as one timeline. */
export function scheduleEntertainmentByAnchors(attractions, entertainment, anchors, availableFrom = 540, mustFinishBy = 1290) {
  const groups = new Map();
  for (const stop of entertainment) {
    if (!anchors.some(anchor => anchor.id === stop.anchorPointId)) throw Error('所选娱乐活动锚点已失效，请重新选择行程地点');
    const key = `${stop.anchorPointId}:${stop.position}`;
    groups.set(key, [...(groups.get(key) || []), stop]);
  }
  const attractionById = new Map(attractions.map(stop => [stop.id, { ...stop }]));
  const scheduled = [];
  let cursor = availableFrom;
  let hasVisitedContent = false;
  const addEntertainment = (anchor, position) => {
    const items = groups.get(`${anchor.id}:${position}`) || [];
    for (const item of items) {
      if (anchor.hotelRole === 'end' && position === 'after') throw Error('返程酒店必须是当天终点，娱乐活动只能安排在它之前');
      cursor += Math.max(0, item.insertionExtraMinutes || 0);
      scheduled.push({ ...item, time: clock(cursor) });
      cursor += item.durationMinutes || 90;
      hasVisitedContent = true;
    }
  };

  for (const anchor of anchors) {
    if (anchor.hotelRole === 'start' || anchor.hotelRole === 'arrival') {
      if ((groups.get(`${anchor.id}:before`) || []).length) throw Error(`无法把娱乐活动安排在当天起点“${anchor.name}”之前`);
      cursor = Math.max(cursor, anchor.end);
      addEntertainment(anchor, 'after');
      continue;
    }
    if (anchor.hotelRole === 'end') {
      addEntertainment(anchor, 'before');
      if (hasVisitedContent) cursor += 30;
      if (cursor > mustFinishBy) throw Error(`所选娱乐活动加入后无法在 ${clock(mustFinishBy)} 前返回“${anchor.name}”`);
      continue;
    }
    if (hasVisitedContent) cursor += 15;
    addEntertainment(anchor, 'before');
    const attraction = anchor.stopId ? attractionById.get(anchor.stopId) : null;
    if (attraction) {
      scheduled.push({ ...attraction, time: clock(cursor) });
      cursor += attraction.durationMinutes || Math.max(30, anchor.end - anchor.start);
      attractionById.delete(anchor.stopId);
    } else {
      cursor += Math.max(30, anchor.end - anchor.start);
    }
    hasVisitedContent = true;
    addEntertainment(anchor, 'after');
  }
  for (const attraction of attractionById.values()) {
    if (hasVisitedContent) cursor += 15;
    scheduled.push({ ...attraction, time: clock(cursor) });
    cursor += attraction.durationMinutes || 90;
    hasVisitedContent = true;
  }
  if (cursor > mustFinishBy) throw Error(`所选娱乐活动加入后超出当天结束时间 ${clock(mustFinishBy)}，请更换锚点或减少活动`);
  return scheduled.sort((a, b) => a.time.localeCompare(b.time));
}

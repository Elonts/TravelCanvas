export const entertainmentPeriodRanges = { morning: { start: 540, end: 720 }, afternoon: { start: 810, end: 1080 }, evening: { start: 1140, end: 1380 } };
const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function scheduleDay(attractions, entertainment) {
  const fixed = [];
  for (const period of ['morning', 'afternoon', 'evening']) {
    const items = entertainment.filter(stop => stop.period === period).sort((a, b) => (a.routeMeters ?? Infinity) - (b.routeMeters ?? Infinity));
    let cursor = entertainmentPeriodRanges[period].start;
    for (const stop of items) {
      const end = cursor + (stop.durationMinutes || 90);
      if (end > entertainmentPeriodRanges[period].end) throw Error(`${period === 'morning' ? '上午' : period === 'afternoon' ? '下午' : '晚上'}时间段无法容纳所选娱乐活动，请减少活动或改选时间段`);
      fixed.push({ start: cursor, end, stop: { ...stop, time: time(cursor) } }); cursor = end;
    }
  }
  const events = [...fixed];
  for (const attraction of attractions) {
    const duration = attraction.durationMinutes || 90;
    let cursor = 540;
    for (const event of events.slice().sort((a, b) => a.start - b.start)) {
      if (cursor + duration <= event.start) break;
      if (cursor < event.end) cursor = event.end + 30;
    }
    if (cursor + duration > 1380) throw Error('当天时间无法容纳全部已选景点和娱乐活动，请调整娱乐时间段或减少地点');
    events.push({ start: cursor, end: cursor + duration, stop: { ...attraction, time: time(cursor) } });
  }
  return events.sort((a, b) => a.start - b.start).map(event => event.stop);
}

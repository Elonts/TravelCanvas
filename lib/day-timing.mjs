const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function shanghaiDateTime(value) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const bufferFor = hub => hub?.kind === 'airport' ? 45 : 15;
const departureBufferFor = hub => hub?.kind === 'airport' ? 90 : 30;

async function minutesFor(map, from, to, transport, city, fallback, issues) {
  if (!from || !to) return 0;
  if (!map) {
    issues.push(`${from.name}到${to.name}的路线暂不可用，暂按 ${fallback} 分钟预留，出发前需重新确认。`);
    return fallback;
  }
  const route = await map.route(from, to, transport, city);
  if (route.state === 'live' && Number.isFinite(route.minutes)) return route.minutes;
  issues.push(`${from.name}到${to.name}的路线暂不可用，暂按 ${fallback} 分钟预留，出发前需重新确认。`);
  return fallback;
}

export async function scheduleAnchoredDays(days, request, map) {
  const next = days.map(day => ({ ...day, stops: [...day.stops], scheduleIssues: [] }));
  const spill = new Map();
  for (let index = 0; index < next.length; index++) {
    const day = next[index], issues = day.scheduleIssues;
    const carried = spill.get(day.city) || [];
    if (carried.length) { day.stops = [...carried, ...day.stops]; spill.set(day.city, []); issues.push(`${carried.length} 个景点因前一日可用时间不足顺延至本日。`); }
    let current = day.startHotel ? 8 * 60 + 30 : 9 * 60;
    let anchor = day.startHotel || null;
    if (day.startHub) {
      const arrival = shanghaiDateTime(day.startHub.time);
      if (arrival.date !== day.date) throw Error(`${day.startHub.name}的预计到达日期为 ${arrival.date}，与${day.city}首日 ${day.date} 不一致，请修改跨城到达时间。`);
      const connectionBuffer = bufferFor(day.startHub);
      current = arrival.minutes + connectionBuffer;
      issues.push(`${day.startHub.kind === 'airport' ? '飞机' : '铁路'}抵达后预留 ${connectionBuffer} 分钟出站衔接。`);
      anchor = day.startHub;
      if (day.arrivalHotel) {
        current += await minutesFor(map, day.startHub, day.arrivalHotel, request.transport, day.city, 60, issues);
        day.arrivalHotelTime = clock(current);
        current += 30;
        issues.push('抵达酒店后预留 30 分钟办理入住或寄存行李。');
        anchor = day.arrivalHotel;
      }
    }
    day.availableFrom = clock(current);
    let deadline = 21 * 60 + 30;
    if (day.endHub?.time) {
      const departure = shanghaiDateTime(day.endHub.time);
      if (departure.date !== day.date) throw Error(`${day.endHub.name}的预计出发日期为 ${departure.date}，与${day.city}末日 ${day.date} 不一致，请修改跨城出发时间。`);
      deadline = departure.minutes - departureBufferFor(day.endHub);
    }
    day.mustFinishBy = clock(Math.max(0, deadline));
    const scheduled = [], deferred = [];
    for (const stop of day.stops) {
      const travel = await minutesFor(map, anchor, stop, request.transport, day.city, 30, issues);
      const start = current + travel, finish = start + (stop.durationMinutes || 90);
      const endTravel = day.endHub ? await minutesFor(map, stop, day.endHub, request.transport, day.city, 45, issues) : day.endHotel ? await minutesFor(map, stop, day.endHotel, request.transport, day.city, 30, issues) : 0;
      if (finish + endTravel > deadline) { deferred.push(stop); continue; }
      scheduled.push({ ...stop, time: clock(start) });
      current = finish; anchor = stop;
    }
    if (deferred.length) {
      const later = next.slice(index + 1).find(candidate => candidate.city === day.city);
      if (!later) throw Error(`${day.date} 从 ${day.availableFrom} 开始，无法在 ${day.mustFinishBy} 前容纳：${deferred.map(stop => stop.name).join('、')}。请增加天数、提前到达或减少景点。`);
      spill.set(day.city, [...(spill.get(day.city) || []), ...deferred]);
      issues.push(`${deferred.map(stop => stop.name).join('、')}无法在当天时间窗内容纳，已顺延。`);
    }
    day.stops = scheduled;
    if (day.endHotel && anchor) {
      current += await minutesFor(map, anchor, day.endHotel, request.transport, day.city, 30, issues);
      day.endHotelTime = clock(current);
    }
  }
  return next;
}

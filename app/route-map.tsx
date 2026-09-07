'use client';

import { useMemo, useState } from 'react';
import type { RouteOverview, RoutePoint } from '../lib/plan';

const colors = ['#226054', '#df7255', '#557a95', '#8c6a9e', '#b08b36', '#397d68', '#9b5848', '#536d8c', '#8a7044', '#6b6f3f'];
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN');

export function RouteMap({ route }: { route: RouteOverview }) {
  const dates = [...new Set(route.points.filter(point => point.kind !== 'origin').map(point => point.date))];
  const [date, setDate] = useState('all');
  const [zoom, setZoom] = useState(1);
  const [activeId, setActiveId] = useState(route.points[0]?.id || '');
  const points = useMemo(() => route.points.filter(point => date === 'all' || point.date === date), [route.points, date]);
  const projected = useMemo(() => project(points), [points]);
  const active = route.points.find(point => point.id === activeId) || points[0];
  const size = 1000 / zoom;
  const offset = (1000 - size) / 2;

  return <section className="route-map card">
    <div className="map-title"><div><span className="eyebrow">交互式路线图 · {route.source}</span><h3>{route.cityOrder.join(' → ')}</h3></div><div className="map-controls"><button type="button" className="secondary" onClick={() => setZoom(value => Math.max(1, value - .5))} aria-label="缩小地图">−</button><b>{zoom.toFixed(1)}×</b><button type="button" className="secondary" onClick={() => setZoom(value => Math.min(3, value + .5))} aria-label="放大地图">＋</button></div></div>
    <div className="map-days"><button type="button" className={date === 'all' ? 'active' : 'secondary'} onClick={() => { setDate('all'); setZoom(1); }}>全程</button>{dates.map((item, index) => <button type="button" key={item} className={date === item ? 'active' : 'secondary'} onClick={() => { setDate(item); setZoom(1); }}>第 {index + 1} 天</button>)}</div>
    {projected.length ? <div className="map-stage">
      <svg viewBox={`${offset} ${offset / 1.9} ${size} ${size / 1.9}`} role="img" aria-label="按时间顺序连接的旅行路线图">
        <defs><pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M 80 0 L 0 0 0 80" fill="none" stroke="#d8ded7" strokeWidth="1" /></pattern></defs>
        <rect width="1000" height="530" rx="24" fill="#edf2ed" /><rect width="1000" height="530" rx="24" fill="url(#grid)" />
        {projected.length > 1 && <polyline points={projected.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#8ba59b" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="12 10" />}
        {projected.map(point => <g key={point.id} className={`map-marker ${activeId === point.id ? 'selected' : ''}`} transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={`${point.order} ${point.name}`} onClick={() => setActiveId(point.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') setActiveId(point.id); }}>
          <circle r="22" fill={point.kind === 'origin' ? '#18322e' : colors[Math.max(0, dates.indexOf(point.date)) % colors.length]} /><circle r="27" fill="none" stroke="white" strokeWidth="3" />
          <text textAnchor="middle" dominantBaseline="central">{point.order}</text>
          <title>{point.order}. {point.name}</title>
        </g>)}
      </svg>
      {active && <div className="map-popover"><b><span>{active.order}</span>{active.name}</b><p>{active.city} · {active.date} · {active.time}</p><small>{active.kind === 'origin' ? '出发地' : active.kind === 'restaurant' ? '餐厅' : '行程地点'} · {active.verified ? '位置已校验' : '位置待确认'}</small></div>}
    </div> : <p className="map-empty">当前没有可显示的已定位地点，请配置高德服务或更换目的地后重试。</p>}
    {!!points.length && <div className="map-point-list" aria-label="路线地点顺序">{points.map(point => <button type="button" key={point.id} className={activeId === point.id ? 'active' : 'secondary'} onClick={() => setActiveId(point.id)}><span>{point.order}</span>{point.name}</button>)}</div>}
    <div className="map-legend"><span><i className="origin-dot" />出发地</span><span><i />景点 / 餐厅</span><span>点击序号查看地点；使用日期按钮筛选路线</span></div>
    {!!route.transfers.length && <div className="transfer-list"><b>跨城衔接（按当前查询估算）</b>{route.transfers.map((leg, index) => <p key={`${leg.from}-${leg.to}-${index}`}>{leg.from} → {leg.to} · {leg.state === 'live' ? `约 ${leg.minutes} 分钟 / ${Math.round((leg.meters || 0) / 1000)} 公里` : '路线待确认'} · {leg.transport === 'drive' ? '驾车' : '公共交通'}</p>)}</div>}
    <p className="map-note">{route.note} 数据来源：{route.source}；查询时间：{stamp(route.queriedAt)}。</p>
  </section>;
}

function project(points: RoutePoint[]) {
  if (!points.length) return [];
  const lngs = points.map(point => point.lng), lats = points.map(point => point.lat);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs), minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const lngSpan = Math.max(maxLng - minLng, .02), latSpan = Math.max(maxLat - minLat, .02);
  const placed: { x: number; y: number }[] = [];
  return points.map(point => {
    let x = 70 + (point.lng - minLng) / lngSpan * 860;
    let y = 460 - (point.lat - minLat) / latSpan * 390;
    const overlaps = placed.filter(other => Math.hypot(other.x - x, other.y - y) < 42).length;
    if (overlaps) {
      const angle = overlaps * 2.4;
      const radius = 34 * Math.ceil(overlaps / 5);
      x = Math.min(955, Math.max(45, x + Math.cos(angle) * radius));
      y = Math.min(485, Math.max(45, y + Math.sin(angle) * radius));
    }
    placed.push({ x, y });
    return { ...point, x, y };
  });
}

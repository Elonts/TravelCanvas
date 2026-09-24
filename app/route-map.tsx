'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RouteOverview } from '../lib/plan';
import { TransitDetails } from './transit-details';

declare global { interface Window { AMap?: any; _AMapSecurityConfig?: { securityJsCode: string } } }
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN');
let loader: Promise<any> | null = null;

function loadAmap() {
  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  if (!key) return Promise.reject(new Error('未配置高德 JS Key'));
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!loader) loader = new Promise((resolve, reject) => {
    const securityJsCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_JS_CODE;
    if (securityJsCode) window._AMapSecurityConfig = { securityJsCode };
    const callback = `travelCanvasMapReady_${Date.now()}`;
    (window as any)[callback] = () => { delete (window as any)[callback]; resolve(window.AMap); };
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&callback=${callback}`;
    script.onerror = () => reject(new Error('高德地图脚本加载失败'));
    document.head.appendChild(script);
  });
  return loader;
}

export function RouteMap({ route }: { route: RouteOverview }) {
  const dates = [...new Set(route.points.filter(point => point.kind !== 'origin').map(point => point.date))];
  const [date, setDate] = useState('all');
  const [activeId, setActiveId] = useState(route.points[0]?.id || '');
  const [mapError, setMapError] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const points = useMemo(() => route.points.filter(point => date === 'all' || (point.date === date && point.kind !== 'origin')), [route.points, date]);
  const displayOrder = useMemo(() => new Map(points.map((point, index) => [point.id, index + 1])), [points]);
  const paths = useMemo(() => route.paths.filter(path => date === 'all' || path.date === date), [route.paths, date]);
  const active = route.points.find(point => point.id === activeId) || points[0];
  const incoming = route.paths.find(path => path.toId === active?.id);

  useEffect(() => {
    let disposed = false;
    loadAmap().then(AMap => {
      if (disposed || !container.current) return;
      mapRef.current?.destroy();
      const map = new AMap.Map(container.current, { zoom: 12, mapStyle: 'amap://styles/normal', viewMode: '2D' });
      mapRef.current = map;
      const overlays: any[] = [];
      for (const path of paths) if (path.polyline?.length) overlays.push(new AMap.Polyline({ path: path.polyline, strokeColor: '#226054', strokeWeight: 7, strokeOpacity: .86, showDir: true }));
      for (const point of points) {
        const special = point.kind === 'hotel' ? 'hotel' : point.kind === 'station' || point.kind === 'airport' ? 'hub' : '';
        const order = displayOrder.get(point.id) || point.order;
        const marker = new AMap.Marker({ position: [point.lng, point.lat], title: point.name, content: `<button class="amap-order-marker ${special}" aria-label="行程第 ${order} 站，${point.name}"><span>${order}</span></button>`, offset: new AMap.Pixel(-18, -36) });
        marker.on('click', () => setActiveId(point.id)); overlays.push(marker);
      }
      map.add(overlays);
      if (overlays.length) map.setFitView(overlays, false, [70, 50, 70, 50], 15);
      setMapError('');
    }).catch(error => { if (!disposed) setMapError(error instanceof Error ? error.message : '地图加载失败'); });
    return () => { disposed = true; mapRef.current?.destroy(); mapRef.current = null; };
  }, [date, displayOrder, paths, points]);

  return <section className="route-map card">
    <div className="map-title"><div><span className="eyebrow">交互式真实路线图 · {route.source}</span><h3>{route.cityOrder.join(' → ')}</h3></div></div>
    <div className="map-days"><button type="button" className={date === 'all' ? 'active' : 'secondary'} onClick={() => setDate('all')}>全程</button>{dates.map((item, index) => <button type="button" key={item} className={date === item ? 'active' : 'secondary'} onClick={() => setDate(item)}>第 {index + 1} 天</button>)}</div>
    <div className="map-stage"><div ref={container} className="amap-container" aria-label="高德交互式行程路线图" />
      {mapError && <div className="map-fallback"><b>真实地图暂未加载</b><p>{mapError}。请配置浏览器端受域名限制的高德 JS Key；地点顺序仍可在下方查看。</p></div>}
      {active && <div className="map-popover"><div className="map-place-detail">{active.imageUrl && <img src={active.imageUrl} alt={`${active.name}地点图片`} />}<div><b><span>{displayOrder.get(active.id) || active.order}</span>{active.name}</b><p>{active.city} · {active.date} · {active.time}</p><p>{active.introduction}</p><small>{active.address}<br />{incoming?.state === 'live' ? `上一站到这里：约 ${incoming.minutes} 分钟 / ${Math.round((incoming.meters || 0) / 100) / 10} 公里` : incoming ? `交通距离待确认：${incoming.error || '路线服务未返回结果'}` : '行程起点'}</small>{active.imageAttribution && <small>图片：{active.imageAttribution.sourceUrl ? <a href={active.imageAttribution.sourceUrl} target="_blank" rel="noreferrer">{active.imageAttribution.label} ↗</a> : active.imageAttribution.label}</small>}{active.navigationUrl && <a className="nav-link" href={active.navigationUrl} target="_blank" rel="noreferrer">在高德查看 / 导航 →</a>}</div></div></div>}
    </div>
    {!!points.length && <div className="map-point-list" aria-label="路线地点顺序">{points.map(point => <button type="button" key={point.id} className={activeId === point.id ? 'active' : 'secondary'} onClick={() => setActiveId(point.id)}><span>{displayOrder.get(point.id) || point.order}</span>{point.name}</button>)}</div>}
    {route.paths.some(path => path.transport === 'transit') && <div className="transit-leg-list"><b>逐段公共交通指引</b>{route.paths.filter(path => (date === 'all' || path.date === date) && path.transport === 'transit').map((path, index) => <details key={`${path.fromId}-${path.toId}-${index}`}><summary>{path.from} → {path.to} · {path.minutes === null ? '路线待确认' : `约 ${path.minutes} 分钟`}</summary><TransitDetails leg={path} /><a className="nav-link" href="https://ditu.amap.com/" target="_blank" rel="noreferrer">在高德确认实时方案 →</a></details>)}</div>}
    <div className="map-legend"><span><i className="origin-dot" />出发地</span><span><i />景点 / 餐厅 / 娱乐</span><span><i className="hotel-dot" />已预订酒店</span><span>点击地图序号或下方地点按钮查看图片、介绍和交通距离</span></div>
    {!!route.transfers.length && <div className="transfer-list"><b>跨城衔接</b>{route.transfers.map((leg, index) => <p key={`${leg.from}-${leg.to}-${index}`}>{leg.from} → {leg.to} · {leg.mode === 'drive' ? leg.state === 'live' ? `自驾约 ${leg.minutes} 分钟 / ${Math.round((leg.meters || 0) / 1000)} 公里` : `自驾待确认：${leg.error || '路线未返回'}` : `${{ high_speed_rail: '高铁', train: '普通火车', flight: '飞机' }[leg.mode]}${leg.tripNo ? ` ${leg.tripNo}` : ''} · ${leg.departureAt ? new Date(leg.departureAt).toLocaleString('zh-CN') : '出发时间待确认'} → ${leg.arrivalAt ? new Date(leg.arrivalAt).toLocaleString('zh-CN') : '到达时间待确认'} · 用户提供，出发前确认`}</p>)}</div>}
    <p className="map-note">{route.note} 数据来源：{route.source}；查询时间：{stamp(route.queriedAt)}。</p>
  </section>;
}

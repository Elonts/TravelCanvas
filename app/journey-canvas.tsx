'use client';

import type { CSSProperties } from 'react';
import type { DiscoveryResult } from '../lib/discovery-types';
import type { Plan } from '../lib/plan';
import { RouteMap } from './route-map';

function MapPinIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" /><circle cx="12" cy="10" r="2.2" /></svg>;
}

function CompassIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z" /></svg>;
}

function normalizePoints(discovery: DiscoveryResult, selectedIds: string[]) {
  const chosen = discovery.candidates.filter(candidate => selectedIds.includes(candidate.id));
  const candidates = (chosen.length ? chosen : discovery.candidates).slice(0, 7);
  if (!candidates.length) return [];
  const lngs = candidates.map(candidate => candidate.lng);
  const lats = candidates.map(candidate => candidate.lat);
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  return candidates.map((candidate, index) => ({
    ...candidate,
    selected: selectedIds.includes(candidate.id),
    style: {
      '--pin-x': `${18 + ((candidate.lng - minLng) / Math.max(maxLng - minLng, .001)) * 64}%`,
      '--pin-y': `${18 + ((maxLat - candidate.lat) / Math.max(maxLat - minLat, .001)) * 56}%`,
      '--pin-delay': `${index * 55}ms`
    } as CSSProperties
  }));
}

export function JourneyCanvas({ destinations, discovery, selectedIds, plan, loading }: {
  destinations: string[];
  discovery: DiscoveryResult | null;
  selectedIds: string[];
  plan: Plan | null;
  loading: boolean;
}) {
  if (plan) return <div className="journey-live" data-state="plan"><RouteMap route={plan.route} /></div>;

  const points = discovery ? normalizePoints(discovery, selectedIds) : [];
  const state = discovery ? 'discovery' : 'idle';
  const sourceStamp = discovery ? new Date(discovery.sources.updatedAt).toLocaleString('zh-CN') : null;

  return <section className="journey-preview" data-state={state} aria-label={discovery ? '已核验候选地点概览' : '行程地图预览'} aria-busy={loading}>
    <div className="journey-preview-head">
      <div><span>{discovery ? '候选地点概览' : '路线将在这里展开'}</span><h2>{destinations.length ? destinations.join(' → ') : '选择目的地'}</h2></div>
      <span className={`canvas-status ${loading ? 'is-loading' : ''}`}><i />{loading ? '正在查询' : discovery ? `${selectedIds.length} 个已选择` : '等待规划'}</span>
    </div>
    <div className="journey-map-art" aria-hidden="true">
      <svg className="map-geometry" viewBox="0 0 800 720" preserveAspectRatio="none">
        <path className="water-shape" d="M432 74c78 48 133 117 122 208-10 80-97 91-126 155-31 68 7 133-63 211-52 58-137 37-164-25-27-61 27-119 66-165 44-52 69-87 56-156-17-89 11-181 109-228Z" />
        <path className="terrain-shape" d="M0 74c108 2 151 43 205 105 48 56 88 46 132 8 39-34 62-105 132-141L0 0Z" />
        <g className="map-streets">
          <path d="M-20 170C142 126 250 219 388 184s263-88 454-13" />
          <path d="M-20 316c180-36 281 26 395 14 153-17 255-109 465-75" />
          <path d="M-20 514c123-69 267-62 400-23 169 50 301 0 458-58" />
          <path d="M118-20c14 127-20 244 18 362 39 123 25 235-24 398" />
          <path d="M644-20c-44 156-22 279 33 389 45 92 36 208-1 371" />
          <path d="M304-20c43 104 19 194-22 274-57 112-37 258 53 486" />
        </g>
      </svg>
      {!discovery && <div className="canvas-empty">
        <span><CompassIcon /></span>
        <b>先定下出发地与目的地</b>
        <p>查询完成后，这里会显示已核验地点；生成方案后再绘制真实道路路线。</p>
      </div>}
      {!!points.length && <ol className="candidate-pin-list">
        {points.map((point, index) => <li key={point.id} className={point.selected ? 'selected' : ''} style={point.style}>
          <span><MapPinIcon /><b>{index + 1}</b></span><em>{point.name}</em>
        </li>)}
      </ol>}
      {discovery && !points.length && <div className="canvas-empty"><span><CompassIcon /></span><b>暂时没有已核验地点</b><p>可在左侧批量添加地点并通过高德核验。</p></div>}
      {loading && <div className="canvas-loading" role="status"><span /><p>正在核验地点、图片与公开攻略来源…</p></div>}
    </div>
    <div className="journey-preview-foot">
      <p>{discovery ? '点位按真实坐标显示；候选阶段不连接为道路路线。' : '当前为未查询概览，不代表真实路线。'}</p>
      <small>{discovery ? `地点：${discovery.sources.map === 'live' ? '高德已核验' : '待确认'} · 查询 ${sourceStamp}` : '生成路线后显示 Provider 来源与查询时间'}</small>
    </div>
  </section>;
}

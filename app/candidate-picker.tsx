'use client';

import { useState } from 'react';
import type { DiscoveryCandidate, DiscoveryResult } from '../lib/discovery-types';
import { parsePlaceNames } from '../lib/place-input.mjs';

const labels = { attraction: '景区', food: '美食', entertainment: '娱乐' };
const icons = { attraction: '景', food: '味', entertainment: '乐' };
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN');

export function CandidatePicker({ discovery, selectedIds, busy, error, onToggle, onGenerate, onAddCustom }: {
  discovery: DiscoveryResult; selectedIds: string[]; busy: boolean; error: string;
  onToggle: (id: string) => void; onGenerate: () => void;
  onAddCustom: (city: string, kind: 'attraction' | 'food', names: string[]) => Promise<void>;
}) {
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [customError, setCustomError] = useState<Record<string, string>>({});
  const selected = new Set(selectedIds);
  const missingCities = discovery.request.destinations.filter(city => !discovery.candidates.some(candidate => candidate.city === city && candidate.kind !== 'food' && selected.has(candidate.id)));
  const chosenFood = discovery.candidates.filter(candidate => candidate.kind === 'food' && selected.has(candidate.id)).length;
  return <section className="candidate-panel panel">
    <div className="section-head"><div><span className="eyebrow">02 / 选择想去的地方</span><h2>先挑喜欢的，再安排路线</h2></div><small>候选保留到 {new Date(discovery.expiresAt).toLocaleTimeString('zh-CN')}</small></div>
    <div className="notice">候选来源：AI {discovery.sources.ai === 'live' ? '建议已生成' : '使用降级候选'} · 高德 {discovery.sources.map === 'live' ? '地点已核验' : '部分待确认'} · 旅游攻略 {discovery.sources.guides === 'live' ? '已查询' : '待确认'} · 美食笔记 {discovery.sources.search === 'live' ? '已查询' : '待确认'}。AI 推荐和帖子经验均不是已验证事实。</div>
    {!!discovery.guideSources.length && <details className="candidate-warnings guide-sources"><summary>公开搜索相关性前 8 篇（各目的地）</summary>{discovery.guideSources.map(source => <p key={source.id}><b>{source.city} · 第 {source.rank} 篇</b> · <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> · {source.contentState === 'full' ? '公开正文' : '搜索摘要'} · 查询 {stamp(source.queriedAt)}</p>)}</details>}
    {!!discovery.warnings.length && <details className="candidate-warnings"><summary>查看数据提示（{discovery.warnings.length}）</summary>{discovery.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
    {discovery.request.destinations.map(city => <section className="candidate-city" key={city}>
      <h3>{city}</h3>
      {(['attraction', 'food'] as const).map(kind => {
        const items = discovery.candidates.filter(candidate => candidate.city === city && candidate.kind === kind);
        return <div className="candidate-category" key={kind}><div className="candidate-category-title"><b>{labels[kind]}</b><span>{items.length} 个候选</span></div>
          {items.length ? <div className="candidate-grid">{items.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} checked={selected.has(candidate.id)} onToggle={onToggle} />)}</div> : <p className="candidate-empty">暂无已核验的{labels[kind]}候选。</p>}
          <CustomPlaceInput city={city} kind={kind} value={custom[`${city}:${kind}`] || ''} busy={busy} error={customError[`${city}:${kind}`] || ''}
            onChange={value => setCustom(current => ({ ...current, [`${city}:${kind}`]: value }))}
            onAdd={async names => {
              const key = `${city}:${kind}`; setCustomError(current => ({ ...current, [key]: '' }));
              try { await onAddCustom(city, kind, names); setCustom(current => ({ ...current, [key]: '' })); }
              catch (cause) { setCustomError(current => ({ ...current, [key]: cause instanceof Error ? cause.message : '地点添加失败' })); }
            }} />
        </div>;
      })}
    </section>)}
    <div className="selection-bar"><div><b>已选择 {selectedIds.length} 个地点</b><p>{missingCities.length ? `还需为 ${missingCities.join('、')} 选择至少一个景区。` : `路线基础已满足${chosenFood ? `，其中 ${chosenFood} 家餐厅会优先参与餐次筛选` : '；建议再选择感兴趣的餐厅' }。`}</p></div><button type="button" disabled={busy || !!missingCities.length || !selectedIds.length} onClick={onGenerate}>{busy ? '正在校验并生成路线…' : '用已选地点生成路线 →'}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

function CustomPlaceInput({ city, kind, value, busy, error, onChange, onAdd }: {
  city: string; kind: 'attraction' | 'food'; value: string; busy: boolean; error: string;
  onChange: (value: string) => void; onAdd: (names: string[]) => Promise<void>;
}) {
  const names = parsePlaceNames(value);
  const noun = kind === 'attraction' ? '景点' : '饭店';
  return <div className="custom-place-input">
    <label>没有想去的{noun}？批量添加
      <textarea value={value} onChange={event => onChange(event.target.value)} rows={2} maxLength={1200} placeholder={`例如：${kind === 'attraction' ? '雷峰塔、浙江省博物馆' : '楼外楼孤山店、知味观湖滨店'}（支持顿号、逗号或换行）`} />
    </label>
    <div><small>将先在高德核验具体地点；同名饭店请写清分店。</small><button type="button" className="secondary" disabled={busy || !names.length} onClick={() => onAdd(names)}>核验并加入候选{names.length ? `（${names.length}）` : ''}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

function CandidateCard({ candidate, checked, onToggle }: { candidate: DiscoveryCandidate; checked: boolean; onToggle: (id: string) => void }) {
  return <article className={`candidate-card ${checked ? 'selected' : ''}`}>
    <button type="button" className="candidate-toggle" aria-pressed={checked} onClick={() => onToggle(candidate.id)}><span>{checked ? '✓' : '+'}</span>{checked ? '已选择' : '加入行程'}</button>
    <div className="candidate-image">{candidate.imageUrl ? <img src={candidate.imageUrl} alt={`${candidate.name}的${candidate.imageAttribution?.label || '地点图片'}`} loading="lazy" /> : <span aria-label={`${labels[candidate.kind]}暂无图片`}>{icons[candidate.kind]}</span>}</div>
    <div className="candidate-content"><span className="eyebrow">{labels[candidate.kind]} · {candidate.city}</span><h4>{candidate.name}</h4><p className="candidate-address">⌖ {candidate.address}</p><p>{candidate.introduction}</p><p className="candidate-reason"><b>为什么推荐：</b>{candidate.recommendationReason}</p>
      <div className="tags"><span>建议 {candidate.durationMinutes} 分钟</span><span>{candidate.estimatedCost === null ? '费用待确认' : `参考 ¥${candidate.estimatedCost}`}</span><span>{candidate.category}</span></div>
      {candidate.constraintWarning && <p className="constraint-note">限制核对：{candidate.constraintWarning}</p>}
      {!!candidate.evidence.length && <details className="candidate-evidence"><summary>小红书公开笔记证据（{candidate.evidence.length}）</summary>{candidate.evidence.map(evidence => <div key={`${evidence.sourceId}-${evidence.quote}`}><p>“{evidence.quote}”</p><small>{evidence.url ? <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.title} ↗</a> : evidence.title} · 发布 {evidence.publishedAt || '未知'} · 查询 {stamp(evidence.queriedAt)}</small></div>)}</details>}
      {!!candidate.guideEvidence.length && <details className="candidate-evidence"><summary>旅游攻略原文证据（{candidate.guideEvidence.length}）</summary>{candidate.guideEvidence.map(evidence => <div key={`${evidence.sourceId}-${evidence.quote}`}><p>“{evidence.quote}”</p>{evidence.advice && <p><b>游览建议：</b>{evidence.advice}</p>}<small>{evidence.city} · 相关性第 {evidence.rank} 篇 · {evidence.contentState === 'full' ? '公开正文' : '搜索摘要'} · <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.title} ↗</a></small></div>)}</details>}
      {candidate.imageAttribution && <small className="candidate-source">图片：{candidate.imageAttribution.sourceUrl ? <a href={candidate.imageAttribution.sourceUrl} target="_blank" rel="noreferrer">{candidate.imageAttribution.label} ↗</a> : candidate.imageAttribution.label} · 查询 {stamp(candidate.imageAttribution.queriedAt)}</small>}
      <small className="candidate-source">地点：{candidate.source} · 查询 {stamp(candidate.queriedAt)}</small>
    </div>
  </article>;
}

'use client';

import { useState } from 'react';
import type { Plan } from '../lib/plan';
import type { EvidenceTip, FoodPlan, Meal, MealOption } from '../lib/food-types';
import { clockTime } from '../lib/food.mjs';
import { parsePlaceNames } from '../lib/place-input.mjs';
import { TransitDetails } from './transit-details';

export type MealAction = (mealId: string, action: 'lock' | 'cheaper' | 'closer' | 'select' | 'selectAndLock' | 'skip' | 'move', restaurantId?: string) => void;
export type RestaurantSearchAction = (names: string[], mealId?: string) => Promise<void>;
export type RestaurantBranchAction = (manualInput: string, restaurantId: string, mealId: string) => Promise<void>;
export type FoodBlocker = { id: string; message: string; targetId: string };
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN');
const distance = (meters: number | null) => meters === null ? '道路距离待确认' : `道路约 ${Math.round(meters / 100) / 10} 公里`;

export function SourceTip({ tip, food }: { tip: EvidenceTip; food: FoodPlan }) {
  const source = food.sources.find(s => s.id === tip.sourceId);
  if (!source) return null;
  return <div className="evidence-tip">
    <p><b>{tip.category === 'ranking' ? '榜单线索 · 待确认' : '帖子经验 · 待确认'}</b>：{tip.text}</p>
    <small>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a> : source.title}
      {' · '}{source.kind === 'search' ? '搜索摘要，非全文' : '用户提供，未核验原文'}<br />
      发布：{source.publishedAt || '未知'} · 查询：{stamp(source.queriedAt)}</small>
  </div>;
}

function RestaurantOption({ option, food, label, children }: { option: MealOption; food: FoodPlan; label: string; children?: React.ReactNode }) {
  const restaurant = option.restaurant;
  return <div className={`restaurant ${option.eligible ? '' : 'unconfirmed'}`}>
    {restaurant.imageUrl && <><img className="restaurant-image" src={restaurant.imageUrl} alt={`${restaurant.name}的${restaurant.imageAttribution?.label || '地点图片'}`} loading="lazy" />{restaurant.imageAttribution && <small className="image-source">图片：{restaurant.imageAttribution.sourceUrl ? <a href={restaurant.imageAttribution.sourceUrl} target="_blank" rel="noreferrer">{restaurant.imageAttribution.label} ↗</a> : restaurant.imageAttribution.label}</small>}</>}
    <span className="eyebrow">{label}</span>
    <h4>{restaurant.name}</h4><p className="address">{restaurant.address}</p>
    <div className="tags"><span>具体地点已核验</span><span>{restaurant.category}</span><span>{restaurant.preferred ? '用户已选择' : option.eligible ? '按参考数据满足约束' : option.canAcceptPending ? '可接受待确认后安排' : '存在明确冲突'}</span>{restaurant.tips.length > 0 && <span>公开攻略热度代理 · {new Set(restaurant.tips.map(tip => tip.sourceId)).size} 个独立来源</span>}</div>
    <p>{option.explanation}</p>
    <p><b>招牌菜 / 特色菜：</b>{restaurant.featuredDishes?.length ? restaurant.featuredDishes.join('、') : '公开笔记暂未提取到可定位菜名，建议查看菜单或向门店确认'}</p>
    <dl className="meal-facts">
      <div><dt>预计人均</dt><dd>{restaurant.price ? `¥${restaurant.price.low}–${restaurant.price.high}` : '价格待确认'}</dd></div>
      <div><dt>全员本餐</dt><dd>{option.totalHigh !== null ? `¥${option.totalLow}–${option.totalHigh}` : '预算待确认'}</dd></div>
      <div><dt>额外交通</dt><dd>{option.extraMinutes !== null ? `约 ${option.extraMinutes} 分钟` : '路线待确认'}</dd></div>
      <div><dt>新增交通费</dt><dd>{option.extraFare !== null ? `约 ¥${option.extraFare}（全员）` : '待确认'}</dd></div>
      <div><dt>用餐安排（含排队）</dt><dd>{clockTime(option.arrival)}–{clockTime(option.finish)}</dd></div>
      <div><dt>营业线索</dt><dd>{restaurant.hours || '待确认'}</dd></div>
    </dl>
    {[...option.reasons, ...option.pending].map(reason => <p className="constraint-note" key={reason}>{reason}</p>)}
    {restaurant.navigationUrl && <a className="nav-link" href={restaurant.navigationUrl} target="_blank" rel="noreferrer">在高德地图打开并导航 →</a>}
    <details><summary>查看逐段路线与数据来源</summary>
      {option.route.map((leg, i) => <div key={i}><p>{leg.from} → {leg.to}：{leg.minutes === null ? '待确认' : `约 ${leg.minutes} 分钟 / ${leg.meters} 米`} · 高德路线 · {stamp(leg.queriedAt)}</p><TransitDetails leg={leg} compact /></div>)}
      {option.direct && <p>原路线：{option.direct.from} → {option.direct.to}，{option.direct.minutes === null ? '待确认' : `约 ${option.direct.minutes} 分钟`}</p>}
      <p>{restaurant.source} · 查询于 {stamp(restaurant.queriedAt)}。人均区间按参考价格上下浮动 20% 估算，实际账单及出行日营业时间请向门店确认。</p>
    </details>
    {restaurant.tips.slice(0, 3).map(tip => <SourceTip key={`${tip.sourceId}-${tip.quote}`} tip={tip} food={food} />)}
    {children}
  </div>;
}

export function MealCard({ meal, food, busy, draftMode = false, warningAccepted = false, onWarningAccepted, onAction, onSearch }: { meal: Meal; food: FoodPlan; busy: boolean; draftMode?: boolean; warningAccepted?: boolean; onWarningAccepted?: (accepted: boolean) => void; onAction: MealAction; onSearch: RestaurantSearchAction }) {
  const [customNames, setCustomNames] = useState('');
  const parsedNames = parsePlaceNames(customNames).slice(0, 8);
  const selectedId = draftMode ? meal.draftSelectedId : meal.selectedId;
  const selected = meal.options.find(o => o.restaurant.id === selectedId);
  const used = new Set(food.meals.filter(m => m.slot.id !== meal.slot.id).map(m => draftMode ? m.draftSelectedId : m.selectedId));
  const alternatives = meal.options.filter(o => o.eligible && o.restaurant.id !== selectedId && !used.has(o.restaurant.id)).slice(0, 2);
  const pending = meal.options.filter(o => !o.eligible);
  const visibleSuggestions = !selected ? pending.filter(o => !used.has(o.restaurant.id)).slice(0, 2) : [];
  const remainingPending = pending.filter(o => !visibleSuggestions.includes(o));
  return <section id={`food-risk-${encodeURIComponent(meal.slot.id)}`} tabIndex={-1} className="meal" aria-label={`${meal.slot.date}${meal.slot.label}`}>
    <div className="meal-heading"><div><span className="eyebrow">本次行程推荐 · {meal.slot.label}</span><h3>{meal.slot.previous.name}之后，安排一顿好饭</h3></div>{meal.locked && <span className="lock-badge">已锁定</span>}</div>
    <p className="meal-context">{clockTime(meal.slot.earliest)}–{clockTime(meal.slot.latest)} · 全员本餐上限 ¥{meal.slot.foodLimit} · 新增交通预留 ¥{meal.slot.transportLimit}<br />{meal.slot.next ? `下一站：${meal.slot.next.name}（${meal.slot.next.time}）` : '当天最后一站后用餐，未计返回酒店行程'}</p>
    {selected ? <RestaurantOption option={selected} food={food} label={draftMode ? '餐厅草稿 · 尚未写入路线' : selected.restaurant.preferred ? '用户已选餐厅 · 已放入路线' : '主选餐厅'}>
      <div className="meal-actions">
        <button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'cheaper')}>更省钱</button>
        <button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'closer')}>更顺路</button>
        {draftMode ? <button type="button" className="secondary" disabled={busy} onClick={() => onAction(meal.slot.id, 'skip')}>这餐暂不安排</button> : <button type="button" className="secondary" disabled={busy} onClick={() => onAction(meal.slot.id, 'lock')}>{meal.locked ? '解锁餐厅' : '锁定这家'}</button>}
      </div>
      {draftMode && selected.reasons.length > 0 && <div className="detour-choices"><b>这家店存在明显绕路、预算或时间风险，可以：</b><button type="button" className="secondary" disabled={busy} onClick={() => onAction(meal.slot.id, 'move')}>改到更接近的一天 / 餐次</button><button type="button" className="secondary" disabled={busy} onClick={() => onAction(meal.slot.id, 'closer')}>查看附近更顺路的餐厅</button><label className="risk-confirm"><input type="checkbox" checked={warningAccepted} onChange={event => onWarningAccepted?.(event.target.checked)} />我已了解风险，仍然保留这家餐厅</label></div>}
    </RestaurantOption> : <div className="empty-meal"><b>暂未安排餐厅</b><p>{meal.options.length ? '已找到以下具体门店，但尚未同时满足所有条件。请查看费用、路线和待确认项；未选中的门店不计入已安排预算。' : '尚无已核验的门店和路线。地图查询暂不可用或该行程地点未确认，请稍后重试。'}</p></div>}
    {visibleSuggestions.map(option => <RestaurantOption key={option.restaurant.id} option={option} food={food} label={option.reasons.length ? '具体门店 · 当前条件不匹配' : '具体门店建议 · 需确认后安排'}>{option.canAcceptPending && <div className="confirmation-actions"><button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'selectAndLock', option.restaurant.id)}>了解提示，仍要选择并锁定</button></div>}</RestaurantOption>)}
    {!!alternatives.length && <details className="alternatives"><summary>备选餐厅（{alternatives.length}）</summary>{alternatives.map(option => <RestaurantOption key={option.restaurant.id} option={option} food={food} label="可选替代"><button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'select', option.restaurant.id)}>选择这家并重算</button></RestaurantOption>)}</details>}
    {!!remainingPending.length && <details className="alternatives"><summary>查看其他待确认或不符合条件的候选（{remainingPending.length}）</summary>{remainingPending.map(option => <RestaurantOption key={option.restaurant.id} option={option} food={food} label="未入选候选">{option.canAcceptPending ? <div className="confirmation-actions"><button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'selectAndLock', option.restaurant.id)}>了解提示，仍要选择并锁定</button></div> : <p className="constraint-note">存在明确饮食禁忌冲突，不能强制安排。</p>}</RestaurantOption>)}</details>}
    {!draftMode && <div className="custom-restaurant-search"><label>想指定其他餐厅？<textarea rows={2} value={customNames} onChange={event => setCustomNames(event.target.value)} placeholder="输入完整店名或分店名，多个用顿号隔开" /></label><div><small>系统会先核验具体分店，再计算插入当前餐次后的绕路、时间和预算。</small><button type="button" className="secondary" disabled={busy || !parsedNames.length} onClick={async () => { await onSearch(parsedNames, meal.slot.id); setCustomNames(''); }}>核验并重新计算{parsedNames.length ? `（${parsedNames.length}）` : ''}</button></div></div>}
  </section>;
}

const manualStatus: Record<string, string> = { needs_branch: '需要确认具体分店', scheduled_draft: '已加入餐厅草稿', needs_risk_confirmation: '已安排，需确认风险', unassigned: '暂未安排', explicitly_skipped: '已明确跳过', finalized: '已进入最终路线' };

export function FoodDraftControls({ food, busy, blockers, skippedManualInputs, onSkippedChange, onSearch, onSelectBranch, onFinalize }: { food: FoodPlan; busy: boolean; blockers: FoodBlocker[]; skippedManualInputs: Set<string>; onSkippedChange: (input: string, skipped: boolean) => void; onSearch: RestaurantSearchAction; onSelectBranch: RestaurantBranchAction; onFinalize: () => Promise<void> }) {
  const [value, setValue] = useState('');
  const [blockerAlert, setBlockerAlert] = useState('');
  const names = parsePlaceNames(value).slice(0, 8);
  const finalize = async () => {
    if (blockers.length) {
      setBlockerAlert(`还有 ${blockers.length} 项需要处理：${blockers[0].message}`);
      const target = document.getElementById(blockers[0].targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target?.focus({ preventScroll: true });
      return;
    }
    setBlockerAlert('');
    await onFinalize();
  };
  return <section className="food-draft-controls">
    <div className="custom-restaurant-search"><label>还想吃其他餐厅？可一次输入多家<textarea rows={3} value={value} onChange={event => setValue(event.target.value)} placeholder="例如：楼外楼孤山店、知味观湖滨店（支持顿号、逗号或换行）" /></label><div><small>系统会核验具体分店，并建议最顺路的日期和餐次；超过绕路上限会醒目标记。</small><button type="button" className="secondary" disabled={busy || !names.length} onClick={async () => { await onSearch(names); setValue(''); }}>核验并加入草稿{names.length ? `（${names.length}）` : ''}</button></div></div>
    {!!food.manualRestaurants?.length && <div className="manual-restaurant-status" aria-label="指定餐厅处理结果"><h3>指定餐厅处理结果</h3><p>每家餐厅都必须进入某个餐次，或由你明确跳过；系统不会再静默忽略。</p>{food.manualRestaurants.map(decision => {
      const unresolved = ['needs_branch', 'unassigned'].includes(decision.status);
      const targetId = `manual-restaurant-${encodeURIComponent(decision.input)}`;
      return <div id={targetId} tabIndex={-1} className={`manual-restaurant-row ${unresolved ? 'needs-action' : ''}`} key={decision.input}><div><b>{decision.matchedName || decision.input}</b><span>{manualStatus[decision.status] || decision.status}</span>{decision.mealLabel && <small>建议：{decision.mealLabel}{decision.extraMinutes !== null && decision.extraMinutes !== undefined ? ` · 新增约 ${decision.extraMinutes} 分钟` : ''}</small>}{decision.address && <small>{decision.address}</small>}{decision.reasons.map(reason => <small key={reason}>{reason}</small>)}{!!decision.candidates?.length && <div className="branch-candidates" aria-label={`${decision.input}的分店候选`}>{decision.candidates.map(candidate => <article className={`branch-candidate ${candidate.recommended ? 'recommended' : ''}`} key={candidate.restaurantId}>
        <div><b>{candidate.name}{candidate.recommended && <span className="lock-badge">推荐分店</span>}</b><small>{candidate.address}</small></div>
        <div className="branch-metrics"><span>{candidate.mealLabel ? `建议 ${candidate.mealLabel}` : '没有可用餐次'}</span><span>{distance(candidate.routeMeters)}</span><span>{candidate.extraMeters === null ? '新增距离待确认' : `新增 ${Math.round(candidate.extraMeters / 100) / 10} 公里`}</span><span>{candidate.extraMinutes === null ? '新增时间待确认' : `新增约 ${candidate.extraMinutes} 分钟`}</span><span>{candidate.extraFare === null ? '交通费待确认' : `新增交通约 ¥${candidate.extraFare}`}</span></div>
        {candidate.replacesRestaurantName && <small>选择后将替换：{candidate.replacesRestaurantName}</small>}
        {[...candidate.reasons, ...candidate.pending].map(reason => <small className="constraint-note" key={reason}>{reason}</small>)}
        <button type="button" className="secondary" disabled={busy || candidate.hardBlocked || !candidate.mealId} onClick={() => candidate.mealId && onSelectBranch(decision.input, candidate.restaurantId, candidate.mealId)}>{candidate.hardBlocked || !candidate.mealId ? '当前无法安排' : candidate.replacesRestaurantName ? '替换当前餐厅' : '选择这个分店'}</button>
      </article>)}</div>}</div>{unresolved && <label className="risk-confirm"><input type="checkbox" checked={skippedManualInputs.has(decision.input)} onChange={event => onSkippedChange(decision.input, event.target.checked)} />本次明确不安排</label>}</div>;
    })}</div>}
    <div className="finalize-food"><div><b>餐厅确认前，地图仍保持酒店、站点和景点基础路线</b><p>确认后才会重新计算交通、时间和预算。指定餐厅必须已安排或明确跳过。</p>{!!blockers.length && <div className="food-blockers"><b>生成前还需处理：</b><ul>{blockers.map(blocker => <li key={blocker.id}>{blocker.message}</li>)}</ul></div>}{blockerAlert && <p className="error" role="alert">{blockerAlert}</p>}</div><button type="button" disabled={busy} onClick={finalize}>{busy ? '正在生成最终路线…' : '确认餐厅并生成最终路线 →'}</button></div>
  </section>;
}

export function FoodSummary({ plan }: { plan: Plan }) {
  const summary = plan.food.summary;
  return <div className="card"><span className="eyebrow">{plan.phase === 'food_selection' ? '餐厅草稿估算 · 全员' : '餐饮预算 · 全员'}</span>
    <p className="line"><span>餐饮总分配</span><b>¥{summary.allocated}</b></p>
    <p className="line"><span>早餐与零食预留</span><b>¥{summary.breakfastReserve}</b></p>
    <p className="line"><span>已选午晚餐估算</span><b>{summary.selectedCostPending ? summary.selectedHigh > 0 ? `已知 ¥${summary.selectedLow}–${summary.selectedHigh}，另有 ${summary.selectedCostPending} 餐待确认` : `${summary.selectedCostPending} 餐价格待确认（不是 ¥0）` : `¥${summary.selectedLow}–${summary.selectedHigh}`}</b></p>
    <p className="line"><span>{summary.remaining < 0 ? '按已知价格预计超出' : '按已知价格剩余'}</span><b>{summary.remaining < 0 ? `¥${Math.abs(summary.remaining)}` : `¥${summary.remaining}`}</b></p>
    <p className="line"><span>新增交通估算</span><b>¥{summary.extraTransport}</b></p>
    <p>{!plan.food.meals.length ? '缺少可安排用餐的行程地点，请补充地点后重新生成。' : summary.unresolved ? `还有 ${summary.unresolved} 餐待安排，当前费用不是完整餐饮总价。` : '所有午晚餐已按参考数据安排；实际消费仍需确认。'} 新增交通计入交通分配，不重复加到总预算。其他交通、住宿和门票仍是预算预留。</p>
  </div>;
}

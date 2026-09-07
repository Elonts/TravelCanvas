'use client';

import type { Plan } from '../lib/plan';
import type { EvidenceTip, FoodPlan, Meal, MealOption } from '../lib/food-types';
import { clockTime } from '../lib/food.mjs';

export type MealAction = (mealId: string, action: 'lock' | 'cheaper' | 'closer' | 'select', restaurantId?: string) => void;
const stamp = (value: string) => new Date(value).toLocaleString('zh-CN');

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
    {restaurant.imageUrl && <img className="restaurant-image" src={restaurant.imageUrl} alt={`${restaurant.name}的高德地点图片`} loading="lazy" />}
    <span className="eyebrow">{label}</span>
    <h4>{restaurant.name}</h4><p className="address">{restaurant.address}</p>
    <div className="tags"><span>具体地点已核验</span><span>{restaurant.category}</span><span>{option.eligible ? '按参考数据满足约束' : '未安排 · 待确认/不符合条件'}</span></div>
    <p>{option.explanation}</p>
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
      {option.route.map((leg, i) => <p key={i}>{leg.from} → {leg.to}：{leg.minutes === null ? '待确认' : `约 ${leg.minutes} 分钟 / ${leg.meters} 米`} · 高德路线 · {stamp(leg.queriedAt)}</p>)}
      {option.direct && <p>原路线：{option.direct.from} → {option.direct.to}，{option.direct.minutes === null ? '待确认' : `约 ${option.direct.minutes} 分钟`}</p>}
      <p>{restaurant.source} · 查询于 {stamp(restaurant.queriedAt)}。人均区间按参考价格上下浮动 20% 估算，实际账单及出行日营业时间请向门店确认。</p>
    </details>
    {restaurant.tips.slice(0, 3).map(tip => <SourceTip key={`${tip.sourceId}-${tip.quote}`} tip={tip} food={food} />)}
    {children}
  </div>;
}

export function MealCard({ meal, food, busy, onAction }: { meal: Meal; food: FoodPlan; busy: boolean; onAction: MealAction }) {
  const selected = meal.options.find(o => o.restaurant.id === meal.selectedId);
  const used = new Set(food.meals.filter(m => m.slot.id !== meal.slot.id).map(m => m.selectedId));
  const alternatives = meal.options.filter(o => o.eligible && o.restaurant.id !== meal.selectedId && !used.has(o.restaurant.id)).slice(0, 2);
  const pending = meal.options.filter(o => !o.eligible);
  const visibleSuggestions = !selected ? pending.filter(o => !used.has(o.restaurant.id)).slice(0, 2) : [];
  const remainingPending = pending.filter(o => !visibleSuggestions.includes(o));
  return <section className="meal" aria-label={`${meal.slot.date}${meal.slot.label}`}>
    <div className="meal-heading"><div><span className="eyebrow">本次行程推荐 · {meal.slot.label}</span><h3>{meal.slot.previous.name}之后，安排一顿好饭</h3></div>{meal.locked && <span className="lock-badge">已锁定</span>}</div>
    <p className="meal-context">{clockTime(meal.slot.earliest)}–{clockTime(meal.slot.latest)} · 全员本餐上限 ¥{meal.slot.foodLimit} · 新增交通预留 ¥{meal.slot.transportLimit}<br />{meal.slot.next ? `下一站：${meal.slot.next.name}（${meal.slot.next.time}）` : '当天最后一站后用餐，未计返回酒店行程'}</p>
    {selected ? <RestaurantOption option={selected} food={food} label="主选餐厅">
      <div className="meal-actions">
        <button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'cheaper')}>更省钱</button>
        <button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'closer')}>更顺路</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => onAction(meal.slot.id, 'lock')}>{meal.locked ? '解锁餐厅' : '锁定这家'}</button>
      </div>
    </RestaurantOption> : <div className="empty-meal"><b>暂未安排餐厅</b><p>{meal.options.length ? '已找到以下具体门店，但尚未同时满足所有条件。请查看费用、路线和待确认项；未选中的门店不计入已安排预算。' : '尚无已核验的门店和路线。地图查询暂不可用或该行程地点未确认，请稍后重试。'}</p></div>}
    {visibleSuggestions.map(option => <RestaurantOption key={option.restaurant.id} option={option} food={food} label={option.reasons.length ? '具体门店 · 当前条件不匹配' : '具体门店建议 · 需确认后安排'} />)}
    {!!alternatives.length && <details className="alternatives"><summary>备选餐厅（{alternatives.length}）</summary>{alternatives.map(option => <RestaurantOption key={option.restaurant.id} option={option} food={food} label="可选替代"><button type="button" disabled={busy || meal.locked} onClick={() => onAction(meal.slot.id, 'select', option.restaurant.id)}>选择这家并重算</button></RestaurantOption>)}</details>}
    {!!remainingPending.length && <details className="alternatives"><summary>查看其他待确认或不符合条件的候选（{remainingPending.length}）</summary>{remainingPending.map(option => <RestaurantOption key={option.restaurant.id} option={option} food={food} label="未入选候选" />)}</details>}
  </section>;
}

export function FoodSummary({ plan }: { plan: Plan }) {
  const summary = plan.food.summary;
  return <div className="card"><span className="eyebrow">餐饮预算 · 全员</span>
    <p className="line"><span>餐饮总分配</span><b>¥{summary.allocated}</b></p>
    <p className="line"><span>早餐与零食预留</span><b>¥{summary.breakfastReserve}</b></p>
    <p className="line"><span>已选午晚餐估算</span><b>¥{summary.selectedLow}–{summary.selectedHigh}</b></p>
    <p className="line"><span>未使用餐饮分配</span><b>¥{summary.remaining}</b></p>
    <p className="line"><span>新增交通估算</span><b>¥{summary.extraTransport}</b></p>
    <p>{!plan.food.meals.length ? '缺少可安排用餐的行程地点，请补充地点后重新生成。' : summary.unresolved ? `还有 ${summary.unresolved} 餐待安排，当前费用不是完整餐饮总价。` : '所有午晚餐已按参考数据安排；实际消费仍需确认。'} 新增交通计入交通分配，不重复加到总预算。其他交通、住宿和门票仍是预算预留。</p>
  </div>;
}

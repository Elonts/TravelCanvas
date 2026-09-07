'use client';

import { FormEvent, Fragment, useState } from 'react';
import type { Plan } from '../lib/plan';
import { FoodSummary, MealCard, SourceTip, type MealAction } from './food-view';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sourceName = (state: string) => state === 'live' ? '已查询' : state === 'demo' ? '演示数据' : '待确认';

export default function Home() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [changeError, setChangeError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(''); setChangeError('');
    try {
      const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setError(e instanceof Error ? e.message : '生成失败'); } finally { setLoading(false); }
  }
  const change: MealAction = async (mealId, action, restaurantId) => {
    if (!plan || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, mealId, action, restaurantId }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(e instanceof Error ? e.message : '调整失败'); } finally { setChanging(false); }
  };
  return <main>
    <header><div className="brand">TRAVELCANVAS <span>中国旅行规划</span></div><p>路线以数据校验，灵感由 AI 生成</p></header>
    <section className="hero"><div><span className="eyebrow">可信旅行方案 · BETA</span><h1>让每一步，<em>更值得抵达。</em></h1><p>沿着想去的路线，找到合口味、少绕路的具体餐厅。把预算、用餐时间与有来源的攻略一起安排好。</p></div><aside><b>行程里，也有值得期待的一餐</b><span>✓ 具体分店与真实路线查询</span><span>✓ 全员餐饮预算与绕路约束</span><span>✓ 小红书公开笔记与来源 Tips</span><span>✓ 换店重算与餐厅锁定</span></aside></section>
    <section className="panel"><div className="section-head"><div><span className="eyebrow">01 / 旅行需求</span><h2>开始规划</h2></div><small>方案暂存 30 分钟，用于换店调整</small></div>
      <form onSubmit={submit}><div className="grid">
        <label>目的地<input required name="destination" placeholder="如：杭州" defaultValue="杭州" maxLength={60} /></label>
        <label>出发日期<input required type="date" name="startDate" defaultValue={today} /></label>
        <label>旅行天数<input required type="number" name="days" min="1" max="10" defaultValue="2" /></label>
        <label>旅行预算（元）<input required type="number" name="budget" min="500" max="1000000" defaultValue="4000" /></label>
        <label>预算口径<select name="budgetBasis"><option value="group">全员总预算</option><option value="person">人均总预算</option></select></label>
        <label>出行人数<input required type="number" name="travelers" min="1" max="8" defaultValue="2" /></label>
        <label>主要交通<select name="transport"><option value="walk">步行优先</option><option value="transit">公共交通</option><option value="drive">驾车/打车</option></select></label>
      </div>
      <label>旅行偏好<textarea name="preferences" placeholder="如：西湖、茶文化、慢节奏" maxLength={300} /></label>
      <label>旅行限制<textarea name="constraints" placeholder="如：避免高强度徒步、不安排夜间行程" maxLength={300} /></label>
      <fieldset><legend>把美食安排进路线</legend><div className="grid">
        <label>餐饮偏好<input name="foodPreferences" placeholder="如：杭帮菜、面食、清淡" maxLength={300} /></label>
        <label>饮食禁忌 / 过敏<input name="dietary" placeholder="如：不吃牛肉、花生过敏" maxLength={200} /></label>
        <label>推荐模式<select name="foodMode"><option value="route">顺路优先</option><option value="food">美食优先（仍遵守绕路上限）</option></select></label>
        <label>最多额外交通（分钟）<input type="number" required name="maxDetour" min="0" max="90" defaultValue="20" /></label>
        <label>每餐用餐时长（分钟）<input type="number" required name="mealMinutes" min="30" max="120" defaultValue="60" /></label>
        <label>排队预留（分钟）<input type="number" required name="queueMinutes" min="0" max="120" defaultValue="20" /></label>
      </div><p className="form-help">午餐与晚餐分别占正餐分配的 40% / 60%，另留餐饮预算的 20% 给早餐和零食。存在饮食禁忌时，门店需确认适配后再决定，不自动视为安全。</p></fieldset>
      <details className="note-input"><summary>补充小红书帖子（可选）</summary><p className="form-help">自动查询仅覆盖公开收录的笔记。可粘贴正文补充线索；只提供链接不能自动读取全文。帖子经验和榜单线索都会标为待确认。</p>
        <label>帖子正文<textarea name="noteText" maxLength={12000} rows={5} placeholder="粘贴包含具体分店名、点单或旅游经验的正文…" /></label>
        <div className="grid"><label>原文 / 分享链接<input name="noteUrl" type="url" placeholder="https://www.xiaohongshu.com/explore/…" maxLength={2000} /></label><label>帖子发布日期（知道时填写）<input name="noteDate" type="date" /></label></div>
      </details>
      <button disabled={loading || changing}>{loading ? '正在查询门店、路线与攻略…' : '生成旅行与美食方案  →'}</button></form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {plan && <PlanView plan={plan} busy={loading || changing} onAction={change} changeError={changeError} />}
  </main>;
}

function PlanView({ plan, busy, onAction, changeError }: { plan: Plan; busy: boolean; onAction: MealAction; changeError: string }) {
  const total = Object.values(plan.budget).reduce((a, b) => a + b, 0);
  const labels: Record<string, string> = { transport: '交通', stay: '住宿', food: '餐饮', activities: '体验', buffer: '机动金' };
  const attachedNames = new Set(plan.days.flatMap(day => day.stops.map(stop => stop.name)));
  const generalTips = plan.food.tips.filter(tip => !attachedNames.has(tip.placeName) && !plan.food.meals.some(meal => meal.options.some(o => o.restaurant.name === tip.placeName)));
  return <section className="result" aria-busy={busy}>
    <div className="section-head"><div><span className="eyebrow">02 / 旅行方案</span><h2>{plan.request.destination} · {plan.request.days} 天行程</h2></div><small>更新于 {new Date(plan.sources.updatedAt).toLocaleString('zh-CN')}</small></div>
    <div className="notice">当前数据状态：AI {sourceName(plan.sources.ai)} · 景点地图 {sourceName(plan.sources.map)} · 天气 {sourceName(plan.sources.weather)} · 酒店 {sourceName(plan.sources.hotel)} · 小红书公开检索 {sourceName(plan.food.searchState)}。演示数据不代表实时地点或价格。</div>
    {!!plan.food.warnings.length && <div className="notice">{plan.food.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    {changeError && <p className="error change-error" role="alert">{changeError}</p>}
    <div className="layout"><div>{plan.days.map((day, dayIndex) => <article className="day" key={day.date}>
      <h3>{day.title}<small>{day.date}</small></h3>
      {day.warning && <p className="notice">{day.warning}</p>}
      {day.stops.map((stop, i) => <Fragment key={`${day.date}-${stop.id}`}>
        <div className="stop"><time>{stop.time}</time><div><strong>{stop.name} {stop.verified && <i>地点已校验</i>}</strong><p className="address">⌖ {stop.address}</p><p>{stop.detail}</p><div className="tags"><span>停留 {stop.duration}</span><span>{stop.indoor ? '室内/可避雨' : '户外活动'}</span>{i > 0 && <span>景点按距离排序，未核验完整日程</span>}</div>
          {plan.food.tips.filter(tip => tip.placeName === stop.name).map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}
        </div><b>{stop.costPending ? '费用待确认' : `约 ¥${stop.cost}`}</b></div>
        {plan.food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).map(meal => <MealCard key={meal.slot.id} meal={meal} food={plan.food} busy={busy} onAction={onAction} />)}
      </Fragment>)}
    </article>)}
      {!!generalTips.length && <div className="card"><span className="eyebrow">攻略参考 · 尚未匹配具体行程地点</span>{generalTips.map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}</div>}
      {!!plan.food.sources.length && <details className="card"><summary>本次攻略来源（{plan.food.sources.length}）</summary>{plan.food.sources.map(source => <p key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title} · {source.kind === 'search' ? '搜索摘要' : '用户提供'} · 发布 {source.publishedAt || '未知'} · 查询 {new Date(source.queriedAt).toLocaleString('zh-CN')}</p>)}</details>}
    </div><aside className="sidebar">
      <FoodSummary plan={plan} />
      <div className="card weather"><span className="eyebrow">天气建议 · {sourceName(plan.weather.state)}</span><h3>{plan.weather.summary}</h3>{plan.weather.state === 'live' && <><b>{plan.weather.low}° — {plan.weather.high}°</b><p>降水概率 {plan.weather.rain}%</p></>}<p>Open-Meteo · 更新于 {new Date(plan.weather.updatedAt).toLocaleString('zh-CN')}</p></div>
      <div className="card"><span className="eyebrow">全员预算分配 · 非已核验支出</span>{Object.entries(plan.budget).map(([key, value]) => <p className="line" key={key}><span>{labels[key]}</span><b>¥{value}</b></p>)}<p className="line total"><span>合计（{plan.request.travelers} 人）</span><b>¥{total}</b></p></div>
      <HotelCards plan={plan} /><div className="card"><span className="eyebrow">出行提醒</span><ul>{plan.risks.map(r => <li key={r}>{r}</li>)}</ul></div>
    </aside></div>
  </section>;
}

function HotelCards({ plan }: { plan: Plan }) {
  return <div className="card hotels"><span className="eyebrow">住宿建议 · 非实时价格</span>{plan.hotels.map(hotel => <div className="hotel" key={hotel.id}><strong>{hotel.title}</strong><h3>{hotel.area}</h3><p>{hotel.rationale}</p><p className="hotel-filter">{hotel.filters}</p><b>{hotel.priceGuide}</b><a href={hotel.ctripUrl} target="_blank" rel="noreferrer">前往携程查询 →</a><small>查询条件：{hotel.query}</small></div>)}<p className="hotel-note">将打开携程酒店官方搜索页；请在页面中填写上述区域、日期与人数。实时房价、库存及取消规则以携程页面为准。</p></div>;
}

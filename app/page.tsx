'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import type { Plan } from '../lib/plan';
import { FoodSummary, MealCard, SourceTip, type MealAction } from './food-view';
import { CityMultiSelect } from './city-multi-select';
import { RouteMap } from './route-map';
import { CandidatePicker } from './candidate-picker';
import type { DiscoveryResult } from '../lib/discovery-types';
import { userFacingRequestError } from '../lib/client-errors.mjs';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sourceName = (state: string) => state === 'live' ? '已查询' : state === 'demo' ? '演示数据' : '待确认';

export default function Home() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [changeError, setChangeError] = useState('');
  const [destinations, setDestinations] = useState<string[]>(['杭州']);
  const [entertainment, setEntertainment] = useState<string[]>(['台球', '足浴', '剧本杀', '酒馆']);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(''); setChangeError('');
    try {
      if (!destinations.length) throw Error('请至少选择一个目的地城市');
      const body: Record<string, FormDataEntryValue | string[]> = Object.fromEntries(new FormData(event.currentTarget));
      body.destinations = destinations;
      body.entertainmentPreferences = entertainment.join('、');
      const response = await fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await response.json(); if (!response.ok) throw Error(json.error);
      setDiscovery(json); setSelectedIds([]); setPlan(null);
    } catch (e) { setError(userFacingRequestError(e, '候选发现失败')); } finally { setLoading(false); }
  }
  const generatePlan = async () => {
    if (!discovery || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discoveryId: discovery.discoveryId, selectedIds }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setError(userFacingRequestError(e, '路线生成失败')); } finally { setLoading(false); }
  };
  const toggleCandidate = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const addCustomCandidates = async (city: string, kind: 'attraction' | 'food', names: string[]) => {
    if (!discovery || loading) return;
    setLoading(true);
    try {
      const previous = new Set(discovery.candidates.map(candidate => candidate.id));
      const response = await fetch('/api/discover/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discoveryId: discovery.discoveryId, city, kind, names }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error);
      const addedIds = (json as DiscoveryResult).candidates.filter(candidate => !previous.has(candidate.id)).map(candidate => candidate.id);
      setDiscovery(json); setSelectedIds(current => [...new Set([...current, ...addedIds])]);
    } finally { setLoading(false); }
  };
  const change: MealAction = async (mealId, action, restaurantId) => {
    if (!plan || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, mealId, action, restaurantId }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '调整失败')); } finally { setChanging(false); }
  };
  const searchEntertainment = async (dayIndex: number, preference: string, query: string, selectedIds: string[]) => {
    if (!plan?.planId || plan.revision === undefined || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/entertainment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, dayIndex, preference, query, selectedIds }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '娱乐地点查询失败')); } finally { setChanging(false); }
  };
  const replanDay = async (dayIndex: number, replacements: { stopId: string; name: string }[], entertainmentIds: string[]) => {
    if (!plan?.planId || plan.revision === undefined || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, dayIndex, replacements, removedStopIds: [], entertainmentIds }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '当天路线重新规划失败')); } finally { setChanging(false); }
  };
  return <main>
    <header><div className="brand">TRAVELCANVAS <span>中国旅行规划</span></div><p>路线以数据校验，灵感由 AI 生成</p></header>
    <section className="hero"><div><span className="eyebrow">可信旅行方案 · BETA</span><h1>让每一步，<em>更值得抵达。</em></h1><p>沿着想去的路线，找到合口味、少绕路的具体餐厅。把预算、用餐时间与有来源的攻略一起安排好。</p></div><aside><b>行程里，也有值得期待的一餐</b><span>✓ 具体分店与真实路线查询</span><span>✓ 全员餐饮预算与绕路约束</span><span>✓ 小红书公开笔记与来源 Tips</span><span>✓ 换店重算与餐厅锁定</span></aside></section>
    <section className="panel"><div className="section-head"><div><span className="eyebrow">01 / 旅行需求</span><h2>开始规划</h2></div><small>方案暂存 30 分钟，用于换店调整</small></div>
      <form onSubmit={submit}><div className="grid">
        <label>出发地<input required name="origin" placeholder="如：上海市静安区" defaultValue="上海" maxLength={60} /><small>可填写城市、车站或具体地址</small></label>
        <div className="destination-field"><span className="field-label">目的地（可多选）</span><CityMultiSelect value={destinations} onChange={setDestinations} /></div>
        <label>出发日期<input required type="date" name="startDate" defaultValue={today} /></label>
        <label>旅行天数<input required type="number" name="days" min="1" max="10" defaultValue="2" /></label>
        <label>旅行预算（元）<input required type="number" name="budget" min="500" max="1000000" defaultValue="4000" /></label>
        <label>预算口径<select name="budgetBasis"><option value="group">全员总预算</option><option value="person">人均总预算</option></select></label>
        <label>出行人数<input required type="number" name="travelers" min="1" max="8" defaultValue="2" /></label>
        <label>主要交通<select name="transport"><option value="walk">步行优先</option><option value="transit">公共交通</option><option value="drive">驾车/打车</option></select></label>
      </div>
      <label>旅行偏好<textarea name="preferences" placeholder="如：西湖、茶文化、慢节奏" maxLength={300} /></label>
      <label>旅行限制<textarea name="constraints" placeholder="如：避免高强度徒步、不安排夜间行程" maxLength={300} /></label>
      <fieldset><legend>想看的娱乐项目（可多选）</legend><div className="preference-checks">{['台球', '足浴', '剧本杀', '酒馆', '演出', '亲子乐园', '茶馆', '夜游'].map(item => <label key={item}><input type="checkbox" checked={entertainment.includes(item)} onChange={() => setEntertainment(current => current.includes(item) ? current.filter(value => value !== item) : [...current, item])} />{item}</label>)}</div><p className="form-help">这里先选择类型。选完景区和饭店并生成基础路线后，系统才会在当天线路附近查找少绕路的具体娱乐地点并加入行程。</p></fieldset>
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
      <button disabled={loading || changing}>{loading && !discovery ? '正在查询地点、图片与公开笔记…' : '发现景区与美食候选 →'}</button></form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {discovery && <CandidatePicker discovery={discovery} selectedIds={selectedIds} busy={loading} error={plan ? '' : error} onToggle={toggleCandidate} onGenerate={generatePlan} onAddCustom={addCustomCandidates} />}
    {plan && <PlanView plan={plan} busy={loading || changing} onAction={change} onSearchEntertainment={searchEntertainment} onReplanDay={replanDay} changeError={changeError} />}
  </main>;
}

function PlanView({ plan, busy, onAction, onSearchEntertainment, onReplanDay, changeError }: { plan: Plan; busy: boolean; onAction: MealAction; onSearchEntertainment: (dayIndex: number, preference: string, query: string, selectedIds: string[]) => Promise<void>; onReplanDay: (dayIndex: number, replacements: { stopId: string; name: string }[], entertainmentIds: string[]) => Promise<void>; changeError: string }) {
  const [activeDay, setActiveDay] = useState(0);
  const [replacementNames, setReplacementNames] = useState<Record<string, string>>({});
  const [entertainmentIds, setEntertainmentIds] = useState<Record<number, string[]>>({});
  const [entertainmentTypes, setEntertainmentTypes] = useState<Record<number, string>>({});
  const [entertainmentQueries, setEntertainmentQueries] = useState<Record<number, string>>({});
  const [venueChoices, setVenueChoices] = useState<Record<number, string>>({});
  useEffect(() => {
    setReplacementNames({});
  }, [plan.planId]);
  const total = Object.values(plan.budget).reduce((a, b) => a + b, 0);
  const labels: Record<string, string> = { transport: '交通建议上限', stay: '住宿建议上限', food: '餐饮建议上限', activities: '景点与娱乐建议上限', remaining: '剩余可用预算（未安排）' };
  const attachedNames = new Set(plan.days.flatMap(day => day.stops.map(stop => stop.name)));
  const generalTips = plan.food.tips.filter(tip => !attachedNames.has(tip.placeName) && !plan.food.meals.some(meal => meal.options.some(o => o.restaurant.name === tip.placeName)));
  const guide = plan.dayGuides[activeDay];
  const entertainment = plan.entertainmentDays[activeDay];
  const entertainmentPreferences = [...new Set(plan.request.entertainmentPreferences.split(/[，,、;；\s]+/).filter(Boolean))];
  const entertainmentType = entertainmentTypes[activeDay] || entertainmentPreferences[0] || '其他';
  const entertainmentQuery = entertainmentQueries[activeDay] || '';
  const entertainmentSelection = entertainmentIds[activeDay] ?? entertainment?.selectedIds ?? [];
  const entertainmentOptions = entertainment?.options.filter(option => option.preference === entertainmentType) || [];
  const venueChoice = venueChoices[activeDay] || '';
  const replacements = plan.days[activeDay]?.stops.filter(stop => stop.kind !== 'entertainment' && replacementNames[stop.id]?.trim()).map(stop => ({ stopId: stop.id, name: replacementNames[stop.id].trim() })) || [];
  const dayDirty = replacements.length > 0 || entertainmentSelection.join('|') !== (entertainment?.selectedIds || []).join('|');
  const selectedEntertainment = entertainmentSelection.map(id => entertainment?.options.find(option => option.id === id)).filter(Boolean);
  const addEntertainment = () => {
    if (!venueChoice) return;
    setEntertainmentIds(current => {
      const selected = current[activeDay] ?? entertainment?.selectedIds ?? [];
      return selected.includes(venueChoice) || selected.length >= 3 ? current : { ...current, [activeDay]: [...selected, venueChoice] };
    });
    setVenueChoices(current => ({ ...current, [activeDay]: '' }));
  };
  return <section className="result" aria-busy={busy}>
    <div className="section-head"><div><span className="eyebrow">03 / 旅行方案</span><h2>{plan.route.cityOrder.join(' → ')} · {plan.request.days} 天行程</h2><p className="route-origin">从 {plan.request.origin} 出发</p></div><small>更新于 {new Date(plan.sources.updatedAt).toLocaleString('zh-CN')}</small></div>
    <div className="notice">当前数据状态：AI {sourceName(plan.sources.ai)} · 景点地图 {sourceName(plan.sources.map)} · 天气 {sourceName(plan.sources.weather)} · 酒店 {sourceName(plan.sources.hotel)} · 小红书公开检索 {sourceName(plan.food.searchState)}。演示数据不代表实时地点或价格。</div>
    {!!plan.food.warnings.length && <div className="notice">{plan.food.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    {changeError && <p className="error change-error" role="alert">{changeError}</p>}
    <RouteMap route={plan.route} />
    <div className="day-tabs" role="tablist" aria-label="按天查看行程">{plan.days.map((day, index) => <button type="button" role="tab" aria-selected={activeDay === index} className={activeDay === index ? 'active' : 'secondary'} key={day.date} onClick={() => setActiveDay(index)}>第 {index + 1} 天 · {day.city}</button>)}</div>
    {guide && <div className="day-guide"><div><span className="eyebrow">当天气象 · {sourceName(guide.weather.state)}</span><h4>{guide.weather.summary}</h4>{guide.weather.state === 'live' && <p>{guide.weather.low}°—{guide.weather.high}° · 降水 {guide.weather.rain}%</p>}<small>Open-Meteo · {new Date(guide.weather.updatedAt).toLocaleString('zh-CN')}</small></div><div className="day-hotels"><span className="eyebrow">当天住宿建议</span>{guide.hotels.slice(0, 2).map(hotel => <div key={hotel.id}><h4>{hotel.area}</h4><p>{hotel.rationale}</p><a href={hotel.ctripUrl} target="_blank" rel="noreferrer">去携程查看酒店 →</a></div>)}<small>实时房价、库存与取消规则以携程页面为准</small></div><div><span className="eyebrow">当天出行提醒</span><ul>{guide.reminders.map(item => <li key={item}>{item}</li>)}</ul></div></div>}
    <div className="layout"><div>{plan.days.map((day, dayIndex) => activeDay === dayIndex && <article className="day" key={day.date}>
      <h3>{day.title}<small>{day.date}</small></h3>
      {day.warning && <p className="notice">{day.warning}</p>}
      {day.stops.map((stop, i) => <Fragment key={`${day.date}-${stop.id}`}>
        <div className="stop"><time>{stop.time}</time><div><strong>{stop.name} {stop.verified && <i>地点已校验</i>}</strong><p className="address">⌖ {stop.address}</p><p>{stop.detail}</p><div className="tags"><span>停留 {stop.duration}</span><span>{stop.indoor ? '室内/可避雨' : '户外活动'}</span>{i > 0 && <span>按少折返顺序规划</span>}</div>
          {stop.kind !== 'entertainment' && <><p className={`reservation ${stop.reservation?.status || 'unknown'}`}>预约提示：{stop.reservation?.message || '预约要求待确认，请在出发前查看景区官方渠道。'} {stop.reservation?.sourceUrl && <a href={stop.reservation.sourceUrl} target="_blank" rel="noreferrer">查看政府来源 →</a>}</p><details className="replace-place"><summary>更换这个景点</summary><label>输入想去的景点<input value={replacementNames[stop.id] || ''} onChange={event => setReplacementNames(current => ({ ...current, [stop.id]: event.target.value }))} maxLength={100} placeholder={`替换“${stop.name}”`} /></label><small>保存时将先通过高德核验，再重新计算当天顺序和餐饮路线。</small></details></>}
          {stop.navigationUrl && <a className="nav-link" href={stop.navigationUrl} target="_blank" rel="noreferrer">在高德地图打开并导航 →</a>}
          {plan.food.tips.filter(tip => tip.placeName === stop.name).map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}
        </div><b>{stop.costPending ? '费用待确认' : `约 ¥${stop.cost}`}</b></div>
        {plan.food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).map(meal => <MealCard key={meal.slot.id} meal={meal} food={plan.food} busy={busy} onAction={onAction} />)}
      </Fragment>)}
      <div className="day-editor"><span className="eyebrow">顺路娱乐活动</span><p>先选择想玩的类型，再按当天景区和餐饮路线查找具体地点。默认安排 1 个，也可继续添加，最多 3 个。</p>
        <div className="entertainment-search"><label>娱乐项目<select aria-label="娱乐项目" value={entertainmentType} onChange={event => setEntertainmentTypes(current => ({ ...current, [activeDay]: event.target.value }))}>{entertainmentPreferences.map(item => <option key={item}>{item}</option>)}<option value="其他">其他</option></select></label><label>补充地点或区域（可选）<input value={entertainmentQuery} onChange={event => setEntertainmentQueries(current => ({ ...current, [activeDay]: event.target.value }))} maxLength={100} placeholder="如：西湖附近、某家酒馆" /></label><button className="secondary" type="button" disabled={busy || (entertainmentType === '其他' && entertainmentQuery.trim().length < 2)} onClick={() => onSearchEntertainment(activeDay, entertainmentType, entertainmentQuery.trim(), entertainmentSelection)}>{busy ? '正在查询…' : '按当天路线查找地点'}</button></div>
        {!!entertainmentOptions.length && <div className="entertainment-add"><label>推荐的具体地点<select aria-label="推荐的具体地点" value={venueChoice} onChange={event => setVenueChoices(current => ({ ...current, [activeDay]: event.target.value }))}><option value="">请选择地点</option>{entertainmentOptions.map(option => <option key={option.id} value={option.id}>{option.name} · 从 {entertainment.anchorName} 约 {option.routeMinutes ?? '待确认'} 分钟</option>)}</select></label><button className="secondary" type="button" disabled={!venueChoice || entertainmentSelection.length >= 3} onClick={addEntertainment}>添加到当天草稿</button></div>}
        {!!selectedEntertainment.length && <div className="entertainment-draft"><b>当天娱乐草稿</b>{selectedEntertainment.map(option => option && <div key={option.id}><span>{option.preference} · {option.name} · 约 {option.routeMinutes ?? '待确认'} 分钟</span><button type="button" className="text-button" onClick={() => setEntertainmentIds(current => ({ ...current, [activeDay]: entertainmentSelection.filter(id => id !== option.id) }))}>删除</button></div>)}</div>}
        {entertainment?.warning && <p>{entertainment.warning}</p>}<button type="button" disabled={busy || !dayDirty} onClick={() => onReplanDay(activeDay, replacements, entertainmentSelection)}>{busy ? '正在核验地点并重新规划…' : '保存修改并重新规划当天路线'}</button><small>景点替换和娱乐更改会在点击此按钮后一次生效；检索本身不会立即改变路线。</small></div>
    </article>)}
      {!!generalTips.length && <div className="card"><span className="eyebrow">攻略参考 · 尚未匹配具体行程地点</span>{generalTips.map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}</div>}
      {!!plan.food.sources.length && <details className="card"><summary>本次攻略来源（{plan.food.sources.length}）</summary>{plan.food.sources.map(source => <p key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title} · {source.kind === 'search' ? '搜索摘要' : '用户提供'} · 发布 {source.publishedAt || '未知'} · 查询 {new Date(source.queriedAt).toLocaleString('zh-CN')}</p>)}</details>}
    </div><aside className="sidebar">
      <FoodSummary plan={plan} />
      <div className="card"><span className="eyebrow">全员预算建议 · 按主要交通调整</span>{Object.entries(plan.budget).map(([key, value]) => <p className="line" key={key}><span>{labels[key] || key}</span><b>¥{value}</b></p>)}<p className="line total"><span>合计（{plan.request.travelers} 人）</span><b>¥{total}</b></p><div className="budget-explanation"><b>{plan.budgetMeta.transportMode}：已知路线交通约 ¥{plan.budgetMeta.knownTransportCost}</b><p>{plan.budgetMeta.rule}</p>{plan.budgetMeta.pendingLegs > 0 && <small>另有 {plan.budgetMeta.pendingLegs} 段价格或路线待确认，以上不是最终支出。</small>}<p>“剩余可用预算”只是尚未分配的钱，不再使用含义不清的“机动金”。</p></div></div>
      <div className="card"><span className="eyebrow">全程风险提示</span><ul>{plan.risks.map(r => <li key={r}>{r}</li>)}</ul></div>
    </aside></div>
  </section>;
}

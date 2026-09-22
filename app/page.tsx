'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import type { EntertainmentPeriod, EntertainmentSelection, Plan } from '../lib/plan';
import { FoodSummary, MealCard, SourceTip, type MealAction, type RestaurantSearchAction } from './food-view';
import { CityMultiSelect } from './city-multi-select';
import { JourneyCanvas } from './journey-canvas';
import { CandidatePicker } from './candidate-picker';
import type { DiscoveryResult } from '../lib/discovery-types';
import { userFacingRequestError } from '../lib/client-errors.mjs';
import { ENTERTAINMENT_TYPES } from '../lib/entertainment';
import { TravelAnchors, type HotelDraft, type IntercityLegDraft } from './travel-anchors';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const sourceName = (state: string) => state === 'live' ? '已查询' : state === 'demo' ? '演示数据' : '待确认';
const routeDistance = (meters: number | null) => meters === null ? '距离待确认' : `距离 ${Math.round(meters / 100) / 10} 公里`;

export default function Home() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [changeError, setChangeError] = useState('');
  const [destinations, setDestinations] = useState<string[]>([]);
  const [origin, setOrigin] = useState('上海');
  const [tripStartDate, setTripStartDate] = useState(today);
  const [tripDays, setTripDays] = useState(2);
  const [bookedHotels, setBookedHotels] = useState<HotelDraft[]>([]);
  const [intercityLegs, setIntercityLegs] = useState<IntercityLegDraft[]>([]);
  const [candidateExpanded, setCandidateExpanded] = useState(false);
  const tripEndDate = new Date(Date.parse(`${tripStartDate}T00:00:00Z`) + Math.max(1, tripDays) * 86400000).toISOString().slice(0, 10);
  useEffect(() => {
    const cities = [origin.trim(), ...destinations].filter(Boolean);
    setIntercityLegs(current => cities.slice(0, -1).map((fromCity, index) => {
      const toCity = cities[index + 1];
      return current.find(leg => leg.fromCity === fromCity && leg.toCity === toCity) || { fromCity, toCity, mode: 'high_speed_rail', departureAt: '', arrivalAt: '', tripNo: '' };
    }));
  }, [origin, destinations]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(''); setChangeError('');
    try {
      if (!destinations.length) throw Error('请至少选择一个目的地城市');
      const body: Record<string, FormDataEntryValue | string[]> = Object.fromEntries(new FormData(event.currentTarget));
      body.destinations = destinations;
      const unverifiedHotel = bookedHotels.find(hotel => hotel.name.trim() && !hotel.verified);
      if (unverifiedHotel) throw Error(`请先核验酒店“${unverifiedHotel.name}”的具体位置`);
      const incompleteLeg = intercityLegs.find(leg => leg.mode !== 'drive' && (!leg.departureHub || !leg.arrivalHub || !leg.departureAt || !leg.arrivalAt));
      if (incompleteLeg) throw Error(`请补全${incompleteLeg.fromCity}到${incompleteLeg.toCity}的站点与预计时间`);
      (body as Record<string, unknown>).bookedHotels = bookedHotels.filter(hotel => hotel.city && hotel.name.trim()).map(hotel => ({ ...hotel, ...hotel.verified, verified: undefined }));
      (body as Record<string, unknown>).intercityLegs = intercityLegs.map(leg => ({ ...leg, departureAt: leg.departureAt ? new Date(leg.departureAt).toISOString() : undefined, arrivalAt: leg.arrivalAt ? new Date(leg.arrivalAt).toISOString() : undefined }));
      (body as Record<string, unknown>).transport = body.localTransport;
      const response = await fetch('/api/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await response.json(); if (!response.ok) throw Error(json.error);
      setDiscovery(json); setSelectedIds([]); setPlan(null); setCandidateExpanded(true);
    } catch (e) { setError(userFacingRequestError(e, '候选发现失败')); } finally { setLoading(false); }
  }
  const generatePlan = async () => {
    if (!discovery || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discoveryId: discovery.discoveryId, selectedIds }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json); setCandidateExpanded(false);
    } catch (e) { setError(userFacingRequestError(e, '路线生成失败')); } finally { setLoading(false); }
  };
  const toggleCandidate = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const addCustomCandidates = async (city: string, kind: 'attraction', names: string[]) => {
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
  const searchRestaurants: RestaurantSearchAction = async (mealId, names) => {
    if (!plan || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, mealId, names }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '餐厅查询失败')); } finally { setChanging(false); }
  };
  const searchEntertainment = async (dayIndex: number, preference: string, query: string, selectedIds: string[]) => {
    if (!plan?.planId || plan.revision === undefined || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/entertainment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, dayIndex, preference, query, selectedIds }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '娱乐地点查询失败')); } finally { setChanging(false); }
  };
  const replanDay = async (dayIndex: number, replacements: { stopId: string; name: string }[], entertainmentSelections: EntertainmentSelection[]) => {
    if (!plan?.planId || plan.revision === undefined || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/day', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, dayIndex, replacements, removedStopIds: [], entertainmentSelections }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '当天路线重新规划失败')); } finally { setChanging(false); }
  };
  return <main className="app-shell">
    <header className="app-header"><div className="brand">TRAVELCANVAS <span>中国旅行规划</span></div><p>真实地点 · 路线可验证</p></header>
    <section className={`experience-grid ${plan ? 'has-plan' : discovery ? 'has-discovery' : 'is-idle'}`}>
      <div className="launch-content">
        <section className="hero">
          <h1>从想去，<em>到走得通。</em></h1>
          <p>先用一分钟定下基本行程。我们再帮你发现真实地点、核验路线，把想去的地方安排得更顺。</p>
          <div className="trust-line" aria-label="规划数据说明"><span>地点逐一核验</span><span>路线来自地图服务</span><span>风险明确标注</span></div>
        </section>
        <section className="panel planner-panel">
          <div className="section-head"><div><h2>先定下基本行程</h2><p>填完这些，就可以开始发现地点。</p></div><small>方案暂存 30 分钟，可继续换店调整</small></div>
          <form className="planner-form" onSubmit={submit}>
            <div className="quick-grid">
              <label>出发地<input required name="origin" placeholder="城市、车站或具体地址" value={origin} onChange={event => setOrigin(event.target.value)} maxLength={60} /></label>
              <div className="destination-field"><span className="field-label">目的地（可多选）</span><CityMultiSelect value={destinations} onChange={value => { setDestinations(value); setBookedHotels(current => current.filter(hotel => value.includes(hotel.city))); }} /></div>
              <label>出发日期<input required type="date" name="startDate" value={tripStartDate} onChange={event => setTripStartDate(event.target.value)} /></label>
              <label>旅行天数<input required type="number" name="days" min="1" max="10" value={tripDays} onChange={event => setTripDays(Number(event.target.value))} /></label>
              <label>出行人数<input required type="number" name="travelers" min="1" max="8" defaultValue="2" /></label>
            </div>
            <details className="advanced-planning">
              <summary><span>补充预算、偏好与餐饮要求</span><small>可选，但能让候选更贴合这趟旅行</small></summary>
              <div className="advanced-content">
                <div className="grid compact-grid">
                  <label>旅行预算（元）<input required type="number" name="budget" min="500" max="1000000" defaultValue="4000" /></label>
                  <label>预算口径<select name="budgetBasis"><option value="group">全员总预算</option><option value="person">人均总预算</option></select></label>
                  <label>市内交通<select name="localTransport"><option value="walk">步行优先</option><option value="transit">公共交通</option><option value="drive">驾车/打车</option></select></label>
                </div>
                <div className="grid preference-grid">
                  <label>旅行偏好<textarea name="preferences" placeholder="如：西湖、茶文化、慢节奏" maxLength={300} /></label>
                  <label>旅行限制<textarea name="constraints" placeholder="如：避免高强度徒步、不安排夜间行程" maxLength={300} /></label>
                </div>
                <TravelAnchors destinations={destinations} hotels={bookedHotels} onHotelsChange={setBookedHotels} legs={intercityLegs} onLegsChange={setIntercityLegs} startDate={tripStartDate} endDate={tripEndDate} />
                <fieldset><legend>把美食安排进路线</legend><div className="grid compact-grid">
                  <label>餐饮偏好<input name="foodPreferences" placeholder="如：杭帮菜、面食、清淡" maxLength={300} /></label>
                  <label>饮食禁忌 / 过敏<input name="dietary" placeholder="如：不吃牛肉、花生过敏" maxLength={200} /></label>
                  <label>推荐模式<select name="foodMode"><option value="route">顺路优先</option><option value="food">美食优先（仍遵守绕路上限）</option></select></label>
                  <label>最多额外交通（分钟）<input type="number" required name="maxDetour" min="0" max="90" defaultValue="20" /></label>
                  <label>每餐用餐时长（分钟）<input type="number" required name="mealMinutes" min="30" max="120" defaultValue="60" /></label>
                  <label>排队预留（分钟）<input type="number" required name="queueMinutes" min="0" max="120" defaultValue="20" /></label>
                </div><p className="form-help">午餐与晚餐分别占正餐分配的 40% / 60%，另留餐饮预算的 20% 给早餐和零食。存在饮食禁忌时，门店需确认适配后再决定，不自动视为安全。</p></fieldset>
                <details className="note-input"><summary>补充小红书帖子（可选）</summary><p className="form-help">自动查询仅覆盖公开收录的笔记。可粘贴正文补充线索；只提供链接不能自动读取全文。帖子经验和榜单线索都会标为待确认。</p>
                  <label>帖子正文<textarea name="noteText" maxLength={12000} rows={5} placeholder="粘贴包含具体分店名、点单或旅游经验的正文…" /></label>
                  <div className="grid preference-grid"><label>原文 / 分享链接<input name="noteUrl" type="url" placeholder="https://www.xiaohongshu.com/explore/…" maxLength={2000} /></label><label>帖子发布日期（知道时填写）<input name="noteDate" type="date" /></label></div>
                </details>
              </div>
            </details>
            <button className="primary-action" disabled={loading || changing || !destinations.length}>{!destinations.length ? '请先选择目的地' : loading && !discovery ? '正在核验地点与来源…' : '开始发现地点'}</button>
            <p className="planner-meta">AI 负责发现灵感；地点、路线、来源与查询时间会单独标注。</p>
          </form>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </div>
      <aside className="experience-map"><JourneyCanvas destinations={destinations} discovery={discovery} selectedIds={selectedIds} plan={plan} loading={loading} /></aside>
      {(discovery || plan) && <div className="stage-content">
        {discovery && (candidateExpanded
          ? <CandidatePicker discovery={discovery} selectedIds={selectedIds} busy={loading} error={plan ? '' : error} onToggle={toggleCandidate} onGenerate={generatePlan} onAddCustom={addCustomCandidates} />
          : <section className="candidate-summary panel"><div><span className="eyebrow">02 / 选择想去的地方</span><h2>已收起景区候选</h2><p>已选 {discovery.candidates.filter(candidate => selectedIds.includes(candidate.id) && candidate.kind === 'attraction').length} 个景区。餐厅已按生成后的基础路线另行查询；展开修改景区后需重新生成路线。</p></div><button type="button" className="secondary" onClick={() => setCandidateExpanded(true)}>展开并修改选择</button></section>)}
        {plan && <PlanView plan={plan} busy={loading || changing} onAction={change} onSearchRestaurants={searchRestaurants} onSearchEntertainment={searchEntertainment} onReplanDay={replanDay} changeError={changeError} />}
      </div>}
    </section>
  </main>;
}

function PlanView({ plan, busy, onAction, onSearchRestaurants, onSearchEntertainment, onReplanDay, changeError }: { plan: Plan; busy: boolean; onAction: MealAction; onSearchRestaurants: RestaurantSearchAction; onSearchEntertainment: (dayIndex: number, preference: string, query: string, selectedIds: string[]) => Promise<void>; onReplanDay: (dayIndex: number, replacements: { stopId: string; name: string }[], entertainmentSelections: EntertainmentSelection[]) => Promise<void>; changeError: string }) {
  const [activeDay, setActiveDay] = useState(0);
  const [replacementNames, setReplacementNames] = useState<Record<string, string>>({});
  const [entertainmentSelections, setEntertainmentSelections] = useState<Record<number, EntertainmentSelection[]>>({});
  const [entertainmentPeriods, setEntertainmentPeriods] = useState<Record<number, EntertainmentPeriod>>({});
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
  const entertainmentType = entertainmentTypes[activeDay] || ENTERTAINMENT_TYPES[0];
  const entertainmentQuery = entertainmentQueries[activeDay] || '';
  const entertainmentSelection = entertainmentSelections[activeDay] ?? entertainment?.selections ?? [];
  const entertainmentIds = entertainmentSelection.map(selection => selection.id);
  const entertainmentPeriod = entertainmentPeriods[activeDay] || 'evening';
  const entertainmentOptions = entertainment?.options.filter(option => entertainmentType === '其他' ? option.preference.startsWith('其他：') : option.preference === entertainmentType) || [];
  const venueChoice = venueChoices[activeDay] || '';
  const replacements = plan.days[activeDay]?.stops.filter(stop => stop.kind !== 'entertainment' && replacementNames[stop.id]?.trim()).map(stop => ({ stopId: stop.id, name: replacementNames[stop.id].trim() })) || [];
  const dayDirty = replacements.length > 0 || JSON.stringify(entertainmentSelection) !== JSON.stringify(entertainment?.selections || []);
  const selectedEntertainment = entertainmentSelection.map(selection => ({ selection, option: entertainment?.options.find(option => option.id === selection.id) })).filter(item => item.option);
  const addEntertainment = () => {
    if (!venueChoice) return;
    setEntertainmentSelections(current => {
      const selected = current[activeDay] ?? entertainment?.selections ?? [];
      return selected.some(item => item.id === venueChoice) || selected.length >= 3 ? current : { ...current, [activeDay]: [...selected, { id: venueChoice, period: entertainmentPeriod }] };
    });
    setVenueChoices(current => ({ ...current, [activeDay]: '' }));
  };
  return <section className="result" aria-busy={busy}>
    <div className="section-head"><div><span className="eyebrow">03 / 旅行方案</span><h2>{plan.route.cityOrder.join(' → ')} · {plan.request.days} 天行程</h2><p className="route-origin">从 {plan.request.origin} 出发</p></div><small>更新于 {new Date(plan.sources.updatedAt).toLocaleString('zh-CN')}</small></div>
    <div className="notice">当前数据状态：AI {sourceName(plan.sources.ai)} · 景点地图 {sourceName(plan.sources.map)} · 天气 {sourceName(plan.sources.weather)} · 酒店 {sourceName(plan.sources.hotel)} · 小红书公开检索 {sourceName(plan.food.searchState)}。演示数据不代表实时地点或价格。</div>
    {!!plan.food.warnings.length && <div className="notice">{plan.food.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    {changeError && <p className="error change-error" role="alert">{changeError}</p>}
    <div className="day-tabs" role="tablist" aria-label="按天查看行程">{plan.days.map((day, index) => <button type="button" role="tab" aria-selected={activeDay === index} className={activeDay === index ? 'active' : 'secondary'} key={day.date} onClick={() => setActiveDay(index)}>第 {index + 1} 天 · {day.city}</button>)}</div>
    {guide && <div className="day-guide"><div><span className="eyebrow">当天气象 · {sourceName(guide.weather.state)}</span><h4>{guide.weather.summary}</h4>{guide.weather.state === 'live' && guide.weather.low !== null && guide.weather.high !== null && <p>{guide.weather.low}°—{guide.weather.high}°{guide.weather.rain !== null ? ` · 降水 ${guide.weather.rain}%` : ''}</p>}<small>{guide.weather.provider} · 查询 {new Date(guide.weather.queriedAt).toLocaleString('zh-CN')}{guide.weather.issuedAt ? ` · 预报发布 ${new Date(guide.weather.issuedAt).toLocaleString('zh-CN')}` : ''}</small></div><div className="day-hotels"><span className="eyebrow">{guide.hotels[0]?.booked ? '已预订酒店' : '当天住宿建议'}</span>{guide.hotels.slice(0, 2).map(hotel => <div key={hotel.id}><h4>{hotel.area}</h4><p>{hotel.rationale}</p>{hotel.address && <p className="address">⌖ {hotel.address}</p>}{hotel.navigationUrl ? <a href={hotel.navigationUrl} target="_blank" rel="noreferrer">在高德查看 / 导航 →</a> : hotel.ctripUrl && <a href={hotel.ctripUrl} target="_blank" rel="noreferrer">去携程查看酒店 →</a>}</div>)}<small>{guide.hotels[0]?.booked ? '订单、费用和入住政策以原预订平台为准' : '实时房价、库存与取消规则以携程页面为准'}</small></div><div><span className="eyebrow">当天出行提醒</span><ul>{guide.reminders.map(item => <li key={item}>{item}</li>)}</ul></div></div>}
    <div className="layout"><div>{plan.days.map((day, dayIndex) => activeDay === dayIndex && <article className="day" key={day.date}>
      <h3>{day.title}<small>{day.date}</small></h3>
      {day.warning && <p className="notice">{day.warning}</p>}
      {day.stops.map((stop, i) => <Fragment key={`${day.date}-${stop.id}`}>
        <div className="stop"><time>{stop.time}</time><div><strong>{stop.name} {stop.verified && <i>地点已校验</i>}</strong><p className="address">⌖ {stop.address}</p><p>{stop.detail}</p><div className="tags"><span>停留 {stop.duration}</span><span>{stop.indoor ? '室内/可避雨' : '户外活动'}</span>{i > 0 && <span>按少折返顺序规划</span>}</div>
          {stop.kind !== 'entertainment' && <><p className={`reservation ${stop.reservation?.status || 'unknown'}`}>预约提示：{stop.reservation?.message || '预约要求待确认，请在出发前查看景区官方渠道。'} {stop.reservation?.sourceUrl && <a href={stop.reservation.sourceUrl} target="_blank" rel="noreferrer">查看政府来源 →</a>}</p><details className="replace-place"><summary>更换这个景点</summary><label>输入想去的景点<input value={replacementNames[stop.id] || ''} onChange={event => setReplacementNames(current => ({ ...current, [stop.id]: event.target.value }))} maxLength={100} placeholder={`替换“${stop.name}”`} /></label><small>保存时将先通过高德核验，再重新计算当天顺序和餐饮路线。</small></details></>}
          {stop.navigationUrl && <a className="nav-link" href={stop.navigationUrl} target="_blank" rel="noreferrer">在高德地图打开并导航 →</a>}
          {plan.food.tips.filter(tip => tip.placeName === stop.name).map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}
        </div><b>{stop.costPending ? '费用待确认' : `约 ¥${stop.cost}`}</b></div>
        {plan.food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).map(meal => <MealCard key={meal.slot.id} meal={meal} food={plan.food} busy={busy} onAction={onAction} onSearch={onSearchRestaurants} />)}
      </Fragment>)}
      <div className="day-editor"><span className="eyebrow">顺路娱乐活动</span><p>先选择想玩的类型，再查找距当天路线 15 公里以内的具体地点。默认安排 1 个，也可继续添加，最多 3 个。</p>
        <div className="entertainment-search"><label>娱乐项目<select aria-label="娱乐项目" value={entertainmentType} onChange={event => { setEntertainmentTypes(current => ({ ...current, [activeDay]: event.target.value })); setEntertainmentQueries(current => ({ ...current, [activeDay]: '' })); setVenueChoices(current => ({ ...current, [activeDay]: '' })); }}>{ENTERTAINMENT_TYPES.map(item => <option key={item}>{item}</option>)}<option value="其他">其他</option></select></label><label>{entertainmentType === '其他' ? '具体活动类型（必填）' : '希望在哪个区域或哪家店（可选）'}<input aria-label={entertainmentType === '其他' ? '具体活动类型（必填）' : '希望在哪个区域或哪家店（可选）'} value={entertainmentQuery} onChange={event => setEntertainmentQueries(current => ({ ...current, [activeDay]: event.target.value }))} maxLength={100} placeholder={entertainmentType === '其他' ? '如：密室逃脱、Livehouse、电玩城' : '如：西湖附近、某家酒馆'} /></label><button className="secondary" type="button" disabled={busy || (entertainmentType === '其他' && entertainmentQuery.trim().length < 2)} onClick={() => onSearchEntertainment(activeDay, entertainmentType, entertainmentQuery.trim(), entertainmentIds)}>{busy ? '正在查询…' : '按当天路线查找地点'}</button></div>
        {!!entertainmentOptions.length && <div className="entertainment-add"><label>推荐的具体地点<select aria-label="推荐的具体地点" value={venueChoice} onChange={event => setVenueChoices(current => ({ ...current, [activeDay]: event.target.value }))}><option value="">请选择地点</option>{entertainmentOptions.map(option => <option key={option.id} value={option.id}>{option.name} · 从 {entertainment.anchorName} {routeDistance(option.routeMeters)} · 约 {option.routeMinutes ?? '待确认'} 分钟</option>)}</select></label><label>安排时间段<select aria-label="娱乐活动时间段" value={entertainmentPeriod} onChange={event => setEntertainmentPeriods(current => ({ ...current, [activeDay]: event.target.value as EntertainmentPeriod }))}><option value="morning">上午 09:00–12:00</option><option value="afternoon">下午 13:30–18:00</option><option value="evening">晚上 19:00–23:00</option></select></label><button className="secondary" type="button" disabled={!venueChoice || entertainmentSelection.length >= 3} onClick={addEntertainment}>添加到当天草稿</button></div>}
        {!!selectedEntertainment.length && <div className="entertainment-draft"><b>当天娱乐草稿</b>{selectedEntertainment.map(({ option, selection }) => option && <div key={option.id}><span>{option.preference} · {option.name} · {{ morning: '上午', afternoon: '下午', evening: '晚上' }[selection.period]} · {routeDistance(option.routeMeters)} · 约 {option.routeMinutes ?? '待确认'} 分钟</span><label>时间段<select aria-label={`${option.name}时间段`} value={selection.period} onChange={event => setEntertainmentSelections(current => ({ ...current, [activeDay]: entertainmentSelection.map(item => item.id === option.id ? { ...item, period: event.target.value as EntertainmentPeriod } : item) }))}><option value="morning">上午</option><option value="afternoon">下午</option><option value="evening">晚上</option></select></label><button type="button" className="text-button" onClick={() => setEntertainmentSelections(current => ({ ...current, [activeDay]: entertainmentSelection.filter(item => item.id !== option.id) }))}>删除</button></div>)}</div>}
        {entertainment?.warning && <p>{entertainment.warning}</p>}<button type="button" disabled={busy || !dayDirty} onClick={() => onReplanDay(activeDay, replacements, entertainmentSelection)}>{busy ? '正在核验地点并重新规划…' : '保存修改并重新规划当天路线'}</button><small>景点替换和娱乐更改会在点击此按钮后一次生效；检索本身不会立即改变路线。</small></div>
    </article>)}
      {!!generalTips.length && <div className="card"><span className="eyebrow">攻略参考 · 尚未匹配具体行程地点</span>{generalTips.map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}</div>}
      {!!plan.guides?.length && <details className="card"><summary>景点排序参考的公开攻略（{plan.guides.length}）</summary><p>以下是 Tavily 公开搜索相关性顺序，不是小红书站内个性化榜单。</p>{plan.guides.map(source => <p key={source.id}><b>{source.city} · 第 {source.rank} 篇</b> · <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> · {source.contentState === 'full' ? '公开正文' : '搜索摘要'} · 查询 {new Date(source.queriedAt).toLocaleString('zh-CN')}</p>)}</details>}
      {!!plan.food.sources.length && <details className="card"><summary>本次攻略来源（{plan.food.sources.length}）</summary>{plan.food.sources.map(source => <p key={source.id}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a> : source.title} · {source.kind === 'search' ? '搜索摘要' : '用户提供'} · 发布 {source.publishedAt || '未知'} · 查询 {new Date(source.queriedAt).toLocaleString('zh-CN')}</p>)}</details>}
    </div><aside className="sidebar">
      <FoodSummary plan={plan} />
      <div className="card"><span className="eyebrow">全员预算建议 · 按主要交通调整</span>{Object.entries(plan.budget).map(([key, value]) => <p className="line" key={key}><span>{labels[key] || key}</span><b>¥{value}</b></p>)}<p className="line total"><span>合计（{plan.request.travelers} 人）</span><b>¥{total}</b></p><div className="budget-explanation"><b>{plan.budgetMeta.transportMode}：已知路线交通约 ¥{plan.budgetMeta.knownTransportCost}</b><p>{plan.budgetMeta.rule}</p>{plan.budgetMeta.pendingLegs > 0 && <small>另有 {plan.budgetMeta.pendingLegs} 段价格或路线待确认，以上不是最终支出。</small>}<p>“剩余可用预算”只是尚未分配的钱，不再使用含义不清的“机动金”。</p></div></div>
      <div className="card"><span className="eyebrow">全程风险提示</span><ul>{plan.risks.map(r => <li key={r}>{r}</li>)}</ul></div>
    </aside></div>
  </section>;
}

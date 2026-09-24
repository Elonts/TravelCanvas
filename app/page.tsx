'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import type { EntertainmentSelection, Plan } from '../lib/plan';
import { FoodDraftControls, FoodSummary, MealCard, SourceTip, type FoodBlocker, type MealAction, type RestaurantBranchAction, type RestaurantSearchAction } from './food-view';
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
  const [guidesLoading, setGuidesLoading] = useState(false);
  const [xhsConnected, setXhsConnected] = useState(false);
  const [xhsBusyCity, setXhsBusyCity] = useState('');
  const [xhsError, setXhsError] = useState('');
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
  useEffect(() => {
    const labels: Record<string, string> = { not_connected: '扩展尚未连接当前 TravelCanvas 标签页。', busy: '扩展正在处理另一个目的地，请稍后再试。', captcha: '小红书出现验证码，请在小红书页面人工完成后重试。', login_required: '小红书登录已失效，请先在打开的页面重新登录。', structure_changed: '小红书页面结构发生变化，扩展暂时无法识别结果卡。', timeout: '登录态搜索等待超时，请检查小红书页面后重试。', extension_error: '扩展执行失败，请刷新页面或重新连接。' };
    const receive = async (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'travelcanvas-extension') return;
      if (event.data.type === 'TRAVELCANVAS_XHS_STATUS_RESULT') { setXhsConnected(Boolean(event.data.connected)); return; }
      if (event.data.type !== 'TRAVELCANVAS_XHS_RESULT') return;
      if (!event.data.ok) {
        const message = labels[event.data.code] || '登录态搜索失败。'; setXhsError(message); setXhsBusyCity('');
        setDiscovery(current => current ? { ...current, xhsSession: { ...current.xhsSession, state: 'failed', code: event.data.code || 'extension_error', message, queriedAt: new Date().toISOString() } } : current);
        return;
      }
      try {
        for (const batch of event.data.batches || []) {
          const response = await fetch('/api/discover/xhs-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discoveryId: event.data.discoveryId, city: event.data.city, ...batch }) });
          const json = await response.json(); if (!response.ok) throw Error(json.error);
          setDiscovery(current => current?.discoveryId === event.data.discoveryId ? json : current);
        }
      } catch (cause) { setXhsError(userFacingRequestError(cause, '登录态结果导入失败')); }
      finally { setXhsBusyCity(''); }
    };
    window.addEventListener('message', receive);
    window.postMessage({ source: 'travelcanvas-page', type: 'TRAVELCANVAS_XHS_STATUS' }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
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
      setDiscovery(json); setSelectedIds([]); setPlan(null); setCandidateExpanded(true); void refreshGuides(json.discoveryId);
    } catch (e) { setError(userFacingRequestError(e, '候选发现失败')); } finally { setLoading(false); }
  }
  const refreshGuides = async (discoveryId: string) => {
    if (guidesLoading) return;
    setGuidesLoading(true);
    setDiscovery(current => current?.discoveryId === discoveryId ? { ...current, guideSearch: { ...current.guideSearch, state: 'searching', message: '正在补充目的地相关公开攻略…' } } : current);
    try {
      const response = await fetch('/api/discover/guides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discoveryId }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error);
      setDiscovery(current => current?.discoveryId === discoveryId ? json : current);
    } catch (cause) {
      setDiscovery(current => current?.discoveryId === discoveryId ? { ...current, guideSearch: { ...current.guideSearch, state: 'failed', code: 'provider_error', message: userFacingRequestError(cause, '公开攻略检索失败'), retryable: true, queriedAt: new Date().toISOString() } } : current);
    } finally { setGuidesLoading(false); }
  };
  const searchLoggedInXhs = (city: string) => {
    if (!discovery || xhsBusyCity) return;
    setXhsError(''); setXhsBusyCity(city);
    window.postMessage({ source: 'travelcanvas-page', type: 'TRAVELCANVAS_XHS_START', discoveryId: discovery.discoveryId, city, queries: [
      { category: 'attractions', query: `${city} ${discovery.request.preferences || ''} 旅游攻略 必去景点`.replace(/\s+/g, ' ').trim() },
      { category: 'food', query: `${city} ${discovery.request.foodPreferences || ''} 美食推荐`.replace(/\s+/g, ' ').trim() },
    ] }, window.location.origin);
  };
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
  const searchRestaurants: RestaurantSearchAction = async (names, mealId) => {
    if (!plan || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, ...(mealId ? { mealId } : {}), names }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '餐厅查询失败')); } finally { setChanging(false); }
  };
  const selectRestaurantBranch: RestaurantBranchAction = async (manualInput, restaurantId, mealId) => {
    if (!plan || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/restaurants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, manualInput, restaurantId, mealId }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '分店选择失败')); } finally { setChanging(false); }
  };
  const finalizeFood = async (acceptedWarnings: Set<string>, skippedManualInputs: Set<string>) => {
    if (!plan || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const selections = plan.food.meals.map(meal => ({ mealId: meal.slot.id, restaurantId: meal.draftSelectedId || null, acceptWarnings: acceptedWarnings.has(`${meal.slot.id}:${meal.draftSelectedId || ''}`) }));
      const response = await fetch('/api/plan/finalize-food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, selections, skippedManualInputs: [...skippedManualInputs] }) });
      const json = await response.json(); if (!response.ok) throw Error(json.error); setPlan(json);
    } catch (e) { setChangeError(userFacingRequestError(e, '最终路线生成失败')); } finally { setChanging(false); }
  };
  const searchEntertainment = async (dayIndex: number, preference: string, query: string, anchorPointId: string, position: 'before' | 'after', selectedIds: string[]) => {
    if (!plan?.planId || plan.revision === undefined || changing || loading) return;
    setChanging(true); setChangeError('');
    try {
      const response = await fetch('/api/plan/entertainment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: plan.planId, revision: plan.revision, dayIndex, preference, query, anchorPointId, position, selectedIds }) });
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
          ? <CandidatePicker discovery={discovery} selectedIds={selectedIds} busy={loading} guideBusy={guidesLoading} xhsConnected={xhsConnected} xhsBusyCity={xhsBusyCity} xhsError={xhsError} error={plan ? '' : error} onToggle={toggleCandidate} onGenerate={generatePlan} onAddCustom={addCustomCandidates} onRetryGuides={() => refreshGuides(discovery.discoveryId)} onSearchLoggedInXhs={searchLoggedInXhs} />
          : <section className="candidate-summary panel"><div><span className="eyebrow">02 / 选择想去的地方</span><h2>已收起景区候选</h2><p>已选 {discovery.candidates.filter(candidate => selectedIds.includes(candidate.id) && candidate.kind === 'attraction').length} 个景区。餐厅已按生成后的基础路线另行查询；展开修改景区后需重新生成路线。</p></div><button type="button" className="secondary" onClick={() => setCandidateExpanded(true)}>展开并修改选择</button></section>)}
        {plan && <PlanView plan={plan} busy={loading || changing} onAction={change} onSearchRestaurants={searchRestaurants} onSelectRestaurantBranch={selectRestaurantBranch} onFinalizeFood={finalizeFood} onSearchEntertainment={searchEntertainment} onReplanDay={replanDay} changeError={changeError} />}
      </div>}
    </section>
  </main>;
}

function PlanView({ plan, busy, onAction, onSearchRestaurants, onSelectRestaurantBranch, onFinalizeFood, onSearchEntertainment, onReplanDay, changeError }: { plan: Plan; busy: boolean; onAction: MealAction; onSearchRestaurants: RestaurantSearchAction; onSelectRestaurantBranch: RestaurantBranchAction; onFinalizeFood: (acceptedWarnings: Set<string>, skippedManualInputs: Set<string>) => Promise<void>; onSearchEntertainment: (dayIndex: number, preference: string, query: string, anchorPointId: string, position: 'before' | 'after', selectedIds: string[]) => Promise<void>; onReplanDay: (dayIndex: number, replacements: { stopId: string; name: string }[], entertainmentSelections: EntertainmentSelection[]) => Promise<void>; changeError: string }) {
  const [activeDay, setActiveDay] = useState(0);
  const [replacementNames, setReplacementNames] = useState<Record<string, string>>({});
  const [entertainmentSelections, setEntertainmentSelections] = useState<Record<number, EntertainmentSelection[]>>({});
  const [entertainmentAnchorIds, setEntertainmentAnchorIds] = useState<Record<number, string>>({});
  const [entertainmentPositions, setEntertainmentPositions] = useState<Record<number, 'before' | 'after'>>({});
  const [entertainmentTypes, setEntertainmentTypes] = useState<Record<number, string>>({});
  const [entertainmentQueries, setEntertainmentQueries] = useState<Record<number, string>>({});
  const [venueChoices, setVenueChoices] = useState<Record<number, string>>({});
  const [acceptedFoodWarnings, setAcceptedFoodWarnings] = useState<Set<string>>(new Set());
  const [skippedManualRestaurants, setSkippedManualRestaurants] = useState<Set<string>>(new Set());
  useEffect(() => {
    setReplacementNames({});
    const validWarningKeys = new Set(plan.food.meals.flatMap(meal => meal.draftSelectedId ? [`${meal.slot.id}:${meal.draftSelectedId}`] : []));
    setAcceptedFoodWarnings(current => new Set([...current].filter(key => validWarningKeys.has(key))));
    const validInputs = new Set(plan.food.manualRestaurants?.map(item => item.input) || []);
    const serverSkipped = new Set(plan.food.manualRestaurants?.filter(item => item.status === 'explicitly_skipped').map(item => item.input) || []);
    setSkippedManualRestaurants(current => new Set([...current, ...serverSkipped].filter(input => validInputs.has(input))));
  }, [plan.planId, plan.revision]);
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
  const entertainmentAnchors = plan.route.points.filter(point => point.date === plan.days[activeDay]?.date && ['hotel', 'attraction', 'restaurant'].includes(point.kind));
  const entertainmentAnchorId = entertainmentAnchorIds[activeDay] || entertainmentAnchors[0]?.id || '';
  const entertainmentAnchor = entertainmentAnchors.find(point => point.id === entertainmentAnchorId);
  const entertainmentPosition = entertainmentPositions[activeDay] || (entertainmentAnchor?.hotelRole === 'end' ? 'before' : 'after');
  const entertainmentOptions = entertainment?.options.filter(option => option.anchorPointId === entertainmentAnchorId && option.position === entertainmentPosition && (entertainmentType === '其他' ? option.preference.startsWith('其他：') : option.preference === entertainmentType)) || [];
  const venueChoice = venueChoices[activeDay] || '';
  const replacements = plan.days[activeDay]?.stops.filter(stop => stop.kind !== 'entertainment' && replacementNames[stop.id]?.trim()).map(stop => ({ stopId: stop.id, name: replacementNames[stop.id].trim() })) || [];
  const dayDirty = replacements.length > 0 || JSON.stringify(entertainmentSelection) !== JSON.stringify(entertainment?.selections || []);
  const selectedEntertainment = entertainmentSelection.map(selection => ({ selection, option: entertainment?.options.find(option => option.id === selection.id) })).filter(item => item.option);
  const draftMeals = plan.food.meals.filter(meal => meal.draftSelectedId);
  const unresolvedManualRestaurants = (plan.food.manualRestaurants || []).filter(item => ['needs_branch', 'unassigned'].includes(item.status) && !skippedManualRestaurants.has(item.input));
  const foodBlockers: FoodBlocker[] = [
    ...unresolvedManualRestaurants.map(item => ({ id: `manual:${item.input}`, message: `“${item.input}”${item.status === 'needs_branch' ? '尚未确认具体分店' : '尚未安排或明确跳过'}`, targetId: `manual-restaurant-${encodeURIComponent(item.input)}` })),
    ...draftMeals.flatMap(meal => {
      const selected = meal.options.find(option => option.restaurant.id === meal.draftSelectedId);
      const key = `${meal.slot.id}:${meal.draftSelectedId || ''}`;
      return selected?.reasons.length && !acceptedFoodWarnings.has(key)
        ? [{ id: `risk:${key}`, message: `${meal.slot.date} ${meal.slot.label}的“${selected.restaurant.name}”还有绕路、预算或时间风险待确认`, targetId: `food-risk-${encodeURIComponent(meal.slot.id)}` }]
        : [];
    }),
  ];
  const addEntertainment = () => {
    if (!venueChoice) return;
    setEntertainmentSelections(current => {
      const selected = current[activeDay] ?? entertainment?.selections ?? [];
      const option = entertainment?.options.find(item => item.id === venueChoice);
      return !option || selected.some(item => item.id === venueChoice) || selected.length >= 3 ? current : { ...current, [activeDay]: [...selected, { id: venueChoice, anchorPointId: option.anchorPointId, position: option.position }] };
    });
    setVenueChoices(current => ({ ...current, [activeDay]: '' }));
  };
  return <section className="result" aria-busy={busy}>
    <div className="section-head"><div><span className="eyebrow">03 / 旅行方案</span><h2>{plan.route.cityOrder.join(' → ')} · {plan.request.days} 天行程</h2><p className="route-origin">从 {plan.request.origin} 出发</p></div><small>更新于 {new Date(plan.sources.updatedAt).toLocaleString('zh-CN')}</small></div>
    {plan.phase === 'food_selection' && <div className="notice"><b>基础路线已生成。</b> 当前地图只包含到达站、酒店和景点；下方餐厅是草稿，统一确认后才会进入路线。</div>}
    <div className="notice">当前数据状态：AI {sourceName(plan.sources.ai)} · 景点地图 {sourceName(plan.sources.map)} · 天气 {sourceName(plan.sources.weather)} · 酒店 {sourceName(plan.sources.hotel)} · 小红书公开检索 {sourceName(plan.food.searchState)}。演示数据不代表实时地点或价格。</div>
    {!!plan.food.warnings.length && <div className="notice">{plan.food.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    {changeError && <p className="error change-error" role="alert">{changeError}</p>}
    <div className="day-tabs" role="tablist" aria-label="按天查看行程">{plan.days.map((day, index) => <button type="button" role="tab" aria-selected={activeDay === index} className={activeDay === index ? 'active' : 'secondary'} key={day.date} onClick={() => setActiveDay(index)}>第 {index + 1} 天 · {day.city}</button>)}</div>
    {guide && <div className="day-guide"><div><span className="eyebrow">当天气象 · {sourceName(guide.weather.state)}</span><h4>{guide.weather.summary}</h4>{guide.weather.state === 'live' && guide.weather.low !== null && guide.weather.high !== null && <p>{guide.weather.low}°—{guide.weather.high}°{guide.weather.rain !== null ? ` · 降水 ${guide.weather.rain}%` : ''}</p>}<small>{guide.weather.provider} · 查询 {new Date(guide.weather.queriedAt).toLocaleString('zh-CN')}{guide.weather.issuedAt ? ` · 预报发布 ${new Date(guide.weather.issuedAt).toLocaleString('zh-CN')}` : ''}</small></div><div className="day-hotels"><span className="eyebrow">{guide.hotels[0]?.booked ? '已预订酒店' : '当天住宿建议'}</span>{guide.hotels.slice(0, 2).map(hotel => <div key={hotel.id}><h4>{hotel.area}</h4><p>{hotel.rationale}</p>{hotel.address && <p className="address">⌖ {hotel.address}</p>}{hotel.navigationUrl ? <a href={hotel.navigationUrl} target="_blank" rel="noreferrer">在高德查看 / 导航 →</a> : hotel.ctripUrl && <a href={hotel.ctripUrl} target="_blank" rel="noreferrer">去携程查看酒店 →</a>}</div>)}<small>{guide.hotels[0]?.booked ? '订单、费用和入住政策以原预订平台为准' : '实时房价、库存与取消规则以携程页面为准'}</small></div><div><span className="eyebrow">当天出行提醒</span><ul>{guide.reminders.map(item => <li key={item}>{item}</li>)}</ul></div></div>}
    <div className="layout"><div>{plan.days.map((day, dayIndex) => activeDay === dayIndex && <article className="day" key={day.date}>
      <h3>{day.title}<small>{day.date}</small></h3>
      {day.warning && <p className="notice">{day.warning}</p>}
      <div className="day-time-window"><b>当天可游玩时间：{day.availableFrom || '待确认'}—{day.mustFinishBy || '待确认'}</b>{day.scheduleIssues?.map(issue => <p key={issue}>{issue}</p>)}</div>
      {(day.startHub || day.arrivalHotel) && <div className="anchor-sequence" aria-label="抵达后的固定顺序">
        {day.startHub && <div><time>{day.startHub.time ? new Date(day.startHub.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' }) : '待确认'}</time><span><b>{day.startHub.name}</b><small>跨城到达站点</small></span></div>}
        {day.arrivalHotel && <div><time>{day.arrivalHotelTime || '待确认'}</time><span><b>{day.arrivalHotel.name}</b><small>先办理入住或寄存行李，再前往景点</small></span></div>}
      </div>}
      {day.stops.map((stop, i) => <Fragment key={`${day.date}-${stop.id}`}>
        <div className="stop"><time>{stop.time}</time><div><strong>{stop.name} {stop.verified && <i>地点已校验</i>}</strong><p className="address">⌖ {stop.address}</p><p>{stop.detail}</p><div className="tags"><span>停留 {stop.duration}</span><span>{stop.indoor ? '室内/可避雨' : '户外活动'}</span>{i > 0 && <span>按少折返顺序规划</span>}</div>
          {stop.kind !== 'entertainment' && <><p className={`reservation ${stop.reservation?.status || 'unknown'}`}>预约提示：{stop.reservation?.message || '预约要求待确认，请在出发前查看景区官方渠道。'} {stop.reservation?.sourceUrl && <a href={stop.reservation.sourceUrl} target="_blank" rel="noreferrer">查看政府来源 →</a>}</p><details className="replace-place"><summary>更换这个景点</summary><label>输入想去的景点<input value={replacementNames[stop.id] || ''} onChange={event => setReplacementNames(current => ({ ...current, [stop.id]: event.target.value }))} maxLength={100} placeholder={`替换“${stop.name}”`} /></label><small>保存时将先通过高德核验，再重新计算当天顺序和餐饮路线。</small></details></>}
          {stop.navigationUrl && <a className="nav-link" href={stop.navigationUrl} target="_blank" rel="noreferrer">在高德地图打开并导航 →</a>}
          {plan.food.tips.filter(tip => tip.placeName === stop.name).map(tip => <SourceTip key={tip.id} tip={tip} food={plan.food} />)}
        </div><b>{stop.costPending ? '费用待确认' : `约 ¥${stop.cost}`}</b></div>
        {plan.food.meals.filter(meal => meal.slot.dayIndex === dayIndex && meal.slot.previous.id === stop.id).map(meal => { const warningKey = `${meal.slot.id}:${meal.draftSelectedId || ''}`; return <MealCard key={meal.slot.id} meal={meal} food={plan.food} busy={busy} draftMode={plan.phase === 'food_selection'} warningAccepted={acceptedFoodWarnings.has(warningKey)} onWarningAccepted={accepted => setAcceptedFoodWarnings(current => { const next = new Set(current); if (accepted) next.add(warningKey); else next.delete(warningKey); return next; })} onAction={onAction} onSearch={onSearchRestaurants} />; })}
      </Fragment>)}
      {plan.phase === 'food_selection' ? <div className="day-editor pending-editor"><span className="eyebrow">顺路娱乐活动</span><p>请先确认餐厅生成最终路线，再选择娱乐活动放在哪个行程点之前或之后。</p></div> : <div className="day-editor"><span className="eyebrow">顺路娱乐活动</span><p>先选择当天行程点和前后关系，再查找道路距离 15 公里以内、插入路线更省时的具体地点。</p>
        <div className="entertainment-anchor"><label>安排在<select aria-label="娱乐活动锚点" value={entertainmentAnchorId} onChange={event => { const point = entertainmentAnchors.find(item => item.id === event.target.value); setEntertainmentAnchorIds(current => ({ ...current, [activeDay]: event.target.value })); setEntertainmentPositions(current => ({ ...current, [activeDay]: point?.hotelRole === 'end' ? 'before' : 'after' })); setVenueChoices(current => ({ ...current, [activeDay]: '' })); }}><option value="">请选择当天行程</option>{entertainmentAnchors.map(point => <option key={point.id} value={point.id}>{point.time} · {point.name}{point.kind === 'hotel' ? '（酒店）' : point.kind === 'restaurant' ? '（餐厅）' : ''}</option>)}</select></label><label>相对位置<select aria-label="娱乐活动相对位置" value={entertainmentPosition} onChange={event => { setEntertainmentPositions(current => ({ ...current, [activeDay]: event.target.value as 'before' | 'after' })); setVenueChoices(current => ({ ...current, [activeDay]: '' })); }}>{entertainmentAnchor?.hotelRole !== 'end' && <option value="after">这个行程之后</option>}{!['start', 'arrival'].includes(entertainmentAnchor?.hotelRole || '') && <option value="before">这个行程之前</option>}</select></label></div>
        <div className="entertainment-search"><label>娱乐项目<select aria-label="娱乐项目" value={entertainmentType} onChange={event => { setEntertainmentTypes(current => ({ ...current, [activeDay]: event.target.value })); setEntertainmentQueries(current => ({ ...current, [activeDay]: '' })); setVenueChoices(current => ({ ...current, [activeDay]: '' })); }}>{ENTERTAINMENT_TYPES.map(item => <option key={item}>{item}</option>)}<option value="其他">其他</option></select></label><label>{entertainmentType === '其他' ? '具体活动类型（必填）' : '希望在哪个区域或哪家店（可选）'}<input aria-label={entertainmentType === '其他' ? '具体活动类型（必填）' : '希望在哪个区域或哪家店（可选）'} value={entertainmentQuery} onChange={event => setEntertainmentQueries(current => ({ ...current, [activeDay]: event.target.value }))} maxLength={100} placeholder={entertainmentType === '其他' ? '如：密室逃脱、Livehouse、电玩城' : '如：西湖附近、某家酒馆'} /></label><button className="secondary" type="button" disabled={busy || !entertainmentAnchorId || (entertainmentType === '其他' && entertainmentQuery.trim().length < 2)} onClick={() => onSearchEntertainment(activeDay, entertainmentType, entertainmentQuery.trim(), entertainmentAnchorId, entertainmentPosition, entertainmentIds)}>{busy ? '正在查询…' : '按这个行程点查找地点'}</button></div>
        {!!entertainmentOptions.length && <div className="entertainment-add"><label>推荐的具体地点<select aria-label="推荐的具体地点" value={venueChoice} onChange={event => setVenueChoices(current => ({ ...current, [activeDay]: event.target.value }))}><option value="">请选择地点</option>{entertainmentOptions.map(option => <option key={option.id} value={option.id}>{option.name} · 插入路线约增加 {option.insertionExtraMinutes ?? '待确认'} 分钟 · {routeDistance(option.routeMeters)}</option>)}</select></label><button className="secondary" type="button" disabled={!venueChoice || entertainmentSelection.length >= 3} onClick={addEntertainment}>添加到当天草稿</button></div>}
        {!!selectedEntertainment.length && <div className="entertainment-draft"><b>当天娱乐草稿</b>{selectedEntertainment.map(({ option, selection }) => option && <div key={option.id}><span>{option.preference} · {option.name} · 安排在 {plan.route.points.find(point => point.id === selection.anchorPointId)?.name || '所选行程'}{selection.position === 'before' ? '之前' : '之后'} · 约增加 {option.insertionExtraMinutes ?? '待确认'} 分钟</span><button type="button" className="text-button" onClick={() => setEntertainmentSelections(current => ({ ...current, [activeDay]: entertainmentSelection.filter(item => item.id !== option.id) }))}>删除</button></div>)}</div>}
        {entertainment?.warning && <p>{entertainment.warning}</p>}<button type="button" disabled={busy || !dayDirty} onClick={() => onReplanDay(activeDay, replacements, entertainmentSelection)}>{busy ? '正在核验地点并重新规划…' : '保存修改并重新规划当天路线'}</button><small>景点替换和娱乐更改会在点击此按钮后一次生效；检索本身不会立即改变路线。</small></div>}
    </article>)}
      {plan.phase === 'food_selection' && <FoodDraftControls food={plan.food} busy={busy} blockers={foodBlockers} skippedManualInputs={skippedManualRestaurants} onSkippedChange={(input, skipped) => setSkippedManualRestaurants(current => { const next = new Set(current); if (skipped) next.add(input); else next.delete(input); return next; })} onSearch={onSearchRestaurants} onSelectBranch={onSelectRestaurantBranch} onFinalize={() => onFinalizeFood(acceptedFoodWarnings, skippedManualRestaurants)} />}
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

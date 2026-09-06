const CTRIP_HOTEL_SEARCH = 'https://hotels.ctrip.com/hotels';

function tier(nightlyBudget) {
  if (nightlyBudget < 300) return { label: '经济型 / 舒适型', range: `¥${Math.max(180, Math.round(nightlyBudget * .8))}–¥${Math.round(nightlyBudget)} / 晚` };
  if (nightlyBudget < 650) return { label: '舒适型 / 高档型', range: `¥${Math.round(nightlyBudget * .75)}–¥${Math.round(nightlyBudget * 1.1)} / 晚` };
  return { label: '高档型 / 豪华型', range: `¥${Math.round(nightlyBudget * .75)}–¥${Math.round(nightlyBudget * 1.15)} / 晚` };
}

export function recommendHotels({ destination, days, budget, travelers, preferences, stops }) {
  const nightlyBudget = Math.max(180, Math.round(budget * .38 / days));
  const stayTier = tier(nightlyBudget);
  const anchor = stops[0]?.name || `${destination}市中心`;
  const interest = /亲子|孩子|儿童/.test(preferences) ? '亲子友好、家庭房' : /美食|咖啡|夜市/.test(preferences) ? '步行可达餐饮、夜间返程便利' : /自然|徒步|摄影/.test(preferences) ? '靠近景区、公共交通便利' : '交通便利、评分优先';
  return [
    { id: 'route', title: '路线优先', area: `${anchor}周边 1–2 公里`, rationale: '以第一天核心地点为住宿重心，减少早晚通勤和打车时间。', filters: `${stayTier.label} · ${interest}`, priceGuide: stayTier.range, ctripUrl: CTRIP_HOTEL_SEARCH },
    { id: 'value', title: '预算优先', area: `${destination}地铁/公交便利区域`, rationale: '将住宿范围扩大到公共交通便利区域，换取更多同预算选择。', filters: `每晚不高于 ¥${nightlyBudget} · 可免费取消优先`, priceGuide: `建议上限 ¥${nightlyBudget} / 晚`, ctripUrl: CTRIP_HOTEL_SEARCH },
    { id: 'experience', title: '体验优先', area: `${stops.at(-1)?.name || destination}附近`, rationale: '靠近晚间活动与餐饮区域，方便行程结束后步行返回。', filters: `${interest} · 住客评分优先`, priceGuide: stayTier.range, ctripUrl: CTRIP_HOTEL_SEARCH }
  ].map(option => ({ ...option, query: `${destination}｜${option.area}｜${days} 晚｜${travelers} 位成人` }));
}

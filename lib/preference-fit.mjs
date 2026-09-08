const splitTerms = value => (value || '').split(/[，,、;；\s]+/).map(term => term.trim()).filter(Boolean);

export function foodPreferenceTerms(value) {
  const aliases = {
    川菜: ['川菜', '四川菜', '麻辣'], 辣: ['辣', '麻辣', '川菜', '湘菜'], 清淡: ['清淡', '粤菜', '蒸菜', '汤', '素食'],
    杭帮菜: ['杭帮菜', '杭州菜', '江浙菜'], 面食: ['面食', '面馆', '面条', '饺子', '馄饨'], 火锅: ['火锅', '涮锅'],
    烧烤: ['烧烤', '烤肉'], 海鲜: ['海鲜', '鱼', '虾'], 素食: ['素食', '素菜'], 日料: ['日料', '日本料理', '寿司'], 西餐: ['西餐', '牛排', '意大利菜'],
  };
  return [...new Set(splitTerms(value).flatMap(term => aliases[term] || [term]))].slice(0, 12);
}

export function attractionPreferenceFit(place, request) {
  const profile = `${request.preferences || ''} ${request.constraints || ''}`;
  const text = `${place.name || ''} ${place.category || ''}`;
  let score = splitTerms(request.preferences).filter(term => text.includes(term)).length * 20;
  const notes = [], cautions = [];
  const senior = /老年|老人|长辈|父母|银发|行动不便|腿脚/.test(profile);
  const lowMobility = senior || /少走路|不爬山|避免爬山|避免徒步|低强度|无障碍/.test(profile);
  if (senior) {
    if (/公园|博物馆|纪念馆|美术馆|园林|古镇|寺|湖|植物园|文化馆|展览/.test(text)) { score += 40; notes.push('更贴近低强度、文化或园林类长辈出游偏好'); }
    else notes.push('已纳入长辈出游偏好排序');
  }
  const strenuous = /攀岩|漂流|蹦极|滑雪|登山|徒步|峡谷|高空|探险|极限运动/.test(text);
  if (lowMobility && strenuous) { score -= 200; cautions.push('与少爬坡、少徒步或低强度限制明显冲突'); }
  else if (lowMobility) cautions.push('无障碍设施、坡度、步行距离和休息点仍需向景区确认');
  if (/亲子|儿童/.test(profile) && /乐园|动物园|植物园|科技馆|海洋馆|公园/.test(text)) { score += 35; notes.push('匹配亲子活动偏好'); }
  if (/历史|人文|文化|古建/.test(profile) && /博物馆|纪念馆|古城|古镇|寺|故居|遗址|文化/.test(text)) { score += 35; notes.push('匹配历史人文偏好'); }
  if (/自然|风景|摄影/.test(profile) && /湖|公园|湿地|植物园|山|风景/.test(text)) { score += 30; notes.push('匹配自然景观或摄影偏好'); }
  return { score, excluded: strenuous && lowMobility, note: notes[0] || `已结合“${request.preferences || '综合体验'}”和旅行限制进行二次排序`, caution: cautions[0] || '' };
}

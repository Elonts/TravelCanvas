const normalize = value => value.replace(/[\s（）()·]/g, '').toLowerCase();
const scenicStem = name => normalize((name.split(/[-—–·]/)[0] || name));

/** Keep the main scenic POI when AMap returns both a parent and its internal child POIs. */
export function collapseScenicChildren(candidates) {
  const byPoi = new Map(candidates.map(candidate => [candidate.poiId, candidate]));
  const childEvidence = new Map();
  for (const candidate of candidates) {
    const parent = candidate.parentPoiId ? byPoi.get(candidate.parentPoiId) : null;
    if (parent) childEvidence.set(parent.poiId, [...(childEvidence.get(parent.poiId) || []), candidate]);
  }
  const retained = candidates.filter(candidate => {
    if (candidate.parentPoiId && byPoi.has(candidate.parentPoiId)) return false;
    if (candidate.parentPoiId) return !candidates.some(main => main.city === candidate.city && main.poiId !== candidate.poiId && scenicStem(candidate.name) === normalize(main.name));
    return true;
  });
  return retained.map(candidate => {
    const children = childEvidence.get(candidate.poiId) || [];
    if (!children.length) return candidate;
    const guideEvidence = [...candidate.guideEvidence, ...children.flatMap(child => child.guideEvidence)].filter((item, index, all) => all.findIndex(other => other.sourceId === item.sourceId && other.quote === item.quote) === index).slice(0, 5);
    const childNames = children.map(child => child.name).slice(0, 3);
    return { ...candidate, rootPoiId: candidate.poiId, scenicRole: 'main', guideEvidence, guideScore: Math.max(candidate.guideScore, ...children.map(child => child.guideScore)), introduction: childNames.length ? `${candidate.introduction} 攻略还提及园内的${childNames.join('、')}，通常随主景区一并游览。` : candidate.introduction };
  });
}

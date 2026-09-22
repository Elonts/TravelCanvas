import type { RouteLeg } from '../lib/food-types';

const serviceTime = (value?: string) => value && /^\d{4}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2)}` : value || '';

export function TransitDetails({ leg, compact = false }: { leg: RouteLeg; compact?: boolean }) {
  if (!leg.transitSteps?.length) return <p className="transit-pending">公共交通线路详情待 Provider 返回，请在出发前用高德确认实时方案。</p>;
  return <div className={`transit-steps ${compact ? 'compact' : ''}`}>{leg.transitSteps.map((step, index) => <div className={`transit-step ${step.kind}`} key={`${step.kind}-${index}`}>
    <span className="transit-step-icon">{step.kind === 'walk' ? '走' : step.kind === 'subway' ? '铁' : '车'}</span>
    <div><b>{step.kind === 'walk' ? step.instruction : step.lineName || step.instruction}</b>
      {step.kind !== 'walk' && <p>{step.fromStop || '上车站待确认'} → {step.toStop || '下车站待确认'}{step.viaStops !== null && step.viaStops !== undefined ? ` · 途经 ${step.viaStops} 站` : ''}</p>}
      <small>{step.minutes ? `约 ${step.minutes} 分钟` : '时长待确认'}{step.meters ? ` · ${step.meters} 米` : ''}{step.firstTime || step.lastTime ? ` · 首末班线索 ${serviceTime(step.firstTime)}–${serviceTime(step.lastTime)}` : ''}</small>
    </div>
  </div>)}</div>;
}

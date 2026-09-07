'use client';

import { useMemo, useState } from 'react';
import { chinaRegions } from '../lib/china-regions.mjs';

export function CityMultiSelect({ value, onChange }: { value: string[]; onChange: (cities: string[]) => void }) {
  const [query, setQuery] = useState('');
  const regions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return chinaRegions;
    return chinaRegions.map(region => ({ ...region, cities: region.cities.filter(city => `${region.province}${city}`.toLowerCase().includes(keyword)) })).filter(region => region.cities.length);
  }, [query]);
  const toggle = (city: string) => onChange(value.includes(city) ? value.filter(item => item !== city) : [...value, city]);

  return <div className="city-select">
    <details>
      <summary aria-label="选择一个或多个目的地城市">
        <span>{value.length ? `已选 ${value.length} 个城市` : '请选择目的地城市'}</span><b aria-hidden>⌄</b>
      </summary>
      <div className="city-menu">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索省份或城市" aria-label="搜索省份或城市" />
        <div className="city-groups">
          {regions.map(region => <section key={region.province}>
            <h4>{region.province}</h4>
            <div>{region.cities.map(city => <label key={city} className="city-option">
              <input type="checkbox" checked={value.includes(city)} onChange={() => toggle(city)} disabled={!value.includes(city) && value.length >= 10} />
              <span>{city}</span>
            </label>)}</div>
          </section>)}
          {!regions.length && <p>没有匹配的城市</p>}
        </div>
      </div>
    </details>
    <div className="selected-cities" aria-live="polite">
      {value.map((city, index) => <button key={city} type="button" className="city-chip" onClick={() => toggle(city)} title={`移除 ${city}`}><span>{index + 1}</span>{city} ×</button>)}
    </div>
    <small>最多选择 10 个城市；每个城市至少安排 1 天。生成后会根据出发地重新计算顺路顺序。</small>
  </div>;
}

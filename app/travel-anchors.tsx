'use client';

import { useState } from 'react';

export type VerifiedPlace = { poiId: string; name: string; address: string; lng: number; lat: number };
export type HotelDraft = { city: string; name: string; addressHint: string; checkIn: string; checkOut: string; verified?: VerifiedPlace };
export type IntercityLegDraft = { fromCity: string; toCity: string; mode: 'high_speed_rail' | 'train' | 'flight' | 'drive'; departureHub?: VerifiedPlace; arrivalHub?: VerifiedPlace; departureAt: string; arrivalAt: string; tripNo: string };

const modeLabels = { high_speed_rail: '高铁', train: '普通火车', flight: '飞机', drive: '自驾' };

async function searchPlace(city: string, query: string, kind: 'hotel' | 'station' | 'airport') {
  const response = await fetch('/api/places/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, query, kind }) });
  const json = await response.json();
  if (!response.ok) throw Error(json.error || '地点查询失败');
  return json.candidates as VerifiedPlace[];
}

export function TravelAnchors({ destinations, hotels, onHotelsChange, legs, onLegsChange, startDate, endDate }: {
  destinations: string[]; hotels: HotelDraft[]; onHotelsChange: (hotels: HotelDraft[]) => void;
  legs: IntercityLegDraft[]; onLegsChange: (legs: IntercityLegDraft[]) => void; startDate: string; endDate: string;
}) {
  const [hotelCandidates, setHotelCandidates] = useState<Record<number, VerifiedPlace[]>>({});
  const [hubCandidates, setHubCandidates] = useState<Record<string, VerifiedPlace[]>>({});
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const updateHotel = (index: number, patch: Partial<HotelDraft>, invalidate = false) => onHotelsChange(hotels.map((hotel, i) => i === index ? { ...hotel, ...patch, ...(invalidate ? { verified: undefined } : {}) } : hotel));
  const updateLeg = (index: number, patch: Partial<IntercityLegDraft>) => onLegsChange(legs.map((leg, i) => i === index ? { ...leg, ...patch } : leg));

  const verifyHotel = async (index: number) => {
    const hotel = hotels[index]; setBusyKey(`hotel:${index}`); setError('');
    try {
      const candidates = await searchPlace(hotel.city, [hotel.name, hotel.addressHint].filter(Boolean).join(' '), 'hotel');
      setHotelCandidates(current => ({ ...current, [index]: candidates }));
      if (!candidates.length) throw Error('没有找到匹配酒店，请补充完整名称或分店地址。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '酒店核验失败'); }
    finally { setBusyKey(''); }
  };
  const findHubs = async (index: number, side: 'departure' | 'arrival') => {
    const leg = legs[index]; const city = side === 'departure' ? leg.fromCity : leg.toCity; const kind = leg.mode === 'flight' ? 'airport' : 'station';
    const key = `${index}:${side}`; setBusyKey(key); setError('');
    try {
      const candidates = await searchPlace(city, `${city}${kind === 'airport' ? '机场' : leg.mode === 'high_speed_rail' ? '高铁站' : '火车站'}`, kind);
      setHubCandidates(current => ({ ...current, [key]: candidates }));
      if (!candidates.length) throw Error(`没有找到${city}的可用${kind === 'airport' ? '机场' : '车站'}。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '站点查询失败'); }
    finally { setBusyKey(''); }
  };

  return <div className="travel-anchor-editor">
    <section className="anchor-block">
      <div className="anchor-heading"><div><b>已预订酒店</b><p>确认具体分店后，酒店会成为对应日期的实际路线起点或终点。</p></div><button type="button" className="secondary" disabled={!destinations.length || hotels.length >= 10} onClick={() => onHotelsChange([...hotels, { city: destinations[0], name: '', addressHint: '', checkIn: startDate, checkOut: endDate }])}>添加酒店</button></div>
      {hotels.map((hotel, index) => <article className="hotel-editor" key={index}>
        <div className="hotel-editor-main">
          <label>城市<select aria-label={`酒店 ${index + 1} 城市`} value={hotel.city} onChange={event => updateHotel(index, { city: event.target.value }, true)}>{destinations.map(city => <option key={city}>{city}</option>)}</select></label>
          <label className="hotel-name-field">酒店正式名称<input aria-label={`酒店 ${index + 1} 名称`} value={hotel.name} onChange={event => updateHotel(index, { name: event.target.value }, true)} maxLength={120} placeholder="输入完整酒店名或分店名" /></label>
        </div>
        <label className="hotel-address-field">地址或分店提示<input aria-label={`酒店 ${index + 1} 地址`} value={hotel.addressHint} onChange={event => updateHotel(index, { addressHint: event.target.value }, true)} maxLength={160} placeholder="例如：西湖区、湖滨路店" /></label>
        <div className="hotel-editor-dates">
          <label>入住<input aria-label={`酒店 ${index + 1} 入住日期`} type="date" value={hotel.checkIn} onChange={event => updateHotel(index, { checkIn: event.target.value })} /></label>
          <label>退房<input aria-label={`酒店 ${index + 1} 退房日期`} type="date" value={hotel.checkOut} onChange={event => updateHotel(index, { checkOut: event.target.value })} /></label>
        </div>
        <div className="anchor-actions"><button type="button" className="secondary" disabled={!hotel.name.trim() || busyKey === `hotel:${index}`} onClick={() => verifyHotel(index)}>{busyKey === `hotel:${index}` ? '正在查询…' : hotel.verified ? '重新核验酒店' : '核验酒店位置'}</button><button type="button" className="text-button" onClick={() => onHotelsChange(hotels.filter((_, i) => i !== index))}>删除</button></div>
        {hotel.verified && <p className="verified-place"><b>✓ 位置已核验：</b>{hotel.verified.name} · {hotel.verified.address}</p>}
        {!!hotelCandidates[index]?.length && !hotel.verified && <div className="place-candidates" aria-label="酒店候选">{hotelCandidates[index].map(place => <button type="button" key={place.poiId} onClick={() => updateHotel(index, { name: place.name, addressHint: place.address, verified: place })}><b>{place.name}</b><span>{place.address}</span></button>)}</div>}
      </article>)}
      {!hotels.length && <p className="anchor-empty">尚未添加酒店。没有预订酒店时，系统会继续提供住宿区域建议。</p>}
    </section>

    <section className="anchor-block">
      <div className="anchor-heading"><div><b>跨城交通</b><p>每一段单独设置。非自驾必须确认站点，并填写预计出发和到达时间。</p></div></div>
      {legs.map((leg, index) => <article className="intercity-editor" key={`${leg.fromCity}-${leg.toCity}`}>
        <div className="intercity-title"><b>{leg.fromCity} → {leg.toCity}</b><label>方式<select aria-label={`${leg.fromCity}到${leg.toCity}交通方式`} value={leg.mode} onChange={event => updateLeg(index, { mode: event.target.value as IntercityLegDraft['mode'], departureHub: undefined, arrivalHub: undefined })}>{Object.entries(modeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        {leg.mode === 'drive' ? <p className="verified-place">自驾跨城段将使用高德驾车路线估算距离与时间，并与抵达后的本地行程衔接。</p> : <>
          <div className="hub-grid">{(['departure', 'arrival'] as const).map(side => {
            const selected = side === 'departure' ? leg.departureHub : leg.arrivalHub; const key = `${index}:${side}`;
            return <div className="hub-picker" key={side}><span>{side === 'departure' ? '出发站/机场' : '到达站/机场'}</span><button type="button" className="secondary" onClick={() => findHubs(index, side)} disabled={busyKey === key}>{busyKey === key ? '查询中…' : selected ? '重新选择' : '查询候选'}</button>{selected && <p className="verified-place"><b>✓ {selected.name}</b><br />{selected.address}</p>}{!!hubCandidates[key]?.length && !selected && <div className="place-candidates">{hubCandidates[key].map(place => <button type="button" key={place.poiId} onClick={() => updateLeg(index, side === 'departure' ? { departureHub: place } : { arrivalHub: place })}><b>{place.name}</b><span>{place.address}</span></button>)}</div>}</div>;
          })}</div>
          <div className="intercity-times"><label>预计出发<input type="datetime-local" value={leg.departureAt} onChange={event => updateLeg(index, { departureAt: event.target.value })} /></label><label>预计到达<input type="datetime-local" value={leg.arrivalAt} onChange={event => updateLeg(index, { arrivalAt: event.target.value })} /></label><label>班次 / 航班号（可选）<input value={leg.tripNo} onChange={event => updateLeg(index, { tripNo: event.target.value })} maxLength={40} placeholder="如 G123 / MU5101" /></label></div>
        </>}
      </article>)}
    </section>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}

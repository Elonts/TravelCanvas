const pending = (city, date, message = '该日期暂不可预报') => ({ city, date, summary: message, high: null, low: null, rain: null, state: 'pending', provider: '暂无可用天气数据', issuedAt: null, queriedAt: new Date().toISOString() });

const weatherText = code => Number(code) >= 60 ? '有雨，建议优先室内活动' : Number(code) >= 3 ? '多云，出行舒适' : '晴朗，适合户外活动';

export async function queryWeather(city, date, location, env = process.env, fetcher = fetch) {
  const queriedAt = new Date().toISOString();
  if (env.AMAP_API_KEY && location?.adcode) {
    try {
      const url = new URL('https://restapi.amap.com/v3/weather/weatherInfo');
      url.search = new URLSearchParams({ key: env.AMAP_API_KEY, city: location.adcode, extensions: 'all', output: 'JSON' }).toString();
      const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const data = await response.json();
      const forecast = data.status === '1' ? data.forecasts?.[0] : null;
      const cast = forecast?.casts?.find(item => item.date === date);
      const high = Number(cast?.daytemp), low = Number(cast?.nighttemp);
      if (cast && Number.isFinite(high) && Number.isFinite(low)) return { city, date, summary: `${cast.dayweather}${cast.nightweather && cast.nightweather !== cast.dayweather ? `转${cast.nightweather}` : ''}`, high: Math.round(high), low: Math.round(low), rain: null, state: 'live', provider: '高德天气', issuedAt: forecast.reporttime || null, queriedAt };
    } catch { /* Fall through to coordinate-based forecast. */ }
  }
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return pending(city, date, '城市坐标未核验，天气暂不可预报');
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(location.lat), longitude: String(location.lng), daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: 'Asia/Shanghai', start_date: date, end_date: date }).toString();
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return pending(city, date);
    const data = await response.json();
    const high = Number(data.daily?.temperature_2m_max?.[0]), low = Number(data.daily?.temperature_2m_min?.[0]), rain = Number(data.daily?.precipitation_probability_max?.[0]);
    if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(rain)) return pending(city, date);
    return { city, date, summary: weatherText(data.daily?.weather_code?.[0]), high: Math.round(high), low: Math.round(low), rain: Math.round(rain), state: 'live', provider: 'Open-Meteo', issuedAt: null, queriedAt };
  } catch { return pending(city, date); }
}

export type Stop = { id: string; poiId?: string; city: string; kind?: 'attraction' | 'entertainment'; time: string; name: string; address: string; detail: string; duration: string; durationMinutes?: number; cost: number; costPending?: boolean; indoor: boolean; lng: number; lat: number; verified: boolean; navigationUrl?: string | null };
export type Day = { title: string; city: string; date: string; stops: Stop[]; warning?: string };
const cities: Record<string, Omit<Stop, 'id' | 'city' | 'time' | 'detail' | 'duration' | 'cost'>[]> = {
  北京: [
    { name: '故宫博物院', address: '北京市东城区景山前街4号', indoor: true, lng: 116.397, lat: 39.918, verified: false },
    { name: '景山公园', address: '北京市西城区景山西街44号', indoor: false, lng: 116.397, lat: 39.925, verified: false },
    { name: '天坛公园', address: '北京市东城区天坛东里甲1号', indoor: false, lng: 116.413, lat: 39.882, verified: false },
    { name: '国家博物馆', address: '北京市东城区东长安街16号', indoor: true, lng: 116.407, lat: 39.903, verified: false }
  ],
  杭州: [
    { name: '西湖风景名胜区', address: '杭州市西湖区龙井路1号', indoor: false, lng: 120.13, lat: 30.233, verified: false },
    { name: '中国茶叶博物馆（双峰馆区）', address: '杭州市西湖区龙井路88号', indoor: true, lng: 120.11, lat: 30.216, verified: false },
    { name: '灵隐寺', address: '杭州市西湖区法云弄1号', indoor: true, lng: 120.101, lat: 30.24, verified: false },
    { name: '河坊街', address: '杭州市上城区河坊街', indoor: false, lng: 120.171, lat: 30.229, verified: false }
  ],
  成都: [
    { name: '成都大熊猫繁育研究基地', address: '成都市成华区熊猫大道1375号', indoor: false, lng: 104.146, lat: 30.735, verified: false },
    { name: '四川博物院', address: '成都市青羊区浣花南街251号', indoor: true, lng: 104.024, lat: 30.655, verified: false },
    { name: '宽窄巷子', address: '成都市青羊区金河路口宽窄巷子', indoor: false, lng: 104.049, lat: 30.669, verified: false },
    { name: '锦里古街', address: '成都市武侯区武侯祠大街231号', indoor: false, lng: 104.049, lat: 30.643, verified: false }
  ]
};
export function candidateStops(destination: string): Stop[] {
  const key = Object.keys(cities).find(city => destination.includes(city));
  const source = key ? cities[key] : [];
  return source.map((stop, index) => ({ ...stop, city: destination, kind: 'attraction', id: `stop-${index}`, time: ['09:00','11:30','14:30','17:30'][index], detail: index === 0 ? '作为当天核心体验，建议提前确认预约。' : '与相邻地点安排在同一片区，减少往返。', duration: index === 0 ? '约 2 小时' : '约 1–1.5 小时', cost: [60, 40, 80, 50][index] }));
}

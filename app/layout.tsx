import './globals.css';
import './features.css';
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/700.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'TravelCanvas · 中国旅行规划', description: '可信、可调整的中国旅行方案' };

const directionContract = {
  thesis: '地图是贯穿需求、候选和行程的工作画布，拒绝长表单先行和后台式卡片墙。',
  ownWorld: '深墨绿夜空与写实山湖承载沉浸式极光，米纸表面保护操作清晰；茶山绿负责行动和核验，陶土橙只负责方向提醒。',
  story: '用户先用必要信息开始发现，再选择已核验地点，最后看到 Provider 支持的真实路线。',
  firstViewport: '桌面首屏以深色极光与写实山湖建立旅行情绪，左侧完成路线输入，右侧地图画布立即解释下一步；移动端依次呈现价值、输入与路线画布。',
  form: 'Immersive Aurora Route-first Canvas，延续已确认方向并用 seed 6ef55e8f 收敛实现。',
  finish: 'unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance'
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>
    <script id="impeccable-direction-contract" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(directionContract) }} />
    {children}
  </body></html>;
}

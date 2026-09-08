import './globals.css';
import './features.css';
import '@fontsource/noto-serif-sc/600.css';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/700.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'TravelCanvas · 中国旅行规划', description: '可信、可调整的中国旅行方案' };

const directionContract = {
  thesis: '地图是贯穿需求、候选和行程的工作画布，拒绝长表单先行和后台式卡片墙。',
  ownWorld: '暖砂与米纸表面，茶山绿负责行动和核验，陶土橙只负责方向提醒；组件紧凑、轻微浮起。',
  story: '用户先用必要信息开始发现，再选择已核验地点，最后看到 Provider 支持的真实路线。',
  firstViewport: '桌面左侧为标题与紧凑启程面板，右侧为更大的目的地画布；主操作在左栏表单末尾持续清晰。',
  form: 'Route-first Canvas，结构候选第 3 位，seed 6ef55e8f。',
  finish: 'unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance'
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>
    <script id="impeccable-direction-contract" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(directionContract) }} />
    {children}
  </body></html>;
}

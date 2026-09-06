import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'TravelCanvas · 中国旅行规划', description: '可信、可调整的中国旅行方案' };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }

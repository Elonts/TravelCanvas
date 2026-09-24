# TravelCanvas 协作约定

## 强制交付流程

1. 每次完成任何改动后，必须创建一个对应的 Git commit，确保后续可以追踪和回滚。
2. 每次改动后，必须编写或更新与改动相关的测试；如果改动无法自动测试，必须记录并执行可复现的验证步骤。
3. 交付给用户前，必须运行所有相关测试、静态检查和必要的手动验证；存在失败时不得宣称完成。
4. Commit 应保持单一、清晰的主题，使用描述性提交信息。不得将无关改动混入同一提交。

## 安全与数据约定

- 第三方服务端 API 密钥只允许读取环境变量或本地 `.env.local`，绝不能放入浏览器代码、文档示例、日志或 Git 提交。高德 JS API 的浏览器 Key 与安全密钥是唯一例外：只从 `NEXT_PUBLIC_AMAP_JS_KEY` / `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` 注入，并必须在高德控制台限制可用域名；不得与服务端 `AMAP_API_KEY` 共用。
- `.env*` 文件不得提交；仅允许提交不含真实值的 `.env.example`。
- 地图路线、天气、酒店价格和库存属于时效数据，页面必须标示数据来源和查询时间。
- AI 输出是建议，不得伪装成已验证事实。地点、路线、天气和酒店信息须由对应 Provider 校验或明确标为“待确认”。

## 产品与技术边界

- 当前阶段仅服务中国境内旅行，地图能力优先使用高德 Provider。
- 酒店只做搜索、展示和跳转预订，不实现站内支付、订单或售后。
- 第三方服务只能由服务端调用；前端通过内部 API 获取经过标准化的数据。
- 优先保持单体 Next.js/Node 架构；在规模与复杂度明确前，不拆分微服务。

## 候选发现、内容证据与路线交互

- 旅行规划采用“两阶段”流程：先根据偏好和限制发现景区、饭店与娱乐候选，展示图片、简介、来源和状态；用户勾选后，才对已选地点生成日程与路线图。
- 用户勾选的候选视为明确意图。路线规划应优先保留已选地点；若预算、营业、饮食禁忌、有效坐标或时间约束导致无法安排，必须说明原因，不得静默替换或伪造可行性。
- 真实地点图片优先使用高德 POI 等可追溯 Provider 返回的图片；高德缺图时可由 Tavily 联网搜索图片。两类图片均须经服务端受控代理提供，并显示来源与查询时间；搜索结果不得标成官方图片，仍缺图时使用明确的类别占位图。不得用 AI 生成图片冒充真实景区、饭店或娱乐场所。
- 景点与美食发现默认使用 Tavily 搜索公开收录的小红书笔记。用户明确启用本地浏览器扩展时，扩展可复用用户已登录的小红书网页，按用户发起的目的地查询读取前 20 条页面可见搜索结果；不得读取、导出或保存 Cookie、Token、密码及非当前查询页面数据，不得绕过验证码、登录限制或平台安全机制。AI 仅从搜索摘要、页面可见文本或用户提供正文中提取逐字可定位的地点与证据；所有地点仍须经高德同城 POI 核验，页面必须区分 Tavily 公开索引与登录态搜索，并不得把热度代理包装成小红书官方榜单。
- 美食候选必须用高德核验具体 POI、分店、地址与坐标后才可参与路线；同品牌不同分店不得继承其他分店的笔记证据。排序综合独立来源、发布时间、口味匹配、预算与绕路约束。
- 每个已安排地点提供高德导航入口，使用经过服务端校验的 POI ID、名称和坐标。页面应区分“在高德查看/导航”和“已开始导航”；浏览器或高德仍需用户确认时不得宣称自动开始。
- 候选、路线、图片、攻略证据和导航链接必须携带或继承数据来源、查询时间与待确认状态；第三方失败时可降级，但不得用无来源内容冒充实时结果。

## 文档与代码质量

- 产品方向或架构变化时，同步更新 `产品方案.md` 或 `技术方案.md`。
- 新增外部 Provider 时，定义内部统一数据结构并实现超时、错误提示和降级处理。
- 保持 TypeScript/JavaScript 的输入、响应和模型输出可校验；修改服务端行为时，至少更新冒烟测试。
- 尊重已有用户改动；不使用破坏性 Git 命令覆盖未提交内容。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

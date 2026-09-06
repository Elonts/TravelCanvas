# TravelCanvas 协作约定

## 强制交付流程

1. 每次完成任何改动后，必须创建一个对应的 Git commit，确保后续可以追踪和回滚。
2. 每次改动后，必须编写或更新与改动相关的测试；如果改动无法自动测试，必须记录并执行可复现的验证步骤。
3. 交付给用户前，必须运行所有相关测试、静态检查和必要的手动验证；存在失败时不得宣称完成。
4. Commit 应保持单一、清晰的主题，使用描述性提交信息。不得将无关改动混入同一提交。

## 安全与数据约定

- 第三方 API 密钥只允许读取环境变量或本地 `.env.local`，绝不能放入浏览器代码、文档示例、日志或 Git 提交。
- `.env*` 文件不得提交；仅允许提交不含真实值的 `.env.example`。
- 地图路线、天气、酒店价格和库存属于时效数据，页面必须标示数据来源和查询时间。
- AI 输出是建议，不得伪装成已验证事实。地点、路线、天气和酒店信息须由对应 Provider 校验或明确标为“待确认”。

## 产品与技术边界

- 当前阶段仅服务中国境内旅行，地图能力优先使用高德 Provider。
- 酒店只做搜索、展示和跳转预订，不实现站内支付、订单或售后。
- 第三方服务只能由服务端调用；前端通过内部 API 获取经过标准化的数据。
- 优先保持单体 Next.js/Node 架构；在规模与复杂度明确前，不拆分微服务。

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

---
name: TravelCanvas
description: 以真实地点与路线校验旅行灵感的中国自由行规划画布
colors:
  tea-green: "#1f6255"
  deep-tea: "#17483f"
  terracotta: "#d96e4f"
  pine-ink: "#17322d"
  mist-text: "#64746e"
  warm-sand: "#f4f0e7"
  rice-paper: "#fffdf8"
  stone-line: "#d9d5c9"
  soft-tea: "#dfeae2"
  soft-terracotta: "#f7e3d8"
  map-water: "#d9e9e3"
  map-land: "#ece8dc"
  danger: "#a3382a"
typography:
  display:
    fontFamily: '"Noto Serif SC", Georgia, serif'
    fontSize: "clamp(43px, 4.45vw, 68px)"
    fontWeight: 600
    lineHeight: 1.13
    letterSpacing: "-0.055em"
  headline:
    fontFamily: '"Noto Sans SC", "Microsoft Yahei", sans-serif'
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"Noto Sans SC", "Microsoft Yahei", sans-serif'
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: '"Noto Sans SC", "Microsoft Yahei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: '"Noto Sans SC", "Microsoft Yahei", sans-serif'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  xs: "3px"
  sm: "7px"
  md: "9px"
  lg: "13px"
  canvas: "18px"
  full: "999px"
spacing:
  xs: "5px"
  sm: "8px"
  md: "13px"
  lg: "18px"
  panel: "25px"
  xl: "28px"
  section: "42px"
components:
  button-primary:
    backgroundColor: "{colors.tea-green}"
    textColor: "{colors.rice-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "14px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.tea-green}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  field:
    backgroundColor: "#ffffff"
    textColor: "{colors.pine-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "11px 12px"
  planning-panel:
    backgroundColor: "{colors.rice-paper}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.lg}"
    padding: "25px"
  content-card:
    backgroundColor: "{colors.rice-paper}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.lg}"
    padding: "18px"
  selected-chip:
    backgroundColor: "{colors.soft-tea}"
    textColor: "{colors.tea-green}"
    rounded: "{rounded.full}"
    padding: "6px 9px"
  journey-canvas:
    backgroundColor: "{colors.map-land}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.canvas}"
---

# Design System: TravelCanvas

## Overview

**Creative North Star: "路线先行的城市探索画布"**

TravelCanvas 把地图从结果附件提升为贯穿规划过程的工作画布：用户在左侧快速输入必要条件，右侧持续呈现从未查询概览、已核验候选点位到 Provider 支持路线的真实状态。界面像一张正在形成的旅行手稿，既保留暖纸、山水与定位针带来的期待感，也始终明确哪些信息已核验、哪些仍待确认。

整体气质便捷、高效、可信。暖砂背景与米纸表面承载长流程，茶绿色聚焦执行与核验，陶土色只负责方向、进度和提醒；本地中文衬线标题带来编辑感，本地无衬线正文保持表单、来源和行程信息清楚可扫。系统允许信息丰富，但不演变成企业后台、指标墙或同权重卡片阵列。

**Key Characteristics:**

- 规划左栏与持续路线画布构成不对称主舞台
- 暖砂、米纸、茶绿和陶土色形成克制的自然旅行语境
- Noto Serif SC 标题与 Noto Sans SC 任务正文分工清晰
- 高级条件渐进展开，必要信息与唯一主操作优先
- 画布诚实经历概览、候选和真实路线三种状态
- 来源、查询时间、待确认与降级说明是界面的一部分

## Colors

色彩取自茶山、陶土和旅行纸张；低饱和中性色负责承载，茶绿色与陶土色以稀缺方式表达行动和方向。

### Primary

- **茶绿:** 主按钮、链接、选中状态、已核验状态与真实路线的稳定行动色。
- **深茶绿:** 主操作悬停、重点说明和需要更高对比度的可信文字。

### Secondary

- **陶土色:** 首屏方向提示、状态点、时间和非阻止性提醒；不与主按钮竞争。
- **柔陶土:** 提醒、移除和轻度风险操作的低强度背景。

### Neutral

- **松墨色:** 标题、正文与高优先级信息，比纯黑更适合暖色页面。
- **雾灰字:** 辅助说明、来源、查询时间和次级元数据。
- **暖砂:** 页面底色，将长流程统一在同一张旅行画布中。
- **米纸:** 表单、卡片、地图浮层和粘性操作的前景表面。
- **石线:** 字段、面板、卡片与分隔线的细边界。
- **柔茶绿:** 已选、推荐与正向分组的浅背景。
- **地图水色 / 地图陆色:** 未查询与候选阶段的抽象地图材质；不伪装成真实底图。
- **风险红:** 只用于错误与阻止性风险。

### Named Rules

**The Green Means Action Rule.** 茶绿色优先表示可执行、已选择或已核验，不把它稀释成大面积装饰。

**The Orange Guides Rule.** 陶土色用于方向、时间和提醒；一个视区只建立少量陶土色焦点。

**The Map Is Honest Rule.** 抽象地图色只表达画布状态；真实道路、路线和地点事实必须来自对应 Provider，或明确标为待确认。

## Typography

**Display Font:** 本地加载的 Noto Serif SC，回退至 Georgia 与系统衬线字体

**Body Font:** 本地加载的 Noto Sans SC，回退至 Microsoft Yahei 与系统无衬线字体

**Character:** 中文衬线主标题提供旅行编辑感与记忆点，无衬线正文负责速度、密度和数据可信度。字体文件随应用本地加载，避免把外部字体网络作为首屏依赖。

### Hierarchy

- **Display** (600, fluid 43–68px, line-height 1.13): 只用于首屏宣言；窄屏通过流式字号收缩，不进入表单与地图数据。
- **Headline** (700, 20–22px, line-height 1.35): 用于规划面板、候选阶段与地图模块的一级标题。
- **Title** (700, 16–20px, line-height 1.45): 用于地点、日程、卡片与弹层标题。
- **Body** (400, 14–15px, line-height 1.65–1.75): 用于任务正文、表单值与说明；长文本保留足够行距。
- **Label** (700, 10–12px, line-height 1.5): 用于字段标签、来源、状态和紧凑操作，不依赖全大写或夸张字距制造层级。

### Named Rules

**The Serif Marks the Promise Rule.** Noto Serif SC 只承载首屏旅行承诺；表单、候选、地图、预算、来源与按钮全部使用 Noto Sans SC。

**The Local Type Rule.** 核心中文字体必须随应用本地交付；回退字体只负责故障容错，不定义视觉方向。

## Layout

页面主体最大宽度为 1480px，桌面两侧内边距为 28px。1050px 以上采用不对称的 Route-first Canvas 网格：左侧至少 410px，承载首屏说明、紧凑规划面板和阶段内容；右侧至少 560px，承载更大的粘性路线画布。首屏和后续结果共享同一张画布，而不是在流程末尾额外插入一张地图。

必要表单为两列网格，出发地和目的地跨满两列，日期、天数和人数保持紧凑；预算、交通、偏好、限制与餐饮证据位于渐进披露区。候选卡在桌面规划栏中单列，在 761–1050px 的中等宽度内容区恢复为两列，确保信息密度随可用宽度变化。

1050px 以下按“规划—地图—阶段内容”单列排列，地图取消粘性并保持完整可读高度；760px 以下缩小页面与面板内边距、降低画布高度并把结果侧栏改为单列；520px 以下表单和卡片完全单列，城市选择器使用受控的固定浮层。所有断点禁止水平溢出和桌面、地图内部的双重滚动。

空间节奏以 5、8、13、18、25、28 和 42px 为主。小间距维持标签、状态与字段关联，中等间距组织面板内容，大间距区分规划阶段；密度靠分组与留白管理，不靠增加容器层级。

**The Canvas Persists Rule.** 需求、候选与行程改变的是画布状态，不改变画布在任务中的主位置。

**The Mobile Story Rule.** 窄屏顺序固定为规划、地图、阶段内容，让用户先行动、再看空间结果、最后处理细节。

## Elevation & Depth

系统默认平整，普通面板和内容卡依靠米纸表面与 1px 石线边界建立层次。阴影只出现在需要明确覆盖关系的路线画布、城市选择菜单、地图详情、粘性选择条、地图定位针和当前选中卡；静态嵌套内容不重复加阴影。

### Shadow Vocabulary

- **路线画布环境影** (`0 22px 55px rgba(23, 50, 45, .14)`): 桌面主画布的唯一大面积环境阴影。
- **菜单浮层** (`0 18px 45px rgba(23, 50, 45, .18)`): 城市选择等临时覆盖层。
- **地图详情浮层** (`0 8px 28px rgba(23, 50, 45, .15)`): 真实地图地点详情。
- **粘性选择条** (`0 10px 35px rgba(23, 50, 45, .15)`): 候选阶段的底部提交操作。
- **地图定位针** (`0 4px 12px rgba(23, 50, 45, .33)`): 编号定位针从底图中分离。
- **选中描边** (`0 0 0 2px rgba(40, 88, 73, .13)`): 候选卡当前选择状态，不制造额外高度。

### Named Rules

**The Lift Has a Job Rule.** 阴影必须解释覆盖、粘性、定位或当前选择；没有交互层级就保持平整。

## Shapes

控件采用紧凑的 7px 圆角，字段组与小浮层使用 9px，普通内容表面使用 13px，路线画布使用 18px；胶囊状态只用于短状态与城市选择。边框通常为 1px，时间线可使用单条细线，待确认内容可使用虚线，但不以厚描边制造装饰。

圆形定位针带一个朝向尖角，是系统最具识别度的轮廓。候选阶段的点位可以复用该语言，但未生成真实路线前不得用连接线暗示道路可行性。其他按钮和卡片不复制定位针轮廓。

## Components

### Buttons

- **Shape:** 紧凑轻圆角矩形（7px）。
- **Primary:** 茶绿底、米纸白字，表单末尾横向铺满；每个阶段只保留一个最高权重操作。
- **Hover / Focus:** 悬停进入深茶绿；键盘焦点使用清晰的半透明茶绿外圈，不通过位移制造抖动。
- **Secondary:** 透明或柔茶绿背景、茶绿文字与细边框，用于添加、替换、核验和局部调整。
- **Disabled:** 保留标签与形状，降低透明度并改变光标；加载文案说明当前动作。

### Chips

- **Style:** 柔茶绿底、茶绿文字的紧凑胶囊；选中城市内含实心圆形序号。
- **State:** 选中、顺序和可移除性同时可见；未选筛选项使用透明表面与细边框。

### Cards / Containers

- **Corner Style:** 普通面板与卡片使用 13px 圆角，内部编辑与证据区使用 7–9px。
- **Background:** 米纸为主要表面；柔茶绿与更浅的灰绿色只用于语义分组。
- **Shadow Strategy:** 默认使用边框；阴影遵循 Elevation & Depth 的覆盖关系。
- **Border:** 1px 石线或浅茶灰；待确认与手动补充区可使用虚线。
- **Internal Padding:** 规划面板为 25px，普通卡片约 18px；760px 以下主要面板收至 19px。

### Inputs / Fields

- **Style:** 白色背景、1px 石线边框、7px 圆角与 11px × 12px 内边距；标签置于字段上方。
- **Focus:** 输入、按钮、链接和可展开摘要都必须提供同等级的可见键盘焦点；焦点状态不只依赖颜色。
- **Error / Disabled:** 错误使用风险红并保留可读文字；禁用和加载状态不得移除字段含义。

### Planning Panel

规划面板优先呈现出发地、目的地、日期、天数和人数，唯一主操作始终位于必要条件之后。预算、交通、偏好、限制、餐饮要求与公开笔记证据通过原生可展开区域渐进披露；折叠不能隐藏校验错误或阻止性反馈。

### Journey Canvas

路线画布是贯穿首页的签名组件。未查询时使用抽象水陆与道路纹理，并明确“不代表真实路线”；发现完成后按真实坐标显示已核验候选点，但不连接路线；生成方案后切换到 Provider 底图、编号路线、地点详情与来源时间。加载、空数据和 Provider 失败都在同一画布中给出可理解的状态或顺序降级。

### Candidate Card

候选卡按图片、名称、地址、推荐原因、约束标签与来源证据排序信息。宽屏规划栏采用约 122px 图片加内容的横向结构，中等宽度可两列，520px 以下转为上下结构。选中状态同时使用边框、轻外圈和明确操作文案，不只使用颜色。

### Notices

待确认、预约和软约束使用暖陶土提示面与深色文字；错误使用风险红。普通来源与查询时间保持雾灰，不与风险信息使用同一视觉重量。

### Motion & Accessibility

状态、边框和点位变化使用约 150ms 的短过渡；候选点进入约 280ms，按 55ms 错开；加载旋转只表达正在查询。动画不承载唯一信息，`prefers-reduced-motion` 下将动画和过渡压缩至近乎即时并关闭平滑滚动。正文与交互保持足够对比度，触控目标、焦点顺序、语义标签、`aria-busy` 和状态文本共同支持键盘与辅助技术。

## Do's and Don'ts

### Do:

- **Do** 让用户先填写最少必要条件，并把唯一主操作紧邻这些条件。
- **Do** 保持右侧画布在需求、候选和行程阶段持续存在，并诚实切换状态。
- **Do** 使用茶绿表达执行、选择和核验，使用陶土色表达方向、时间与提醒。
- **Do** 通过折叠、分组和响应式重排管理复杂条件，保持快速扫描。
- **Do** 将 Provider、查询时间、待确认和降级说明作为地图与地点内容的一部分。
- **Do** 为键盘焦点、加载、空数据、错误和减少动态效果提供等价体验。

### Don't:

- **Don't** 在真实 Provider 数据到达前绘制连接候选点的路线或暗示道路可行性。
- **Don't** 把首页改造成企业后台、指标墙或同权重卡片阵列。
- **Don't** 让高级条件阻塞首次发现，也不要静默隐藏它们产生的校验问题。
- **Don't** 把茶绿用作大面积装饰，或让陶土色与主操作竞争。
- **Don't** 在表单、地图数据、预算、来源和操作组件中使用衬线字体。
- **Don't** 给每一层嵌套卡片加阴影，或用动态效果替代状态文字。

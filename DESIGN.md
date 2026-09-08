---
name: TravelCanvas
description: 以可信数据校验旅行灵感的中国自由行规划界面
colors:
  tea-mountain-green: "#226054"
  pine-ink: "#18322e"
  pottery-orange: "#df7255"
  warm-sand: "#f6f4ee"
  rice-paper: "#fffdf8"
  mist-text: "#6b7671"
  stone-line: "#dedbd1"
  soft-tea: "#dcebe0"
  warning-wash: "#fff2eb"
  warning-ink: "#804031"
  danger: "#b83f31"
typography:
  display:
    fontFamily: 'Arial, "Microsoft Yahei", sans-serif'
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.07em"
  display-accent:
    fontFamily: "Georgia, serif"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.07em"
  headline:
    fontFamily: 'Arial, "Microsoft Yahei", sans-serif'
    fontSize: "24px"
    fontWeight: 700
  title:
    fontFamily: 'Arial, "Microsoft Yahei", sans-serif'
    fontSize: "18px"
    fontWeight: 700
  body:
    fontFamily: 'Arial, "Microsoft Yahei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: 'Arial, "Microsoft Yahei", sans-serif'
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.12em"
rounded:
  xs: "3px"
  sm: "7px"
  md: "10px"
  lg: "13px"
  full: "999px"
spacing:
  xs: "5px"
  sm: "8px"
  md: "13px"
  lg: "18px"
  xl: "28px"
  section: "46px"
components:
  button-primary:
    backgroundColor: "{colors.tea-mountain-green}"
    textColor: "{colors.rice-paper}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "13px 19px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.tea-mountain-green}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
  field:
    backgroundColor: "#ffffff"
    textColor: "{colors.pine-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "11px"
  panel:
    backgroundColor: "{colors.rice-paper}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.lg}"
    padding: "28px"
  card:
    backgroundColor: "{colors.rice-paper}"
    textColor: "{colors.pine-ink}"
    rounded: "{rounded.lg}"
    padding: "18px"
  chip-selected:
    backgroundColor: "{colors.soft-tea}"
    textColor: "{colors.tea-mountain-green}"
    rounded: "{rounded.full}"
    padding: "6px 9px"
---

# Design System: TravelCanvas

## Overview

**Creative North Star: "城市探索罗盘"**

TravelCanvas 的界面像一枚面向城市探索的精确罗盘：方向明确、信息可信、操作路径短，同时保留旅行本身的期待感。它用暖色纸张般的底色承载密集信息，以茶山绿表示可靠行动和已确认状态，再用陶土橙标记步骤、时间与需要注意的线索。

整体气质精准、高效、专业。组件采用紧凑而清楚的边界，页面以轻微浮起的层次帮助用户辨认当前操作、悬浮选择器和关键决策区，但不能演变为企业后台或数据仪表盘。内容丰富时依靠分组、折叠和留白保持阅读节奏，而不是堆叠更多颜色或装饰。

**Key Characteristics:**

- 暖砂底色上的纸张型内容表面
- 茶山绿主行动与陶土橙导航线索
- 高密度但有清晰阅读顺序的操作界面
- 轻微浮起、细边框与克制阴影共同建立层次
- 地点图片、路线和来源状态共同表达可信旅行感

## Colors

色彩来自自然旅行语境：茶山绿承担可信与行动，陶土橙承担方向和提醒，暖砂与米纸色提供长页面阅读所需的温度。

### Primary

- **茶山绿** (#226054): 用于主按钮、链接、地图路径、选中状态与已核验信息。它是页面中最稳定的行动信号。

### Secondary

- **陶土橙** (#df7255): 用于步骤眉题、时间和提醒边线。它负责引导注意，不与主按钮争夺操作优先级。

### Neutral

- **松墨色** (#18322e): 承担标题与主要正文，保持比纯黑更温和的阅读体验。
- **暖砂色** (#f6f4ee): 作为页面底色，将长流程统一在同一旅行画布中。
- **米纸色** (#fffdf8): 用于面板、卡片和内容容器，形成清楚但不生硬的前景表面。
- **雾灰字** (#6b7671): 用于说明、来源、查询时间和辅助信息。
- **石线色** (#dedbd1): 用于输入框、卡片和分隔线的细边界。
- **浅茶色** (#dcebe0): 用于已选、推荐和餐饮等正向分组背景。
- **警示暖底** (#fff2eb): 用于待确认、预约和软约束提示的背景。
- **警示棕** (#804031): 用于待确认、预约和软约束提示的文字。
- **风险红** (#b83f31): 只用于错误和阻止性风险。

### Named Rules

**The Green Means Action Rule.** 茶山绿优先表示可以执行、已经选择或已经核验的状态，不把它稀释成大面积装饰。

**The Orange Guides Rule.** 陶土橙用于指路和提醒；一个视区内只建立少量橙色焦点。

## Typography

**Display Font:** Arial，回退至 Microsoft Yahei 与系统无衬线字体  
**Display Accent Font:** Georgia，回退至系统衬线字体  
**Body Font:** Arial，回退至 Microsoft Yahei 与系统无衬线字体

**Character:** 主体排版直接、紧凑并适合扫描；首屏标题中的局部 Georgia 斜体提供旅行编辑感。衬线字体是有限的情绪强调，不进入表单、数据和操作组件。

### Hierarchy

- **Display** (700, 52px, line-height 1.08): 仅用于首屏主标题；760px 以下收至 40px，520px 以下收至 36px。
- **Headline** (700, 24px): 用于页面阶段和城市层级标题。
- **Title** (700, 16–20px): 用于地点、餐厅、地图和卡片标题。
- **Body** (400, 12–14px, line-height 1.5–1.8): 用于正文和说明；较长内容控制在可扫描的卡片或折叠区域内。
- **Label** (700, 10–13px, letter-spacing 0.12em): 用于步骤眉题、状态和来源类别。

### Named Rules

**The Serif Is a Destination Rule.** Georgia 只出现在能承载旅行情绪的短标题强调中；所有任务操作保持无衬线字体。

## Layout

页面主体最大宽度为 1160px，桌面端左右留出 26px 内边距，底部为长行程预留 80px。首屏采用约 2:1 的不对称双栏；旅行需求使用三栏表单；结果区采用主行程栏加 300px 信息侧栏；候选地点采用两列卡片网格。

空间密度以 5、8、13、18、28 和 46px 的递进节奏为主。小间距服务于标签和紧密关联的信息，中间距服务于字段、卡片内容及操作组，大间距负责阶段分隔。

760px 以下，首屏和结果主次栏改为单列，表单保留两列，候选卡与每日指南改为单列。520px 以下，表单完全单列，面板内边距从 28px 收至 18px，标题与选择条改为纵向排列；城市选择器变为固定浮层。所有移动布局必须避免横向溢出。

**The Journey Before Dashboard Rule.** 页面可以高密度，但必须按照“需求—候选—路线”的旅行任务推进；不使用后台式左侧导航、指标墙或无意义数据卡阵列。

## Elevation & Depth

系统采用轻微浮起的层次。普通面板与卡片依靠米纸色、细边框和暖砂背景分离；阴影集中用于城市选择菜单、地图浮层、选中卡和底部粘性操作条等需要明确覆盖关系的元素。静态内容不普遍堆叠阴影。

### Shadow Vocabulary

- **菜单浮层** (`0 18px 45px #18322e2e`): 柔和的大范围深绿透明阴影，用于城市选择等临时覆盖层。
- **地图信息浮层** (`0 8px 28px #18322e26`): 更轻的环境阴影，与半透明米纸背景及模糊共同使用。
- **关键操作浮层** (`0 10px 35px #18322e26`): 中等范围阴影，用于底部粘性选择条，说明它悬浮在候选内容之上。
- **选中描边** (`0 0 0 2px #28584922`): 极浅茶山绿外圈，用于候选卡选中状态，而不是制造真实高度。

### Named Rules

**The Lift Has a Job Rule.** 只有浮层、粘性操作或当前选中项可以获得阴影；阴影必须解释交互层级。

## Shapes

主要表面使用柔和但克制的圆角。按钮和输入框使用较小的 7px 圆角，嵌套内容使用 8–10px，中大型卡片和地图使用 11–13px。状态标签使用 3–5px 小圆角，编号、点位和选择标记使用圆形。边框通常为 1px；待确认候选可使用虚线边框，时间线使用 2px 竖线，警告使用 2–3px 左侧强调线。

地图编号 Marker 是系统最具识别度的轮廓：圆形主体带单个尖角并旋转成定位针形状。其他组件不复制这一造型，避免削弱地图语义。

## Components

### Buttons

- **Shape:** 紧凑的轻圆角矩形（7px）。
- **Primary:** 茶山绿底、米纸白字，常规内边距为 13px × 19px，字体为 14px 粗体。
- **Hover / Focus:** 保持颜色角色稳定；键盘焦点使用 3px 陶土橙轮廓和 3px 偏移。
- **Secondary:** 透明背景、茶山绿文字和浅茶灰边框；不会与主操作争夺视觉重量。
- **Disabled:** 保留形状和文字，整体透明度降至 65%。

### Chips

- **Style:** 浅茶色底、茶山绿文字，内容紧凑；标签类状态使用更小的圆角，已选城市使用接近胶囊的外形。
- **State:** 已选项可带实心茶山绿圆形序号；未选过滤项保持透明背景和细边框。

### Cards / Containers

- **Corner Style:** 中大型表面使用 11–13px 圆角，内部卡片使用 8–10px。
- **Background:** 主表面使用米纸色；推荐、餐饮和编辑区域使用浅茶色或更浅的灰绿色分组。
- **Shadow Strategy:** 默认依赖细边框；只有选中、覆盖和粘性状态使用阴影。
- **Border:** 1px 石线色或浅茶灰；待确认状态可以使用虚线。
- **Internal Padding:** 卡片常用 18px，大面板使用 28px，移动端大面板收至 18px。

### Inputs / Fields

- **Style:** 白色背景、1px 石线边框、7px 圆角与 11px 内边距；标签位于字段上方并使用 13px 粗体。
- **Focus:** 必须提供与链接、按钮同等清晰的键盘焦点表现；交互状态不能只依赖颜色。
- **Error / Disabled:** 错误使用风险红文本；禁用状态降低透明度但仍保留可读性。

### Candidate Card

候选卡采用图片与内容并排的双区结构，桌面端图片宽 150px、内容自适应；520px 以下转为上下结构。加入行程操作悬浮在右上角，选中后使用茶山绿边框和浅色外圈。地点名称、地址、推荐原因、约束标签和来源按主次顺序排列，详细证据通过折叠区域展开。

### Route Map

地图卡片将按天筛选、真实底图、编号点位、地点详情浮层、地点顺序按钮和来源说明组合为一个完整模块。地图点位以茶山绿定位针为主，当前地点通过按钮状态和浮层共同确认；没有真实底图时必须保留明确降级说明。

### Notices

待确认与软约束提示使用警示暖底、警示棕文本和陶土橙左边线。错误使用风险红。普通来源和查询时间保持雾灰色，不与风险信息使用相同视觉重量。

## Do's and Don'ts

### Do:

- **Do** 让每个页面阶段都有明确标题、当前任务和唯一主操作。
- **Do** 使用茶山绿表达执行、选择和核验，使用陶土橙表达顺序与注意事项。
- **Do** 用折叠、分组和响应式重排管理复杂信息，保持高效扫描。
- **Do** 将地点图片、Provider 来源、查询时间和待确认状态作为旅行可信度的一部分。
- **Do** 只在悬浮、粘性和选中状态使用轻微阴影。

### Don't:

- **Don't** 把界面改造成企业后台、指标看板或由大量同权重数据卡组成的仪表盘。
- **Don't** 使用大面积茶山绿装饰，导致主操作和已核验状态失去辨识度。
- **Don't** 把陶土橙同时用于多个竞争性操作；它首先是方向和提醒色。
- **Don't** 在表单、地图数据、预算和来源信息中使用衬线字体。
- **Don't** 用阴影替代信息层级，或给每一层嵌套卡片继续增加高度。

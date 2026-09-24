# TravelCanvas

TravelCanvas 是一个面向中国境内自由行的旅行规划工具。它把分散在地图、攻略、酒店和路线工具中的决策整合为一条可检查、可调整的流程：先发现并选择真实景区，再生成基础路线，最后沿路线补充具体餐厅和娱乐地点。

项目强调“建议”和“事实”分离。AI 用于发现灵感和解释推荐；地点、坐标、路线等信息优先由 Provider 核验。页面会展示数据来源、查询时间和状态，无法确认的信息保留为“待确认”，不会被补造成实时事实。

## 1. 项目解决什么问题

自由行规划通常需要在攻略、地图、酒店和天气服务之间反复切换，而且常见 AI 行程容易出现以下问题：

- 推荐的是泛称或错误分店，无法直接搜索和导航；
- 一次生成完整行程，却没有保留用户明确选择的地点；
- 忽略营业时间、饮食禁忌、预算、排队和绕路成本；
- 把历史内容、估算值或演示数据包装成实时信息；
- 多城市、车站、机场和已订酒店没有真正进入每日路线。

TravelCanvas 使用“两阶段 + 顺路补全”的方式解决这些问题：

1. 根据目的地、日期、预算、偏好和限制发现景区候选；
2. 用户勾选真正想去的景区，服务端校验所选候选；
3. 使用出发地、跨城站点、已订酒店和景区生成逐日基础路线；
4. 基于基础路线筛选午晚餐和娱乐地点，确认后再写入最终路线。

当前版本是单用户、本地运行的 MVP，没有账号体系和数据库。方案保存在服务端内存中，约 30 分钟后过期。

## 2. 主要功能

- **旅行需求输入**：支持出发地、1–10 个中国城市、1–10 天、1–8 人、总预算或人均预算、市内交通方式、旅行偏好、限制、餐饮偏好和饮食禁忌。
- **跨城与酒店锚点**：可填写高铁、火车、飞机或自驾，核验车站/机场，记录预计出发与到达时间；已订酒店必须核验到具体 POI 后才进入路线。
- **真实景区候选**：DeepSeek 可提供发现灵感，高德地图负责核验具体 POI、地址、坐标、图片和导航链接。用户也可以输入自定义地点并重新核验。
- **公开攻略证据**：可通过 Tavily 检索公开收录的小红书攻略摘要，也可由用户提供帖子正文和链接；证据必须能逐字定位到具体地点。可选浏览器扩展只读取用户主动发起的当前搜索页可见结果，不读取 Cookie、Token 或密码。
- **多城市逐日路线**：根据出发地和城市位置减少明显折返，并安排每日景点顺序。该城市排序使用就近启发式，不保证数学意义上的全局最短路线。
- **地图与交通**：高德 Provider 提供步行、公交或驾车路线、距离、预计时间和折线；每个已核验地点提供高德查看/导航入口。页面入口不代表浏览器已经自动开始导航。
- **餐厅分店与餐次**：在景区基础路线生成后，按午餐/晚餐位置查询具体分店，综合口味、预算、营业线索、排队、绕路和饮食禁忌。支持替换、锁定和统一确认；餐厅确认前不会进入地图路线。
- **逐日娱乐调整**：可把具体娱乐地点安排在某个行程点之前或之后，核验后重新计算当天路线。
- **天气、住宿和预算提示**：天气优先使用高德短期预报，必要时使用已核验坐标查询 Open-Meteo；住宿仅提供区域建议或携程搜索跳转，不处理支付、订单和售后；预算展示建议上限、已知费用和未确认项。
- **透明降级**：第三方服务缺失、超时、限流或无结果时显示对应状态。没有高德服务端配置时，系统不会用虚构地点代替已核验候选。

## 3. 安装方法

### 环境要求

- Node.js `>= 20.9.0`
- npm（随 Node.js 安装）
- 可选：Python 与 Scrapling，用于尝试读取公开攻略正文；未安装不会阻塞主流程

### 安装依赖

```bash
git clone https://github.com/Elonts/TravelCanvas.git
cd TravelCanvas
npm ci
```

仓库当前为私有仓库，克隆账号需要具有访问权限。

### 配置环境变量

复制示例文件：

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

```bash
# macOS / Linux
cp .env.example .env.local
```

按需填写 `.env.local`：

| 变量 | 是否必需 | 用途 |
| --- | --- | --- |
| `AMAP_API_KEY` | 实际地点与路线功能必需 | 服务端高德 Web 服务：POI 核验、路线、天气、车站/机场和酒店地点查询 |
| `DEEPSEEK_API_KEY` | 可选 | AI 候选发现与攻略证据提取；未配置时使用受限降级逻辑 |
| `DEEPSEEK_MODEL` | 可选 | DeepSeek 模型名；示例默认值为 `deepseek-v4-flash` |
| `TAVILY_API_KEY` | 可选 | 公开攻略及缺图时的联网检索；未配置时不阻塞基础地点流程 |
| `NEXT_PUBLIC_AMAP_JS_KEY` | 可选 | 浏览器端高德 JS API Key，用于显示真实底图 |
| `NEXT_PUBLIC_AMAP_SECURITY_JS_CODE` | 可选 | 与高德 JS API Key 配套的浏览器端安全密钥 |
| `TRAVELCANVAS_SCRAPLING_PYTHON` | 可选 | 指向已安装 Scrapling 0.4.15 的 Python；设置为 `off` 可关闭正文读取 |

不要提交 `.env` 或 `.env.local`。高德浏览器 Key 和安全密钥会发送到浏览器，必须在高德控制台限制可用域名；它们不能与服务端 `AMAP_API_KEY` 共用。Scrapling 的可选安装方式见 [Scrapling可选安装说明.md](./Scrapling可选安装说明.md)。

## 4. 使用方法

### 开发模式

```bash
npm run dev
```

打开 <http://localhost:3000>。

### 生产模式

```bash
npm run build
npm start
```

默认访问地址仍为 <http://localhost:3000>。

### Windows 一键启动

首次执行 `npm ci` 后，可以双击根目录的 `启动 TravelCanvas.cmd`。启动器会在需要时构建项目，以隐藏后台进程启动本地服务并打开浏览器。双击 `停止 TravelCanvas.cmd` 可停止由当前项目启动且通过校验的服务。运行日志位于 `%LOCALAPPDATA%\TravelCanvas`。

### 页面操作流程

1. 填写出发地、目的地、日期、天数、人数和预算；按需补充偏好、限制、餐饮要求和已订酒店。
2. 多城市行程选择跨城交通。非自驾行程需要查询并选择出发站/机场、到达站/机场，并填写预计时间。
3. 点击“开始发现地点”，查看每个景区的地址、来源、图片、证据和数据状态。
4. 勾选想去的景区后生成基础路线。用户已选地点会被优先保留；无法安排时页面会说明原因。
5. 查看沿路线生成的餐厅草稿，处理分店、预算或时间警告，然后统一确认餐厅，生成包含餐次的最终路线。
6. 按天替换景点或添加娱乐地点，点击“保存修改并重新规划当天路线”。
7. 出发前再次确认预约、营业、天气、房价、库存和交通信息；这些时效信息可能在查询后发生变化。

可选的小红书登录态补充扩展使用说明见 [browser-extension/xhs-session/README.md](./browser-extension/xhs-session/README.md)。

## 5. 输入输出示例

下面展示的是接口结构示例，不是一次实时查询结果。实际候选名称、路线、天气、价格、来源状态和查询时间取决于当前 Provider 返回值。

### 第一步：发现景区候选

请求 `POST /api/discover`：

```json
{
  "origin": "上海",
  "destinations": ["杭州"],
  "startDate": "2026-10-15",
  "days": 2,
  "budget": 6000,
  "budgetBasis": "group",
  "travelers": 2,
  "transport": "transit",
  "preferences": "西湖、茶文化、慢节奏",
  "constraints": "避免高强度徒步",
  "foodPreferences": "杭帮菜、清淡",
  "dietary": "花生过敏",
  "foodMode": "route",
  "maxDetour": 20,
  "mealMinutes": 60,
  "queueMinutes": 20,
  "intercityLegs": [],
  "bookedHotels": [],
  "noteText": "",
  "noteUrl": "",
  "noteDate": ""
}
```

响应会返回服务端生成的 `discoveryId`、过期时间、候选和来源状态。以下字段为缩略示意：

```json
{
  "discoveryId": "<服务端生成的 UUID>",
  "expiresAt": "<ISO 8601 时间>",
  "candidates": [
    {
      "id": "<服务端候选 ID>",
      "poiId": "<高德 POI ID>",
      "kind": "attraction",
      "city": "杭州",
      "name": "<已核验景区名称>",
      "address": "<Provider 返回地址>",
      "verified": true,
      "navigationUrl": "<高德导航链接>",
      "source": "高德地图 POI",
      "queriedAt": "<ISO 8601 时间>",
      "guideEvidence": []
    }
  ],
  "sources": {
    "ai": "live",
    "map": "live",
    "guides": "pending",
    "updatedAt": "<ISO 8601 时间>"
  },
  "warnings": [
    "餐厅将在景区基础路线生成后，按午晚餐位置、口味和绕路成本查询。"
  ]
}
```

`live` 只表示该 Provider 在本次请求中返回了可用结果，不代表信息在未来持续有效。服务不可用时，状态可能是 `pending`、`demo`、`partial` 或失败提示，候选也可能为空。

### 第二步：用已选候选生成路线

用户选中候选后，请提交服务端返回的 ID，而不是自行构造地点：

```http
POST /api/plan
Content-Type: application/json
```

```json
{
  "discoveryId": "<上一步返回的 discoveryId>",
  "selectedIds": ["<用户选中的候选 ID>"]
}
```

缩略输出示意：

```json
{
  "planId": "<服务端生成的 UUID>",
  "revision": 0,
  "phase": "food_selection",
  "days": [
    {
      "city": "杭州",
      "date": "2026-10-15",
      "stops": [
        {
          "kind": "attraction",
          "name": "<用户选择且已核验的景区>",
          "time": "09:00",
          "verified": true,
          "costPending": true,
          "reservation": {
            "status": "unknown",
            "message": "预约要求待确认，请在出发前查看景区官方渠道。"
          }
        }
      ]
    }
  ],
  "route": {
    "cityOrder": ["杭州"],
    "paths": [
      {
        "from": "<前一地点>",
        "to": "<后一地点>",
        "minutes": 20,
        "meters": 5600,
        "state": "live",
        "transport": "transit",
        "queriedAt": "<ISO 8601 时间>"
      }
    ]
  },
  "sources": {
    "ai": "live",
    "map": "live",
    "weather": "live",
    "hotel": "demo",
    "updatedAt": "<ISO 8601 时间>"
  }
}
```

`phase: "food_selection"` 表示景区基础路线已经生成，但餐厅仍是待确认草稿；统一确认餐厅后，方案才进入 `final` 阶段并把餐厅加入路线。

## 数据边界

- 当前仅支持中国境内旅行。
- 高德、天气、攻略、酒店和营业数据具有时效性，必须结合页面显示的来源、查询时间和状态判断。
- 酒店只做地点/区域建议和第三方搜索跳转，不提供实时库存保证，也不处理支付、订单或售后。
- 公开小红书内容来自 Tavily 公开索引、用户提供正文或用户主动启用的登录态扩展，不是小红书官方榜单或全量站内数据。
- AI 输出属于建议；未经过 Provider 核验的内容不能视为已确认事实。

## 验证

运行单元测试、生产构建和 HTTP 冒烟测试：

```bash
npm run check
```

运行浏览器回归测试：

```bash
npm run test:browser
```

Windows 默认使用已安装的 Microsoft Edge；也可以通过 `PLAYWRIGHT_CHANNEL` 或 `PLAYWRIGHT_MODULE_PATH` 指定浏览器环境。测试中的 Provider 数据是隔离夹具，不代表线上实时结果。

更多产品与技术细节见 [产品方案.md](./产品方案.md)、[技术方案.md](./技术方案.md) 和 [验证记录.md](./验证记录.md)。

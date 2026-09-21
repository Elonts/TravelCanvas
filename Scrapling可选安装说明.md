# Scrapling 可选正文读取

TravelCanvas 的旅游攻略主流程只依赖 Tavily 返回的公开搜索摘要。Scrapling 只是可选增强：它尝试读取 Tavily 已返回、且经过白名单验证的公开小红书页面。未安装、超时、登录墙或无正文时，页面仍使用搜索摘要，不会中断候选生成。

## 环境要求

- Python 3.10 或更高版本。
- 固定兼容版本：`scrapling[fetchers]==0.4.15`。
- 当前辅助脚本只使用静态 `Fetcher`，不会启动登录、Cookie、验证码绕过、代理轮换或隐身反爬。

## 手动安装

1. 在项目外或项目专用的 Python 虚拟环境中运行 `python -m pip install -r requirements-scrapling.txt`。
2. 如果命令不是 `python`，在 `.env.local` 中把 `TRAVELCANVAS_SCRAPLING_PYTHON` 设为该 Python 可执行文件的完整路径。
3. 重启 TravelCanvas。页面会逐篇显示“公开正文”或“搜索摘要”。

不想启用时，可在 `.env.local` 设置 `TRAVELCANVAS_SCRAPLING_PYTHON=off`。项目启动器不会自动安装 Python、Scrapling 或浏览器依赖。

## 使用边界

- 只读取 Tavily 返回的 `xiaohongshu.com` HTTPS 公开链接。
- 需要登录或验证码的页面直接降级，不绕过站点限制。
- 请遵守站点条款、robots 要求及当地法律。
- 正文只在当次请求内用于证据抽取；不写入数据库、日志或前端响应。

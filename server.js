import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = process.env.PORT || 3000;
const publicDir = join(process.cwd(), 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

function promptForTrip(trip) {
  return `你是一位审慎、实用的旅行规划师。根据以下旅行需求生成中文旅行方案。不要声称查询了实时交通、天气、门票或营业信息；用“建议确认”标注不确定信息。所有金额使用 ${trip.currency || 'CNY'}，预算仅为估算。\n\n需求：${JSON.stringify(trip)}\n\n请只返回 JSON，格式：{"summary":"","budget":{"transport":"","stay":"","food":"","activities":"","buffer":"","total":""},"days":[{"title":"第 1 天 · 主题","route":[{"time":"09:00","place":"具体地点名称","address":"国家/城市/街道或可导航的区域地址；不确定时写约略区域","detail":"为什么安排这里、做什么","duration":"建议停留时长","transfer":"从上一站的交通方式与预计耗时；首站写从住宿出发","booking":"预约或开放提示；未知时写建议确认","verificationRequired":true,"cost":""}]}],"risks":[{"level":"高/中/低","title":"","detail":""}],"tips":[""]}。\n\n强制验收规则：route 中每一站的 place 必须是用户能在地图中直接搜索到的正式景点、博物馆、餐厅、车站、商场或公园名称。不得使用“核心地标”“特色街区”“当地风味午餐”“自由探索”“咖啡休息”“文化体验”等泛称，也不能只写区域名。若餐厅无法可靠推荐，改为附近知名市场、商场或餐饮街的正式名称。行程按天给出，每天 3-5 个地理位置相近、顺序合理的节点。只在有把握时给出完整地址；严禁编造门牌号，信息不确定必须将 verificationRequired 设为 true 并在 address 或 booking 中写“出发前确认”。风险至少 3 条。`;
}

const genericVenue = /核心地标|特色街区|当地风味午餐|自由探索|咖啡休息|文化体验|早餐与出发|晚餐与夜间散步|景点游览/;
const hasSpecificVenues = plan => Array.isArray(plan?.days) && plan.days.length > 0 && plan.days.every(day =>
  Array.isArray(day.route) && day.route.length >= 3 && day.route.every(stop =>
    typeof stop.place === 'string' && stop.place.trim().length >= 3 && !genericVenue.test(stop.place) &&
    typeof stop.address === 'string' && stop.address.trim().length >= 4
  )
);

async function askDeepSeek(messages) {
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', messages, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, stream: false })
  });
  if (!response.ok) throw new Error(`DeepSeek 请求失败（${response.status}）`);
  const output = (await response.json()).choices?.[0]?.message?.content;
  if (!output) throw new Error('DeepSeek 没有返回可读取的方案');
  return output;
}

async function generate(trip) {
  if (process.env.DEEPSEEK_API_KEY) {
    const messages = [{ role: 'system', content: '你只输出有效 JSON，不要使用 Markdown 代码块。' }, { role: 'user', content: promptForTrip(trip) }];
    let output = await askDeepSeek(messages);
    let plan = JSON.parse(output);
    if (!hasSpecificVenues(plan)) {
      output = await askDeepSeek([...messages, { role: 'assistant', content: output }, { role: 'user', content: '上一个方案未通过验收：每一站都必须提供可在地图直接搜索的正式地点名和地址/区域，不得使用任何泛称。请完整重写所有 days，只输出修正后的 JSON。' }]);
      plan = JSON.parse(output);
    }
    if (!hasSpecificVenues(plan)) throw new Error('模型未能给出可检索的具体地点，请更换目的地描述后重试。');
    return { ...plan, demo: false };
  }
  if (!process.env.OPENAI_API_KEY) return { demo: true };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5', input: promptForTrip(trip), text: { format: { type: 'json_object' } } })
  });
  if (!response.ok) throw new Error(`OpenAI 请求失败（${response.status}）`);
  const data = await response.json();
  const output = data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;
  if (!output) throw new Error('模型没有返回可读取的方案');
  return { ...JSON.parse(output), demo: false };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/plan') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const trip = JSON.parse(body);
      if (!trip.destination || !trip.days || !trip.budget) return json(res, 400, { error: '请填写目的地、天数和预算。' });
      return json(res, 200, await generate(trip));
    } catch (error) { return json(res, 500, { error: error.message || '生成失败，请稍后重试。' }); }
  }
  const requested = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
  const file = join(publicDir, requested);
  if (!file.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(data); }
  catch { json(res, 404, { error: 'Not found' }); }
});
server.listen(PORT, () => console.log(`TripCanvas is running at http://localhost:${PORT}`));

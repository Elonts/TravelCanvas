(function (root) {
  const NOTE_PATH = /^\/(?:explore|discovery\/item)\/[A-Za-z0-9_-]+/;
  const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  function noteUrl(value) {
    try {
      const url = new URL(value, 'https://www.xiaohongshu.com');
      if (url.protocol !== 'https:' || url.hostname !== 'www.xiaohongshu.com' || !NOTE_PATH.test(url.pathname)) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  }
  function visibleLikes(value) {
    const raw = text(value, 24).replace(/,/g, '').toLowerCase();
    const match = raw.match(/(\d+(?:\.\d+)?)\s*(万|w|k|千)?/i);
    if (!match) return null;
    const factor = /万|w/i.test(match[2] || '') ? 10000 : /k|千/i.test(match[2] || '') ? 1000 : 1;
    return Math.min(1000000000, Math.max(0, Math.round(Number(match[1]) * factor)));
  }
  function parseCard(card, rank) {
    const anchor = card.querySelector('a[href*="/explore/"], a[href*="/discovery/item/"]');
    const url = noteUrl(anchor?.href || anchor?.getAttribute('href'));
    if (!url) return null;
    const title = text(card.querySelector('[class*="title"], [class*="note-title"], h3, h2')?.textContent, 200);
    const author = text(card.querySelector('[class*="author"], [class*="user-name"], [class*="name"]')?.textContent, 80);
    const likeText = card.querySelector('[class*="like"], [class*="count"]')?.textContent || '';
    const publishedAt = text(card.querySelector('time, [class*="date"], [class*="time"]')?.textContent, 40) || null;
    const snippet = text(card.querySelector('[class*="desc"], [class*="content"], [class*="summary"]')?.textContent, 500);
    return { title: title || '未命名搜索结果', snippet, url, author: author || null, rank, visibleLikes: visibleLikes(likeText), publishedAt };
  }
  function parseVisibleCards(doc, limit = 20) {
    const selectors = ['section.note-item', '.note-item', '[class*="feeds-page"] section', '[class*="note-card"]'];
    const nodes = [...new Set(selectors.flatMap(selector => [...doc.querySelectorAll(selector)]))];
    const seen = new Set(); const results = [];
    for (const node of nodes) {
      const item = parseCard(node, results.length + 1);
      if (!item || seen.has(item.url)) continue;
      seen.add(item.url); results.push(item);
      if (results.length >= Math.min(20, limit)) break;
    }
    return results;
  }
  function pageFailure(doc) {
    const body = text(doc.body?.innerText, 3000);
    if (/验证码|安全验证|滑块验证|访问过于频繁/.test(body)) return 'captcha';
    if (/登录后查看|请先登录|登录即可/.test(body)) return 'login_required';
    return null;
  }
  root.TravelCanvasXhsParser = { noteUrl, visibleLikes, parseCard, parseVisibleCards, pageFailure };
})(globalThis);

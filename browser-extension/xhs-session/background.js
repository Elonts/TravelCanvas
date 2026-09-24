let connectedTabId = null;
let running = false;

chrome.tabs.onRemoved.addListener(tabId => { if (tabId === connectedTabId) connectedTabId = null; });

const waitForComplete = tabId => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('timeout')); }, 20000);
  const listener = (id, info) => {
    if (id !== tabId || info.status !== 'complete') return;
    clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
  };
  chrome.tabs.onUpdated.addListener(listener);
});

async function xhsTab(url) {
  const existing = (await chrome.tabs.query({ url: 'https://www.xiaohongshu.com/*' }))[0];
  if (existing?.id) {
    const updated = await chrome.tabs.update(existing.id, { url, active: true });
    await waitForComplete(updated.id); return updated.id;
  }
  const created = await chrome.tabs.create({ url, active: true });
  await waitForComplete(created.id); return created.id;
}

async function runSearch(request) {
  const output = [];
  for (const query of request.queries.slice(0, 2)) {
    const url = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(query.query)}&source=web_search_result_notes`;
    const tabId = await xhsTab(url);
    const response = await chrome.tabs.sendMessage(tabId, { type: 'TRAVELCANVAS_XHS_EXTRACT' });
    if (!response?.ok) return { ok: false, code: response?.code || 'extension_error', category: query.category };
    output.push({ category: query.category, query: query.query, queriedAt: new Date().toISOString(), results: response.results.slice(0, 20) });
  }
  return { ok: true, city: request.city, discoveryId: request.discoveryId, batches: output };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'TRAVELCANVAS_CONNECT') {
    connectedTabId = message.tabId; sendResponse({ ok: true }); return;
  }
  if (message?.type === 'TRAVELCANVAS_XHS_STATUS') {
    sendResponse({ ok: true, connected: sender.tab?.id === connectedTabId }); return;
  }
  if (message?.type !== 'TRAVELCANVAS_XHS_START') return;
  if (sender.tab?.id !== connectedTabId) { sendResponse({ ok: false, code: 'not_connected' }); return; }
  if (running) { sendResponse({ ok: false, code: 'busy' }); return; }
  running = true;
  runSearch(message).then(sendResponse).catch(error => sendResponse({ ok: false, code: error?.message === 'timeout' ? 'timeout' : 'extension_error' })).finally(() => { running = false; });
  return true;
});

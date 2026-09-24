const button = document.getElementById('connect');
const status = document.getElementById('status');
button.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^http:\/\/(?:127\.0\.0\.1|localhost):3000\//.test(tab.url || '')) {
    status.textContent = '请先打开本地 TravelCanvas 页面，再点击连接。'; return;
  }
  const response = await chrome.runtime.sendMessage({ type: 'TRAVELCANVAS_CONNECT', tabId: tab.id });
  if (response?.ok) await chrome.tabs.sendMessage(tab.id, { type: 'TRAVELCANVAS_CONNECTION_CHANGED' }).catch(() => undefined);
  status.textContent = response?.ok ? '已连接当前 TravelCanvas。现在可回到页面发起检索。' : '连接失败，请刷新页面后重试。';
});

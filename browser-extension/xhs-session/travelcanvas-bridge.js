const ALLOWED = new Set(['http://127.0.0.1:3000', 'http://localhost:3000']);
window.addEventListener('message', event => {
  if (event.source !== window || !ALLOWED.has(event.origin) || event.data?.source !== 'travelcanvas-page') return;
  if (!['TRAVELCANVAS_XHS_STATUS', 'TRAVELCANVAS_XHS_START'].includes(event.data.type)) return;
  chrome.runtime.sendMessage(event.data).then(response => {
    window.postMessage({ source: 'travelcanvas-extension', type: event.data.type === 'TRAVELCANVAS_XHS_STATUS' ? 'TRAVELCANVAS_XHS_STATUS_RESULT' : 'TRAVELCANVAS_XHS_RESULT', ...response }, event.origin);
  }).catch(() => {
    window.postMessage({ source: 'travelcanvas-extension', type: 'TRAVELCANVAS_XHS_RESULT', ok: false, code: 'extension_error' }, event.origin);
  });
});

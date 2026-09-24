chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'TRAVELCANVAS_XHS_EXTRACT') return;
  (async () => {
    const parser = globalThis.TravelCanvasXhsParser;
    const started = Date.now(); let previous = 0; let stable = 0;
    for (let scroll = 0; scroll <= 10 && Date.now() - started < 20000; scroll += 1) {
      const failure = parser.pageFailure(document);
      if (failure) return { ok: false, code: failure };
      const results = parser.parseVisibleCards(document, 20);
      if (results.length >= 20) return { ok: true, results };
      stable = results.length === previous ? stable + 1 : 0;
      if (stable >= 2 || scroll === 10) {
        return results.length ? { ok: true, results } : { ok: false, code: 'structure_changed' };
      }
      previous = results.length;
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    const results = parser.parseVisibleCards(document, 20);
    return results.length ? { ok: true, results } : { ok: false, code: 'timeout' };
  })().then(sendResponse).catch(() => sendResponse({ ok: false, code: 'structure_changed' }));
  return true;
});

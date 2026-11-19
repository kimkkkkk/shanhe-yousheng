import { connectPage, emulate, navigate, evaluate } from './cdp.mjs';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await connectPage();
await emulate(browser, { width: 1200, height: 900, dsf: 1, mobile: false });
await evaluate(
  browser,
  `(async () => { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } return true; })()`
);
for (const [id, place] of [
  ['huangshan', 'huangshan'],
  ['westlake', 'westlake'],
  ['coast', 'sanya'],
  ['village', 'wuzhen'],
  ['desert', 'dunhuang']
]) {
  await navigate(browser, `${BASE}/?demo=${id}&instant=1&place=${place}&debug=1`, { wait: 1200 });
  const data = await evaluate(
    browser,
    `(() => {
      const s = window.__SHANHE_DEBUG__?.state;
      if (!s?.analysis) return null;
      return {scene: s.analysis.scene.name, confidence: s.analysis.confidence, metrics: s.analysis.metrics, candidates: s.analysis.candidates.map(c => [c.scene.name, c.score])};
    })()`
  );
  console.log(id, JSON.stringify(data));
}
browser.close();

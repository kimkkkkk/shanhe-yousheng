import { connectPage, emulate, navigate, evaluate, screenshot, waitFor } from './cdp.mjs';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await connectPage();
await evaluate(
  browser,
  `(async () => { localStorage.clear(); if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } return true; })()`
);
await emulate(browser, { width: 1440, height: 1200, dsf: 1, mobile: false });
await navigate(browser, BASE, { wait: 1600 });
await screenshot(browser, 'shots/home-desktop.png');

await navigate(browser, `${BASE}/?demo=huangshan&instant=1&place=huangshan`, { wait: 1800 });
await waitFor(browser, `!!document.querySelector('.photo-frame')`, 10000);
await screenshot(browser, 'shots/result-desktop.png');

await emulate(browser, { width: 390, height: 844, dsf: 2, mobile: true });
await navigate(browser, `${BASE}/?demo=westlake&instant=1&place=westlake`, { wait: 1800 });
await waitFor(browser, `!!document.querySelector('.photo-frame')`, 10000);
await screenshot(browser, 'shots/result-mobile.png', { fullPage: true });

browser.close();
console.log('capture complete');

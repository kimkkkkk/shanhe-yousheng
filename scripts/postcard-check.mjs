import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { connectPage, emulate, navigate, evaluate, waitFor, screenshot, click } from './cdp.mjs';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173';
const browser = await connectPage();
await browser.send('Network.enable');
await browser.send('Network.setCacheDisabled', { cacheDisabled: true });
await emulate(browser, { width: 1440, height: 1100, dsf: 1, mobile: false });
await navigate(browser, BASE, { wait: 500 });
await evaluate(
  browser,
  `(async () => { localStorage.clear(); if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } return true; })()`
);
await browser.send('Page.reload', { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 900));

const demos = [
  ['huangshan', 'huangshan'],
  ['westlake', 'westlake'],
  ['village', 'wuzhen'],
  ['desert', 'dunhuang']
];
await mkdir('shots', { recursive: true });
for (const [id, place] of demos) {
  await navigate(browser, `${BASE}/?demo=${id}&instant=1&place=${place}&debug=1`, { wait: 900 });
  await waitFor(browser, `!!document.querySelector('[data-action="open-postcard"]')`, 10000);
  if (id === 'huangshan') await screenshot(browser, 'shots/result-with-postcard.png', { fullPage: false });
  await click(browser, '[data-action="open-postcard"]');
  await waitFor(browser, `!!document.querySelector('.postcard-studio')`, 10000);
  await waitFor(browser, `!document.querySelector('.pc-loading')?.classList.contains('is-visible')`, 15000);
  const dataUrl = await evaluate(browser, `document.querySelector('#postcard-canvas').toDataURL('image/png')`);
  await writeFile(`shots/postcard-${id}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  const info = await evaluate(
    browser,
    `({w:document.querySelector('#postcard-canvas').width,h:document.querySelector('#postcard-canvas').height,title:document.querySelector('#postcard-title').value,caption:document.querySelector('#postcard-caption').value})`
  );
  console.log(id, JSON.stringify(info));
  if (id === 'huangshan') {
    await screenshot(browser, 'shots/postcard-studio.png', { fullPage: false });
    await evaluate(browser, `document.querySelector('[data-pc-action="variant"]').click()`);
    await waitFor(browser, `!document.querySelector('.pc-loading')?.classList.contains('is-visible')`, 15000);
    const variantUrl = await evaluate(browser, `document.querySelector('#postcard-canvas').toDataURL('image/png')`);
    await writeFile('shots/postcard-huangshan-variant.png', Buffer.from(variantUrl.split(',')[1], 'base64'));
  }
  await click(browser, '[data-pc-action="close"]');
}
browser.close();
console.log('done');

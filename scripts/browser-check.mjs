import { readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { connectPage, emulate, navigate, evaluate, waitFor, screenshot, click, type } from './cdp.mjs';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173';
const DOWNLOAD_DIR = resolve(tmpdir(), `shanhe-downloads-${process.pid}-${Date.now()}`);

const browser = await connectPage();
let failed = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`PASS  ${name}`);
  else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

try {
  // ---- mobile home -------------------------------------------------
  await emulate(browser, { width: 390, height: 844, dsf: 2, mobile: true });
  await browser.send('Emulation.setGeolocationOverride', {
    latitude: 30.243,
    longitude: 120.15,
    accuracy: 30
  });
  await browser.send('Browser.grantPermissions', {
    origin: BASE,
    permissions: ['geolocation']
  }).catch((error) => console.log('grantPermissions skipped:', error.message));

  await navigate(browser, `${BASE}/?debug=1`, { wait: 900 });
  await evaluate(
    browser,
    `(async () => { localStorage.clear(); if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } return true; })()`
  );
  await navigate(browser, `${BASE}/?debug=1`, { wait: 900 });
  const layout = await evaluate(
    browser,
    `(() => {
      const pick = (s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width}; };
      return { innerWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth, shell: pick('.app-shell'), panel: pick('.capture-panel'), drop: pick('.dropzone'), lede: pick('.hero-lede'), title: pick('.hero h1') };
    })()`
  );
  console.log('mobile layout', JSON.stringify(layout));
  check('mobile viewport is 390', layout.innerWidth === 390, `got ${layout.innerWidth}`);
  check('no horizontal document overflow', layout.scrollWidth <= 390, `scrollWidth ${layout.scrollWidth}`);
  check('capture panel fits viewport', layout.panel && layout.panel.right <= 390.5, JSON.stringify(layout.panel));
  check('dropzone fits viewport', layout.drop && layout.drop.right <= 390.5, JSON.stringify(layout.drop));
  await screenshot(browser, 'shots/mobile-home-full.png', { fullPage: true });

  // ---- upload a generated image and locate ------------------------
  await evaluate(
    browser,
    `(async () => {
      const img = new Image();
      img.src = '/assets/demo-westlake.svg';
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1400; canvas.height = 1050;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'westlake-view.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('#file-upload');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return { size: blob.size };
    })()`
  );
  await waitFor(browser, `document.querySelector('.photo-frame') !== null`, 20000);
  check('upload reaches result view', await evaluate(browser, `!!document.querySelector('.photo-frame')`));
  const uploadPlacePrompt = await evaluate(browser, `document.querySelector('#place-title')?.textContent || ''`);
  check('unlocated upload prompts for location', uploadPlacePrompt.includes('旧事'), uploadPlacePrompt);

  await click(browser, '[data-action="locate"]');
  await waitFor(browser, `document.querySelector('#place-title')?.textContent.includes('西湖')`, 12000);
  const located = await evaluate(
    browser,
    `({place: document.querySelector('#place-title')?.textContent, badge: document.querySelector('.location-confirm')?.textContent, caption: document.querySelector('.photo-caption h2')?.textContent, dialect: document.querySelector('.lang-tab.is-active')?.textContent})`
  );
  console.log('located', JSON.stringify(located));
  check('geolocation resolves West Lake', located.place?.includes('西湖'));
  check('location badge is honest', located.badge?.includes('定位'), located.badge);
  const dialectState = await evaluate(
    browser,
    `({dialect: window.__SHANHE_DEBUG__?.state.dialect, tab: [...document.querySelectorAll('.lang-tab')].map(e => e.textContent.trim()).join('|')})`
  );
  check('dialect follows place (Wu)', dialectState.dialect === 'wu', JSON.stringify(dialectState));
  check('dialect tab announces Wu', dialectState.tab.includes('吴语'), dialectState.tab);
  await screenshot(browser, 'shots/mobile-result-located.png', { fullPage: true });

  // ---- dialect switch and place picker ----------------------------
  await click(browser, '[data-action="switch-lang"][data-lang="dialect"]');
  const dialectText = await evaluate(browser, `document.querySelector('.script-body')?.innerText || ''`);
  check('Cantonese/Wu dialect text renders', dialectText.includes('倷看呀') || dialectText.includes('而家') || dialectText.includes('来嘛'), dialectText.slice(0, 50));
  await click(browser, '[data-action="set-dialect"][data-dialect="yue"]');
  const yueText = await evaluate(browser, `document.querySelector('.script-body')?.innerText || ''`);
  check('switching to Cantonese rewrites script', yueText.includes('而家你睇到'), yueText.slice(0, 60));
  await screenshot(browser, 'shots/mobile-dialect.png', { fullPage: false });

  await click(browser, '[data-action="open-place-picker"]');
  await waitFor(browser, `!!document.querySelector('#place-search')`);
  await type(browser, '#place-search', '苏州');
  const results = await evaluate(browser, `[...document.querySelectorAll('.place-result strong')].map(e => e.textContent)`);
  console.log('place search', results);
  check('place search finds Suzhou', results.some((name) => name.includes('苏州')));
  await click(browser, '[data-action="choose-place"]');
  await waitFor(browser, `document.querySelector('#place-title')?.textContent.includes('苏州')`);
  const suzhou = await evaluate(browser, `({title: document.querySelector('#place-title')?.textContent, meta: document.querySelector('.place-region')?.textContent})`);
  check('manual place selection updates story', suzhou.title?.includes('苏州'), JSON.stringify(suzhou));
  await screenshot(browser, 'shots/mobile-place.png', { fullPage: true });

  // ---- scene picker / moments / memory -----------------------------
  await click(browser, '[data-action="open-scene-picker"]');
  await waitFor(browser, `!!document.querySelector('.scene-grid')`);
  await click(browser, '[data-action="choose-scene"][data-scene-id="city"]');
  await waitFor(browser, `document.querySelector('.photo-badge')?.textContent.includes('城市')`);
  check('manual scene override applies', (await evaluate(browser, `document.querySelector('.photo-badge')?.textContent`))?.includes('城市'));

  const moments = await evaluate(browser, `[...document.querySelectorAll('.moment-style')].map(e => e.textContent.trim())`);
  check('four moments styles present', moments.length === 4, moments.join('|'));
  await click(browser, '[data-action="set-moment-style"][data-style="guide"]');
  const guide = await evaluate(browser, `document.querySelector('#moment-text')?.value || ''`);
  check('guide copy contains practical details', guide.includes('机位') && guide.includes('吃什么'), guide.slice(0, 80));

  const before = await evaluate(browser, `localStorage.getItem('shanhe.history.v1')`);
  await click(browser, '[data-action="save-memory"]');
  await waitFor(browser, `JSON.parse(localStorage.getItem('shanhe.history.v1') || '[]').length > 0`);
  const after = await evaluate(browser, `JSON.parse(localStorage.getItem('shanhe.history.v1') || '[]')`);
  check('memory saved to localStorage', !before && after.length === 1);
  check('memory stores thumbnail + place', Boolean(after[0]?.image && after[0]?.placeName));
  await screenshot(browser, 'shots/mobile-memory.png', { fullPage: false });

  // ---- desktop result and editor -----------------------------------
  await emulate(browser, { width: 1440, height: 1200, dsf: 1, mobile: false });
  await navigate(browser, `${BASE}/?demo=huangshan&instant=1&place=huangshan&debug=1`, { wait: 900 });
  check('desktop result loads', await evaluate(browser, `!!document.querySelector('.photo-frame')`));
  const desktopMetrics = await evaluate(
    browser,
    `(() => { const r = document.querySelector('.result-layout').getBoundingClientRect(); return {width:r.width, left:r.left, right:r.right, scrollWidth:document.documentElement.scrollWidth}; })()`
  );
  check('desktop layout has no overflow', desktopMetrics.scrollWidth <= 1440, JSON.stringify(desktopMetrics));
  await screenshot(browser, 'shots/desktop-result-full.png', { fullPage: true });

  await click(browser, '[data-action="open-editor"]');
  await waitFor(browser, `!!document.querySelector('.editor')`);
  const editorInfo = await evaluate(
    browser,
    `(() => { const c = document.querySelector('#editor-canvas'); return {w:c.width, h:c.height, filters:document.querySelectorAll('[data-filter]').length, tabs:document.querySelectorAll('[data-editor-tab]').length}; })()`
  );
  console.log('editor', editorInfo);
  check('editor canvas rendered', editorInfo.w > 100 && editorInfo.h > 100, JSON.stringify(editorInfo));
  check('editor has filters and tabs', editorInfo.filters === 6 && editorInfo.tabs === 4);
  const editorBounds = await evaluate(
    browser,
    `(() => { const p = document.querySelector('.editor-panel').getBoundingClientRect(); const c = document.querySelector('#editor-canvas').getBoundingClientRect(); return {panelBottom:p.bottom, panelHeight:p.height, canvasBottom:c.bottom, viewport:innerHeight}; })()`
  );
  check('editor panel fits viewport', editorBounds.panelBottom <= editorBounds.viewport + 1, JSON.stringify(editorBounds));
  check('editor canvas does not overlap controls', editorBounds.canvasBottom <= editorBounds.panelBottom, JSON.stringify(editorBounds));
  await screenshot(browser, 'shots/desktop-editor.png', { fullPage: false });
  await click(browser, '[data-filter="warm"]');
  await click(browser, '[data-editor-tab="adjust"]');
  await waitFor(browser, `!!document.querySelector('[data-adjust="brightness"]')`);
  await screenshot(browser, 'shots/desktop-editor-adjust.png', { fullPage: false });
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  await browser
    .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR })
    .catch(() => browser.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR }).catch(() => {}));
  await click(browser, '[data-editor-action="save"]');
  await waitFor(browser, `document.querySelector('.editor') === null`, 10000);
  const edited = await evaluate(
    browser,
    `({name: window.__SHANHE_DEBUG__?.state.image.name, type: window.__SHANHE_DEBUG__?.state.image.type, src: window.__SHANHE_DEBUG__?.state.image.src.slice(0, 30)})`
  );
  console.log('edited image', edited);
  check('editor save updates app image', edited.name === 'edited.jpg' && edited.src.startsWith('data:image/jpeg'), JSON.stringify(edited));
  const downloads = await readdir(DOWNLOAD_DIR).catch(() => []);
  check('editor exports a JPEG file', downloads.some((file) => file.endsWith('.jpg')), downloads.join(','));

  // ---- mobile editor ----------------------------------------------
  await emulate(browser, { width: 390, height: 844, dsf: 2, mobile: true });
  await navigate(browser, `${BASE}/?demo=westlake&instant=1&place=westlake`, { wait: 800 });
  await click(browser, '[data-action="open-editor"]');
  await waitFor(browser, `!!document.querySelector('.editor')`);
  const mobileEditor = await evaluate(
    browser,
    `(() => { const p = document.querySelector('.editor-panel').getBoundingClientRect(); const c = document.querySelector('#editor-canvas').getBoundingClientRect(); return {panelBottom:p.bottom, canvasBottom:c.bottom, canvasWidth:c.width, viewport:innerHeight, scrollWidth:document.documentElement.scrollWidth}; })()`
  );
  console.log('mobile editor', mobileEditor);
  check('mobile editor fits viewport', mobileEditor.panelBottom <= mobileEditor.viewport + 1, JSON.stringify(mobileEditor));
  check('mobile editor has no overflow', mobileEditor.scrollWidth <= 390, JSON.stringify(mobileEditor));
  await screenshot(browser, 'shots/mobile-editor.png', { fullPage: false });
  await click(browser, '[data-editor-action="close"]');

  // ---- settings / history / offline shell --------------------------
  await emulate(browser, { width: 1440, height: 1200, dsf: 1, mobile: false });
  await navigate(browser, `${BASE}/?demo=huangshan&instant=1&place=huangshan`, { wait: 800 });
  await click(browser, '[data-action="open-settings"]');
  await waitFor(browser, `!!document.querySelector('.sheet')`);
  const settings = await evaluate(browser, `({title: document.querySelector('#sheet-title')?.textContent, dialects: document.querySelectorAll('[data-action="set-default-dialect"]').length})`);
  console.log('settings', settings);
  check('settings sheet opens', settings.title === '设置');
  check('five dialects in settings', settings.dialects === 5);
  await screenshot(browser, 'shots/desktop-settings.png', { fullPage: false });
  await click(browser, '[data-action="close-overlay"]');

  await click(browser, '[data-action="open-history"]');
  await waitFor(browser, `!!document.querySelector('.page-view')`);
  check('history page shows saved entry', (await evaluate(browser, `document.querySelectorAll('.history-card').length`)) === 1);
  await screenshot(browser, 'shots/desktop-history.png', { fullPage: false });

  const sw = await evaluate(browser, `navigator.serviceWorker?.getRegistrations().then(rs => rs.length)`);
  check('service worker registered', sw >= 1, `registrations ${sw}`);

  await browser.send('Network.enable');
  await browser.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0
  });
  await navigate(browser, `${BASE}/?offline-check=1`, { wait: 1200 });
  const offlineHome = await evaluate(browser, `({hero: !!document.querySelector('.hero'), title: document.title, body: document.body.innerText.slice(0, 40)})`);
  console.log('offline', offlineHome);
  check('offline PWA shell still loads', offlineHome.hero === true, JSON.stringify(offlineHome));
  await browser.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1
  });

  const logs = browser.logs.filter((l) => l.type === 'exception' || l.type === 'error');
  check('no runtime exceptions/errors', logs.length === 0, JSON.stringify(logs.slice(0, 4)));
} catch (error) {
  failed++;
  console.error('FATAL', error);
  console.error(JSON.stringify(browser.logs.slice(-15), null, 2));
} finally {
  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  browser.close();
  process.exit(failed ? 1 : 0);
}

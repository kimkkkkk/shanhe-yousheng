import { readdir, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { connectPage, emulate, navigate, evaluate, waitFor, screenshot, click } from './cdp.mjs';

const BASE = process.env.APP_URL || 'http://127.0.0.1:4173';
const downloadDir = resolve(tmpdir(), `shanhe-postcard-export-${Date.now()}`);
await mkdir(downloadDir, { recursive: true });

const browser = await connectPage();
await browser.send('Network.enable');
await browser.send('Network.setCacheDisabled', { cacheDisabled: true });
await emulate(browser, { width: 1440, height: 1100, dsf: 1, mobile: false });
await navigate(browser, `${BASE}/?demo=huangshan&instant=1&place=huangshan&debug=1`, { wait: 1200 });
await waitFor(browser, `!!document.querySelector('[data-action="open-postcard"]')`, 10000);
await click(browser, '[data-action="open-postcard"]');
await waitFor(browser, `!!document.querySelector('.postcard-studio')`, 10000);
await waitFor(browser, `!document.querySelector('.pc-loading')?.classList.contains('is-visible')`, 15000);

const preview = await evaluate(
  browser,
  `({w:document.querySelector('#postcard-canvas').width,h:document.querySelector('#postcard-canvas').height,label:document.querySelector('.pc-title strong').textContent})`
);
console.log('preview', JSON.stringify(preview));
if (preview.w !== 1080 || preview.h !== 1620) throw new Error('preview is not 1080x1620');

await browser
  .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
  .catch(() => browser.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }).catch(() => {}));
await click(browser, '.pc-header [data-pc-action="save"]');
let files = [];
for (let i = 0; i < 30; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  files = (await readdir(downloadDir)).filter((file) => file.endsWith('.png'));
  if (files.length) break;
}
if (!files.length) throw new Error('4K PNG was not downloaded');
const buffer = await readFile(resolve(downloadDir, files[0]));
const width = buffer.readUInt32BE(16);
const height = buffer.readUInt32BE(20);
console.log('download', JSON.stringify({ file: files[0], bytes: buffer.length, width, height }));
if (width !== 2160 || height !== 3240) throw new Error(`export is ${width}x${height}, expected 2160x3240`);

await emulate(browser, { width: 390, height: 844, dsf: 2, mobile: true });
await navigate(browser, `${BASE}/?demo=westlake&instant=1&place=westlake`, { wait: 900 });
await click(browser, '[data-action="open-postcard"]');
await waitFor(browser, `!!document.querySelector('.postcard-studio')`, 10000);
await waitFor(browser, `!document.querySelector('.pc-loading')?.classList.contains('is-visible')`, 15000);
const mobile = await evaluate(
  browser,
  `(() => { const body=document.querySelector('.pc-body'); const canvas=document.querySelector('#postcard-canvas').getBoundingClientRect(); return {scrollWidth:document.documentElement.scrollWidth,innerWidth,canvas:{w:canvas.width,h:canvas.height},bodyScroll:body.scrollHeight,bodyClient:body.clientHeight}; })()`
);
console.log('mobile', JSON.stringify(mobile));
if (mobile.scrollWidth > 390) throw new Error('mobile postcard overflows horizontally');
await screenshot(browser, 'shots/postcard-mobile.png', { fullPage: false });
browser.close();
console.log('POSTCARD EXPORT OK');

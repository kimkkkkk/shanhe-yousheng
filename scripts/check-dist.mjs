#!/usr/bin/env node
/**
 * 静态部署产物校验：不上传任何文件，只检查 dist/ 是否能安全上线。
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const failures = [];
const passes = [];

const check = (name, condition, detail = '') => {
  if (condition) {
    passes.push(name);
    console.log(`PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const exists = async (file) => {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
};

console.log('\n  山河有声 · production dist check\n');

const infoRaw = await readFile(join(DIST, '.deploy-info.json'), 'utf8').catch(() => '');
check('dist exists', Boolean(infoRaw), '先运行 npm run build');
let info = {};
try {
  info = JSON.parse(infoRaw);
} catch {
  check('deploy-info.json is valid', false);
}
check('build metadata present', Boolean(info.buildId && info.builtAt));
check('site is static-only', info.requiresNode === false, JSON.stringify(info));

const required = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  '_headers',
  'robots.txt',
  '.nojekyll',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'assets/demo-huangshan.svg',
  'src/app.js',
  'src/styles.css'
];
for (const file of required) check(`required: ${file}`, await exists(join(DIST, file)));

const forbidden = ['package.json', 'server.mjs', 'README.md', 'tests', 'scripts', 'shots', 'config'];
for (const file of forbidden) {
  check(`not published: ${file}`, !(await exists(join(DIST, file))));
}

const html = await readFile(join(DIST, 'index.html'), 'utf8').catch(() => '');
check('HTML has viewport meta', html.includes('name="viewport"'));
check('HTML loads module app', html.includes('src="/src/app.js"'));
check('HTML links manifest', html.includes('rel="manifest"'));
check('HTML has no external script CDN', !/<script[^>]+src="https?:\/\//i.test(html));
check('HTML has no insecure http resource', !/(?:src|href|action)="http:\/\//i.test(html));

const manifest = JSON.parse(await readFile(join(DIST, 'manifest.webmanifest'), 'utf8').catch(() => '{}'));
check('PWA start_url is root', manifest.start_url === '/');
check('PWA scope is root', manifest.scope === '/');
check('PWA display standalone', manifest.display === 'standalone');
check('PWA has 192 and 512 icons', (manifest.icons || []).some((i) => i.sizes === '192x192') && (manifest.icons || []).some((i) => i.sizes === '512x512'));

const headers = await readFile(join(DIST, '_headers'), 'utf8').catch(() => '');
check('headers include CSP', headers.includes('Content-Security-Policy'));
check('headers include HSTS', headers.includes('Strict-Transport-Security'));
check('headers allow geolocation for self', headers.includes('geolocation=(self)'));
check('headers identify the JSON manifest', headers.includes('manifest.webmanifest'));
check('sw.js is not cached', /\/sw\.js\n\s+Cache-Control:\s*no-cache/.test(headers));

const sw = await readFile(join(DIST, 'sw.js'), 'utf8').catch(() => '');
check('service worker has build-specific version', /const VERSION = '\d+\.\d+\.\d+-[a-f0-9]+';/.test(sw));
check('service worker has install handler', sw.includes("addEventListener('install'"));
check('service worker handles navigation offline', sw.includes("request.mode === 'navigate'"));
const coreMatch = /const CORE = \[([\s\S]*?)\];/.exec(sw);
check('service worker cache list exists', Boolean(coreMatch));
if (coreMatch) {
  const core = [...coreMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  let missing = [];
  for (const path of core) {
    if (path === '/') continue;
    if (!(await exists(join(DIST, path.replace(/^\//, ''))))) missing.push(path);
  }
  check('all precached assets exist', missing.length === 0, missing.join(', '));
}

const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else files.push(full);
  }
}
await walk(DIST).catch(() => {});
check('dist is under 12 MB', Number(info.totalBytes) < 12 * 1024 * 1024, `${info.totalBytes} bytes`);

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\n生产构建未通过，请修复后再部署：');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('\n生产产物可部署：dist/（域名根路径，HTTPS）\n');

#!/usr/bin/env node
/**
 * 山河有声 · 零依赖静态服务器
 * 仅提供本地文件与健康检查，不做任何图片上传或外部请求。
 */
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { SECURITY_HEADERS } from './config/security.mjs';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const rootArg = args.indexOf('--root');
const PORT = Number(process.env.PORT || (portArg >= 0 ? args[portArg + 1] : 4173)) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const PROJECT_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const ROOT = rootArg >= 0 ? resolve(process.cwd(), args[rootArg + 1]) : PROJECT_ROOT;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = normalize(decoded).replace(/^([.]{2}[\\/])+/, '');
  const target = resolve(join(ROOT, clean === '/' ? 'index.html' : clean));
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;
  return target;
}

async function fileAt(target) {
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      const index = join(target, 'index.html');
      const indexInfo = await stat(index);
      return { path: index, size: indexInfo.size };
    }
    return { path: target, size: info.size };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const headers = { ...SECURITY_HEADERS, 'Cache-Control': 'no-cache' };

  if (url.pathname === '/api/health') {
    const body = JSON.stringify({
      ok: true,
      app: 'shanhe-yousheng',
      version: '1.0.0',
      privacy: 'photos stay on this device',
      uptime: Math.round(process.uptime())
    });
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : body);
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const target = safePath(url.pathname);
  if (!target) {
    res.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  let found = await fileAt(target);
  if (!found && !extname(target)) {
    // 单页应用回退，便于使用干净路径
    found = await fileAt(join(ROOT, 'index.html'));
  }
  if (!found) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>这条路没有风景。<a href="/">回到山河有声</a></p>');
    return;
  }

  const ext = extname(found.path).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';
  const isAsset = /\/assets\//.test(found.path) || /\/icons\//.test(found.path);
  res.writeHead(200, {
    ...headers,
    'Content-Type': contentType,
    'Content-Length': found.size,
    'Cache-Control': isAsset ? 'public, max-age=604800' : 'no-cache'
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(found.path).pipe(res);
  res.on('finish', () => {
    if (process.env.LOG_REQUESTS === '1') {
      console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
});

server.listen(PORT, HOST, () => {
  const nets = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal);
  console.log('\n  山河有声 · Shanhe Yousheng');
  console.log('  让每一张风景，开口讲故事\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const net of nets) console.log(`  Network: http://${net.address}:${PORT}`);
  console.log('\n  照片仅在本机处理；定位需浏览器授权。按 Ctrl+C 停止。\n');
});

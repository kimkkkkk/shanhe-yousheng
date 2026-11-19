# 部署到 HTTPS

山河有声是**纯静态 PWA**：没有后端、没有数据库、不需要 Node 运行时。只要把 `dist/` 放到一个受信任 HTTPS 域名下，手机定位、Service Worker 离线缓存和安装到桌面就会全部生效。

---

## 已准备好的产物

| 路径 | 用途 |
| --- | --- |
| `dist/` | 可直接上传的站点根目录，31 个文件，约 484 KB |
| `shanhe-yousheng-https.zip` | 约 251 KB；与 `dist/` 内容一致，已把 `index.html` 放在压缩包根目录，可直接拖到 Netlify Drop |
| `SHA256SUMS.txt` | ZIP 的 SHA-256 校验值 |
| `netlify.toml` | Netlify 构建配置 |
| `vercel.json` | Vercel 构建与安全头配置 |
| `wrangler.toml` | Cloudflare Pages 构建输出配置 |
| `Dockerfile` + `docker-compose.yml` + `deploy/Caddyfile` | 自有服务器 + Caddy 自动 HTTPS |
| `dist/_headers` | Netlify / Cloudflare Pages 的安全头与缓存策略 |

> 当前构建只支持**域名根路径**（`https://example.com/`）。不要部署到 `https://example.com/app/` 这类二级目录；如需二级目录，需要再做 base path 构建。

---

## 方案 A：最快上线（Netlify Drop，免命令行）

1. 打开 <https://app.netlify.com/drop>。
2. 把 `shanhe-yousheng-https.zip` 直接拖进去；或解压后把 `dist` 文件夹拖进去。
3. 等待几十秒，你会得到一个 `https://xxxx.netlify.app` 的 HTTPS 地址。
4. 用手机打开该地址：
   - 允许定位；
   - 从相册选择风景照；
   - 测试双语音解、修图、朋友圈文案；
   - 浏览器菜单里「添加到主屏幕 / 安装应用」。

Netlify 会自动签发并续期 Let's Encrypt 证书，不需要额外配置。

---

## 方案 B：Netlify 连接 Git 仓库

仓库根目录已经带 `netlify.toml`：

```toml
[build]
  command = "node scripts/build.mjs"
  publish = "dist"
```

在 Netlify 中导入仓库即可，构建完成后自动发布。之后每次 push 都会重新构建，`sw.js` 的缓存版本也会随内容哈希变化。

---

## 方案 C：Vercel

仓库根目录已经带 `vercel.json`，构建命令为 `node scripts/build.mjs`，输出目录为 `dist`。

命令行：

```bash
npx vercel --prod
```

或在 <https://vercel.com/new> 导入仓库。Vercel 会提供 `https://xxxx.vercel.app` 的 HTTPS 地址。

`vercel.json` 已配置：

- HSTS；
- CSP；
- `Permissions-Policy` 允许本站定位；
- `sw.js` / `index.html` / manifest 不缓存；
- 静态资源缓存。

---

## 方案 D：Cloudflare Pages

### 直接上传

1. 打开 Cloudflare Dashboard → Workers & Pages → Create → Pages → Upload assets。
2. 上传 `dist/` 目录，或 `shanhe-yousheng-https.zip`。
3. 得到 `https://xxxx.pages.dev` 的 HTTPS 地址。

### 连接 Git

构建配置：

- Build command：`node scripts/build.mjs`
- Build output directory：`dist`

`wrangler.toml` 已提供 `pages_build_output_dir = "dist"`。

---

## 方案 E：自有服务器 + Caddy（自动 HTTPS）

适合有域名和 VPS 的情况。前置条件：

- 域名 A/AAAA 记录已经指向服务器；
- 服务器 80、443 端口开放；
- 已安装 Docker 与 Docker Compose。

```bash
# 在项目根目录
SITE_ADDRESS=shanhe.example.com docker compose up -d --build
```

Caddy 会自动向 Let's Encrypt 申请证书，并把手动 HTTP 重定向到 HTTPS。证书保存在 `caddy_data` volume 中，重启不会丢失。

查看日志：

```bash
docker compose logs -f shanhe
```

更新：

```bash
docker compose up -d --build
```

> 如果前面套了 Cloudflare 代理（橙云），Let's Encrypt 的 HTTP 校验可能被代理拦截。此时建议给源站配置 Cloudflare Origin Certificate，或先切灰云完成证书签发。  
> 本地测试可用 `SITE_ADDRESS=localhost docker compose up --build`，但 Caddy 会使用内部 CA，浏览器/手机不一定信任，**不适合验证手机定位**。

---

## 方案 F：GitHub Pages

`dist/.nojekyll` 已经生成，避免 GitHub Pages 忽略静态资源。

可用方式：

- 仓库是 `username.github.io`（用户主页，根路径）；
- 或绑定了自定义域名（根路径）。

如果使用项目页 `https://username.github.io/repo/`，当前绝对路径构建**不适用**。不要把 `dist` 直接放到项目子路径下。

---

## 部署后检查清单

### 1. HTTPS 与安全头

```bash
curl -I https://你的域名/
```

应看到：

- `HTTP/2 200` 或 `HTTP/1.1 200`；
- `Strict-Transport-Security`；
- `Content-Security-Policy`；
- `Permissions-Policy: geolocation=(self)`；
- 浏览器地址栏显示锁标志，没有混合内容警告。

### 2. PWA

Chrome DevTools → Application：

- Manifest 能读取 `山河有声`，图标正常；
- Service Worker 状态为 activated；
- 断网后刷新，首页仍能打开。

### 3. 手机

- 用 HTTPS 地址打开；
- 点击「开启定位」，允许浏览器定位；
- 上传照片，确认识别结果和双语音解；
- 打开修图，保存一张 JPEG；
- 复制一段朋友圈文案；
- 在浏览器菜单里安装到主屏幕。

### 4. 本地生产预览

```bash
npm run build
npm run check:dist
npm run preview
# http://localhost:4174
```

`preview` 会使用与生产相同的 CSP 头；`localhost` 属于安全上下文，可以在电脑上测试定位。

---

## 本地构建与校验

```bash
npm run build       # 生成 dist/，自动写入构建哈希到 sw.js
npm run check:dist  # 校验产物，43 项检查
npm test            # 33 个单元测试
```

本次交付的构建已经通过：

- `npm run build`：31 个文件，484 KB；
- `npm run check:dist`：43 项检查全部通过；
- 无头 Chrome 完整流程：移动端布局、上传、定位、双语音解、选点、修图导出、朋友圈、足迹、离线 Service Worker 全部通过；
- 生产 `dist/` 在带 CSP 的服务器上验证，无运行时异常。

---

## 安全与隐私

- `dist/` 不包含 `server.mjs`、测试、脚本、截图或任何开发文件；
- 没有第三方 CDN、统计脚本、字体请求；
- 照片在本机 Canvas 处理，不上传；
- 定位坐标只在本机匹配 53 个地方志地标，不发送到服务器；
- 历史记录保存在浏览器 `localStorage`，清空足迹即删除；
- CSP 默认只允许同源资源，`img-src` 额外允许 `data:` / `blob:` 以支持用户照片和导出预览；
- `Permissions-Policy` 只允许本站使用定位和相机，关闭麦克风。

---

## 更新版本时

```bash
npm run build
npm run check:dist
```

构建脚本会根据内容生成 `buildId`，并写入 `dist/sw.js` 的 `VERSION`。部署新 `dist` 后，Service Worker 会重新安装并清理旧缓存。`index.html`、`sw.js`、manifest 均配置为 `no-cache`，避免用户长期卡在旧版本。

---

## 仍然存在的边界

- 识别是离线规则模型，特殊构图可能误判；应用内可「调整场景」；
- 方言语音取决于系统语音包，缺失时会普通话代读；
- 手机定位必须使用受信任 HTTPS；自签名证书不等于受信任；
- 根路径部署，不支持二级目录；
- 没有账号、云同步、后端分享能力，所有数据留在本机。

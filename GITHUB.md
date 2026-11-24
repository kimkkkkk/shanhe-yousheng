# GitHub 上传与管理指南

> 你下载的 **GitHub Copilot** 是 AI 编程助手，不是 Git 客户端，不能用来上传仓库。  
> 上传仓库用 **Git + VS Code** 就可以了，不需要 GitHub Desktop。

---

## 当前状态

- 项目目录：`D:\vibe coding\项目\山河有声`
- 本地分支：`main`
- 本地提交：v1.1.0，含本地水墨明信片工作室
- 远程仓库：`origin` → `https://github.com/kimkkkkk/shanhe-yousheng.git`（已配置）
- 上传状态：本地与远程 `main` 已同步
- 最近功能：水墨明信片（本地 Canvas 渲染，2160×3240 PNG）
- GitHub Pages：已配置工作流，需在 Settings → Pages 选择 GitHub Actions 后手动运行一次
- 已忽略：`dist/`、`shots/`、`*.zip`、`node_modules/`、`.env`

---

## 一、以后如何同步更新

### 方式 A：PowerShell（日常同步）

每次修改前先拉取，修改后提交并推送：

```powershell
$git = "D:\vibe coding\git\Git\cmd\git.exe"
Set-Location "D:\vibe coding\项目\山河有声"

& $git pull --rebase
& $git status
& $git add -A
& $git commit -m "feat: describe your change"
& $git push
```

看到类似下面的输出就表示上传成功：

```text
branch 'main' set up to track 'origin/main'.
To https://github.com/kimkkkkk/shanhe-yousheng.git
 * [new branch]      main -> main
```

然后打开仓库确认：

```text
https://github.com/kimkkkkk/shanhe-yousheng
```

如果提示连接被重置、超时：

1. 重新执行一次 `git push -u origin main`；
2. 关闭 VPN / 代理后再试；
3. 换手机热点或稍后重试；
4. 仍然失败时，把完整报错发出来。

### 方式 B：VS Code

1. 打开 VS Code → 文件 → 打开文件夹：

```text
D:\vibe coding\项目\山河有声
```

2. 按 `Ctrl+Shift+G` 打开「源代码管理」；
3. 点击 **Sync Changes / 同步更改**；
4. 如果提示登录 GitHub，按浏览器提示授权。

当前已经配置了远程仓库，**不要再点「Publish to GitHub」创建新仓库**，否则可能出现第二个空仓库。

---

## 二、如果以后需要重新创建远程仓库

1. 打开 <https://github.com/new>；
2. Owner 选 `kimkkkkk`；
3. Repository name 填 `shanhe-yousheng`；
4. 可公开或私有，但**不要**勾选 README / .gitignore / license；
5. 创建后设置远程并 push：

```powershell
$git = "D:\vibe coding\git\Git\cmd\git.exe"
Set-Location "D:\vibe coding\项目\山河有声"

& $git remote set-url origin https://github.com/kimkkkkk/shanhe-yousheng.git
& $git push -u origin main
```

---

## 三、日常管理（VS Code）

最常见的循环：

```text
改代码 → 打开源代码管理 → 查看改动 → 填写提交说明 → Commit → Sync Changes
```

### 提交前检查

```powershell
$git = "D:\vibe coding\git\Git\cmd\git.exe"
Set-Location "D:\vibe coding\项目\山河有声"

& $git status        # 看有哪些改动
& $git diff          # 看具体内容
npm test             # 跑测试
```

### 提交说明建议

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `feat:` | 新功能 | `feat: add Sichuan dialect narration` |
| `fix:` | 修 bug | `fix: correct mobile editor layout` |
| `docs:` | 文档 | `docs: update deployment guide` |
| `style:` | 样式 | `style: refine result page spacing` |
| `refactor:` | 重构 | `refactor: split narration logic` |
| `test:` | 测试 | `test: add location fallback cases` |
| `chore:` | 杂项 | `chore: update PWA icons` |

一次提交只做一件事。不要写「update」「修改一下」这种说明。

---

## 四、分支与合并

小改动可以直接在 `main` 上做。功能较大时：

1. VS Code 左下角点击 `main`；
2. 选择 **Create new branch**；
3. 分支名用 `feature/new-dialect`、`fix/location-distance` 这类格式；
4. 在分支提交并点击 **Publish Branch**；
5. 在 GitHub 上发起 **Pull Request**，检查后合并到 `main`。

---

## 五、常用 Git 命令

```powershell
$git = "D:\vibe coding\git\Git\cmd\git.exe"
Set-Location "D:\vibe coding\项目\山河有声"

& $git status
& $git log --oneline --graph -10
& $git add -A
& $git commit -m "feat: describe your change"
& $git push
& $git pull --rebase
& $git remote -v
& $git diff --stat
```

如果 `git pull` 提示有冲突，先打开冲突文件，保留正确内容，删除 `<<<<<<<`、`=======`、`>>>>>>>` 标记，然后：

```powershell
& $git add 冲突文件
& $git rebase --continue
```

---

## 六、仓库设置建议

在 GitHub 仓库页面：

- **About**：填写「用一张风景照生成普通话与方言双语音解、地方志故事、修图与朋友圈文案」；
- **Topics**：`pwa`、`travel`、`china`、`canvas`、`speech-synthesis`、`photo-editor`；
- **Actions**：仓库已带 `.github/workflows/ci.yml`，每次 push 自动跑测试、构建和产物校验；
- **Releases**：稳定版本可以打 tag，例如 `v1.0.0`；
- **Pages**：当前是根路径构建，不适合直接放 GitHub Pages 项目子路径；
- **部署**：Netlify / Vercel / Cloudflare Pages 连接仓库即可，构建命令 `node scripts/build.mjs`，输出目录 `dist`。

---

## 七、哪些内容不要提交

`.gitignore` 已经自动忽略：

- `dist/`：构建生成；
- `shots/`：本地验收截图，README 用图已移到 `docs/screenshots/`；
- `*.zip`、`SHA256SUMS.txt`：发布包与校验文件；
- `node_modules/`、`.env`、日志和系统文件。

不要提交账号密码、Token、私钥。GitHub 上的公开仓库会保留历史，误传密钥后需要立即删除仓库或轮换密钥。

---

## 八、换电脑或重新拉取

```powershell
$git = "D:\vibe coding\git\Git\cmd\git.exe"
Set-Location "D:\vibe coding"

& $git clone https://github.com/kimkkkkk/shanhe-yousheng.git
Set-Location ".\shanhe-yousheng"

npm run build
npm run preview
```

开发服务器：

```powershell
npm start
# http://localhost:4173
```

生产预览：

```powershell
npm run preview
# http://localhost:4174
```

---

## 九、出问题先看这三条

```powershell
& $git status
& $git remote -v
& $git log --oneline --decorate -5
```

- `status`：有没有未提交或冲突文件；
- `remote -v`：仓库地址是否正确；
- `log`：本地提交有没有丢。

更多部署细节见 [DEPLOY.md](DEPLOY.md)。


---

## GitHub Pages 公开链接

公开地址：

```text
https://kimkkkkk.github.io/shanhe-yousheng/
```

首次使用时，先在仓库设置里启用 Pages：

1. 打开 `https://github.com/kimkkkkk/shanhe-yousheng/settings/pages`
2. **Build and deployment → Source** 选择 **GitHub Actions**
3. 打开 `https://github.com/kimkkkkk/shanhe-yousheng/actions/workflows/pages.yml`
4. 点击 **Run workflow / 运行工作流**

工作流会自动按 `/shanhe-yousheng/` 子路径构建并发布。之后每次 `push` 只需要在 Actions 页面手动运行，或把 `pages.yml` 的 `push` 触发器重新打开。

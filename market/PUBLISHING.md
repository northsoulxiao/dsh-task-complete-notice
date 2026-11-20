# 上架到插件市场

## 先弄清「市场」是什么

DSH 目前**没有官方插件索引**：插件页的「发现 / Discover」标签页只列出你自己添加的索引源。所以「上架」= 两件事同时成立：

1. 包能装：发布到 npm（或任何 pnpm 能装的 registry / Git 仓库）。
2. 索引能列：把一份 format 1 的 JSON 索引托管在一个稳定的 https 直链上，用户在「发现」里添加这个 URL 就能搜到、安装。

本目录已有的产物：

| 文件 | 用途 |
|---|---|
| `../dist/dsh-task-complete-notice-1.0.0.tgz` | `pnpm pack` 产物，`pnpm publish` 上传的就是这份内容 |
| `index.json` | 格式 1 的插件索引（已用 DSH 自带校验器验过） |
| `build-index.mjs` | 从 `package.json` + `locale/*.json` + `icon.svg` 生成 `index.json`，并保留旧版本条目 |
| `validate-index.mjs` | 用 DSH 安装里的 `@deepseek-ai/dsh-plugin-market-index` 校验索引 |

## 发布包

包名 `dsh-task-complete-notice` 若在 npm 上已被占用，改成带 scope 的名字，例如 `@your-name/dsh-task-complete-notice`，同时改 `package.json` 的 `name` 和 `index.json` 里的 `name`。

本机没有全局 npm / node，用内置运行时：

```powershell
$node = 'C:\Users\xiaol\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\xiaol\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs'
$env:PATH = (Split-Path $node) + ';' + $env:PATH

cd 'D:\OneDrive\Harness WorkSpace\General Work\dsh-task-complete-notice'
& $node $pnpm publish --access public --no-git-checks
```

没登录过时先 `& $node $pnpm login`（或设置 `NPM_TOKEN` 环境变量）。发布前可 `& $node $pnpm publish --dry-run` 复核内容，实际列出的文件应与 `pnpm pack` 的 14 个文件一致。

## 托管索引

- 必须是 **https 直链，不能 302 重定向**（Host 拒绝重定向），所以别用会跳转的短链。
- 可选：GitHub Pages、jsDelivr、任意静态站点、GitHub `raw.githubusercontent.com` 直链。
- 索引里的图标是内嵌的 `data:` URL，不用额外托管图片；预览图由包内的 `docs/preview.svg` 提供，也不用单独托管。
- 建议把 `index.json` 和这个仓库放在一起，发布新版本时只覆盖这一个文件。

## 在 DSH 里添加索引

**插件 → 发现**，填入索引 URL，就能搜到「任务完成提示 / Task completion notice」并安装。前提是「设置 → 实验性插件 → 自定义插件索引」处于开启状态（本机已开启）。

## 发新版本

1. 改 `package.json` 的 `version`，在 `CHANGELOG.md` 补一节。
2. `node market/build-index.mjs` —— 新版本插到 `versions` 最前，旧版本保留（用户可回装）。
3. `node market/validate-index.mjs` —— 校验格式 1。
4. `pnpm publish`。
5. 覆盖托管上的 `index.json`。索引有 10 分钟缓存（`cacheTtlMs`），急用可在「发现」里刷新。

## 校验命令（本机）

Desktop 版把 DSH 和校验器都装在 `app.asar` 里，普通 node 读不到，必须用 Electron 二进制以 Node 模式跑：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "$env:DSH_NODE_EXECUTABLE" 'D:\OneDrive\Harness WorkSpace\General Work\dsh-task-complete-notice\market\validate-index.mjs'
```

`$env:DSH_INSTALL_DIR` 由 DSH 注入，脚本靠它定位校验器。

## 上架前需要你确认的三件事

- **包名**：`dsh-task-complete-notice` 在 npm 是否已被占用（我这边无法访问 registry 确认）。
- **索引地址**：决定托管在哪，索引 URL 就是用户要填的那个。
- **分发渠道**：自建索引（可立即上线）／投递到第三方社区索引（部分接受 PR，规则各不同）。

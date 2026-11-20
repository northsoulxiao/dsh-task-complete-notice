# 投递 dshopen.org 开放插件市场

## 要不要注册账号

- **dshopen.org 本站不需要注册**：浏览、搜索、点赞都不登录。
- **投稿走 GitHub Issue**：在 [`polang233/dsh-plugin-index`](https://github.com/polang233/dsh-plugin-index) 开一个「插件收录」申请，所以需要一个 **GitHub 账号**（免费）。仓库没有别的投稿入口，也不收邮件。
- 入口：<https://github.com/polang233/dsh-plugin-index/issues/new?template=plugin-add.yml>
- 收录后由维护者改动索引并发布，索引地址就是 `https://dshopen.org/index.json`——你本机 profile 里已经配了这个源，收录后刷新「发现」即可看到（索引有缓存，最多 10 分钟）。

## 硬性条件（据其 CONTRIBUTING，2026-10 版）

| 条件 | 说明 |
|---|---|
| 可安装来源 | 公开的 **npm 版本**，或一个**固定的 GitHub 提交**（给全 40 位 SHA） |
| bundle 声明 | `package.json` 里有 `dsh.bundle.patch`，且补丁文件在发布包里 |
| 源码与许可 | 公开源码仓库 + 明确的 `license` 字段和仓库里的 `LICENSE` 文件 |
| 用途清楚 | 一句话说明插件做什么，中英文都行（中英简介由维护者补写） |
| 加分项 | 自己的 Logo、1–6 张实际使用截图（每张一句说明，**遮住密钥和个人信息**）、测过的 DSH 版本与系统 |
| 兼容范围 | 写进 `engines.dsh` 或 DSH 相关 `peerDependencies` |

## 我们这份包的现状

- ✅ `dsh.bundle.patch` → `cordis.patch.yml`，已在 `dist/dsh-task-complete-notice-1.0.0.tgz` 里
- ✅ MIT，`license` 字段 + `LICENSE` 文件
- ✅ `engines.dsh`: `>=0.2.2-rc.5 <0.3.0`（本机 0.2.2-rc.5 实测兼容）
- ✅ 中英 README、图标、详情配图、关键词含 `dsh` / `dsh-plugin` / `deepseek-harness`
- ✅ 不注册 `webServer` 接口、不联网、不写工作区以外的文件——其常见退回原因（接口缺宿主认证、跨域过宽、路径不设限）都不涉及
- ❌ **公开仓库**：还没有
- ❌ **npm 版本**：还没发布（或改走固定提交路线）

## 两条路线

### A. npm 路线（推荐，之后自动跟版本）

1. `pnpm publish --access public`（见 `PUBLISHING.md`），确认 `https://registry.npmjs.org/dsh-task-complete-notice` 能打开。
2. 建公开 GitHub 仓库并把源码推上去，加上 `dsh-plugin` topic。
3. 在 issue 里填 npm 包名 `dsh-task-complete-notice`。

好处：索引默认跟踪 npm `latest`，发新版本只改版本号，不用再找维护者核 SHA。

### B. 固定提交路线（没有 npm 账号也能过）

1. 建公开 GitHub 仓库，用网页的 **Add file → Upload files** 上传本目录（不需要本机 git）。仓库根目录就是包根（有 `package.json`）。
2. 在仓库的 **Commits** 页面复制最新提交的完整 40 位 SHA。
3. 在 issue 里给出仓库 URL、版本 `1.0.0`、这个 SHA；若包在子目录，注明目录。
4. 之后每次升级都要维护者重新核一个新 SHA，所以只适合先上架。

## issue 正文（直接粘，替换 `<...>`）

```text
### 插件地址
dsh-task-complete-notice
（源码：<https://github.com/你的账号/dsh-task-complete-notice>，包在仓库根目录）

### 简短说明
每个轮次结束时播放提示音并在 Windows 桌面弹出通知：标题带工作区目录名，正文是本轮最后一段回答和用时；子代理轮次默认静默。通知顶部显示 DeepSeek Harness 而不是 Windows PowerShell，因为 Toast 用的是 DSH 自己的 AppUserModelID。纯本地，不联网，不写工作区以外的文件，仅支持 Windows 10/11。

### 插件实际效果
见附件 notification.png：一次真实的任务完成通知（标题「任务完成 · General Work」，正文为最后一段回答与用时）。

### 补充信息
- 已验证：DSH 0.2.2-rc.5 / Windows 11 / desktop profile，桌面通知与提示音均正常。
- 兼容范围：engines.dsh = >=0.2.2-rc.5 <0.3.0。
- 许可证：MIT（LICENSE 在包根）。
- 配置项：enabled / sound / style（toast 或 window）/ notifyOnError / skipSubagents / minTurnDurationMs / maxBodyChars / title / errorTitle / appId。
- Logo：见附件 icon-256.png。
```

## 附件

- `market/screenshots/notification.png` —— 真实的完成通知（426×198，已裁掉桌面其它窗口内容）
- `market/screenshots/icon-256.png` —— 插件 Logo，256×256 透明底

## 提交前自查

- 先在 dshopen.org 搜 `notice` / `通知`，看有没有同类；有也在申请里说明差异（我们的是「轮次结束提示 + 可改发送方」）。
- 仓库名、包名、issue 里写的名字三处一致。
- SHA 是 40 位，不是前 7 位短 SHA。
- 仓库加了 `dsh-plugin` topic，`package.json` 的 `repository` 字段等仓库建好后补上，索引页会多一个「源码」链接。

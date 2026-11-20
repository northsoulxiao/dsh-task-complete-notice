# 任务完成提示（dsh-task-complete-notice）

DSH 每轮（turn）结束时，在本机 Windows 上播放提示音并弹出桌面通知，这样你可以把 DSH 放到一边去干别的，不用一直盯着屏幕。

![通知示例](docs/preview.svg)

## 功能

- 监听持久会话事件 `session/event` 的 `turn/start`、`assistant/message`、`turn/end`，不轮询、不加模型请求、不写会话日志。
- 通知标题：`任务完成 · <工作区目录名>`；正文：本轮最后一段回答（单行压缩，可截断）+ 用时。
- 结束原因为 `error` 的轮次用「任务已结束（有异常）」标题和系统错误音；`interrupted` / `forked`（崩溃修复、fork 收尾）不提示。
- 子代理（`origin: subagent`）的轮次默认静默，一次带子代理的任务不会刷出一串提示。
- 发射方式：隐藏子进程 `powershell.exe` 调本包 `lib/notify.ps1`；优先 Windows Toast，Toast 不可用时退化为托盘气泡，`style: window` 则弹右下角小窗。失败绝不会影响会话。

## 环境要求

- Windows 10 / Windows 11；其它平台插件空转。
- DeepSeek Harness `>=0.2.2-rc.5 <0.3.0`。

## 安装

- 从插件索引：**插件** → **发现**，添加索引 URL，然后安装「任务完成提示」。
- 从已发布的包：用插件管理安装 `dsh-task-complete-notice`，或用 `plugin_manager` 的 `install_bundle` 传入包名。
- 从本目录：**插件** → **添加插件**，选择该目录（或打包出来的 `.tgz`）。

## 配置

配置写在 `cordis.patch.yml` 的 `config` 下（DSH 设置层同样可覆盖）：

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；`false` 时插件仍装载，但完全不发通知 |
| `sound` | `default` | `default` 系统提示音；`none` 静音；其它值按绝对路径播放 WAV |
| `style` | `toast` | `toast` 桌面通知；`window` 右下角小窗（更醒目，会短暂抢焦点，8 秒自动关闭） |
| `notifyOnError` | `true` | 出错 / 触发上限的轮次是否也提示 |
| `skipSubagents` | `true` | 子代理轮次是否静默 |
| `minTurnDurationMs` | `0` | 只提示耗时超过该毫秒数的轮次（例如 `15000` 过滤掉秒回） |
| `maxBodyChars` | `140` | 正文摘要截断长度 |
| `title` / `errorTitle` | `任务完成` / `任务已结束（有异常）` | 标题文案 |
| `appId` | `com.deepseek.dsh` | 决定通知顶部显示哪个应用名的 AppUserModelID |

## 通知来源为什么显示 DeepSeek Harness

Windows 通知顶部那行「发送方」取的是 **AppUserModelID（AUMID）** 对应的应用名，跟真正发通知的进程无关——实际发通知的仍然是隐藏的 `powershell.exe`。

- 用 PowerShell 自己的 AUMID（`{1AC14E77-…}\WindowsPowerShell\v1.0\powershell.exe`）会显示「Windows PowerShell」。
- 本插件默认用 DSH 桌面版的 AUMID `com.deepseek.dsh`（开始菜单 `DeepSeek Harness.lnk` 注册的那个），于是显示「DeepSeek Harness」和应用图标；这条通知也会归到系统「通知」设置里的 DeepSeek Harness 名下，可以单独静音。
- 若该 AUMID 在本机不存在，脚本会退回 PowerShell 的 AUMID 保证通知仍能弹出，此时日志里记作 `shown=toast-fallback`；把 `appId` 改成本机已注册的其它 AUMID 即可换名字。

## 已知限制

- 仅在 Windows 生效。
- 系统「专注助手 / 勿扰模式」开启时，Windows 可能吞掉 Toast；提示音不受影响。若 Toast 不可见，把 `style` 改成 `window`。
- 提示音跟随系统音量与系统提示音设置。
- 一次会话里若有排队输入导致连续多轮，会按轮次各提示一次。
- 每次通知都会短暂拉起一个隐藏的 `powershell.exe` 进程（约一秒 CPU 工作）。

## 手动试听

```powershell
$payload = '{"title":"任务完成 · 测试","body":"提示音和桌面通知的预览","sound":"default","style":"toast","kind":"info","appId":"com.deepseek.dsh"}'
$file = Join-Path $env:TEMP 'dsh-notice-test.json'
[System.IO.File]::WriteAllText($file, $payload, (New-Object System.Text.UTF8Encoding($false)))
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\lib\notify.ps1 -PayloadFile $file
```

`%TEMP%\dsh-task-notice.log` 的最后几行记录了实际弹出的形式与所用的 AUMID。

## 变更记录与许可

见 [CHANGELOG.md](CHANGELOG.md) 与 [LICENSE](LICENSE)（MIT）。

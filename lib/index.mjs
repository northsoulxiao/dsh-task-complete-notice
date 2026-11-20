/**
 * dsh-task-complete-notice — 在 DSH 每个轮次（turn）结束时，播放提示音并在 Windows 桌面弹出通知。
 *
 * 实现要点：
 * - 只监听持久会话事件 `session/event`（`turn/start` / `assistant/message` / `turn/end`），
 *   不轮询、不改写会话日志，也不额外占用模型请求。
 * - 子代理（`meta.origin === 'subagent'`）的轮次默认静默，避免一次任务刷出一串提示。
 * - Windows 侧通过子进程 `powershell.exe` 调用同目录下的 `notify.ps1`：
 *   优先 Windows Toast，失败时退化为托盘气泡；`style: 'window'` 则弹一个右下角窗口。
 *   Toast 用 DSH 自己的 AUMID（`appId`）发送，通知顶部显示「DeepSeek Harness」而非「Windows PowerShell」。
 * - 脚本纯 ASCII，所有中文文案通过 UTF-8 JSON 载荷传递，避开 PowerShell 5.1 的编码坑。
 *
 * ⚠️ 不要给 dispatch 的子进程加 `detached: true`（2026-11-20 实测）：
 * 本机 Node/Electron 下 `powershell.exe` 一旦以 DETACHED_PROCESS 启动，
 * 会在约 60ms 内以退出码 0 静默结束、不执行脚本（`windowsHide` 与
 * `-WindowStyle Hidden` 都不是原因），于是提示音和通知全部消失。
 * 现在用 `windowsHide: true` + `stdio: 'ignore'` + `child.unref()`：
 * 一样不阻塞、不弹控制台窗口，子进程还能活过本轮结束。
 */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'task-complete-notice'
export const inject = ['sessions']

/** 本包内 notify.ps1 的绝对路径（插件以链接目录安装，须按本文件位置解析）。 */
const HERE = dirname(fileURLToPath(import.meta.url))
const NOTIFY_SCRIPT = join(HERE, 'notify.ps1')

/** 未在 patch 中配置时采用的默认值。 */
const DEFAULTS = {
  /** 总开关；false 时插件仍装载，但完全不发通知。 */
  enabled: true,
  /** 'default' 用系统提示音；'none' 静音；其它值按绝对路径播放 WAV。 */
  sound: 'default',
  /** 'toast' 桌面通知；'window' 右下角弹窗（更醒目，会短暂抢焦点）。 */
  style: 'toast',
  /** 出错 / 被中断 / 触发上限的轮次是否也提示。 */
  notifyOnError: true,
  /** 子代理的轮次是否也提示。 */
  skipSubagents: true,
  /** 只提示耗时超过该毫秒数的轮次；0 表示每个轮次都提示。 */
  minTurnDurationMs: 0,
  /** 通知正文截断长度。 */
  maxBodyChars: 140,
  /** 成功标题。 */
  title: '任务完成',
  /** 失败类标题。 */
  errorTitle: '任务已结束（有异常）',
  /**
   * Windows Toast 的 AppUserModelID（AUMID）。通知顶部那行「发送方」由它决定，
   * 而不是由发通知的 powershell.exe 决定。默认用 DSH 自己的 AUMID（开始菜单里
   * `DeepSeek Harness.lnk` 注册的那个），于是显示「DeepSeek Harness」+ 应用图标；
   * 若沿用 PowerShell 的 AUMID 则显示「Windows PowerShell」。
   */
  appId: 'com.deepseek.dsh',
}

const CLIP_SUFFIX = '…'

/**
 * 读取会话的创建元数据。`Session` 公开的是 `header`（`SessionHeader`，含 `cwd` 与
 * `origin`），这里同时兼容 `meta` 命名，避免不同版本的字段名差异导致整块降级。
 * @param session 会话对象。
 * @returns 创建元数据；拿不到时返回空对象。
 */
function headerOf(session) {
  const header = session?.header ?? session?.meta
  return header && typeof header === 'object' ? header : {}
}

/**
 * 从助手消息里拼出纯文本正文。
 * @param message 事件里的 AssistantMessage（只读 content 块数组）。
 * @returns 去掉首尾空白的文本；没有文本块时为空串。
 */
function textOf(message) {
  if (!message || !Array.isArray(message.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
      parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

/**
 * 把一段长文本压成单行摘要。
 * @param text 原始文本。
 * @param max 最大字符数。
 * @returns 压缩后的摘要。
 */
function summarize(text, max) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!Number.isFinite(max) || max <= 0) return flat
  if (flat.length <= max) return flat
  return flat.slice(0, Math.max(1, max - 1)) + CLIP_SUFFIX
}

/**
 * 人类可读的耗时。
 * @param ms 毫秒。
 * @returns 形如「12 秒」「3 分 05 秒」的文本。
 */
function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} 秒`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`
  const hours = Math.floor(minutes / 60)
  return `${hours} 小时 ${String(minutes % 60).padStart(2, '0')} 分`
}

/**
 * 把轮次结束原因映射成通知用的语气。
 * @param kind `TurnEndReason.kind`。
 * @returns 'info' | 'error' | 'warning'。
 */
function toneOf(kind) {
  if (kind === 'completed') return 'info'
  if (kind === 'error') return 'error'
  return 'warning'
}

/**
 * 派生通知文案。
 * @param session 会话（读取 meta.cwd 得到工作区名）。
 * @param state 本轮累积的状态（开始时间与最后一段助手文本）。
 * @param kind 轮次结束原因。
 * @param config 合并后的配置。
 * @returns 通知载荷。
 */
function buildPayload(session, state, kind, config) {
  const tone = toneOf(kind)
  const folder = basename(String(headerOf(session).cwd ?? '')) || 'DSH'
  const title = tone === 'info' ? config.title : config.errorTitle
  const snippet = summarize(state.text, config.maxBodyChars)
  const facts = [`用时 ${formatDuration(Date.now() - state.startedAt)}`]
  if (tone === 'error') facts.push('本轮出错')
  else if (tone === 'warning') facts.push(`结束原因：${kind}`)
  const body = [snippet || `${folder} 的这轮工作已结束。`, facts.join(' · ')].join('\n')
  return {
    title: `${title} · ${folder}`,
    body,
    sound: config.sound,
    style: config.style,
    kind: tone,
    appId: config.appId,
  }
}

/**
 * 只记录通知链路上的失败，正常轮次不写任何文件。
 * @param line 单行描述。
 */
function logFailure(line) {
  try {
    const file = join(tmpdir(), 'dsh-task-notice.log')
    const stamp = new Date().toISOString()
    appendFileSync(file, `${stamp}\tfailed\t${line}\n`, 'utf8')
  } catch {
    /* 诊断写不进就算了 */
  }
}

/**
 * 以隐藏的独立子进程发一次 Windows 通知，绝不阻塞或影响本轮结束。
 * @param payload 传给 notify.ps1 的 JSON 载荷。
 */
function dispatch(payload) {
  let directory
  try {
    directory = mkdtempSync(join(tmpdir(), 'dsh-task-notice-'))
    const file = join(directory, 'payload.json')
    writeFileSync(file, JSON.stringify(payload), 'utf8')
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        NOTIFY_SCRIPT,
        '-PayloadFile',
        file,
      ],
      // 见文件头注释：这里刻意不使用 detached。
      { stdio: 'ignore', windowsHide: true },
    )
    child.on('error', (error) => { logFailure(`spawn ${String(error)}`) })
    child.unref()
  } catch (error) {
    logFailure(`dispatch ${String(error)}`)
    /* 通知失败不影响主流程 */
  }
}

/**
 * 插件入口。
 * @param ctx Cordis 上下文。
 * @param config patch 行里的 config。
 */
export function apply(ctx, config) {
  const settings = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) }
  if (!settings.enabled || process.platform !== 'win32') return

  /** sessionId -> { startedAt, text } */
  const turns = new Map()

  ctx.on('session/event', (session, event) => {
    try {
      const id = String(session?.id ?? '')
      if (!id || !event || typeof event.type !== 'string') return
      const data = event.data ?? {}

      if (event.type === 'turn/start') {
        turns.set(id, { startedAt: Date.now(), text: '' })
        return
      }

      if (event.type === 'assistant/message') {
        const state = turns.get(id) ?? { startedAt: Date.now(), text: '' }
        const text = textOf(data.message)
        if (text) state.text = text
        turns.set(id, state)
        return
      }

      if (event.type !== 'turn/end') return

      const state = turns.get(id) ?? { startedAt: Date.now(), text: '' }
      turns.delete(id)

      const kind = String(data.reason?.kind ?? 'completed')
      // 崩溃修复与 fork 收尾产生的合成结束标记不代表真实完成。
      if (kind === 'interrupted' || kind === 'forked') return
      if (kind !== 'completed' && !settings.notifyOnError) return
      if (settings.skipSubagents && headerOf(session).origin === 'subagent') return
      if (settings.minTurnDurationMs > 0 && Date.now() - state.startedAt < settings.minTurnDurationMs) return

      dispatch(buildPayload(session, state, kind, settings))
    } catch {
      /* 通知永远不应打断会话 */
    }
  })
}

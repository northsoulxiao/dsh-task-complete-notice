# Changelog

## 1.0.0 — 2026-11-20

First release prepared for the DeepSeek Harness plugin market.

- Sound and a Windows desktop notification at the end of every turn, with the workspace folder in the title and the last reply plus the elapsed time in the body.
- The toast is posted under the DeepSeek Harness AppUserModelID, so Windows shows **DeepSeek Harness** as the sender instead of **Windows PowerShell**. New `appId` config overrides it.
- Error turns get their own title and the system error sound; `interrupted` and `forked` turn markers stay silent.
- Subagent turns are silent by default (`skipSubagents`).
- Configurable `enabled`, `sound`, `style` (`toast` / `window`), `notifyOnError`, `minTurnDurationMs`, `maxBodyChars`, `title`, `errorTitle`.
- Falls back to a tray balloon when Windows Runtime toasts are unavailable, and never interrupts the session on failure.
- Packaged for the market: localized titles and descriptions, a detail document with a feature illustration, an icon, an MIT license and this changelog.

## 0.2.0 — 2026-11-20

- The notification sender is configurable through `appId`; it defaults to the DeepSeek Harness AUMID (`com.deepseek.dsh`).
- Falls back to the PowerShell AUMID when the configured one fails, logged as `shown=toast-fallback`.

## 0.1.0

- Initial local plugin: hidden `powershell.exe` child process, toast or corner window, optional custom WAV sound.

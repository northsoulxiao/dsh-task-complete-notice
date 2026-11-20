param(
  [Parameter(Mandatory = $true)][string]$PayloadFile
)

# Pure-ASCII helper: every localized string arrives in the UTF-8 JSON payload,
# so this file is immune to Windows PowerShell 5.1 ANSI decoding of non-ASCII bytes.
# Invoked by dsh-task-complete-notice as a hidden child process.

$ErrorActionPreference = 'Stop'

$jsonText = [System.IO.File]::ReadAllText($PayloadFile, [System.Text.Encoding]::UTF8)
try { Remove-Item -LiteralPath $PayloadFile -Force -ErrorAction SilentlyContinue } catch { }
$payload = $jsonText | ConvertFrom-Json

$title = [string]$payload.title
$body = [string]$payload.body
$sound = [string]$payload.sound
$kind = [string]$payload.kind
$style = [string]$payload.style

# 通知顶部那行「发送方」由 AppUserModelID（AUMID）决定，与发通知的进程无关：
# 发通知的是 powershell.exe，但只要 AUMID 指向 DSH，就显示 DSH 的名字和图标。
# 用 PowerShell 自己的 AUMID（{1AC14E77-...}\WindowsPowerShell\v1.0\powershell.exe）
# 会显示「Windows PowerShell」，正是这里要避免的。
$DshAppId = 'com.deepseek.dsh'
$PowerShellAppId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
$appId = [string]$payload.appId
if ([string]::IsNullOrWhiteSpace($appId)) { $appId = $DshAppId }

if ([string]::IsNullOrWhiteSpace($title)) { $title = 'Task finished' }

function ConvertTo-XmlText([string]$value) {
  if ($null -eq $value) { return '' }
  return $value.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;').Replace('"', '&quot;').Replace("'", '&apos;')
}

function Test-ToastSupport {
  try {
    [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
    [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
    return $true
  } catch {
    return $false
  }
}

function Show-Toast([string]$toastTitle, [string]$toastBody, [string]$toastAppId) {
  $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml = '<toast activationType="foreground" scenario="reminder"><visual><binding template="ToastGeneric"><text>' +
    (ConvertTo-XmlText $toastTitle) + '</text><text>' + (ConvertTo-XmlText $toastBody) + '</text></binding></visual></toast>'
  $doc.LoadXml($xml)
  $toast = New-Object Windows.UI.Notifications.ToastNotification $doc
  try {
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($toastAppId)
    $notifier.Show($toast)
    return $toastAppId
  } catch {
    # AUMID 无效时至少让通知弹出来：退回 PowerShell 自己的 AUMID（代价是显示 Windows PowerShell）。
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($PowerShellAppId)
    $notifier.Show($toast)
    return 'fallback'
  }
}

function Show-Balloon([string]$balloonTitle, [string]$balloonBody) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.BalloonTipTitle = $balloonTitle
  $icon.BalloonTipText = $balloonBody
  $icon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  $icon.Visible = $true
  $icon.ShowBalloonTip(8000)
  Start-Sleep -Milliseconds 9000
  $icon.Visible = $false
  $icon.Dispose()
}

function Show-PopupWindow([string]$popupTitle, [string]$popupBody) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object System.Windows.Forms.Form
  $form.Text = $popupTitle
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedToolWindow
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $form.TopMost = $true
  $form.ShowInTaskbar = $false
  $form.Width = 420
  $form.Height = 170
  $form.BackColor = [System.Drawing.Color]::FromArgb(32, 33, 36)
  $form.ForeColor = [System.Drawing.Color]::White

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $popupBody
  $label.Dock = [System.Windows.Forms.DockStyle]::Fill
  $label.Padding = New-Object System.Windows.Forms.Padding(16)
  $label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)
  $form.Controls.Add($label)

  $screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Left = $screen.Right - $form.Width - 24
  $form.Top = $screen.Bottom - $form.Height - 24

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 8000
  $timer.Add_Tick({ $form.Close() })
  $timer.Start()
  [void]$form.ShowDialog()
  $timer.Stop()
  $form.Dispose()
}

function Play-Sound([string]$spec) {
  if ([string]::IsNullOrWhiteSpace($spec) -or $spec -eq 'none') { return }
  try {
    if ($spec -ne 'default' -and (Test-Path -LiteralPath $spec)) {
      $player = New-Object System.Media.SoundPlayer $spec
      $player.PlaySync()
      return
    }
    if ($kind -eq 'error') {
      [System.Media.SystemSounds]::Hand.Play()
    } elseif ($kind -eq 'warning') {
      [System.Media.SystemSounds]::Exclamation.Play()
    } else {
      [System.Media.SystemSounds]::Asterisk.Play()
    }
  } catch { }
}

$shownAs = 'none'
$usedAppId = ''
try {
  if ($style -eq 'window') {
    Play-Sound $sound
    Show-PopupWindow $title $body
    $shownAs = 'window'
  } elseif (Test-ToastSupport) {
    $usedAppId = Show-Toast $title $body $appId
    if ($usedAppId -eq 'fallback') { $shownAs = 'toast-fallback' } else { $shownAs = 'toast' }
    Play-Sound $sound
  } else {
    Play-Sound $sound
    Show-Balloon $title $body
    $shownAs = 'balloon'
  }
} catch {
  try {
    Play-Sound $sound
    Show-Balloon $title $body
    $shownAs = 'balloon'
  } catch {
    $shownAs = 'failed'
  }
}

[Console]::Out.WriteLine($shownAs)

# Remove the per-notification payload directory the caller created.
# Guard: only ever delete a directory this plugin named itself, so a payload
# that was placed directly in %TEMP% can never wipe the whole temp folder.
try {
  $payloadDir = Split-Path -Parent $PayloadFile
  $leaf = if ($payloadDir) { Split-Path -Leaf $payloadDir } else { '' }
  if ($payloadDir -and $leaf -like 'dsh-task-notice-*' -and (Test-Path -LiteralPath $payloadDir)) {
    Remove-Item -LiteralPath $payloadDir -Recurse -Force -ErrorAction SilentlyContinue
  }
} catch { }

# Rolling one-line trace, so a missing toast/sound can be diagnosed later.
try {
  $logFile = Join-Path ([System.IO.Path]::GetTempPath()) 'dsh-task-notice.log'
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  $line = "{0}`tshown={1}`tstyle={2}`tkind={3}`tappId={4}`ttitle={5}" -f $stamp, $shownAs, $style, $kind, ($(if ($usedAppId) { $usedAppId } else { $appId })), $title
  [System.IO.File]::AppendAllText($logFile, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
} catch { }

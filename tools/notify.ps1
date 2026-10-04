# Shows a Windows notification on this machine (docs/HANDOFF.md §7, "Pings").
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\notify.ps1 -Title "Dam Good Maps: ready to restart" -Body "…"
# A toast through Windows PowerShell's own app id; if toasts aren't available, a tray balloon instead.
# Then, if $env:USERPROFILE.dgm-ntfy-topic exists, one POST to https://ntfy.sh/<topic> (title in the Title header, body as
# the message) so it reaches Kyler's phone (D470). The topic is never printed, logged or committed; a missing file or a
# failed request is silent.
param(
  [Parameter(Mandatory = $true)][string]$Title,
  [string]$Body = ""
)

function Escape([string]$s) { [System.Security.SecurityElement]::Escape($s) }

try {
  [void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
  [void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast><visual><binding template=""ToastGeneric""><text>$(Escape $Title)</text><text>$(Escape $Body)</text></binding></visual></toast>")
  $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
  $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  Write-Output "toast shown"
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $icon = New-Object System.Windows.Forms.NotifyIcon
  $icon.Icon = [System.Drawing.SystemIcons]::Information
  $icon.BalloonTipTitle = $Title
  $icon.BalloonTipText = if ($Body) { $Body } else { " " }
  $icon.Visible = $true
  $icon.ShowBalloonTip(10000)
  Start-Sleep -Seconds 11
  $icon.Dispose()
  Write-Output "balloon shown (toast unavailable: $($_.Exception.Message))"
}

try {
  $topicFile = Join-Path $env:USERPROFILE '.dgm-ntfy-topic'
  if (Test-Path -LiteralPath $topicFile) {
    $topic = (Get-Content -LiteralPath $topicFile -Raw).Trim()
    if ($topic) {
      $message = if ($Body) { $Body } else { $Title }
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($message)
      $headers = @{ Title = $Title }
      [void](Invoke-RestMethod -Uri "https://ntfy.sh/$topic" -Method Post -Body $bytes -Headers $headers -ContentType 'text/plain; charset=utf-8' -TimeoutSec 5)
    }
  }
} catch { }

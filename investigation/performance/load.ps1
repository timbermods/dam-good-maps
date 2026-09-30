param([int]$Samples = 2, [int]$IntervalMs = 1000, [string]$Output = '', [int]$ParentPid = 0, [double]$CpuMax = 25, [int]$QuietDurationMs = 0, [int]$MaxSampleGapMs = 30000, [double]$DeadlineMs = 0, [string]$Metadata = '', [switch]$Streaming)
$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_Processor
$os = Get-CimInstance Win32_OperatingSystem
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
if ($Metadata) { [IO.File]::WriteAllText($Metadata, ([pscustomobject]@{cpu=$cpu.Name; logicalCores=$cpu.NumberOfLogicalProcessors; gpus=$gpus; memoryGB=$os.TotalVisibleMemorySize/1MB; freeMemoryGB=$os.FreePhysicalMemory/1MB} | ConvertTo-Json)) }
$rows = @()
$quietSince = $null
$lastSample = $null
$quietSpanMs = 0
$waitStarted = [DateTime]::UtcNow
for ($i = 0; $i -lt $Samples -or ($QuietDurationMs -gt 0 -and $quietSpanMs -lt $QuietDurationMs); $i++) {
  if ($DeadlineMs -gt 0 -and [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -ge $DeadlineMs) { break }
  $before = @{}
  Get-Process | ForEach-Object { $before[$_.Id] = $_.CPU }
  $start = [DateTime]::UtcNow
  Start-Sleep -Milliseconds $IntervalMs
  $elapsed = ([DateTime]::UtcNow - $start).TotalSeconds
  $processMetrics = @(Get-Process | ForEach-Object {
    if ($before.ContainsKey($_.Id) -and $_.CPU -ge $before[$_.Id]) {
      [pscustomobject]@{ pid = $_.Id; name = $_.ProcessName; privateMB = $_.PrivateMemorySize64 / 1MB; workingMB = $_.WorkingSet64 / 1MB;
        cpuPercent = 100 * ($_.CPU - $before[$_.Id]) / ($elapsed * $cpu.NumberOfLogicalProcessors) }
    }
  })
  $top = @($processMetrics | Sort-Object cpuPercent -Descending | Select-Object -First 15)
  $gpu = $null
  try {
    $gpu = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples |
      Measure-Object -Property CookedValue -Maximum | Select-Object -ExpandProperty Maximum
  } catch { }
  $owned = @($ParentPid)
  if ($ParentPid) {
    $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
    for ($j = 0; $j -lt 12; $j++) {
      $extra = @($all | Where-Object { $owned -contains $_.ParentProcessId -and $owned -notcontains $_.ProcessId } | ForEach-Object { $_.ProcessId })
      if (!$extra.Count) { break }; $owned += $extra
    }
  }
  $loadValue = (Get-CimInstance Win32_Processor).LoadPercentage
  $row = [pscustomobject]@{ at = [DateTime]::UtcNow.ToString('o'); cpuPercent = $loadValue;
    gpuEngineMaxPercent = $gpu; processes = $top; ownedPids = $owned;
    unrelatedCpuPercent = ($processMetrics | Where-Object { $owned -notcontains $_.pid } | Measure-Object -Property cpuPercent -Sum).Sum;
    browserPrivateMB = ($processMetrics | Where-Object { $owned -contains $_.pid -and $_.name -match '^(msedge|firefox|plugin-container)$' } | Measure-Object -Property privateMB -Sum).Sum }
  if ($Streaming) { [IO.File]::AppendAllText($Output, ($row | ConvertTo-Json -Depth 7 -Compress) + "`n") } else { $rows += $row }
  $at = [DateTime]::Parse($row.at)
  if ($null -ne $lastSample -and ($at-$lastSample).TotalMilliseconds -gt $MaxSampleGapMs) { $quietSince = $null }
  if ($null -eq $row.cpuPercent -or $row.cpuPercent -lt 0 -or $row.cpuPercent -gt $CpuMax) { $quietSince=$null }
  elseif ($null -eq $quietSince) { $quietSince=$at }
  if ($null -ne $quietSince) { $quietSpanMs=($at-$quietSince).TotalMilliseconds } else { $quietSpanMs=0 }
  $lastSample=$at
}
if ($Streaming) { exit 0 }
$qualifiedRows = $rows
if ($QuietDurationMs -gt 0) {
  $qualifiedRows = @($rows | Where-Object { $null -ne $quietSince -and [DateTime]::Parse($_.at) -ge $quietSince })
}
$result = [pscustomobject]@{ cpu = $cpu.Name; logicalCores = $cpu.NumberOfLogicalProcessors; gpus = $gpus;
  memoryGB = $os.TotalVisibleMemorySize / 1MB; freeMemoryGB = $os.FreePhysicalMemory / 1MB; samples = @($qualifiedRows);
  waitingSamples = @($rows); elapsedWaitMs = ([DateTime]::UtcNow - $waitStarted).TotalMilliseconds;
  quietDurationMs = $quietSpanMs;
  quiet = ($qualifiedRows.Count -gt 0 -and @($qualifiedRows | Where-Object { $null -eq $_.cpuPercent -or $_.cpuPercent -lt 0 -or $_.cpuPercent -gt $CpuMax }).Count -eq 0 -and $quietSpanMs -ge $QuietDurationMs) }
$json = $result | ConvertTo-Json -Depth 7
if ($Output) { [IO.File]::WriteAllText($Output, $json) } else { $json }

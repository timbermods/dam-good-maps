param([int]$Samples = 5, [int]$IntervalMs = 1000, [string]$Output = '', [int]$ParentPid = 0, [double]$CpuMax = 15, [double]$GpuMax = 20, [switch]$Streaming)
$ErrorActionPreference = 'Stop'
$cpu = Get-CimInstance Win32_Processor
$os = Get-CimInstance Win32_OperatingSystem
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
$rows = @()
for ($i = 0; $i -lt $Samples; $i++) {
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
  $row = [pscustomobject]@{ at = [DateTime]::UtcNow.ToString('o'); cpuPercent = [double](Get-CimInstance Win32_Processor).LoadPercentage;
    gpuEngineMaxPercent = $gpu; processes = $top; ownedPids = $owned;
    unrelatedCpuPercent = ($processMetrics | Where-Object { $owned -notcontains $_.pid } | Measure-Object -Property cpuPercent -Sum).Sum;
    browserPrivateMB = ($processMetrics | Where-Object { $owned -contains $_.pid -and $_.name -match '^(msedge|firefox|plugin-container)$' } | Measure-Object -Property privateMB -Sum).Sum }
  if ($Streaming) { [IO.File]::AppendAllText($Output, ($row | ConvertTo-Json -Depth 7 -Compress) + "`n") } else { $rows += $row }
}
if ($Streaming) { exit 0 }
$result = [pscustomobject]@{ cpu = $cpu.Name; logicalCores = $cpu.NumberOfLogicalProcessors; gpus = $gpus;
  memoryGB = $os.TotalVisibleMemorySize / 1MB; freeMemoryGB = $os.FreePhysicalMemory / 1MB; samples = $rows;
  quiet = (@($rows | Where-Object { $_.cpuPercent -gt $CpuMax -or $null -eq $_.gpuEngineMaxPercent -or $_.gpuEngineMaxPercent -gt $GpuMax }).Count -eq 0) }
$json = $result | ConvertTo-Json -Depth 7
if ($Output) { [IO.File]::WriteAllText($Output, $json) } else { $json }

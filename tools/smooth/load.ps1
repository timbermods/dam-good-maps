# The machine-load sampler (adapted from investigation/performance/load.ps1): once a second, appends one JSON line
# to -Output with the CPU of everything outside the runner's process tree ("outside": the runner, this sampler and
# the measured browser are excluded), the whole machine's CPU, and the busiest outside processes. Percent of the
# whole machine (all logical processors). Runs until killed.
param([Parameter(Mandatory)][int]$ParentPid, [Parameter(Mandatory)][string]$Output, [int]$IntervalMs = 1000)
$ErrorActionPreference = 'Stop'
$cores = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$prev = @{}
Get-Process | ForEach-Object { $prev[$_.Id] = $_.CPU }
$last = [DateTime]::UtcNow
while ($true) {
  Start-Sleep -Milliseconds $IntervalMs
  $now = [DateTime]::UtcNow
  $elapsed = ($now - $last).TotalSeconds
  $last = $now
  $procs = @(Get-Process)
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId)
  $owned = @($ParentPid)
  for ($j = 0; $j -lt 12; $j++) {
    $extra = @($all | Where-Object { $owned -contains $_.ParentProcessId -and $owned -notcontains $_.ProcessId } | ForEach-Object { $_.ProcessId })
    if (!$extra.Count) { break }
    $owned += $extra
  }
  $ownership = @($all | Where-Object { $_.ProcessId -eq $ParentPid }).Count -eq 1
  $cur = @{}
  $rows = @()
  foreach ($p in $procs) {
    $cur[$p.Id] = $p.CPU
    if ($prev.ContainsKey($p.Id) -and $null -ne $p.CPU -and $null -ne $prev[$p.Id] -and $p.CPU -ge $prev[$p.Id]) {
      $rows += [pscustomobject]@{ id = $p.Id; name = $p.ProcessName; cpu = 100 * ($p.CPU - $prev[$p.Id]) / ($elapsed * $cores) }
    }
  }
  $prev = $cur
  $other = @($rows | Where-Object { $owned -notcontains $_.id })
  $outside = ($other | Measure-Object -Property cpu -Sum).Sum
  $load = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
  $top = @($other | Sort-Object cpu -Descending | Select-Object -First 5 | ForEach-Object { [pscustomobject]@{ name = $_.name; cpu = [math]::Round($_.cpu, 1) } })
  $line = [pscustomobject]@{ at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); outside = $outside; total = $load; ownership = $ownership; top = $top }
  [IO.File]::AppendAllText($Output, ($line | ConvertTo-Json -Depth 4 -Compress) + "`n")
}

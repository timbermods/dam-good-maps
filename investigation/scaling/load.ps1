param([string]$Output,[string]$Stop)
$previous=@{}; $previousAt=Get-Date
while (-not (Test-Path -LiteralPath $Stop)) {
  $at=Get-Date
  $cpu=(Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
  $os=Get-CimInstance Win32_OperatingSystem
  $processes=Get-Process -ErrorAction SilentlyContinue
  $seconds=[Math]::Max(0.001,($at-$previousAt).TotalSeconds)
  $top=@($processes | ForEach-Object {
    $delta=0; if($previous.ContainsKey($_.Id)){$delta=[Math]::Max(0,$_.CPU-$previous[$_.Id])/$seconds/[Environment]::ProcessorCount*100}
    [PSCustomObject]@{pid=$_.Id;name=$_.ProcessName;cpuPercent=[Math]::Round($delta,2);workingSet=$_.WorkingSet64;privateBytes=$_.PrivateMemorySize64}
  } | Sort-Object cpuPercent -Descending | Select-Object -First 8)
  $memory=@($processes | Where-Object { $_.ProcessName -in @('msedge','chrome','firefox','node') } | ForEach-Object { @{pid=$_.Id;name=$_.ProcessName;workingSet=$_.WorkingSet64;peakWorkingSet=$_.PeakWorkingSet64;privateBytes=$_.PrivateMemorySize64} })
  @{at=$at.ToUniversalTime().ToString('o');cpuPercent=$cpu;availableBytes=[long]$os.FreePhysicalMemory*1024;top=$top;processMemory=$memory} | ConvertTo-Json -Depth 5 -Compress | Add-Content -LiteralPath $Output
  $previous=@{}; foreach($p in $processes){$previous[$p.Id]=$p.CPU}; $previousAt=$at
  Start-Sleep -Milliseconds 750
}

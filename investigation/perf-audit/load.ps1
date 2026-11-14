$ErrorActionPreference = 'Stop'
Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -Continuous | ForEach-Object {
  $_.CounterSamples.CookedValue.ToString('R', [System.Globalization.CultureInfo]::InvariantCulture)
}

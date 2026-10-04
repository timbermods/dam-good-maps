$ErrorActionPreference = 'Stop'
Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -Continuous | ForEach-Object {
  $counterValue = $_.CounterSamples[0].CookedValue
  [Console]::WriteLine($counterValue.ToString('R', [Globalization.CultureInfo]::InvariantCulture))
}

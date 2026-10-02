$ErrorActionPreference = 'Stop'
Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -Continuous | ForEach-Object {
  [Console]::WriteLine($_.CounterSamples[0].CookedValue.ToString('R', [Globalization.CultureInfo]::InvariantCulture))
}

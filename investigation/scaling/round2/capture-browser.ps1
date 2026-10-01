param([int]$Owner,[string]$Engine,[string]$Output)
$scalingProcesses=Get-CimInstance Win32_Process
$scalingOwner=$scalingProcesses | Where-Object ProcessId -eq $Owner
if($scalingOwner.Name -ne 'node.exe' -or $scalingOwner.CommandLine -notlike '*scaling*round2*browser.mjs*'){throw 'browser runner ownership changed'}
$scalingOwnedIds=[System.Collections.Generic.HashSet[int]]::new()
[void]$scalingOwnedIds.Add($Owner)
do {
  $scalingAdded=$false
  foreach($scalingProcess in $scalingProcesses) {
    if($scalingOwnedIds.Contains([int]$scalingProcess.ParentProcessId) -and $scalingOwnedIds.Add([int]$scalingProcess.ProcessId)){$scalingAdded=$true}
  }
} while($scalingAdded)
$scalingNames=if($Engine -eq 'firefox'){@('firefox.exe')}elseif($Engine -eq 'chromium'){@('chrome.exe','chrome-headless-shell.exe')}else{@('MiniBrowser.exe','WebKitWebProcess.exe','WebKitNetworkProcess.exe')}
$scalingMatched=@($scalingProcesses | Where-Object {$scalingOwnedIds.Contains([int]$_.ProcessId) -and $_.Name -in $scalingNames} | ForEach-Object {
  [pscustomobject]@{pid=$_.ProcessId;parent=$_.ParentProcessId;name=$_.Name;createdUtc=$_.CreationDate.ToUniversalTime().ToString('o')}
})
ConvertTo-Json -InputObject $scalingMatched | Set-Content -LiteralPath $Output -Encoding utf8

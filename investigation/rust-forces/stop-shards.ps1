param([Parameter(Mandatory=$true)][string]$RootIds,[Parameter(Mandatory=$true)][string]$Scope)
$ErrorActionPreference='Stop'
# Only PIDs held by this controller, positively identified by their absolute script path.
$allOwnedCandidates=Get-CimInstance Win32_Process
foreach($ownedRootText in $RootIds.Split(',')){
 $ownedRootId=[int]::Parse($ownedRootText)
 $ownedRoot=$allOwnedCandidates | Where-Object {$_.ProcessId -eq $ownedRootId}
 if(!$ownedRoot){continue}
 if($ownedRoot.Name -ne 'node.exe' -or !($ownedRoot.CommandLine.Contains($Scope)) -or $ownedRoot.CommandLine -notmatch '(check|browser)\.mjs'){throw ('Refusing unidentified root PID '+$ownedRootId)}
 $ownedIds=[Collections.Generic.HashSet[int]]::new();[void]$ownedIds.Add($ownedRootId)
 do{$foundOwned=$false;foreach($ownedCandidate in $allOwnedCandidates){if($ownedIds.Contains([int]$ownedCandidate.ParentProcessId)-and !$ownedIds.Contains([int]$ownedCandidate.ProcessId)){[void]$ownedIds.Add([int]$ownedCandidate.ProcessId);$foundOwned=$true}}}while($foundOwned)
 # Stop the wrapper first so it cannot create descendants while its tree is retired.
 Stop-Process -Id $ownedRootId -ErrorAction SilentlyContinue
 foreach($ownedId in $ownedIds){if($ownedId -ne $ownedRootId){Stop-Process -Id $ownedId -ErrorAction SilentlyContinue}}
}

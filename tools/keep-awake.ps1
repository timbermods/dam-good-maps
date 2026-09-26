# Holds a "system required" execution-state request (like a video player) so Windows doesn't sleep
# while the milestone session works. Changes no power settings; the request ends when this process ends.
Add-Type -Namespace DGM -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);'
$ES_CONTINUOUS = [uint32]'0x80000000'; $ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
$hours = 72; if ($args.Count -gt 0) { $hours = [double]$args[0] }; $until = (Get-Date).AddHours($hours)
while ((Get-Date) -lt $until) { [void][DGM.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED); Start-Sleep -Seconds 60 }
[void][DGM.Power]::SetThreadExecutionState($ES_CONTINUOUS)

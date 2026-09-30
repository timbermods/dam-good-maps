param([int]$RunnerPid, [string]$Output)
$ErrorActionPreference = 'Stop'
# A reversible job quota applies only to this runner's browser tree. No kill-on-close flag.
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class CpuJob {
 [StructLayout(LayoutKind.Sequential)] public struct Rate { public uint flags; public uint rate; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr CreateJobObject(IntPtr a,string n);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr j,int c,ref Rate r,uint n);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a,bool b,int p);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
$job = [CpuJob]::CreateJobObject([IntPtr]::Zero,$null)
$runner = Get-Process -Id $RunnerPid
$oldAffinity = $runner.ProcessorAffinity
$rate = New-Object CpuJob+Rate
$rate.flags = 5
# One logical CPU's aggregate capacity, across four allowed logical CPUs; native GPU/RAM.
$cores = (Get-CimInstance Win32_Processor).NumberOfLogicalProcessors
$rate.rate = [uint32][Math]::Floor(10000 / $cores)
try {
 if (![CpuJob]::SetInformationJobObject($job,15,[ref]$rate,8)) { throw "CPU quota failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
 # Assign the isolated runner before launch; browser subprocesses inherit the job and affinity.
 # Assigning already-sandboxed browser children fails their existing job restrictions.
 $browser = @(@{ProcessId=$RunnerPid})
 $assigned = @()
 foreach ($p in $browser) {
  $handle = [CpuJob]::OpenProcess(0x101,$false,$p.ProcessId)
  try {
   if (![CpuJob]::AssignProcessToJobObject($job,$handle)) { throw "Assign owned PID $($p.ProcessId) failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }
   (Get-Process -Id $p.ProcessId).ProcessorAffinity = [IntPtr]15
   $assigned += $p.ProcessId
  } finally { [CpuJob]::CloseHandle($handle) | Out-Null }
 }
 [IO.File]::WriteAllText($Output, (@{ready=$true; runnerPid=$RunnerPid; pids=$assigned; logicalCores=$cores; cpuRate=$rate.rate; affinityMask=15; description='Aggregate one-logical-CPU quota for isolated harness and inherited browser tree, four-core affinity; native GPU/RAM. CPU-constrained proxy, not physical laptop.'} | ConvertTo-Json -Depth 4))
 while ((Get-Process -Id $RunnerPid -ErrorAction SilentlyContinue) -and !(Test-Path -LiteralPath ($Output+'.stop'))) { Start-Sleep -Milliseconds 200 }
} catch {
 [IO.File]::WriteAllText($Output, (@{ready=$false; error=$_.Exception.Message} | ConvertTo-Json)); exit 1
} finally { if(Get-Process -Id $RunnerPid -ErrorAction SilentlyContinue) { (Get-Process -Id $RunnerPid).ProcessorAffinity=$oldAffinity }; [CpuJob]::CloseHandle($job) | Out-Null }

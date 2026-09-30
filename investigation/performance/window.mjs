import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './scenarios.mjs';
import { phaseAt } from './window-policy.mjs';
import { configurations, coreCases } from './coverage.mjs';
const dir = fileURLToPath(new URL('.', import.meta.url)), local = resolve(dir, 'local');
mkdirSync(local, { recursive: true });
const flags = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const budget = JSON.parse(readFileSync(resolve(dir,'budgets.json'))), suite = flags.suite ?? 'core';
const start = Date.parse(flags.start ?? '2026-09-30T09:00:00Z'), end = Date.parse(flags.end ?? '2026-09-30T11:00:00Z'), shortEnd = end - 70 * 60000;
if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || Date.now() >= end) throw new Error('Provide an authorized, unexpired --start=<UTC ISO> --end=<UTC ISO> window');
const statusPath = resolve(local, 'window-status.json');
if (existsSync(statusPath)) {
  const previous = JSON.parse(readFileSync(statusPath));
  if (previous.state !== 'finished') {
    try { process.kill(previous.pid, 0); throw new Error(`Window runner ${previous.pid} already active`); } catch(e) { if(e.code !== 'ESRCH') throw e; }
  }
}
const status = { pid: process.pid, suite, quietRule:budget.quiet, window: { start, end }, started: new Date().toISOString(), state: 'waiting', attempts: [], pending: [] };
const save = () => writeFileSync(statusPath, JSON.stringify(status, null, 2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
save();
async function cpu() {
  return new Promise((ok, fail) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Processor).LoadPercentage'], {windowsHide:true});
    let out=''; p.stdout.on('data',b=>out+=b); p.on('error',fail); p.on('exit',code=>code===0 && out.trim() ? ok(Number(out.trim())) : fail(new Error('CPU sample unavailable')));
  });
}
async function quiet(until) {
  let since, previous;
  status.state='waiting-for-60-quiet-seconds'; save();
  while(Date.now()<until) {
    const percent=await cpu(), now=Date.now();
    appendFileSync(resolve(local,'window-load.jsonl'), JSON.stringify({at:new Date(now).toISOString(),cpuPercent:percent})+'\n');
    if(previous !== undefined && now - previous > budget.quiet.maxSampleGapMs) since=undefined;
    if(now>=start && Number.isFinite(percent) && percent>=0 && percent<=budget.quiet.cpuPercentMax) since??=now; else since=undefined;
    previous=now;
    status.cpuPercent=percent; status.quietSince=since; save();
    if(since && now-since>=budget.quiet.durationMs) return true;
    await sleep(5000);
  }
  return false;
}
const queue=[];
const selected=suite==='core'?coreCases:cases;
const priority=['craterize-fast','brush-large','abuse',...selected.map(c=>c.id).filter(id=>!['craterize-fast','brush-large','abuse'].includes(id))];
for(const config of configurations(budget,suite)) for(const id of priority) queue.push({...config,mode:'measure',id});
for(const config of configurations(budget,suite)) for(const id of priority) queue.push({...config,mode:'capture',id,repeats:config.captureRepeats});
status.pending=queue; save();
async function run(task,phase,hour=false) {
  const args=['run.mjs',`--suite=${suite}`,`--mode=${task.mode}`,`--phase=${phase}`,`--cases=${task.id}`,`--sizes=${task.size}`,`--profiles=${task.profile}`,`--browsers=${task.browser}`,`--looks=${task.look}`,`--repeats=${hour?1:task.repeats}`,`--deadline=${end-15000}`,...(hour?['--hour']:[])];
  const previous=new Set(readdirSync(resolve(local,'runs')));
  status.state='running'; status.current={...task,phase,hour}; save();
  const code=await new Promise(ok=>{
    const child=spawn(process.execPath,args,{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',b=>{process.stdout.write(b);appendFileSync(resolve(local,'window-run.log'),b)});
    child.stderr.on('data',b=>{process.stderr.write(b);appendFileSync(resolve(local,'window-run.log'),b)});
    const deadline=setTimeout(()=>child.kill('SIGINT'),Math.max(1,end-Date.now()));
    child.on('exit',c=>{clearTimeout(deadline);ok(c)});
  });
  const folders=readdirSync(resolve(local,'runs')).filter(n=>!previous.has(n));
  const rows=folders.flatMap(n=>JSON.parse(readFileSync(resolve(local,'runs',n,'manifest.json'))).results);
  status.attempts.push({task,phase,hour,code,folders,qualified:rows.filter(r=>r.qualified&&r.status==='complete').length,discarded:rows.filter(r=>!r.qualified).length}); save();
  return rows.some(r=>['invalid-busy','blocked-busy'].includes(r.status))?'busy':code===0?'complete':'error';
}
try {
  while(queue.length && Date.now()<shortEnd) {
    if(!await quiet(shortEnd)) break;
    const task=queue.shift(); status.pending=queue; save();
    let failed=false;
    for(const phase of ['before','after']) {
      const outcome=await run(task,phase);
      if(outcome==='busy'){queue.unshift(task);failed=true;break}
      if(outcome==='error'){status.errors??=[];status.errors.push({task,phase});failed=true;break}
    }
    // The child independently qualifies 60 seconds before every case; this outer loop dispatches.
    if(!failed) {
      while(queue.length && Date.now()<shortEnd) {
        const task2=queue.shift();status.pending=queue;save();let outcome='complete';
        for(const phase of ['before','after']){outcome=await run(task2,phase);if(outcome!=='complete')break}
        if(outcome==='busy'){queue.unshift(task2);break}
        if(outcome==='error'){status.errors??=[];status.errors.push({task:task2});}
      }
    }
  }
  let hourAttempted = false;
  if(phaseAt(Date.now(),start,end,false,queue.length>0)==='hour' && await quiet(end-64*60000)) {
    hourAttempted = true;
    status.hourChoice='after/edge/native/256/high; remaining configurations and repetitions stay pending';save();
    let outcome=await run({mode:'measure',id:'brush-large',size:256,profile:'native',browser:'edge',look:'high'},'after',true);
    while(outcome==='busy' && phaseAt(Date.now(),start,end,true)==='hour' && await quiet(end-64*60000)) outcome=await run({mode:'measure',id:'brush-large',size:256,profile:'native',browser:'edge',look:'high'},'after',true);
  } else status.hourChoice='Insufficient quiet time for a full hour; not shortened';
  // Missing the full-hour start is not a reason to stop monitoring the rest of the window.
  // If an hour was started it remains the last workload; otherwise finish shorter paired work.
  while(!hourAttempted && queue.length && Date.now()<end) {
    if(!await quiet(end)) break;
    let busy=false;
    while(queue.length && Date.now()<end && !busy) {
      const task=queue.shift();status.pending=queue;save();
      for(const phase of ['before','after']) {
        const outcome=await run(task,phase);
        if(outcome==='busy'){queue.unshift(task);busy=true;break}
        if(outcome==='error'){status.errors??=[];status.errors.push({task,phase});break}
      }
    }
  }
} finally {status.state='finished';status.finished=new Date().toISOString();status.pending=queue;delete status.current;save();}

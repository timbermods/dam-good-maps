import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases } from './scenarios.mjs';
const dir = fileURLToPath(new URL('.', import.meta.url)), local = resolve(dir, 'local');
mkdirSync(local, { recursive: true });
const start = Date.parse('2026-09-30T09:00:00Z'), end = Date.parse('2026-09-30T11:00:00Z'), shortEnd = end - 70 * 60000;
const statusPath = resolve(local, 'window-status.json');
if (existsSync(statusPath)) {
  const previous = JSON.parse(readFileSync(statusPath));
  try { process.kill(previous.pid, 0); throw new Error(`Window runner ${previous.pid} already active`); } catch(e) { if(e.code !== 'ESRCH') throw e; }
}
const status = { pid: process.pid, window: { start, end }, started: new Date().toISOString(), state: 'waiting', attempts: [], pending: [] };
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
  let since;
  status.state='waiting-for-five-quiet-minutes'; save();
  while(Date.now()<until) {
    const percent=await cpu(), now=Date.now();
    appendFileSync(resolve(local,'window-load.jsonl'), JSON.stringify({at:new Date(now).toISOString(),cpuPercent:percent})+'\n');
    if(now>=start && percent<=15) since??=now; else since=undefined;
    status.cpuPercent=percent; status.quietSince=since; save();
    if(since && now-since>=300000) return true;
    await sleep(5000);
  }
  return false;
}
const queue=[];
// Round-robin breadth: both looks and browsers first, then CPU profiles and map sizes.
const priority=['craterize-fast','abuse',...cases.map(c=>c.id).filter(id=>!['craterize-fast','abuse'].includes(id))];
for(const size of [256,128]) for(const profile of ['native','laptop']) for(const browser of ['edge','firefox']) for(const look of ['standard','high']) for(const id of ['craterize-fast','abuse']) {
  queue.push({mode:'measure',id,size,profile,browser,look});
  if(size===256 && ['craterize-fast','abuse'].includes(id)) queue.push({mode:'capture',id,size,profile,browser,look});
}
for(const id of priority.filter(id=>!['craterize-fast','abuse'].includes(id))) for(const size of [256,128]) for(const profile of ['native','laptop']) for(const browser of ['edge','firefox']) for(const look of ['standard','high']) queue.push({mode:'measure',id,size,profile,browser,look});
status.pending=queue; save();
async function run(task,phase,hour=false) {
  const args=['run.mjs',`--mode=${task.mode}`,`--phase=${phase}`,`--cases=${task.id}`,`--sizes=${task.size}`,`--profiles=${task.profile}`,`--browsers=${task.browser}`,`--looks=${task.look}`,'--repeats=3',`--deadline=${end-15000}`,...(hour?['--hour']:[])];
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
    // A completed serial pair does not need another five-minute wait unless load rose.
    if(!failed) {
      while(queue.length && Date.now()<shortEnd) {
        const task2=queue.shift();status.pending=queue;save();let outcome='complete';
        for(const phase of ['before','after']){outcome=await run(task2,phase);if(outcome!=='complete')break}
        if(outcome==='busy'){queue.unshift(task2);break}
        if(outcome==='error'){status.errors??=[];status.errors.push({task:task2});}
      }
    }
  }
  if(Date.now()+65*60000<=end && await quiet(end-61*60000)) {
    status.hourChoice='after/edge/native/256/high; remaining configurations and repetitions stay pending';save();
    await run({mode:'measure',id:'brush-large',size:256,profile:'native',browser:'edge',look:'high'},'after',true);
  } else status.hourChoice='Insufficient quiet time for a full hour; not shortened';
} finally {status.state='finished';status.finished=new Date().toISOString();status.pending=queue;delete status.current;save();}

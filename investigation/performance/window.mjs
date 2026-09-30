import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cases} from './scenarios.mjs';
import {configurations,coreCases} from './coverage.mjs';
import {ContinuousLoad} from './continuous-load.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),local=resolve(dir,'local');
mkdirSync(local,{recursive:true});
const flags=Object.fromEntries(process.argv.slice(2).map(arg=>{const [k,...v]=arg.replace(/^--/,'').split('=');return [k,v.join('=')||true]}));
const budget=JSON.parse(readFileSync(resolve(dir,'budgets.json'))),suite=flags.suite??'core';
const start=Date.parse(flags.start),end=Date.parse(flags.end);
if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||Date.now()>=end)throw new Error('Explicit authorized, unexpired UTC window required');
const statusPath=resolve(local,'window-status.json');
if(existsSync(statusPath)){
 const old=JSON.parse(readFileSync(statusPath));
 if(old.state!=='finished'){let alive=false;try{process.kill(old.pid,0);alive=true}catch{}if(alive)throw new Error('Window runner already active: '+old.pid)}
}
const session=ContinuousLoad.start(dir,budget.quiet,{start,end:end-15000});
const status={pid:process.pid,suite,window:{start,end},started:new Date().toISOString(),state:'waiting',quietRule:budget.quiet,
 method:'qualify once; continuous sampling; requalify only after a load-discarded case',loadSession:session.path,attempts:[],pending:[],hourChoice:'single CPU-proxy/High hour first; retry between shorter cases while a full hour can fit'};
const save=()=>writeFileSync(statusPath,JSON.stringify(status,null,2));
const selected=suite==='core'?coreCases:cases;
const priority=['craterize-fast','brush-large','abuse',...selected.map(c=>c.id).filter(id=>!['craterize-fast','brush-large','abuse'].includes(id))];
const queue=[];
for(const id of priority)for(const config of configurations(budget,suite))for(const mode of ['capture','measure']){
 const repeats=mode==='capture'?config.captureRepeats:config.repeats;
 for(let repeat=1;repeat<=repeats;repeat++)for(const phase of ['before','after'])queue.push({...config,id,mode,repeat,repeats:1,phase});
}
const hourTask={...budget.longSession,id:'brush-large',mode:'measure',phase:'after',repeat:1,repeats:1,hour:true};
queue.unshift(hourTask);status.pending=queue;save();
async function run(task){
 const args=['run.mjs','--suite='+suite,'--mode='+task.mode,'--phase='+task.phase,'--cases='+task.id,'--sizes='+task.size,
 '--profiles='+task.profile,'--browsers='+task.browser,'--looks='+task.look,'--repeats=1','--repeat-start='+task.repeat,
 '--deadline='+(end-15000),'--load-session='+session.path,...(task.hour?['--hour']:[])];
 const previous=new Set(readdirSync(resolve(local,'runs')));
 status.state='running';status.current=task;status.qualificationGeneration=session.state().generation;save();
 const code=await new Promise((ok,fail)=>{
  const child=spawn(process.execPath,args,{cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{process.stdout.write(b);appendFileSync(resolve(local,'window-run.log'),b)});
  const deadline=setTimeout(()=>child.kill('SIGINT'),Math.max(1,end-Date.now()));
  child.on('error',fail);child.on('exit',c=>{clearTimeout(deadline);ok(c)});
 });
 const folders=readdirSync(resolve(local,'runs')).filter(n=>!previous.has(n));
 const rows=folders.flatMap(n=>{const p=resolve(local,'runs',n,'manifest.json');return existsSync(p)?JSON.parse(readFileSync(p)).results:[]});
 status.attempts.push({task,phase:task.phase,hour:!!task.hour,code,folders,qualified:rows.filter(r=>r.qualified&&r.status==='complete').length,discarded:rows.filter(r=>!r.qualified).length});save();
 return rows.some(r=>['invalid-busy','blocked-busy'].includes(r.status))?'busy':code===0&&rows.length?'complete':'error';
}
try{
 while(queue.length&&Date.now()<end-15000){
  const task=queue.shift();status.pending=queue;save();
  if(task.hour&&Date.now()>end-65*60000){status.hourOutcome='No full-hour slot remains; not shortened';status.missingHour=true;save();continue}
  if(!session.state().valid){
   status.state='qualifying-once-or-after-discard';save();
   if(!await session.qualify(task.hour?end-65*60000:end-15000)){
    if(task.hour){status.missingHour=true;continue}
    queue.unshift(task);break;
   }
  }
  const outcome=await run(task);
  if(task.hour)status.hourOutcome=outcome;
  if(outcome==='busy'){
   session.invalidate('discarded '+task.id+' '+task.phase);
   if(task.hour){if(Date.now()<end-65*60000)queue.splice(Math.min(12,queue.length),0,task);else status.missingHour=true}
   else queue.push(task);
  }else if(outcome==='error'){status.errors??=[];status.errors.push(task)}
 }
}finally{
 session.close();status.state='finished';status.finished=new Date().toISOString();status.pending=queue;delete status.current;save();
}

// Independent maps, fixed per-case arithmetic; parallelism only schedules cases.
import {readFileSync,writeFileSync,readdirSync,createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {freemem} from 'node:os';
import {loadSampler} from './load.mjs';
import {HERE,LOCAL,arg,hash,json} from './common.mjs';
import {makeJobs,orderJobs,eligible,LIMITS} from './plan-matrix.mjs';
import {SIZES,FORCES} from './acceptance.mjs';
const pilot=process.argv.includes('--pilot'),window=arg('window',''),from=arg('from',''),until=arg('until','');
const authorization=JSON.parse(readFileSync(resolve(HERE,'RUN-AUTHORIZATION.json')));
if(!pilot&&authorization.fullMatrix!==true)throw Error(authorization.reason);
const explicitTime=s=>/T.*(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
if(!pilot&&(!window||!explicitTime(from)||!explicitTime(until)))throw Error('Full matrix requires the user-named --window and explicit-offset --from/--until times');
const deadline=pilot?Infinity:Date.parse(until);
if(!pilot&&(Date.now()<Date.parse(from)||Date.now()>=deadline||Date.parse(from)>=deadline))throw Error('Outside the named window; no workload started');
const count=pilot?20:Number(arg('native-count','2000')),browserCount=pilot?5:Number(arg('browser-count','500')),chunk=Number(arg('chunk',pilot?'20':'25')),parallel=Number(arg('parallel',pilot?'1':'8'));
if(pilot&&parallel!==1)throw Error('The 1% pilot uses one worker');
if(!pilot&&(count!==2000||browserCount!==500))throw Error('D437 requires exactly 2,000 native/Node and 500 per browser at 256²');
if(![count,browserCount,chunk,parallel].every(n=>Number.isInteger(n)&&n>0)||parallel>8)throw Error('Positive counts; at most eight shards');
const limits={...LIMITS,workers:parallel};
const build=JSON.parse(readFileSync(resolve(LOCAL,'build.json'))),bytes=names=>Buffer.concat(names.map(n=>readFileSync(resolve(LOCAL,n))));
const {portableSha256,guardSha256}=await import('./shared-math.mjs');
if(build.portableSha256!==portableSha256||build.guardSha256!==guardSha256||build.inputs['src/lib.rs']!==hash(readFileSync(resolve(HERE,'src/lib.rs')))||build.inputs['.cargo/config.toml']!==hash(readFileSync(resolve(HERE,'.cargo/config.toml'))))throw Error('Arithmetic source/guard changed: rebuild and verify before any corpus');
const fingerprint=hash(bytes(['forces.wasm','api.cjs','api.js','worker.js','target/release/forces-batch.exe'])),nativeFingerprint=hash(bytes(['forces.wasm','api.cjs','target/release/forces-batch.exe'])),browserFingerprint=hash(bytes(['forces.wasm','worker.js']));
const costs=JSON.parse(readFileSync(resolve(HERE,'pilot-shard-costs.json')));
if(!pilot&&(costs.fingerprint!==fingerprint||JSON.stringify(costs.sizes)!==JSON.stringify(SIZES)))throw Error('Plan cost basis is not this executable/bundle/scope; re-plan before workload');
const rates=Object.fromEntries(costs.rows.map(r=>[`${r.target}/${r.verb}/${r.size}`,r.secondsPerCase])),cached=new Map();
for(const file of (process.argv.includes('--fresh')?[]:readdirSync(LOCAL)).filter(n=>/^(checks|browser)-matrix-.*\.jsonl$/.test(n))){
 const lines=readFileSync(resolve(LOCAL,file),'utf8').split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  if(!lines[i])continue;let row;try{row=JSON.parse(lines[i]);}catch(error){if(lines.slice(i+1).every(l=>!l))break;throw error;}
  const native=file.startsWith('checks-'),target=native?'native':row.engine;
  if(row.fingerprint!==(native?nativeFingerprint:browserFingerprint)||!native&&row.ok!==true)continue;
  const [verb,size,k,kind]=native?[row.verb,row.size,row.k,row.random?'random':'fixture']:row.id.split('/');
  if(kind!=='random'||!FORCES.includes(verb)||!SIZES.includes(+size)||!Number.isInteger(+k)||+k<0||!/[a-f0-9]{64}/.test(row.sha256)||verb!=='footprint'&&!row.error&&!/[a-f0-9]{64}/.test(row.exportSha256))continue;
  const key=[target,verb,+size,+k].join('/'),old=cached.get(key);
  if(old&&(old.sha256!==row.sha256||old.exportSha256!==row.exportSha256))throw Error('Conflicting current-build checkpoint '+key);cached.set(key,row);
 }
}
const jobs=makeJobs(count,browserCount,chunk,rates),pending=[],shards=[],active=new Map();let completed=0,failed=null,paused=false,stopPromise=null;
for(const job of jobs){job.prefix=[];for(let k=job.start;k<job.start+job.count;k++){const r=cached.get([job.target,job.verb,job.size,k].join('/'));if(!r)break;job.prefix.push(r);}job.estimatedSeconds*=1-job.prefix.length/job.count;pending.push(job);}
if(!pilot)orderJobs(pending);
console.log('Reusable current-build cases:',cached.size,'shards:',jobs.length,'limits:',limits);
const sampler=loadSampler(),started=Date.now();
const saveProgress=()=>json('matrix-progress.json',{fingerprint,pilot,window:pilot?null:{name:window,from,until},limits,completed,total:jobs.length,active:[...active.values()].map(j=>j.name),pending:pending.length,failed,paused,elapsedSeconds:(Date.now()-started)/1000,availableGiB:freemem()/2**30,load:sampler.summary()});
const stopActive=()=>stopPromise??=(async()=>{
 const ids=[...active.keys()];if(!ids.length)return;
 if(process.platform==='win32')await new Promise((done,reject)=>{const ps=spawn('pwsh',['-NoProfile','-File',resolve(HERE,'stop-shards.ps1'),'-RootIds',ids.join(','),'-Scope',HERE],{windowsHide:true,stdio:['ignore','pipe','pipe']});let error='';ps.stderr.on('data',b=>error+=b);ps.on('error',reject);ps.on('exit',code=>code===0?done():reject(Error('Owned shard stop failed: '+error)));});
 else for(const pid of ids){try{process.kill(-pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}}
})();
const stopAtDeadline=()=>{if(Date.now()<deadline||paused||failed)return;paused=true;saveProgress();void stopActive().catch(e=>{failed={error:String(e)};});};
const deadlineTimer=pilot?null:setInterval(stopAtDeadline,1000);
const sleep=()=>new Promise(r=>setTimeout(r,250));
function takeJob(){stopAtDeadline();if(failed||paused||!pending.length)return null;
 if(!pilot&&freemem()<limits.memoryReserveGiB*2**30)return null;
 const index=pending.findIndex(j=>eligible(j,[...active.values()],limits));return index<0?null:pending.splice(index,1)[0];
}
async function execute(job){
 const shardStarted=Date.now();
 const file=resolve(LOCAL,job.file),outputRows=rows=>job.target==='native'?rows:{rows,build,fingerprint};
 if(job.prefix.length===job.count){json(job.file,outputRows(job.prefix));json(job.manifest,{fingerprint,build});shards.push({...job,prefix:undefined,elapsedSeconds:(Date.now()-shardStarted)/1000,sha256:hash(readFileSync(file))});completed++;saveProgress();return;}
 const args=[resolve(HERE,job.target==='native'?'check.mjs':'browser.mjs'),'--verbs',job.verb,'--sizes',String(job.size),'--start',String(job.start+job.prefix.length),'--count',String(job.count-job.prefix.length),'--random','--exports','--name',job.name,...(job.target==='native'?['--server']:['--engines',job.target])];
 const logPath=resolve(LOCAL,job.name+'.log'),log=createWriteStream(logPath,{flags:'w'});
 writeFileSync(resolve(LOCAL,(job.target==='native'?'checks-':'browser-')+job.name+'.jsonl'),job.prefix.map(r=>JSON.stringify(r)+'\n').join(''));
 let child;const code=await new Promise((done,reject)=>{child=spawn(process.execPath,args,{cwd:HERE,env:{...process.env,UV_THREADPOOL_SIZE:'1'},detached:process.platform!=='win32',windowsHide:true,stdio:['ignore','pipe','pipe']});active.set(child.pid,job);child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('error',reject);child.on('exit',c=>{active.delete(child.pid);done(c);});});
 await new Promise(r=>log.end(r));if(paused||failed)return;
 if(code!==0){failed={...job,prefix:undefined,code,log:logPath};saveProgress();console.error('IDENTITY FAILED',job.name,readFileSync(logPath,'utf8').slice(-3000));await stopActive();return;}
 const data=JSON.parse(readFileSync(file)),fresh=job.target==='native'?data:data.rows,rows=[...job.prefix,...fresh];
 if(rows.length!==job.count||rows.some((r,i)=>(job.target==='native'?r.k:+r.id.split('/')[2])!==job.start+i))throw Error('Incomplete/unordered successful shard '+job.name);
 json(job.file,outputRows(rows));json(job.manifest,{fingerprint,build});shards.push({...job,prefix:undefined,elapsedSeconds:(Date.now()-shardStarted)/1000,sha256:hash(readFileSync(file))});completed++;
 console.log(`Identity shards ${completed}/${jobs.length}: ${job.name} PASS (${job.prefix.length} resumed)`);saveProgress();
}
async function worker(){while(!failed&&!paused&&(pending.length||active.size)){const job=takeJob();if(!job){await sleep();continue;}try{await execute(job);}catch(e){if(!failed&&!paused){failed={job:job.name,error:String(e)};saveProgress();await stopActive();}}}}
try{await sampler.observe();await Promise.all(Array.from({length:parallel},worker));}finally{if(deadlineTimer)clearInterval(deadlineTimer);if(stopPromise)await stopPromise;sampler.stop();json(pilot?'pilot-machine.json':'matrix-machine.json',{pilot,window:pilot?null:{name:window,from,until},elapsedSeconds:(Date.now()-started)/1000,projectedFullSeconds:pilot?(Date.now()-started)*.1:null,load:sampler.summary(),limits,completed,total:jobs.length,failed,paused});}
if(failed){json('matrix-failure.json',failed);throw Error('Stopped all owned shards after failure');}
if(paused){saveProgress();console.log('Named window ended; all owned shards stopped. Checkpoints retained; acceptance remains red.');process.exitCode=2;}
else{
 const checks=[],browsers=[];for(const job of jobs){const data=JSON.parse(readFileSync(resolve(LOCAL,job.file)));(job.target==='native'?checks:browsers).push(...(job.target==='native'?data:data.rows));}
 json('checks-random-final.json',checks);json('browser-random-final.json',{rows:browsers,build,fingerprint});
 json('identity-matrix.json',{status:'pass',pilot,window:pilot?null:{name:window,from,until},fingerprint,nativeFingerprint,browserFingerprint,build,count,browserCount,sizes:SIZES,chunk,parallel,limits,cases:checks.length,browserComparisons:browsers.length,shards});
 console.log('Complete identity/export matrix:',checks.length,'native/Node-Wasm and',browsers.length,'browser cases');
}

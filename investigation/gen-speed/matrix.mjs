// One generation worker; the parent samples total machine load while synchronous work runs.
import {Worker} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {cpus,totalmem,freemem,platform,release} from 'node:os';
import {readFileSync,existsSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build,dir} from './build.mjs';
import {deepStrictEqual} from 'node:assert';
const arg=(n,d)=>process.argv.includes('--'+n)?process.argv[process.argv.indexOf('--'+n)+1]:d;
const prefix=arg('prefix','matrix'),sizes=arg('sizes','256,128,96').split(',').map(Number),themes=arg('themes','any,riverValley,canyon,highlands,lakeBasin,delta,islands').split(',');
const maxSeed=Number(arg('seeds','40')),reps=Number(arg('reps','3')),timedSeeds=Number(arg('timed-seeds','20')),smallTimedSeeds=Number(arg('small-timed-seeds','5')),workers=Number(arg('workers','1'));
for(const v of ['before','after'])await build(v,true);
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const manifest={node:process.version,platform:platform(),release:release(),cpus:cpus().map(c=>c.model),memory:totalmem(),workers,cpuSource:'process.threadCpuUsage',loadSource:platform()==='win32'?'Windows PDH Processor(_Total) % Processor Time':'os.cpus deltas',bundle:Object.fromEntries(['before','after'].map(v=>[v,sha(resolve(dir,`local/${v}-profile.mjs`))])),sizes,themes,maxSeed,reps,timedSeeds,smallTimedSeeds};
const out=resolve(dir,`local/${prefix}.jsonl`),meta=resolve(dir,`local/${prefix}-manifest.json`);
if(existsSync(meta))deepStrictEqual(JSON.parse(readFileSync(meta)),manifest,'refuse stale resume');else writeFileSync(meta,JSON.stringify(manifest,null,2));
const rows=existsSync(out)?readFileSync(out,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const key=r=>`${r.theme}/${r.size}/${r.seed}/${r.rep}/${r.variant}`;
const seen=new Map(rows.map(r=>[key(r),r]));
if(process.argv.includes('--redo-unsampled'))for(const row of rows.filter(r=>r.load.samples===0))for(const variant of ['before','after'])seen.delete(key({...row,variant}));
const pool=Array.from({length:workers},()=>new Worker(new URL('./run-worker.mjs',import.meta.url)));
let previous=cpus(),samples=[];
function sample(){const cur=cpus();let idle=0,total=0;for(let i=0;i<cur.length;i++){for(const k in cur[i].times)total+=cur[i].times[k]-previous[i].times[k];idle+=cur[i].times.idle-previous[i].times.idle;}previous=cur;if(total>0)samples.push(100*(1-idle/total));}
let timer=null,sampler=null,partial='',loadReady=null;
if(platform()==='win32'){
  let ready;loadReady=new Promise(r=>ready=r);
  sampler=spawn(process.env.DGM_PWSH??'pwsh',['-NoProfile','-File',resolve(dir,'load.ps1')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  sampler.stdout.on('data',b=>{partial+=b;const lines=partial.split(/\r?\n/);partial=lines.pop();for(const line of lines){const n=Number(line);if(line&&Number.isFinite(n)){samples.push(n);ready();}}});
  sampler.stderr.on('data',b=>console.error('load sampler:',String(b)));
}else timer=setInterval(sample,500);
const send=(worker,job)=>new Promise((res,rej)=>{const err=e=>rej(e);worker.once('message',m=>{worker.off('error',err);m.ok?res(m.row):rej(Error(m.error));});worker.once('error',err);worker.postMessage(job);});
let completed=rows.length;
try{
  if(loadReady)await new Promise((res,rej)=>{const timeout=setTimeout(()=>rej(Error('Windows load counter did not become ready')),55000);loadReady.then(()=>{clearTimeout(timeout);res();});});
  const jobs=[];
  for(const size of sizes)for(let seed=1;seed<=maxSeed;seed++)for(let rep=0;rep<(seed<=(size===256?timedSeeds:smallTimedSeeds)?reps:1);rep++)for(let ti=0;ti<themes.length;ti++)jobs.push({size,seed,rep,theme:themes[(ti+seed-1)%themes.length]});
  let next=0;
  await Promise.all(pool.map(async worker=>{
   for(let j; (j=jobs[next++]);){
    const {theme,size,seed,rep}=j,order=(seed+rep)%2?['before','after']:['after','before'];
    // A partial pair must be rerun together for an in-memory raw-byte comparison.
    const have=order.map(variant=>seen.has(key({...j,variant})));
    if(have.some(Boolean)&&!have.every(Boolean))for(const variant of order)seen.delete(key({...j,variant}));
    for(const variant of order){const job={theme,size,seed,variant,rep};if(seen.has(key(job)))continue;
      if(!sampler)sample();const sampleStart=samples.length;const free0=freemem(),t=Date.now();const row=await send(worker,job);if(!sampler)sample();const loadSamples=samples.slice(sampleStart);row.startedUTC=new Date(t).toISOString();row.load={mean:loadSamples.length?loadSamples.reduce((a,b)=>a+b,0)/loadSamples.length:null,max:loadSamples.length?Math.max(...loadSamples):null,samples:loadSamples.length,freeMemoryBytes:free0};
      seen.set(key(row),row);appendFileSync(out,JSON.stringify(row)+'\n');completed++;
      console.log(completed,key(row),row.timings,'load',row.load.mean?.toFixed(1),row.load.max?.toFixed(1));
      const other=seen.get(key({...row,variant:variant==='before'?'after':'before'}));
      if(other)deepStrictEqual(row.identity,other.identity,`BYTE MISMATCH ${theme}/${size}/${seed}/${rep}`);
    }
   }
  }));
}finally{if(timer)clearInterval(timer);if(sampler)sampler.kill();await Promise.all(pool.map(w=>w.terminate()));}
console.log('All pairs match.');

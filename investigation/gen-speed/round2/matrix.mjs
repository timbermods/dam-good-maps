import {Worker} from 'node:worker_threads';import {spawn} from 'node:child_process';
import {cpus,totalmem,freemem,platform,release} from 'node:os';
import {readFileSync,existsSync,writeFileSync,appendFileSync} from 'node:fs';import {resolve} from 'node:path';import {createHash} from 'node:crypto';
import {build,dir} from '../build.mjs';import {deepStrictEqual} from 'node:assert';
const arg=(n,d)=>process.argv.includes('--'+n)?process.argv[process.argv.indexOf('--'+n)+1]:d;
const reuseControl=arg('reuse-control',null);
const prefix=arg('prefix','round2'),sizes=arg('sizes','96,128,256').split(',').map(Number),themes=arg('themes','any,riverValley,canyon,highlands,lakeBasin,delta,islands').split(','),variants=arg('variants','after,round2').split(',');
const seeds=arg('seeds','1-40').split(',').flatMap(s=>s.includes('-')?Array.from({length:Number(s.split('-')[1])-Number(s.split('-')[0])+1},(_,i)=>i+Number(s.split('-')[0])):[Number(s)]),reps=Number(arg('reps','1')),workers=Number(arg('workers','4'));
for(const v of variants)await build(v,true);
const sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const manifest={node:process.version,platform:platform(),release:release(),cpus:cpus().map(c=>c.model),memory:totalmem(),workers,bundle:Object.fromEntries(variants.map(v=>[v,sha(resolve(dir,`local/${v}-profile.mjs`))])),sizes,themes,seeds,reps,variants};
if(reuseControl){
 const previousManifest=JSON.parse(readFileSync(resolve(dir,'local/'+reuseControl+'-manifest.json')));
 deepStrictEqual(previousManifest.bundle.after,manifest.bundle.after,'control source changed');
 deepStrictEqual(previousManifest.node,manifest.node);deepStrictEqual(previousManifest.sizes,sizes);deepStrictEqual(previousManifest.themes,themes);deepStrictEqual(previousManifest.seeds,seeds);deepStrictEqual(previousManifest.reps,reps);
 manifest.reusedControl={prefix:reuseControl,rawSha256:sha(resolve(dir,'local/'+reuseControl+'.jsonl')),manifestSha256:sha(resolve(dir,'local/'+reuseControl+'-manifest.json')),bundle:previousManifest.bundle.after};
}
const out=resolve(dir,`local/${prefix}.jsonl`),meta=resolve(dir,`local/${prefix}-manifest.json`);
if(existsSync(meta))deepStrictEqual(JSON.parse(readFileSync(meta)),manifest,'stale resume');else writeFileSync(meta,JSON.stringify(manifest,null,2));
if(reuseControl&&!existsSync(out)){
 const prior=readFileSync(resolve(dir,'local/'+reuseControl+'.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(r=>r.variant==='after');
 writeFileSync(out,prior.map(r=>JSON.stringify({...r,reusedControlFrom:reuseControl})).join('\n')+'\n');
 console.log('Reused',prior.length,'unchanged baseline observations; remaining baselines and all candidates run here.');
}
const rows=existsSync(out)?readFileSync(out,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[],key=r=>`${r.theme}/${r.size}/${r.seed}/${r.rep}/${r.variant}`,seen=new Map(rows.map(r=>[key(r),r]));
const pool=Array.from({length:workers},()=>new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{variants}}));
let sampler,samples=[],partial='',ready;
const loadReady=new Promise(r=>ready=r);
sampler=spawn(process.env.DGM_PWSH??'pwsh',['-NoProfile','-File',resolve(dir,'load.ps1')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
sampler.stdout.on('data',b=>{partial+=b;const lines=partial.split(/\r?\n/);partial=lines.pop();for(const l of lines){const n=Number(l);if(l&&Number.isFinite(n)){samples.push(n);ready();}}});sampler.stderr.on('data',b=>console.error(String(b)));
const send=(w,job)=>new Promise((res,rej)=>{const onError=e=>rej(e);w.once('message',m=>{w.off('error',onError);m.ok?res(m.row):rej(Error(m.error));});w.once('error',onError);w.postMessage(job);});
let completed=rows.length;
try{
 await new Promise((res,rej)=>{const t=setTimeout(()=>rej(Error('load sampler unavailable')),55000);loadReady.then(()=>{clearTimeout(t);res();});});
 const jobs=[];for(const size of sizes)for(const seed of seeds)for(let rep=0;rep<reps;rep++)for(let i=0;i<themes.length;i++)jobs.push({size,seed,rep,theme:themes[(i+seed-1)%themes.length]});let next=0;
 await Promise.all(pool.map(async w=>{for(let j;(j=jobs[next++]);){for(const variant of (j.seed+j.rep)%2?variants:[...variants].reverse()){
 const job={...j,variant};if(seen.has(key(job)))continue;const index=samples.length,start=Date.now(),free=freemem();const row=await send(w,job),ls=samples.slice(index);
 row.startedUTC=new Date(start).toISOString();row.load={mean:ls.length?ls.reduce((a,b)=>a+b,0)/ls.length:null,max:ls.length?Math.max(...ls):null,samples:ls.length,freeMemoryBytes:free};
 appendFileSync(out,JSON.stringify(row)+'\n');seen.set(key(row),row);console.log(++completed,key(row),row.timings,'met',row.outcomes?.met,'pass',row.passed,'changed',row.changed);
 // Repetitions may finish out of order in separate workers. Compare against every
 // already completed repetition; the final summary also requires all three.
 for(const other of seen.values())if(other!==row&&other.theme===row.theme&&other.size===row.size&&other.seed===row.seed&&other.variant===row.variant)deepStrictEqual(row.identity,other.identity,'non-deterministic repeat');
 }}}));
}finally{sampler.kill();await Promise.all(pool.map(w=>w.terminate()));}
console.log('Complete',completed);

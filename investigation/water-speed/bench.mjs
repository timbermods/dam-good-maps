import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import os from 'node:os';
import {api,LOCAL,json,hash,arg,sameWater,sameSim} from './common.mjs';
import {listCases,storedInput,inputHash} from './cases.mjs';
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const buildId=hash(readFileSync(resolve(LOCAL,'baseline.cjs'))+readFileSync(resolve(LOCAL,'fast.cjs')));
const a=api(),b=api('fast');
function timed(fn) {
  const cpu=process.threadCpuUsage(),wall=performance.now(),value=fn();
  const dt=performance.now()-wall,used=process.threadCpuUsage(cpu);
  return {value,wallMs:dt,cpuMs:(used.user+used.system)/1000};
}
function edit(m,water) {
  const next=structuredClone(m),W=m.W,H=m.H;
  let center=Math.floor(H/2)*W+Math.floor(W/2);
  for(let i=0;i<W*H;i++){const x=i%W,y=Math.floor(i/W);if(x>=3&&y>=3&&x<W-3&&y<H-3&&water.depth[i]>.3){center=i;break;}}
  const x=center%W,y=Math.floor(center/W);
  for(let yy=Math.max(0,y-2);yy<=Math.min(H-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(W-1,x+2);xx++)next.floor[yy*W+xx]=Math.max(0,next.floor[yy*W+xx]-2);
  return next;
}
function hazard(impl,m,water,name) {
  const sim=new impl.WaterSim(m,{depth:water.depth,contamination:water.contamination});
  const clean=m.emitters.filter(e=>e.contamination===0),days=impl.hazardDays('normal',name),total=days*impl.TICKS_PER_DAY;
  for(let t=0;t<total;) {
    const gap=t<impl.TICKS_PER_DAY?12:96;
    if(name==='badtide')for(const e of clean)e.contamination=impl.badtideContamination(t/impl.TICKS_PER_DAY,days);
    sim.run(gap,name==='drought'?0:1);t+=gap;
  }
  return sim;
}
function one(c,reps,stages) {
  const data=storedInput(c);if(!data)throw Error('Missing verified input '+c.id);
  const m=data.model,water=data.water,next=edit(m,water),rows=[];
  for(const stage of stages) {
    const invoke=(impl,model)=>stage==='canonical'?impl.canonicalSettle(model,{rules:c.rules}):stage==='live'?impl.previewSettle({model:m,water},model):hazard(impl,model,water,stage);
    // Identical per-case warmup; clone time, checks and I/O are outside the timed call.
    for(const impl of [a,b])invoke(impl,structuredClone(stage==='live'?next:m));
    const samples=[];
    for(let k=0;k<reps;k++) {
      const pair={};
      for(const [name,impl] of (k%2?[['fast',b],['baseline',a]]:[['baseline',a],['fast',b]])) {
        const model=structuredClone(stage==='live'?next:m);
        pair[name]=timed(()=>invoke(impl,model));
      }
      if(stage==='canonical'||stage==='live')sameWater(pair.baseline.value,pair.fast.value,c.id+' '+stage);
      else sameSim(pair.baseline.value,pair.fast.value,c.id+' '+stage);
      samples.push({baseline:{cpuMs:pair.baseline.cpuMs,wallMs:pair.baseline.wallMs},fast:{cpuMs:pair.fast.cpuMs,wallMs:pair.fast.wallMs},cpuRatio:pair.baseline.cpuMs/pair.fast.cpuMs,wallRatio:pair.baseline.wallMs/pair.fast.wallMs});
    }
    rows.push({stage,samples,baselineCpuMs:median(samples.map(x=>x.baseline.cpuMs)),fastCpuMs:median(samples.map(x=>x.fast.cpuMs)),baselineWallMs:median(samples.map(x=>x.baseline.wallMs)),fastWallMs:median(samples.map(x=>x.fast.wallMs)),cpuRatio:median(samples.map(x=>x.cpuRatio)),wallRatio:median(samples.map(x=>x.wallRatio))});
  }
  return {id:c.id,buildId,inputHash:inputHash(m),rows,reps,status:'pass'};
}
if(!isMainThread) {
  parentPort.on('message',c=>{try{parentPort.postMessage({row:one(c,workerData.reps,workerData.stages)});}catch(e){parentPort.postMessage({error:e.stack});}});
} else {
  const all=process.argv.includes('--all'),reps=Number(arg('reps',all?'1':'5'));
  const follow=process.argv.includes('--follow-proof');
  const stages=arg('stages',all?'canonical':'canonical,live,drought,badtide').split(',');
  const ids=arg('ids','').split(',').filter(Boolean);
  const pinned=process.argv.includes('--pinned');
  const source=pinned?JSON.parse(readFileSync(resolve(LOCAL,'proof-pinned.json'),'utf8')).cases.map(c=>({...c,rules:c.kind==='official'?'port':undefined})):listCases();
  const selected=source.filter(c=>ids.length?ids.includes(c.id):pinned||all||c.kind==='generated'&&c.seed===1);
  const cases=follow?selected:selected.filter(c=>existsSync(resolve(LOCAL,'cases',c.id+'.bin')));
  if(cases.length!==selected.length&&!process.argv.includes('--available'))throw Error(`Only ${cases.length}/${selected.length} inputs ready; finish verify.mjs first or use --available`);
  const workers=Number(arg('workers','1')),prefix=arg('prefix',all?'timing-all':'timing-selected'),pending=[],rows=[];
  for(const c of cases){const p=resolve(LOCAL,prefix,c.id+'.json');if(existsSync(p)&&!process.argv.includes('--fresh')){const old=JSON.parse(readFileSync(p,'utf8'));if(old.buildId===buildId&&old.reps===reps&&JSON.stringify(old.rows.map(x=>x.stage))===JSON.stringify(stages)){rows.push(old);continue;}}pending.push(c);}
  console.log(`timing ${rows.length}/${cases.length} cached; ${pending.length} pending; ${workers} workers; ${reps} pairs`);
  await Promise.all(Array.from({length:Math.min(workers,pending.length)},()=>new Promise((done,fail)=>{
    const w=new Worker(new URL(import.meta.url),{workerData:{reps,stages}});
    const next=()=>{
      if(!pending.length){w.terminate().then(done);return;}
      const index=pending.findIndex(c=>existsSync(resolve(LOCAL,'cases',c.id+'.bin')));
      if(index<0){setTimeout(next,5000);return;}
      w.postMessage(pending.splice(index,1)[0]);
    };
    w.on('error',fail);w.on('message',msg=>{if(msg.error){w.terminate();fail(Error(msg.error));return;}const row=msg.row;json(resolve(LOCAL,prefix,row.id+'.json'),row);rows.push(row);console.log('TIMED',rows.length+'/'+cases.length,row.id,row.rows.map(x=>x.stage+': '+x.cpuRatio.toFixed(2)+'x').join(', '));next();});next();
  })));
  json(resolve(LOCAL,prefix+'.json'),{buildId,workers,reps,stages,hardware:{cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem(),platform:process.platform,node:process.version},rows});
}

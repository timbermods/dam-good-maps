import {installParallelWater} from './runtime';
import {SettleRun, sealedTiles, WaterSim as FastSim} from './water';
import {WaterSim as Reference, SettleRun as ReferenceRun} from '../../src/core/sim/water';
import {prefill} from '../../src/core/sim/prefill';
import {warmStart, PREVIEW_CHECK,PREVIEW_TOL,PREVIEW_MOVED,PREVIEW_DAYS} from '../../src/core/sim/preview';
import {badtideContamination} from '../../src/core/sim/weather';
import {expDet} from '../../src/core/math/detmath';
const bytes=(a:ArrayBufferView)=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
function same(a:any,b:any,label:string) {
  for(const key of ['D','Dold','C','out','seepOn']) {
    const x=bytes(a[key]), y=bytes(b[key]);
    if(x.length!==y.length)throw Error(label+' '+key+' length differs');
    for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error(label+' '+key+' bytes differ at '+i);
  }
  const x=a.saturation(),y=b.saturation();
  if(x.some((v:number,i:number)=>v!==y[i]) || a.ticks!==b.ticks || !Object.is(a.volume(),b.volume())) throw Error(label+' saturation/ticks/volume differ');
}
async function digest(sim:any) {
  const arrays=[sim.D,sim.Dold,sim.C,sim.out,sim.saturation(),sim.seepOn];
  const all=new Uint8Array(arrays.reduce((s,a)=>s+a.byteLength,0));let at=0;
  for(const a of arrays){all.set(bytes(a),at);at+=a.byteLength;}
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',all))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
const portableCurve=(t:number,days:number)=>{const s=(v:number)=>{const x=17*(v-.5);return 1/(expDet(x)+expDet(-x))+.5;};return t<.5?s(t):days-t<.5?s(days-t):1;};
let persistentPool:any=null;
async function parallelSim(model:any,initial:any,options:any,threads:number,workerURL:URL,persistent=false,forceParallel=false) {
  const pool=persistent?(persistentPool??=await installParallelWater(threads,workerURL,30000,512*512,forceParallel?0:1024)):await installParallelWater(threads,workerURL,30000,model.W*model.H,forceParallel?0:1024);
  return {...pool,sim:new FastSim(model,initial,options)};
}
onmessage=async ({data})=>{
  if(data.close){persistentPool?.close();persistentPool=null;postMessage({closed:true});return;}
  const pools:any[]=[];
  try {
    const {model:m,threads,initial,rules='game',weather=false,live=false,portable=false,tickLimit,verify=true,benchmark=false,parallelOnly=false,everyTick=false}=data;
    const opts={rules}, init=initial ?? prefill(m);
    const baseline=new Reference(structuredClone(m),structuredClone(init),opts as any);
    const fast=benchmark?new FastSim(structuredClone(m),structuredClone(init),opts as any):null;
    if(fast){fast.executor=null;fast.runScope=null;}
    const fastRun=fast?new SettleRun(fast,{sealed:sealedTiles(m)}):null;
    const t0=performance.now();
    const pool=await parallelSim(structuredClone(m),structuredClone(init),opts as any,threads,new URL('./helper.js',location.href),data.persistent,data.forceParallel);pools.push(pool);
    const beforeStats={...pool.stats};
    const startupMs=performance.now()-t0, sim=pool.sim;
    const scalar=new ReferenceRun(baseline,{sealed:sealedTiles(m)}),run=new SettleRun(sim,{sealed:sealedTiles(m)});
    let checks=0,scalarMs=0,parallelMs=0,fastMs=0;
    if(tickLimit) {
      if(everyTick) {
        for(let t=0;t<tickLimit;t++){baseline.run(1);sim.run(1);same(baseline,sim,'tick '+t);checks++;}
      }else{
      const t=performance.now();baseline.run(tickLimit);scalarMs+=performance.now()-t;
      const p=performance.now();sim.run(tickLimit);parallelMs+=performance.now()-p;
      if(verify)same(baseline,sim,'fixed ticks');checks++;
      }
    } else if(parallelOnly) {
      do{const p=performance.now();run.advance(128);parallelMs+=performance.now()-p;checks++;}while(!run.done);
    } else {
      do {
        const t=performance.now();const a=scalar.advance(128);scalarMs+=performance.now()-t;
        if(fastRun&&data.rep%2){const f=performance.now();fastRun.advance(128);fastMs+=performance.now()-f;}
        const p=performance.now();const b=run.advance(128);parallelMs+=performance.now()-p;
        if(fastRun&&!(data.rep%2)){const f=performance.now();fastRun.advance(128);fastMs+=performance.now()-f;}
        if(verify){if(JSON.stringify(a)!==JSON.stringify(b))throw Error('stop result differs');same(baseline,sim,'canonical');}checks++;
      }while(!scalar.done);
    }
    const canonicalDigest=await digest(sim), rows:any[]=[];
    if(live) {
      const next=structuredClone(m),c=Math.floor(m.H/2)*m.W+Math.floor(m.W/2);
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)next.floor[c+dy*m.W+dx]=Math.max(0,next.floor[c+dy*m.W+dx]-2);
      const water={...scalar.done,depth:baseline.D.slice(),contamination:baseline.C.slice(),sat:baseline.saturation(),out:baseline.out.slice()};
      const warm=warmStart({model:m,water} as any,next);
      const a=new Reference(structuredClone(next),structuredClone(warm.state),opts as any);
      const p=await parallelSim(structuredClone(next),structuredClone(warm.state),opts as any,threads,new URL('./helper.js',location.href));pools.push(p);
      if(warm.out){a.out.set(warm.out);p.sim.out.set(warm.out);}
      const config={sealed:sealedTiles(next),checkEvery:PREVIEW_CHECK,tol:PREVIEW_TOL,movedShare:PREVIEW_MOVED,maxDays:1,untilSteady:true};
      const ra=new ReferenceRun(a,config),rb=new SettleRun(p.sim,config);
      do {const x=ra.advance(17),y=rb.advance(17);if(JSON.stringify(x)!==JSON.stringify(y))throw Error('live stop differs');same(a,p.sim,'live');checks++;}while(!ra.done);
      rows.push({stage:'live',hash:await digest(p.sim),ticks:p.sim.ticks});p.close();
    }
    if(weather)for(const hazard of ['drought','badtide']) {
      const ma=structuredClone(m),mb=structuredClone(m),state={depth:baseline.D.slice(),contamination:baseline.C.slice()};
      const a=new Reference(ma,structuredClone(state),opts as any);
      const p=await parallelSim(mb,structuredClone(state),opts as any,threads,new URL('./helper.js',location.href));pools.push(p);
      const days=hazard==='drought'?9:8;
      const clean=[ma,mb].map(model=>model.emitters.filter((e:any)=>e.contamination===0));
      for(let t=0;t<days*768;) {
        const gap=t<768?12:96;
        if(hazard==='badtide')for(const sources of clean)for(const e of sources)e.contamination=(portable?portableCurve:badtideContamination)(t/768,days);
        a.run(gap,hazard==='drought'?0:1);p.sim.run(gap,hazard==='drought'?0:1);t+=gap;
        same(a,p.sim,hazard+' '+t);checks++;
        rows.push({stage:hazard,ticks:t,hash:await digest(p.sim)});
      }
      p.close();
      const previous={model:m,water:{settled:false,ticks:0,depth:a.D.slice(),contamination:a.C.slice(),sat:new Uint8Array(a.N),out:a.out.slice(),preview:true}};
      const warm=warmStart(previous as any,m);
      const back=new Reference(structuredClone(m),structuredClone(warm.state),opts as any);
      const returnPool=await parallelSim(structuredClone(m),structuredClone(warm.state),opts as any,threads,new URL('./helper.js',location.href));pools.push(returnPool);
      if(warm.out){back.out.set(warm.out);returnPool.sim.out.set(warm.out);}
      const config={sealed:sealedTiles(m),checkEvery:PREVIEW_CHECK,tol:PREVIEW_TOL,movedShare:PREVIEW_MOVED,maxDays:PREVIEW_DAYS,untilSteady:true};
      const ar=new ReferenceRun(back,config),br=new SettleRun(returnPool.sim,config);
      do{const x=ar.advance(4),y=br.advance(4);if(JSON.stringify(x)!==JSON.stringify(y))throw Error('weather return stop differs');same(back,returnPool.sim,'weather return');checks++;rows.push({stage:hazard+'-return',ticks:back.ticks,hash:await digest(returnPool.sim)});}while(!ar.done);
      returnPool.close();
    }
    if(fast)same(fast,sim,'fast scalar');
    postMessage({id:data.id,threads:pool.threads,requested:threads,isolated:crossOriginIsolated,startupMs,scalarMs,parallelMs,fastMs,checks,ticks:sim.ticks,volume:sim.volume(),result:run.done,hash:canonicalDigest,dispatch:pool.stats?{parallel:pool.stats.parallelPhases-(beforeStats.parallelPhases??0),scalar:pool.stats.scalarPhases-(beforeStats.scalarPhases??0)}:undefined,rows});
  }catch(e){postMessage({error:String(e),id:data.id});}
  finally{if(!data.persistent)for(const p of pools)p.close();}
};

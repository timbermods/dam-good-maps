// One original scalar oracle per engine/model; every count publishes the same ordered
// raw-byte snapshots. Numerical kernels/runtime are shared with the regular proof.
import {installParallelWater} from './runtime';
import {WaterSim,SettleRun,sealedTiles} from './water';
import {WaterSim as Reference,SettleRun as ReferenceRun} from '../../src/core/sim/water';
import {prefill} from '../../src/core/sim/prefill';
import {warmStart,PREVIEW_CHECK,PREVIEW_TOL,PREVIEW_MOVED,PREVIEW_DAYS} from '../../src/core/sim/preview';
import {badtideContamination} from '../../src/core/sim/weather';
const bytes=(a:ArrayBufferView)=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
function same(a:any,b:any){
  for(const key of ['D','Dold','C','out','seepOn']){
    const x=bytes(a[key]),y=bytes(b[key]);
    if(x.length!==y.length)throw Error(key+' length differs');
    for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error(key+' bytes differ at '+i);
  }
  const x=a.saturation(),y=b.saturation();
  if(a.ticks!==b.ticks||!Object.is(a.volume(),b.volume())||x.some((v:number,i:number)=>v!==y[i]))throw Error('ticks/volume/saturation differ');
}
async function digest(sim:WaterSim){
  const arrays=[sim.D,sim.Dold,sim.C,sim.out,sim.saturation(),(sim as any).seepOn];
  const all=new Uint8Array(arrays.reduce((n,a)=>n+a.byteLength,0));let offset=0;
  for(const a of arrays){all.set(bytes(a),offset);offset+=a.byteLength;}
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',all))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
onmessage=async({data})=>{
  let pool:Awaited<ReturnType<typeof installParallelWater>>|undefined;
  try{
    const m=data.model,opts={rules:data.rules??'game'} as any,oracle=data.threads===1;
    pool=await installParallelWater(data.threads,new URL('./helper.js',location.href));
    if(pool.threads!==data.threads)throw Error('Unexpected scalar fallback');
    function pair(model:any,initial:any,out?:Float64Array|null){
      const sim=new WaterSim(structuredClone(model),structuredClone(initial),opts);
      const ref=oracle?new Reference(structuredClone(model),structuredClone(initial),opts):null;
      if(out){sim.out.set(out);ref?.out.set(out);}
      return {sim,ref};
    }
    const rows:any[]=[];let checks=0,directChecks=0,parallelMs=0;
    async function snapshot(stage:string,p:ReturnType<typeof pair>,result?:unknown){
      if(p.ref){same(p.ref,p.sim);directChecks++;}
      rows.push({stage,ticks:p.sim.ticks,volume:p.sim.volume(),result:result??null,hash:await digest(p.sim)});checks++;
    }
    async function advance(stage:string,p:ReturnType<typeof pair>,config:any,slice:number){
      const run=new SettleRun(p.sim,config),ref=p.ref?new ReferenceRun(p.ref,config):null;
      do{
        const expected=ref?.advance(slice),start=performance.now(),result=run.advance(slice);parallelMs+=performance.now()-start;
        if(ref&&JSON.stringify(expected)!==JSON.stringify(result))throw Error(stage+' stop differs');
        await snapshot(stage,p,result);
      }while(!run.done);
      return run.done;
    }
    const canonical=pair(m,data.initial??prefill(m));
    const result=await advance('canonical',canonical,{sealed:sealedTiles(m)},128);
    const hash=await digest(canonical.sim),ticks=canonical.sim.ticks,volume=canonical.sim.volume();
    const water={...result,depth:canonical.sim.D.slice(),contamination:canonical.sim.C.slice(),sat:canonical.sim.saturation(),out:canonical.sim.out.slice()};
    const next=structuredClone(m),center=Math.floor(m.H/2)*m.W+Math.floor(m.W/2);
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)next.floor[center+dy*m.W+dx]=Math.max(0,next.floor[center+dy*m.W+dx]-2);
    const edit=warmStart({model:m,water} as any,next),live=pair(next,edit.state,edit.out);
    await advance('live',live,{sealed:sealedTiles(next),checkEvery:PREVIEW_CHECK,tol:PREVIEW_TOL,movedShare:PREVIEW_MOVED,maxDays:1,untilSteady:true},17);
    for(const hazard of ['drought','badtide']){
      const p=pair(m,{depth:canonical.sim.D.slice(),contamination:canonical.sim.C.slice()});
      const clean=[p.sim,...(p.ref?[p.ref]:[])].map(s=>s.emitters.filter(e=>e.contamination===0));
      const days=hazard==='drought'?9:8;
      for(let t=0;t<days*768;){
        const gap=t<768?12:96;
        if(hazard==='badtide')for(const sources of clean)for(const e of sources)e.contamination=badtideContamination(t/768,days);
        p.ref?.run(gap,hazard==='drought'?0:1);p.sim.run(gap,hazard==='drought'?0:1);t+=gap;
        await snapshot(hazard,p);
      }
      const previous={model:m,water:{settled:false,ticks:0,depth:p.sim.D.slice(),contamination:p.sim.C.slice(),sat:new Uint8Array(p.sim.N),out:p.sim.out.slice(),preview:true}};
      const warm=warmStart(previous as any,m),back=pair(m,warm.state,warm.out);
      await advance(hazard+'-return',back,{sealed:sealedTiles(m),checkEvery:PREVIEW_CHECK,tol:PREVIEW_TOL,movedShare:PREVIEW_MOVED,maxDays:PREVIEW_DAYS,untilSteady:true},4);
    }
    postMessage({id:data.id,requested:data.threads,threads:pool.threads,isolated:crossOriginIsolated,hash,ticks,volume,result,rows,checks,directChecks,parallelMs,dispatch:pool.stats?{parallel:pool.stats.parallelPhases,scalar:pool.stats.scalarPhases}:undefined});
  }catch(e){postMessage({id:data.id,error:String(e)});}
  finally{pool?.close();}
};

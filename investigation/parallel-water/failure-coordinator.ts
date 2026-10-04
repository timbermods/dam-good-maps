import {installParallelWater} from './runtime';
import {WaterSim} from './water';
import {WaterSim as Reference} from '../../src/core/sim/water';
onmessage=async()=>{
  let pool:any;
  try{
    const m={W:8,H:8,floor:Float64Array.from({length:64},(_,i)=>(i%8)/10),dam:null,emitters:[{cells:[27],strength:1,contamination:.5}]};
    const initial={depth:new Float64Array(64).fill(1),contamination:new Float64Array(64).fill(.25)};
    pool=await installParallelWater(2,new URL('./fault-helper.js',location.href),2000,64,0);
    if(pool.threads!==2)throw Error('Fault helper did not start');
    const partial=new WaterSim(structuredClone(m),structuredClone(initial));let failed=false;
    try{partial.run(10);}catch(e){if(!String(e).includes('Water phase timeout'))throw e;failed=true;}
    if(!failed)throw Error('Failed phase was accepted');
    const fresh=new WaterSim(structuredClone(m),structuredClone(initial)),reference=new Reference(structuredClone(m),structuredClone(initial));
    if(fresh.executor||fresh.runScope)throw Error('Scalar retry still has failed pool attached');
    fresh.run(20);reference.run(20);
    for(const key of['D','Dold','C','out','seepOn']as const){const a=new Uint8Array(fresh[key].buffer),b=new Uint8Array(reference[key].buffer);for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('Fresh scalar retry differs');}
    postMessage({phaseTimeout:true,discarded:true,scalarRetryTicks:fresh.ticks,partialTicks:partial.ticks});
  }catch(e){postMessage({error:String(e)});}finally{pool?.close();}
};

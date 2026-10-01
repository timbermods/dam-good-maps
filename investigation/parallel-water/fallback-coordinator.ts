import {installParallelWater} from './runtime';
import {WaterSim} from './water';
import {WaterSim as Reference} from '../../src/core/sim/water';
onmessage=async({data})=>{
  const pool=await installParallelWater(16,new URL(data.missing?'./missing-helper.js':'./helper.js',location.href),5000,64);
  try{
    if(pool.threads!==1)throw Error('Expected fallback');
    const m={W:8,H:8,floor:new Float64Array(64).fill(1),dam:new Float64Array(64).fill(-1),emitters:[{cells:[0,27],strength:1,contamination:0,depthLimit:{anchor:27,off:.6,on:.2}},{cells:[27],strength:.7,contamination:1}]};m.dam[28]=.65;
    for(const rules of ['game','port'] as const){const a=new Reference(structuredClone(m),undefined,{rules}),b=new WaterSim(structuredClone(m),undefined,{rules});
      for(let t=0;t<200;t++){a.run(1);b.run(1);for(const key of ['D','Dold','C','out'] as const){const x=new Uint8Array(a[key].buffer),y=new Uint8Array(b[key].buffer);for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error('Fallback bytes differ '+key);}}
    }
    postMessage({threads:pool.threads,tickChecks:400,isolated:crossOriginIsolated});
  }catch(e){postMessage({error:String(e)});}finally{pool.close();}
};

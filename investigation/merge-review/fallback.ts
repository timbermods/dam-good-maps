import assert from 'node:assert/strict';
import { installParallelWater,uninstallParallelWater,parallelWaterThreads,parallelWaterStats,withoutParallelWater } from '../../src/core/sim/parallel';
import { WaterSim } from '../../src/core/sim/water';
import { writeFileSync } from 'node:fs';
const rows=[];
for(const state of ['spawn denied','not ready','died in run']){
 let stopped=0,flags:Int32Array;
 const helper={postMessage(m:any){if(m.kind==='hello'){flags=new Int32Array(m.ctl);if(state!=='not ready')Atomics.store(flags,m.index,1);}if(m.kind==='run')Atomics.store(flags,16,1);},terminate(){stopped++;}};
 installParallelWater({threads:2,spawn:()=>{if(state==='spawn denied')throw Error('blocked worker');return helper;}});
 const W=3,H=9,N=W*H,model={W,H,floor:new Float64Array(N),dam:null,emitters:[{cells:[13],strength:2,contamination:.5}]},initial={depth:new Float64Array(N).fill(.5),contamination:new Float64Array(N)};
 const a=new WaterSim(model,initial),b=new WaterSim(structuredClone(model),initial),start=parallelWaterStats.runs;
 try{a.run(3);withoutParallelWater(()=>b.run(3));for(const k of ['D','C','out','Dold']as const)assert(Buffer.from(a[k].buffer).equals(Buffer.from(b[k].buffer)),state+'/'+k);rows.push({state,threads:parallelWaterThreads(),threadedRuns:parallelWaterStats.runs-start,stopped});}
 finally{uninstallParallelWater();a.dispose();b.dispose();}
}
writeFileSync(new URL('./local/fallback.json',import.meta.url),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));

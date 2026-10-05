import { WaterSim } from '../../src/core/sim/water';
import { installParallelWater,parallelWaterStats,parallelWaterThreads,uninstallParallelWater,withoutParallelWater } from '../../src/core/sim/parallel';
self.onmessage=async()=>{
 const installed=installParallelWater({spawn:()=>new Worker(new URL('../../src/worker/waterStrip.worker.ts',import.meta.url),{type:'module'})});
 if(installed)while(parallelWaterThreads()<Math.min(8,Math.max(1,(navigator.hardwareConcurrency||4)-1)))await new Promise(r=>setTimeout(r,10));
 const W=257,H=257,N=W*H;
 const model={W,H,floor:Float64Array.from({length:N},(_,i)=>(i%11)/8),dam:null,emitters:[{cells:[W+2],strength:2,contamination:.5}]};
 const initial={depth:Float64Array.from({length:N},(_,i)=>i%7?1:0),contamination:new Float64Array(N)};
 const a=new WaterSim(model,initial),b=new WaterSim(structuredClone(model),initial);
 let equal=true;
 const same=(x:ArrayBufferView,y:ArrayBufferView)=>{const u=new Uint8Array(x.buffer,x.byteOffset,x.byteLength),v=new Uint8Array(y.buffer,y.byteOffset,y.byteLength);return u.every((z,i)=>z===v[i]);};
 try{for(const scale of [1,0,.35,1]){a.run(3,scale);withoutParallelWater(()=>b.run(3,scale));for(const k of ['D','C','out','Dold']as const)equal&&=same(a[k],b[k]);}}
 finally{a.dispose();b.dispose();uninstallParallelWater();}
 self.postMessage({equal,runs:parallelWaterStats.runs,installed});self.close();
};

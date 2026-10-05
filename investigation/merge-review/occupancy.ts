import { Worker } from 'node:worker_threads';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { WaterSim } from '../../src/core/sim/water';
import { installParallelWater,uninstallParallelWater,parallelWaterThreads,withoutParallelWater } from '../../src/core/sim/parallel';
installParallelWater({threads:2,spawn:()=>{const w=new Worker(new URL('./helper.mjs',import.meta.url));return{postMessage:m=>w.postMessage(m),terminate:()=>void w.terminate()};}});
while(parallelWaterThreads()<2)await new Promise(r=>setTimeout(r,10));
const rows=[],bytes=(v:Float64Array)=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
try{for(const occupancy of ['wet to dry','dry to wet'])for(const freshSingle of [false,true])for(const beforeFirstRun of [false,true]){
 const W=3,H=9,N=W*H,floor=new Float64Array(N).fill(9);floor[13]=0;
 const model={W,H,floor,dam:null,emitters:[{cells:[13],strength:2,contamination:.5}]};
 const initial={depth:new Float64Array(N),contamination:new Float64Array(N)};initial.depth[13]=.5;
 const a=new WaterSim(model,initial),b=new WaterSim(structuredClone(model),initial);
 try{
 if(!beforeFirstRun){a.run(1);withoutParallelWater(()=>b.run(1));}
 if(freshSingle){a.Dold;b.Dold;}
 const i=occupancy==='wet to dry'?13:12;a.D[i]=b.D[i]=occupancy==='wet to dry'?0:3;a.C[i]=b.C[i]=.9;
 a.run(1);withoutParallelWater(()=>b.run(1));
 const equal=['D','C','out','Dold'].every(k=>bytes(a[k]).equals(bytes(b[k])));
 rows.push({occupancy,freshSingle,beforeFirstRun,equal});
 if(process.env.MERGE_REVIEW_EXPECT_BUGS!=='1')assert(equal,JSON.stringify(rows.at(-1)));
 // Following runs must preserve the same bytes, including an edited instance that stays single-threaded.
 a.run(3);withoutParallelWater(()=>b.run(3));const continuationEqual=['D','C','out','Dold'].every(k=>bytes(a[k]).equals(bytes(b[k])));Object.assign(rows.at(-1)!,{continuationEqual});if(process.env.MERGE_REVIEW_EXPECT_BUGS!=='1')assert(continuationEqual,`${occupancy}/continuation`);
 }finally{a.dispose();b.dispose();}
}}finally{uninstallParallelWater();}
if(process.env.MERGE_REVIEW_EXPECT_BUGS==='1')assert(rows.some(r=>!r.equal||!(r as any).continuationEqual));
writeFileSync(new URL('./local/occupancy.json',import.meta.url),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));

import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { WaterSim } from '../../src/core/sim/water';
import { rustWater } from '../../src/core/sim/rustWater';
import { installParallelWater,uninstallParallelWater,parallelWaterThreads,withoutParallelWater } from '../../src/core/sim/parallel';
const workers:Worker[]=[];
installParallelWater({threads:4,spawn:()=>{const w=new Worker(new URL('./lifecycle-helper.mjs',import.meta.url));workers.push(w);return {postMessage:m=>w.postMessage(m),terminate:()=>void w.terminate()};}});
while(parallelWaterThreads()<4)await new Promise(r=>setTimeout(r,10));
const rows=[];const bytes=(v:Float64Array)=>Buffer.from(v.buffer,v.byteOffset,v.byteLength);
try{for(let k=0;k<40;k++){
 const W=k%2?257:256,H=k%3?257:256,N=W*H;
 const model={W,H,floor:new Float64Array(N),dam:null,emitters:[{cells:[W+2],strength:1,contamination:.4}]};
 const initial={depth:new Float64Array(N).fill(.5),contamination:new Float64Array(N)};
 const a=new WaterSim(model,initial),b=new WaterSim(structuredClone(model),initial);
 try{a.run(2);withoutParallelWater(()=>b.run(2));assert(bytes(a.D).equals(bytes(b.D)));assert(bytes(a.C).equals(bytes(b.C)));assert(bytes(a.out).equals(bytes(b.out)));}
 finally{a.dispose();b.dispose();}
 const helpers=await Promise.all(workers.map(w=>new Promise<any>(r=>{w.once('message',r);w.postMessage({kind:'inspect'});})));assert(helpers.every(h=>h.jobs===0));
 rows.push({cycle:k,mainMemory:rustWater().memory.buffer.byteLength,helpers});
 }
 const allMemory=(r:any)=>[r.mainMemory,...r.helpers.map((h:any)=>h.memory)];
 assert.deepEqual(allMemory(rows[39]),allMemory(rows[7]),'Wasm memory did not plateau after shape warmup');
 writeFileSync(new URL('./local/lifecycle.json',import.meta.url),JSON.stringify(rows,null,2));console.log('40 size/map replacements: exact bytes, zero retained helper jobs after disposal, stable Wasm memory after warmup.');
}finally{uninstallParallelWater();}

import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { WaterSim } from '../../src/core/sim/water';
import { installParallelWater, uninstallParallelWater, parallelWaterThreads, withoutParallelWater } from '../../src/core/sim/parallel';
installParallelWater({ threads: 2, spawn: () => { const w = new Worker(new URL('./commit-failure.mjs', import.meta.url)); return { postMessage: m => w.postMessage(m), terminate: () => void w.terminate() }; } });
while (parallelWaterThreads() < 2) await new Promise(r => setTimeout(r,10));
const W=3,H=9,N=W*H;
const floor=new Float64Array(N).fill(9);floor[13]=0;
const model={W,H,floor,dam:null,emitters:[{cells:[13],strength:5,contamination:.6,depthLimit:{anchor:13,off:.9,on:.5}}]};
const initial={depth:Float64Array.from({length:N},(_,i)=>i===13?.4:0),contamination:new Float64Array(N)};
const a=new WaterSim(model,initial),b=new WaterSim(structuredClone(model),initial);
const eq=(x:Float64Array,y:Float64Array)=>Buffer.from(x.buffer,x.byteOffset,x.byteLength).equals(Buffer.from(y.buffer,y.byteOffset,y.byteLength));
try {
  a.run(1,.08); withoutParallelWater(()=>b.run(1,.08));
  assert(eq(a.D,b.D));
  a.run(2); withoutParallelWater(()=>b.run(2));
  const evidence={depth:eq(a.D,b.D),contamination:eq(a.C,b.C),out:eq(a.out,b.out),oldDepth:eq(a.Dold,b.Dold),threads:parallelWaterThreads()};
  writeFileSync(new URL('./local/commit-failure.json',import.meta.url),JSON.stringify(evidence,null,2));
  console.log(evidence);
  assert.equal(Object.values(evidence).slice(0,4).every(Boolean),process.env.MERGE_REVIEW_EXPECT_BUGS !== '1');
} finally { uninstallParallelWater();a.dispose();b.dispose(); }

import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {ROOT,LOCAL,api,deps,json,hash} from './common.mjs';
const fast=api(),rust=api('rust'),p=deps(resolve(LOCAL,'protocol.cjs'));
assert.ok(await rust.installRustWater(readFileSync(resolve(LOCAL,'water.wasm'))));
const fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
let checks=0;const rows=[];
for(const rules of ['game','port'])for(const f of fixtures){
 const m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:structuredClone(f.emitters)};
 const a=new fast.WaterSim(structuredClone(m),undefined,{rules}),b=new rust.WaterSim(structuredClone(m),undefined,{rules});assert.equal(b.backend,'wasm');
 for(let t=1;t<=975;t++){a.run(1);b.run(1);assert.deepEqual(p.snapshot(b),p.snapshot(a),`${rules}/${f.name}/${t}`);checks++;}
 const initial=fast.prefill(m),commands=[{settle:{}}],a2=new fast.WaterSim(structuredClone(m),initial,{rules});
 const result=fast.settle(a2),expected=p.packSnapshots([p.snapshot(a2,result)]),input=p.encodeJob(m,initial,{rules},commands);
 writeFileSync(resolve(LOCAL,'smoke.in'),input);
 if(process.argv.includes('--native')){execFileSync(process.env.DGM_NATIVE??resolve(LOCAL,'target/release/water-batch'+(process.platform==='win32'?'.exe':'')),[resolve(LOCAL,'smoke.in'),resolve(LOCAL,'smoke.out')]);assert.deepEqual(readFileSync(resolve(LOCAL,'smoke.out')),Buffer.from(expected),`${rules}/${f.name}/native`);}
 const a3=new rust.WaterSim(structuredClone(m),initial,{rules});const r3=rust.settle(a3);assert.deepEqual(r3,result);assert.deepEqual(p.snapshot(a3,r3),p.snapshot(a2,result));
 rows.push({rules,name:f.name,ticks:result.ticks,sha256:hash(expected)});b.dispose();a3.dispose();console.log(rules,f.name,'pass');
}
// Signed zero, fractional floors, tiny emitters, overlapping cells, seep hysteresis and mutations.
let seed=0xabc123;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
for(let k=0;k<100;k++){const W=1+Math.floor(rand()*24),H=1+Math.floor(rand()*24),N=W*H;
 const m={W,H,floor:Float64Array.from({length:N},()=>Math.floor(rand()*6)/2),dam:k%2?null:Float64Array.from({length:N},()=>rand()<.2?.65:-1),emitters:[{cells:[Math.floor(rand()*N)],strength:k%7===0?1e-14:rand()*8,contamination:rand()},{cells:[0,N-1],strength:.7,contamination:.3,depthLimit:{anchor:0,off:1.2,on:.8}}]};
 const init={depth:Float64Array.from({length:N},()=>rand()<.4?-0:rand()*2),contamination:Float64Array.from({length:N},()=>rand()<.5?-0:rand())},opts={rules:k%2?'port':'game',edgeSpill:k%3===0};
 const a=new fast.WaterSim(structuredClone(m),init,opts),b=new rust.WaterSim(structuredClone(m),init,opts);
 for(let t=0;t<100;t++){if(t===50){a.F[0]=b.F[0]=.5;a.emitters[0].contamination=b.emitters[0].contamination=.2;}const scale=t<40?1:t<80?0:.35;a.run(1,scale);b.run(1,scale);assert.deepEqual(p.snapshot(b),p.snapshot(a),`random/${k}/${t}`);checks++;}b.dispose();
}
rust.uninstallRustWater();const fallback=new rust.WaterSim({W:1,H:1,floor:new Float64Array(1),dam:null,emitters:[]});assert.equal(fallback.backend,'typescript');fallback.run(2);assert.equal(fallback.ticks,2);
assert.equal(await rust.installRustWater(new Uint8Array([1,2,3])),false);
json('smoke.json',{checks,rows,native:process.argv.includes('--native'),fallback:'pass'});console.log(checks,'raw-byte checkpoints, fallback PASS');

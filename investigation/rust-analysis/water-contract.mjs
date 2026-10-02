import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {ROOT,LOCAL,deps,json} from './common.mjs';
globalThis.__raNative=deps(resolve(LOCAL,'analysis.node'));
const Native=deps(resolve(LOCAL,'water-contract-build/native-water.cjs')).WaterSim;
const Reference=deps(resolve(LOCAL,'water-contract-build/local/reference-water.cjs')).WaterSim;
const fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
let comparisons=0;
function equal(a,b,label){assert.ok(Buffer.from(a.buffer,a.byteOffset,a.byteLength).equals(Buffer.from(b.buffer,b.byteOffset,b.byteLength)),label);comparisons++;}
function check(a,b,label){for(const k of ['D','C','Dold','out','seepOn'])equal(a[k],b[k],label+'/'+k);equal(a.saturation(),b.saturation(),label+'/sat');assert.equal(a.ticks,b.ticks);}
const model=f=>({W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:structuredClone(f.emitters)});
for(const f of fixtures)for(const rules of ['port','game']){
 const a=new Reference(model(f),undefined,{rules}),b=new Native(model(f),undefined,{rules});
 // Historical Python snapshots are tolerance-based in product tests. This gate
 // compares every byte to today's TypeScript on their exact fixture inputs.
 for(const snap of f.snapshots){a.run(snap.ticks-a.ticks);b.run(snap.ticks-b.ticks);check(a,b,f.name+'/'+rules+'/'+snap.ticks);}
 const c=new Native(model(f),undefined,{rules});c.run(3);const saved=c.D.slice();
 for(const sim of [a,b]){sim.F[Math.floor(sim.N/2)]+=.25;sim.out[0]=.0003;if(sim.dam)sim.dam[0]=.5;for(const e of sim.emitters){e.strength*=.5;e.contamination=.2;}}
 a.run(5.2,.5);b.run(5.2,.5);check(a,b,f.name+'/mutable');equal(c.D,saved,'independent handle');
 a.run(0);b.run(0);check(a,b,f.name+'/zero ticks');
 b.dispose();b.dispose();assert.throws(()=>b.run(1),/disposed/);assert.throws(()=>b.saturation(),/disposed/);c.dispose();
}
json('water-contract.json',{status:'pass',fixtures:fixtures.length,rules:['port','game'],comparisons,mutableFields:['floor','dam','out','emitter strength','contamination'],fractionalTicks:true,independentHandles:true,dispose:true});console.log('Native water resident adapter contracts pass',comparisons);

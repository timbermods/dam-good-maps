import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),base=require('./local/baseline-counts.cjs'),next=require('./local/candidate-counts.cjs');
const raw=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
// Bundles have distinct JsonFloat constructors; compare data, preserving every float bit.
const plain=x=>ArrayBuffer.isView(x)?{kind:x.constructor.name,bytes:raw(x).toString("hex")}:Array.isArray(x)?x.map(plain):x&&typeof x==="object"?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,plain(v)])):x;
const fixtures=JSON.parse(gunzipSync(readFileSync('tests/golden/water.json.gz'))).fixtures;
for(const f of fixtures){
 const m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:f.emitters};
 const depth=Float64Array.from(f.canonical.depth);
 for(const days of [0,3,9,25])assert.deepEqual(raw(next.droughtStorage(m,depth,days)),raw(base.droughtStorage(m,depth,days)),f.name+' '+days);
 const prepared=next.prepareDrought(m,depth),expected=base.droughtStorage(m,depth,9);
 m.floor.fill(99);depth.fill(99);if(m.dam)m.dam.fill(99);m.emitters=[];
 const a=prepared(9);assert.deepEqual(raw(a),raw(expected),f.name+' snapshots inputs');a.fill(99);assert.deepEqual(raw(prepared(9)),raw(expected),f.name+' fresh output');
}
const work=[];
// No timing: check every requested 256² case, including the failed extreme map's file/state.
const cases=JSON.parse(readFileSync('investigation/gen-speed/local/profile.json','utf8')).rows;
for(const c of cases){
 const results=[];
 for(const api of [base,next]){
  globalThis.__counts={};const lands=[];
  const r=api.generate(c.spec,{onLand:l=>lands.push(plain(l))});
  results.push({r,lands,counts:globalThis.__counts});globalThis.__counts=null;
 }
 const [a,b]=results;
 assert.deepEqual(b.r.bytes,a.r.bytes,c.id+' map bytes');
 for(const key of ['heights','channel','occupied','water','contamination','moisture','soilContamination'])assert.deepEqual(raw(b.r.built[key]),raw(a.r.built[key]),c.id+' '+key);
 for(const key of ['entities','sources','slopes','start','notes','orphans','waterModel','settle'])assert.deepEqual(plain(b.r.built[key]),plain(a.r.built[key]),c.id+' '+key);
 for(const key of ['spec','features','report','analysis','field','info','failures','intentions','attempts','outcomes','file'])assert.deepEqual(plain(b.r[key]),plain(a.r[key]),c.id+' '+key);
 assert.deepEqual(b.lands,a.lands,c.id+' shown land');
 work.push({case:c.id,baseline:a.counts,candidate:b.counts,exact:true});
 writeFileSync('investigation/gen-speed/work-counts.json',JSON.stringify({droughtFixtures:fixtures.length,cases:work},null,2)+'\n');
 console.log(c.id+': exact map, full build arrays, file, checks, attempts and shown land.');
}
console.log('Exact drought fixtures and snapshot/output ownership passed.');

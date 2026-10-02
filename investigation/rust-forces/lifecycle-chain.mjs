// Consecutive operations in a retained map. Packing is a cold diagnostic only.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,deps,json,hash} from './common.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),wasm=readFileSync(resolve(LOCAL,'forces.wasm')),run=await api.bridge(wasm);
const first=api.job('carve',128,0),task=run.create(first),rows=[];
const pointers=()=>[task.map.heights.byteOffset,task.map.lava.byteOffset,task.map.water.depth.byteOffset,task.map.water.contamination.byteOffset];
const equal=(a,b,label)=>{if(!Buffer.from(api.encode(a)).equals(Buffer.from(api.encode(b))))throw Error(label);};
const original=pointers(),baseline=structuredClone(first.map);
try{
 const other=run.create(api.job('quake',512,0));other.plan();other.dispose();
 let map=first.map;
 for(let k=0;k<18;k++){
  const verb=['carve','craterize','erupt','quake','glaciate','footprint'][k%6],j=api.job(verb,128,k);
  j.map=map;j.keep=first.keep;
  if(k===6){task.map.heights[33]=9;map.heights[33]=9;task.map.water.depth[33]=.12345678901234567;map.water.depth[33]=.12345678901234567;}
  if(verb==='carve'){const source=map.entities.find(e=>e.template==='WaterSource');j.options={sourceId:k===0?'retained-🌋'.repeat(600):'retained-source-'+k,bad:k===6,...(source&&k===12?{unleashed:source.id}:{})};if(k===12)j.settings.dry=true;}
  const expected=api.referenceWithRecord(j);
  task.configure(verb,j.settings,j.intent,j.margin??0,j.options);
  try{task.plan();}catch(error){if(!expected.error)throw error;}
  equal(expected,api.decode(task.pack()),'Consecutive operation '+verb+'/'+k);
  if(!expected.error){
   equal(expected,api.typedResult(task,j),'Direct typed record '+verb+'/'+k);
   if(verb!=='footprint'){
    equal(task.before.heights,j.map.heights,'Immutable before heights');
    equal(task.before.depth,j.map.water.depth,'Immutable before water');
    equal(task.map.heights,expected.map.heights,'Live result heights');
    equal(task.map.water,expected.map.water,'Live result water');map=expected.map;
   }
  }
  equal(pointers(),original,'Retained numeric allocation moved');
  rows.push({verb,k,error:expected.error??null,sha256:hash(api.encode(expected))});
 }
 task.reset();equal(task.map.heights,baseline.heights,'Reset heights');equal(task.map.water,baseline.water,'Reset water');
}finally{task.dispose();task.dispose();}
let disposed=false;try{task.plan();}catch{disposed=true;}if(!disposed)throw Error('Disposed handle accepted');
json('lifecycle-chain.json',{status:'pass',wasmSha256:hash(wasm),rows,scope:'all five forces, consecutive operations, before/map/record views, host writes, allocator growth, reset, disposal'});
console.log('Typed lifecycle:',rows.length,'PASS');

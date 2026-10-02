// Exercise the actual shared-memory path, including writes and repeated gestures.
// Diagnostic packing is outside the operation and exists only for byte comparisons.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {LOCAL,deps,json} from './common.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),run=await api.bridge(readFileSync(resolve(LOCAL,'forces.wasm')));
const first=api.job('craterize',128,0),task=run.create(first);let comparisons=0;
try{
 const pointers=[task.map.heights.byteOffset,task.map.lava.byteOffset,task.map.water.depth.byteOffset,task.map.water.contamination.byteOffset];
 // Force memory growth and allocator reuse while the first map remains live.
 const other=run.create(api.job('quake',512,0));other.plan();other.dispose();
 for(let k=0;k<12;k++){
  const verb=['footprint','craterize','erupt','quake'][k%4],j=api.job(verb,128,k);
  const m=task.map;m.heights.set(j.map.heights);m.lava.set(j.map.lava);m.water.depth.set(j.map.water.depth);m.water.contamination.set(j.map.water.contamination);m.rockLayers.set(j.map.rockLayers);m.keep.set(j.keep);
  // Fixture reset restores the cold object registry; numeric map writes after it
  // prove the operation reads live Wasm memory rather than the imported snapshot.
  task.reset();task.map.heights[33]=9;j.map.heights[33]=9;
  task.map.water.depth[33]=.12345678901234567;j.map.water.depth[33]=.12345678901234567;
  j.map=api.job('craterize',128,0).map;j.map.heights[33]=9;j.map.water.depth[33]=.12345678901234567;
  task.configure(verb,j.settings,j.intent,j.margin??0);task.plan();
  const expected=api.encode(api.referenceWithRecord(j));if(!Buffer.from(expected).equals(Buffer.from(task.pack())))throw Error('Shared-memory identity '+verb+'/'+k);
  if(pointers.some((p,i)=>p!==[task.map.heights.byteOffset,task.map.lava.byteOffset,task.map.water.depth.byteOffset,task.map.water.contamination.byteOffset][i]))throw Error('Map allocation moved');
  if(verb!=='footprint'){
   const output=api.decode(task.pack());
   if(!Buffer.from(task.map.heights).equals(Buffer.from(output.map.heights)))throw Error('Live height view');
   const records=task.records(verb);for(const key of ['arrival','flows','heat','dx','dy','source','keep'])if(records[key]){
    if(!Buffer.from(api.encode(records[key])).equals(Buffer.from(api.encode(output[key]))))throw Error('Typed playback '+key);
   }
   if(!Buffer.from(api.encode(task.regions.tiles)).equals(Buffer.from(api.encode(output.literal.tiles))))throw Error('Typed regions');
  }
  comparisons++;
 }
}finally{task.dispose();task.dispose();}
let threw=false;try{task.plan();}catch{threw=true;}if(!threw)throw Error('Disposed handle accepted');
json('typed-lifecycle.json',{status:'pass',comparisons,scope:'retained terrain/water views, typed commands/records/regions, growth, reset, disposal'});
console.log('Typed lifecycle:',comparisons,'PASS');

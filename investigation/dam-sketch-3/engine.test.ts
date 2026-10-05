import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadKernel,type State,type WaterObject} from './kernel.ts';
import {createJob,fillProgressively} from './engine.ts';
import {compileWall,raster} from './wall.ts';
import {createWorkerSession,type WorkerPort} from './worker-client.ts';
import {channel,scenes,drought} from './scenes.ts';
import {WATER_WASM} from '../../src/core/sim/waterWasm.ts';
const bytes=readFileSync(new URL('./local/kernel/rust/target/wasm32-unknown-unknown/release/water.wasm',import.meta.url));
const kernel=loadKernel(bytes);
const equalBytes=(a:State,b:State)=>{for(const key of Object.keys(a) as Array<keyof State>)assert.deepEqual(Buffer.from(a[key].buffer),Buffer.from(b[key].buffer),key);};
function finishFill(job:ReturnType<typeof createJob>){let r=job.result();while(r.phase==='filling')r=job.advance(128);return r;}

test('round-2 pulse is initially present, drains and evaporates; the source-fed stacked scene retains water',()=>{
 const old=createJob(kernel,channel(false,1.9),[scenes[3].stroke]);
 assert.equal(old.result().water.depth[119],1.9);
 const r=finishFill(old);assert.equal(r.waterHeldM3,0);assert.equal(r.totalWaterM3,0);
 const fixed=createJob(kernel,channel(),[scenes[3].stroke]);const filled=finishFill(fixed);
 assert.ok(filled.waterHeldM3>18);assert.ok(Math.abs(filled.water.floor[119]+filled.water.depth[119]-1.65)<.02);
 assert.equal(filled.water.count[150],2);assert.equal(filled.water.floor[150],1);assert.equal(filled.water.ceiling[150],2);
 assert.equal(filled.water.floor[256+150],2); // lower gap was not filled as a levee
});
for(const scene of scenes)test(`${scene.id}: crest, held water, construction tiles, floods and source-off drought`,()=>{
 const job=createJob(kernel,channel(),[scene.stroke],{drought});let r=finishFill(job);
 assert.equal(r.fill?.settled,true);assert.ok(Math.abs(r.water.floor[119]+r.water.depth[119]-scene.crest)<.02);
 assert.equal(r.wall.tiles.length,4);assert.equal(r.wall.pieces.length,4*scene.stroke.stack.length);
 assert.equal(r.reservoirColumns.length,28);assert.ok(r.waterHeldM3>0);
 assert.deepEqual(r.floods.start,[{tile:119,z:1}]);assert.equal(r.floods.farmland?.length,1);
 const filled=r.waterHeldM3;
 while(r.phase==='drought')r=job.advance(128);
 assert.equal(r.drought?.exhausted,true);assert.equal(r.drought?.censored,false);assert.ok(r.drought!.coveredDays>0);assert.equal(r.waterHeldM3,0);
 assert.ok(filled>18);
});
test('direct kernel and sliced sketch publish identical bytes for the same land and finished objects',()=>{
 const snapshot=channel();
 for(const scene of scenes){
  const objects:WaterObject[]=[...snapshot.objects];
  // Independent explicit objects, rather than using the wall compiler as the oracle.
  for(let x=6;x<=9;x++){
   if(scene.id==='dam')objects.push([12,x,9,1,0,0,0,0]);
   if(scene.id==='levee')objects.push([1,x,9,1,0,0,0,0]);
   if(scene.id==='gate-1.5')objects.push([13,x,9,1,0,0,0,1.5]);
   if(scene.id==='stacked-dams')objects.push([12,x,9,1,0,0,0,0],[12,x,9,2,0,0,0,0]);
   if(scene.id==='levee-dam')objects.push([1,x,9,1,0,0,0,0],[12,x,9,2,0,0,0,0]);
  }
  const direct=kernel.create(16,16,snapshot.masks,objects),sketch=createJob(kernel,snapshot,[scene.stroke]);
  for(const ticks of [1,7,65,55]){direct.run(ticks);equalBytes(direct.state(),sketch.advance(ticks).water);}
  direct.dispose();sketch.dispose();
 }
});
test('existing editor objects retain every water byte with the unmodified embedded kernel, flat and roofed',()=>{
 const editor=loadKernel(Buffer.from(WATER_WASM,'base64'));
 for(const roof of [false,true]){
  const map=channel();map.objects=[...map.objects,[2,6,9,1,0,0,0,0]];
  if(roof)map.masks[119]=1|(1<<4); // independent lower and upper columns
  const direct=editor.create(16,16,map.masks,map.objects),sketch=createJob(kernel,{...map,water:undefined},[]);
  for(const ticks of [8,65,55]){direct.run(ticks);equalBytes(direct.state(),sketch.advance(ticks).water);}
  assert.equal(sketch.result().waterHeldM3,0);direct.dispose();sketch.dispose();
 }
});
test('warm water, contamination, overflow and momentum survive unchanged topology',()=>{
 const map=channel();map.masks[119]=1|(1<<4);
 const original=kernel.create(16,16,map.masks,map.objects);original.run(73);
 map.water=original.state();const sketch=createJob(kernel,map,[]);
 original.run(19);equalBytes(original.state(),sketch.advance(19).water);
 original.dispose();sketch.dispose();
});
test('unknown drought stays unknown, finite horizon is censored and snapshots are detached',()=>{
 const noWeather=createJob(kernel,channel(),[scenes[0].stroke]);assert.equal(finishFill(noWeather).drought,null);
 const job=createJob(kernel,channel(),[scenes[0].stroke],{drought:{...drought,ticks:8}});let r=finishFill(job);r.water.depth.fill(999);r=job.advance(8);
 assert.ok(r.waterHeldM3<100);assert.equal(r.drought?.coveredDays,8/768);assert.equal(r.drought?.censored,true);assert.equal(r.drought?.exhausted,false);
});
test('game construction limits and four-connected raster refuse unsupported walls',()=>{
 const map=channel();assert.deepEqual(raster([[6,9],[7,10]],16,16),[150,151,167]);
 assert.throws(()=>compileWall(map,[{...scenes[0].stroke,baseZ:3}]),/unsupported/);
 assert.throws(()=>compileWall(map,[{path:[[6,9]],stack:[{kind:'floodgate',maxHeight:1,height:2}]}]),/floodgate/);
 assert.throws(()=>compileWall(map,[{path:[[6,9]],stack:[{kind:'floodgate',maxHeight:1,height:1},{kind:'dam'}]}]),/floodgate/);
 assert.throws(()=>compileWall(map,[{path:[[7,3]],stack:[{kind:'dam'}]}]),/water object/);
 assert.throws(()=>compileWall(map,[{path:[[6,9]],stack:Array.from({length:34},()=>({kind:'levee' as const}))}]),/height/);
});
test('progress publishes partial fills; abort freezes the cancelled job',async()=>{
 const job=createJob(kernel,channel(),[scenes[1].stroke]),abort=new AbortController();let frames=0;
 const r=await fillProgressively(job,frame=>{frames++;assert.equal(frame.phase,'filling');if(frames===2)abort.abort();},abort.signal);
 assert.equal(frames,2);assert.equal(r.phase,'cancelled');assert.equal(r.ticks,16);assert.equal(job.advance(128).ticks,16);
});
test('a changed wall terminates its worker immediately and discards already queued packets',()=>{
 const ports:Array<WorkerPort&{terminated:boolean}>=[],seen:number[]=[];
 const session=createWorkerSession(()=>{const p={terminated:false,postMessage(){},terminate(){this.terminated=true;},onmessage:null,onerror:null};ports.push(p);return p;},id=>seen.push(id),()=>assert.fail('worker error'));
 const request={bytes,map:channel(),strokes:[scenes[0].stroke]};
 const first=session.replace(request),old=ports[0],late=old.onmessage!;
 const second=session.replace({...request,strokes:[scenes[1].stroke]});assert.ok(old.terminated);
 const job=createJob(kernel,channel(),[]),r=job.result();late({data:{kind:'result',result:r}});ports[1].onmessage!({data:{kind:'result',result:r}});
 assert.notEqual(first,second);assert.deepEqual(seen,[second]);session.dispose();assert.ok(ports[1].terminated);job.dispose();
});

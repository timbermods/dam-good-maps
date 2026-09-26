import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { quake,modelFor,DEFAULTS,hash,faultReason,type QuakeMap,type Intent } from './engine';
import { applyOperation,type QuakeOperation } from './operation';
const workerFile=resolve('.cache/worker-test.mjs'),hostFile=resolve('.cache/worker-host.mjs');
await build({entryPoints:[resolve('worker.ts')],outfile:workerFile,bundle:true,platform:'node',format:'esm',nodePaths:[resolve('node_modules')],absWorkingDir:process.cwd()});
writeFileSync(hostFile,"import {parentPort} from 'node:worker_threads';\nglobalThis.self=globalThis;\nglobalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);\nawait import("+JSON.stringify(pathToFileURL(workerFile).href)+");\nparentPort.on('message',data=>self.onmessage({data}));\nparentPort.postMessage({type:'boot'});\n");
const worker=new Worker(hostFile);type Message={type:string;[k:string]:any};let receive:(m:Message)=>void=()=>{};
worker.on('message',m=>receive(m));await new Promise<void>((yes,no)=>{receive=m=>{if(m.type==='boot')yes();};worker.once('error',no);});
async function command(msg:Record<string,unknown>,interrupt?:{on:string;msg:Record<string,unknown>|Record<string,unknown>[]}){
 const messages:Message[]=[];return new Promise<Message[]>((yes,no)=>{
  const timer=setTimeout(()=>no(Error('Worker timeout '+msg.type)),90000);let sent=false;
  receive=m=>{messages.push(m);if(interrupt&&!sent&&m.type===interrupt.on){sent=true;for(const a of Array.isArray(interrupt.msg)?interrupt.msg:[interrupt.msg])worker.postMessage(a);}if(m.type==='error'){clearTimeout(timer);no(Error(m.text));}if(m.type==='ready'){
   // A painted frame may be followed by its ready before the newly posted Esc
   // reaches the worker. Await the cancellation's own acknowledgement.
   if(sent&&!Array.isArray(interrupt?.msg)&&interrupt?.msg.type==='cancel'&&!messages.some(a=>a.type==='cancelled'))return;
   clearTimeout(timer);yes(messages);
  }};worker.postMessage(msg);
 });
}
const snap=async()=>(await command({type:'snapshot'})).find(m=>m.type==='snapshot')!.map as QuakeMap;
const intent={path:[{x:0,y:64},{x:127,y:64}],side:1},settings={...DEFAULTS,seed:18};
async function complete(){let operationMessage:Message|undefined;for(let k=0;k<7;k++){const m=await command({type:'advance'});operationMessage=m.find(a=>a.type==='operation')??operationMessage;}assert.ok(operationMessage);return operationMessage;}
const passed:string[]=[],measurements:Record<string,unknown>[]=[];
const pass=(name:string)=>{passed.push(name);console.log('PASS '+name);};
try{
 const load=await command({type:'load',id:'fixture:river:128'}),before=await snap();assert.ok(load.some(m=>m.type==='chunk'));assert.ok(load.some(m=>m.type==='lighting'));pass('actual worker builds transferable clean terrain, water and object meshes');
 const t=performance.now(),begun=await command({type:'start',settings,intent});assert.ok(begun.some(m=>m.type==='started'));assert.notDeepEqual((await snap()).heights,before.heights);measurements.push({case:'first changed frame',ms:performance.now()-t});
 const finish=await complete(),op=finish.op as QuakeOperation,final=await snap(),water=canonicalSettle(modelFor(final));assert.deepEqual(final.water.depth,water.depth);assert.deepEqual(final.water.contamination,water.contamination);pass('live fronts finish in one operation with exact repository canonical water');
 await command({type:'undo'});assert.deepEqual(await snap(),before);await command({type:'redo'});assert.deepEqual(await snap(),final);assert.deepEqual(applyOperation(before,JSON.parse(JSON.stringify(op))),final);pass('one undo/redo restores every terrain, object, fallen tree and water byte');
 await command({type:'undo'});
 const cancelled=await command({type:'start',settings,intent},{on:'started',msg:{type:'cancel'}});assert.ok(cancelled.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),before);pass('Esc interrupts sliced planning and leaves no history entry');
 await command({type:'start',settings,intent});const cancelMesh=await command({type:'advance'},{on:'chunk',msg:{type:'undo'}});assert.ok(cancelMesh.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),before);pass('Undo interrupts chunk generation and restores the entire prior map');
 await command({type:'start',settings,intent});for(let k=0;k<6;k++)await command({type:'advance'});
 const cancelledWater=await command({type:'advance'},{on:'settling',msg:{type:'cancel'}});assert.ok(cancelledWater.some(m=>m.type==='cancelled'));assert.ok(!cancelledWater.some(m=>m.type==='operation'));assert.deepEqual(await snap(),before);pass('Esc cancels canonical settling without recording partial changes');
 const json=(v:unknown)=>JSON.parse(JSON.stringify(v,(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v));
 await command({type:'replay',bundle:json({format:1,base:before,quakeBase:before,operation:op})});assert.deepEqual(await snap(),final);
 await command({type:'reroll'});const alt=await complete(),altMap=await snap(),reference=quake(before,{...settings,seed:19},intent as any).map;
 assert.deepEqual(altMap.heights,reference.heights);assert.notDeepEqual(altMap.heights,final.heights);assert.deepEqual(alt.quakeBase,before);assert.equal(alt.op.params.settings.seed,19);pass('Try another starts from original ground with a recorded new seed');
 await command({type:'undo'});assert.deepEqual(await snap(),final);await command({type:'redo'});assert.deepEqual(await snap(),altMap);
 await command({type:'reroll'});await command({type:'cancel'});assert.deepEqual(await snap(),altMap);pass('cancelling an alternative restores the kept quake exactly');
 await command({type:'load',id:'fixture:plain:128'});await command({type:'replay',bundle:json({format:1,base:final,quakeBase:before,operation:alt.op})});assert.deepEqual(await snap(),altMap);pass('saved alternative replays exactly on another loaded map');
 await command({type:'load',id:'fixture:river:256'});const bigBefore=await snap(),bigIntent={side:1,path:[{x:0,y:128},{x:255,y:128}]};
 const now=performance.now();await command({type:'start',settings,intent:bigIntent});let first=performance.now()-now;
 for(let k=0;k<6;k++)await command({type:'advance'});measurements.push({case:'256² rupture seven of eight fronts',firstMs:first,ms:performance.now()-now});await command({type:'cancel'});assert.deepEqual(await snap(),bigBefore);pass('256² real worker responds progressively and cancels exactly');
 await command({type:'load',id:'fixture:river:128'});const brushBefore=await snap();
 const short={side:1,path:[{x:38,y:64},{x:39,y:64}]},full={...intent,side:-1};
 const held=await command({type:'brush-begin',id:1,settings,intent:short});assert.ok(held.some(m=>m.type==='painted'));assert.ok(!held.some(m=>m.type==='operation'));assert.notDeepEqual((await snap()).heights,brushBefore.heights);
 await command({type:'brush-update',id:1,intent});assert.notDeepEqual((await snap()).heights,brushBefore.heights);
 await command({type:'brush-update',id:1,intent:full});assert.deepEqual((await snap()).heights,quake(brushBefore,settings,full as Intent).map.heights);
 const released=await command({type:'brush-end',id:1,intent:full});assert.equal(released.filter(m=>m.type==='operation').length,1);const brushAfter=await snap();
 assert.deepEqual(brushAfter.water.depth,canonicalSettle(modelFor(brushAfter)).depth);
 await command({type:'undo'});assert.deepEqual(await snap(),brushBefore);await command({type:'redo'});assert.deepEqual(await snap(),brushAfter);await command({type:'undo'});
 pass('held pen changes ground before release; X replans from base; release creates one exact undo');
 const burst=await command({type:'brush-begin',id:2,settings,intent:short},{on:'started',msg:[{type:'brush-update',id:2,intent},{type:'brush-update',id:2,intent:full},{type:'brush-end',id:2,intent:full}]});
 assert.equal(burst.filter(m=>m.type==='operation').length,1);assert.deepEqual(await snap(),brushAfter);await command({type:'undo'});
 pass('coalesced fast input and a release during preparation produce the same exact result');
 for(const on of ['started','chunk','painted']){
  const cancelled=await command({type:'brush-begin',id:3,settings,intent},{on,msg:{type:'cancel'}});
  assert.ok(cancelled.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),brushBefore);
 }
 pass('Esc cancels held brush during planning, mesh upload and live water without a history entry');
 await command({type:'load',id:'fixture:plain:32'});const randomBefore=await snap();let count=0,refused=0;
 for(let seed=0;seed<128;seed++){
  const x=hash(seed,1)*31,y=hash(seed,2)*31;
  const stroke:Intent={side:seed%2?1:-1,path:seed%3?[{x,y},{x:hash(seed,3)*31,y:hash(seed,4)*31}]:[{x,y},{x:Math.min(31,x+.01),y}]};
  if(faultReason(randomBefore,stroke)){refused++;continue;}
  const s={...settings,seed,mode:seed%2?'lift' as const:'slide' as const,power:seed%101};
  const result=await command({type:'brush-begin',id:100+seed,settings:s,intent:stroke},{on:'started',msg:{type:'brush-end',id:100+seed,intent:stroke}});
  const op=result.find(m=>m.type==='operation')?.op,finished=result.find(m=>m.type==='finished');
  assert.ok(op&&(s.mode==='slide'?finished?.stats.fullOffset>0:op.params.terrain.length),`worker stroke ${seed} must quake`);assert.equal(result.filter(m=>m.type==='finished').length,1);
  await command({type:'undo'});assert.deepEqual(await snap(),randomBefore);count++;
 }
 pass(`128 random real-worker strokes: ${count} completed quakes and exact undos, ${refused} visible start refusals`);
 writeFileSync('captures/worker-checks.json',JSON.stringify({passed,measurements},null,2)+'\n');console.log(JSON.stringify(measurements,null,2));
}finally{await worker.terminate();}

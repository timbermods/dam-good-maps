import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { carveWaterSettle } from './water';
import { canonicalSettle } from '../../src/core/sim/prefill';
import { CarveRun,modelFor,DEFAULTS,type CarveMap } from './engine';
import { applyOperation,type CarveOperation } from './operation';
const workerFile=resolve('.cache/worker-test.mjs'),hostFile=resolve('.cache/worker-host.mjs');
await build({entryPoints:[resolve('worker.ts')],outfile:workerFile,bundle:true,platform:'node',format:'esm',nodePaths:[resolve('node_modules')],absWorkingDir:process.cwd()});
writeFileSync(hostFile,"import {parentPort} from 'node:worker_threads';\nglobalThis.self=globalThis;\nglobalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);\nawait import("+JSON.stringify(pathToFileURL(workerFile).href)+");\nparentPort.on('message',data=>self.onmessage({data}));\nparentPort.postMessage({type:'boot'});\n");
const worker=new Worker(hostFile);
type Message={type:string;[k:string]:any};
let receive:(m:Message)=>void=()=>{};
worker.on('message',m=>receive(m));
await new Promise<void>((yes,no)=>{receive=m=>{if(m.type==='boot')yes();};worker.once('error',no);});
async function command(msg:Record<string,unknown>,interrupt?:{on:string;msg:Record<string,unknown>}){
 const messages:Message[]=[];
 return await new Promise<Message[]>((yes,no)=>{
  const timer=setTimeout(()=>no(new Error('Worker timeout for '+msg.type)),60000);let sent=false;
  receive=m=>{
   messages.push(m);
   if(interrupt&&!sent&&m.type===interrupt.on){sent=true;worker.postMessage(interrupt.msg);}
   if(m.type==='error'){clearTimeout(timer);no(new Error(m.text));}
   if(m.type==='ready'){clearTimeout(timer);yes(messages);}
  };worker.postMessage(msg);
 });
}
async function snap(){return (await command({type:'snapshot'})).find(m=>m.type==='snapshot')!.map as CarveMap;}
const passed:string[]=[];
try{
 const load=await command({type:'load',id:'fixture:mountain'}),before=await snap();
 assert.ok(load.some(m=>m.type==='lighting'&&m.checks.present));assert.ok(load.some(m=>m.type==='chunk'));
 passed.push('actual worker builds transferable clean meshes and live check status');
 const start=()=>command({type:'start',settings:DEFAULTS,intent:{origin:80*96+48}});
 await start();for(let i=0;i<25;i++)await command({type:'advance'});
 const paused=await snap();await new Promise(r=>setTimeout(r,70));assert.deepEqual(await snap(),paused);
 passed.push('idle pause preserves terrain, objects, water and deterministic duration');
 const done=await command({type:'stop'}),op=done.find(m=>m.type==='operation')!.op as CarveOperation;
 assert.equal(op.params.steps,25);assert.equal(op.params.intent?.origin,80*96+48);assert.equal(op.params.reason,'stopped');
 const final=await snap(),expected=canonicalSettle(modelFor(final));
 assert.deepEqual(final.water.depth,expected.depth);assert.deepEqual(final.water.contamination,expected.contamination);
 passed.push('Stop keeps exactly the acknowledged prefix and uses repository canonical water');
 await command({type:'undo'});assert.deepEqual(await snap(),before);
 await command({type:'redo'});assert.deepEqual(await snap(),final);
 assert.deepEqual(applyOperation(before,JSON.parse(JSON.stringify(op))),final);
 passed.push('source creation and every terrain/object/water change belong to one exact undo operation');
 await command({type:'undo'});await start();
 const cut=await command({type:'advance'},{on:'lighting',msg:{type:'cancel'}});
 assert.ok(cut.some(m=>m.type==='cancelled'));assert.ok(!cut.some(m=>m.type==='operation'));assert.deepEqual(await snap(),before);
 passed.push('Esc interrupts chunk generation and restores exact pre-carve state without a history entry');
 await start();for(let i=0;i<12;i++)await command({type:'advance'});
 const cancel=await command({type:'stop'},{on:'status',msg:{type:'undo'}});
 assert.ok(cancel.some(m=>m.type==='cancelled'));assert.ok(!cancel.some(m=>m.type==='operation'));assert.deepEqual(await snap(),before);
 passed.push('Undo interrupts final water settling and reverts the whole carve');
 const bundle=JSON.parse(JSON.stringify({format:1,base:before,operation:op},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v));
 await command({type:'load',id:'fixture:ridge'});await command({type:'replay',bundle});assert.deepEqual(await snap(),final);
 passed.push('portable saved result replays exactly on a different loaded map without erosion');
 const variantStart=await command({type:'reroll'}),variantSettings={...DEFAULTS,seed:1};
 assert.equal(variantStart.find(m=>m.type==='started')!.seed,1);
 const variantInitial=await snap(),reference=new CarveRun(before,variantSettings,{origin:80*96+48});
 assert.deepEqual(variantInitial,reference.map,'reroll must begin at original terrain, not the last canyon');
 for(let i=0;i<25;i++){await command({type:'advance'});reference.step();}
 const altDone=await command({type:'stop'}),altMessage=altDone.find(m=>m.type==='operation')!,altOp=altMessage.op as CarveOperation,alt=await snap();
 const altWater=canonicalSettle(modelFor(reference.map));
 assert.deepEqual(alt,{...reference.map,water:{depth:altWater.depth,contamination:altWater.contamination}});
 assert.notDeepEqual(alt.heights,final.heights);
 assert.deepEqual(altOp.params.intent,op.params.intent);assert.equal(altOp.params.settings.seed,1);assert.equal(altOp.params.reroll,true);
 assert.equal(alt.entities.filter(e=>e.id.startsWith('carve-source')).length,1);
 assert.deepEqual(altMessage.carveBase,before);
 passed.push('reroll preserves origin/settings and original geology, records a new seed, and replaces rather than stacks canyons');
 await command({type:'undo'});assert.deepEqual(await snap(),final);
 await command({type:'redo'});assert.deepEqual(await snap(),alt);
 await command({type:'reroll'});await command({type:'advance'});await command({type:'cancel'});
 assert.deepEqual(await snap(),alt);
 const third=await command({type:'reroll'});
 assert.equal(third.find(m=>m.type==='started')!.seed,3,'cancelled personality is not silently reused');
 await command({type:'cancel'});assert.deepEqual(await snap(),alt);
 passed.push('alternative undo/redo and cancellation restore the previously kept version exactly');
 const variantBundle=JSON.parse(JSON.stringify({format:1,base:altMessage.base,carveBase:altMessage.carveBase,operation:altOp},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v));
 await command({type:'load',id:'fixture:ridge'});await command({type:'replay',bundle:variantBundle});
 assert.deepEqual(await snap(),alt);
 await command({type:'undo'});assert.deepEqual(await snap(),final);
 await command({type:'redo'});assert.deepEqual(await snap(),alt);
 const portableReroll=await command({type:'reroll'});assert.equal(portableReroll.find(m=>m.type==='started')!.seed,2);
 assert.deepEqual((await snap()).heights,before.heights);await command({type:'cancel'});
 assert.deepEqual(await snap(),alt);
 passed.push('saved alternative replays without erosion and retains its original terrain for a further deterministic reroll');
 await command({type:'load',id:'fixture:ridge'});await command({type:'start',settings:{...DEFAULTS,power:95,mode:'aim',dry:true},intent:{origin:80*96+48,end:16*96+48}});
 let ended=false;for(let i=0;i<250&&!ended;i++)ended=(await command({type:'advance'})).some(m=>m.type==='finished');
 assert.ok(ended);const dry=await snap();assert.ok(!dry.entities.some(e=>e.id.startsWith('carve-source')));assert.ok(dry.water.depth.every(v=>v===0));
 passed.push('aim auto-finishes at its destination; dry canyon leaves no water source');
 await command({type:'load',id:'fixture:oxbow'});const oxbowBase=await snap();
 const oxbowSettings={...DEFAULTS,mode:'aim',power:85,width:6,wander:100,seed:1},oxbowIntent={origin:80*96+48,end:96+48};
 await command({type:'start',settings:oxbowSettings,intent:oxbowIntent});
 const oxbowReference=new CarveRun(oxbowBase,{...oxbowSettings,mode:'aim'},oxbowIntent);
 let oxbowEnd:Message[]=[];
 while(!oxbowReference.metrics.stable){oxbowReference.step();oxbowEnd=await command({type:'advance'});}
 const oxbowMap=await snap(),oxbowWater=carveWaterSettle(oxbowReference.map,oxbowReference);
 const oxbowOp=oxbowEnd.find(m=>m.type==='operation')!.op as CarveOperation;
 assert.equal(oxbowOp.params.waterSolve?.method,'retained-oxbow');
 assert.deepEqual(oxbowMap.water.depth,oxbowWater.depth);assert.deepEqual(oxbowMap.heights,oxbowReference.map.heights);
 await command({type:'undo'});assert.deepEqual(await snap(),oxbowBase);
 await command({type:'redo'});assert.deepEqual(await snap(),oxbowMap);
 passed.push('actual worker retains simulated oxbow water behind both sediment bars, then restores the entire lake with exact undo/redo');
 writeFileSync('captures/worker-checks.json',JSON.stringify({passed,operationBytes:JSON.stringify(op).length},null,2)+'\n');
 console.log(passed.map(p=>'PASS '+p).join('\n'));
}finally{await worker.terminate();}

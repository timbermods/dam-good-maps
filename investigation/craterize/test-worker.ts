import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { DEFAULTS, impact, settleImpact, type CraterMap } from './engine';
import { applyOperation, type CraterOperation } from './operation';
const workerFile=resolve('.cache/worker-test.mjs'),hostFile=resolve('.cache/worker-host.mjs');
await build({entryPoints:[resolve('worker.ts')],outfile:workerFile,bundle:true,platform:'node',format:'esm',nodePaths:[resolve('node_modules')],absWorkingDir:process.cwd()});
writeFileSync(hostFile,"import {parentPort} from 'node:worker_threads';\nglobalThis.self=globalThis;\nglobalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);\nawait import("+JSON.stringify(pathToFileURL(workerFile).href)+");\nparentPort.on('message',data=>self.onmessage({data}));\nparentPort.postMessage({type:'boot'});\n");
const worker=new Worker(hostFile);type Message={type:string;[k:string]:any};let receive:(m:Message)=>void=()=>{};
worker.on('message',m=>receive(m));await new Promise<void>((yes,no)=>{receive=m=>{if(m.type==='boot')yes();};worker.once('error',no);});
async function command(msg:Record<string,unknown>,interrupt?:{on:string;msg:Record<string,unknown>;occurrence?:number}){
 const messages:Message[]=[];return new Promise<Message[]>((yes,no)=>{
  const timer=setTimeout(()=>no(Error('Worker timeout: '+msg.type)),60000);let seen=0,sent=false;
  receive=m=>{messages.push(m);if(interrupt&&!sent&&m.type===interrupt.on&&++seen===(interrupt.occurrence??1)){sent=true;worker.postMessage(interrupt.msg);}
   if(m.type==='error'){clearTimeout(timer);no(Error(m.text));}if(m.type==='ready'){clearTimeout(timer);yes(messages);}};
  worker.postMessage(msg);
 });
}
async function snap(){return(await command({type:'snapshot'})).find(m=>m.type==='snapshot')!.map as CraterMap;}
const passed:string[]=[];const note=(s:string)=>{passed.push(s);console.log('PASS '+s);};
try{
 const loaded=await command({type:'load',id:'fixture:plain:128'}),before=await snap(),intent={origin:64*128+64};
 assert.ok(loaded.some(m=>m.type==='chunk')&&loaded.some(m=>m.type==='lighting'));note('Actual worker builds transferable clean-view meshes');
 const start=()=>command({type:'start',settings:DEFAULTS,intent});
 const begun=await start();assert.ok(begun.some(m=>m.type==='chunk'&&m.chunk.terrain.grow?.some((v:number)=>v!==0)));
 const plan=await snap(),reference=impact(before,DEFAULTS,intent);assert.deepEqual(plan,reference.map);note('Worker result matches model; GPU transition contains old and new land');
 const completed=await command({type:'finish'}),message=completed.find(m=>m.type==='operation')!,op=message.op as CraterOperation,final=await snap();
 settleImpact(reference.map);assert.deepEqual(final,reference.map);assert.deepEqual(applyOperation(before,JSON.parse(JSON.stringify(op))),final);note('Water and JSON operation match exact repository simulation result');
 await command({type:'undo'});assert.deepEqual(await snap(),before);await command({type:'redo'});assert.deepEqual(await snap(),final);note('Whole impact is one exact undo and redo step');
 const variant=await command({type:'reroll'});assert.equal(variant.find(m=>m.type==='started')!.settings.seed,1);
 const rerolled=await snap(),expected=impact(before,{...DEFAULTS,seed:1},intent).map;
 assert.deepEqual(rerolled,expected);await command({type:'finish'});const alternative=await snap();assert.notDeepEqual(alternative.heights,final.heights);
 await command({type:'undo'});assert.deepEqual(await snap(),final);await command({type:'redo'});assert.deepEqual(await snap(),alternative);note('Try another replaces from original terrain; undo returns the kept personality');
 await command({type:'reroll'});await command({type:'cancel'});assert.deepEqual(await snap(),alternative);
 const third=await command({type:'reroll'});assert.equal(third.find(m=>m.type==='started')!.settings.seed,3);await command({type:'cancel'});note('Cancelled variation restores prior result and consumes its seed');
 for(const phase of ['started','lighting','chunk']){
  const cancelled=await command({type:'start',settings:DEFAULTS,intent:{origin:70*128+74}},{on:phase,msg:{type:'cancel'}});
  assert.ok(cancelled.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),alternative);
 }note('Esc interrupts planning and mesh slices without adding history');
 await start();const waterCancel=await command({type:'finish'},{on:'settling',msg:{type:'undo'}});
 assert.ok(waterCancel.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),alternative);note('Undo during water settling restores the complete pre-impact map');
 await start();const lastFrameCancel=await command({type:'finish'},{on:'lighting',msg:{type:'cancel'}});
 assert.ok(lastFrameCancel.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),alternative);note('Cancellation during final lighting cannot accidentally commit history');
 const bundle=JSON.parse(JSON.stringify({format:1,base:message.base,impactBase:message.impactBase,operation:op},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as unknown as number[]):v));
 await command({type:'load',id:'fixture:plain:256'});await command({type:'replay',bundle});assert.deepEqual(await snap(),final);
 await command({type:'undo'});assert.deepEqual(await snap(),before);await command({type:'redo'});assert.deepEqual(await snap(),final);
 await command({type:'reroll'});assert.deepEqual((await snap()).heights,expected.heights);await command({type:'cancel'});note('Portable replay retains the original land, exact undo and deterministic reroll');
 writeFileSync('captures/worker-checks.json',JSON.stringify({passed,operationBytes:JSON.stringify(op).length},null,2)+'\n');
}finally{await worker.terminate();}

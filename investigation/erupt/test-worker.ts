import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { DEFAULTS, erupt, waterRun, type EruptMap } from './engine';
import { applyOperation } from './operation';
const workerFile=resolve('.cache/worker-test.mjs'),hostFile=resolve('.cache/worker-host.mjs');
await build({entryPoints:[resolve('worker.ts')],outfile:workerFile,bundle:true,platform:'node',format:'esm',nodePaths:[resolve('node_modules')],absWorkingDir:process.cwd()});
writeFileSync(hostFile,"import {parentPort} from 'node:worker_threads';\nglobalThis.self=globalThis;\nglobalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);\nawait import("+JSON.stringify(pathToFileURL(workerFile).href)+");\nparentPort.on('message',data=>self.onmessage({data}));\nparentPort.postMessage({type:'boot'});");
const worker=new Worker(hostFile);type Message={type:string;[k:string]:any};let receive:(m:Message)=>void=()=>{};
worker.on('message',m=>receive(m));await new Promise<void>((yes,no)=>{receive=m=>{if(m.type==='boot')yes();};worker.once('error',no);});
async function command(msg:Record<string,unknown>,interrupt?:string){
 const messages:Message[]=[];return new Promise<Message[]>((yes,no)=>{
  const timer=setTimeout(()=>no(Error('Worker timeout: '+msg.type)),90000);let sent=false;
  receive=m=>{messages.push(m);if(interrupt&&!sent&&m.type===interrupt){sent=true;worker.postMessage({type:'cancel'});}
   if(m.type==='error'){clearTimeout(timer);no(Error(m.text));}if(m.type==='ready'){clearTimeout(timer);yes(messages);}};
  worker.postMessage(msg);
 });
}
async function snap(){return(await command({type:'snapshot'})).find(m=>m.type==='snapshot')!.map as EruptMap;}
const passed:string[]=[];const note=(s:string)=>{passed.push(s);console.log('PASS '+s);};
try{
 await command({type:'load',id:'fixture:plain:128'});const base=await snap(),intent={origin:64*128+64};
 await command({type:'start',settings:DEFAULTS,intent});
 const stage=await command({type:'advance',progress:.5});assert(stage.some(m=>m.type==='chunk'&&m.chunk.terrain.grow?.some((v:number)=>v!==0)));
 note('Actual worker sends transferable morph meshes during rise');
 const completed=await command({type:'finish'}),saved=completed.find(m=>m.type==='operation')!,final=await snap(),reference=erupt(base,DEFAULTS,intent).map;
 const run=waterRun(reference);let result=run.advance(Infinity);while(!result)result=run.advance(Infinity);reference.water={depth:result.depth,contamination:result.contamination};
 assert.deepEqual(final,reference);assert.deepEqual(applyOperation(base,JSON.parse(JSON.stringify(saved.op))),final);
 note('Final water exactly equals canonical repository settle');
 await command({type:'undo'});assert.deepEqual(await snap(),base);await command({type:'redo'});assert.deepEqual(await snap(),final);
 note('One undo/redo restores terrain, water, entities, fallen trees and lava');
 await command({type:'reroll'});await command({type:'finish'});const variant=await snap();assert.notDeepEqual(variant.heights,final.heights);
 await command({type:'undo'});assert.deepEqual(await snap(),final);await command({type:'redo'});assert.deepEqual(await snap(),variant);
 note('Try another replaces from the original base and is exactly undoable');
 await command({type:'start',settings:DEFAULTS,intent},'started');assert.deepEqual(await snap(),variant);
 for(const phase of ['lighting','chunk']){
   await command({type:'start',settings:DEFAULTS,intent});await command({type:'advance',progress:.5},phase);assert.deepEqual(await snap(),variant);
 }
 await command({type:'start',settings:DEFAULTS,intent});await command({type:'finish'},'settling');assert.deepEqual(await snap(),variant);
 note('Cancel works during planning, mesh construction and canonical water');
 const bundle=JSON.parse(JSON.stringify({format:1,base:saved.base,eruptionBase:saved.eruptionBase,operation:saved.op},(_k,v)=>ArrayBuffer.isView(v)?Array.from(v as any):v));
 await command({type:'load',id:'fixture:plain:256'});await command({type:'replay',bundle});assert.deepEqual(await snap(),final);
 await command({type:'undo'});assert.deepEqual(await snap(),base);await command({type:'redo'});assert.deepEqual(await snap(),final);
 note('Portable JSON replay preserves exact history across map sizes');
 writeFileSync('captures/worker-checks.json',JSON.stringify({passed,operationBytes:JSON.stringify(saved.op).length},null,2)+'\n');
}finally{await worker.terminate();}

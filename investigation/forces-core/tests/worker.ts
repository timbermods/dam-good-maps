import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync,mkdirSync} from 'node:fs';
import {DEFAULTS,type ForceRequest} from '../verbs';
import {applyOperation} from '../core/operation';
import {canonicalSettle} from '../../../src/core/sim/prefill';
import {modelFor,snapshot,json} from '../core/map';
mkdirSync('local/cache',{recursive:true});mkdirSync('checks',{recursive:true});
const workerFile=resolve('local/cache/worker.mjs'),hostFile=resolve('local/cache/host.mjs');
await build({entryPoints:['worker.ts'],outfile:workerFile,bundle:true,platform:'node',format:'esm',nodePaths:[resolve('node_modules')]});
writeFileSync(hostFile,"import {parentPort} from 'node:worker_threads';globalThis.self=globalThis;globalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);await import("+JSON.stringify(pathToFileURL(workerFile).href)+");parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'boot'});");
const worker=new Worker(hostFile);let receive:(m:any)=>void=()=>{};worker.on('message',m=>receive(m));
await new Promise<void>((yes,no)=>{receive=m=>{if(m.type==='boot')yes();};worker.once('error',no);});
async function command(msg:any,interrupt?:{on:string;messages:any[]},allowError=false){
 return new Promise<any[]>((yes,no)=>{
  const found:any[]=[];let sent=false;const timer=setTimeout(()=>no(Error('timeout '+msg.type)),120000);
  receive=m=>{
   found.push(m);
   if(interrupt&&!sent&&m.type===interrupt.on){sent=true;interrupt.messages.forEach(x=>worker.postMessage(x));}
   if(m.type==='error'&&!allowError){clearTimeout(timer);no(Error(m.text));}
   if(m.type==='ready'||msg.type==='snapshot'&&m.type==='snapshot'){
    if(sent&&interrupt?.messages.some(x=>x.type==='cancel'||x.type==='undo')&&!found.some(x=>x.type==='cancelled'))return;
    clearTimeout(timer);yes(found);
   }
  };worker.postMessage(msg);
 });
}
const snap=async()=>(await command({type:'snapshot'})).find(m=>m.type==='snapshot').map;
async function finish(){const all:any[]=[];for(let k=0;k<10;k++){const m=await command({type:'advance'});all.push(...m);if(m.some(x=>x.type==='finished'))return all;}throw Error('not finished');}
const passed:string[]=[],timings:any[]=[];const pass=(s:string)=>{passed.push(s);console.log('PASS '+s);};
const req:ForceRequest={verb:'quake',settings:{...DEFAULTS.quake,seed:18},intent:{path:[{x:0,y:70},{x:127,y:70}],side:1}};
try{
 const loaded=await command({type:'load',id:'fixture:river:128'}),base=await snap();
 assert(loaded.some(m=>m.type==='chunk'));assert(loaded.some(m=>m.type==='lighting'));
 const initial=await command({type:'start',request:req});assert.notDeepEqual((await snap()).heights,base.heights);
 const all=await finish(),op=all.find(m=>m.type==='operation').op,final=await snap();
 assert.deepEqual(final.water.depth,canonicalSettle(modelFor(final)).depth);assert.deepEqual(applyOperation(base,json(op)),final);
 await command({type:'undo'});assert.deepEqual(await snap(),base);await command({type:'redo'});assert.deepEqual(await snap(),final);
 pass('Single real worker: progressive meshes, exact settled water and one result operation');
 for(const on of ['started','chunk']){
  const cancelled=await command({type:'start',request:req},{on,messages:[{type:'cancel'}]});
  assert(cancelled.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),final);
 }
 // Idle active undo cancels just the current event; it must not undo the prior quake.
 await command({type:'start',request:req});await command({type:'undo'});assert.deepEqual(await snap(),final);
 pass('Esc during preparation/chunks and idle-active undo preserve the preceding history entry');
 await command({type:'start',request:req});for(let k=0;k<6;k++)await command({type:'advance'});
 const cancelled=await command({type:'advance'},{on:'settling',messages:[{type:'cancel'}]});
 assert(!cancelled.some(m=>m.type==='operation'));assert.deepEqual(await snap(),final);
 pass('Cancellation interrupts canonical water without committing or losing earlier forces');
 await command({type:'reroll'});await command({type:'cancel'});assert.deepEqual(await snap(),final);
 await command({type:'reroll'});const alt=await finish();assert.equal(alt.find(m=>m.type==='operation').op.params.request.settings.seed,20);
 await command({type:'undo'});assert.deepEqual(await snap(),final);
 pass('Cancelled Try another consumes its seed, and alternatives remain exactly undoable');
 await command({type:'load',id:'fixture:slide:128'});const brushBase=await snap();
 const short={...req,settings:{...DEFAULTS.quake,mode:'slide',power:100},intent:{path:[{x:36,y:64},{x:37,y:64}],side:1}};
 const full={...short,intent:{path:[{x:20,y:64},{x:109,y:64}],side:-1}};
 const brush=await command({type:'brush-begin',id:1,request:short},{on:'started',messages:[{type:'brush-update',id:1,request:full},{type:'brush-end',id:1,request:full}]});
 assert.equal(brush.filter(m=>m.type==='operation').length,1);
 assert(brush.some(m=>m.type==='chunk'&&m.chunk.terrain.glide?.some((v:number)=>Math.abs(v)>=20)));
 const after=await snap();await command({type:'undo'});assert.deepEqual(await snap(),brushBase);await command({type:'redo'});assert.deepEqual(await snap(),after);
 pass('Coalesced painted Slide + X + release emits full 20-tile glides and one exact undo');
 const project=(await command({type:'export'})).find(m=>m.type==='project').project;
 await command({type:'load',id:'fixture:plain:64'});await command({type:'import',project});assert.deepEqual(await snap(),after);
 const bad=json(project);bad.operations[0].params.terrain[0][2]=99;
 await command({type:'import',project:bad},undefined,true);assert.deepEqual(await snap(),after);
 pass('Saved mixed state opens across map sizes; malformed replay is atomic');
 await command({type:'load',id:'fixture:plain:64'});const crossingBase=await snap();
 const crossing={verb:'erupt',settings:{...DEFAULTS.erupt,power:15},intent:{origin:48*64+48}};
 await command({type:'start',action:700,request:crossing});for(let k=0;k<6;k++)await command({type:'advance'});
 const late=await command({type:'advance'},{on:'finished',messages:[{type:'cancel',action:700}]});
 assert(late.some(m=>m.type==='cancelled'));assert.deepEqual(await snap(),crossingBase);
 pass('Esc crossing the completion message reverts only its matching event');

 await command({type:'load',id:'fixture:river:256'});const big=await snap(),large={...req,intent:{path:[{x:0,y:140},{x:255,y:140}],side:1}};
 const now=performance.now();let first=await command({type:'start',request:large});timings.push({case:'256² first acknowledged frame',ms:performance.now()-now});
 const cancelAt=performance.now();await command({type:'cancel'});timings.push({case:'256² cancellation including restored meshes',ms:performance.now()-cancelAt});assert.deepEqual(await snap(),big);
 pass('256² worker shows progressive chunks and cancels back to every original byte');
 writeFileSync('checks/worker.json',JSON.stringify({passed,timings},null,2)+'\n');
}finally{await worker.terminate();}

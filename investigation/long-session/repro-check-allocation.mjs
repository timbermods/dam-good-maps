// Verification is deliberately outside the recorded hour.
import {chromium} from '@playwright/test';
import {installProbe} from './probe.mjs';
import {summarizeAllocation} from './allocation-summary.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root='investigation/long-session';const results=[];const run=process.env.DGM_ALLOCATION_RUN||Date.now().toString();if(!/^[a-z0-9-]+$/.test(run))throw new Error('Invalid run name');
for(const [name,port]of [['baseline',4200],['fixed',4201]]){
 const local=resolve(root+'/local/allocation/'+run+'/'+name);mkdirSync(local+'/temp',{recursive:true});
 const context=await chromium.launchPersistentContext(local+'/profile',{channel:'chrome',headless:false,viewport:{width:1600,height:1000},env:{...process.env,TEMP:local+'/temp',TMP:local+'/temp'},args:['--renderer-process-limit=1','--num-raster-threads=2','--disable-background-timer-throttling','--disable-renderer-backgrounding','--enable-precise-memory-info']});
 await context.addInitScript(`(${installProbe.toString()})()`);
 const page=context.pages()[0];page.setDefaultTimeout(120000);
 await page.goto(`http://localhost:${port}/dam-good-maps/#s=4264&z=256&d=n&t=riverValley`);
 await page.waitForFunction(()=>window.dgmEditor&&window.dgm3d,null,{timeout:240000});await page.evaluate(()=>window.dgmEditor.idle());
 const checks=page.workers().find(w=>/checks\.worker/.test(w.url()));if(!checks)throw new Error('No checks worker');
 await page.evaluate(()=>window.dgmEditor.worker.backgroundCheck());
 const initial=await checks.evaluate(()=>__allocationProbe.snapshot()),iterations=[];
 for(let i=0;i<12;i++){
  const water=await page.evaluate(async i=>{
   await window.dgmEditor.edit({op:'brush',params:{tool:i%2?'lower':'raise',size:8,strength:10,dabs:[360,480,376,488,392,496]}},'allocation reproduction '+i);
   await window.dgmEditor.idle();
   let r;while(!r)r=await window.dgmEditor.worker.backgroundCheck();
   await window.dgmEditor.worker.whenWaterSettles();
   const settled=await window.dgmEditor.worker.sessionView();
   let hash=2166136261,bytes=0;
   const visit=x=>{if(ArrayBuffer.isView(x)){const b=new Uint8Array(x.buffer,x.byteOffset,x.byteLength);bytes+=b.length;for(const v of b)hash=Math.imul(hash^v,16777619)>>>0;}else if(x&&typeof x==='object')for(const k of Object.keys(x).sort())visit(x[k]);};
   visit(settled.view.water);visit(settled.view.soil);visit(settled.view.heights);return {settledBytes:bytes,settledHash:hash};
  },i);
  const allocation=await checks.evaluate(()=>__allocationProbe.snapshot());iterations.push({iteration:i+1,...water,allocation});console.log(JSON.stringify({name,iteration:i+1,...water,unused:allocation.unusedCount-initial.unusedCount,outstanding:allocation.outstanding,wasm:allocation.wasm}));
 }
 const beforeGC=await checks.evaluate(()=>__allocationProbe.snapshot());
 // An explicit post-experiment collect verifies weakly tracked jobs are collectible; it is never part of the hour.
 const cdp=await context.browser().newBrowserCDPSession();
 const {targetInfos}=await cdp.send('Target.getTargets');const target=targetInfos.find(t=>t.type==='worker'&&t.url===checks.url());
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 const collected=new Promise((resolve,reject)=>cdp.on('Target.receivedMessageFromTarget',e=>{if(e.sessionId!==sessionId)return;const m=JSON.parse(e.message);if(m.id===1)m.error?reject(new Error(JSON.stringify(m.error))):resolve();}));
 await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:1,method:'HeapProfiler.collectGarbage'})});await collected;
 await cdp.send('Target.detachFromTarget',{sessionId});
 const final=await checks.evaluate(()=>__allocationProbe.snapshot());
 results.push({name,initial,iterations,beforeGC,final});writeFileSync(root+'/allocation-results.json',JSON.stringify(results,null,2)+'\n');await context.close();
}
const [a,b]=results;const added=x=>x.beforeGC.unusedCount-x.initial.unusedCount;
if(!(added(a)>0&&added(b)===0))throw new Error('Duplicate allocation was not reproduced and eliminated');
if(JSON.stringify(a.iterations.map(x=>[x.settledBytes,x.settledHash]))!==JSON.stringify(b.iterations.map(x=>[x.settledBytes,x.settledHash])))throw new Error('Canonical water bytes differ');
summarizeAllocation(results);
console.log('VERIFIED',JSON.stringify({baselineUnused:added(a),fixedUnused:added(b),canonicalWaterHashesIdentical:true}));

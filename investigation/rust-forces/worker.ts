import {job,randomJob,encode,decode,bridge,referenceWithRecord,reference,typedResult,exportedBytes,F} from './api';
const ready=fetch(new URL(self.location.href).searchParams.has('bench')?'./forces-bench.wasm':'./forces.wasm').then(r=>r.arrayBuffer()).then(bridge);
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function diff(a:any,b:any,p=''):any{if(Object.is(a,b))return null;if(!a||!b||typeof a!=='object'||typeof b!=='object')return {p,a,b};if(Object.keys(a).sort().join('|')!==Object.keys(b).sort().join('|'))return {p,keysA:Object.keys(a),keysB:Object.keys(b)};for(const k of Object.keys(a)){const d=diff(a[k],b[k],p+'.'+k);if(d)return d;}return null;}
self.onmessage=async(ev)=>{const d=ev.data;let failure:any={};try{
 const rust=await ready;
 const j=(d.random?randomJob:job)(d.verb,d.size,d.k);
 if(d.bench && d.verb!=='footprint')j.settings.power=100;
 if(d.bench && (d.verb==='erupt'||d.verb==='craterize'))j.settings.size=null;
 const expectedResult=referenceWithRecord(j),expected=encode(expectedResult),expectedExport=d.exports&&d.verb!=='footprint'&&!expectedResult.error?exportedBytes(j,expectedResult.map):null;if(d.bench)j.trace=false;
 failure={job:j,expected};const preWarmup:any={ts:[],wasm:[]};let result;for(let p=0;p<(d.bench?3:0);p++){const t=performance.now();result=referenceWithRecord(j);preWarmup.ts.push(performance.now()-t);}
 const row:any={id:`${d.verb}/${d.size}/${d.k}/${d.random?'random':'fixture'}`,sha256:await hash(expected),bytes:expected.length,typedRecordsChecked:true,recordFields:expectedResult.error||d.verb==='footprint'?[]:Object.keys(expectedResult).sort(),productWriterChecked:!!expectedExport,error:expectedResult.error??null};
 const task=rust.create(j);try{
  for(let p=0;p<(d.bench?3:1);p++){task.reset();const start=d.bench?performance.now():0;try{task.plan();}catch(error){if(!decode(expected).error)throw error;}task.regions;task.records(d.verb);task.geometry;task.objects;if(d.bench)preWarmup.wasm.push(performance.now()-start);}if(d.bench)row.preWarmup=preWarmup;
  if(d.bench){const times:any={ts:[],wasmPlan:[],wasmCompute:[]},batch=d.verb==='footprint'?256:1;for(let w=0;w<5;w++){task.reset();task.plan();referenceWithRecord(j);}for(let r=0;r<d.reps;r++){task.reset();let t=performance.now();for(let k=0;k<batch;k++)referenceWithRecord(j);times.ts.push((performance.now()-t)/batch);let compute=0;t=performance.now();for(let k=0;k<batch;k++){task.configure(d.verb,j.settings,j.intent,j.margin??0);task.plan();task.result(d.verb);compute+=task.computeMs;}times.wasmPlan.push((performance.now()-t)/batch);times.wasmCompute.push(compute/batch);}row.times=times;row.batch=batch;}
  // Only after all timed operations: serialization must not perturb the next
  // operation's allocator/engine state or cause tier-compilation contention.
  const actual=task.pack();failure.actual=actual;if(expectedResult.error){const m=task.map;if(!same(encode([m.heights,m.lava,m.water,m.rockLayers,m.keep]),encode([j.map.heights,j.map.lava,j.map.water,j.map.rockLayers,j.keep])))throw Error('Refusal changed retained map');}if(!decode(expected).error && !same(actual,encode(typedResult(task,{...j,trace:true},F))))throw Error("Typed interface "+JSON.stringify(diff(decode(actual),typedResult(task,{...j,trace:true},F))));if(!same(expected,actual))throw Error('Identity '+JSON.stringify(diff(decode(expected),decode(actual))));
  if(expectedExport){const actualExport=exportedBytes(j,typedResult(task,{...j,trace:true},F).map);if(!same(expectedExport,actualExport))throw Error('Wasm export bytes');row.exportSha256=await hash(expectedExport);}
 }finally{task.dispose();}
 self.postMessage({ok:true,...row});
 }catch(e){if(failure.job){failure.input=encode(failure.job,false);delete failure.job;}const q=new URL(self.location.href).searchParams,prefix=`failure-${q.get('engine')}-${d.verb}-${d.size}-${d.k}`;for(const key of Object.keys(failure))await fetch('/'+prefix+'.'+key+'.bin',{method:'POST',body:failure[key]});self.postMessage({ok:false,error:String(e),descriptor:d});}};

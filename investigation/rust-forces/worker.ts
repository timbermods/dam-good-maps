import {job,randomJob,encode,decode,bridge,referenceWithRecord,reference} from './api';
const ready=fetch('./forces.wasm').then(r=>r.arrayBuffer()).then(bridge);
const hash=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b as BufferSource)),v=>v.toString(16).padStart(2,'0')).join('');
const same=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
function diff(a:any,b:any,p=''):any{if(Object.is(a,b))return null;if(!a||!b||typeof a!=='object'||typeof b!=='object')return {p,a,b};if(Object.keys(a).sort().join('|')!==Object.keys(b).sort().join('|'))return {p,keysA:Object.keys(a),keysB:Object.keys(b)};for(const k of Object.keys(a)){const d=diff(a[k],b[k],p+'.'+k);if(d)return d;}return null;}
self.onmessage=async(ev)=>{const d=ev.data;try{
 const rust=await ready;
 const j=(d.random?randomJob:job)(d.verb,d.size,d.k);
 if(d.bench && (d.verb==='erupt'||d.verb==='craterize'))j.settings.size=null;
 const input=encode(j),expected=encode(referenceWithRecord(j)),actual=rust(input);
 if(!same(expected,actual))throw Error('Identity '+JSON.stringify(diff(decode(expected),decode(actual))));
 const row:any={id:`${d.verb}/${d.size}/${d.k}/${d.random?'random':'fixture'}`,sha256:await hash(expected),bytes:expected.length};
 if(d.bench){const times:any={ts:[],wasmPlan:[],wasmBridge:[]},task=rust.prepare(input);try{task.plan();referenceWithRecord(j);for(let r=0;r<d.reps;r++){let t=performance.now();referenceWithRecord(j);times.ts.push(performance.now()-t);t=performance.now();task.plan();times.wasmPlan.push(performance.now()-t);t=performance.now();const bytes=rust(input);times.wasmBridge.push(performance.now()-t);if(!same(expected,bytes))throw Error('Timed result changed');}}finally{task.dispose();}row.times=times;}
 self.postMessage({ok:true,...row});
 }catch(e){self.postMessage({ok:false,error:String(e),descriptor:d});}};

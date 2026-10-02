import * as api from './local/api.js';
import * as bridge from './local/bridge.js';
import {unpack,exact} from './codec.mjs';
import {frames,higher,argsOf} from './replay.mjs';
import {analysisProfile,analysisTime} from './generation-profile.mjs';
await bridge.installRustAnalysis(await (await fetch('analysis.wasm')).arrayBuffer());
const names=Object.fromEntries(Object.entries(bridge.OPS).map(([k,v])=>[v,k]));
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
function equal(a,b,label){const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);if(x.length!==y.length)throw Error(label+' length');for(let i=0;i<x.length;i++)if(x[i]!==y[i])throw Error(label+' byte '+i);}
const hook={enter(){},leave(){},replace:(name,args)=>bridge.replace(name,args)};
self.onmessage=async ({data:c})=>{try{
 if(c.generate){const rows=[];globalThis.__ra=null;api.generate(api.makeSpec({seed:1,theme:'delta',size:{x:48,y:48}}));
 for(let rep=0;rep<c.reps;rep++){const pair=[];for(const backend of rep%2?['wasm','typescript']:['typescript','wasm']){const profile=analysisProfile(bridge,backend);globalThis.__ra=profile;const t=performance.now();const r=api.generate(api.makeSpec({theme:c.theme,seed:1,size:{x:256,y:256}}));const ms=performance.now()-t;globalThis.__ra=null;const analysis=analysisTime(profile.totals);pair.push({rep,backend,ms,analysis,share:analysis/ms,totals:profile.totals,identity:await digest(exact({report:r.report,analysis:r.analysis,outcomes:r.outcomes,bytes:r.bytes}))});}
 if(pair[0].identity!==pair[1].identity)throw Error('complete generation identity '+c.theme);rows.push(...pair);}self.postMessage({ok:true,id:c.theme,rows});return;}
 let calls=0;const kernelTimes=[];
 for(const suffix of c.roomOnly?['.room']:c.hasRoom?['','.room']:['']){
 const input=frames(new Uint8Array(await (await fetch('cases/'+c.id+suffix+'.in')).arrayBuffer()));
 const expected=frames(new Uint8Array(await (await fetch('cases/'+c.id+suffix+'.expected')).arrayBuffer()));
 if(input.length!==expected.length)throw Error('frame count');
 for(let i=0;i<input.length;i++){equal(bridge.run(input[i]),expected[i],c.id+'/'+suffix+'/'+i);calls++;}
 if(c.bench){const picked=new Map();for(let i=0;i<input.length;i++){const op=input[i][0];if(!picked.has(op)||input[i].length>input[picked.get(op)].length)picked.set(op,i);}
 for(const[op,i]of picked){const name=names[op],args=argsOf(input[i]);globalThis.__ra=null;api[name](...args);bridge.invoke(name,args);const before=[],after=[];
 for(let rep=0;rep<c.reps;rep++){let t=performance.now();const reference=api[name](...args);before.push(performance.now()-t);t=performance.now();const actual=bridge.invoke(name,args);after.push(performance.now()-t);if(exact(actual)!==exact(reference))throw Error(name+' timed identity');}kernelTimes.push({name,before,after});}}
 }
 let high=null,analyses=[];
 if(!c.roomOnly){const payload=unpack(await (await fetch('cases/'+c.id+'.json.gz')).json());globalThis.__ra=null;const baseline=higher(api,payload);globalThis.__ra=hook;const actual=higher(api,payload);globalThis.__ra=null;if(actual!==baseline)throw Error('higher results within engine');high=await digest(actual);
 if(c.bench){for(const[name,fn,args]of [['checks',api.validateMap,payload.fileBytes?[api.readTimber(payload.fileBytes),payload.opts]:null],['measures',api.measure,payload.measurable?[payload.measurable]:null],['outcomes',api.outcomesOf,payload.outcomeInput?[payload.outcomeInput]:null]]){if(!args)continue;const before=[],after=[];for(let rep=0;rep<c.reps;rep++){globalThis.__ra=null;let t=performance.now();const b=fn(...args);before.push(performance.now()-t);globalThis.__ra=hook;t=performance.now();const a=fn(...args);after.push(performance.now()-t);globalThis.__ra=null;if(exact(a)!==exact(b))throw Error(name+' timing identity');}analyses.push({name,before,after});}}
 }
 self.postMessage({ok:true,id:c.id,calls,high,hasRoom:c.hasRoom,kernelTimes,analyses});
 }catch(e){globalThis.__ra=null;self.postMessage({ok:false,id:c.id,error:e.stack});}};
self.postMessage({ready:true});

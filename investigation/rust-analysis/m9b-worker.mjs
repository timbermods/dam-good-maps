import * as bridge from './local/bridge.js';
import {measureCaptured} from './local/m9b-captured.ts';
import {unpack,exact,untimed} from './codec.mjs';
await bridge.installRustAnalysis(await (await fetch('analysis.wasm')).arrayBuffer());
const run=(p,backend)=>{globalThis.__ra=backend==='typescript'?null:{enter(){},leave(){},replace:(n,a)=>backend==='all-nine'?bridge.invoke(n,a):bridge.replace(n,a)};try{return measureCaptured(p.result,p.theme,p.seed,p.size,p.generation);}finally{globalThis.__ra=null;}};
self.onmessage=async({data:c})=>{try{const p=unpack(await(await fetch('cases/'+c.id+'.m9b.json.gz')).json());for(const backend of ['typescript','wasm','all-nine']){if(exact(untimed(run(p,backend)))!==exact(p.measure))throw Error(c.id+'/'+backend+' full M9b measure row');}
 const times=[];if(c.bench){run(p,'typescript');run(p,'wasm');const before=[],after=[];for(let rep=0;rep<3;rep++){let t=performance.now();run(p,'typescript');before.push(performance.now()-t);t=performance.now();run(p,'wasm');after.push(performance.now()-t);}times.push({name:'m9bMeasures',before,after});}
 self.postMessage({ok:true,id:c.id,identity:true,times});
 }catch(e){self.postMessage({ok:false,error:e.message+'\n'+e.stack});}};
self.postMessage({ready:true});

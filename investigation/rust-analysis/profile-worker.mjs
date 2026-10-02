import * as api from './local/api.js';
import * as bridge from './local/bridge.js';
import {measureCaptured} from './local/m9b-captured.ts';
import {unpack,exact,untimed} from './codec.mjs';
import {frames,argsOf} from './replay.mjs';
import {analysisProfile,analysisTime} from './generation-profile.mjs';
const binaries=Object.fromEntries(await Promise.all(['before','after'].map(async k=>[k,await(await fetch(k==='before'?'followup/before-analysis.wasm':'analysis.wasm')).arrayBuffer()])));
const hook={enter(){},leave(){},replace:(n,a)=>bridge.replace(n,a)};
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');
async function select(backend){globalThis.__ra=null;if(backend!=='typescript'){await bridge.installRustAnalysis(binaries[backend]);globalThis.__ra=hook;}}
const orders=[['typescript','before','after'],['after','typescript','before'],['before','after','typescript']];
const names=Object.fromEntries(Object.entries(bridge.OPS).map(([k,v])=>[v,k]));
self.onmessage=async({data:c})=>{try{
 const rows=[];
 if(c.generate){
  for(const backend of orders[0]){await select(backend);api.generate(api.makeSpec({seed:1,theme:'delta',size:{x:48,y:48}}));}
  for(let rep=0;rep<c.reps;rep++){const identities=[];
   for(const backend of orders[rep%3]){await select(backend);const profile=analysisProfile(bridge,backend);globalThis.__ra=profile;const t=performance.now();const r=api.generate(api.makeSpec({seed:1,theme:c.theme,size:{x:256,y:256}}));const ms=performance.now()-t;globalThis.__ra=null;
    const identity=await digest(exact({report:r.report,analysis:r.analysis,outcomes:r.outcomes,features:r.features,intentions:r.intentions,heights:r.built.heights,water:r.built.water,contamination:r.built.contamination,attempts:r.attempts,failures:r.failures.map(f=>f.failed),info:r.info,bytes:r.bytes}));identities.push(identity);const analysis=analysisTime(profile.totals);rows.push({rep,backend,name:'generation',ms,analysis,share:analysis/ms,totals:profile.totals,identity});}
   if(new Set(identities).size!==1)throw Error(c.theme+' complete generation identity');
  }
 }else{
  const picked=new Map();
  for(const suffix of ['', '.room']){const response=await fetch('cases/'+c.id+suffix+'.in');if(!response.ok)continue;for(const frame of frames(new Uint8Array(await response.arrayBuffer()))){const op=frame[0];if(!picked.has(op)||frame.length>picked.get(op).length)picked.set(op,frame);}}
  const tests=[];
  for(const [op,input]of picked){const name=names[op],args=argsOf(input);tests.push({name,run:backend=>backend==='typescript'?api[name](...args):bridge.invoke(name,args),clean:v=>v});}
  const p=unpack(await(await fetch('cases/'+c.id+'.json.gz')).json());
  if(p.fileBytes){const file=api.readTimber(p.fileBytes);tests.push({name:'checks',run:()=>api.validateMap(file,p.opts),clean:v=>v});}
  if(p.measurable)tests.push({name:'measures',run:()=>api.measure(p.measurable),clean:v=>v});
  if(p.outcomeInput)tests.push({name:'outcomes',run:()=>api.outcomesOf(p.outcomeInput),clean:v=>v});
  const captured=unpack(await(await fetch('cases/'+c.id+'.m9b.json.gz')).json());
  tests.push({name:'m9bMeasures',run:()=>measureCaptured(captured.result,captured.theme,captured.seed,captured.size,captured.generation),clean:untimed});
  for(const test of tests){
   await select('typescript');const expected=exact(test.clean(test.run('typescript')));
   for(let rep=0;rep<c.reps;rep++)for(const backend of orders[rep%3]){
    await select(backend);let t=performance.now();const warm=test.run(backend);const warmMs=performance.now()-t;if(exact(test.clean(warm))!==expected)throw Error(c.id+'/'+test.name+'/'+backend+' warm identity');
    const iterations=Math.max(1,Math.min(200,Math.ceil(30/Math.max(warmMs,0.1))));
    let result;t=performance.now();for(let i=0;i<iterations;i++)result=test.run(backend);const elapsed=performance.now()-t;
    if(exact(test.clean(result))!==expected)throw Error(c.id+'/'+test.name+'/'+backend+' timed identity');
    rows.push({rep,backend,name:test.name,ms:elapsed/iterations,elapsed,iterations});
   }
  }
 }
 globalThis.__ra=null;self.postMessage({ok:true,id:c.id??c.theme,rows});
}catch(e){globalThis.__ra=null;self.postMessage({ok:false,error:e.stack});}};
self.postMessage({ready:true});

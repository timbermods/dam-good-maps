import assert from 'node:assert/strict';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {LOCAL,ROOT,WATER,deps,arg,json,hash} from './common.mjs';
import {pack,exact,untimed} from './codec.mjs';
const api=deps(resolve(LOCAL,'api.cjs')),bridge=deps(resolve(LOCAL,'bridge.cjs')),m9b=deps(resolve(LOCAL,'m9b.cjs'));
const dir=resolve(LOCAL,'cases');mkdirSync(dir,{recursive:true});
const fingerprint=hash(Buffer.concat(['api.cjs','bridge.cjs','analysis.wasm','m9b.cjs'].map(n=>readFileSync(resolve(LOCAL,n)))));
await bridge.installRustAnalysis(readFileSync(resolve(LOCAL,'analysis.wasm')));
function frame(v){const b=Buffer.from(v.buffer,v.byteOffset,v.byteLength),h=Buffer.alloc(4);h.writeUInt32LE(b.length);return Buffer.concat([h,b]);}
function checkedHook(frames,expected,counters){return {enter(){},leave(){},replace(name,args){if(!bridge.OPS[name])return;const hook=globalThis.__ra;globalThis.__ra=null;let reference;try{reference=api[name](...args);}finally{globalThis.__ra=hook;}
 const input=bridge.encode(name,args),actual=bridge.run(input),want=bridge.flatten(name,reference);assert.ok(Buffer.from(actual.buffer).equals(Buffer.from(want.buffer)),name+' exact bytes');
 frames.push(frame(input));expected.push(frame(want));counters[name]=(counters[name]??0)+1;return bridge.decode(name,actual,input[1]*input[2]);}};}
function record(id,before,after,frames,expected,counters,payload){const meta={id,fingerprint,kernels:counters,calls:Object.values(counters).reduce((a,b)=>a+b,0),input:hash(Buffer.concat(frames)),expected:hash(Buffer.concat(expected)),highLevel:hash(exact(after)),identity:exact(before)===exact(after)};assert.ok(meta.identity,id+' higher-level identity');
 writeFileSync(resolve(dir,id+'.in'),Buffer.concat(frames));writeFileSync(resolve(dir,id+'.expected'),Buffer.concat(expected));
 writeFileSync(resolve(dir,id+'.json.gz'),gzipSync(JSON.stringify(pack(payload))));writeFileSync(resolve(dir,id+'.meta.json'),JSON.stringify(meta));return meta;}
async function generated(c){let g;globalThis.__raGenerated=r=>g=r;globalThis.__ra=null;const beforeMeasure=m9b.measureOne(c.theme,c.seed,c.size,'',false),before=g;
 const frames=[],expected=[],counters={};globalThis.__ra=checkedHook(frames,expected,counters);const afterMeasure=m9b.measureOne(c.theme,c.seed,c.size,'',false),after=g;globalThis.__ra=null;
 assert.ok(Buffer.from(before.bytes).equals(Buffer.from(after.bytes)),c.id+' full export');
 const state=r=>({report:r.report,analysis:r.analysis,outcomes:r.outcomes,features:r.features,intentions:r.intentions,heights:r.built.heights,water:r.built.water,contamination:r.built.contamination,attempts:r.attempts,failures:r.failures.map(f=>f.failed),info:r.info});
 assert.equal(exact(state(before)),exact(state(after)),c.id+' generator complete analysis');
 const opts={profile:'generate',spec:after.spec,features:after.features,water:{model:after.built.waterModel,settled:after.built.settle}};
 const payload={fileBytes:after.bytes.length?after.bytes:null,opts,measurable:{built:{W:after.built.W,H:after.built.H,heights:after.built.heights,water:after.built.water,entities:after.built.entities,sources:after.built.sources,start:after.built.start},features:after.features,report:after.report,analysis:after.analysis},outcomeInput:{spec:after.spec,built:{W:after.built.W,H:after.built.H,heights:after.built.heights,water:after.built.water,contamination:after.built.contamination},features:after.features,intentions:after.intentions}};
 return record(c.id,{measure:untimed(beforeMeasure),state:state(before)},{measure:untimed(afterMeasure),state:state(after)},frames,expected,counters,payload);
}
if(!isMainThread){parentPort.on('message',async c=>{try{parentPort.postMessage(await generated(c));}catch(e){parentPort.postMessage({id:c.id,error:e.stack});}});}
else{
 const cases=[];for(const size of [96,128,256])for(const theme of api.AVAILABLE_THEMES)for(let seed=1;seed<=Number(arg('seeds','40'));seed++)cases.push({id:`m9b-${theme}-${size}-${seed}`,size,theme,seed});
 const pending=cases.filter(c=>{const p=resolve(dir,c.id+'.meta.json');return !existsSync(p)||JSON.parse(readFileSync(p)).fingerprint!==fingerprint;});let at=0,done=cases.length-pending.length;
 await Promise.all(Array.from({length:Math.min(Number(arg('jobs','16')),pending.length)},()=>new Promise((res,rej)=>{const w=new Worker(new URL(import.meta.url));function next(){if(at<pending.length)w.postMessage(pending[at++]);else w.terminate().then(res)}w.on('message',r=>{if(r.error){w.terminate();rej(Error(r.id+' '+r.error));return}done++;if(done%10===0)console.log(done+'/'+cases.length,r.id,r.calls);json('progress.json',{done,total:cases.length});next();});w.on('error',rej);next();})));
 // All official models use rust-water's already byte-checked canonical state.
 const names=readdirSync(resolve(WATER,'local/models')).filter(n=>n.startsWith('official-')&&n.endsWith('.bin'));
 const {deserialize}=await import('node:v8');
 for(const n of names){const {model:m,row}=deserialize(readFileSync(resolve(WATER,'local/models',n))),id=row.id;const frames=[],expected=[],counters={};const raw=readFileSync(resolve(WATER,'local/checks',id+'.expected'));const dv=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);let offset=8;const ticks=dv.getUint32(offset,true),settled=!!dv.getUint32(offset+4,true),N=dv.getUint32(offset+12,true);offset+=24;const array=len=>{const a=Float64Array.from({length:len},(_,k)=>dv.getFloat64(offset+k*8,true));offset+=len*8;return a};const depth=array(N),contamination=array(N);array(N);const out=array(4*N),sat=raw.subarray(offset,offset+N);const water={depth,contamination,out,sat:Uint8Array.from(sat),ticks,settled};
 const officialRoot=process.env.DGM_OFFICIAL??'C:/Users/Kyler/code/DamGoodMaps/investigation/raw/builtin';const fileBytes=readFileSync(resolve(officialRoot,id.slice(9)+'.timber')),file=api.readTimber(fileBytes);
 const surface=api.surfaceOf(file.world),objects=api.mapObjects(file.world);const input={W:m.W,H:m.H,surface,objects,model:m,water,rules:api.rulesFor(null),features:null};
 function analyze(){const c=new api.Collector('import');const analysis=api.checkPlayability(input,c);return {analysis,checks:c.checks};}
 globalThis.__ra=null;const before=analyze();globalThis.__ra=checkedHook(frames,expected,counters);const after=analyze();globalThis.__ra=null;
 const opts={profile:'import',external:true,water:{model:m,settled:water}};globalThis.__ra=null;const v0=api.validateMap(file,opts);globalThis.__ra=checkedHook(frames,expected,counters);const v1=api.validateMap(file,opts);globalThis.__ra=null;
 record(id,{before,v:v0},{before:after,v:v1},frames,expected,counters,{fileBytes,opts,playability:input});
 }
 const fixtures=JSON.parse(gunzipSync(readFileSync(resolve(ROOT,'tests/golden/water.json.gz')))).fixtures;
 for(const f of fixtures){const id='golden-'+f.name,frames=[],expected=[],counters={},m={W:f.W,H:f.H,floor:Float64Array.from(f.floor),dam:f.dam?Float64Array.from(f.dam):null,emitters:f.emitters};
 function checks(){const h=Uint8Array.from(m.floor),wet=Uint8Array.from(h,(_,i)=>f.floor[i]<2?1:0),surface=Float64Array.from(m.floor, v=>v+1);return {distance:api.distanceFrom(wet,m.W,m.H),levels:api.levelRegions(h,m.W,m.H),walk:api.walkDistance(h,m.W,m.H,null,[],{x:Math.floor(m.W/2),y:Math.floor(m.H/2)}),dams:api.damSites(h,wet,surface,m.W,m.H,null),spill:api.spillLevels(m)};}
 globalThis.__ra=null;const before=checks();globalThis.__ra=checkedHook(frames,expected,counters);const after=checks();globalThis.__ra=null;record(id,before,after,frames,expected,counters,{golden:true});
 }
 const metas=readdirSync(dir).filter(n=>n.endsWith('.meta.json')).map(n=>JSON.parse(readFileSync(resolve(dir,n))));json('corpus.json',{fingerprint,cases:metas});console.log('Corpus complete',metas.length);
}

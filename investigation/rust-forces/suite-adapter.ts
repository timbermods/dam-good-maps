// Loaded only by the investigation's Vitest config. Production files are read
// through an in-memory Vite transform and never edited. Each original TS planner
// remains an independent oracle; completed/step states are replaced with Rust
// data before the unchanged force suites inspect them or export the document.
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {readFileSync,appendFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdirSync,existsSync} from 'node:fs';
import {afterAll} from 'vitest';
import {ImpactPlan} from './local/checkout/src/core/forces/craterize';
import {EruptPlan} from './local/checkout/src/core/forces/erupt';
import {QuakePlan} from './local/checkout/src/core/forces/quake';
import {GlaciateRun} from './local/checkout/src/core/forces/glaciate/run';
import {CarveRun} from './local/checkout/src/core/forces/carve/run';
import {F,JsonFloat} from './local/checkout/src/core/format/json';
import {FOOTPRINTS} from './local/checkout/src/core/format/footprints';
import {fullMap,plainEntities} from './local/checkout/src/core/forces/force';
const runDir=process.env.DGM_RUN_DIR??'';
if(runDir&&!/^[a-z0-9-]+$/.test(runDir))throw Error('Invalid isolated run directory');
const local=new URL('./local/'+(runDir?runDir+'/':''),import.meta.url);
const api=createRequire(import.meta.url)(fileURLToPath(new URL('api.cjs',local)));
const bridge=await api.bridge(readFileSync(new URL('forces.wasm',local)));
let comparisons=0;
const same=(a:any,b:any,label:string)=>{
 // Equal typed arrays can be checked by their exact storage bytes. Avoid millions
 // of cold scalar protocol writes in per-frame large-map presentation tests.
 if(ArrayBuffer.isView(a)&&ArrayBuffer.isView(b)&&a.constructor===b.constructor){const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength),y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);if(x.length!==y.length||!x.every((v,i)=>v===y[i]))throw Error('Rust existing-suite typed bytes: '+label);comparisons++;return;}
 const x=Buffer.from(api.encode(a)),y=Buffer.from(api.encode(b));if(!x.equals(y)){const message='Rust existing-suite identity: '+label+' '+first(a,b);console.error(message);throw Error(message);}comparisons++;};
function first(a:any,b:any,path=''):string{if(Object.is(a,b))return '';if(a==null||b==null||typeof a!=='object'||typeof b!=='object')return path+': '+JSON.stringify(a)+' / '+JSON.stringify(b);if(Object.keys(a).sort().join()!==Object.keys(b).sort().join())return path+' keys';for(const key of Object.keys(a)){const d=first(a[key],b[key],path+'.'+key);if(d)return d;}return '';}
function cloneFixture(v:any):any {if(v===null||typeof v!=='object')return v;if(v instanceof JsonFloat)return v;if(ArrayBuffer.isView(v))return v.slice();if(Array.isArray(v))return v.map(cloneFixture);return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,cloneFixture(x)]));}
function rust(verb:string,before:any,settings:any,intent:any,keep:any=null,options:any={}){
 const map=fullMap(before);if(verb==='carve')map.entities=before.entities;const j={verb,map,plainEntities:plainEntities(map.entities),settings,intent,keep:keep??new Uint8Array(map.W*map.H),options,footprints:FOOTPRINTS};
 const task=bridge.create(j);try{task.plan();const r=api.typedResult(task,j,F);
  if(process.env.DGM_SUITE_NATIVE==='1'){
   const input=new URL('suite-'+process.pid+'-input.bin',local),output=new URL('suite-'+process.pid+'-output.bin',local);
   const bytes=api.encode(j,false);writeFileSync(input,bytes);execFileSync(fileURLToPath(new URL('target/release/forces-batch.exe',local)),[fileURLToPath(input),fileURLToPath(output)],{windowsHide:true});
   try{same(r,api.decode(readFileSync(output)),verb+' native result');}catch(error){writeFileSync(new URL('suite-failure-input.bin',local),api.encode(j));console.error('Native fixture failure',verb,settings,intent,nonfinite(r));throw error;}
   if(process.env.DGM_SUITE_CAPTURE==='1'){
    const wasmHash=createHash('sha256').update(readFileSync(new URL('forces.wasm',local))).digest('hex'),dir=new URL('suite-corpus/'+wasmHash+'/',local);mkdirSync(dir,{recursive:true});
    const key=createHash('sha256').update(bytes).digest('hex'),target=new URL(key+'.input.bin',dir);
    if(!existsSync(target)){const expected=readFileSync(output);writeFileSync(target,bytes);writeFileSync(new URL(key+'.expected.bin',dir),expected);appendFileSync(new URL('suite-corpus-'+wasmHash+'.jsonl',local),JSON.stringify({verb,size:map.W,finish:options.finish!==false,key,sha256:createHash('sha256').update(expected).digest('hex')})+'\n');}
   }
  }
  return cloneFixture(r);}finally{task.dispose();}
}
function nonfinite(v:any,p=''):string{if(typeof v==='number'&&!Number.isFinite(v))return p+' = '+v;if(v&&typeof v==='object')for(const k of Object.keys(v)){const found=nonfinite(v[k],p+'.'+k);if(found)return found;}return '';}
function mapEqual(a:any,b:any,label:string){for(const key of ['heights','entities','water','lava','fallen','rockLayers'])if(a[key]!==undefined)same(a[key],b[key],label+'.'+key);}
for(const [verb,Type] of [['craterize',ImpactPlan],['erupt',EruptPlan],['quake',QuakePlan]] as const){
 const original=Type.prototype.advance;const checked=new WeakSet();
 Type.prototype.advance=function(rows?:number){const done=original.call(this,rows);if(done&&!checked.has(this)){
  const p=this as any,r=rust(verb,p.before,p.settings,p.intent,verb==='quake'?null:p.keep);
  mapEqual(p.map,r.raw,verb);same(p.stats,r.stats,verb+' stats');
  if(verb==='quake'){same((p.fault as any).points,r.fault.points,'fault points');for(const k of ['arrival','dx','dy','source']){same(p[k],r[k],'quake '+k);p[k]=r[k];}}
  else {same(p.anatomy,r.anatomy,verb+' anatomy');same(p.keep,r.keep,verb+' keep');same(p.strength,r.strength,verb+' strength');if(verb==='erupt'){same(p.flows,r.flows,'erupt flows');p.flows=r.flows;}}
  p.map=r.raw;Object.assign(p.stats,r.stats);checked.add(this);
 }return done;} as any;
}
// Check/replace the complete raw glacier before TS presentation settles Keep.
const settle=(GlaciateRun.prototype as any).settle;
(GlaciateRun.prototype as any).settle=function(p:any){const r=rust('glaciate',this.before,this.settings,this.intent);mapEqual(p.map,r.raw,'glaciate raw');for(const k of ['path','reference','streamPath','arrival','mask','floor','nearest','stream','fan','retained','basins','hanging','metrics','finished','joins']){same(p[k],r[k],'glaciate '+k);p[k]=r[k];}p.map=r.raw;return settle.call(this,p);};
// Used by the in-memory plan.ts transform so direct makePlan and generator tests
// (including editor/worker tests) also receive Rust's production planning result.
(globalThis as any).__rustGlaciate=(p:any,before:any,settings:any,intent:any,finish:boolean)=>{const r=rust('glaciate',before,settings,intent,undefined,{finish});mapEqual(p.map,r.raw,'glacier generator');for(const k of ['path','reference','streamPath','arrival','mask','floor','nearest','stream','fan','retained','basins','hanging','metrics','finished','joins']){same(p[k],r[k],'glacier generator '+k);p[k]=r[k];}p.map=r.raw;return p;};
const carveStep=CarveRun.prototype.step;const carveData=new WeakMap<object,any>();
CarveRun.prototype.step=function(){const run=this as any;if(run.planning)return carveStep.call(this);let d=carveData.get(this);if(!d){const r=rust('carve',run.__rustBefore,run.settings,run.intent,run.keep,run.__rustOptions);d={r,heights:run.original.slice(),lava:run.map.lava?.slice(),at:0,entities:r.initialEntities.map((e:any)=>({...e})),objectAt:0};mapEqual({entities:run.map.entities},{entities:r.initialEntities},'carve constructor');carveData.set(this,d);}
 const changed=carveStep.call(this);if(d.at>=d.r.total)return changed;const k=++d.at,c=d.r.rawChanges[k];for(let t=0;t<c.length;t+=2){const i=c[t],h=c[t+1];d.heights[i]=h;if(d.lava)d.lava[i]&=(1<<h)-1;}
 const removed=new Map(d.r.removedAt);d.entities=d.entities.filter((e:any)=>(removed.get(e.id)??Infinity)>k);while(d.objectAt<d.r.stepObjectChanges.length&&d.r.stepObjectChanges[d.objectAt].step<=k){const change=d.r.stepObjectChanges[d.objectAt++];const e=d.entities.find((e:any)=>e.id===change.id);if(e)Object.assign(e,{x:change.x,y:change.y,z:change.z});}
 same(changed,Array.from(c).filter((_:any,t:number)=>t%2===0),'carve changed');same(run.map.heights,d.heights,'carve heights/'+k);same(run.map.entities,d.entities,'carve entities/'+k);same(run.metrics,d.r.stepMetrics[k],'carve metrics/'+k);same(run.head,d.r.heads[k],'carve head/'+k);same(run.path,d.r.path.slice(0,d.r.lengths[k]),'carve path/'+k);
 run.map.heights.set(d.heights);if(d.lava)run.map.lava.set(d.lava);run.map.entities=cloneFixture(d.entities);Object.assign(run.metrics,d.r.stepMetrics[k]);run.head=structuredClone(d.r.heads[k]);if(k===d.r.total){same(run.oxbows,d.r.oxbows,'carve oxbows');same(run.edgeLeaks,d.r.edgeLeaks,'carve edge leaks');mapEqual(run.map,d.r.map,'carve final');}
 return Array.from(c).filter((_:any,t:number)=>t%2===0) as number[];
};
afterAll(()=>appendFileSync(new URL('rust-suite-checks.jsonl',local),JSON.stringify({comparisons})+'\n'));

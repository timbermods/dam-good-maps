import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,openSync,writeSync,closeSync,statSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {dir} from './overlay.mjs';
import {FileResults} from './node-store.mjs';
const phase=process.argv[2]??'after',size=Number(process.argv[3]??256),repeat=Number(process.argv[4]??1),steps=Number(process.env.SCALING_R2_STEPS??2048);
const budget=Number(process.env.SCALING_R2_SNAPSHOT_MIB??128)*1024**2,resultBudget=Number(process.env.SCALING_R2_RESULT_MIB??32)*1024**2;
const forceEvery=Number(process.env.SCALING_R2_FORCE_EVERY??127);
const lib=await import(pathToFileURL(resolve(dir,'../local/round2',phase+'.mjs')).href);
const out=resolve(dir,'../local/round2',process.env.SCALING_R2_OUT??'runs');mkdirSync(out,{recursive:true});
const name=`${phase}-${size}-${repeat}-${budget/1024**2}`,source=readFileSync(resolve(dir,`../local/probe/sizes-${size}x${size}.timber`));
let original=lib.MapSession.importMap(source,'probe.timber');const base=original.document; // discarded before measurement
let history,cold,session=original;session.setWaterMode('defer');
if(phase==='after'){cold=new FileResults(resolve(out,name+'.cache'));history=new lib.GestureHistory(base,cold,'round2-'+size,0,{results:resultBudget,snapshots:budget,steps:16});session=history.session;original=null;}
const data={phase,size,repeat,steps,budget,resultBudget,forceEvery,pid:process.pid,started:Date.now(),rows:[],trace:[],forces:{},refusals:[],policy:'resolved seeded gestures; canonical force-input water; bounded hot cache; disposable on-disk derived results'};
const save=()=>writeFileSync(resolve(out,name+'.json'),JSON.stringify(data,null,2));
const hash=b=>createHash('sha256').update(b).digest('hex');
function state(s){const b=s.built,h=createHash('sha256');for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination])if(v)h.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));h.update(JSON.stringify(b.entities));h.update(JSON.stringify(s.features));return h.digest('hex');}
function components(s){const b=s.built,parts={};for(const k of ['heights','water','contamination','moisture','soilContamination']){const v=b[k];parts[k]=v?hash(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)):null;}parts.entities=hash(JSON.stringify(b.entities));parts.features=hash(JSON.stringify(s.features));return parts;}
function row(name,at,ms,extra={}){data.rows.push({name,at,ms,...extra});}
async function memory(step){const cache=history?{results:history.results.stats,snapshots:session.historyCacheStats}:null;await new Promise(r=>setImmediate(r));global.gc?.();await new Promise(r=>setImmediate(r));global.gc?.();row('memory',Date.now(),null,{step,history:session.editCount,memory:process.memoryUsage(),maxRSS_KiB:process.resourceUsage().maxRSS,cache,cacheDiskBytes:cold?.end});save();console.log(name,step,Math.round(process.memoryUsage().heapUsed/1024**2)+' MiB heap');}
const verbs=['craterize','erupt','quake','glaciate','carve'];
function gesture(k){const verb=verbs[k%5],seed=9001+k,origin=[Math.round(size*.48),Math.round(size*.4)],end=[origin[0]+18,origin[1]+30],path=[{x:origin[0]-10,y:origin[1]-6},{x:origin[0]+14,y:origin[1]+7}];
 const settings=verb==='craterize'?{...lib.CRATER_DEFAULTS,power:100,size:48,seed}:verb==='erupt'?{...lib.ERUPT_DEFAULTS,power:100,size:40,seed}:verb==='quake'?{...lib.QUAKE_DEFAULTS,mode:k%2?'slide':'lift',power:100,seed}:verb==='glaciate'?{...lib.GLACIATE_DEFAULTS,mode:'aim',power:100,size:32,seed,meltwater:true}:{...lib.CARVE_DEFAULTS,mode:'aim',power:100,width:4,seed,dry:true,defyGravity:true};
 return {verb,settings,where:verb==='quake'?{path,side:k%2?1:-1}:{origin,...((verb==='glaciate'||verb==='carve')?{end}:{})},cut:null,sourceId:`00000000-0000-4000-8000-${String(k).padStart(12,'0')}`};}
function ordinary(n){const x=8+(n*19)%(size-20),y=8+(n*31)%(size-20);
 if(n%97===0){const id='6e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b',kind=Math.floor(n/97)%4;
  if(kind===1)return {op:'addFeature',params:{feature:{id,kind:'forest',origin:'user',locked:false,params:{area:[[6,6,9],[7,6,9]],density:.7,speciesMix:{Birch:1},life:'auto',youngShare:.2}}}};
  if(kind===2)return {op:'updateFeature',params:{id,patch:{params:{density:.8}}}};
  if(kind===3)return {op:'reorderFeature',params:{id,index:0}};
  return {op:'deleteFeature',params:{id}};
 }
 if(n%32===0)return {op:'sculpt',params:{mode:'flatten',level:n%64?10:11,cells:Array.from({length:size},(_,y)=>[y,0,size-1]),exact:true}};
 if(n%17===0){const e=session.built.entities.find(e=>['Pine','Oak','Birch'].includes(e.template));if(e)return {op:'setEntityProps',params:{id:e.id,components:{LivingNaturalResource:{IsDead:n%34===0}}}};}
 if(n%3===0)return {op:'sculpt',params:{mode:n%2?'raise':'lower',cells:[[y,x,x+2]],amount:1,exact:true}};
 const tools=['raise','lower','flatten','smooth','naturalize'];return {op:'brush',params:{tool:tools[n%5],size:5.5,strength:1,seed:7101+n,level:10,dabs:[x*4+1,y*4+2,(x+1)*4+1,(y+1)*4+2]}};
}
await memory(0);let forceIndex=0;
for(let n=1;n<=steps;n++){
 const at=Date.now(),t=performance.now();
 try{
  if(n%forceEvery===0){const g=gesture(forceIndex++);if(history)await history.force(g);else{const op=lib.resolveForce(session,g);lib.applyResolvedForce(session,op);}data.forces[g.verb]=(data.forces[g.verb]??0)+1;}
  else {const op=ordinary(n);if(history)history.apply([op]);else {const r=session.applyAll([op]);if(!r.ok)throw Error(r.errors.join('; '));}}
 }catch(e){if(!/changed nothing|Nothing|not apply/.test(String(e)))throw e;data.refusals.push({step:n,error:String(e)});}
 row('edit',at,performance.now()-t,{step:n});data.trace.push(state(session));
 if([8,64,256,512,1024,1536,2048].includes(n)||n===steps)await memory(n);
}
// Canonical final state and complete export are separate from deferred editing previews.
let at=Date.now(),t=performance.now();session.settleCanonical();const finalState=state(session),exported=session.exportTimber();assert(exported.bytes?.length);const exportHash=hash(exported.bytes);row('canonical-and-export',at,performance.now()-t,{bytes:exported.bytes.length,hash:exportHash});
const undoHashes=[],undoParts=[];
for(let timing=1;timing<=Number(process.env.SCALING_REPEATS??3);timing++){
at=Date.now();t=performance.now();assert(history?history.undo():session.undo());row('undo-recent',at,performance.now()-t);
at=Date.now();t=performance.now();assert(history?history.redo():session.redo());row('redo-recent',at,performance.now()-t);if(history)assert.equal(state(session),finalState);
undoHashes.length=0;undoParts.length=0;const finalParts=components(session);
for(let n=0;n<Math.min(32,session.editCount);n++){at=Date.now();t=performance.now();const ok=history?history.undo():session.undo();assert(ok);row('undo',at,performance.now()-t,{depth:n+1});undoHashes.push(state(session));undoParts.push(components(session));}
data.redoMismatches=[];
for(let n=undoHashes.length-1;n>=0;n--){at=Date.now();t=performance.now();assert(history?history.redo():session.redo());row('redo',at,performance.now()-t,{depth:undoHashes.length-n});const expected=n?undoHashes[n-1]:finalState;if(history){if(state(session)!==expected){data.failure={n,expectedParts:n?undoParts[n-1]:finalParts,actualParts:components(session)};save();}assert.equal(state(session),expected,'redo state differs');}else if(state(session)!==expected)data.redoMismatches.push(n);}
session.settleCanonical();assert.equal(state(session),finalState);
const file=resolve(out,name+'.damgoodmaps.json'),fd=openSync(file+'.partial','w');let maxWrite=0;
at=Date.now();t=performance.now();
try{if(history)await history.save(async b=>{maxWrite=Math.max(maxWrite,b.length);writeSync(fd,b);});else{const p=session.project();maxWrite=p.length;writeSync(fd,p);}}finally{closeSync(fd);}renameSync(file+'.partial',file);row('save-project',at,performance.now()-t,{bytes:statSync(file).size,maxWrite});
await memory('saved');
// Reopening starts only from generation + gestures; no old result cache is consulted.
let opened,newCold;
at=Date.now();t=performance.now();
if(history){newCold=new FileResults(resolve(out,name+'-reopen.cache'));const f=openSync(file,'r');try{opened=await lib.GestureHistory.open((async function*(){const {readSync}=await import('node:fs');while(true){const b=new Uint8Array(32768),n=readSync(f,b);if(!n)break;yield b.subarray(0,n);}})(),newCold,{results:resultBudget,snapshots:budget,steps:16});}finally{closeSync(f);}}else opened=lib.MapSession.open(lib.decodeProject(readFileSync(file)));
row('reopen-project',at,performance.now()-t,{recomputed:history?opened.count:0});
const reopened=history?opened.session:opened;reopened.settleCanonical();assert.equal(state(reopened),finalState,'recomputed state differs');const reexport=reopened.exportTimber();assert(reexport.bytes?.length);assert.equal(hash(reexport.bytes),exportHash,'recomputed Timberborn bytes differ');
data.final={state:finalState,exportHash,parity:true,history:session.editCount,cache:history?.results.stats};save();newCold?.close();opened=null;global.gc?.();}
cold?.close();console.log(name,'DONE',data.forces,data.refusals.length+' no-effect attempts');

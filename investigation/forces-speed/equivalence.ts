import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'../..'),local=join(root,'investigation/forces-speed/local'),tree=join(local,'adopted');
const baseline=await load(root),adopted=await load(tree);
async function load(r:string){
 const imp=(f:string)=>import(pathToFileURL(join(r,f)).href);
 return {runs:await imp('src/core/forces/runs.ts'),carve:await imp('src/core/forces/carve/run.ts'),play:await imp('src/core/forces/carve/play.ts'),glaciate:await imp('src/core/forces/glaciate/run.ts'),rift:await imp('src/core/forces/rift.ts'),deposit:await imp('src/core/forces/deposit.ts'),keep:await imp('src/core/forces/keep.ts'),force:await imp('src/core/forces/force.ts')};
}
const {forceJobs}=await import('../../tools/rust/forces-jobs');
const {forceJobs: adoptedJobs}=await import(pathToFileURL(join(tree,'tools/rust/forces-jobs.ts')).href);
const otherJobs=adoptedJobs();
function digest(value:any):string{
 const h=createHash('sha256');
 function add(v:any){if(ArrayBuffer.isView(v)){h.update(v.constructor.name);h.update(Buffer.from(v.buffer,v.byteOffset,v.byteLength));}
 else if(v instanceof Set){add([...v]);}
 else if(v&&typeof v==='object'){h.update(Array.isArray(v)?'[':'{');for(const k of Object.keys(v).sort()){h.update(k);add(v[k]);}h.update('}');}
 else h.update(JSON.stringify(v)??'undefined');}
 add(value);return h.digest('hex');
}
function study(m:any,j:any){
 const before=j.job.map,{verb,settings,intent,keep,areaDepth}=j.job;
 let run:any,carve:any=null,play:any;
 try{
 if(verb==='carve'){carve=run=new m.carve.CarveRun(before,settings,intent,{keep,...j.job.options});play=new m.play.CarvePlay(carve);play.plan();}
 else if(verb==='craterize')run=new m.runs.CraterRun(before,settings,intent,keep);
 else if(verb==='erupt')run=new m.runs.EruptRun(before,settings,intent,keep);
 else if(verb==='quake')run=new m.runs.QuakeRun(before,settings,intent,keep);
 else if(verb==='glaciate')run=new m.glaciate.GlaciateRun(before,settings,intent,keep);
 else if(verb==='rift')run=new m.rift.RiftRun(before,settings,intent,keep,areaDepth);
 else run=new m.deposit.DepositRun(before,settings,intent,keep,areaDepth);
 }catch(e){return {error:String(e)};}
 const frames=[digest(play?{map:play.map,head:play.head}:{map:run.map,cue:run.cue()})];
 for(let k=0;!(play?play.done:run.done)&&k<5000;k++){if(play)play.advance(1);else run.step();frames.push(digest(play?{map:play.map,head:play.head}:{map:run.map,cue:run.cue()}));}
 const point=(i:number)=>[i%before.W,Math.floor(i/before.W)];
 const request={verb,settings,cut:null,...(intent.origin!==undefined?{origin:point(intent.origin)}:{}),...(intent.end!==undefined?{end:point(intent.end)}:{}),...(intent.via?{via:intent.via.map(point)}:{}),...(intent.path?{path:intent.path}:{}),...(intent.side?{side:intent.side}:{})};
 return {frames,final:digest(carve?carve.map:run.final()),record:digest(m.keep.keptForceParams({before,request,carve,staged:carve?null:run}))};
}
const rows=[];
for(const [index,j] of forceJobs().entries()){
 const a=study(baseline,j),b=study(adopted,otherJobs[index]);
 if(JSON.stringify(a)!==JSON.stringify(b))throw Error('force result/frame/record changed: '+j.name+' '+JSON.stringify(a).slice(0,100)+' / '+JSON.stringify(b).slice(0,100));
 rows.push({name:j.name,frames:a.frames?.length??0,hash:digest(a),refused:!!a.error});
}
const out=process.argv[process.argv.indexOf('--out')+1];mkdirSync(join(local,out),{recursive:true});
writeFileSync(join(local,out,'equivalence.json'),JSON.stringify(rows,null,2));
console.log(rows.length+' baseline/adopted force studies identical (every playback frame, final map, Keep record; '+rows.reduce((s,r)=>s+r.frames,0)+' frames)');
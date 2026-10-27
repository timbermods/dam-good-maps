import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { forceJobs } from '../../tools/rust/forces-jobs';
const root=resolve(import.meta.dirname,'../..'),before=resolve(import.meta.dirname,'local/pre-forces');
async function modules(r:string){const imp=(p:string)=>import(pathToFileURL(resolve(r,'src/core',p)).href);return {runs:await imp('forces/runs.ts'),carve:await imp('forces/carve/run.ts'),play:await imp('forces/carve/play.ts'),glaciate:await imp('forces/glaciate/run.ts'),rift:await imp('forces/rift.ts'),keep:await imp('forces/keep.ts')};}
const a=await modules(before),b=await modules(root);
function digest(v:any):string {const h=createHash('sha256');function add(x:any){if(ArrayBuffer.isView(x)){h.update(x.constructor.name);h.update(Buffer.from(x.buffer,x.byteOffset,x.byteLength));}else if(x&&typeof x==='object'){for(const k of Object.keys(x).sort()){h.update(k);add(x[k]);}}else h.update(JSON.stringify(x)??'undefined');}add(v);return h.digest('hex');}
function run(m:any,j:any){const {map,verb,settings,intent,keep}=j;let r:any,p:any;
 try{if(verb==='carve'){r=new m.carve.CarveRun(map,settings,intent,{keep});p=new m.play.CarvePlay(r);p.plan();}
 else if(verb==='craterize')r=new m.runs.CraterRun(map,settings,intent,keep);
 else if(verb==='erupt')r=new m.runs.EruptRun(map,settings,intent,keep);
 else if(verb==='quake')r=new m.runs.QuakeRun(map,settings,intent,keep);
 else if(verb==='glaciate')r=new m.glaciate.GlaciateRun(map,settings,intent,keep);
 else r=new m.rift.RiftRun(map,settings,intent,keep,j.areaDepth);
 const frames=[];for(let k=0;k<5000;k++){frames.push(digest(p?{map:p.map,head:p.head}:{map:r.map,cue:r.cue()}));if(p?p.done:r.done)break;if(p)p.advance(1);else r.step();}
 assert(p?p.done:r.done,'force never ended');const final=p?r.map:r.final();
 return {frames,final:digest(final),map:final};
 }catch(e){return {error:String(e)};}}
const rows=[];
for(const job of forceJobs().filter(j=>!j.name.startsWith('deposit'))){
 for(const variant of ['original','floor','working-area/layer']){
  const j=structuredClone(job.job);
  if(variant==='floor')j.settings={...j.settings,floor:8};
  if(variant==='working-area/layer'){j.keep=new Uint8Array(j.map.W*j.map.H);for(let i=0;i<j.keep.length;i++)if(i%j.map.W<j.map.W*.3||j.map.heights[i]>12)j.keep[i]=1;}
  const x=run(a,structuredClone(j)),y=run(b,structuredClone(j));assert.deepEqual({...x,map:undefined},{...y,map:undefined},job.name+' '+variant);
  rows.push({name:job.name,variant,frames:x.frames?.length??0,refused:!!x.error,hash:x.final});
  // Another seed (Try another), and a second use on the first result: no stale cached invariants.
  if(x.map){const next={...j,map:x.map,settings:{...j.settings,seed:(j.settings.seed+1)>>>0}};
   const u=run(a,structuredClone(next)),v=run(b,structuredClone(next));assert.deepEqual({...u,map:undefined},{...v,map:undefined},job.name+' second use');
   rows.push({name:job.name+' second use',variant,frames:u.frames?.length??0,refused:!!u.error,hash:u.final});
  }
 }
}
writeFileSync(resolve(import.meta.dirname,'local/forces.json'),JSON.stringify(rows,null,2));console.log(`${rows.length} force comparisons; every playback frame and final map byte-identical; ${rows.filter(r=>r.refused).length} matching refusals.`);

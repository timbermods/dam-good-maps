import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector';
import {SketchJob,install} from './engine';
import {SketchJob as Before} from './local/before-engine';
import {ResidentWater} from './resident';
import {fromTimber} from './maps';
const dir=process.cwd();install(readFileSync(dir+'/local/water.wasm'));
const cases=JSON.parse(readFileSync(dir+'/benchmarks.json','utf8')).cases.filter((c:any)=>!process.env.DGM_PROFILE_SIZE||c.size===Number(process.env.DGM_PROFILE_SIZE));
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const digest=(v:any)=>sha(JSON.stringify(v,(key,value)=>key==='runtimeMs'?0:ArrayBuffer.isView(value)?{type:value.constructor.name,bytes:sha(Buffer.from(value.buffer,value.byteOffset,value.byteLength))}:typeof value==='number'&&(Object.is(value,-0)||!Number.isFinite(value))?{number:Object.is(value,-0)?'-0':String(value)}:value));
const session=new Session();session.connect();
const post=(method:string)=>new Promise<any>((resolve,reject)=>session.post(method,(e,r)=>e?reject(e):resolve(r)));
const totals:any={};
for(const [type,name] of [[ResidentWater,'run'],[SketchJob,'result'],[Before,'result']] as const){
 const proto=type.prototype as any,fn=proto[name],key=(type===Before?'before':type===SketchJob?'after':'water')+'.'+name;
 proto[name]=function(...args:any[]){const t=performance.now();try{return fn.apply(this,args);}finally{totals[key]=(totals[key]??0)+performance.now()-t;}};
}
const rows:any[]=[];let comparisons=0;
async function main(){
await post('Profiler.enable');await post('Profiler.start');
for(const c of cases){
 const map=fromTimber(readFileSync(dir+'/local/maps/'+c.map+'.timber'),c.map);
 const weather={provenance:'round2 fixed nine-day drought',frames:[{ticks:6912,kind:'drought' as const,strengths:map.model.emitters.map(()=>0),contamination:map.model.emitters.map((e:any)=>e.contamination)}]};
 const hashes:any={};
 for(const [name,Type] of [['before',Before],['after',SketchJob]] as const){
  const counterStart={...totals},started=Date.now(),rolling=createHash('sha256'),start=performance.now(),job=new Type(map,c.strokes,weather);let r=job.result(),publications=0,filled=0;
  while(r.phase==='filling'||r.phase==='weather'){
   r=job.advance(r.phase==='filling'?8:128);
   const bytes=digest(r);rolling.update(bytes);publications++;
   if(name==='before'){(hashes.expected??=[]).push(bytes);}else{if(hashes.expected[publications-1]!==bytes)throw Error('Result bytes changed '+c.map+'/'+c.case+'/'+publications);comparisons++;}
   // All exposed wall/control column bytes, including stacked overflow and floors.
   for(const sim of [(job as any).sim,(job as any).control]){const cols=sim.columns();for(const field of ['floor','depth','overflow'])if(cols[field])rolling.update(Buffer.from(cols[field].buffer,cols[field].byteOffset,cols[field].byteLength));}
   if(!filled&&r.phase!=='filling')filled=performance.now()-start;
  }
  hashes[name]=rolling.digest('hex');rows.push({started,ended:Date.now(),map:c.map,case:c.case,size:c.size,backend:r.backend,mode:name,publications,fillMs:filled,droughtMs:performance.now()-start-filled,digest:hashes[name],methodMs:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,(value as number)-(counterStart[key]??0)]))});job.dispose();
 }
 if(hashes.before!==hashes.after)throw Error('Column bytes changed');
 console.log(c.map,c.case,'identical');
}
const {profile}=await post('Profiler.stop');session.disconnect();
writeFileSync(dir+'/local/round2.cpuprofile',JSON.stringify(profile));
const counts:any={};for(const id of profile.samples){const node=profile.nodes.find((n:any)=>n.id===id),name=node.callFrame.functionName||'(anonymous)';counts[name]=(counts[name]??0)+1;}
writeFileSync(dir+'/local/profile-results.json',JSON.stringify({comparisons,rows,totals,exclusiveSamples:Object.entries(counts).sort((a:any,b:any)=>b[1]-a[1]).slice(0,20)}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

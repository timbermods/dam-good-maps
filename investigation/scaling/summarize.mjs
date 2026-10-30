import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './proposal.mjs';
const local=resolve(dir,'local'),manifestPath=process.argv[2]??resolve(dir,'runs.json');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const median=a=>{const s=a.filter(Number.isFinite).sort((a,b)=>a-b),n=s.length;return n?n%2?s[n>>1]:(s[n/2-1]+s[n/2])/2:null;};
const stats=a=>{a=a.filter(Number.isFinite);return {n:a.length,median:median(a),worst:a.length?Math.max(...a):null};};
const round=x=>typeof x==='number'?Math.round(x*1000)/1000:x;
function load(path){return existsSync(path)?readFileSync(path,'utf8').trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s)).map(x=>({...x,time:Date.parse(x.at)})):[];}
function cpu(samples,at,ms){let s=samples.filter(x=>x.time>=at&&x.time<=at+ms);if(!s.length&&samples.length)s=[samples.reduce((a,b)=>Math.abs(a.time-at)<Math.abs(b.time-at)?a:b)];return s.map(x=>Number(x.cpuPercent));}
function group(rows,key){const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r);}return [...m.values()];}
const observations=[],issues=[],memory=[];
function memoryRow(phase,size,repeat,scope,m){if(!m)return;const heap=m.heap;memory.push({phase,size,repeat,scope,pageHeap:heap?.usedSize,pageBacking:heap?.backingStorageSize,workers:m.workers?.map(w=>({name:w.url.split('/').at(-1),heap:w.heap.usedSize,backing:w.heap.backingStorageSize})),retainedArrays:m.retainedWorker?.arrayBuffers,retainedStringCharacters:m.retainedWorker?.stringCharacters,snapshots:m.retainedWorker?.snapshots,history:m.retainedWorker?.history,geometryBytes:m.geometry?.bytes,processes:m.processes});}
for(const folder of manifest.browser){
 const path=resolve(local,folder),d=JSON.parse(readFileSync(resolve(path,'results.json'),'utf8')),samples=load(resolve(path,'load.jsonl'));
 for(const r of d.results){
  if(r.error)issues.push({phase:d.phase,size:r.size,repeat:r.repeat,suite:d.suite,error:r.error});
  for(const row of r.rows){
   if(row.name==='page-error'){issues.push({phase:d.phase,size:r.size,error:row.error});continue;}
   for(const error of row.probe?.errors??[])if(!issues.some(x=>x.phase===d.phase&&x.size===r.size&&x.error===error))issues.push({phase:d.phase,size:r.size,error});
   const p=row.probe??{},frames=p.frames??[],events=(p.events??[]).filter(x=>x.name==='pointerdown'||x.name==='keydown'),canvas=events.filter(x=>x.target==='CANVAS'),first=canvas[0]??events.at(-1),terrain=(p.calls??[]).filter(x=>['updateTerrain','updateTerrainRect'].includes(x.name)&&(!first||x.at>=first.at)).sort((a,b)=>a.at-b.at)[0],paint=terrain&&(p.renders??[]).find(x=>x.at>=terrain.at+terrain.ms),render=(p.renders??[]).at(-1);
   const status=row.error?'harness-error':row.result&&row.editsBefore!==undefined?row.result.edits>row.editsBefore?'committed':row.result.edits<row.editsBefore?'undone':'no-history-change':'not-instrumented';
   observations.push({phase:d.phase,suite:d.suite,size:r.size,repeat:r.repeat,name:row.name,ms:row.ms,status,cpu:cpu(samples,row.at,row.ms),longTask:Math.max(0,...(p.tasks??[]).map(x=>x.ms)),frameWorst:frames.length?Math.max(...frames):null,fps:frames.length?1000*frames.length/frames.reduce((a,b)=>a+b,0):null,inputPaint:first&&paint?paint.at-first.at:null,meshMs:row.name==='open'?row.memory?.geometry?.build?.meshMs:(p.calls??[]).filter(x=>['meshTerrain','meshWater'].includes(x.name)).reduce((s,x)=>s+x.ms,0),setMapMs:row.memory?.geometry?.build?.ms??(p.calls??[]).find(x=>x.name==='setMap')?.ms,draws:render?.calls,triangles:render?.triangles,heapPeak:(p.renders??[]).length?Math.max(0,...p.renders.map(x=>x.heap??0)):null,retainedGeometries:(p.calls??[]).filter(x=>x.name==='meshGeometry'&&x.keptGeometry).length,newGeometries:(p.calls??[]).filter(x=>x.name==='meshGeometry'&&!x.keptGeometry).length,dropGeometries:(p.calls??[]).filter(x=>x.name==='dropMesh').length,bytes:row.bytes??row.result?.bytes,notes:row.result?.notes,error:row.error});
   if(row.verification?.failures?.length)issues.push({phase:d.phase,size:r.size,repeat:r.repeat,name:row.name,meshFailures:row.verification.failures});
   memoryRow(d.phase,r.size,r.repeat,'open',row.memory);
  }
  memoryRow(d.phase,r.size,r.repeat,'end',r.memory);
  const processes=r.memory?.processes??r.rows.find(x=>x.memory)?.memory.processes??[],ids=new Set(processes.map(x=>x.id));
  const begin=r.rows.find(x=>x.at)?.at,end=Math.max(begin??0,...r.rows.map(x=>(x.at??0)+(x.ms??0)),...(r.session??[]).map(x=>x.at),...(r.memorySamples??[]).map(x=>x.at));
  const own=samples.filter(x=>x.time>=begin&&x.time<=end).map(x=>({at:x.time,processes:x.processMemory.filter(p=>ids.has(p.pid))}));
  if(own.length)memory.push({phase:d.phase,size:r.size,repeat:r.repeat,scope:'OS-own-browser',sampledWorkingSetPeak:Math.max(...own.map(x=>x.processes.reduce((s,p)=>s+p.workingSet,0))),lastWorkingSet:own.at(-1).processes.reduce((s,p)=>s+p.workingSet,0),peakWorkingSetSum:Math.max(...own.map(x=>x.processes.reduce((s,p)=>s+(p.peakWorkingSet??0),0))),samples:own.length});
  for(const c of r.session??[])memoryRow(d.phase,r.size,r.repeat,'editing-'+c.step,c.memory);
  for(const [scope,ms] of [['load',r.openMemorySamples],['editing-or-save',r.memorySamples]])if(ms?.length){
    const targets=group(ms.flatMap(x=>x.targets.filter(t=>t.heap).map(t=>({...t,at:x.at}))),t=>t.type+':'+t.url);
    const peaks=targets.map(ts=>({type:ts[0].type,name:ts[0].url.split('/').at(-1),heapPeak:Math.max(...ts.map(t=>t.heap.usedSize)),backingPeak:Math.max(...ts.map(t=>t.heap.backingStorageSize??0))}));
    memory.push({phase:d.phase,size:r.size,repeat:r.repeat,scope:'sampled-'+scope,samples:ms.length,maxSampleGap:Math.max(0,...ms.slice(1).map((x,i)=>x.at-ms[i].at)),peaks});
  }
  if(r.parity&&!r.parity.ok)issues.push({phase:d.phase,size:r.size,repeat:r.repeat,parity:r.parity});
 }
}
const browser=group(observations,r=>[r.phase,r.suite,r.size,r.name].join(':')).map(rs=>{
 const r=rs[0],out={phase:r.phase,suite:r.suite,size:r.size,name:r.name,repeats:rs.length,statuses:rs.map(x=>x.status),notes:[...new Set(rs.flatMap(x=>x.notes??[]))]};
 for(const k of ['ms','longTask','frameWorst','fps','inputPaint','meshMs','setMapMs','draws','triangles','heapPeak','retainedGeometries','newGeometries','dropGeometries','bytes'])out[k]=stats(rs.map(x=>x[k]));out.fps.worst=rs.some(x=>Number.isFinite(x.fps))?Math.min(...rs.map(x=>x.fps).filter(Number.isFinite)):null;out.cpu=stats(rs.flatMap(x=>x.cpu));return out;
});
const headlessRaw=[];
for(const phase of ['before','after']){
 const path=resolve(local,'headless-'+phase),samples=load(resolve(path,'load.jsonl'));if(!existsSync(path))continue;
 for(const name of readdirSync(path).filter(x=>/\d+x\d+-\d+\.json$/.test(x))){const d=JSON.parse(readFileSync(resolve(path,name),'utf8'));for(const r of d.rows)headlessRaw.push({...r,phase,size:d.size,repeat:d.repeat,cpu:cpu(samples,r.at,r.ms??0)});}
}
const headless=group(headlessRaw,r=>[r.phase,r.size,r.name,r.step??''].join(':')).map(rs=>{const r=rs[0],out={phase:r.phase,size:r.size,name:r.name,step:r.step,repeats:rs.length,ms:stats(rs.map(x=>x.ms)),cpu:stats(rs.flatMap(x=>x.cpu)),bytes:rs.map(x=>x.bytes),sha256:rs.map(x=>x.sha256),errors:rs.map(x=>x.error).filter(Boolean),exportIdentical:rs.map(x=>x.exportIdentical).filter(x=>x!==undefined)};for(const k of ['rss','heapUsed','external','arrayBuffers'])out[k]=stats(rs.map(x=>x.memory?.[k]));out.retainedArrays=stats(rs.map(x=>x.retained?.arrayBuffers));out.retainedStrings=stats(rs.map(x=>x.retained?.stringCharacters));out.snapshots=rs.map(x=>x.retained?.snapshots).filter(x=>x!==undefined);out.history=rs.map(x=>x.retained?.history).filter(x=>x!==undefined);out.waterArrays=stats(rs.map(x=>x.water?.arrayBuffers));out.geometryBytes=stats(rs.map(x=>x.geometryBytes));out.quads=stats(rs.map(x=>x.quads));return out;});
const waterPath=resolve(local,'water-blends.json'),waterSamples=load(resolve(local,'water-load.jsonl'));
const water=existsSync(waterPath)?group(JSON.parse(readFileSync(waterPath,'utf8')),r=>r.phase+':'+r.size+':'+r.scenario).map(rs=>({phase:rs[0].phase,size:rs[0].size,scenario:rs[0].scenario,count:rs[0].count,pushMs:stats(rs.map(x=>x.pushMs)),skipMs:stats(rs.map(x=>x.skipMs)),materializeMs:stats(rs.map(x=>x.materializeMs)),extraBytes:rs[0].extraBytes,cpu:stats(rs.flatMap(x=>cpu(waterSamples,x.at,x.pushMs+x.skipMs+x.materializeMs)))})):[];
const parity=group(headlessRaw.filter(x=>x.sha256),r=>r.size+':'+r.name).map(rs=>({size:rs[0].size,name:rs[0].name,runs:rs.length,identical:new Set(rs.map(x=>x.sha256)).size===1}));
const contract=Object.fromEntries(['before','after'].map(p=>[p,JSON.parse(readFileSync(resolve(local,'contracts-'+p+'.json'),'utf8'))]));
const denseHistory=['before-256x256','after-256x256','after-512x512'].map(name=>JSON.parse(readFileSync(resolve(local,'dense',name+'.json'),'utf8')));
const browserLimits=JSON.parse(readFileSync(resolve(local,'browser-limits.json'),'utf8'));
const output={denseHistory,browserLimits,provenance:JSON.parse(readFileSync(resolve(local,'provenance.json'),'utf8')),machine:JSON.parse(readFileSync(resolve(local,'machine.json'),'utf8')),units:'Timings: ms; CPU: whole-machine percent; memory and file sizes: bytes; strings: characters; fps: measured rAF rate during orbit.',runs:manifest,browser,headless,water,memory,issues,parity,contract};
writeFileSync(resolve(local,'measurements-full.json'),JSON.stringify(output,(_,v)=>round(v),2)+'\n');
const compact={...output,
 browser:browser.map(r=>({...r,notes:r.notes.filter(s=>/invalid|must be|outside|failed|error|limit/i.test(s)).map(s=>s.slice(0,500))})),
 contract:Object.fromEntries(Object.entries(contract).map(([p,d])=>[p,{...d,rows:d.rows.map(r=>({...r,...(r.errors?{errorCount:r.errors.length,errors:r.errors.slice(0,3)}:{})}))}])),
 memory:memory.map(({processes,...r})=>r),
 denseHistory:denseHistory.map(d=>({...d,rows:d.rows.map(r=>({...r,...(r.project?{project:{...r.project,ms:undefined,stack:undefined}}:{})}))}))};
writeFileSync(resolve(dir,'measurements.json'),JSON.stringify(compact,(_,v)=>v&&typeof v==='object'&&'median' in v&&'worst' in v?(v.n===0?undefined:{median:round(v.median),worst:round(v.worst)}):round(v))+'\n');
function csv(name,rows){const cols=Object.keys(rows[0]??{}),q=x=>'"'+String(x??'').replaceAll('"','""')+'"';writeFileSync(resolve(dir,name),[cols.map(q).join(','),...rows.map(r=>cols.map(c=>q(r[c])).join(','))].join('\n')+'\n');}
csv('timings.csv',[...browser.filter(r=>r.suite!=='memory').map(r=>({source:'browser',phase:r.phase,size:r.size,operation:r.name,repeat:r.repeats,median_ms:r.ms.median,worst_ms:r.ms.worst,cpu_median:r.cpu.median,cpu_worst:r.cpu.worst,long_task_worst:r.longTask.worst,paint_median:r.inputPaint.median,paint_worst:r.inputPaint.worst,statuses:r.statuses.join('|')})),...headless.filter(r=>r.ms.n).map(r=>({source:'node',phase:r.phase,size:r.size,operation:r.name,repeat:r.repeats,median_ms:r.ms.median,worst_ms:r.ms.worst,cpu_median:r.cpu.median,cpu_worst:r.cpu.worst,long_task_worst:null,paint_median:null,paint_worst:null,statuses:r.errors.join('|')}))]);
csv('memory.csv',memory.map(r=>({phase:r.phase,size:r.size,repeat:r.repeat,scope:r.scope,page_heap_bytes:r.pageHeap,page_backing_bytes:r.pageBacking,worker_heaps_and_backing:JSON.stringify(r.workers),sampled_peaks:JSON.stringify(r.peaks),session_array_bytes:r.retainedArrays,string_characters:r.retainedStringCharacters,snapshots:r.snapshots,history:r.history,geometry_bytes:r.geometryBytes,OS_browser_peak_working_set:r.sampledWorkingSetPeak,OS_browser_last_working_set:r.lastWorkingSet,samples:r.samples,max_sample_gap_ms:r.maxSampleGap})));
csv('rendering.csv',browser.filter(r=>r.suite!=='memory'&&['open','orbit','brush-supported','undo-supported','redo-supported'].includes(r.name)).map(r=>({phase:r.phase,size:r.size,operation:r.name,repeats:r.repeats,build_median_ms:r.setMapMs.median,build_worst_ms:r.setMapMs.worst,mesh_median_ms:r.meshMs.median,mesh_worst_ms:r.meshMs.worst,orbit_fps_median:r.fps.median,orbit_fps_worst:r.fps.worst,frame_worst_ms:r.frameWorst.worst,draws:r.draws.median,triangles:r.triangles.median,retained_geometries:r.retainedGeometries.median,new_geometries:r.newGeometries.median,dropped_geometries:r.dropGeometries.median,cpu_median:r.cpu.median,cpu_worst:r.cpu.worst})));
console.log(browser.length,'browser groups;',headless.length,'headless groups;',issues.length,'issues;',parity.filter(x=>!x.identical).length,'hash differences');

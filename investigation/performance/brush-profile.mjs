// Offline attribution: executing stacks inside actual tasks, with wall AND thread CPU time.
// Non-CPU elapsed time does not identify scheduling, quota or GPU wait without further evidence.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {TraceMap,originalPositionFor} from '@jridgewell/trace-mapping';
const folder=resolve(process.argv[2]),manifest=JSON.parse(readFileSync(resolve(folder,'manifest.json'))),build=resolve(import.meta.dirname,'local/round3/build',manifest.look,manifest.phase);
const prefix=manifest.results[0].prefix??'1';
const raw=JSON.parse(readFileSync(resolve(folder,prefix+'-raw.json'))),maps=new Map();
function frame(c){
 const path=resolve(build,'assets',basename(c.url??'')+'.map');
 if(!existsSync(path)||!Number.isInteger(c.lineNumber))return {name:c.functionName,source:c.url??'',line:(c.lineNumber??-1)+1};
 if(!maps.has(path))maps.set(path,new TraceMap(JSON.parse(readFileSync(path))));
 const p=originalPositionFor(maps.get(path),{line:c.lineNumber+1,column:c.columnNumber??0});
 return {name:p.name??c.functionName,source:p.source,line:p.line,column:p.column};
}
const trace=JSON.parse(readFileSync(resolve(folder,prefix+'-trace.json'))).traceEvents;
const threads=trace.filter(e=>e.name==='thread_name').map(e=>({pid:e.pid,tid:e.tid,name:e.args.name}));
const main=threads.find(t=>t.name==='CrRendererMain');
const allTasks=trace.filter(e=>e.ph==='X'&&e.name==='RunTask');
const mainTasks=allTasks.filter(e=>e.pid===main.pid&&e.tid===main.tid&&e.dur>=50000);
// Align clocks using several independently matching long tasks, not one matching duration.
const candidates=[];
for(const r of raw.tasks)for(const t of mainTasks)if(Math.abs(t.dur/1000-r.duration)<2)candidates.push(t.ts/1000-r.start);
const ranked=candidates.map(offset=>({offset,matches:raw.tasks.filter(r=>mainTasks.some(t=>Math.abs(t.ts/1000-r.start-offset)<1&&Math.abs(t.dur/1000-r.duration)<2)).length})).sort((a,b)=>b.matches-a.matches);
const alignment=ranked[0];if(!alignment||alignment.matches<3)throw Error('Insufficient independent task matches to align clocks; attribution remains unverified');
const offset=alignment.offset*1000;
const from=Math.min(raw.frames[0].at-raw.frames[0].dt,raw.findings[0]?.at??Infinity)*1000+offset;
const until=raw.calls.reduce((max,c)=>Math.max(max,c.end),raw.tasks.reduce((max,t)=>Math.max(max,t.start+t.duration),raw.frames.at(-1).at))*1000+offset;
function samples(cpu,start){
 const nodes=new Map(cpu.nodes.map(n=>[n.id,n])),parents=new Map(),decoded=new Map();for(const n of cpu.nodes){if(n.parent)parents.set(n.id,n.parent);for(const id of n.children??[])parents.set(id,n.id);decoded.set(n.id,frame(n.callFrame));}
 const stacks=new Map();
 let t=start;return cpu.samples.map((id,i)=>{t+=cpu.timeDeltas[i];if(!stacks.has(id)){const stack=[];for(let k=id;k&&nodes.has(k);k=parents.get(k))stack.push(decoded.get(k));stacks.set(id,stack);}return {at:t,stack:stacks.get(id)};});
}
const cpu=JSON.parse(readFileSync(resolve(folder,prefix+'-cpu.json'))),profiles=new Map([[main.pid+':'+main.tid,samples(cpu,cpu.startTime)]]),groups=new Map();
for(const e of trace.filter(e=>e.name==='Profile'||e.name==='ProfileChunk')){
 const key=e.pid+':'+e.id;if(!groups.has(key))groups.set(key,{nodes:[],samples:[],timeDeltas:[]});const g=groups.get(key),d=e.args.data;
 if(e.name==='Profile'){g.start=d.startTime;g.tid=e.tid;g.pid=e.pid;}else{g.nodes.push(...d.cpuProfile?.nodes??[]);g.samples.push(...d.cpuProfile?.samples??[]);g.timeDeltas.push(...d.timeDeltas??[]);}
}
for(const g of groups.values())if(g.start&&g.pid===main.pid&&threads.some(t=>t.tid===g.tid&&t.name==='DedicatedWorker thread'))profiles.set(g.pid+':'+g.tid,samples(g,g.start));
function summarizeTask(e){
 const sampled=(profiles.get(e.pid+':'+e.tid)??[]).filter(s=>s.at>=e.ts&&s.at<e.ts+e.dur),leaves=new Map(),ancestors=new Map();
 for(const s of sampled){if(!s.stack.length)continue;const key=JSON.stringify(s.stack[0]);leaves.set(key,(leaves.get(key)??0)+1);for(const key of new Set(s.stack.map(JSON.stringify)))ancestors.set(key,(ancestors.get(key)??0)+1);}
 const top=map=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([f,n])=>({...JSON.parse(f),samples:n,fraction:n/sampled.length}));
 const gc=trace.filter(x=>x.pid===e.pid&&x.tid===e.tid&&x.ph==='X'&&['MinorGC','MajorGC'].includes(x.name)&&x.ts>=e.ts&&x.ts<e.ts+e.dur).map(x=>({name:x.name,wallMs:x.dur/1000,cpuMs:x.tdur/1000}));
 return {thread:threads.find(t=>t.pid===e.pid&&t.tid===e.tid)?.name,pid:e.pid,tid:e.tid,start:e.ts,wallMs:e.dur/1000,cpuMs:e.tdur/1000,nonCpuMs:(e.dur-e.tdur)/1000,sampleCount:sampled.length,leaf:top(leaves),ancestry:top(ancestors),gc,
  traceFunctions:trace.filter(x=>x.pid===e.pid&&x.tid===e.tid&&x.ph==='X'&&x.ts>=e.ts&&x.ts<e.ts+e.dur&&x.name!=='RunTask'&&x.dur>=8000).map(x=>({name:x.name,wallMs:x.dur/1000,cpuMs:x.tdur/1000,args:x.args}))};
}
const tasks=allTasks.filter(e=>e.ts>=from&&e.ts<until&&e.dur>=50000).sort((a,b)=>b.dur-a.dur).map(summarizeTask);
const hitchAttributions=manifest.results[0].metrics.hitches.map(h=>{
 const start=(h.at-h.dt)*1000+offset,end=h.at*1000+offset;
 const relevant=allTasks.filter(t=>t.pid===main.pid&&t.tid===main.tid&&t.ts<end&&t.ts+t.dur>start&&t.dur>=8000).map(summarizeTask);
 return {at:h.at,dt:h.dt,mainTasks:relevant,attribution:relevant.some(t=>t.sampleCount>5)?'Sampled ancestry explains these tasks; remaining gap is unattributed':'unattributed; insufficient sampled main-thread task'};
});
const result={alignment,from,until,threads,tasks,hitchAttributions,limits:'Sample fractions estimate executing CPU work, not exact per-function durations. Non-CPU time remains unattributed.'};
writeFileSync(resolve(folder,'attribution.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({alignment,tasks:tasks.filter(t=>t.tid===main.tid).slice(0,8).map(t=>({wallMs:t.wallMs,cpuMs:t.cpuMs,leaf:t.leaf.slice(0,4),ancestry:t.ancestry.slice(0,4)})),unattributed:hitchAttributions.filter(h=>h.attribution.startsWith('unattributed')).length},null,2));

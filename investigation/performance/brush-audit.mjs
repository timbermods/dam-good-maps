// Compact offline proof. Missing/stale evidence never passes; profiler runs are diagnostic only.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {segment,quietSuffix,samples} from './continuous-load.mjs';
import {loadSpiked,isQuiet} from './coverage.mjs';
import {summarize,median} from './metrics.mjs';
import {completeInterval} from './brush-evidence.mjs';
const dir=import.meta.dirname,local=resolve(dir,'local/round3'),budgets=JSON.parse(readFileSync(resolve(dir,'budgets.json')));
const digest=b=>createHash('sha256').update(b).digest('hex');
const hashFile=f=>existsSync(f)?digest(readFileSync(f)):null;
const records=[],rawIndex=[],sessions=new Map();
for(const name of readdirSync(resolve(local,'runs')).sort()){
 const folder=resolve(local,'runs',name),path=resolve(folder,'manifest.json');if(!existsSync(path))continue;
 const m=JSON.parse(readFileSync(path)),build=resolve(local,'build',m.look,m.phase);
 const buildValid=m.provenance.assets.every(a=>hashFile(resolve(build,'assets',a.file))===a.sha256);
 const protocolFrozen=!!m.protocol&&m.protocol.every(p=>hashFile(resolve(folder,'protocol',p.file))===p.sha256);
 const protocolValid=protocolFrozen&&m.protocol.every(p=>hashFile(resolve(dir,p.file))===p.sha256);
 const sourceValid=m.provenance.sources.every(p=>hashFile(resolve(dir,'../..',p.file))===p.sha256);
 const session=JSON.parse(readFileSync(m.loadSession));if(!sessions.has(m.loadSession))sessions.set(m.loadSession,{session,rows:samples(session.trace)});
 const all=sessions.get(m.loadSession).rows;
 rawIndex.push({folder:name,manifest:hashFile(path),session:session.id,protocolFrozen,protocolValid,sourceValid,buildValid,error:m.error??null});
 for(let index=0;index<m.results.length;index++){
  const r=m.results[index];let source=folder;
  if(m.results.slice(index+1).some(n=>n.repeat===r.repeat)){
   const archived=readdirSync(folder,{withFileTypes:true}).filter(f=>f.isDirectory()&&f.name.startsWith('discarded-')).map(f=>resolve(folder,f.name));
   source=archived.find(f=>{const p=resolve(f,'manifest.json');if(!existsSync(p))return false;const a=JSON.parse(readFileSync(p));return a.results.at(-1)?.from===r.from;})??folder;
  }
  const rawPath=resolve(source,(r.prefix??r.repeat)+'-raw.json'),raw=existsSync(rawPath)?JSON.parse(readFileSync(rawPath)):null;
  const active=segment(all,r.from,r.to),bracketed=active.length>=2&&Date.parse(active[0].at)<=r.from&&Date.parse(active.at(-1).at)>=r.to;
  const suffix=quietSuffix(all.filter(s=>Date.parse(s.at)<=r.qualifiedAt),budgets.quiet,session.start);
  const quiet=isQuiet({quiet:true,samples:suffix,quietDurationMs:suffix.length?Date.parse(suffix.at(-1).at)-Date.parse(suffix[0].at):0},budgets.quiet);
  const summary=raw?summarize(raw,budgets):null,rawMatches=summary&&summary.frames===r.metrics?.frames&&summary.max===r.metrics?.max&&summary.hitches.length===r.metrics?.hitches.length;
  const hardware=!!r.device&&!r.device.software&&r.device.visibility==='visible'&&r.device.focused&&(!r.device.actualLook||r.device.actualLook===m.look)&&raw?.frames.every(f=>f.visibility==='visible'&&f.focused);
  const fullInterval=completeInterval(r,raw);
  const qualified=r.status==='complete'&&r.qualified&&rawMatches&&hardware&&bracketed&&!loadSpiked(active,budgets.quiet)&&quiet&&buildValid&&sourceValid&&protocolValid&&fullInterval;
  const numbers=field=>{const a=active.map(s=>s[field]);return {min:Math.min(...a),median:median(a),max:Math.max(...a)};};
  records.push({folder:name,index,phase:m.phase,look:m.look,profile:m.profile,profiling:m.profiling,repeat:r.repeat,status:r.status,claimedQualified:r.qualified,qualified,protocolFrozen,protocolValid,sourceValid,buildValid,rawMatches,bracketed,quiet,hardware,fullInterval,
   raw:hashFile(rawPath),snapshot:hashFile(resolve(source,(r.prefix??r.repeat)+'-snapshot.json')),exportHash:hashFile(resolve(source,(r.prefix??r.repeat)+'-export.timber')),exportOk:r.export?.ok??null,geometry:r.geometry?digest(JSON.stringify(r.geometry)):null,
   from:r.from,to:r.to,loadGeneration:r.loadGeneration,load:{other:numbers('unrelatedCpuPercent'),total:numbers('cpuPercent')},
   discardedTopProcesses:active.filter(s=>loadSpiked([s],budgets.quiet)).map(s=>({at:s.at,otherCpu:s.unrelatedCpuPercent,totalCpu:s.cpuPercent,processes:s.topOtherProcesses})),
   pacing:summary?{frames:summary.frames,p99:summary.p99,max:summary.max,hitches:summary.hitches.length,longTasks:summary.longTasks.length,unattributedHitches:summary.hitches.length}:null,
   stages:raw?.findings.filter(f=>f.kind==='stage').map((f,i,a)=>{const end=a[i+1]?.at??raw.frames.at(-1)?.at;const s=summarize({...raw,frames:raw.frames.filter(x=>x.at-x.dt>=f.at&&x.at<=end),tasks:raw.tasks.filter(x=>x.start>=f.at&&x.start<end)},budgets);return {stage:f.stage,p99:s.p99,max:s.max,hitches:s.hitches.length};})??[]});
 }
}
const configurations=[];const failures=[];
for(const look of ['standard','high'])for(const profile of ['native','laptop']){
 const phases={};for(const phase of ['before','after']){
  const rows=[1,2,3,4,5].map(repeat=>records.filter(r=>r.qualified&&r.protocolValid&&!r.profiling&&r.phase===phase&&r.look===look&&r.profile===profile&&r.repeat===repeat).at(-1));
  const available=rows.filter(Boolean),stat=k=>({median:median(available.map(r=>r.pacing[k])),worst:available.length?Math.max(...available.map(r=>r.pacing[k])):null});
  phases[phase]={completed:available.length,missing:rows.flatMap((r,i)=>r?[]:[i+1]),p99:stat('p99'),max:stat('max'),hitches:stat('hitches'),records:available.map(r=>({folder:r.folder,repeat:r.repeat,index:r.index}))};
  if(available.length!==5)failures.push(`${look}/${profile}/${phase}: missing repeats ${phases[phase].missing}`);
  for(const r of available)if(phase==='after'&&(r.pacing.max>50||r.pacing.p99>20))failures.push(`${look}/${profile}/${phase}/${r.repeat}: frame budget fails (${r.pacing.max.toFixed(1)}ms worst)`);
 }
 const pairs=[];for(let repeat=1;repeat<=5;repeat++){
  const find=phase=>records.filter(r=>r.qualified&&r.protocolValid&&!r.profiling&&r.phase===phase&&r.look===look&&r.profile===profile&&r.repeat===repeat).at(-1),b=find('before'),a=find('after');
  if(!b||!a){pairs.push({repeat,complete:false});continue;}
  const bytes={snapshot:!!b.snapshot&&b.snapshot===a.snapshot,export:!!b.exportOk&&!!a.exportOk&&!!b.exportHash&&!!a.exportHash&&b.exportHash===a.exportHash,geometry:!!b.geometry&&b.geometry===a.geometry};pairs.push({repeat,complete:true,bytes});if(Object.values(bytes).some(v=>!v))failures.push(`${look}/${profile}/${repeat}: final-byte proof fails or missing`);
 }configurations.push({look,profile,phases,pairs});
}
const workers=[];for(const look of ['standard','high']){
 const before=resolve(local,'build',look,'before/assets'),after=resolve(local,'build',look,'after/assets');
 for(const file of readdirSync(before).filter(f=>f.includes('.worker-')&&f.endsWith('.js'))){const equal=hashFile(resolve(before,file))===hashFile(resolve(after,file));workers.push({look,file,equal,sha256:hashFile(resolve(before,file))});if(!equal)failures.push(`${look}/${file}: worker bytes differ`);}
}
const proof={scope:'Round3 large brush only. Historical broad gate and future-force obligations remain unpassed.',records,rawIndex,sessions:[...sessions].map(([path,{session,rows}])=>({path,sessionHash:hashFile(path),session:{id:session.id,trace:session.trace,metadata:session.metadata,start:session.start,end:session.end,generation:session.generation,valid:session.valid,qualifiedAt:session.qualifiedAt,closedAt:session.closedAt,reason:session.reason,qualification:session.qualification?{start:session.qualification.start,end:session.qualification.end,quietDurationMs:session.qualification.quietDurationMs,sampleCount:session.qualification.samples?.length}:null},traceHash:hashFile(session.trace),metadataHash:hashFile(session.metadata),samples:rows.length})),configurations,workers,failures,status:failures.length?'draft-failed-or-incomplete':'passed'};
writeFileSync(resolve(dir,'brush-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({configurations,failures,status:proof.status},null,2));process.exitCode=failures.length?2:0;

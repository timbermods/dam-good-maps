import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=fileURLToPath(new URL('.',import.meta.url)),local=resolve(dir,'../local/round4'),read=p=>JSON.parse(readFileSync(p,'utf8'));
const median=a=>{const s=[...a].sort((x,y)=>x-y);return (s[Math.floor(s.length/2)]+s[Math.floor((s.length-1)/2)])/2;},round=n=>Math.round(n*1000)/1000;
const loads=readFileSync(resolve(local,'load.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(x=>{const r=JSON.parse(x);return {at:Date.parse(r.at),cpu:r.cpuPercent,available:r.availableBytes};}).sort((a,b)=>a.at-b.at);
assert(loads.length,'machine load samples required');
function loadFor(row){let lo=0,hi=loads.length;while(lo<hi){const m=(lo+hi)>>1;if(loads[m].at<row.at)lo=m+1;else hi=m;}
 const sample=[];for(let i=lo;i<loads.length&&loads[i].at<=row.at+(row.loadMs??row.ms);i++)sample.push(loads[i]);let nearest=false;
 if(!sample.length){const candidates=[loads[lo],loads[lo-1]].filter(Boolean).sort((a,b)=>Math.abs(a.at-row.at)-Math.abs(b.at-row.at));assert(Math.abs(candidates[0].at-row.at)<15000,'missing contemporaneous machine load');sample.push(candidates[0]);nearest=true;}
 return {samples:sample.length,nearest,cpuMedian:round(median(sample.map(x=>x.cpu))),cpuWorst:Math.max(...sample.map(x=>x.cpu)),minimumAvailableMiB:round(Math.min(...sample.map(x=>x.available))/1024**2)};
}
const csv=['scope,size,engine,action,repeat,depth,target,ms,cpu_median,cpu_worst,minimum_available_MiB,load_samples,nearest_sample'];
function metrics(rows,scope,size,engine='node'){
 const groups={};for(const row of rows.filter(r=>Number.isFinite(r.ms))){const load=loadFor(row),key=row.name+(row.depth!==undefined?'@depth'+row.depth:row.target!==undefined?'@'+row.target:'');(groups[key]??=[]).push({...row,load});csv.push([scope,size,engine,row.name,row.repeat??'',row.depth??'',row.target??'',round(row.ms),load.cpuMedian,load.cpuWorst,load.minimumAvailableMiB,load.samples,load.nearest].join(','));}
 return Object.fromEntries(Object.entries(groups).map(([name,rows])=>[name,{repeats:rows.length,medianMs:round(median(rows.map(x=>x.ms))),worstMs:round(Math.max(...rows.map(x=>x.ms))),cpuMedian:round(median(rows.map(x=>x.load.cpuMedian))),cpuWorst:Math.max(...rows.map(x=>x.load.cpuWorst)),minimumAvailableMiB:Math.min(...rows.map(x=>x.load.minimumAvailableMiB))}]));
}
function ready(rows){return [...new Set(rows.filter(r=>r.name==='open').map(r=>r.repeat))].map(repeat=>{const a=rows.find(r=>r.name==='open'&&r.repeat===repeat),b=rows.find(r=>r.name==='first-edit'&&r.repeat===repeat);return {name:'open-plus-first-edit',repeat,at:a.at,ms:a.ms+b.ms,loadMs:b.at+b.ms-a.at};});}
function undoPrefixes(rows,steps){return [...new Set(rows.filter(r=>r.name==='open').map(r=>r.repeat))].flatMap(repeat=>{const parts=[];return [1,32,100].map(depth=>{const row=rows.find(r=>r.name==='seek'&&r.repeat===repeat&&r.target===steps-depth);assert(row);parts.push(row);return {name:'undo-to-depth',repeat,depth,at:parts[0].at,ms:parts.reduce((n,r)=>n+r.ms,0),loadMs:row.at+row.ms-parts[0].at};});});}
const r2=read(resolve(dir,'../round2/measurements.json')),r3=read(resolve(dir,'../round3/measurements.json'));
const summary={base:r2.base,determinism:r2.determinism,round3:'fb7d78011ad0cffe7921a86320a99e7bf4328733',scope:'2,048 frozen mixed edits per size. Construction memory is one Node GC capacity trace, including fixture/oracle/native metadata; not page/GPU memory. Browser actions repeat three times with contemporaneous whole-machine load. Open-plus-first-edit measures worker hydration and a real core brush, not a rendered editor frame.',policy:{formatVersion:6,reopenedUndoSteps:100,decodedPatchBytes:64*1024**2,decodedPatchCount:100,compressedPatchBytes:32*1024**2,derivedResultBytes:32*1024**2,fieldBytes:32*1024**2,overflow:'One oversized working patch allowed. Gesture journal, current/native metadata and cold index grow; only retained historical payload is bounded. In-session undo patches are kept on owned disk, not in the project beyond the last 100.'},cases:[],browsers:[],finalContracts:[]};
for(const size of [256,512]){
 const full=read(resolve(local,`final/${size}-0.json`)),oracle=read(resolve(dir,`../local/round2/accepted/after-${size}-1-128.json`)),old=r3.cases.find(c=>c.size===size);assert(full.passed);assert.equal(full.steps,2048);assert.equal(full.trace.length,2049);assert.deepEqual(full.baseTrace.slice(1),oracle.trace);assert.equal(full.exportHash,oracle.final.exportHash);
 const memory=full.rows.filter(r=>r.name==='memory'&&typeof r.step==='number').map(r=>({step:r.step,heapMiB:round(r.memory.heapUsed/1024**2),arrayBufferMiB:round(r.memory.arrayBuffers/1024**2),rssMiB:round(r.memory.rss/1024**2),retention:r.checkpoints,coldDiskBytes:r.disk}));
 for(const r of memory){assert.equal(r.retention.count,0);assert(r.retention.recentCount<=100);assert(r.retention.recentBytes<=64*1024**2||r.retention.recentCount===1);}
 const live=read(resolve(local,`final/${size}-live-proof.json`));assert(live.passed&&live.undoTransitions===2048&&live.redoTransitions===2048);
 const finalCache=read(resolve(local,`final/${size}-opened-memory.json`));assert(finalCache.passed);
 const maximumRssMiB=round(Math.max(...full.rows.filter(r=>r.name==='memory').map(r=>r.maxRSS_KiB))/1024);
 summary.cases.push({size,steps:2048,forces:full.forces,finalState:full.finalState,exportHash:full.exportHash,traceDigest:createHash('sha256').update(full.trace.join('\n')).digest('hex'),projectBytes:statSync(resolve(local,`final/${size}-0.final.dgm`)).size,round3ProjectBytes:old.projectBytes,earlierProjects:r2.cases.filter(c=>c.size===size).map(c=>({phase:c.phase,bytes:c.projectBytes})),memory,maximumRssMiB,capacityCodec:'Construction trace used the conservative JSON/copy-pair patch representation before final binary/range compaction; same indexed capture, math and 64 MiB cache policy. Final reopening cache checked separately.',finalCache,liveUndoProof:live});
}
for(const engine of ['chromium','firefox','webkit'])for(const size of [256,512]){
 const runs=read(resolve(local,`browser/${engine}-${size}-0.json`));assert.deepEqual(runs.map(x=>x.repeat),[1,2,3]);assert.equal(runs[0].allDepths.positions,101);const c=summary.cases.find(c=>c.size===size);assert(runs.every(r=>r.savedFileRoundTrip&&r.exportHash===c.exportHash));
 const rows=runs.flatMap(run=>run.rows.map(r=>({...r,repeat:run.repeat})));summary.browsers.push({engine,version:runs[0].version,size,storage:runs[0].storage,projectBytes:runs[0].bytes,positions:101,proof:runs[0].allDepths,savedFileRoundTrip:true,timing:metrics([...rows,...ready(rows),...undoPrefixes(rows,2048)],'browser',size,engine),maxWrite:Math.max(...runs.flatMap(x=>x.rows.filter(r=>r.name==='save').map(r=>r.maxWrite))),pageTimerMaxGap:Math.max(...runs.map(x=>x.pageTimerMaxGap))});
 const modern=read(resolve(local,`final-contracts/${engine}-${size}-modern.json`));assert.equal(modern.length,1);assert.equal(modern[0].allDepths.positions,7);assert(modern[0].savedFileRoundTrip&&modern[0].bookkeeping.undoForceInputReceipts);assert(Object.values(modern[0].bookkeeping).every(Boolean));summary.finalContracts.push({engine,size,...modern[0].bookkeeping});
}
for(const c of summary.cases){const files=summary.browsers.filter(b=>b.size===c.size);assert(files.every(b=>b.projectBytes===files[0].projectBytes));c.projectBytes=files[0].projectBytes;c.round3Fraction=round(c.projectBytes/c.round3ProjectBytes);}
summary.contracts=read(resolve(local,'contracts.json'));assert(summary.contracts.passed);
writeFileSync(resolve(dir,'measurements.json'),JSON.stringify(summary,null,2)+'\n');writeFileSync(resolve(dir,'timings.csv'),csv.join('\n')+'\n');console.log('Verified compact evidence',summary.cases.map(c=>({size:c.size,bytes:c.projectBytes,fraction:c.round3Fraction})),summary.browsers.length);

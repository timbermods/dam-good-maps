// Offline only. Never launches browsers, qualifies a new session, or takes measurements.
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync,copyFileSync,openSync,readSync,closeSync,appendFileSync,createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {summarize,median,repeatedStats} from './metrics.mjs';
import {isQuiet,loadSpiked,requirements} from './coverage.mjs';
import {segment} from './continuous-load.mjs';
import {root,files,candidate} from './adoption.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),local=resolve(dir,'local');
const archive=resolve(local,'windows/2026-10-01-0200');
const start=Date.parse('2026-10-01T09:00:00Z'),end=Date.parse('2026-10-01T12:00:00Z');
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const lines=p=>readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const hash=p=>{const h=createHash('sha256'),fd=openSync(p,'r'),b=Buffer.alloc(1048576);try{let n;while((n=readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));return h.digest('hex')}finally{closeSync(fd)}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stats=a=>({samples:a.length,min:a.length?Math.min(...a):null,median:median(a),max:a.length?Math.max(...a):null});
const cpu=rows=>stats(rows.map(r=>r.cpuPercent).filter(Number.isFinite));
// Preserve the completed window's measurement protocol after later authorized method changes.
const protocolDir=existsSync(resolve(archive,'protocol/budgets.json'))?resolve(archive,'protocol'):dir;
const budget=read(resolve(protocolDir,'budgets.json'));
const fingerprint=createHash('sha256');
const protocolFiles=['probe.js','audio-worklet.js','scenarios.mjs','coverage.mjs','budgets.json','metrics.mjs','load.ps1','laptop-profile.ps1','run.mjs','drain.mjs','continuous-load.mjs'];
for(const f of protocolFiles)fingerprint.update(f).update(readFileSync(resolve(protocolDir,f)));
const currentHarnessHash=fingerprint.digest('hex');
const buildChecks={};
for(const phase of ['before','after']){
  const build=read(resolve(local,'build',phase,'provenance.json')),assets=resolve(local,'build',phase,'assets');
  const fingerprint=createHash('sha256');
  for(const f of readdirSync(assets).filter(n=>/\.(js|css)$/.test(n)).sort())fingerprint.update(f).update(readFileSync(resolve(assets,f)));
  const actualBuildHash=fingerprint.digest('hex');
  const actualSourceHash=createHash('sha256').update(files.map(f=>phase==='after'?candidate(f):readFileSync(resolve(root,f),'utf8').replaceAll('\r\n','\n')).join('\n')).digest('hex');
  buildChecks[phase]={actualBuildHash,actualSourceHash,valid:actualBuildHash===build.buildHash&&actualSourceHash===build.sourceHash};
}
// The initial freeze requires finished controller and sampler state. Subsequent regeneration
// uses the frozen copy, never a later window's status or historical window-load.jsonl.
if(!existsSync(resolve(archive,'window-status.json'))){
  const status=read(resolve(local,'window-status.json')),session=read(status.loadSession);
  if(status.state!=='finished'||!session.closedAt||session.valid||session.start!==start||session.end>end)
    throw new Error('Overnight controller/sampler not finished with expected bounds');
  for(const pid of [status.pid,session.monitorPid]){let alive=false;try{process.kill(pid,0);alive=true}catch{}
    if(alive)throw new Error('Deadline cleanup still active: '+pid)}
  mkdirSync(resolve(archive,'session'),{recursive:true});
  mkdirSync(resolve(archive,'protocol'),{recursive:true});
  for(const f of protocolFiles)copyFileSync(resolve(dir,f),resolve(archive,'protocol',f));
  for(const f of ['overnight-controller-2026-10-01.json','overnight-controller-2026-10-01.stdout.log','overnight-controller-2026-10-01.stderr.log'])copyFileSync(resolve(local,f),resolve(archive,f));
  for(const f of ['window-status.json','window-run.log'])copyFileSync(resolve(local,f),resolve(archive,f));
  for(const [f,p] of [['session.json',status.loadSession],['load.jsonl',session.trace],['machine.json',session.metadata]])copyFileSync(p,resolve(archive,'session',f));
}
const status=read(resolve(archive,'window-status.json')),session=read(resolve(archive,'session/session.json'));
const trace=lines(resolve(archive,'session/load.jsonl')),byAt=new Map(trace.map(r=>[r.at,r]));
const traceFaults=[];
for(let i=0;i<trace.length;i++){
  const t=Date.parse(trace[i].at),gap=i?t-Date.parse(trace[i-1].at):null;
  if(!Number.isFinite(t)||!Number.isFinite(trace[i].cpuPercent)||!Number.isFinite(trace[i].unrelatedCpuPercent)||gap!==null&&(gap<=0||gap>budget.quiet.maxSampleGapMs))traceFaults.push({index:i,at:trace[i].at,gapMs:gap});
}
const evidence=[],rows=[],generations=new Map(),devices=new Map();
function index(path){for(const e of readdirSync(path,{withFileTypes:true})){
  const p=resolve(path,e.name);if(e.isDirectory())index(p);else evidence.push({path:relative(dir,p).replaceAll('\\','/'),sha256:hash(p)});
}}
index(archive);
if(protocolDir===dir)for(const f of protocolFiles)evidence.push({path:f,sha256:hash(resolve(dir,f))});
for(const phase of ['before','after'])evidence.push({path:`local/build/${phase}/provenance.json`,sha256:hash(resolve(local,'build',phase,'provenance.json'))});
mkdirSync(resolve(local,'overnight-hitches'),{recursive:true});
function qualification(load,generation,qualifiedAt){
  const prefix=load?.samples??[],waiting=load?.waitingSamples??[];
  const matchesTrace=prefix.length>0&&[...prefix,...waiting].every(r=>same(r,byAt.get(r.at)));
  const withinWindow=prefix.length>0&&Date.parse(prefix[0].at)>=start&&Date.parse(prefix.at(-1).at)<=end;
  const record={generation,qualifiedAt,first:prefix[0]?.at,last:prefix.at(-1)?.at,
    durationMs:prefix.length>1?Date.parse(prefix.at(-1).at)-Date.parse(prefix[0].at):null,
    quiet:isQuiet(load,budget.quiet),matchesTrace,withinWindow,cpu:cpu(prefix),otherCpu:stats(prefix.map(r=>r.unrelatedCpuPercent)),waitingCpu:cpu(waiting),waitingOtherCpu:stats(waiting.map(r=>r.unrelatedCpuPercent)),waitingFirst:waiting[0]?.at};
  if(generation){const old=generations.get(generation);if(old&&!same(old,record))throw new Error('Generation changed: '+generation);generations.set(generation,record)}
  return record;
}
function pcm(path){
  if(!existsSync(path))return null;
  const contexts=new Map();
  for(const b of lines(path)){
    const id=b.contextId??'unlabelled';let c=contexts.get(id);
    if(!c){c={contextId:id,blocks:0,samples:0,rate:b.rate,peak:0,nonzero:0,maxStep:0,gaps:[],overlaps:[],nonfinite:0};contexts.set(id,c)}
    if(c.cursor!==undefined&&b.frame!==c.cursor)(b.frame<c.cursor?c.overlaps:c.gaps).push({expected:c.cursor,actual:b.frame});
    if(c.rate!==b.rate)c.rateChanged=true;
    for(const v of b.pcm){if(!Number.isFinite(v)){c.nonfinite++;continue}c.peak=Math.max(c.peak,Math.abs(v));if(v!==0)c.nonzero++;if(c.previous!==undefined)c.maxStep=Math.max(c.maxStep,Math.abs(v-c.previous));c.previous=v}
    c.blocks++;c.samples+=b.pcm.length;c.cursor=b.frame+b.pcm.length;
  }
  return [...contexts.values()].map(({cursor,previous,...c})=>({...c,seconds:c.samples/c.rate}));
}
function compact(s){return {frames:s.frames,p99:s.p99,max:s.max,hitches:s.hitches.length,tasks:s.longTasks.length,candidates:s.glitches.length,memory:s.memory};}
async function auditHour(folder,stem,item){
 const path=resolve(folder,stem+'-hour.jsonl'),windows=item.longWindows??[],summaries=[];
 const events=resolve(local,'overnight-hitches',stem+'-hour-events-'+folder.split(/[\\/]/).at(-1)+'.jsonl');
 writeFileSync(events,''); let streamMatches=true;
 if(existsSync(path))for await(const line of createInterface({input:createReadStream(path),crlfDelay:Infinity})){
  if(!line.trim())continue;
  const s=summarize(JSON.parse(line),budget),i=summaries.length;
  streamMatches &&= !!windows[i]&&same(s,windows[i].summary);
  appendFileSync(events,JSON.stringify({hitches:s.hitches,tasks:s.longTasks,candidates:s.glitches,discontinuities:s.discontinuities})+'\n');
  summaries.push(compact(s));
 }
 streamMatches &&= summaries.length===windows.length;
 return {elapsed:item.longSession?.elapsed??null,edits:item.longSession?.windows??[],streamChunks:summaries.length,streamMatches,
  totals:summaries.reduce((a,s)=>({frames:a.frames+s.frames,hitches:a.hitches+s.hitches,tasks:a.tasks+s.tasks,candidates:a.candidates+s.candidates}),{frames:0,hitches:0,tasks:0,candidates:0}),
  streamWorstP99:summaries.length?Math.max(...summaries.map(s=>s.p99)):null,
  references:item.longReference?{first:compact(item.longReference.first),last:compact(item.longReference.last)}:null,
  privateMemoryMB:{first:item.loadAtStart?.browserPrivateMB??null,last:median(item.loadAfter?.samples?.map(s=>s.browserPrivateMB)??[])},
  tailStream:'Final raw file contains the undrained tail and final reference; retained separately, not discarded.',exportByteProof:'unverified'};
}
const folders=readdirSync(resolve(local,'runs')).filter(n=>n>='2026-10-01T09-00'&&n<'2026-10-01T12-00').sort();
for(const name of folders){
  console.log('Audit '+name);
  const folder=resolve(local,'runs',name),manifest=read(resolve(folder,'manifest.json'));index(folder);
  for(const item of manifest.results){
    const stem=[item.browser,item.profile,item.size,item.look,item.case,item.repeat].join('-');
    const config=[item.browser,item.profile,item.size,item.look].join('/');
    if(item.device&&!devices.has(config))devices.set(config,{config,version:item.version,device:item.device});
    const path=resolve(folder,stem+'-load-during.jsonl'),during=existsSync(path)?lines(path):[];
    const q=qualification(item.load,item.loadSession?.generation,item.loadSession?.qualifiedAt);
    const from=item.measurementFrom,to=item.measurementUntil;
    const interval=Number.isFinite(from)&&Number.isFinite(to)?segment(trace,from,to):[];
    const bracketed=interval.length>=2&&Date.parse(interval[0].at)<=from&&Date.parse(interval.at(-1).at)>=to;
    const traceMatches=during.every(r=>same(r,byAt.get(r.at)))&&same(during,item.loadDuring??[]);
    const completeInterval=bracketed&&same(interval,during)&&from>=start&&to<=end;
    const build=read(resolve(local,'build',manifest.phase,'provenance.json'));
    const matchesCurrent=buildChecks[manifest.phase].valid&&item.harnessHash===currentHarnessHash&&item.provenance?.buildHash===build.buildHash&&item.provenance?.sourceHash===build.sourceHash;
    const qualified=item.status==='complete'&&item.qualified===true&&matchesCurrent&&item.device?.software===false&&q.quiet&&q.matchesTrace&&q.withinWindow&&item.loadAfter?.quiet===true&&traceMatches&&completeInterval&&!loadSpiked(interval,budget.quiet);
    const rawPath=[stem+'-aborted-raw.json',stem+'-raw.json'].map(f=>resolve(folder,f)).find(existsSync);
    const raw=rawPath?read(rawPath):null,summary=raw?summarize(raw,budget):null;
    const snapshotChecks={};
    for(const tag of ['final','undo','redo']){
      const p=resolve(folder,stem+'-'+tag+'.json');
      if(existsSync(p)){
        const value=read(p),actualHash=createHash('sha256').update(JSON.stringify(value)).digest('hex');
        snapshotChecks[tag]={actualHash,matchesManifest:actualHash===item.snapshots?.[tag]};
      }
    }
    const framePath=resolve(folder,stem+'-frames'),framesCaptured=existsSync(framePath)?readdirSync(framePath).filter(f=>f.endsWith('.png')).length:0;
    const row={folder:name,phase:manifest.phase,mode:manifest.mode,hour:!!manifest.flags.hour,config,case:item.case,repeat:item.repeat,
      status:item.status,qualified:!!qualified,matchesCurrent,harnessHash:item.harnessHash,qualificationGeneration:item.loadSession?.generation??null,
      measurement:{from:from??null,until:to??null,completeInterval,bracketed,traceMatches,loadSpiked:loadSpiked(during,budget.quiet),cpu:cpu(during),unrelatedCpu:stats(during.map(r=>r.unrelatedCpuPercent).filter(Number.isFinite))},
      abort:item.abortLoad?{at:item.abortLoad.at,cpu:item.abortLoad.cpuPercent,unrelatedCpu:item.abortLoad.unrelatedCpuPercent}:null,
      device:item.device?{visibility:item.device.visibility,focused:item.device.focused,software:item.device.software,longTasksSupported:item.device.longTasksSupported}:null,
      version:item.version??null,error:item.error?.split('\n')[0]??null,
      discardTopProcesses:item.discardTopProcesses??null,
      errorContext:item.error?['Top-down','WebGL context was lost','Script terminated by timeout'].filter(s=>item.error.includes(s)):[],
      framesCaptured,audio:pcm(resolve(folder,stem+'-audio.jsonl')),
      byteChecks:item.redoExact??null,snapshotChecks,
      captureHash:item.captureHash??null,
      summary:summary?{p99:summary.p99,max:summary.max,hitches:summary.hitches.length,tasks:summary.longTasks.length,candidates:summary.glitches.length}:null,
      hourReview:manifest.flags.hour?await auditHour(folder,stem,item):null,
      diagnostic:summary?{frames:summary.frames,p99:summary.p99,max:summary.max,hitches:summary.hitches.length,unattributed:summary.hitches.filter(h=>h.unattributed).length,
        withoutOverlappingSpans:summary.hitches.filter(h=>!h.sources.length).length,tasks:summary.longTasks.length,
        candidates:summary.glitches.reduce((a,g)=>{const k=g.kind??g.type??'unknown';a[k]=(a[k]??0)+1;return a},{}),
        visibility:raw.frames.reduce((a,f)=>{const k=`${f.visibility??'unknown'}/${f.focused??'unknown'}`;a[k]=(a[k]??0)+1;return a},{}),instrumentationFrames:summary.instrumentation.frames.length}:null};
    if(summary)writeFileSync(resolve(local,'overnight-hitches',stem+'-'+name+'.json'),JSON.stringify({qualified:!!qualified,
      attribution:'Every hitch is causally unattributed. Method overlap identifies context only.',hitches:summary.hitches,longTasks:summary.longTasks,candidates:summary.glitches,discontinuities:summary.discontinuities,instrumentation:summary.instrumentation}));
    rows.push(row);
  }
}
qualification(session.qualification,session.generation,session.qualifiedAt);
const generationRows=[...generations.values()].sort((a,b)=>a.generation-b.generation);
// Each new generation must follow a discarded active interval and use later waiting samples.
for(let i=1;i<generationRows.length;i++){
  const prev=rows.filter(r=>r.qualificationGeneration===generationRows[i-1].generation);
  const discarded=prev.filter(r=>r.status==='invalid-busy');
  const boundary=Math.max(...discarded.map(r=>r.measurement.until??Date.parse(r.abort?.at)));
  generationRows[i].followsDiscard=discarded.length>0&&Number.isFinite(boundary)&&Date.parse(generationRows[i].waitingFirst)>boundary;
}
const coverage=requirements(budget).map(req=>{
  const matched=rows.filter(r=>!r.hour&&`${r.config}/${r.case}`===req.id);
  const missing={measure:[],capture:[]};
  for(const mode of ['measure','capture'])for(const phase of ['before','after'])for(let repeat=1;repeat<=(mode==='measure'?req.repeats:req.captureRepeats);repeat++)
    if(!matched.some(r=>r.mode===mode&&r.phase===phase&&r.repeat===repeat&&r.qualified))missing[mode].push(`${phase}/${repeat}`);
  return {id:req.id,attempted:matched.length,missing};
});
const inWindow=trace.filter(r=>Date.parse(r.at)>=start&&Date.parse(r.at)<=end);
const audioContexts=rows.flatMap(r=>r.audio??[]);
const diagnostics={hitches:rows.reduce((n,r)=>n+(r.diagnostic?.hitches??0),0),longTasks:rows.reduce((n,r)=>n+(r.diagnostic?.tasks??0),0),
  unattributed:rows.reduce((n,r)=>n+(r.diagnostic?.unattributed??0),0),withoutOverlappingSpans:rows.reduce((n,r)=>n+(r.diagnostic?.withoutOverlappingSpans??0),0),
  audioSeconds:audioContexts.reduce((n,c)=>n+c.seconds,0),audioGaps:audioContexts.reduce((n,c)=>n+c.gaps.length,0),audioOverlaps:audioContexts.reduce((n,c)=>n+c.overlaps.length,0)};
writeFileSync(resolve(local,'overnight-evidence.json'),JSON.stringify(evidence,null,2));
const timing=requirements(budget).map(req=>{
 const records=rows.filter(r=>r.qualified&&!r.hour&&r.mode==='measure'&&`${r.config}/${r.case}`===req.id);
 const phases={}; for(const phase of ['before','after']){
  const fixed=Array.from({length:req.repeats},(_,i)=>records.find(r=>r.phase===phase&&r.repeat===i+1));
  const observed=fixed.filter(Boolean);
  const stat=key=>({median:median(observed.map(r=>r.summary[key])),worst:observed.length?Math.max(...observed.map(r=>r.summary[key])):null});
  phases[phase]={required:req.repeats,repeats:observed.map(r=>r.repeat),complete:fixed.every(Boolean),p99:stat('p99'),maxFrame:stat('max'),hitches:stat('hitches'),tasks:stat('tasks'),candidates:stat('candidates')};
 }
 const pairs=records.filter(r=>r.phase==='before').map(b=>({before:b,after:records.find(a=>a.phase==='after'&&a.repeat===b.repeat)})).filter(p=>p.after);
 return {id:req.id,...phases,pairedRepeats:pairs.map(p=>p.before.repeat),finalBytes:pairs.map(p=>({repeat:p.before.repeat,equal:p.before.snapshotChecks.final?.actualHash===p.after.snapshotChecks.final?.actualHash,redoExact:p.before.byteChecks===true&&p.after.byteChecks===true}))};
});
const proof={window:{start:new Date(start).toISOString(),end:new Date(end).toISOString(),finished:status.finished},method:status.method,currentHarnessHash,rule:budget.quiet,
  machine:read(resolve(archive,'session/machine.json')),devices:[...devices.values()],session:{id:session.id,generation:session.generation,closedAt:session.closedAt,traceSamples:trace.length,first:trace[0]?.at,last:trace.at(-1)?.at,
    cpu:cpu(inWindow),unrelatedCpu:stats(inWindow.map(r=>r.unrelatedCpuPercent).filter(Number.isFinite)),traceFaults},
  buildChecks,attempts:rows.length,controllerAttempts:status.attempts.length,pending:status.pending.length,qualified:rows.filter(r=>r.qualified).length,
  statuses:rows.reduce((a,r)=>{a[r.status]=(a[r.status]??0)+1;return a},{}),generations:generationRows,
  capturedFrames:rows.reduce((n,r)=>n+r.framesCaptured,0),audioFiles:rows.filter(r=>r.audio?.length).length,diagnostics,
  evidenceIndex:{path:'local/overnight-evidence.json',sha256:hash(resolve(local,'overnight-evidence.json'))},
  timing, hourOutcome:status.hourOutcome, trial:status.trial, qualification:'Aborted intervals lacking end timestamps/bracketing remain incomplete, never qualified. Capture pacing is diagnostic only.',rows,coverage};
// Compact tracked index: raw traces, PCM, browser logs and millions of candidate events stay local.
const formatted=Object.entries(proof).map(([key,value])=>`  ${JSON.stringify(key)}: `+
  (['rows','coverage','generations','timing'].includes(key)?'[\n'+value.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]':JSON.stringify(value,null,2).replaceAll('\n','\n  '))).join(',\n');
writeFileSync(resolve(dir,'overnight-proof.json'),'{\n'+formatted+'\n}\n');
if(status.attempts.flatMap(a=>a.folders).some(f=>!folders.includes(f))||folders.some(f=>!status.attempts.some(a=>a.folders.includes(f))))throw new Error('Controller/manifests disagree');
if(generationRows.length!==session.generation||generationRows.some((q,i)=>q.generation!==i+1||!q.quiet||!q.matchesTrace||!q.withinWindow||i>0&&!q.followsDiscard))throw new Error('Qualification history is incomplete or inconsistent');
if(rows.some(r=>!r.matchesCurrent))throw new Error('Evidence protocol/build/source differs from final harness');
console.log(JSON.stringify({attempts:proof.attempts,statuses:proof.statuses,qualified:proof.qualified,generations:proof.generations.length,cpu:proof.session.cpu,traceFaults:traceFaults.length,frames:proof.capturedFrames,audioFiles:proof.audioFiles,pending:proof.pending}));

// Offline evidence audit only: never launches a browser or takes measurements.
import {readFileSync,readdirSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {summarize,median} from './metrics.mjs';
import {isQuiet,loadSpiked} from './coverage.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url));
const local=resolve(dir,'local'), runs=resolve(local,'runs');
mkdirSync(resolve(local,'morning-hitches'),{recursive:true});
const budget=JSON.parse(readFileSync(resolve(dir,'budgets.json')));
const fingerprint=createHash('sha256');
for(const file of ['probe.js','audio-worklet.js','scenarios.mjs','coverage.mjs','budgets.json','metrics.mjs','load.ps1','laptop-profile.ps1','run.mjs','drain.mjs']) fingerprint.update(file).update(readFileSync(resolve(dir,file)));
const currentHarnessHash=fingerprint.digest('hex');
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const lines=p=>readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const stats=xs=>({samples:xs.length,min:xs.length?Math.min(...xs):null,median:median(xs),max:xs.length?Math.max(...xs):null});
const evidence=[], rows=[];
function index(path){for(const entry of readdirSync(path,{withFileTypes:true})){
  const p=resolve(path,entry.name);if(entry.isDirectory())index(p);else evidence.push({path:relative(dir,p).replaceAll('\\','/'),sha256:digest(p)});
}}
for(const name of readdirSync(runs).filter(n=>n>='2026-09-30T14-40'&&n<'2026-09-30T16-40').sort()){
  const folder=resolve(runs,name), manifest=read(resolve(folder,'manifest.json'));index(folder);
  for(const item of manifest.results){
    const stem=[item.browser,item.profile,item.size,item.look,item.case,item.repeat].join('-');
    const files=readdirSync(folder), duringPath=resolve(folder,stem+'-load-during.jsonl');
    const during=existsSync(duringPath)?lines(duringPath):[];
    const rawPath=files.includes(stem+'-aborted-raw.json')?resolve(folder,stem+'-aborted-raw.json'):resolve(folder,stem+'-raw.json');
    const summary=existsSync(rawPath)?summarize(read(rawPath),budget):null;
    const framesPath=resolve(folder,stem+'-frames');
    const pngs=existsSync(framesPath)?readdirSync(framesPath).filter(n=>n.endsWith('.png')).sort():[];
    const audioPath=resolve(folder,stem+'-audio.jsonl');
    let audio=null;
    if(existsSync(audioPath)){
      const blocks=lines(audioPath), gaps=[];let cursor=blocks[0]?.frame,peak=0,nonzero=0,count=0,maxStep=0,previous;
      for(const block of blocks){if(block.frame!==cursor)gaps.push({expected:cursor,actual:block.frame});
        for(const value of block.pcm){peak=Math.max(peak,Math.abs(value));if(value!==0)nonzero++;count++;
          if(previous!==undefined)maxStep=Math.max(maxStep,Math.abs(value-previous));previous=value;}
        cursor=block.frame+block.pcm.length;
      }
      audio={blocks:blocks.length,samples:count,rate:blocks[0]?.rate,seconds:count/(blocks[0]?.rate??1),peak,nonzero,maxStep,gaps,
        interpretation:'Signal/gap diagnostics only; silence, sample steps and tap gaps are not verified audible faults'};
    }
    const prefix=item.load?.samples??[], waiting=item.load?.waitingSamples??prefix;
    const provenancePath=resolve(local,'build',manifest.phase,'provenance.json');
    const matchesCurrent=item.harnessHash===currentHarnessHash&&existsSync(provenancePath)&&item.provenance?.buildHash===read(provenancePath).buildHash;
    const qualified=item.status==='complete'&&item.qualified&&matchesCurrent&&item.device?.software===false&&
      isQuiet(item.load,budget.quiet)&&item.loadAfter?.quiet===true&&!loadSpiked(during,budget.quiet);
    const row={folder:name,phase:manifest.phase,mode:manifest.mode,hour:!!manifest.flags.hour,
      config:[item.browser,item.profile,item.size,item.look].join('/'),case:item.case,repeat:item.repeat,
      status:item.status,qualified:!!qualified,harnessHash:item.harnessHash,matchesCurrent,
      prefix:{quiet:isQuiet(item.load,budget.quiet),durationMs:item.load?.quietDurationMs??null,cpu:stats(prefix.map(s=>s.cpuPercent).filter(Number.isFinite))},
      waitingCpu:stats(waiting.map(s=>s.cpuPercent).filter(Number.isFinite)),
      duringCpu:stats(during.map(s=>s.cpuPercent).filter(Number.isFinite)),
      abort:item.abortLoad?{at:item.abortLoad.at,cpu:item.abortLoad.cpuPercent,unrelatedCpu:item.abortLoad.unrelatedCpuPercent}:null,
      error:item.error??null,framesCaptured:pngs.length,audio,
      diagnostic:summary?{frames:summary.frames,p99:summary.p99,max:summary.max,hitches:summary.hitches.length,
        unattributed:summary.hitches.filter(h=>h.unattributed).length,withoutOverlappingSpans:summary.hitches.filter(h=>!h.sources.length).length,tasks:summary.longTasks.length,
        candidates:summary.glitches.reduce((a,g)=>{const k=g.kind??g.type??'unknown';a[k]=(a[k]??0)+1;return a},{}),
        instrumentationFrames:summary.instrumentation.frames.length}:null};
    if(summary)writeFileSync(resolve(local,'morning-hitches',stem+'-'+name+'.json'),JSON.stringify({qualified:false,
      attribution:'Overlapping method spans identify context, not proven causality; unattributed flags are retained',
      hitches:summary.hitches,longTasks:summary.longTasks,candidates:summary.glitches,discontinuities:summary.discontinuities,instrumentation:summary.instrumentation},null,2));
    rows.push(row);
  }
}
const archive=resolve(local,'windows/2026-09-30-0740');
const loadPath=resolve(archive,'window-load.jsonl'), statusPath=resolve(archive,'window-status.json');
const windowSamples=lines(loadPath).filter(s=>Date.parse(s.at)>=Date.parse('2026-09-30T14:40:00Z')&&Date.parse(s.at)<=Date.parse('2026-09-30T16:40:00Z'));
for(const p of [loadPath,statusPath,resolve(archive,'window-run.log')])evidence.push({path:relative(dir,p).replaceAll('\\','/'),sha256:digest(p)});
writeFileSync(resolve(local,'morning-evidence.json'),JSON.stringify(evidence,null,2));
const proof={window:{start:'2026-09-30T14:40:00Z',end:'2026-09-30T16:40:00Z',finished:read(statusPath).finished},
  rule:budget.quiet,currentHarnessHash,attempts:rows.length,qualified:rows.filter(r=>r.qualified).length,
  statuses:rows.reduce((a,r)=>{a[r.status]=(a[r.status]??0)+1;return a},{}),
  dispatchCpu:stats(windowSamples.map(s=>s.cpuPercent).filter(Number.isFinite)),
  capturedFrames:rows.reduce((n,r)=>n+r.framesCaptured,0),audioFiles:rows.filter(r=>r.audio).length,
  evidenceIndex:{path:'local/morning-evidence.json',sha256:digest(resolve(local,'morning-evidence.json'))},
  qualification:'No capture timing counts as interaction pacing; discarded diagnostics cannot certify smoothness',rows};
writeFileSync(resolve(dir,'morning-proof.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify({...proof,rows:rows.map(r=>({folder:r.folder,status:r.status,quiet:r.prefix.quiet,abort:r.abort,
  frames:r.framesCaptured,audio:r.audio&&{seconds:r.audio.seconds,peak:r.audio.peak,gaps:r.audio.gaps.length},diagnostic:r.diagnostic}))},null,2));

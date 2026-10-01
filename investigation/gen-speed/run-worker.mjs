import {parentPort} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {dir} from './build.mjs';
import {resultIdentity,digest,identityState,compareRaw} from './identity.mjs';
import {trace} from './trace.mjs';
const modules={};
let pending=null;
for(const v of ['before','after'])modules[v]=await import(pathToFileURL(resolve(dir,`local/${v}-profile.mjs`)));
parentPort.on('message',({theme,size,seed,variant,rep,reopen=false})=>{
  try {
    const m=modules[variant],lands=[],events=[],prof=trace();globalThis.__gs=prof;
    const spec=m.decodeSpecFragment(`s=${seed}&t=${theme}&z=${size}&d=n`).spec;
    const cpu0=process.threadCpuUsage(),start=performance.now();
    const attempts=[];
    const r=m.generate(spec,{onLand(l){lands.push(structuredClone(l));events.push({kind:'land',attempt:l.attempt,at:performance.now()-start});prof.land();},onProgress(p){events.push({...p,at:performance.now()-start});},onAttempt(a){attempts.push({attempt:a.attempt,passed:a.passed,stage:a.result.info.stage,firstLand:a.result.timings.firstLook,genomes:a.result.info.genomes,settles:a.result.info.settles,at:performance.now()-start});}});
    const wall=performance.now()-start,cpu=process.threadCpuUsage(cpu0);prof.finish();globalThis.__gs=undefined;
    const identity=resultIdentity(r,lands);
    const caseKey=`${theme}/${size}/${seed}/${rep}`;
    const state=identityState(r,lands);let rawCompared=false;
    if(pending?.key===caseKey&&pending.variant!==variant){compareRaw(state,pending.state);rawCompared=true;pending=null;}
    else pending={key:caseKey,variant,state};
    let roundtrip=null;
    if(reopen&&r.report.passed){const p=m.encodeProject(m.generatedDocument(r));const d=m.decodeProject(p);const s=m.MapSession.open(d);roundtrip={project:digest(p),bytes:digest(s.exportTimber().bytes)};if(roundtrip.bytes!==identity.timber)throw Error('reopened bytes differ');}
    parentPort.postMessage({ok:true,row:{theme,size,seed,variant,rep,wall,cpu:(cpu.user+cpu.system)/1000,timings:r.timings,identity,rawCompared,passed:r.report.passed,attempts,events,prof:{totals:prof.totals,categories:prof.categories},roundtrip}});
  }catch(e){parentPort.postMessage({ok:false,error:e.stack});}
});

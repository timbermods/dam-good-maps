import {parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {dir} from '../build.mjs';import {resultIdentity,digest} from '../identity.mjs';import {trace} from '../trace.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const modules={};for(const v of workerData.variants)modules[v]=await import(pathToFileURL(resolve(dir,`local/${v}-profile.mjs`)));
parentPort.on('message',({theme,size,seed,variant,rep})=>{try{
 const m=modules[variant],lands=[],attempts=[],prof=trace();globalThis.__gs=prof;
 const spec=m.decodeSpecFragment(`s=${seed}&t=${theme}&z=${size}&d=n`).spec;
 const cpu0=process.threadCpuUsage(),start=performance.now();
 const r=m.generate(spec,{onLand(l){lands.push(structuredClone(l));prof.land();},onAttempt(a){attempts.push({attempt:a.attempt,passed:a.passed,stage:a.result.info.stage,firstLand:a.result.timings.firstLook,genomes:a.result.info.genomes,settles:a.result.info.settles,failed:a.result.report.checks.filter(c=>!c.ok&&!c.advisory&&c.applicable!==false&&!c.approximate).map(c=>c.id),at:performance.now()-start});}});
 const wall=performance.now()-start,cpu=process.threadCpuUsage(cpu0);prof.finish();globalThis.__gs=undefined;
 let changed=0;if(lands.length)for(let i=0;i<size*size;i++)if(lands[0].heights[i]!==r.built.heights[i])changed++;
 const o=r.outcomes;
 const components=Object.fromEntries(Object.entries({timber:r.bytes,land:lands,terrain:r.built.heights,water:[r.built.water,r.built.contamination,r.built.settle,r.built.moisture,r.built.soilContamination],objects:r.built.entities,features:r.features,field:r.field,decisions:[r.spec,r.info,r.outcomes,r.report]}).map(([k,v])=>[k,digest(v)]));
 const sha=a=>createHash('sha256').update(a).digest('hex');
 const uiProof={response:{sha256:sha(r.bytes),passed:r.report.passed},...(lands.length?{land:{heights:sha(lands[0].heights),water:sha(lands[0].water)}}:{})};
 if(process.env.GEN_SHEETS==='1'&&variant==='round2'&&size===128&&seed<=30&&rep===0){const folder=resolve(dir,'local/round2-grids');mkdirSync(folder,{recursive:true});const grid=new Uint8Array(size*size*2);grid.set(r.built.heights);grid.set(Uint8Array.from(r.built.water,d=>d>0.05?1:0),size*size);writeFileSync(resolve(folder,`${theme}-${seed}.grid`),grid);}
 parentPort.postMessage({ok:true,row:{theme,size,seed,variant,rep,wall,cpu:(cpu.user+cpu.system)/1000,timings:r.timings,identity:resultIdentity(r,lands),components,uiProof,passed:r.report.passed,outcomes:o?{met:o.met,promise:o.promise,water:o.story.readable,standout:!!o.standout,signature:o.signature,why:o.story.why}:null,shown:lands.length,changed,genomes:r.info.genomes,attempts,fixes:r.info.fixes,prof:{totals:prof.totals,categories:prof.categories}}});
}catch(e){parentPort.postMessage({ok:false,error:e.stack});}});

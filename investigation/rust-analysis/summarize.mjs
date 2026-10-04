import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
const read=p=>JSON.parse(readFileSync(p)),get=n=>read(resolve(LOCAL,n));
const median=v=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
const stats=v=>({median:median(v),worst:Math.max(...v)});
const fingerprint=hash(Buffer.concat(['worker.js','analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n)))));
const nativeFingerprint=hash(Buffer.concat(['analysis.node','native-bridge.cjs','api.cjs'].map(n=>readFileSync(resolve(LOCAL,n))).concat(['native.mjs','replay.mjs','codec.mjs'].map(n=>readFileSync(resolve(HERE,n))))));
const corpus=get('corpus.json'),cases=corpus.cases;
const status={corpus:cases.length,native:0,browsers:{},timed:{},generation:{},batch:0};
const missing=[];
function need(ok,label){if(!ok)missing.push(label);}
need(cases.length===872,'872 corpus cases');
need(cases.filter(c=>c.id.startsWith('m9b-')).length===840,'840 M9b cases');
need(cases.filter(c=>c.id.startsWith('official-')).length===19,'19 official maps');
need(cases.filter(c=>c.id.startsWith('golden-')).length===12,'12 golden fixtures');
const nativePass=[];
for(const c of cases){need(c.identity,c.id+' original paired identity');const path=resolve(LOCAL,'cases',c.id+'.native-pass.json');if(existsSync(path)){const r=read(path);if(r.fingerprint===nativeFingerprint&&r.input===c.input){assert.equal(r.calls,c.calls,c.id+' trace call count');status.native++;nativePass.push(r);}}}
need(status.native===872,'complete native trace/high-level matrix');
const browserRows={};
for(const engine of ['chromium','firefox','webkit']){
 const rows=readdirSync(resolve(LOCAL,'browser-records')).filter(n=>n.startsWith(engine+'-')&&n.endsWith(fingerprint+'.json')).map(n=>read(resolve(LOCAL,'browser-records',n)));
 const selected=[];for(const c of cases){const r=rows.find(r=>r.id===c.id&&r.input===c.input&&!r.roomOnly);if(!r)continue;const high=read(resolve(LOCAL,'cases',c.id+'.high.json')).expected;assert.equal(r.high,high,engine+'/'+c.id);if(c.id.startsWith('m9b-'))assert.equal(r.hasRoom,true,engine+'/'+c.id+' room traces');selected.push(r);}
 browserRows[engine]=selected;status.browsers[engine]=selected.length;need(selected.length===872,engine+' full matrix');
 status.timed[engine]=selected.filter(r=>r.analyses.length&&/-1$/.test(r.id)).length;need(status.timed[engine]===21,engine+' 21 timing cells');
}
const nativeCases=get('native-cases.json').rows;status.timed.native=nativeCases.length;need(nativeCases.length===21,'native 21 timing cells');
const timing=[];
for(const[engine,rows]of Object.entries({...browserRows,native:nativeCases}))for(const r of rows)for(const category of ['kernelTimes','analyses'])for(const a of r[category]){
 need(a.before.length===3&&a.after.length===3,engine+'/'+r.id+'/'+a.name+' timing repetitions');
 timing.push({engine,id:r.id,kind:category==='analyses'?'complete':'kernel',name:a.name,before:stats(a.before),after:stats(a.after),samples:{before:a.before,after:a.after},load:r.load});
}
const m9bFingerprint=hash(Buffer.concat(['m9b-worker.js','analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n)))));
status.m9bBrowsers={};const m9bRecords={};
for(const engine of ['chromium','firefox','webkit']){
 const directory=resolve(LOCAL,'m9b-browser-records');const rows=existsSync(directory)?readdirSync(directory).filter(n=>n.startsWith(engine+'-')&&n.endsWith(m9bFingerprint+'.json')).map(n=>read(resolve(directory,n))).filter(r=>r.identity&&r.input===hash(readFileSync(resolve(LOCAL,'cases',r.id+'.m9b.json.gz')))):[];
 status.m9bBrowsers[engine]=rows.length;need(rows.length===840,engine+' every complete M9b descriptive measure row');m9bRecords[engine]=rows;
}
const nativeM9b=existsSync(resolve(LOCAL,'native-m9b-cases.json'))?get('native-m9b-cases.json').rows:[];need(nativeM9b.length===21,'native M9b descriptive timing cells');
for(const[engine,rows]of Object.entries({...m9bRecords,native:nativeM9b})){
 const timed=rows.filter(r=>r.times.length);need(timed.length===21,engine+' 21 M9b descriptive timing cells');
 for(const r of timed)for(const a of r.times){need(a.before.length===3&&a.after.length===3,engine+'/'+r.id+' descriptive repetitions');timing.push({engine,id:r.id,kind:'complete',name:a.name,before:stats(a.before),after:stats(a.after),samples:{before:a.before,after:a.after},load:r.load});}
}
const generations={},generationRows=[];
for(const engine of ['chromium','firefox','webkit','native']){
 const g=get('generation-'+engine+'.json');const rows=engine==='native'?g.rows:g.rows.flatMap(r=>r.rows.map(x=>({...x,theme:r.theme,load:r.load})));
 status.generation[engine]=rows.length;need(rows.length===42,engine+' 7 themes x 3 generation pairs');
 const summary={};for(const backend of ['typescript',engine==='native'?'native':'wasm']){
  const reps=[0,1,2].map(rep=>{const group=rows.filter(r=>r.rep===rep&&r.backend===backend);need(group.length===7,engine+'/'+backend+'/'+rep+' themes');return{ms:group.reduce((s,r)=>s+r.ms,0),analysis:group.reduce((s,r)=>s+r.analysis,0)};});
  summary[backend]={generation:stats(reps.map(r=>r.ms/7)),analysis:stats(reps.map(r=>r.analysis/7)),share:stats(reps.map(r=>r.analysis/r.ms)),load:{mean:rows.filter(r=>r.backend===backend).map(r=>r.load.mean),max:Math.max(...rows.filter(r=>r.backend===backend).map(r=>r.load.max))}};
 }
 generations[engine]=summary;generationRows.push(...rows.map(r=>({engine,...r})));
}
const batch=get('native-batch.json');status.batch=batch.rows.length;need(batch.rows.length===3,'three full native batch repetitions');assert.equal(batch.threads,16);
for(const r of batch.rows){need(r.records.length===840,'batch '+r.rep+' count');for(const c of r.records){const meta=cases.find(x=>x.id===c.id);assert.equal(c.actual,meta.highLevel,c.id+' native full batch result');assert.equal(c.identityChecked,true);}}
const ir=get('ir.json');need(ir.rows.length===3&&ir.rows.every(r=>r.status==='pass'),'strict floating point IR');need(get('typecheck.json').status==='pass','adapter types');
need(get('water-contract.json').status==='pass','native resident water contracts');
need(get('exe-contract.json').status==='pass','standalone native executable contracts');
if(existsSync(resolve(LOCAL,'native-exports.json'))){const exports=get('native-exports.json');need(exports.status==='pass'&&exports.records.length===840&&exports.records.every(r=>r.identity),'all 840 complete native export bytes');}else need(false,'all 840 complete native export bytes');
status.missing=missing;writeFileSync(resolve(LOCAL,'gate.json'),JSON.stringify(status,null,2)+'\n');console.log(JSON.stringify(status,null,2));
if(missing.length){if(!process.argv.includes('--status'))process.exitCode=1;}else{
 const sources=Object.fromEntries(readdirSync(HERE).filter(n=>/\.(rs|ts|mjs|ps1|toml)$/.test(n)).sort().map(n=>[n,hash(readFileSync(resolve(HERE,n)))]));
 const binaries=Object.fromEntries(['analysis.wasm','analysis.exe','analysis.node'].map(n=>[n,{sha256:hash(readFileSync(resolve(LOCAL,n))),bytes:readFileSync(resolve(LOCAL,n)).length}]));
 const aggregateCalls=cases.reduce((s,c)=>s+c.calls,0)+nativePass.reduce((s,r)=>s+r.roomCalls,0);
 const profile={};for(const r of generationRows.filter(r=>r.engine==='native'&&r.backend==='typescript'))for(const[k,v]of Object.entries(r.totals))profile[k]=(profile[k]??0)+v.self/21;
 const evidence={base:get('build.json').base,water:get('native-build.json').waterCommit,corpusFingerprint:corpus.fingerprint,browserFingerprint:fingerprint,nativeFingerprint,status:{...status,missing:undefined},machine:get('native-cases.json').machine,engines:Object.fromEntries(Object.entries(browserRows).map(([e,r])=>[e,r[0].version])),sources,binaries,identity:{cases:872,capturedKernelCalls:aggregateCalls,edgeComparisons:1762,corpusRecords:hash(JSON.stringify(cases)),nativeRecords:hash(JSON.stringify(nativePass.sort((a,b)=>a.id.localeCompare(b.id)))),browserRecords:Object.fromEntries(Object.entries(browserRows).map(([e,r])=>[e,hash(JSON.stringify(r.sort((a,b)=>a.id.localeCompare(b.id))))])),method:'Paired complete M9b generation and every captured kernel call; cross-engine raw-byte replay and complete validation/measures/outcomes; native complete generation with Rust water. Only clock-derived fields excluded.'},strictIR:ir,typecheck:get('typecheck.json'),generations,nativeBatch:{threads:16,samples:batch.rows.map(r=>({rep:r.rep,ms:r.ms,load:r.load})),...stats(batch.rows.map(r=>r.ms))},baselineExclusiveProfile:Object.entries(profile).sort((a,b)=>b[1]-a[1])};
 const exports=get('native-exports.json');evidence.contracts={smoke:get('smoke.json'),water:get('water-contract.json'),executable:get('exe-contract.json'),nativeExports:{count:exports.records.length,recordsSha256:hash(JSON.stringify(exports.records)),refusals:exports.records.filter(r=>r.bytes===0).map(r=>r.id)}};
 evidence.generationWorkerFingerprints=Object.fromEntries(['chromium','firefox','webkit'].map(engine=>[engine,get('generation-'+engine+'.json').fingerprint]));
 evidence.timingPolicy='Fixed six kernels in all targets; three paired repetitions; total generation includes unchanged TypeScript water for shares. Full native batch additionally uses resident Rust water. Firefox performance fails adoption gate.';
 evidence.m9bDescription={fingerprint:m9bFingerprint,build:get('m9b-browser-build.json'),records:Object.fromEntries(Object.entries(m9bRecords).map(([engine,rows])=>[engine,hash(JSON.stringify(rows.sort((a,b)=>a.id.localeCompare(b.id))))]))};
 writeFileSync(resolve(HERE,'EVIDENCE.json'),JSON.stringify(evidence,null,2)+'\n');
 const csv=(name,columns,rows)=>writeFileSync(resolve(HERE,name),columns.join(',')+'\n'+rows.map(r=>columns.map(c=>JSON.stringify(r[c]??'')).join(',')).join('\n')+'\n');
 csv('TIMINGS.csv',['engine','id','kind','name','before_median_ms','before_worst_ms','after_median_ms','after_worst_ms','before_0','before_1','before_2','after_0','after_1','after_2','cpu_mean_percent','cpu_max_percent','cpu_samples'],timing.map(r=>({engine:r.engine,id:r.id,kind:r.kind,name:r.name,before_median_ms:r.before.median,before_worst_ms:r.before.worst,after_median_ms:r.after.median,after_worst_ms:r.after.worst,...Object.fromEntries(r.samples.before.map((v,i)=>['before_'+i,v])),...Object.fromEntries(r.samples.after.map((v,i)=>['after_'+i,v])),cpu_mean_percent:r.load.mean,cpu_max_percent:r.load.max,cpu_samples:r.load.samples})));
 csv('GENERATION.csv',['engine','theme','rep','backend','generation_ms','analysis_ms','analysis_share','cpu_mean_percent','cpu_max_percent','cpu_samples'],generationRows.map(r=>({...r,generation_ms:r.ms,analysis_ms:r.analysis,analysis_share:r.share,cpu_mean_percent:r.load.mean,cpu_max_percent:r.load.max,cpu_samples:r.load.samples})));
 console.log('All gates pass. Compact evidence and timing tables saved.');
}

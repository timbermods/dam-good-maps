import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {HERE,LOCAL,hash} from './common.mjs';
import {firefoxRuntime} from './firefox-runtime.mjs';
const read=p=>JSON.parse(readFileSync(p)),get=n=>read(resolve(LOCAL,n));
const sha=n=>hash(readFileSync(resolve(LOCAL,n))),source=n=>hash(readFileSync(resolve(HERE,n)));
const stats=v=>({median:[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)],worst:Math.max(...v)});
const current=firefoxRuntime(),cases=get('corpus.json').cases,missing=[],need=(ok,label)=>{if(!ok)missing.push(label);};
const fingerprints={browser:hash(Buffer.concat(['worker.js','analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n))))),m9b:hash(Buffer.concat(['m9b-worker.js','analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n))))),native:hash(Buffer.concat(['analysis.node','native-bridge.cjs','api.cjs'].map(n=>readFileSync(resolve(LOCAL,n))).concat(['native.mjs','replay.mjs','codec.mjs'].map(n=>readFileSync(resolve(HERE,n))))))};
const status={native:0,browsers:{},m9b:{}},gates={};
const native=[];
for(const c of cases){const path=resolve(LOCAL,'cases',c.id+'.native-pass.json');if(!existsSync(path))continue;const r=read(path);if(r.fingerprint!==fingerprints.native||r.input!==c.input)continue;assert.equal(r.calls,c.calls);native.push(r);}
status.native=native.length;need(status.native===872,'native 872');gates.native=hash(JSON.stringify(native.sort((a,b)=>a.id.localeCompare(b.id))));
for(const engine of ['chromium','firefox','webkit']){
 const runtime=engine==='firefox'?current.fingerprint:null;
 const rows=readdirSync(resolve(LOCAL,'browser-records')).filter(n=>n.startsWith(engine+'-')&&n.endsWith(fingerprints.browser+'.json')).map(n=>read(resolve(LOCAL,'browser-records',n)));
 const selected=[];for(const c of cases){const r=rows.find(r=>r.id===c.id&&r.input===c.input&&r.runtimeFingerprint===runtime&&!r.roomOnly);if(!r)continue;assert.equal(r.calls,c.calls+(native.find(n=>n.id===c.id)?.roomCalls??0));assert.equal(r.high,read(resolve(LOCAL,'cases',c.id+'.high.json')).expected);selected.push(r);}
 status.browsers[engine]=selected.length;need(selected.length===872,engine+' 872 traces');gates[engine]=hash(JSON.stringify(selected.sort((a,b)=>a.id.localeCompare(b.id))));
 const m9b=readdirSync(resolve(LOCAL,'m9b-browser-records')).filter(n=>n.startsWith(engine+'-')&&n.endsWith(fingerprints.m9b+'.json')).map(n=>read(resolve(LOCAL,'m9b-browser-records',n))).filter(r=>r.identity&&r.runtimeFingerprint===runtime&&r.input===sha('cases/'+r.id+'.m9b.json.gz'));
 status.m9b[engine]=m9b.length;need(m9b.length===840,engine+' 840 full M9b rows');gates[engine+'M9b']=hash(JSON.stringify(m9b.sort((a,b)=>a.id.localeCompare(b.id))));
}
const contracts={};for(const name of ['smoke','water-contract','exe-contract','typecheck','ir','followup/guards']){const path=resolve(LOCAL,name+'.json');if(!existsSync(path)){need(false,name);continue;}const v=read(path);need(v.status==='pass'||(name==='ir'&&v.rows.length===3&&v.rows.every(r=>r.status==='pass')),name+' pass');contracts[name]=v;}
if(contracts['followup/guards'])assert.equal(contracts['followup/guards'].source,source('analysis.rs'));
const exports=get('native-exports.json');need(exports.binary===sha('analysis.node')&&exports.snapshotsRetained&&exports.records.length===840&&exports.records.every(r=>r.identity),'current full native generation/exports');gates.nativeExports=hash(JSON.stringify(exports));
const historical=read(resolve(HERE,'EVIDENCE.json'));
const baselineSource=readFileSync(resolve(LOCAL,'followup/before-analysis.rs'),'utf8').replaceAll('\r\n','\n');
assert.equal(baselineSource,execFileSync('git',['show','c336b37e:investigation/rust-analysis/analysis.rs'],{cwd:HERE,encoding:'utf8'}).replaceAll('\r\n','\n'),'original Rust source');
const analysesPath=resolve(LOCAL,'followup/firefox-analyses.json'),generationPath=resolve(LOCAL,'followup/firefox-generation.json');
need(existsSync(analysesPath),'analysis measurements');need(existsSync(generationPath),'generation measurements');
status.missing=missing;console.log(JSON.stringify(status,null,2));if(missing.length){if(!process.argv.includes('--status'))process.exitCode=1;}else{
 const analyses=read(analysesPath),generation=read(generationPath);
 for(const e of [analyses,generation]){assert.equal(e.runtimeFingerprint,current.fingerprint);assert.equal(e.reps,3);assert.equal(e.fingerprint,hash(Buffer.concat(['profile-worker.js','analysis.wasm','followup/before-analysis.wasm'].map(n=>readFileSync(resolve(LOCAL,n))))));}
 assert.equal(analyses.records.length,21);assert.equal(generation.records.length,7);
 const timings=analyses.records.flatMap(c=>[...new Set(c.rows.map(r=>r.name))].map(name=>{const result={id:c.id,size:c.size,theme:c.theme,name,load:c.load};for(const backend of ['typescript','before','after']){const samples=c.rows.filter(r=>r.name===name&&r.backend===backend);assert.equal(samples.length,3);result[backend]={...stats(samples.map(r=>r.ms)),samples};}return result;}));
 const generationRows=generation.records.flatMap(c=>c.rows.map(r=>({...r,theme:c.theme,load:c.load})));assert.equal(generationRows.length,63);
 const generations={};for(const backend of ['typescript','before','after']){const reps=[0,1,2].map(rep=>{const rows=generationRows.filter(r=>r.backend===backend&&r.rep===rep);assert.equal(rows.length,7);return{ms:rows.reduce((s,r)=>s+r.ms,0)/7,analysis:rows.reduce((s,r)=>s+r.analysis,0)/7,share:rows.reduce((s,r)=>s+r.analysis,0)/rows.reduce((s,r)=>s+r.ms,0)};});generations[backend]={generation:stats(reps.map(r=>r.ms)),analysis:stats(reps.map(r=>r.analysis)),share:stats(reps.map(r=>r.share)),samples:reps};}
 const aggregate=[];for(const size of [96,128,256])for(const name of [...new Set(timings.map(r=>r.name))]){const cells=timings.filter(r=>r.size===size&&r.name===name);if(!cells.length)continue;const entry={size,name,cells:cells.length};for(const backend of ['typescript','before','after'])entry[backend]=stats([0,1,2].map(rep=>cells.reduce((s,r)=>s+r[backend].samples.find(x=>x.rep===rep).ms,0)/cells.length));aggregate.push(entry);}
 const evidence={baselineCommit:'c336b37e',baselineSourceSha256:hash(baselineSource),base:historical.base,water:historical.water,date:new Date().toISOString(),machine:analyses.machine,threads:analyses.threads,version:analyses.version,runtime:current.evidence,runtimeFingerprint:current.fingerprint,fingerprints,binaries:Object.fromEntries(['analysis.wasm','analysis.node','analysis.exe','followup/before-analysis.wasm'].map(n=>[n,{sha256:sha(n),bytes:readFileSync(resolve(LOCAL,n)).length}])),sources:Object.fromEntries(readdirSync(HERE).filter(n=>/\.(rs|ts|mjs|ps1|py)$/.test(n)).sort().map(n=>[n,source(n)])),status,gates,contracts,identity:{cases:872,m9b:840,calls:native.reduce((s,r)=>s+r.calls+r.roomCalls,0),clockExclusions:['ms','cpu','spent[].ms']},aggregate,generations,timingCells:timings.length,timingRecordsSha256:hash(JSON.stringify(timings)),rawGenerationRows:generationRows.map(({totals,...row})=>row),loads:{analysis:analyses.records.map(r=>({id:r.id,...r.load})),generation:generation.records.map(r=>({theme:r.theme,...r.load}))},method:analyses.method,historicalFirefox:historical.generations.firefox,measurementHashes:{analyses:hash(readFileSync(analysesPath)),generation:hash(readFileSync(generationPath))}};
 writeFileSync(resolve(HERE,'PROFILE_EVIDENCE.json'),JSON.stringify(evidence,null,2)+'\n');
 const columns=['id','size','name','typescript_median_ms','typescript_worst_ms','before_median_ms','before_worst_ms','after_median_ms','after_worst_ms','typescript_0','typescript_1','typescript_2','before_0','before_1','before_2','after_0','after_1','after_2','cpu_mean_percent','cpu_max_percent','cpu_samples'];
 const rows=timings.map(r=>({id:r.id,size:r.size,name:r.name,...Object.fromEntries(['typescript','before','after'].flatMap(k=>[[''+k+'_median_ms',r[k].median],[''+k+'_worst_ms',r[k].worst]])),...Object.fromEntries(['typescript','before','after'].flatMap(k=>r[k].samples.map(s=>[k+'_'+s.rep,s.ms]))),cpu_mean_percent:r.load.mean,cpu_max_percent:r.load.max,cpu_samples:r.load.samples}));
 writeFileSync(resolve(HERE,'PROFILE_TIMINGS.csv'),columns.join(',')+'\n'+rows.map(r=>columns.map(c=>JSON.stringify(r[c]??'')).join(',')).join('\n')+'\n');console.log('All follow-up identity and timing gates pass');
}

import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,hash} from './common.mjs';
const read=n=>JSON.parse(readFileSync(resolve(LOCAL,n)));
// The queued report step runs only after the matrix; repair complete short cells first.
if(read('measurements.json').rows.some(r=>r.stage==='bench'&&r.load.mean===null))await import('./repair-load.mjs');
const data=read('measurements.json'),bench=data.rows.filter(r=>r.stage==='bench'),smoke=data.rows.some(r=>r.stage==='smoke')?data.rows.filter(r=>r.stage==='smoke'):read('identity-evidence.json').rows;
const engines=['chromium','firefox','webkit'],sizes=[128,256,512],counts=[1,2,4,8,16];
const configs=['rust-scalar/1',...counts.flatMap(n=>['rust/'+n,'typescript/'+n])];
const matrix=[],policies=[];
const sourceCode=s=>s.split('; ').map(s=>s.startsWith('Windows PDH')?'pdh':s.startsWith('os.cpus')?'cpu-deltas':s).join(',');
const compactLoad=l=>({mean:l.mean,peak:l.max,samples:l.samples,source:sourceCode(l.source),provisional:l.mean>20});
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
for(const engine of engines)for(const size of sizes){
 const group=[];
 for(const config of configs){const [backend,t]=config.split('/'),threads=Number(t),rows=bench.filter(r=>r.engine===engine&&r.size===size&&r.backend===backend&&r.threads===threads);
  if(rows.length!==3||rows.some(r=>r.samples.length!==3))throw Error('Incomplete repeated matrix '+engine+'/'+size+'/'+config);
  for(const row of rows)for(const s of row.samples){const c=data.selected.find(c=>c.id===row.id);if(s.sha256!==c.expected||s.input!==c.input||s.ticks!==c.ticks)throw Error('Identity metadata mismatch');}
  const item={engine,size,config,medianSumMs:rows.reduce((s,r)=>s+r.median,0),worstSumMs:rows.reduce((s,r)=>s+r.worst,0),startupMedianMs:median(rows.map(r=>r.startup.startup)),startupWorstMs:Math.max(...rows.map(r=>r.startup.startup)),cases:rows.map(r=>({id:r.id,medianMs:r.median,worstMs:r.worst,samplesMs:r.samples.map(s=>s.ms),sampleLoads:r.samples.map(s=>compactLoad(s.load)),provisional:r.samples.some(s=>s.load.mean>20),loadMean:r.load.mean,loadPeak:r.load.max,loadSamples:r.load.samples,loadSource:sourceCode(r.load.source),startupMs:r.startup.startup,phases:r.samples.at(-1).stats??null}))};
  matrix.push(item);group.push(item);
 }
 const sorted=[...group].sort((a,b)=>a.medianSumMs-b.medianSumMs),fastest=sorted[0];
 // On this shared PC, tiny differences do not justify reserving more cores or a worse tail.
 const eligible=group.filter(r=>r.medianSumMs<=fastest.medianSumMs*1.05&&r.worstSumMs<=fastest.worstSumMs*1.05)
  .sort((a,b)=>Number(a.config.split('/')[1])-Number(b.config.split('/')[1])||a.worstSumMs-b.worstSumMs);
 const best=eligible[0],scalar=group.find(r=>r.config==='rust-scalar/1'),ts=group.find(r=>r.config==='typescript/1');
 policies.push({engine,size,provisional:group.some(g=>g.cases.some(c=>c.provisional)),loadMin:Math.min(...best.cases.map(c=>c.loadMean)),loadMax:Math.max(...best.cases.map(c=>c.loadMean)),config:best.config,fastestMedianConfig:fastest.config,medianSumMs:best.medianSumMs,worstSumMs:best.worstSumMs,versusTS:ts.medianSumMs/best.medianSumMs,versusRust:scalar.medianSumMs/best.medianSumMs,minCaseGainAgainstTS:Math.min(...best.cases.map(c=>ts.cases.find(t=>t.id===c.id).medianMs/c.medianMs)),runnerUp:sorted[1].config,runnerUpGap:sorted[1].medianSumMs/fastest.medianSumMs-1});
}
if(bench.length!==297)throw Error('Unexpected matrix length');
const faults=read('faults.json');if(faults.rows.length!==24||faults.typecheck!=='pass')throw Error('Incomplete fault/ownership checks');
if(smoke.length!==45||smoke.some(r=>r.checks!==4800))throw Error('Incomplete forced 1/2/3/4/7/8/16 golden matrix');
const historical=['abrupt-shutdown-smoke.json','ordered-shutdown-smoke.json','serialization-inclusive.json'].filter(n=>existsSync(resolve(LOCAL,n))).flatMap(n=>read(n).failures.map(f=>({source:n,...f})));
if([...historical,...data.failures].some(f=>/byte \d+|identity mismatch|length mismatch/i.test(f.error)))throw Error('A recorded numerical mismatch must be investigated before delivery');
const weather=read('weather.json');if(weather.rows.length!==33||!weather.fixture.forcingDistinct?.some(n=>n>1)||weather.rows.some(r=>r.input!==weather.fixture.input||r.expected!==weather.fixture.expected))throw Error('Incomplete identical-forcing Weather identity');
const priorIdentity=data.rows.some(r=>r.stage==='smoke')?data.build:read('serialization-inclusive.json').build,currentBuild=read('build.json');if(priorIdentity.scalarWasm!==currentBuild.scalarWasm||priorIdentity.sharedWasm!==currentBuild.sharedWasm)throw Error('Retained smoke kernel changed');
for(const [name,digest]of Object.entries(priorIdentity.inputs))if(name!=='coordinator.ts'&&currentBuild.inputs[name]!==digest)throw Error('Retained smoke backend source changed: '+name);
const load=bench.map(r=>r.load.mean),build=read('build.json'),ir=read('ir.json');
if(load.some(v=>v===null))throw Error('Rerun short cells with missing load using repair-load.mjs');
const screenPolicies=[...policies],confirmation=existsSync(resolve(LOCAL,'confirmation.json'))?read('confirmation.json'):null;
if(confirmation){
 if(confirmation.screenFingerprint!==data.fingerprint)throw Error('Confirmation uses a different screen');
 if(confirmation.rows.length!==27)throw Error('Incomplete paired confirmation');
 if(confirmation.failures.some(f=>/byte \d+|identity mismatch/i.test(f.error)))throw Error('Confirmation numerical failure');
 const confirmed=[];
 for(const engine of engines)for(const size of sizes){
  const rows=confirmation.rows.filter(r=>r.engine===engine&&r.size===size),selection=screenPolicies.find(p=>p.engine===engine&&p.size===size);
  if(rows.length!==3)throw Error('Missing paired cases');
  const choices=[...new Set(['rust-scalar/1','typescript-scalar/1',selection.config])].map(config=>{
   const cases=rows.map(r=>{const samples=r.samples.filter(s=>s.config===config);if(samples.length!==3)throw Error('Missing repeated control '+config);return {id:r.id,medianMs:median(samples.map(s=>s.ms)),worstMs:Math.max(...samples.map(s=>s.ms)),samplesMs:samples.map(s=>s.ms),sampleLoads:samples.map(s=>compactLoad(s.load)),provisional:samples.some(s=>s.load.mean>20),loadMean:samples.reduce((v,s)=>v+s.load.mean,0)/samples.length,loadPeak:Math.max(...samples.map(s=>s.load.max))};});
   return {config,medianSumMs:cases.reduce((s,c)=>s+c.medianMs,0),worstSumMs:cases.reduce((s,c)=>s+c.worstMs,0),cases};
  });
  const fastest=choices.reduce((a,b)=>a.medianSumMs<b.medianSumMs?a:b),best=choices.filter(c=>c.medianSumMs<=fastest.medianSumMs*1.05&&c.worstSumMs<=fastest.worstSumMs*1.05).sort((a,b)=>Number(a.config.split('/')[1])-Number(b.config.split('/')[1])||a.worstSumMs-b.worstSumMs)[0];
  const scalar=choices.find(c=>c.config==='rust-scalar/1'),ts=choices.find(c=>c.config==='typescript-scalar/1');
  confirmed.push({engine,size,provisional:selection.provisional||choices.some(g=>g.cases.some(c=>c.provisional)),loadMin:Math.min(...best.cases.map(c=>c.loadMean)),loadMax:Math.max(...best.cases.map(c=>c.loadMean)),config:best.config,screenConfig:selection.config,fastestMedianConfig:fastest.config,medianSumMs:best.medianSumMs,worstSumMs:best.worstSumMs,versusTS:ts.medianSumMs/best.medianSumMs,versusRust:scalar.medianSumMs/best.medianSumMs,minCaseGainAgainstTS:Math.min(...best.cases.map(c=>ts.cases.find(t=>t.id===c.id).medianMs/c.medianMs)),confirmation:choices});
 }
 policies.splice(0,policies.length,...confirmed);
}
const evidence={base:'4aab909e',productWater:'e292cefe',scalarRust:'2ebeea87',parallelDesign:'68d68313',machine:'Ryzen 7 9800X3D, 8 cores/16 logical, Windows x64, 64 GB',metric:data.metric,identitySource:data.identitySource,fingerprint:data.fingerprint,rawMeasurementsSha256:hash(readFileSync(resolve(LOCAL,'measurements.json'))),build,runtime:{...data.runtime,browserVersions:Object.fromEntries(engines.map(e=>[e,smoke.find(r=>r.engine===e).version]))},inputs:data.selected,identity:{forcedGoldenChecks:smoke.reduce((s,r)=>s+r.checks,0),smokeConfigurations:smoke.map(r=>({engine:r.engine,backend:r.backend,threads:r.threads,checks:r.checks,phases:r.stats??null})),timedRuns:bench.reduce((s,r)=>s+r.samples.length,0),warmRuns:bench.length,faults,strictIR:ir,nativeGuardTests:3,weather},load:{minimumConfigurationMean:Math.min(...load),maximumConfigurationMean:Math.max(...load),peak:Math.max(...bench.map(r=>r.load.max)),source:bench[0].load.source},failures:[...historical,...data.failures.map(f=>({source:'measurements.json',...f}))],policies,matrix};
evidence.screenPolicies=screenPolicies;
if(existsSync(resolve(LOCAL,'load-repairs.json')))evidence.loadRepairs=read('load-repairs.json');
if(confirmation){evidence.confirmation={fingerprint:confirmation.fingerprint,rawSha256:hash(readFileSync(resolve(LOCAL,'confirmation.json'))),cases:confirmation.rows.map(r=>({engine:r.engine,size:r.size,id:r.id,selected:r.selected,loadMean:r.load.mean,loadPeak:r.load.max,startup:r.startup.startup})),timedRuns:confirmation.rows.reduce((s,r)=>s+r.samples.length,0)};evidence.failures.push(...confirmation.failures.map(f=>({source:'confirmation.json',...f})));}
// Keep the committed numeric evidence compact; full precision/raw CPU series stay local.
const round=(_k,v)=>typeof v==='number'&&!Number.isInteger(v)?Math.round(v*1000)/1000:v;
evidence.load.sources={pdh:'Windows PDH Processor(_Total) % Processor Time','cpu-deltas':'os.cpus 100ms deltas plus closing partial interval'};
const metadata=JSON.stringify({...evidence,matrix:undefined,policies:undefined,screenPolicies:undefined},round,2).slice(0,-2);
const groups=['policies','screenPolicies','matrix'].map(key=>'  "'+key+'": [\n'+evidence[key].map(m=>'    '+JSON.stringify(m,round)).join(',\n')+'\n  ]');
writeFileSync(resolve(HERE,'evidence.json'),metadata+',\n'+groups.join(',\n')+'\n}\n');
const format=ms=>(ms/1000).toFixed(2),config=c=>c==='rust-scalar/1'?'scalar Rust':c==='typescript-scalar/1'?'scalar TS':c.startsWith('rust/')?'Rust '+c.split('/')[1]+' threads':'TS '+c.split('/')[1]+' threads';
const lines=['# Rust water with threads','',
 'Minimize summed case medians; within 5% of both median and worst sums, prefer fewer threads. Full 1/2/4/8/16 Rust/TS results and per-repeat load: [evidence.json](evidence.json). Product code is unchanged.', '',
 '| Engine / size | Proposed settle | Sum of case median / worst (s) | Gain vs scalar TS / Rust | CPU mean / status |',
 '|---|---|---:|---:|---|'];
for(const p of policies)lines.push(`| ${p.engine} / ${p.size}² | ${config(p.config)} | ${format(p.medianSumMs)} / ${format(p.worstSumMs)} | ${p.versusTS.toFixed(2)}× / ${p.versusRust.toFixed(2)}× | ${p.loadMin.toFixed(0)}–${p.loadMax.toFixed(0)}% / ${p.provisional?'provisional':'measured'} |`);
if(confirmation)lines.push('',`Table: ${evidence.confirmation.timedRuns} additional rotating-order paired runs, selected candidate versus full scalar Rust/TS. Original screen remains in evidence; alternative thread counts were not all remeasured together.`);
lines.push('',
 `**Method:** Three themes, seed 1, 128²/256²; tiled stress maps at 512². One warm-up and three settles/cell (${evidence.identity.timedRuns} screen runs). Simulation, typed copies and barriers timed; construction/encoding/output checks excluded. Typed shared maps stay resident between phases; one Rust call/worker/phase. Table sums case medians/maxima. Ryzen 7 9800X3D, Windows x64.`, '',
 '**Firefox:** rust-analysis/PROFILE_REPORT.md’s corrected diagnostic runtime; baseline Wasm off, optimizing tier on, lazy tiering off on every measurement. No baseline-pinned debugger.', '',
 `**Identity:** ${evidence.identity.forcedGoldenChecks.toLocaleString('en-US')} per-tick byte checks at 1/2/3/4/7/8/16 threads; all timed outputs/stopping ticks agree. Disjoint writes, barriers, serial sources and ordered reductions give the [proof](IDENTITY.md). Failure/private-array checks, TypeScript, strict IR and three Rust guards pass.`, '',
 '**Load/forcing:** Every repeat has CPU mean/peak; means above 20% and policies based on those comparisons are provisional. All engines receive identical forcing bytes; 33 one-tick Weather checks with varying precomputed forcing pass. Portable maths is separate.', '',
 '**Dispatch:** Counts include the coordinator. Keep 1,024 entries/thread/phase and budget concurrent pools. Rust threads retain TS bookkeeping/stopping. For short tasks, account for startup; failed phases discard state and retry fresh.', '',
 `**Ship?** Threaded Rust is experimental, not ready as default: stable Rust 1.90’s unsupported atomics warning remains. The no_std kernel avoids shared allocators/TLS; JS owns barriers and instances own stacks. Keep pinned builds/fallback, no nightly. [Rust tracking](https://github.com/rust-lang/rust/issues/77839). ${evidence.failures.length} historical browser interruptions retained; corrected matrix has ${data.failures.length}. Integrated lifecycle/cancellation remains gated. Windows WebKit is not Safari; 512² is stress-only.`, '',
 '[Reproduce](README.md) · Large results and interrupted logs remain ignored in local/.');
writeFileSync(resolve(HERE,'REPORT.md'),lines.join('\n')+'\n');
console.log(JSON.stringify({policies:policies.map(({confirmation,...p})=>p),load:evidence.load,failures:evidence.failures.length},null,2));

import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {cpus,platform,arch,totalmem} from 'node:os';
import {gzipSync,brotliCompressSync} from 'node:zlib';
import {HERE,LOCAL,hash,deps} from './common.mjs';
const read=n=>JSON.parse(readFileSync(resolve(LOCAL,n),'utf8'));
const lines=n=>readFileSync(resolve(LOCAL,n),'utf8').split('\n').filter(Boolean).map(JSON.parse);
const historical=JSON.parse(readFileSync(resolve(HERE,'evidence.json'),'utf8'));
const cases=read('checks.json').cases,build=read('build.json'),fingerprint=hash(Buffer.concat(['water.wasm','coordinator.js'].map(n=>readFileSync(resolve(LOCAL,n)))));
assert.equal(build.reference,historical.reference,'Unchanged pinned TypeScript');
const engines=['firefox','webkit','chromium'],identity=[];
for(const engine of engines){
 const rows=lines('browser-'+engine+'.jsonl');
 for(const c of cases)assert.ok(rows.some(r=>r.id===c.id&&r.fingerprint===fingerprint&&r.sha256===c.expected),engine+'/'+c.id);
 const smoke=read('browser-'+engine+'.json').results.find(r=>r.stage==='smoke');
 assert.ok(smoke&&smoke.checks===23400&&smoke.lifecycleChecks===257,engine+' fresh smoke');
 identity.push({engine,version:smoke.version,cases:cases.length,smokeChecks:smoke.checks,lifecycleChecks:smoke.lifecycleChecks,recordedTypeScriptFingerprint:historical.identity.browserFingerprint});
}
for(const c of cases){
 assert.equal(hash(readFileSync(resolve(LOCAL,'checks',c.id+'.in'))),c.input);
 const expected=readFileSync(resolve(LOCAL,'checks',c.id+'.expected'));
 assert.equal(hash(expected),c.expected);
 assert.ok(readFileSync(resolve(LOCAL,'checks',c.id+'.native')).equals(expected),'native/'+c.id);
}
assert.equal(read('native.json').status,'pass');assert.equal(read('smoke.json').checks,33400);
assert.equal(read('smoke.json').fallback,'pass');assert.equal(read('golden-contract.json').status,'pass');
assert.equal(read('oracle.json').status,0);assert.equal(read('typecheck.json').errors,0);assert.equal(read('ir.json').status,'pass');
assert.equal(read('profiles/edges.json').status,'pass');
const edgeRows=read('profiles/shape-edges-measurements.json');assert.equal(edgeRows.length,36);assert.ok(edgeRows.every(r=>r.ok));
const summary=xs=>{assert.equal(xs.length,3,'Three timing repeats');assert.ok(xs.every(x=>Number.isFinite(x)&&x>=0));return {samples:xs,median:[...xs].sort((a,b)=>a-b)[1],worst:Math.max(...xs)};};
const summarizeRows=rows=>{
 const keys=[...new Set(rows.filter(r=>r.rep>=0).map(r=>`${r.engine}/${r.id}/${r.variant}`))];
 return keys.map(key=>{const rs=rows.filter(r=>r.rep>=0&&`${r.engine}/${r.id}/${r.variant}`===key).sort((a,b)=>a.rep-b.rep);assert.equal(rs.length,3);const r=rs[0];return {engine:r.engine,version:r.version,id:r.id,variant:r.variant,before:r.before,current:r.current,timing:Object.fromEntries(Object.keys(r.metrics).filter(k=>!['calls','ticks','bytesPerCall'].includes(k)).map(k=>[k,summary(rs.map(x=>x.metrics[k]))])),calls:rs.map(x=>x.metrics.calls),ticks:rs.map(x=>x.metrics.ticks),bytesPerCall:r.metrics.bytesPerCall,load:rs.map(x=>x.caseLoad??x.load)};});
};
const rawFinal=read('profiles/final-lake-measurements.json'),final=summarizeRows(rawFinal);
const diagnostic=read('profiles/firefox-diagnostic-copy.json');
for(const r of rawFinal.filter(r=>r.engine==='firefox')){assert.equal(r.browserRuntime.executableSha256,diagnostic.executableSha256);assert.equal(r.browserRuntime.archiveSha256,diagnostic.diagnosticArchiveSha256);}
assert.equal(final.length,24,'4 cases x 3 backends x 2 engines');
const bytes=readFileSync(resolve(LOCAL,'water.wasm')),before=readFileSync(resolve(LOCAL,'before-water.wasm'));
assert.equal(hash(before),historical.wasm.sha256);
assert.ok(rawFinal.every(r=>r.current===hash(bytes)&&r.before===hash(before)));
const oldRuntime=summarizeRows(read('profiles/final-old-runtime-measurements.json'));
for(const r of read('profiles/final-old-runtime-measurements.json')){assert.equal(r.browserRuntime.executableSha256,diagnostic.executableSha256);assert.equal(r.browserRuntime.archiveSha256,diagnostic.sourceArchiveSha256);}
const frame=summarizeRows(read('profiles/frame-final-measurements.json'));
const checked=summarizeRows(read('profiles/checked-final-measurements.json'));
const optimized=summarizeRows(read('profiles/optimized-confirm-measurements.json'));
const runtimeAfter=summarizeRows(read('profiles/runtime-after-measurements.json'));
const firefox512Repeat=summarizeRows(read('profiles/firefox-512-repeat-measurements.json'));
const adapterBatch=summarizeRows(read('profiles/adapter-batch-measurements.json'));
const adapterSingle=summarizeRows(read('profiles/adapter-single-measurements.json'));
const chromiumControl=summarizeRows(read('profiles/chromium-control-measurements.json'));
for(const row of [...final,...oldRuntime,...runtimeAfter,...firefox512Repeat,...frame,...checked,...adapterBatch,...adapterSingle,...chromiumControl])assert.ok(row.load.every(l=>Number.isFinite(l.mean)&&l.samples>0),'Recorded CPU load: '+row.engine+'/'+row.id);
assert.equal(hash(readFileSync(resolve(HERE,'water.ts'))),historical.sourceHashes['water.ts'],'Public adapter unchanged');
for(const r of read('profiles/runtime-after-measurements.json'))assert.equal(r.browserRuntime.archiveSha256,diagnostic.diagnosticArchiveSha256);
const assembly=read('profiles/assembly.json');assert.equal(assembly.wasm.find(r=>r.name==='current').sha256,hash(bytes));
const sizes=b=>({sha256:hash(b),bytes:b.length,gzip:gzipSync(b,{level:9}).length,brotli:brotliCompressSync(b).length});
const evidence={base:build.base,baselineCommit:'d18a6f4d890d3f2e3f7b480e308242375c100e10',reference:build.reference,
 machine:{cpu:cpus()[0].model.trim(),logicalCores:cpus().length,memoryBytes:totalmem(),platform:platform(),arch:arch(),loadSource:'Windows PDH Processor(_Total) % Processor Time'},
 identity:{cases:cases.length,captures:cases.reduce((s,c)=>s+c.captures,0),browserFingerprint:fingerprint,browsers:identity,native:'Every candidate output re-compared as raw bytes',nodePerTickChecks:33400,pinnedDigests:38,fallback:'pass',guardUnitTests:3,skinnyShapes:read('profiles/edges.json'),skinnyBrowserRuns:edgeRows.length,python:{status:0,log:hash(readFileSync(resolve(LOCAL,'oracle.log'))),summary:readFileSync(resolve(LOCAL,'oracle-report.txt'),'utf8').trim().split('\n').at(-1)}},
 wasm:sizes(bytes),beforeWasm:sizes(before),sharedWasm:sizes(readFileSync(resolve(LOCAL,'shared-water.wasm'))),
 compiler:{rust:'1.90.0',releaseOptimization:3,lto:true,codegenUnits:1,node:process.version,typescript:deps('typescript').version,ir:read('ir.json')},
 firefoxDiagnostic:diagnostic,assembly,final,oldRuntime,runtimeAfter,firefox512Repeat,frame,checked,optimized,adapterBatch,adapterSingle,chromiumControl,
 webkit:{useWasmFastMemory:false,useBBQJIT:true,useOMGJIT:true,observedTiers:['BBQ','OMG'],log:hash(readFileSync(resolve(LOCAL,'profiles/webkit-code.log'))),invalidControl:'Disabling both IPInt and BBQ rejects launch; not a timing result'},
 sourceHashes:Object.fromEntries(['src/lib.rs','rust/main.rs','water.ts','profile-worker.ts','profile.mjs'].map(n=>[n,hash(readFileSync(resolve(HERE,n)))]))};
assert.equal(evidence.sharedWasm.sha256,historical.sharedWasm.sha256,'Shared numerical payload unchanged');
writeFileSync(resolve(HERE,'profile-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
const size=id=>id.startsWith('stress-')?512:Number(id.split('-')[2]);
const aggregate=(engine,n,variant)=>summary([0,1,2].map(rep=>(engine==='firefox'&&n===512?firefox512Repeat:final).filter(r=>r.engine===engine&&size(r.id)===n&&r.variant===variant).reduce((s,r)=>s+r.timing.total.samples[rep],0)));
const seconds=s=>(s.median/1000).toFixed(2)+'/'+(s.worst/1000).toFixed(2);
const cell=(engine,n)=>{const b=aggregate(engine,n,'before'),c=aggregate(engine,n,'current'),ts=aggregate(engine,n,'fast');return `${seconds(b)} → ${seconds(c)}; ${(b.median/c.median).toFixed(2)}×; TS ${(ts.median/c.median).toFixed(2)}×`;};
const table=['| Size | Firefox before → after (median/worst s); gain; versus TS | WebKit before → after (median/worst s); gain; versus TS |','|---|---|---|',...[96,128,256,512].map(n=>`| ${n}² | ${cell('firefox',n)} | ${cell('webkit',n)} |`)];
const pick=(rs,engine,variant)=>rs.find(r=>r.engine===engine&&r.id==='m9b-lakeBasin-128-1'&&r.variant===variant);
const ffOld=pick(oldRuntime,'firefox','before'),ffTier=pick(runtimeAfter,'firefox','before'),ffNow=pick(runtimeAfter,'firefox','current'),ffTS=pick(runtimeAfter,'firefox','fast');
const loads=[...final,...firefox512Repeat].flatMap(r=>r.load).map(l=>l.mean).filter(Number.isFinite);
const adapterOverhead=engine=>{const row=adapterSingle.find(r=>r.engine===engine&&r.variant==='current');return summary(row.timing.run.samples.map((v,i)=>v-row.timing.kernel.samples[i]));};
const overheadFF=adapterOverhead('firefox'),overheadWK=adapterOverhead('webkit');
const kernel=rs=>rs.find(r=>r.variant==='current').timing.kernel;
const fk=kernel(frame),ck=kernel(checked);
const report=`# Scalar Wasm profiling follow-up\n\n**Firefox's 4× slowdown was a test-runtime artifact.** Playwright 1.58.2's Juggler Debugger pins Wasm to baseline. Optimizing-only failed with “no WebAssembly compiler available”. Adding just [upstream 1.63's two debugger flags](https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/content/Runtime.js) to an isolated copy restores optimization, with the same Firefox 146 executable/JIT. On lakeBasin 128², the original Rust port goes from **${seconds(ffOld.timing.total)} s to ${seconds(ffTier.timing.total)} s** with the corrected runtime; the improved port is **${seconds(ffNow.timing.total)} s**, versus TS **${seconds(ffTS.timing.total)} s**. These are median/worst, three repeats; the diagnostic copy is not a shipping-browser patch. Original REPORT.md/evidence.json remain historical.\n\n**WebKit already reaches OMG optimization.** Its Windows build uses explicit Wasm memory checks (useWasmFastMemory=false); disassembly shows BBQ then OMG, bounds checks and repeated descriptor loads. The hot Rust substep dominates the Gecko samples. Adapter copying/calls are a small fraction of canonical run time and were unchanged. On 512², 128 separate one-tick calls add ${overheadFF.median.toFixed(0)}/${overheadFF.worst.toFixed(0)} ms of run-minus-kernel overhead in Firefox and ${overheadWK.median.toFixed(0)}/${overheadWK.worst.toFixed(0)} ms in WebKit; one 128-tick call adds about 1 ms. Preserve bounded batches and measure Weather/live-edit integration.\n\n**Code fix:** validate shapes/indices once per public run, then cache numeric buffer pointers for the unchanged flow/depth/dam phases. Static substep loads fall 213→179 and Rust bounds-panic sites 45→15; instruction count rises 3118→3203, so this is not a smaller-loop claim. Wasm sandbox checks stay enabled. A pointer-cached control with per-access Rust checks restored takes **${ck.median.toFixed(1)}/${ck.worst.toFixed(1)} ms** versus **${fk.median.toFixed(1)}/${fk.worst.toFixed(1)} ms** unchecked (WebKit, fixed 512 ticks on tiled lakeBasin 512²). Arithmetic, reduction order, layout, public adapter and compiler flags stay unchanged.\n\nThe table isolates the Rust code change: both Firefox columns use the corrected test runtime. Firefox 512² uses a second cohort after load dropped; its earlier noisy cohort was 17.30/28.33 → 19.27/30.32 s and is retained in the evidence. Each size uses lakeBasin seed 1; the 512² input is a tiled stress map. Three paired repetitions follow one warm-up. Timers include construction, simulation and serialization/byte checks, excluding download/compile. “Versus TS” compares today's faster settle; below 1 is slower. Ryzen 7 9800X3D, Windows x64; measured mean total CPU load ${Math.min(...loads).toFixed(0)}–${Math.max(...loads).toFixed(0)}%, peak 100%, with raw samples/load in profile-evidence.json. Our scalar corpus workers finished before timing; the Python oracle remained active, and other host activity is uncontrolled.\n\n${table.join('\n')}\n\n**Identity:** all 1,952 schedules / 39,529 checkpoints pass as raw bytes in three engines and native, including the 19 official maps, 840 batch inputs, 512²/live/weather cases. Chromium/WebKit reuse attested unchanged same-engine TS expectations; Firefox also reruns TS. Fresh per-tick/lifecycle/fallback browser checks pass in all three; 33,400 Node checks, 38 pinned digests, four skinny shapes, three Rust guard tests and the Python oracle pass. Strict scalar/native/shared LLVM IR passes; the shared kernel binary is unchanged.\n\n**Delivery:** ${bytes.length} B raw / ${evidence.wasm.gzip} B gzip / ${evidence.wasm.brotli} B Brotli. No new shipping dependency or build flag; CI template adds guard tests. Use a matching Playwright runtime with the debugger fix for performance tests. Native, other OS/CPU performance and threaded timings were not remeasured here. INTEGRATION.md gives regeneration and the unsafe-frame invariant proof.\n`;
writeFileSync(resolve(HERE,'PROFILE_REPORT.md'),report);console.log('Profile evidence and report PASS');

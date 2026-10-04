import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL} from './common.mjs';
const e=JSON.parse(readFileSync(resolve(HERE,'EVIDENCE.json')));
const median=a=>{a=[...a].sort((x,y)=>x-y);return a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2;};
const engines=Object.keys(e.engines),counts=e.counts;
let table='| Engine / size | '+counts.map(n=>n+' threads').join(' | ')+' |\n| --- | '+counts.map(()=>'---:').join(' | ')+' |\n';
for(const engine of engines)for(const size of[128,256,512]){
  table+='| '+engine+' / '+size+'² | '+counts.map(threads=>median(e.benchmark.filter(r=>r.cohort==='representative'&&r.engine===engine&&r.threads===threads&&r.id.includes('-'+size)).map(r=>r.pairedSpeedup)).toFixed(2)+'×').join(' | ')+' |\n';
}
const tails=e.slowSelection.map(c=>c.id+' ('+c.selection.ticks+' ticks)').join('; ');
let slowTable='| Engine / maximum-tick lake | '+counts.map(n=>n+' threads').join(' | ')+' |\n| --- | '+counts.map(()=>'---:').join(' | ')+' |\n';
for(const engine of engines)for(const c of e.slowSelection){
  const size=c.id.includes('-128-')?128:256;
  slowTable+='| '+engine+' / '+size+'² | '+counts.map(threads=>e.benchmark.find(r=>r.cohort==='lake-tail'&&r.engine===engine&&r.id===c.id&&r.threads===threads).pairedSpeedup.toFixed(2)+'×').join(' | ')+' |\n';
}
const worst=engines.map(engine=>{const r=e.benchmark.filter(r=>r.engine===engine&&r.threads>1).sort((a,b)=>a.pairedSpeedup-b.pairedSpeedup)[0];return engine+' '+r.id+'/'+r.threads+' threads '+r.pairedSpeedup.toFixed(2)+'×';}).join('; ');
let latency='| Engine / size | Scalar first land / water | 4-thread first land / water |\n| --- | ---: | ---: |\n';
for(const engine of engines)for(const size of[128,256]){
  const rows=e.generation.filter(r=>r.engine===engine&&r.id.includes('-'+size+'-'));
  const values=threads=>{const data=rows.filter(r=>r.threads===threads);return ['firstLook','firstWater'].map(key=>(median(data.map(r=>r.candidate[key]+r.startupMs))/1000).toFixed(2)+' s').join(' / ');};
  latency+='| '+engine+' / '+size+'² | '+values(1)+' | '+values(4)+' |\n';
}
const generationDifferences=e.generationCrossEngine.length;
const byteDifferences=e.generationCrossEngine.filter(r=>r.water||r.export||r.ticks).length;
const report=`# Parallel water investigation

**Kernel identity for identical inputs and isolation are verified; keep adoption gated.** Base \`feature/m9b\`
\`6c29b7e5\`; product files untouched, six-day cap preserved. Chromium 145, Firefox 146 and Windows
Playwright WebKit 26 pass the headerless static-host test: one early reload, safe waiting updates,
CORS/CORP enforcement and isolated cached navigation. WebKit offline emulation fails with plain
caching too; installed Safari/offline remains unverified. Current resources need no cross-origin exceptions.

**Identity:** zero settle mismatches at 1/2/4/8/16 threads: 1,050 current M9b models (${e.inputs.refused} quality-refused outputs retained), 19 archived
official models, 24 golden rule cases, three tiled 512² models, nine live/9-day drought/8-day badtide
runs including returns. Forced goldens also test 3/7 threads (${e.suites.forced.tickOrSliceChecks.toLocaleString()} per-tick checks).
Fallback: 2,400 tick checks; failed-phase discard/fresh scalar retry and private-array ownership pass.
Six complete generation cases compare scalar/candidate export bytes, water state and selected planning state.
Cross-engine generation: ${generationDifferences} compared-state differences; ${byteDifferences} water/export/tick differences.
Native fractional-day forcing still diverges in WebKit; identical model/forcing inputs are required.

Speed versus the faster scalar settle, median river/lake/sea case ratios (copies included; pool startup separate; below 1× is slower):

${table}
Three pairs at 128²/256²; one long pair at 512². Ryzen 7 9800X3D, 16 logical CPUs; other host load
uncontrolled. Maximum-tick lake tails (three pairs): ${tails}.

${slowTable}
Worst measured case/count per engine: ${worst}. Individual sea/lake/river ratios are in the evidence.
Long WebKit stalls also occurred in unpaired Weather verification; remeasure the integrated cadence before choosing defaults.

New-map worker latency, median of the three themes; helper startup included:

${latency}
The generator rejects 512²: these are water stress models, with no valid 512² first-land timing.
Land/water markers exclude UI transfer and painting.
Completion at the six-day cap is recorded separately from equilibrium.

Adoption: keep reduction/source order, gate early API calls, budget concurrent pools, merge caching
and isolation, preserve old assets, and discard failed tasks before retry. Shared workspace:
**141 bytes/tile** (35.25 MiB at 512²), plus private arrays/caches. Case/engine regressions rule out a blanket default.

[Integration/regeneration](INTEGRATION.md) · [Compact evidence](EVIDENCE.json) · [Adoption patch](adoption.patch)
`;
writeFileSync(resolve(HERE,'REPORT.md'),report);
writeFileSync(resolve(LOCAL,'pr-body-final.md'),`The water settle remains byte-identical while two independent per-tile phases can use a shared worker pool. The proposal also supplies static-host isolation and a cache-compatible service worker.

All changes made by the investigation are confined to investigation/parallel-water/. The branch starts from feature/m9b at 6c29b7e5 and inherits that history; product files are untouched by the investigation.

Validation: all three browser engines at 1/2/4/8/16 threads; 1,050 current seed models, 19 official models, golden fixtures, three 512-square stress models, live edits, full Weather days and returns. Additional forced cases use 3/7 threads. Scalar fallback, failed-phase discard/retry, private-array ownership, complete generation/export, TypeScript and clean adoption-patch application pass. See REPORT.md and EVIDENCE.json for exact scope, timings and portability limits.

Isolation works on a Pages-style static host. Thread-count gains and regressions vary by case and engine, requiring selective adoption. Native planning/forcing portability remains a separate decision. Current schema rejects generated 512-square maps, so 512 measurements are explicitly water stress models. Large raw results stay gitignored, with regeneration commands in INTEGRATION.md.

This remains a draft adoption proposal for the milestone; no product activation, merge, approval or auto-merge.`);
console.log('Short report and final PR description written');

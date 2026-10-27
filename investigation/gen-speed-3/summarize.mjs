import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = import.meta.dirname;
const read = f => JSON.parse(readFileSync(resolve(dir, f),'utf8'));
const before = read('local/baseline-profile/results.json');
const after = read('local/candidate-profile/results.json');
const paired = read('local/paired/results.json');
const out = resolve(dir,'samples');
mkdirSync(out,{recursive:true});
const csv = (name, header, rows) => writeFileSync(resolve(out,name), [header,...rows].map(r=>r.map(x=>JSON.stringify(x??'')).join(',')).join('\n')+'\n');
const median = a => [...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const sum = (rows,f) => rows.reduce((s,r)=>s+f(r),0);
const seconds = x => (x/1000).toFixed(3);
const themes = before.themes;
const stages = [];
const attempts = [];
const functions = [];
const summary = [];
for (const variant of [before,after]) for (const r of variant.rows) {
  for (const s of r.stages) stages.push([variant.variant,r.theme,r.seed,s.attempt,s.stage,+s.ms.toFixed(3)]);
  for (const a of r.attempts) attempts.push([variant.variant,r.theme,r.seed,a.attempt,a.passed,a.reason,+a.ms.toFixed(3),a.genomes,a.settles,a.failures.join('|')]);
  for (const [n,t] of Object.entries(r.totals)) functions.push([variant.variant,r.theme,r.seed,n,t.calls,+t.total.toFixed(3),+t.self.toFixed(3)]);
}
csv('stages.csv',['variant','theme','seed','attempt_index_in_round','stage','ms'],stages);
csv('attempts.csv',['variant','theme','seed','attempt_global_1based','passed','reason','ms_since_last_attempt','genomes_in_round','settles_in_round','failed_check_ids'],attempts);
csv('../local/functions.csv',['variant','theme','seed','function','calls','inclusive_ms','exclusive_ms'],functions);
const functionSample = [];
for (const variant of [before,after]) for (const theme of themes) {
  const totals = {};
  for (const r of variant.rows.filter(r=>r.theme===theme)) for (const [name,t] of Object.entries(r.totals)) {
    const v = totals[name] ??= { calls:0, total:0, self:0 };
    v.calls+=t.calls; v.total+=t.total; v.self+=t.self;
  }
  for (const [name,t] of Object.entries(totals).sort((a,b)=>b[1].self-a[1].self).slice(0,15)) functionSample.push([variant.variant,theme,name,t.calls,+t.total.toFixed(3),+t.self.toFixed(3)]);
}
csv('functions.csv',['variant','theme','function','calls_three_seeds','inclusive_ms','exclusive_ms'],functionSample);
csv('before-after.csv',['theme','seed','size','first_land_before_ms','first_land_after_ms','candidate_before_ms','candidate_after_ms','return_before_ms','return_after_ms','process_cpu_before_ms','process_cpu_after_ms','attempts','genomes','settles','identical'],paired.rows.map(r=>[r.theme,r.seed,r.size,r.baseline.firstLand,r.candidate.firstLand,r.baseline.firstCandidate,r.candidate.firstCandidate,r.baseline.wall,r.candidate.wall,r.baseline.cpuMs,r.candidate.cpuMs,r.baseline.attempts,r.baseline.genomes,r.baseline.settles,r.identical]));
writeFileSync(resolve(out,'identity.json'),JSON.stringify(paired.rows.map(r=>({theme:r.theme,seed:r.seed,size:r.size,identical:r.identical,bytes:r.baseline.sha256,project:r.baseline.projectSha256,emptyWater:r.baseline.emptyWaterSha256,state:r.baseline.state,response:r.baseline.response,progress:r.baseline.progress,land:r.baseline.land,attempts:r.baseline.attempts,genomes:r.baseline.genomes,settles:r.baseline.settles})),null,2)+'\n');
let text = '# Measurements\n\nBase and method are in [INTEGRATION.md](INTEGRATION.md). All seven themes, defaults (128² / Normal / Variety 70), seeds 1–3, one generation at a time. Uninstrumented API calls alternate baseline/candidate order. Both modules get the same excluded 48² Delta warm-up. One pair per seed; no repetitions chosen for nicer numbers. Node '+paired.node+', '+paired.cpu+', '+paired.logicalCpus+' logical CPUs, '+paired.memoryGiB+' GiB; shared Windows machine.\n\n';
text += 'The primary boundary is the first `candidate` callback from `runGenerate`, after the first passing map. `land` is an earlier planned-water preview. Return also includes project encoding, facts and SHA-256. These are worker computation boundaries in Node, excluding worker startup, Comlink transit, renderer and paint; they are not claimed as measured click-to-paint browser latency. At 128² the page uses one water thread too. Process CPU includes V8/helper work and is supplementary.\n\n';
text += '## Before | after\n\nSeconds, median of the same three seeds per theme. Every individual pair, including slower candidates, is in [samples/before-after.csv](samples/before-after.csv).\n\n| Theme | First passing candidate | Earlier land | Worker return | Soil calls (3 seeds) |\n|---|---:|---:|---:|---:|\n';
for (const theme of themes) {
  const p = paired.rows.filter(r=>r.theme===theme), b=before.rows.filter(r=>r.theme===theme), a=after.rows.filter(r=>r.theme===theme);
  const soil = rows=>sum(rows,r=>r.totals['sim/soil.ts:gameSoil']?.calls??0);
  text += `| ${theme} | ${seconds(median(p.map(r=>r.baseline.firstCandidate)))} → ${seconds(median(p.map(r=>r.candidate.firstCandidate)))} | ${seconds(median(p.map(r=>r.baseline.firstLand)))} → ${seconds(median(p.map(r=>r.candidate.firstLand)))} | ${seconds(median(p.map(r=>r.baseline.wall)))} → ${seconds(median(p.map(r=>r.candidate.wall)))} | ${soil(b)} → ${soil(a)} |\n`;
}
const totalB = sum(paired.rows,r=>r.baseline.firstCandidate), totalA=sum(paired.rows,r=>r.candidate.firstCandidate);
const ratios=paired.rows.map(r=>r.candidate.firstCandidate/r.baseline.firstCandidate);
text += `\nTotal first-candidate computation across the 21 inputs: **${seconds(totalB)} | ${seconds(totalA)} s (${((1-totalA/totalB)*100).toFixed(1)}% less)**. Median paired change: **${((1-median(ratios))*100).toFixed(1)}% less**; ${ratios.filter(r=>r<1).length}/21 after readings are faster. These observations establish no timing gate or uniform speedup.\n\n`;
text += '## Where time goes now\n\nBaseline profiled wall time over three seeds (ms). Stage intervals are disjoint progress boundaries; a `water` stage includes planning and private land screens, not just simulation. Failed layouts stay in the denominator. Post-attempt includes naming/outcomes and worker response packing. Instrumentation and inspector add overhead; use the uninstrumented pairs above for before/after.\n\n| Theme | Land | Water/planning | Start/repair | Objects | Resources | Checks | Post-attempt | Failed attempts / all |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for (const theme of themes) {
  const rows=before.rows.filter(r=>r.theme===theme);
  const values=['land','water','start','objects','resources','check'].map(stage=>sum(rows,r=>sum(r.stages.filter(s=>s.stage===stage),s=>s.ms)));
  const failed=sum(rows,r=>r.attempts.filter(a=>!a.passed).length), all=sum(rows,r=>r.attempts.length);
  text += `| ${theme} | ${values.map(Math.round).join(' | ')} | ${Math.round(sum(rows,r=>r.wall)-values.reduce((a,b)=>a+b,0))} | ${failed} / ${all} |\n`;
}
text += '\n[samples/attempts.csv](samples/attempts.csv) retains every failure reason and attempt duration; [samples/stages.csv](samples/stages.csv) retains each attempt’s stage intervals. Round-local progress indices reset in rescue rounds; global attempt numbers in the attempt sheet do not. Genomes/settles in that sheet are cumulative within the round. Duration includes any field drawn since the previous attempt ended.\n\n';
text += '## Per crate\n\nDirect exported Wasm calls only (ms and percentage of profiled worker-return wall). Allocation/free/sync calls are included. Rust analysis linked inside `checks` is attributed to `checks`; portable maths linked inside each module belongs to its caller. This is boundary attribution, not separate portable-crate instrumentation. Compilation, serialization, typed-array copies and all JavaScript are outside the direct-call figures. Forces receive no calls on Generate.\n\n| Theme | water | analysis | checks | forces | JS, compile, bridge and packing |\n|---|---:|---:|---:|---:|---:|\n';
for (const theme of themes) {
  const rows=before.rows.filter(r=>r.theme===theme), wall=sum(rows,r=>r.wall);
  const ms=['water','analysis','checks','forces'].map(crate=>sum(rows,r=>sum(Object.entries(r.totals).filter(([n])=>n.startsWith(`wasm/${crate}:`)),([,t])=>t.self)));
  text += `| ${theme} | ${ms.map(v=>`${Math.round(v)} (${(v/wall*100).toFixed(1)}%)`).join(' | ')} | ${Math.round(wall-ms.reduce((a,b)=>a+b,0))} |\n`;
}
text += '\n## Hot functions and wasted layouts\n\nExclusive function timings avoid double-counting their instrumented children; smaller untimed helpers remain in the parent. These are profile clues, not independent latency predictions.\n\n| Theme | Largest exclusive costs over three seeds (ms) | Genomes before / after | Attempts before / after |\n|---|---|---:|---:|\n';
for(const theme of themes){
  const rows=before.rows.filter(r=>r.theme===theme), totals={};
  for(const r of rows)for(const [name,t]of Object.entries(r.totals))totals[name]=(totals[name]??0)+t.self;
  const hot=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([n,v])=>`${n}: ${Math.round(v)}`).join('; ');
  const p=paired.rows.filter(r=>r.theme===theme);
  text+=`| ${theme} | ${hot} | ${sum(p,r=>r.baseline.genomes)} / ${sum(p,r=>r.candidate.genomes)} | ${sum(p,r=>r.baseline.attempts)} / ${sum(p,r=>r.candidate.attempts)} |\n`;
}
text += '\nThe 15 hottest functions per theme and variant are in [samples/functions.csv](samples/functions.csv); all per-input functions regenerate as `local/functions.csv`. Seven seed-1 V8 CPU profiles per variant are local only. The baseline profile starts cold in Any/1; the remaining calls share that process’s Wasm modules. Candidate profiles follow the identical sequence in a separate process. Profile wall times are not a paired speed comparison. Baseline failures consume 53.30 s, 49.0% of the 108.76 s spent inside attempts. Their frequent reasons include planned promise (29), no start (28), only one start place (10), and a river leaving its course (8).\n\nHighlands/2 spends 27 attempts on 13 genomes; Islands/3 spends 9 attempts on 7 genomes. Reusing builds cannot remove those layout costs. Loosening promise/course/start screens, accepting a different start, or lowering water’s tick cap would select or produce a different map. No such change is proposed. Exact future work could optimize the priority flood’s implementation or water kernels while preserving comparisons, operation order and all byte fixtures; moving more TS computation to Rust needs its own byte proof.\n';
writeFileSync(resolve(dir,'MEASUREMENTS.md'),text);
console.log(JSON.stringify({totalBefore:totalB,totalAfter:totalA,medianRatio:median(ratios),identical:paired.rows.every(r=>r.identical)}));

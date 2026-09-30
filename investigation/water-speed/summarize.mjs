// Commit small evidence only. Refuse partial/stale runs instead of reporting them as passes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,ROOT,LOCAL,json,hash} from './common.mjs';
import {listCases} from './cases.mjs';
const read=n=>JSON.parse(readFileSync(resolve(LOCAL,n+'.json'),'utf8'));
const buildId=hash(readFileSync(resolve(LOCAL,'baseline.cjs'))+readFileSync(resolve(LOCAL,'fast.cjs')));
const proof=read('proof'),all=read('timing-all'),selected=read('timing-selected'),tail=read('timing-tail');
const pinned=read('proof-pinned');assert.equal(pinned.buildId,buildId);assert.equal(pinned.cases.length,96);assert.ok(pinned.cases.every(c=>c.status==='pass'));
const pinnedTiming=read('timing-pinned');assert.equal(pinnedTiming.buildId,buildId);assert.deepEqual(pinnedTiming.rows.map(r=>r.id).sort(),pinned.cases.map(c=>c.id).sort());
const regressionSelection=read('regression-selection'),regressionTiming=read('timing-regressions');
assert.equal(regressionTiming.buildId,buildId);assert.equal(regressionTiming.reps,5);
assert.deepEqual(regressionTiming.rows.map(r=>r.id).sort(),regressionSelection.ids.sort());
const repeatedRegressions=[...regressionTiming.rows,...tail.rows.filter(r=>regressionSelection.allIds.includes(r.id))];
assert.deepEqual(repeatedRegressions.map(r=>r.id).sort(),regressionSelection.allIds.sort());
const expected=listCases().map(c=>c.id).sort();assert.equal(expected.length,1073);
for(const r of [proof,all,selected,tail])assert.equal(r.buildId,buildId,'Evidence fingerprint');
assert.deepEqual(proof.cases.map(c=>c.id).sort(),expected);
assert.deepEqual(all.rows.map(c=>c.id).sort(),expected);
assert.equal(selected.rows.length,14);assert.equal(selected.reps,5);assert.equal(tail.reps,5);
assert.deepEqual(tail.rows.map(r=>r.id).sort(),read('tail-selection').ids.sort());
assert.ok(proof.cases.every(c=>c.status==='pass'));
const byId=new Map(proof.cases.map(c=>[c.id,c]));
for(const r of [...all.rows,...selected.rows,...tail.rows,...regressionTiming.rows])assert.equal(r.inputHash,byId.get(r.id).inputHash);
const smoke=read('smoke-fast'),browser=read('browser'),oracle=read('oracle-binding');
for(const r of [smoke,browser,oracle])assert.equal(r.status,'pass');assert.equal(oracle.buildId,buildId);
assert.equal(read('typecheck').diagnostics.length,0);assert.equal(read('typecheck-integration').diagnostics.length,0);
const tests=read('tests-final'),gallery=read('tests-gallery');
assert.equal(tests.numFailedTests,2);assert.equal(gallery.numFailedTests,0);
const failures=r=>r.testResults.flatMap(file=>file.assertionResults.filter(t=>t.status==='failed').map(t=>({file:file.name.replaceAll('\\','/').split('/tests/')[1],test:t.fullName,messages:t.failureMessages.map(s=>s.replaceAll(ROOT.replaceAll('\\','/'),'<checkout>').replaceAll(ROOT,'<checkout>'))})));
const controls=[...failures(read('tests-baseline')),...failures(read('tests-save-baseline'))];
assert.equal(controls.length,2);
json(resolve(HERE,'evidence/checks.json'),{smoke,browser,candidateFailures:failures(tests),baselineControls:controls,galleryTests:gallery.numPassedTests,typescript:read('typecheck-integration')});
const median=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
const q=(a,p)=>a.slice().sort((x,y)=>x-y)[Math.ceil(p*(a.length-1))];
const geo=a=>Math.exp(a.reduce((s,x)=>s+Math.log(x),0)/a.length);
const stats=rs=>({cases:rs.length,medianRatio:median(rs.map(r=>r.cpuRatio)),geomeanRatio:geo(rs.map(r=>r.cpuRatio)),
  baselineMedianMs:median(rs.map(r=>r.baselineCpuMs)),fastMedianMs:median(rs.map(r=>r.fastCpuMs)),
  baselineP90Ms:q(rs.map(r=>r.baselineCpuMs),.9),fastP90Ms:q(rs.map(r=>r.fastCpuMs),.9),
  baselineMaxMs:Math.max(...rs.map(r=>r.baselineCpuMs)),fastMaxMs:Math.max(...rs.map(r=>r.fastCpuMs)),belowOne:rs.filter(r=>r.cpuRatio<1).length});
const screening={all:stats(all.rows.map(r=>r.rows[0]))};
screening.pinned=stats(pinnedTiming.rows.map(r=>r.rows[0]));
for(const size of [128,256])screening[size]=stats(all.rows.filter(r=>byId.get(r.id).kind==='generated'&&byId.get(r.id).size===size).map(r=>r.rows[0]));
const repeated={};for(const stage of selected.stages)repeated[stage]=stats(selected.rows.map(r=>r.rows.find(s=>s.stage===stage)));
const compact=r=>({...r,rows:r.rows.map(({samples,...metrics})=>metrics)});
const profile=read('profile').map(r=>({theme:r.theme,size:r.size,ticks:r.ticks,ms:r.ms,cpuMs:r.cpuMs,
  substep:r.hot.find(h=>h.name==='substep')?.share??0,active:r.hot.find(h=>h.name==='buildActive')?.share??0,evap:r.hot.find(h=>h.name==='updateEvapMod')?.share??0}));
const generated=proof.cases.filter(c=>c.generated),refused=generated.filter(c=>!c.generated.passed);
const small={base:read('build').base,buildId,hardware:all.hardware,screening,repeated,
  identity:{cases:proof.cases.length,checkpoints:proof.cases.reduce((s,c)=>s+c.checkpoints,0),attempts:generated.reduce((s,c)=>s+c.generated.attemptComparisons,0),refusals:refused.length,
    fixtureTicks:smoke.fixtureTicks,goldenLiveCheckpoints:smoke.liveCheckpoints,gridTicks:smoke.gridTicks,randomTicks:smoke.randomTicks,browserModels:browser.cases.length,
    testsPassed:tests.numPassedTests,upstreamTestFailures:tests.numFailedTests,galleryTests:gallery.numPassedTests,pinnedCases:pinned.cases.length,pinnedRefusals:pinned.cases.filter(c=>c.generated?.passed===false).map(c=>({id:c.id,seed:c.seed,size:c.size})),pinnedCheckpoints:pinned.cases.reduce((s,c)=>s+c.checkpoints,0),oracle},
  profile,selected:selected.rows.map(compact),tail:tail.rows.map(compact),regressions:repeatedRegressions.map(compact)};
json(resolve(HERE,'evidence/summary.json'),small);
json(resolve(HERE,'evidence/samples.json'),selected.rows.map(r=>byId.get(r.id)));
json(resolve(HERE,'evidence/pinned-digests.json'),pinned.cases.map(c=>({id:c.id,exportHash:c.exportHash,canonical:c.canonical,live:c.live,weather:c.weather.map(w=>({hazard:w.hazard,waterDigest:w.waterDigest})),checkpoints:c.checkpoints})));
const manifest=read('build');for(const v of Object.values(manifest.variants))v.sources=Object.fromEntries(Object.entries(v.sources).map(([p,h])=>[p.includes('/node_modules/')?'node_modules/'+p.split('/node_modules/')[1]:p.replace(/^\.\.\/\.\.\//,''),h]));
json(resolve(HERE,'evidence/source-manifest.json'),manifest);
writeFileSync(resolve(HERE,'evidence/selected.csv'),'case,stage,baseline_cpu_ms,fast_cpu_ms,cpu_ratio,baseline_wall_ms,fast_wall_ms,wall_ratio\n'+selected.rows.flatMap(r=>r.rows.map(s=>[r.id,s.stage,s.baselineCpuMs,s.fastCpuMs,s.cpuRatio,s.baselineWallMs,s.fastWallMs,s.wallRatio].join(','))).join('\n')+'\n');
const f=x=>x.toFixed(2),seconds=x=>(x/1000).toFixed(2);
const table=selected.rows.filter(r=>['riverValley','lakeBasin','islands'].includes(byId.get(r.id).theme)).sort((a,b)=>a.id.localeCompare(b.id)).map(r=>{const c=byId.get(r.id),s=r.rows.find(x=>x.stage==='canonical');return`| ${c.theme} ${c.size}² | ${seconds(s.baselineCpuMs)} → ${seconds(s.fastCpuMs)} | ${f(s.cpuRatio)}× |`;}).join('\n');
const tailTable=tail.rows.map(r=>{const s=r.rows[0];return`| ${r.id} | ${seconds(s.baselineCpuMs)} → ${seconds(s.fastCpuMs)} | ${f(s.cpuRatio)}× |`;}).join('\n');
const regressTable=repeatedRegressions.filter(r=>r.rows[0].cpuRatio<1).map(r=>`| ${r.id} | ${f(r.rows[0].cpuRatio)}× | ${f(r.rows[0].wallRatio)}× |`).join('\n');
writeFileSync(resolve(HERE,'REPORT.md'),`# Faster water: exact investigation

**Proposal:** adopt [water.ts](water.ts) through the milestone session; [INTEGRATION.md](INTEGRATION.md) has the proofs and regeneration commands. Product code is untouched. Reference: feature/m9b \`${small.base}\`.

## Where time went and what changed

Six baseline CPU profiles (river, lake, broad sea; 128²/256²) put 77–81% in flow substeps, with active-set rebuilding and evaporation updates taking most of the remainder. The baseline already uses an active set. This proposal maintains membership and wet-neighbour counts incrementally, invalidates evaporation only where occupancy changed, caches neighbour indices, avoids redundant clearing and dry/no-inflow arithmetic, and sorts private tile indices every 64 ticks for locality. All per-tile arithmetic, reduction order, source order, starting water, two substeps and stopping checks stay intact. Extra persistent storage: 1.44 MiB at 256².

![Baseline CPU profile](charts/profile.svg)

## Speed on this machine

${all.hardware.cpu.trim()}, ${all.hardware.logicalCpus} logical CPUs; Windows, Node ${all.hardware.node}. Same input and machine before/after; clone/check time excluded. Both implementations warmed up; paired order alternated. The batch screen ran alongside verification; CPU time still includes cache/clock contention. Repeated samples were collected after this investigation's verification workers stopped; other host activity is uncontrolled. CPU and wall samples are retained in [evidence](evidence/selected.csv).

The 1,073-case one-pair screen has median speedup **${f(screening.all.medianRatio)}×**, geometric mean ${f(screening.all.geomeanRatio)}×. Generated 128²/256² medians: ${f(screening[128].medianRatio)}×/${f(screening[256].medianRatio)}×. Median/P90/max baseline CPU: ${seconds(screening.all.baselineMedianMs)}/${seconds(screening.all.baselineP90Ms)}/${seconds(screening.all.baselineMaxMs)} s; candidate: ${seconds(screening.all.fastMedianMs)}/${seconds(screening.all.fastP90Ms)}/${seconds(screening.all.fastMaxMs)} s. These quantiles are separate distributions. The additional 96 pinned cases have a screened median of ${f(screening.pinned.medianRatio)}×.

Five paired observations per representative case (seed 1):

| Case | Baseline → candidate CPU seconds | Median paired gain |
|---|---:|---:|
${table}

Across these 14 cases, median paired gains for live edit/drought/badtide: **${f(repeated.live.medianRatio)}×/${f(repeated.drought.medianRatio)}×/${f(repeated.badtide.medianRatio)}×**. Full Normal 9-day drought and 8-day badtide measured. The three slowest and three lowest-ratio screened cases were remeasured with five pairs:

| Case | Baseline → candidate CPU seconds | Median paired gain |
|---|---:|---:|
${tailTable}

All ${screening.all.belowOne} screened regressions were repeated. Four paired CPU medians remain below 1; wall gains below 1 mean slower too. Windows thread-CPU samples show coarse ~15 ms quantization, so small cases are noisy. This is not a universal performance win:

| Case | CPU gain | Wall gain |
|---|---:|---:|
${regressTable}

![Repeated canonical timings](charts/speed.svg)

## Exactness and limits

**Zero byte mismatches**: all 12 golden fixtures under game/legacy rules (23,400 every-tick checks plus ${smoke.liveCheckpoints} live slices), narrow/rectangular grids (3,584 ticks), 100 randomized fractional/edge/source scenes (10,000 ticks); all 19 official maps, two pinned projects and two saves; M9b's complete seven-theme seed batches (700 at 128², 350 at 256²). The matrix compared ${small.identity.attempts} generator attempts and ${small.identity.checkpoints} simulation checkpoints, including sliced canonical/live settling, every weather frame and return to normal. Water, contamination, momentum/settle.out, saturation, ticks, volume, hysteresis, accepted exports, decisions and reports matched. ${refused.length} generator refusals matched too; empty exports were never counted as successful exports.

Full product/candidate TypeScript checks pass. Chrome ${browser.browser}: all fixtures plus six river/lake/sea models, both rules on fixtures, full weather; raw bytes agree and complete-state hashes match Node. Existing suite: **176 passed, two unchanged upstream failures** (D213 seed 23/96 has no badwater basin; historical day-one save depth error 0.0010567997879132873 exceeds 0.001). All 85 gallery pins pass; an additional 96-case matrix covers those maps, the ten determinism seeds and live seed 4242 through canonical/live/weather paths (${small.identity.pinnedCheckpoints} checkpoints). Four of those determinism seeds are refused identically by M9b (1000, 1037, 1111, 1185); these are water comparisons, not successful exports. Python water/basin checks pass. Independent Python oracle: ${oracle.pythonLoadPass} loads and round trips pass; ${oracle.generatedParityChecks} generated verdicts plus 19 official maps have zero disagreements. Its commands exit nonzero solely for unchanged Any/3/128 and Islands/20/128 generator refusals; tested export hashes are bound to the final candidate.

No result-changing variant was adopted. Exact early equilibrium must preserve today's stopping tick. Cross-core work would need per-tick barriers and browser shared memory. Planned-level initialization and a longer cap require a separate decision; neither was offered as a measured proposal. Flow arithmetic still dominates. The milestone can decide how to apply this gain to #150. Bulk outputs stay in ignored local/; small evidence and chart generators are committed.
`);
console.log('Small evidence and report generated for',proof.cases.length,'verified cases');

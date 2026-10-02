import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE} from './round2-common.mjs';
const rows=JSON.parse(readFileSync(resolve(HERE,'round2-summary.json'))).summary;
const identity=JSON.parse(readFileSync(resolve(HERE,'round2-identity.json'))),profile=JSON.parse(readFileSync(resolve(HERE,'profile-timings.json')));
const calibration=JSON.parse(readFileSync(resolve(HERE,'calibration-batch.json')));
const n=(v,d=0)=>v.toFixed(d),pair=(v,scale=1,d=0)=>n(v.median/scale,d)+' / '+n(v.max/scale,d);
const titles={chromium:'Chromium',firefox:'Firefox (optimized)',webkit:'WebKit (Windows)'};
const browserTable=rows.map(r=>`| ${titles[r.engine]} ${r.size}² | ${pair(r.firstVisibleMs)} | ${n(r.mainWorkMaxMs,1)} | ${pair(r.fillMs,1000,2)} | ${pair(r.droughtMs,1000,2)} | ${r.missedPreviews}/${r.changes} | ${n(r.cpuMeanPercent,2)}% |`).join('\n');
const cadenceTable=rows.map(r=>`| ${titles[r.engine]} ${r.size}² | ${n(r.cadenceMedianMs)} / ${n(r.cadenceMaxMs)} | ${n(r.cancelAckMaxMs)} |`).join('\n');
const calibrationTable=calibration.predictions.map(p=>`| ${p.id} | ${p.filled.surfaceRanges.map(r=>r.map(v=>n(v,6)).join('–')).join('; ')||'dry'} | ${n(p.filled.volumeM3,3)} | ${n(p.drought.coveredDays,6)} |`).join('\n');
const before=profile.totals['before.result'],after=profile.totals['after.result'];
writeFileSync(resolve(HERE,'REPORT.md'),`# Dam sketch, round 2

**Live adoption gate remains open.** The worker experiment and byte-preserving
overhead reductions are delivered; game calibration is written and unrun. Start:
dev \`c720cfe1\`, rebased onto \`071aa068\` after dev advanced; measured worker bundles
unchanged. Branch \`investigation/dam-sketch-2\`; product code unchanged against dev.

Ryzen 7 9800X3D, 16 logical CPUs; Chromium 145, corrected optimizing-only Firefox
146.0.1 and Windows Playwright WebKit 26. Three fresh-worker repetitions of three
River Valley walls per size, 12 wall changes at least 100 ms apart; 8-tick fill /
128-tick drought publications. **Every timing is provisional: CPU mean ${n(Math.min(...rows.map(r=>r.cpuMeanPercent)),2)}–${n(Math.max(...rows.map(r=>r.cpuMeanPercent)),2)}%.**
Every repetition's CPU span/samples are attached in browser-timings.json/CSV.

First water is a canvas upload in rAF (earliest paint opportunity); compositor
presentation is unmeasured. Startup/map parsing/warmup excluded. Fill runs from the
final wall change to the stopping check; drought is the subsequent explicit nine-day
pass. All 54 measured fills settled. “Missing” changes were superseded before a preview;
visible-only medians must be read with that column.

| Browser / size | First water ms med / worst | Main callback worst ms | Fill s med / worst | Drought s med / worst | Missing previews | Mean CPU |
|---|---:|---:|---:|---:|---:|---:|
${browserTable}

| Browser / size | Progressive paint cadence ms med / worst | Cancel acknowledgement worst ms |
|---|---:|---:|
${cadenceTable}

${rows.reduce((s,r)=>s+r.midFillCancellations,0)} mid-fill cancellations verified, ${rows.reduce((s,r)=>s+r.cancellations,0)} cancellation/supersession acknowledgements;
zero stale packets displayed. Frame-work scope sums sketch message and rAF callbacks.
Observed over-budget callbacks: Firefox 256² and WebKit at both sizes. rAF stalls
also occur in worker-free references (browser-controls.json); **the strict causal
“no frame over 16.7 ms” guarantee is unproven**, including Chromium. Headed editor
and compositor measurements on a low-load host remain required.

**Feel:** 128² Chromium/Firefox support live progressive feedback in this cohort.
256² is unreliable while dragging in every engine; WebKit also misses 128² updates.
Keep the wall immediate, mark earlier water pending, bound canvas/texture uploads,
coalesce before expensive construction and cache immutable topology. Next, measure
the approved multi-core water path at 256² in Chromium/Firefox, including pool
startup, copies and cancellation; retain byte gates. No speedup is assumed. Stacked
water needs its own optimization; Rust threads remain under investigation.

**256² profile:** Rust substep dominates (${n(100*profile.rustSubstepSamples/profile.cpuSamples,2)}% of ${profile.cpuSamples.toLocaleString('en-US')} CPU samples, including
identity overhead). Removed duplicate volume/mask scans, heightfield temporaries,
BFS neighbour arrays and per-tick reapplication of constant forcing. Reporting
${n(before/1000,2)} → ${n(after/1000,2)} s across the paired diagnostic cohort (${n(100*(1-after/before),1)}% less), CPU
${n(profile.load.mean,2)}%; provisional, one pass, no overall speedup claim. The dominant
physics cost remains. Profile timings and every before/after digest are retained.
Original **12 checks and TypeScript pass**; all ${identity.comparisons} round-one publications/column
digests and ${identity.additionalContracts.comparisons} varying-forcing/seep/signed-zero/roof contracts match,
excluding only runtimeMs. Compact browser final fields agree across all engines.

**Probe calibration, NOT RUN:** six authored recipes and schema-1 job template,
early roof checks, fixed reservoir masks and exact predictions; CALIBRATION.md.
Values below are at the engine's fill stop (often its unsettled six-day cap),
followed by measured dry-out days from that boundary; no source or consumption.

| Wall | Surface level range | Held m³ | Dry-out days |
|---|---:|---:|---:|
${calibrationTable}

Pass: level ±0.01, volume ±max(0.05 m³, 1%), dry-out ±8/768 day; compare every
column and checkpoint. **Current Probe cannot place these walls or restore the
prescribed initial columns:** dedicated-machine scene staging/verification is
required before its job template is executable. No game-exact claim is established.
No Timberborn launch, game assets, blueprint data or decompiled code committed.

Regenerate exactly: README.md. Dependencies, baseline source/maps, Wasm, full profiles,
raw frame logs and column predictions stay in ignored local/ (D195); compact evidence,
original code and three captures are committed. Licence: AGPL-3.0-or-later.
`);

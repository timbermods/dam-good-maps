import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE} from './common.mjs';
const e=JSON.parse(readFileSync(resolve(HERE,'PROFILE_EVIDENCE.json')));
const pair=(s,scale=1)=>((s.median*scale).toFixed(2)+'/'+(s.worst*scale).toFixed(2));
const g=e.generations;
const loads=rows=>{const sampled=rows.filter(r=>r.samples>0);return sampled.length?{mean:sampled.reduce((s,r)=>s+r.mean*r.samples,0)/sampled.reduce((s,r)=>s+r.samples,0),max:Math.max(...sampled.map(r=>r.max)),samples:sampled.reduce((s,r)=>s+r.samples,0)}:null;};
const analysisLoad=loads(e.loads.analysis),generationLoad=loads(e.loads.generation);
const loadText=l=>l?l.mean.toFixed(1)+'% mean, '+l.max.toFixed(1)+'% peak ('+l.samples+' PDH samples)':'no PDH samples';
const names=['roomMap','damSites','spillLevels','checks','measures','outcomes','m9bMeasures'];
const table=names.map(name=>{const r=e.aggregate.find(r=>r.size===256&&r.name===name);return '| '+name+' | '+['typescript','before','after'].map(k=>pair(r[k])).join(' | ')+' |';}).join('\n');
const gain=(1-g.after.analysis.median/g.typescript.analysis.median)*100;
const loopGain=(1-g.after.analysis.median/g.before.analysis.median)*100;
const profile=`# Firefox analysis follow-up

The original Firefox regression was a harness artifact: Playwright 1.58's
Juggler debugger pinned Wasm to baseline. Reusing Rust-water's two
[upstream debugger flags](https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/content/Runtime.js#L53-L57)
enables optimization in the **same Firefox ${e.version} executable**.
Baseline JIT is explicitly disabled; both Wasm modules instantiate and run.
No shared browser installation or product source changed.

The improved port uses early exits and cached coordinates in mine-room scans,
and validated fixed-buffer access in room/dilation scans and dam floods.
Arithmetic, traversal/list order and the fixed six-kernel policy stay unchanged.
The original Rust control is recompiled from **c336b37e** with the same toolchain.

**Firefox 256², milliseconds median/worst:** three repetitions per theme,
aggregated as the per-map average over seven seed-1 themes. Encoding/copies count;
initialization, warmup and result comparison do not. All columns below use the
corrected optimizing-only setup.

| Analysis | TypeScript | Original Rust | Improved Rust |
|---|---:|---:|---:|
${table}

During complete 256² generation, analysis seconds **median/worst**:
TS **${pair(g.typescript.analysis,.001)}**, original Rust **${pair(g.before.analysis,.001)}**,
improved Rust **${pair(g.after.analysis,.001)}**. The improved port takes
**${gain.toFixed(1)}% less analysis time than TS** and **${loopGain.toFixed(1)}% less than original Rust**.
Generation shares: **${pair(g.typescript.share,100)}% → ${pair(g.before.share,100)}% → ${pair(g.after.share,100)}%**.
The historical baseline-pinned 4.03/4.23s → 7.30/7.35s result is superseded;
it is preserved in EVIDENCE.json, not mixed into this paired cohort.

**Identity:** all 840 M9b inputs at 96²/128²/256² (including two matching
refusals), 19 official maps, 12 golden
fixtures and the edge contract pass in Chromium, corrected Firefox, WebKit and
native: **${e.identity.calls.toLocaleString('en-US')} kernel calls**. Every full default M9b descriptive
row also passes in all engines; all 840 native generations/state/measures/export
bytes pass with unchanged resident Rust water. The checked-buffer build replays
the same entire corpus without an invalid access. 1,762 edge/lifetime comparisons,
744 water contracts, executable/type checks and strict floating-point IR pass.
Only measured clock/CPU fields are excluded from deterministic identity.

Ryzen 7 9800X3D, shared PC, 16 logical threads. Timing work began after this
investigation's identity workers finished. Analysis load: **${loadText(analysisLoad)}**;
generation load: **${loadText(generationLoad)}**. These are observations, not isolated-host guarantees.
The corrected setup clears Firefox's generation-analysis regression. Cheap
outcome and descriptive-row medians retain overhead; keep those
contexts on TS at adoption until actual product-worker measurements show gains.

[PROFILE_TIMINGS.csv](PROFILE_TIMINGS.csv) has every analysis at all three sizes.
[PROFILE_EVIDENCE.json](PROFILE_EVIDENCE.json) binds source/binary/runtime hashes,
all samples/load and identity gates. [INTEGRATION.md](INTEGRATION.md) gives
regeneration commands; large results remain in ignored local/.
`;
const report=`# Rust analysis investigation

Product code is unchanged. One Rust source builds Wasm and native analysis,
using the existing Rust-water toolchain and unchanged resident native settle.
Nine kernels are ported; the fixed policy enables six.

**Firefox follow-up:** the old regression came from the baseline-pinning test
debugger. Under the corrected optimizing-only Firefox ${e.version} setup, 256²
analysis during generation takes **${pair(g.typescript.analysis,.001)}s TS →
${pair(g.before.analysis,.001)}s original Rust → ${pair(g.after.analysis,.001)}s improved Rust**
(median/worst, three repetitions across seven themes). Improved Rust uses
**${gain.toFixed(1)}% less analysis time than TS**. The port adds mine-room early exits,
cached coordinates and validated buffer access, preserving arithmetic and order.

**Identity:** all 840 M9b inputs (two matching refusals), 19 official maps,
12 golden fixtures and 1,762
edge/lifetime comparisons pass in Chromium, corrected Firefox, WebKit and native.
All ${e.identity.calls.toLocaleString('en-US')} captured kernel outputs, complete final checks/measures/outcomes,
every default M9b browser row and every complete native export agree.
The checked-buffer corpus, strict IR, adapter types, executable and resident-water
contracts pass. Only clock/CPU measurements are excluded.

Current Firefox timings, load, adoption gate and regeneration are in
[PROFILE_REPORT.md](PROFILE_REPORT.md) and [INTEGRATION.md](INTEGRATION.md).
[PROFILE_EVIDENCE.json](PROFILE_EVIDENCE.json) binds the improved port's proof.
Original **c336b37e** measurements remain in [EVIDENCE.json](EVIDENCE.json),
[TIMINGS.csv](TIMINGS.csv) and [GENERATION.csv](GENERATION.csv): its full native
840-map batch on 16 threads measured **18.52/19.82 minutes**, including Rust water.
That historical batch and other-engine performance have not been retimed here.
Large traces/binaries stay out of git.
`;
writeFileSync(resolve(HERE,'PROFILE_REPORT.md'),profile);writeFileSync(resolve(HERE,'REPORT.md'),report);console.log('Current Firefox and short investigation reports saved');

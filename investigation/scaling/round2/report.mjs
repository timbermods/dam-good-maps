import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dir} from './overlay.mjs';
const e=JSON.parse(readFileSync(resolve(dir,'measurements.json'),'utf8')),mib=n=>(n/2**20).toFixed(0),kib=n=>(n/1024).toFixed(0);
const t=(c,n,scale=1)=>{const r=c.timing[n],digits=scale===1&&r.medianMs>=10?1:2;return `${(r.medianMs/scale).toFixed(digits)}/${(r.worstMs/scale).toFixed(digits)} (${r.cpuMedianPercent}/${r.cpuWorstPercent}%)`;};
const rows=e.cases.map(c=>{const last=c.memory.find(r=>r.step===2048);return `| ${c.size}² ${c.phase} | ${mib(last.heapUsed)} + ${mib(last.arrayBuffers)} | ${kib(c.projectBytes)} | ${t(c,'undo-recent')} / ${t(c,'redo-recent')} | ${t(c,'save-project')} | ${t(c,'reopen-project',1000)} |`;}).join('\n');
const text=`
## Round 2 — history and saving

New force/Select history stores gestures and seeds, with disposable worker OPFS results/water.
**Payload memory is bounded; journal metadata and disk grow with edit count.** The 2,048-edit core
sessions include brushes, whole-map sculpts, features, entity properties and all five Power-100
forces (16 total). Every forward state, cold round trip and fresh-cache export matches bytewise.
Both variants use the same portable math and canonical force-input water; baseline includes Round 1.
This fixes derived payload retention, not a fixed total-memory bound for unlimited gestures.

Times: **median/worst**, with whole-machine **CPU median/worst** alongside, three repetitions.
Steady memory: Node GC heap + ArrayBuffer MiB, not browser-page RAM.

| Case | Steady MiB | Project KiB | Recent undo / redo ms (CPU) | Save ms (CPU) | Reopen s (CPU) |
|---|---:|---:|---|---|---|
${rows}

The mixed 256² trace uses more steady RAM: bounded caches buy recent undo latency. Dense literal
retention is tested separately below; these scopes must not be compared as total-editor memory.

Choose 128 MiB/16-step snapshots, 32 MiB results and 32 MiB geometry caches: 64 MiB can retain
only the current 512² state. At 512 edits, 64/128/256 MiB retained 1/4/10 states, with
113/169/282 MiB heap. Recent undo helps ordinary 256² maps too.
Cold undo and recomputation remain expensive; [timings](round2/timings.csv) include depth 32,
and [evidence](round2/measurements.json) includes cache-policy comparisons and peak RSS.
Cold opening rebuilds terrain/resources at every prefix; validated replay batching is follow-up work.
The cold 32nd redo at 512² takes 1.49/1.56 s (CPU 95/100%); recent-step caching is not deep-history speed.

Dense-cache stress (1,024 results, **cache only**, not UI forces): heap plateaus at 63/60 MiB
for 256²/512², with exact cold readback. Streaming saves/reads 553,770,010 JSON bytes above the
old string limit. Versions 1–3 preserve literal history; their large files do not become gestures
retroactively. Actual Chromium/Firefox OPFS passes 2,048-edit 512² save/reopen tests. Three-engine
five-force replay passes; native Safari storage remains a gate because Windows WebKit lacks OPFS.
The third Firefox storage repeat reaches a sampled OS working-set lower bound of ${(e.browserMemory.workingSetPeak/2**30).toFixed(2)} GiB,
summed across owned browser processes (page/worker shared); this is not isolated JS heap or steady RAM.
Cold redo also requires invalidating resource caches when restoring historical water.

Reuse the versioned gesture/seed/identity/input-hash envelope for collaboration. Canonical input
water requires an explicit agreement; old live-water inputs are never guessed. Feed cold replay,
input preparation and cache-accounting cost into investigation/performance for progress,
cancellation and scheduling. [Integration and regeneration](round2/INTEGRATION.md).
`;
const path=resolve(dir,'../REPORT.md'),old=readFileSync(path,'utf8').split('\n## Round 2')[0];writeFileSync(path,old.trimEnd()+'\n'+text);

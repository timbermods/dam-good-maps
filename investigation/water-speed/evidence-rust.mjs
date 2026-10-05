// Compact provenance only; generated state and full manifests stay in local/.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=import.meta.dirname, local=path.join(here,'local'), hash=b=>createHash('sha256').update(b).digest('hex');
const fileHash=f=>hash(fs.readFileSync(f));
const stages=['control','simd','layout','sync'];
const rows=stages.map(stage=>{
 const artifact=path.join(local,'artifacts',stage), r=JSON.parse(fs.readFileSync(path.join(local,'reading-'+stage+'.json')));
 const bytes=fs.readFileSync(path.join(artifact,'result.native'));
 const manifest=path.join(local,'proof',stage,'determinism/summary.json');
 const proof=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest)):null;
 return {...r,nativeBinarySha256:fileHash(path.join(artifact,'water-speed.exe')),nativeBatchSha256:fileHash(path.join(artifact,'water-batch.exe')),settle:{settled:bytes.readUInt32LE(0)!==0,ticks:bytes.readDoubleLE(4),steadyTicks:bytes.readUInt32LE(12)?bytes.readDoubleLE(16):null},proof:proof?{cases:proof.cases,engines:proof.engines,mismatches:proof.mismatches,baselineCheckpoints:196,logs:Object.fromEntries(fs.readdirSync(path.join(local,'proof',stage)).filter(f=>f.endsWith('.log')).map(f=>[f,fileHash(path.join(local,'proof',stage,f))]))}:null};
});
const sources=['rust/water/src/sim.rs','tools/rust/build.ts'];
const evidence={schema:1,base:'38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e',previousRemoteBranch:'ed6fc4fbe48ac2ba083522a06ac32fab848425d7',case:{theme:'lakeBasin',seed:1,width:256,height:256,inputSha256:fileHash(path.join(local,'settle-256.job'))},rust:execFileSync(path.join(process.env.USERPROFILE,'.cargo/bin/rustc.exe'),['-vV'],{cwd:path.join(local,'candidate'),encoding:'utf8',windowsHide:true}).trim(),wasmFlags:['+simd128','-relaxed-simd'],nativeFlags:['-fma','x86-64-v2'],concurrency:4,readings:rows,sourceSha256:Object.fromEntries(sources.map(f=>[f,{before:fileHash(path.join(local,'control',f)),after:fileHash(path.join(local,'candidate',f))}])),adoptionPatchSha256:fileHash(path.join(here,'adoption.patch')),stripRegressionSha256:fileHash(path.join(here,'strip-sync.rs'))};
fs.writeFileSync(path.join(here,'EVIDENCE-rust.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('compact provenance written; full state remains ignored');
const [control, simd, layout, sync] = rows;
for (const r of [simd,layout,sync]) if (!r.proof || r.proof.mismatches.length || Object.values(r.proof.engines).some(e=>e.errors.length)) throw Error('unfinished/failing proof for '+r.stage);
const ms=n=>Math.round(n).toLocaleString('en-US'), gain=(a,b)=>(a/b).toFixed(2), less=(a,b)=>(100*(1-b/a)).toFixed(1);
const pair=(a,b)=>`native ${ms(a.nativeMs)}→${ms(b.nativeMs)} ms; Chromium ${ms(a.chromiumMs)}→${ms(b.chromiumMs)} ms`;
const report=`- Base: dev \`38d4ee6b\` includes multi-core water; product files remain unchanged.
- Water-only plain SIMD flags: ${pair(control,simd)}; no standalone gain observed.
- Group four private neighbours/flows per tile and bound outflow slices: ${pair(simd,layout)}.
- Skip wet-list rebuild on unchanged row occupancy: ${pair(layout,sync)}; this single-thread case does not exercise strip sync.
- Observed control→final on the fixed 256² settle: native ${gain(control.nativeMs,sync.nativeMs)}× (${less(control.nativeMs,sync.nativeMs)}% less time), Chromium ${gain(control.chromiumMs,sync.chromiumMs)}× (${less(control.chromiumMs,sync.chromiumMs)}% less time).
- Each change: 98 canonical settles at 96/128/256/512, native and four strips; 57 pinned tests; 196 baseline determinism checkpoints; zero differing bytes.
- Strict IR/assembly/Wasm guards pass: no FMA, relaxed SIMD or changed reduction/source/stop order; final Rust and stacked-water checks pass.
- Adopt [adoption.patch](adoption.patch) using [INTEGRATION.md](INTEGRATION.md); [EVIDENCE-rust.json](EVIDENCE-rust.json) binds every reading and proof.

## One fixed case, one reading per stage

Lake Basin, seed 1, 256×256, generated and prefilled by unchanged dev. Rust 1.90.0, Node 24.13.0,
Chromium/installed Chrome ${sync.chromium}, Ryzen 7 9800X3D, Windows; the PC remained shared.
The previous stage's one reading is reused as the next change's before value. These are individual observations,
not medians, guaranteed gains or speed gates. No warmup settle or additional timing case was run.

| Cumulative stage | Native ms | Chromium ms | Full result SHA-256 |
| --- | ---: | ---: | --- |
${rows.map(r=>`| ${r.stage} | ${r.nativeMs.toFixed(3)} | ${r.chromiumMs.toFixed(3)} | \`${r.resultSha256.slice(0,16)}…\` |`).join('\n')}

The timed operation is one full canonical settle from prefilled water, including protocol decoding, simulation
construction and result encoding. Generation/prefill, input file reads/copies, process launch and Wasm compilation
are outside the reading. Instances start cold; browser tiering and host activity can influence the numbers.
The output is ${sync.bytes.toLocaleString('en-US')} bytes, with ${sync.settle.ticks} ticks; settled=${sync.settle.settled},
steadyTicks=${sync.settle.steadyTicks ?? 'none'}. Its complete hash is
\`${sync.resultSha256}\`; input hash is
\`${sync.inputSha256}\`. Every native/Chromium reading matches that exact output.

SIMD alone did not establish a speedup. The final patch retains the water-only flag alongside the layout change;
the compiler emits packed memory operations, while directional reductions remain scalar and ordered.
The layout removes repeated direction-index bounds checks through safe fixed-size tile arrays and bounded slices,
and puts one tile's neighbour IDs together. Scratch/neighbor capacities stay unchanged; no unchecked indexing is used.
The sync shortcut removes an active-list scan when all copied halo tiles keep their occupancy. The large native
layout→sync timing drop is not a demonstrated benefit of this shortcut: this timed native call never calls sync.
Shared-host variation and compiled-code layout can affect a single reading. Its strip speedup
is unmeasured here, and variation in this single-thread reading cannot be attributed to that shortcut.

## Identity evidence

Each candidate passes the current water-identity assertions over all 13 golden fixtures under both game/port rules,
all seven generated themes at 96/128/256, retained lakes and drained water, and the tool's tiled 512 case.
Seeds are the tool's defaults: 1–2 at 96/128, seed 1 at 256/512. Each pass has 98 canonical settles and
211,264 multi-core ticks. The local check adds direct comparisons with unchanged dev's compiled water, keeping
all existing assertions. SIMD also passed the original unmodified tool separately before this combined check.
The simulation arrays, saturation, momentum, settled/tick/steady-tick values are compared as raw bytes.

Existing binding and pinned speedup tests pass (57 tests), including 1×1, 1×9 and rectangular maps,
old depth, signed zeros, dams, seeps, changing floors, drought and every-tick bookkeeping. Final native Rust
has 13 passing tests, including the new row-sync reconstruction regression; all eight stacked-water fixtures
match their pinned fields natively and in Node-Wasm, with both sliced-settle checks passing.
The current determinism tool runs six water/weather/stacked cases: 196 complete-state checkpoints each in
Node, Chromium and Chromium with four water threads, with zero mismatches/errors and 1,020 threaded ticks.
Every candidate's Node manifest also matches unchanged dev's 196 baseline checkpoints. It exercises badtide
at 128/256 and dry→normal→drought→badtide water at 96/512. Other browsers and unrelated force matrices were
not run. This corpus plus unchanged arithmetic/order supports adoption; it is not exhaustive enumeration of inputs.

Optimized native and Wasm IR, assembly and unstripped Wasm pass the repository maths guard after each change.
Native flags remain \`-fma,x86-64-v2\`; only the water's embedded Wasm gets \`+simd128,-relaxed-simd\`.
The candidate TypeScript typecheck passes, and the adoption patch applies cleanly. No pins or versions are changed.

## Starting evidence and scope

[The earlier water investigation](REPORT-typescript.md) put 77–81% of TypeScript water time in flow substeps.
[Perf-audit's report at 9e366c6c](https://github.com/timbermods/dam-good-maps/blob/9e366c6c25136c25c21a029245923ceca01e551f/investigation/perf-audit/REPORT.md)
identifies resident arrays, strict SIMD and sparse-loop bounds/branches as candidates, while noting that water
already has most of its separate state arrays. [Rust-analysis's report](../rust-analysis/PROFILE_REPORT.md)
records benefits from early exits and validated buffer access in other kernels. Those guided this investigation;
no fresh CPU profile or sampling was taken. Timing only the fixed settle avoids claiming a generation or
whole-editor speedup; adoption uses the same water module for live settles, weather, generation and strips.

Everything committed stays in this folder. The patch is limited to \`rust/water\` and the water's build flags;
public arrays/ABI, product TypeScript and the forces remain as they were. Full binaries, jobs, output bytes and
manifests stay in ignored \`local/\` under D195. Regeneration commands and inputs are in INTEGRATION.md;
expect tens of minutes, dominated by correctness checks, with cargo/test workers capped at four and engines serial.
The authorized remote branch previously pointed at the closed TypeScript investigation, \`ed6fc4fb\`;
its reports are preserved here. The one branch push uses a lease on that exact old commit. No other branches,
merges, approvals, auto-merge, tags, releases or game probes are involved.
`;
fs.writeFileSync(path.join(here,'REPORT.md'),report);
console.log('REPORT.md written with an eight-line opening summary');

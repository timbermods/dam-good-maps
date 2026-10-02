# Adoption

Base: latest fetched `feature/m9b`, **e292cefe30469033a922650f0455f87297c051d5**.
This investigation's commits change only `investigation/rust-analysis/`. The PR into
`dev` inherits unreleased M9b history; adopt the investigation commit after M9b,
rather than adopting that history through this experiment.

`analysis.rs` is the single analysis source for scalar WebAssembly, the native
manifest executable, and the native Node addon. The addon reuses the unmodified
Rust-water source at **d18a6f4d890d3f2e3f7b480e308242375c100e10**, extracted into
ignored `local/rust-water.rs`. No extra Rust libraries are required. The portable
Rust 1.90/LLVM-MinGW toolchain and load sampler come from that investigation.
Perf-audit **9e366c6c** and gen-speed **dc68651c** informed kernel selection; their
product patches are not applied. The current TypeScript policy, generator, RNG,
repair/rejection order and M9b measure function remain the reference.

## Interfaces and policy

Nine kernels: `distanceFrom`, `walkDistance`, `walkRegions`, `landRegions`,
`components`, `levelRegions`, `spillLevels`, `damSites`, `roomMap`.
`bridge.ts` provides their existing arguments/result shapes through `invoke`.
Returned arrays belong to JavaScript and survive subsequent calls and memory
growth. Each Wasm call allocates/copies/frees its input and result in one retained
instance; every memory view is reconstructed after a potentially growing call.
Inputs, public arrays, stamp/heap order, neighbor order, stable dam ranking and
greedy mine-square selection retain the reference semantics. Arithmetic uses
binary64 with the exact `Math.SQRT2` constant. No FMA, reassociation, approximate
math, relaxed SIMD, different thresholds or reduced sampling are permitted.

The fixed measurement policy (`ADOPTION_KERNELS`) selects six kernels:
distance, walking distance, land regions, spill fields, dams and mine-room scans.
Keep the TypeScript `levelRegions`, `walkRegions` and `components` as the default
for their inexpensive label scans. All nine ports have identity checks and direct
timings. Selection is fixed by code, never by measured timing, machine load or RNG.
Checks, object handling, start rules, theme outcomes and M9b's descriptive measures
retain their TypeScript orchestration and call the selected Rust kernels.
Firefox regresses in the measured Wasm path, particularly `roomMap`. Performance
is an adoption gate: retain the TypeScript backend in Firefox until follow-up
work clears that gate. Chromium/WebKit/native gains do not justify enabling it
there. Backend routing can use the existing engine/capability configuration;
never choose it from task timings or change numerical policy. All-nine identity
coverage still includes Firefox's Rust implementation.

For milestone adoption, retain adjacent TypeScript implementations. Initialize
the analysis module once in the generator/check coordinator worker, before its
first task:

```ts
await installRustAnalysis(await (await fetch(wasmURL)).arrayBuffer());
```

Use Vite's `?url` asset import and serve `application/wasm`. Replace selected
functions with wrappers that call `invoke(name, args)`; preserve their exports,
defaults, synchronous signatures and result types. The investigation's `__ra`
global hooks exist only in generated harness bundles; do not adopt those hooks.
Failed initialization selects the original TypeScript implementations. If a call
fails during a task, restart that seeded task on TypeScript before publishing its
result. Do not continue from partially modified generation state. Preserve worker
readiness, task IDs, cancellation and UI scheduling.

Native: load `analysis.node` before the native generator bundle, install it with
`installNativeAnalysis`, and use `native-water.ts`. The latter reuses Rust-water's
public-array synchronization and retained independent simulator handles. Native
water owns no global simulator or numerical reduction: independent maps are
scheduled to 16 Node workers, each calling the same native Rust library. Water
handles are finalized on collection/worker teardown; `dispose()` explicitly frees
finished instances. The TypeScript superclass remains for unchanged helpers and
SettleRun stopping/slicing. Arrays are copied as raw bytes, not rounded through
JSON or decoded by per-number callbacks. Dold, momentum, seep state, mutable floor,
dam and ordered emitter forcing synchronize at the same run boundaries.

The native executable reads `input<TAB>output` manifest lines and an explicit thread
count. Its framed binary input is the bridge's encoded binary64 arguments. It is
also useful for kernels without Node. The complete M9b measurement batch uses
the addon so generation, policy checks and measures retain their exact interfaces.

## Identity and timing method

The 840 inputs are seven themes × seeds 1–40 × 96²/128²/256², including generator
refusals. Pair original generation and instrumented candidate generation; compare
complete deterministic analysis, report/check objects, features, intentions,
outcomes, M9b measures and export bytes. At every replaced call, independently run
the original TS kernel and compare raw output bytes, including labels and list
ordering. Native full generation also captures/comparisons every mine-room call.
Replay all captured arguments in each engine/native and check every output byte.
For final validation, metrics and outcomes, run the actual TS interfaces both with
and without the port, and compare the complete results with pinned Node expectations.
Official maps use all original objects and Rust-water's byte-checked canonical
state; golden fixtures and rectangular/threshold/tie/lifecycle cases join the matrix.
`native-export.mjs` additionally compares every complete native `.timber` byte and
captures M9b's exact post-generation inputs. `build-m9b-browser.mjs` extracts the
original descriptive arithmetic from `measureOne`, with generation supplied by
that captured result. The callback diagnostics `shown` and `changed` are retained
from verified full generation; clocks are normalized outside comparisons. Every
complete default M9b row is then compared in all engines with TS, the six-kernel
policy, and all nine kernels. `m9bMeasures` timings isolate this descriptive work
from generation. No optional weather-cycle arithmetic is extracted or claimed.

Clock-derived `ms`, process CPU-share and `spent.ms` fields cannot be byte-identical
between executions. They are the measurements, not deterministic map results;
only those fields are excluded from identity. No measure value, check message,
flag, field, label, result ordering or deterministic metadata is excluded.
The batch uses M9b's default measure set (`cycle=false`); optional `--cycle` weather
simulation is outside this analysis study. Browser evidence uses complete captured
generation traces plus actual final check/measure/outcome interfaces, rather than
rerunning all terrain/water generation in each browser. The seven timing maps do
run complete generation in each engine.

Direct timing uses representative seed-1 maps for every theme/size, three paired
repetitions after kernel warm-up. Per-kernel timing selects the largest captured
argument set of each kind for that map. It includes bridge encoding, native/Wasm
execution, copying and reconstruction; module compile/fetch is outside timing.
Complete validation/metric/outcome timings use the fixed six-kernel policy.
Generation shares are disjoint exclusive instrumented analysis/check time divided
by actual complete generation time, seed 1 in all seven themes at 256², three
reversed-order pairs. Both sides keep the same TS water for this comparison.

Full native batch timing includes fresh worker startup, terrain generation,
prefill, native Rust water settle, checks, measures and result verification, for
all 840 maps on 16 workers. It excludes compilation and source bundling. Report
median and largest sample, with Windows PDH total CPU load. Sub-second cells can
have no 1-second counter sample; absence is recorded as missing, never as zero.
Do not reuse the exploratory all-nine/default-decoder timing cohorts.

## Regenerate

Run from this directory. Set `DGM_DEPS` to a read-only existing dependency checkout
with Node 24, esbuild and TypeScript. Set `DGM_WATER` to the pinned Rust-water study
directory and `DGM_OFFICIAL` to its original 19 non-underscore `.timber` maps.
`DGM_PLAYWRIGHT` can name the existing compatible Playwright package directory.
The installed 1.58 browser package on this PC was reused; no browser or global
dependency installation is required. `common.mjs` provides this PC's checkout
defaults. `compile.ps1` reuses its existing outer Rust-water portable toolchain.
On other hosts, compile `analysis.rs` with Rust 1.90 and a matching native linker;
the Windows addon import library requires Node's N-API symbols. Linux/ARM addon
builds and CI adoption remain milestone work, not measured claims here.

```powershell
./compile.ps1
node build.mjs
node build-native.mjs
node typecheck.mjs
node water-contract.mjs
node smoke.mjs
node corpus.mjs --jobs 16
node compact.mjs
node exe-contract.mjs
node native.mjs --mode batch --verify --reps 1 --threads 16
node native.mjs --mode replay --threads 4
node build-browser.mjs
node browser.mjs --bench --reps 3
node bench-native.mjs --reps 3
node bench-generation.mjs --reps 3
node browser.mjs --generation --reps 3
node native.mjs --mode batch --reps 3 --threads 16
node native-export.mjs
node build-m9b-browser.mjs
node browser-m9b.mjs
node bench-m9b-native.mjs
node verify-ir.mjs
node summarize.mjs
node write-report.mjs
```

If the Node/esbuild service stalls on this shared Windows host, use the existing
esbuild executable directly; build-browser.mjs does that. Do not alter system
PATH, install another toolchain or write outputs outside this investigation.
`local/` contains all binaries, compressed raw arguments/expectations, models,
browser logs and large timing results and is ignored. Compact finished traces
before concurrent replay. Corpus resumes only with matching fingerprints; browser
logs bind the worker/Wasm fingerprint and each input hash. Re-run after adopting
the functions in actual product workers and keep determinism as a release gate.

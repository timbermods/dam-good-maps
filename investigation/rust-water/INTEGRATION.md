# Adoption after M9b's release

Base: `feature/m9b` **e292cefe30469033a922650f0455f87297c051d5**, with D359's faster
settle and D358's six-day cap. Product files were read and bundled, never edited. Until
M9b lands, the investigation branch inherits its history: adopt only this investigation's
commit after the release. REPORT.md holds the measured results and limits.

## Interface and startup

`src/lib.rs` is the common Rust source for native and Wasm. It ports WaterSim and the
canonical stopping test, including sealed-basin steadyTicks. It keeps source order,
four-direction addition order, row-major volume/sealed reductions, both substeps,
evaporation cadence, game/port rules, hysteresis, warm starts and the six-day cap.
It uses ordinary binary64 operations and ceil. No approximate transcendental functions,
fast-math flags, `mul_add`, reassociated reductions or early stopping are permitted.
Rust documents the rounding difference for [fused multiply-add](https://doc.rust-lang.org/std/primitive.f64.html#method.mul_add).

`water.ts` retains the synchronous TypeScript interface by inheriting the pinned simulator
and overriding run/saturation. SettleRun and its slicing remain the pinned TypeScript code
in browser use; native has the same stopping test in Rust. Canonical prefill, warm-start,
terrain planning and weather forcing are still shared TypeScript. Public arrays keep normal
JS identities; run copies floor/dam/momentum in and the evolved state out. A worker retains one
Wasm allocator arena, with independent Rust handles for its maps. Temporary memory views are
created after every call that can grow memory; no view survives between Rust calls. Interleaved
small/512² maps, growth, disposal and 250 subsequent allocations are checked against TypeScript.
Repeated private instances exposed installed-WebKit allocator traps even before decoding inputs;
the retained arena avoids that lifecycle. This observation does not establish the engine's fault.
`dispose()` frees a map's Rust allocations and unregisters its finalizer; FinalizationRegistry
also frees unreachable maps. Without that capability startup selects TypeScript. Dispose completed
worker tasks explicitly to bound peak memory. The inherited JS caches are retained too; measure
memory/latency in the milestone's actual worker integration.

For adoption, move the pinned TypeScript implementation to an adjacent fallback module,
change the two local reference imports in water.ts/protocol.ts to it, and replace the water
module with this adapter. Preserve the exact public helper exports. Before any task in
the generator/editor coordinator worker, await once:

```ts
import wasmURL from './water.wasm?url';
import {installRustWater} from './water';
await installRustWater(wasmURL);
```

Gate existing Comlink calls on readiness, as parallel-water describes. Compile/fetch/instance
failure before construction selects the unchanged TypeScript simulator. A Wasm failure after
water advances must discard the task and restart from its original model/forcing on TypeScript;
continuing a half-written task cannot promise identity. Existing cancellation and task IDs still
apply at SettleRun slices. Do not initialize on the UI thread or select backends per timing.

Mutable floor, dam values, source strength/contamination and seep limits are synchronized at
run boundaries. Keep the existing constructor source-cell membership contract: neither the
faster TypeScript caches nor this adapter supports arbitrary changes to source membership or
public depth arrays between runs. Native receives prefilled initial bytes and an ordered forcing
schedule through PROTOCOL.md; it does not regenerate terrain or invent weather maths.
The same Wasm module also exports `water_execute(inputPointer, byteLength, outputLengthPointer)`
for complete Rust binary jobs, including stopping. Its returned boxed byte slice is released with
`water_dealloc(pointer, outputLength)`. The synchronous public adapter deliberately preserves
the existing TS stopping/slicing contract; the reported browser timings measure that adapter.

## Cores and the parallel-water study

Native threads process independent maps, keeping every map's numerical reductions sequential.
browser-pool.mjs is an unmeasured independent-map prototype; its timer includes startup/copying.
No browser-pool speed claim is made in REPORT.md.

For one map on several cores, `prepare-parallel.mjs` extracts the flow/depth/dam loops directly
from `src/lib.rs` into an ignored allocation-free Rust kernel. It reuses parallel-water's runtime,
helper and isolation bootstrap at `68d68313`, including the same fixed partitions and two barriers
per substep. TypeScript retains the pinned bookkeeping, source updates, stopping test and ordered
reductions; only those numerical loops execute in Rust. Each instance imports the same shared
Wasm memory and has its own 64 KiB stack; tile writes have disjoint ownership. There is no shared
allocator. Storage reserves 141 bytes per tile including indices, plus descriptor/stack space,
starting at 2 MiB.
The scalar Rust simulator and the hybrid threaded experiment are separate adoption candidates.

Use that study's isolation/bootstrap/cache worker and failure-restart protocol as the single
adoption path. Budget helper cores across simultaneous maps. Threaded startup requires isolation,
shared memory and Atomics; its fallback is the original scalar TypeScript before work advances.
The measurement harness rejects an unexpected fallback. Rust 1.90 warns that its atomics target
feature is unstable, so this threaded candidate needs a pinned build and milestone verification.
Send shared memory **last** in the worker payload after its views: this works around the installed
Firefox's [structured-clone bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1821582).
The installed WebKit closed once during a threaded timing run; retrying the unchanged build
passed that case. The interruption and outliers are recorded. Treat threaded lifecycle stability
as an adoption gate alongside bytes; do not conceal a crashed task behind a timing fallback.

## Build and CI

Rust 1.90.0 is pinned in rust-toolchain.toml; the crate has no third-party Rust dependencies.
With an existing Rust/native linker: `rustup target add wasm32-unknown-unknown`, then from this
directory `cargo build --release` and `cargo build --release --target wasm32-unknown-unknown --lib`.
`.cargo/config.toml` keeps artifacts in local/target and disables x86 FMA. Do not add
target-cpu=native, fast-math or relaxed SIMD during adoption. Normal Rust operations are strict;
the absence of FMA is also checked in emitted LLVM IR. Other CPUs/OSes need the proposed CI matrix.

On this shared Windows PC, dot-source `./setup.ps1 -PortableWindows`. It keeps Rust and a pinned
LLVM-MinGW linker under local/toolchain without changing system PATH/settings. Invoke cargo
through `$env:CARGO_HOME/bin/cargo.exe`. This investigation's actual portable toolchain sits
in its outer local/toolchain; set CARGO_HOME/RUSTUP_HOME/the linker accordingly when reusing it.

The milestone adds the Rust toolchain and pre-Vite compilation to CI, copies the .wasm from
local/target/wasm32-unknown-unknown/release into the adopted asset location, and keeps the TS
fallback in the bundle. ci.yml is an **uninstalled adoption template**, with golden native/Wasm
and three-browser checks. It does not claim Linux/ARM CI has run. Vite's ?url gives an app-base
URL for Pages/preview. Serve application/wasm; enable gzip or Brotli on the hosting layer.
The file's actual raw/gzip/Brotli sizes and hash are in evidence.json.

## Regenerate evidence

Use Node 24, Python with numpy, esbuild, TypeScript and Playwright. Dependencies can be reused
read-only by setting DGM_DEPS to an existing product checkout. DGM_BROWSER_DEPS optionally
selects a matching Playwright installation (the existing 1.58.2 browsers were used here).
Use a separate isolated dependency folder under local/ if installing anew. Set DGM_OFFICIAL
to the read-only directory holding all 19 .timber maps. No game is launched. Large models,
exports, raw expectations, binaries and logs all stay in ignored local/.

```powershell
$env:DGM_DEPS = 'C:/path/to/dependency-checkout'
$env:DGM_BROWSER_DEPS = 'C:/path/to/matching-playwright-runtime' # optional
$env:DGM_OFFICIAL = 'C:/path/to/investigation/raw/builtin'
$env:PYTHONDONTWRITEBYTECODE = '1'
# Compile both targets first, as above.
node build.mjs --wasm
node smoke.mjs --native
node golden-contract.mjs
node build-browser.mjs
node browser.mjs --smoke
node corpus.mjs --jobs 4
node prepare-checks.mjs --jobs 4
node extra.mjs
node native.mjs --threads 16
node browser.mjs --bench --reps 3
node bench-native-cases.mjs --reps 3
node node-batch.mjs --threads 16 --reps 3
node prepare-parallel.mjs
& "$env:CARGO_HOME/bin/rustc.exe" local/shared-kernel.rs --crate-type cdylib --target wasm32-unknown-unknown -O -C panic=abort -C target-feature=+atomics,+bulk-memory,+mutable-globals -C link-arg=--shared-memory -C link-arg=--import-memory -C link-arg=--max-memory=268435456 -C link-arg=--export=__stack_pointer -o local/shared-water.wasm
node build-parallel.mjs
node typecheck.mjs
node parallel.mjs --reps 3
# Emit ordinary scalar LLVM IR, then check for FMA/relaxed arithmetic/transcendentals.
& "$env:CARGO_HOME/bin/cargo.exe" rustc --release --target wasm32-unknown-unknown --lib -- --emit=llvm-ir
& "$env:CARGO_HOME/bin/cargo.exe" rustc --release --lib -- --emit=llvm-ir
& "$env:CARGO_HOME/bin/rustc.exe" local/shared-kernel.rs --crate-type cdylib --target wasm32-unknown-unknown -O -C panic=abort -C target-feature=+atomics,+bulk-memory,+mutable-globals --emit=llvm-ir -o local/shared-water.ll
node verify-ir.mjs
node curve.mjs
node oracle.mjs --seeds 1-21 --parity-seeds 1-40 --sizes 96,128,256
node summarize.mjs
```

Generation/expectation/browser jobs resume only with matching fingerprints.
Independent browser cases can be split with `node browser-shards.mjs --engine firefox --jobs 4`;
it joins the completed fingerprints, then runs the complete smoke and repeated timing pass.
Threaded measurements can resume with `node parallel.mjs --resume --reps 3` only when the
shared kernel/coordinator/helper fingerprint is unchanged.
CPU load is Windows PDH Processor(_Total) % Processor Time; Linux timings use cumulative CPU deltas. Every reported
timing has repeated samples, median and maximum; samples obtained under load remain labelled.
Python checks the independent load/round-trip/validator contracts, including official maps;
any generator refusal is counted separately from a validator disagreement.

For identical model, initial state and forcing bytes, the settle's fixed operation order provides
the identity argument; finite tests exercise it rather than prove every possible input or future
compiler. Cross-browser terrain planning/forcing is a separate boundary: curve.mjs records actual
cadence, one-tick counterexamples and the result-changing portable-math control. Do not silently
adopt portable planning/forcing while claiming today's bytes remain unchanged. Repeat the matrix
on the milestone's adopted build, then update its living simulation/editor docs.

# Rust forces adoption notes

This investigation leaves product computation and presentation unchanged. Adoption remains blocked until every `STATUS.json` gate has pinned evidence. `node acceptance.mjs` enforces that; a passing timing cohort alone is insufficient.

## Scope and baselines

Oracle: dev `4aab909e23016902cbbe6ffaeddeece786176ab3`, with all five released forces. Dev advanced to `b4c211b0` during the run; the forces, maths, simulation, format, generation and existing force suites are unchanged (`baseline-check.json`). Water reuse: `2ebeea87c55d5f728c735d79a6d24bde78999db7`. The investigation reuses its Rust 1.90.0 toolchain, LLVM-mingw linker, retained Wasm arena/view pattern, strict arithmetic, native driver, byte checks and load sampler. The water kernel is embedded in the single `src/lib.rs`; its dev-compatible forcing and edge policies are preserved. The Firefox debugger finding is applied only to an isolated browser copy, with an unchanged executable hash (`prepare-firefox.py`).

All five computations are typed: geometry, terrain, water, object footprints, Floor/Keep, object changes, literal changes and animation tapes. Carve includes source groups, rider moves, step changes, oxbows and retained water. Glaciate includes candidate routing, floors, meltwater, tarns, springs and settling. Quake includes final Slide water and playback extras; Craterize includes arrival; Erupt includes heat and flows. Reduction order and portable transcendental arithmetic match the oracle; native FMA and Wasm relaxed arithmetic are prohibited.

`serde_json::Value` is confined to cold fixture import/debug output and opaque object metadata. Planners use typed structs, flat arrays, numeric object slots and interned numeric ID keys. Original opaque metadata is shared, not traversed or translated during computation. Fixture serialization must preserve signed zero and IEEE NaN payloads. Firefox normalizes a NaN sign on typed-array reads; the cold encoder retains the original scalar bytes in a WeakMap without altering ordinary JS fields: a valid Quake stroke can contain a zero-length resampled segment with NaN directions.

## Retained interface

`bridge(wasm).create(job)` imports immutable metadata once and copies initial numeric arrays directly into retained Wasm allocations. The map thereafter lives in `WebAssembly.Memory`: heights `Uint8Array`, lava `Uint32Array`, depth/contamination/rock `Float64Array`, Keep `Uint8Array`; object coordinates and source strengths are SoA `Float64Array`, flags/order are `Uint32Array`. Use the numeric map views and object coordinate views for host reads and edits. Source strengths, flags/order and source-kind buffers are result views; changing source metadata or membership requires cold arena synchronization.

For each operation, `task.configure(verb, settings, intent, margin, options)` writes the finite command/path buffers. Carve's optional source ID, unleashed ID and badwater flag can change per operation; IDs occupy a retained UTF-8 control buffer, grown before planning only if its initial 4 KiB capacity is exceeded. `task.plan()` makes **one** Wasm operation call, changes the retained map in place and returns a typed error code. `task.result(verb)` reacquires typed map, object, changed-region, geometry, playback and before-map views from the fixed descriptor. Footprints return flat tiles with offsets. There is no generic map codec on this path. The numerical map allocations remain stable across forces, including Glaciate's candidate winner and refusal rollback. IDs use stable numeric slots; only newly generated IDs add UTF-8 metadata.

Views must be reacquired after an operation, arena creation, or any memory growth. Output records live until the next operation/reset/disposal; copy a tape that the presentation/history must retain. `task.before` preserves the immutable input needed for preview/animation. `task.closure` exposes Carve's oxbow closure. `checkpoint/reset` are fixture conveniences, excluded from operation timings. `dispose` is idempotent; later use throws. New/remapped opaque object metadata needs cold arena synchronization during the corresponding host edit, outside force planning.

`typed-result.ts` reconstructs nested raw/final maps and original object classes **for diagnostics and existing-suite injection**. `pack`, `prepare`, `forces_execute` and native fixture stdio are likewise cold paths; do not install them as the editor's force boundary. Adoption must consume the finite typed layout directly. A prior timing cohort that reconstructed complete nested maps is retained separately as negative evidence.

Keep TypeScript presentation: animation, Slow forces, sounds, stroke previews and controls. Adapt its record readers to the typed tapes without changing step count, ordering, scheduling or feel. The diagnostic verifier compares typed storage directly and traverses other records, retaining canonical key order, sequence order, signed zero and NaN bytes; its protocol-equivalence checks run in `verifier-check.mjs`. The existing-suite adapter compares TypeScript's independent computation, then supplies Rust states/tapes before the unchanged assertions, worker history and exports run. Both production `finish=true` and the historical Glaciate `finish=false` comparison run through Rust. The latter is a diagnostic option in command slot 21; production leaves it zero.

## Regenerate (Windows)

Run here. Everything generated stays ignored under `local/`; never commit bundles, Wasm/executables, maps, exports, IR, failure payloads or full result corpora. Compact evidence contains hashes, counts and repeated timing samples. Use an isolated run directory to avoid overwriting a running investigation's binaries.

Prerequisites: `../rust-water/local/toolchain/` from its pinned setup; existing product dependencies via `DGM_DEPS` (measured: `C:/Users/Kyler/code/DamGoodMaps-m9b`); matching Playwright and @playwright/test 1.58.2 drivers/Chromium 1208, Firefox 1509 and WebKit 2248 via `DGM_BROWSER_DEPS`. `node prepare-oracle.mjs` exports the pinned Git tree read-only to `local/oracle`; alternatively set `DGM_ROOT` to that exact checkout. Apply the water investigation's two upstream debugger settings with `python prepare-firefox.py SOURCE_FIREFOX_DIRECTORY local/firefox-optimized`; the script verifies unchanged executable bytes and records both archive hashes. Set `DGM_FIREFOX` to that copy's `firefox.exe`.

```powershell
. ./setup.ps1
$env:DGM_RUN_DIR = 'final'
$env:CARGO_TARGET_DIR = Join-Path $PWD 'local/final/target'
$env:DGM_DEPS = 'C:/Users/Kyler/code/DamGoodMaps-m9b'
$env:DGM_BROWSER_DEPS = Join-Path $PWD 'local/browser-deps'
$env:DGM_FIREFOX = Join-Path $PWD 'local/firefox-optimized/firefox.exe'
# For a fresh machine without local/checkout:
# node prepare-oracle.mjs
# $env:DGM_ROOT = Join-Path $PWD 'local/final/oracle'
cargo build --locked --release --features bench-clock --target wasm32-unknown-unknown --lib
Copy-Item local/final/target/wasm32-unknown-unknown/release/rust_forces.wasm local/final/forces-bench.wasm
cargo rustc --locked --release --target wasm32-unknown-unknown --lib -- --emit=llvm-ir
cargo rustc --locked --release --lib -- --emit=llvm-ir
cargo build --locked --release --features bench-clock
node verify-ir.mjs
node build.mjs
node check.mjs --server --exports --verbs footprint,craterize,erupt,quake,carve,glaciate --count 4 --name codec-final
node lifecycle-chain.mjs
node edge-check.mjs
node footprint-check.mjs
node verifier-check.mjs
$env:DGM_SUITE_NATIVE = '1'
$env:DGM_SUITE_CAPTURE = '1'
$env:DGM_TEST_REPORT = 'existing-final.json'
node existing-tests.mjs
node suite-replay.mjs
node native-bench.mjs --verbs footprint,craterize,erupt,quake,carve,glaciate --cases 0,1 --reps 5 --name sealed
node browser.mjs --verbs footprint,craterize,erupt,quake,carve,glaciate --bench --count 2 --reps 5 --name sealed
node measurements.mjs --name sealed
# The first-three stage passed before Carve/Glaciate work (direct-gate.json).
# New work must stop at that stage if any target/size fails.
node identity-matrix.mjs --parallel 6
node compare.mjs --checks checks-random-final.json --browser browser-random-final.json
node existing-browser.mjs
node evidence.mjs
node acceptance.mjs
```

Stop on an identity error; preserve the ignored failure payload and fix the typed computation without tolerances. The seeded corpus covers continuous/endpoint Power/Size, options, uint32 seeds, Floors 1–22, Keep, rock/lava, water, paths and oriented/flipped objects. Existing source/unleash/oxbow/river/export contracts supplement random cases. Random corpus completion is **2,000 per force per size per target**, not 2,000 in aggregate. `identity-matrix.mjs` runs bounded, resumable shards of `check.mjs --server --exports --random` and `browser.mjs --exports --random`, then joins their hashes. Do not run it during timing measurements.

`--exports` also compares bytes from the actual product `.timber` writers, preserving original float tokens and opaque component insertion order. These randomized fixtures use fixed metadata, no thumbnail and zero soil layers. Full editor/project/finalizer exports are checked by the unchanged existing contracts and browser determinism suite. `existing-browser.mjs` builds the pinned product read-only with the diagnostic adapter injected in memory; only import paths and diagnostic hooks are added to copied tests. Use the matching test driver from `DGM_BROWSER_DEPS`; a newer product test driver sends Firefox viewport fields that this pinned browser does not support. Browser aliases select the browser entry points of Three.js and fflate; an investigation-only startup queue retains Comlink messages while the Wasm adapter loads. It runs all seven existing force/determinism browser suites on all three engines, including the normally opt-in informational timing test (`DGM_BENCH_FORCES=1`), with no skipped cases. Those one-off UI readings do not replace the repeated adoption measurements. This pinned Windows WebKit lacks window OffscreenCanvas: the investigation maps only Preview2D's scratch canvas to an ordinary HTML canvas (getContext/putImageData/drawImage). This is a test environment adapter, not a product edit or proof of native OffscreenCanvas support; mathematical/export workers use their original environment. The full native/Wasm contract run also captures every unique planning input and complete result; `suite-replay.mjs` verifies those inputs and the typed records in all three engines, including the historical Glaciate path. Assertions, step states, editor history and exports run in the unchanged suites.

Measurements use five repeats after five warm-ups, show median and worst, and record Windows PDH CPU mean/max; this PC is shared. Native compares against Node TypeScript. Compute includes the immutable before-map clone, planning, finalization, water and literal changes. Rust + boundary adds synchronization and numeric record packaging; browsers also configure the command and reacquire typed views. One-time import, reset, cold nested reconstruction and fixture I/O are excluded. `MEASUREMENTS.md` defines each column and `measurement-evidence.json` retains every sample. Rebuild/recheck after compiler, maths, reduction, planner or boundary changes.

## Adoption order

After every identity, existing-suite, cross-engine/export and performance gate passes, the separate milestone session adapts the product. In that session, tag the final TypeScript computation `ts-forces-final`, then delete adopted TypeScript computation in the Rust order (D381). This investigation does not authorize or perform that tag/deletion. Analysis/checks follow in Rust; Rift, Deposit and Carve Maturity start in Rust; generator follows M9b; operations/undo move only when measured boundaries justify it. No slower computation is adopted (D380).

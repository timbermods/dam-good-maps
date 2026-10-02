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

## Round 3: shared arithmetic and identity-only regeneration (Windows)

Run here. Everything generated stays ignored under `local/`; never commit bundles, Wasm/executables, maps, exports, IR, failure payloads or full result corpora. Compact evidence contains hashes, counts and repeated timing samples. Use an isolated run directory to avoid overwriting a running investigation's binaries.

Prerequisites: `../rust-water/local/toolchain/` from its pinned setup; existing product dependencies via `DGM_DEPS` (measured: `C:/Users/Kyler/code/DamGoodMaps-m9b`); matching Playwright and @playwright/test 1.58.2 drivers/Chromium 1208, Firefox 1509 and WebKit 2248 via `DGM_BROWSER_DEPS`. `node prepare-oracle.mjs` exports the pinned Git tree read-only to `local/oracle`; alternatively set `DGM_ROOT` to that exact checkout. Apply the water investigation's two upstream debugger settings with `python prepare-firefox.py SOURCE_FIREFOX_DIRECTORY local/firefox-optimized`; the script verifies unchanged executable bytes and records both archive hashes. Set `DGM_FIREFOX` to that copy's `firefox.exe`.

The portable-math study is pinned at bce327772f27b33e202c2d18b41100ca8dac13c1. Its rust-adoption.patch targets an older force source: this crate applies the same helper removal, shared sqrt/rem substitutions, x86-64-v2/-fma flags and strict guard to the current typed port. build.rs points to the one shared portable.rs; no force-private mathematical implementation is vendored. The default is ../portable-math/portable.rs after that study is present. DGM_PORTABLE_MATH can identify a read-only study checkout before adoption. Build/IR evidence pins that file and its adjacent rust-guard.mjs by SHA-256. The source is covered by the repository's AGPL-3.0-or-later license; no assets are added.

```powershell
. ./setup.ps1
$env:DGM_RUN_DIR = 'round3'
$env:CARGO_TARGET_DIR = Join-Path $PWD 'local/round3/target'
$env:CARGO_BUILD_JOBS = '1'
# Use the shared study file, read-only. After adoption the default sibling path works.
$env:DGM_PORTABLE_MATH = [IO.Path]::GetFullPath('../portable-math/local/checkout/investigation/portable-math/portable.rs')
$env:DGM_DEPS = 'C:/Users/Kyler/code/DamGoodMaps-m9b'
$env:DGM_BROWSER_DEPS = Join-Path $PWD 'local/browser-deps'
$env:DGM_FIREFOX = Join-Path $PWD 'local/firefox-optimized/firefox.exe'
cargo rustc --locked --release --lib -- --emit=llvm-ir,asm
cargo rustc --locked --release --target wasm32-unknown-unknown --lib -- --emit=llvm-ir,asm
cargo build --locked --release --bin forces-batch
node verify-ir.mjs
node build.mjs
# Explicitly authorized 1% shard; one worker, no force benchmarks.
node identity-matrix.mjs --pilot --parallel 1 --fresh
node compare.mjs --checks checks-random-final.json --browser browser-random-final.json --browser-count 5
node evidence.mjs
node acceptance.mjs # must remain red after a pilot
# STOP here until the user names a full-run window.
# Inside that window ONLY, replace the text with the user's actual named window:
node identity-matrix.mjs --window 'USER-NAMED WINDOW' --parallel 1
node compare.mjs --checks checks-random-final.json --browser browser-random-final.json --browser-count 500
node lifecycle-chain.mjs
node edge-check.mjs
node footprint-check.mjs
node verifier-check.mjs
$env:DGM_SUITE_NATIVE = '1'
$env:DGM_SUITE_CAPTURE = '1'
$env:DGM_TEST_REPORT = 'existing-final.json'
node existing-tests.mjs
node suite-replay.mjs
$env:DGM_IDENTITY_ONLY = '1' # omit opt-in informational planning benchmark
node existing-browser.mjs
node evidence.mjs
node acceptance.mjs
```

Native and Node-Wasm each require 2,000 distinct seeded random cases for each of footprint, Craterize, Erupt, Quake, Carve and Glaciate at 128², 256² and 512² (36,000 cases each). Each browser requires the first 500 cases per cell (9,000 each); the bindings join against the matching native/Node oracle subset, not all 2,000 cases. The full matrix is 99,000 target checks. The 1% pilot is 20 native/Node and 5 per browser per cell: 360 native, 360 Node-Wasm and 90 per browser. acceptance.mjs independently verifies exact distinct counts, contiguous case IDs, current arithmetic/executable/bundle hashes and the cross-engine join.

The pilot's machine projection is 100 times its sequential elapsed time, including cold fixture verification, serialization, exports and browser startup. It is not a force-planning benchmark. Windows PDH samples total CPU once per second; the reported peak includes other sessions and the user's activity. Full-matrix shards require an explicit --window label and default to one worker. A named label records the user's scheduling decision; it does not itself grant permission to start early. No full matrix, full suite, retained-map sweep or timing run starts while the window is pending.

Completeness gates are separate from statistical corpus coverage. Each force/size/target must contain accepted cases comparing the entire independent TypeScript result against Rust bytes and the typed result against those same bytes, including raw/final water and the full record schema (Quake finalWater/extras; Carve per-step changes/metrics/riders/oxbows/closure; Glaciate routing, joins/finished/retained records; all total/step timing fields). Product exports use the real writer and preserve native opaque-component order and JsonFloat tokens. Refusals require exact error records and unchanged retained map buffers. Full-corpus completion remains a separate adoption gate.

The strict assembly guard scans emitted instructions, excluding .asciz/.ascii/.byte/.ident/.file data directives: LLVM LTO embeds quoted bitcode whose arbitrary bytes produced a false instruction match. Complete IR and unstripped Wasm names/imports are still audited by the shared guard. No numerical guard or identity tolerance is relaxed.



Stop on an identity error; preserve the ignored failure payload and fix the typed computation without tolerances. The seeded corpus covers continuous/endpoint Power/Size, options, uint32 seeds, Floors 1–22, Keep, rock/lava, water, paths and oriented/flipped objects. Existing source/unleash/oxbow/river/export contracts supplement random cases. Random completion uses the exact target-specific counts above. `identity-matrix.mjs` runs bounded, resumable shards of `check.mjs --server --exports --random` and `browser.mjs --exports --random`, then joins their hashes. Do not start its full run outside the user-named window.

`--exports` also compares bytes from the actual product `.timber` writers, preserving original float tokens and opaque component insertion order. These randomized fixtures use fixed metadata, no thumbnail and zero soil layers. Full editor/project/finalizer exports are checked by the unchanged existing contracts and browser determinism suite. `existing-browser.mjs` builds the pinned product read-only with the diagnostic adapter injected in memory; only import paths and diagnostic hooks are added to copied tests. Use the matching test driver from `DGM_BROWSER_DEPS`; a newer product test driver sends Firefox viewport fields that this pinned browser does not support. Browser aliases select the browser entry points of Three.js and fflate; an investigation-only startup queue retains Comlink messages while the Wasm adapter loads. It runs all seven existing force/determinism browser suites on all three engines, with DGM_IDENTITY_ONLY=1 in round 3; the three normally opt-in informational planning-benchmark cases stay disabled. All identity/UI assertions remain active. Round 2 ran all 93 cases, including those opt-in readings, on the old arithmetic. Round 3 does not repeat performance measurements. Copied tests wait two animation frames after pointer moves so WebKit finishes deferred picking before the next key action; pointer positions, gestures and assertions are unchanged. This pinned Windows WebKit lacks window OffscreenCanvas: the investigation maps only Preview2D's scratch canvas to an ordinary HTML canvas (getContext/putImageData/drawImage). This is a test environment adapter, not a product edit or proof of native OffscreenCanvas support; mathematical/export workers use their original environment. The full native/Wasm contract run also captures every unique planning input and complete result; `suite-replay.mjs` verifies those inputs and the typed records in all three engines, including the historical Glaciate path; per-case checkpoints are reusable only for the exact corpus, script, Wasm/API bytes and browser version. Assertions, step states, editor history and exports run in the unchanged suites.

Measurements use five repeats after five warm-ups, show median and worst, and record Windows PDH CPU mean/max; this PC is shared. Native compares against Node TypeScript. Compute includes the immutable before-map clone, planning, finalization, water and literal changes. Rust + boundary adds synchronization and numeric record packaging; browsers also configure the command and reacquire typed views. One-time import, reset, cold nested reconstruction and fixture I/O are excluded. `MEASUREMENTS.md` defines each column and `measurement-evidence.json` retains every sample. Rebuild/recheck after compiler, maths, reduction, planner or boundary changes.

## Adoption order

After every identity, existing-suite, cross-engine/export and performance gate passes, the separate milestone session adapts the product. In that session, tag the final TypeScript computation `ts-forces-final`, then delete adopted TypeScript computation in the Rust order (D381). This investigation does not authorize or perform that tag/deletion. Analysis/checks follow in Rust; Rift, Deposit and Carve Maturity start in Rust; generator follows M9b; operations/undo move only when measured boundaries justify it. No slower computation is adopted (D380).

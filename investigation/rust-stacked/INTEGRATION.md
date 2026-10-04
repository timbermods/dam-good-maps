# Adopting D448 stacked Rust water

`adoption.patch` targets the Rust-water-switch tree at `6bc18ffc38d212861c9b0d22acb75edf82a66021`. It adds stacked computation to the same `rust/water` crate and leaves `sim.rs`, `settle.rs`, the existing ABI/protocol, Rust dependencies and the portable crate unchanged. No TypeScript stacked simulation, writer, renderer or editor wiring is included.

## Apply and rebuild

In the future adoption checkout after the Rust water switch is present:

```powershell
git apply --check investigation/rust-stacked/adoption.patch
git apply investigation/rust-stacked/adoption.patch
$env:PATH = "$env:USERPROFILE\.cargo\bin;" + $env:PATH
npm ci
npx tsx tools/rust/build.ts --native
```

The generated `src/core/sim/waterWasm.ts` is deliberately absent from the patch. Rebuild it with the existing guarded build command above, then include that generated module in the adoption commit. The investigation branch keeps its original product module. If the switch has advanced, resolve patch context against its current tree and repeat every correctness check before adoption.

The patch contains five new Rust modules (`columns`, `stack`, `stack_prefill`, `stack_engine`, `stack_memory`), their five additive declarations in `lib.rs`, a native fixture example, Rust/Node contracts, a small frozen fixture JSON and correctness adapters under `tools/rust`. Two cases join the existing D366 case registry. Its runner gains optional `--serial`, `--no-timing` and `--out-dir` flags; defaults stay as before. The existing Rust CI job gains the native contracts and all eight native/Node fixture comparisons. D366 already runs through the existing browser job, so no separate gate or measurement script is needed.

## Verify in order

Use Rust 1.90.0 with `wasm32-unknown-unknown`. Keep each command sequential, Cargo at four jobs and tests at at most four workers:

```powershell
Push-Location rust
cargo test -j 4 -p water --target-dir target/stack-tests -- --test-threads=4
cargo build --release -j 4 -p water --example stack-fixture
Pop-Location
$env:DGM_STACK_LOCAL = Join-Path (Get-Location) 'investigation/rust-stacked/local/identity'
npx tsx tools/rust/stack-identity.ts
npx tsx tools/rust/check.ts --jobs 4
npx vitest run --project quick --maxWorkers 4 tests/unit/water-speedups.test.ts tests/unit/waterGame.test.ts tests/unit/water.test.ts tests/unit/rustWater.test.ts tests/unit/stackedRust.test.ts
npx tsc --noEmit -p tsconfig.json
npx tsx tools/determinism/run.ts --smoke --only stacked-water --no-timing --serial --out-dir investigation/rust-stacked/local/determinism
git diff --check
```

Install the three browser engines using the existing project setup if absent. Where the local browser cache requires an isolated compatible runner, the existing `DGM_DET_PLAYWRIGHT` environment variable can name that runner's `playwright-core` package. The investigation used version 1.58.2 in `local/browser-runtime/`. D366 asserts the fixture hashes itself and compares Node against each browser.

The fixture inputs and expected hashes are committed in `tests/golden/stacked-water.json` when the patch is applied. Native binary outputs and summaries regenerate in the ignored folder above. The full flat oracle suite also needs the existing tracked `prototype/` Python sources and ordinary repository investigation dependencies; run it from the adoption checkout's root. One existing game-save test skips when that local save is absent.

To reproduce without adopting product files, extract the switch base into a directory beneath `investigation/rust-stacked/local/` and apply the patch with `git apply --directory=<that directory>`. Include `rust`, `src`, `tools`, `tests`, `prototype`, the tracked investigation dependencies, package/config files and the CI file. Run the same commands from that extracted root. All expanded results and dependency installations must remain beneath `local/` in this investigation clone.

## Typed-memory API

`stack_create(w, h, objectCount, retainedCount)` returns a nonzero opaque `u32` handle or zero on refusal. `stack_free(handle)` returns 0 on success, 1 on refusal. There are at most 64 live sessions. Maps have positive dimensions with at most 1,048,576 cells; at most 131,072 object rows and at most one retained row per cell in the allocation count. Masks may use only the lower 23 occupancy bits. These are interface limits, not editor map-size changes.

`stack_ptr(handle, field)` and `stack_len(handle, field)` expose Rust-owned aligned memory. Length is an element count, not bytes. Fill inputs, then call `stack_op(handle, operation, a, b)` once per operation. It returns 0 on success and 1 on refusal. Read UTF-8 from `stack_error_ptr()` / `stack_error_len()` immediately after a refusal; successful calls clear it. No operation accepts a caller pointer or serialized map. Native code can use `columns::model`, `stack_engine::Engine` or `stack_memory::Session` directly with the same validation.

| Field | Type | Meaning |
| ---: | --- | --- |
| 0 | u32 | Input occupancy masks, N cells |
| 1 | f64 | Input object rows, 8 values each |
| 2 | f64 | Input retained rows, 4 values each |
| 3 | u8 | Read-only water-gap count per tile |
| 4, 5 | i16 | Read-only water-gap floor and exclusive ceiling |
| 6, 7, 8 | f64 | Mutable depth, overflow and contamination |
| 9 | f64 | Previous depth; engine-owned history |
| 10 | f64 | Mutable outgoing momentum, four directions per flat cell or one value per stacked edge |
| 11 | u32 | Read-only stacked adjacency starts, M+1 entries |
| 12 | i32 | Read-only edge targets, -1 means sink |
| 13 | u8 | Read-only edge directions |
| 14 | i32 | Read-only reverse edge indexes |
| 15 | f64 | Mutable emitter parameters: strength, contamination, off, on |
| 16 | u8 | Saturation, updated by operation 6 |
| 17 | u8 | Read-only terrain-run count per tile |
| 18, 19 | i16 | Read-only terrain-run floor and exclusive top |
| 20 | u8 | Input drained-tile mask, N entries of 0/1; flat rules only |

N is width times height; M is allocated water slots. Water and terrain-run arrays are slot-major, index `slot * N + tile`; count says which slots are active. Terrain runs can include the reference's empty bottom run where the tile starts as air. They are distinct from water gaps. The open-water ceiling is 34. Fields 11-14 are empty on the flat path. Flat overflow is zero.

Object rows are `[kind, x, y, z, rotation, flipped, delayed, strength]`. Coordinates and enums are integers, strength is finite and nonnegative, boolean values are 0/1. Rotation 0/1/2/3 means clockwise 0/90/180/270 degrees. Footprints rotate around the reference origin; clean/bad seeps flip before rotating. Input order is preserved. Unknown kinds refuse; an adapter must deliberately classify inert objects rather than turn unknown names into kind 0.

| Kind | Reference object |
| ---: | --- |
| 0 | Explicitly classified inert object |
| 1 | Blockage |
| 2 | NaturalDam |
| 3, 4, 5 | NaturalOverhang2x1, 3x1, 4x1 |
| 6 | BadtideDrain |
| 7, 8 | WaterSource, BadwaterSource |
| 9, 10 | WaterSeep, BadwaterSeep |
| 11 | Aquifer |

Source strength caps follow the game rules and footprint area. Seeps use 0.8/0.72 stop/restart depth thresholds. Delayed sources, aquifers and drains start off as in #71. Retained rows are `[tile, floor, depth, contamination]`, with contamination in [0,1]; top-column mapping follows #71. Unsupported or malformed states refuse before indexing, including shortened native arrays and nonfinite values. Geometry views are copies never consumed as internal graph indexes.

| Operation | Arguments | Effect |
| ---: | --- | --- |
| 0 | a=0 game / 1 port, b=0 | Validate input and build representation |
| 1 | a=nonnegative integer ticks, b=source scale | Advance ordinary flow |
| 2 | a=b=0 | Prefill from emitters and retained water |
| 3 | a=maxDays, b=0 | Begin canonical settle; use 6 for flat, 4 for the #71 stacked default |
| 4 | a=nonnegative integer tick budget, b=0 | Advance canonical settle by at most that budget |
| 5 | a=b=0 | Validate and synchronize edited state/momentum/parameters |
| 6 | a=b=0 | Refresh saturation |

`stack_info(handle, query)` returns: 0 ticks; 1 representation (0 flat / 1 stacked); 2 status (0 unfinished / 1 settled / 2 exhausted); 3 steady ticks (-1 if absent); 4 current settle budget in ticks. Invalid queries return -1 and set the one-line refusal. Read status after advancing, stop when nonzero, and treat exhausted separately from settled.

Typed views can become detached after any call that grows Wasm memory. Reacquire views after building, prefill or other allocating operations, and before reading a result after a call. No view remains valid after freeing its handle. Geometry and history are read-only by contract; write supported mutable state then call operation 5, outside an active canonical settle. Run slices and queries stay at operation granularity, never one foreign call per tile. `tools/rust/stack-memory.ts` is a correctness adapter demonstrating this boundary; it contains no water maths.

## Foundations adoption responsibilities

Build supported occupancy masks and a stable water-object adapter from the later run-aware map representation. Feed retained water using its tile and floor, keep saturation attached to the corresponding water gap, and map returned depths/overflow/contamination back to runs. Use the existing worker for sliced settling and copy results only at its existing operation boundary. Do not adopt the reference TypeScript engine.

The flat branch delegates canonical settling, including today's unfed/drained rule, to the unchanged Rust implementation. A nonempty drained input on the stacked branch refuses because #71 has no stacked counterpart for that later flat rule. Define that additional policy with fixtures before passing drained tiles for stacked maps. Existing flat callers and their ABI need no change.

The existing `tools/rust/vite-plugin.mjs` and guarded build already cover every new `.rs` file (D444). Writer changes (`src/core/format/stacked.ts`), run-aware editing, validators, support geometry and rendering belong to foundations and are absent here.

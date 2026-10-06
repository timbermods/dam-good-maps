- Base: dev `38d4ee6b` includes multi-core water; product files remain unchanged.
- Water-only plain SIMD flags: native 2,480→2,566 ms; Chromium 2,839→2,871 ms; no standalone gain observed.
- Group four private neighbours/flows per tile and bound outflow slices: native 2,566→1,993 ms; Chromium 2,871→2,379 ms.
- Skip wet-list rebuild on unchanged row occupancy: native 1,993→1,214 ms; Chromium 2,379→2,172 ms; this single-thread case does not exercise strip sync.
- Observed control→final on the fixed 256² settle: native 2.04× (51.0% less time), Chromium 1.31× (23.5% less time).
- Each change: 98 canonical settles at 96/128/256/512, native and four strips; 57 pinned tests; 196 baseline determinism checkpoints; zero differing bytes.
- Strict IR/assembly/Wasm guards pass: no FMA, relaxed SIMD or changed reduction/source/stop order; final Rust and stacked-water checks pass.
- Adopt [adoption.patch](adoption.patch) using [INTEGRATION.md](INTEGRATION.md); [EVIDENCE-rust.json](EVIDENCE-rust.json) binds every reading and proof.

## One fixed case, one reading per stage

Lake Basin, seed 1, 256×256, generated and prefilled by unchanged dev. Rust 1.90.0, Node 24.13.0,
Chromium/installed Chrome 154.0.8037.95, Ryzen 7 9800X3D, Windows; the PC remained shared.
The previous stage's one reading is reused as the next change's before value. These are individual observations,
not medians, guaranteed gains or speed gates. No warmup settle or additional timing case was run.

| Cumulative stage | Native ms | Chromium ms | Full result SHA-256 |
| --- | ---: | ---: | --- |
| control | 2480.338 | 2839.100 | `e06e94837d18a74b…` |
| simd | 2565.702 | 2871.300 | `e06e94837d18a74b…` |
| layout | 1993.280 | 2378.800 | `e06e94837d18a74b…` |
| sync | 1214.416 | 2172.100 | `e06e94837d18a74b…` |

The timed operation is one full canonical settle from prefilled water, including protocol decoding, simulation
construction and result encoding. Generation/prefill, input file reads/copies, process launch and Wasm compilation
are outside the reading. Instances start cold; browser tiering and host activity can influence the numbers.
The output is 3,211,288 bytes, with 1408 ticks; settled=true,
steadyTicks=none. Its complete hash is
`e06e94837d18a74b99411258c9b2bdc7c4e5106c197abc4fcfbe85c07f36378f`; input hash is
`ed6d33e54389371ac7a6672a8b0ef37303f1795e7d26fcf4f113aca15eb72f6a`. Every native/Chromium reading matches that exact output.

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
Native flags remain `-fma,x86-64-v2`; only the water's embedded Wasm gets `+simd128,-relaxed-simd`.
The candidate TypeScript typecheck passes, and the adoption patch applies cleanly. No pins or versions are changed.

## Starting evidence and scope

[The earlier water investigation](REPORT-typescript.md) put 77–81% of TypeScript water time in flow substeps.
[Perf-audit's report at 9e366c6c](https://github.com/timbermods/dam-good-maps/blob/9e366c6c25136c25c21a029245923ceca01e551f/investigation/perf-audit/REPORT.md)
identifies resident arrays, strict SIMD and sparse-loop bounds/branches as candidates, while noting that water
already has most of its separate state arrays. [Rust-analysis's report](../rust-analysis/PROFILE_REPORT.md)
records benefits from early exits and validated buffer access in other kernels. Those guided this investigation;
no fresh CPU profile or sampling was taken. Timing only the fixed settle avoids claiming a generation or
whole-editor speedup; adoption uses the same water module for live settles, weather, generation and strips.

Everything committed stays in this folder. The patch is limited to `rust/water` and the water's build flags;
public arrays/ABI, product TypeScript and the forces remain as they were. Full binaries, jobs, output bytes and
manifests stay in ignored `local/` under D195. Regeneration commands and inputs are in INTEGRATION.md;
expect tens of minutes, dominated by correctness checks, with cargo/test workers capped at four and engines serial.
The authorized remote branch previously pointed at the closed TypeScript investigation, `ed6fc4fb`;
its reports are preserved here. The one branch push uses a lease on that exact old commit. No other branches,
merges, approvals, auto-merge, tags, releases or game probes are involved.

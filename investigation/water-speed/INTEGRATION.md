# Adopting the Rust per-core water investigation

Base: `dev` at `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`, which contains multi-core water (#281).
The checkout is `C:\Users\Kyler\Documents\ChatGPT\dam-good-maps-water-speed`; no other checkout was used.
All committed changes are under `investigation/water-speed/`. The earlier TypeScript work remains here;
its reports are preserved as [REPORT-typescript.md](REPORT-typescript.md) and
[INTEGRATION-typescript.md](INTEGRATION-typescript.md).

## Apply

From the adopting checkout, inspect and apply:

```powershell
git apply --check investigation/water-speed/adoption.patch
git apply investigation/water-speed/adoption.patch
npx tsx tools/rust/build.ts --native
```

The patch touches only `rust/water/src/sim.rs`, `rust/water/tests/water_speed.rs` and the water's flags in
`tools/rust/build.ts`. Regenerate and commit `src/core/sim/waterWasm.ts` during adoption. No generated Wasm is
included in this investigation's patch. The forces' build flags are unchanged.

The builder supplies `CARGO_ENCODED_RUSTFLAGS`, overriding Cargo config. Therefore the water-only
`+simd128,-relaxed-simd` flags belong in that builder, alongside its path remaps. Leaving the workspace's
`.cargo/config.toml` alone avoids enabling SIMD for the forces or changing native `-fma,x86-64-v2` flags.
Direct Cargo Wasm builds use scalar defaults unless passed the same SIMD flags. Keep Rust 1.90.0.
Plain SIMD supplies independent binary64 lanes; directional and map-wide reductions retain their scalar
order. No FMA, relaxed SIMD, fast-math, unchecked indexing or new external crate is introduced.

Private `nb` and `f` store `[N,W,S,E]` per tile. Their byte capacities are unchanged. Depth, contamination,
old depth, outflow momentum, params, the Wasm ABI and row-major public indexes retain their existing layout.
The grouped scratch array and bounded public-outflow slices let the compiler prove four direction accesses
from a single tile/range check. Source order, two substeps, sorting schedule, stopping rules and prefill stay intact.

`sync_rows` skips the active-list wet scan only after checking every incoming row and finding zero occupancy
changes. A positive depth changing magnitude cannot change wet-neighbour counts, active membership or
saturation. Any wet/dry transition follows the existing full update and list rebuild. The added regression
compares this bookkeeping with reconstruction from the same water, including signed zero and subsequent ticks.
The single-thread timing case does not exercise strip sync; its effect is a removed scan, not a measured strip gain.

## Regenerate in this clone

Use PowerShell, Node 24, Git, the pinned Rust toolchain with the Wasm target, and installed Chrome.
The fixed case is Lake Basin / seed 1 / 256x256, generated and prefilled by the unchanged base.
Dependencies, source snapshots, binaries, input/output bytes, build output and manifests remain in ignored `local/`.
A clean regeneration starts with an absent `local/` directory; do not delete another checkout or shared runtimes.

```powershell
New-Item -ItemType Directory -Force investigation/water-speed/local/runtime | Out-Null
git archive --format=zip --output=investigation/water-speed/local/base.zip 38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e
Expand-Archive -LiteralPath investigation/water-speed/local/base.zip -DestinationPath investigation/water-speed/local/control
Copy-Item -LiteralPath investigation/water-speed/local/control -Destination investigation/water-speed/local/candidate -Recurse
Copy-Item package.json,package-lock.json investigation/water-speed/local/runtime/
npm ci --prefix investigation/water-speed/local/runtime --no-audit --no-fund
node investigation/water-speed/rust-speed.mjs setup
node investigation/water-speed/rust-speed.mjs build control
node investigation/water-speed/rust-speed.mjs bench control
node investigation/water-speed/rust-speed.mjs control-determinism
node investigation/water-speed/prepare-candidate.mjs simd
node investigation/water-speed/rust-speed.mjs build simd
node investigation/water-speed/rust-speed.mjs bench simd
node investigation/water-speed/rust-speed.mjs identity simd
node investigation/water-speed/prepare-candidate.mjs layout
node investigation/water-speed/rust-speed.mjs build layout
node investigation/water-speed/rust-speed.mjs bench layout
node investigation/water-speed/rust-speed.mjs identity layout
node investigation/water-speed/prepare-candidate.mjs sync
Copy-Item investigation/water-speed/strip-sync.rs investigation/water-speed/local/candidate/rust/water/tests/water_speed.rs
node investigation/water-speed/rust-speed.mjs build sync
node investigation/water-speed/rust-speed.mjs bench sync
node investigation/water-speed/rust-speed.mjs identity sync
node investigation/water-speed/make-rust-patch.mjs
node investigation/water-speed/local/runtime/node_modules/typescript/bin/tsc --noEmit -p investigation/water-speed/local/candidate/tsconfig.json
node investigation/water-speed/evidence-rust.mjs
git diff --check
```

Expect tens of minutes on this shared PC, dominated by correctness checks and generation, rather than the
four single timing readings. Cargo uses `-j 4`, Vitest uses at most four workers and Rust tests four threads.
Determinism engines run sequentially, with four water threads including the coordinator. No CPU sampling,
quiet period, browser matrix, speed gate or game probe is part of this harness.

`bench` refuses to overwrite an existing reading. Each cumulative stage has one native and one Chromium
reading; the previous stage's reading is reused as the next change's before value. Native timing is inside
`canonical_job`, with input already read; Chromium compiles/instantiates and copies input before timing its
`water_canonical` call. Both include protocol decode/encode, simulation construction and canonical settling;
input generation, external copies, process launch and Wasm compilation are excluded. Instances start cold,
so browser tiering and shared-PC contention can affect these observations. No repeated statistics are claimed.
The same bytes are compared after timing. A hash of the input and full output binds every reading.

## Identity checks and limits

The harness runs the current `tools/rust/water-identity.ts` assertions at 96/128/256/512 with `--threads 4`
and `--require-native`. Its generated local copy adds a comparison to `control`'s unchanged water module,
so a shared mistake in the candidate app and candidate native settle cannot pass unnoticed. The first stage
also ran the original tool unchanged; later stages combine its assertions and the baseline comparison in one pass.
Golden fixtures cover both rule sets; generated maps cover every theme, retained lakes and drained water.
At 512 the existing tool uses one tiled generated theme. Its usual seeds 1-2 are retained (256/512 use seed 1).

Existing pinned water-speedup/binding tests exercise narrow and rectangular grids, dams, seeps, badwater,
drought, floor edits, old depth, outflows, saturation and every-tick bookkeeping. `cargo test -p water` and
`tools/rust/stack-identity.ts` cover the water crate's stacked path too. `tools/determinism/run.ts` runs only
`water/,weather/` with `--serial --no-timings --engines node,chromium,chromium-threads`: the selection includes
two stacked-water cases, weather at 128/256 and water at 96/512. Manifests are compared checkpoint by checkpoint
with unchanged dev as well as between candidate engines. Other browsers and full unrelated-force/generation
matrices were deliberately not run under this job's rules. This is measured corpus evidence plus unchanged
arithmetic/order, not exhaustive enumeration of all possible maps.

The build harness audits optimized IR, assembly and unstripped Wasm with `tools/rust/guard.mjs`, and retains
all artifacts locally. Keep those guards on any future compiler/target/flag change. Adoption should retain
normal CI identity checks; no re-pinning or generator-version bump is needed for an identity-preserving change.

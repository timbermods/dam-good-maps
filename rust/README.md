# The Rust ports

Dam Good Maps' Rust code (PLAN §20 D381, D401, D442). The interface and the rendering stay in TypeScript; the ports
compute the same bytes as the TypeScript they replace, natively (batch jobs) and as WebAssembly in every engine.

- `portable/`: the portable maths every port shares, the same bits as `src/core/math/portable.ts` (D401).
- `portable-check/`: one entry point over `portable/`, used only by the check below.
- `water/`: the water simulation (the game's rules and the port's, the faster settle's bookkeeping), its settle,
  fed water and the canonical settle after the pre-fill (#156, ported from `src/core/sim/water.ts` at
  `ts-water-final`). Its Wasm is committed in `src/core/sim/waterWasm.ts` and bound by `src/core/sim/rustWater.ts`;
  `WaterSim` runs it in every engine and in Node; the multi-core water (`src/core/sim/parallel.ts`) runs several
  instances of the same module, one per thread, each on a strip of the map (`water_strip`, `water_sync`, `water_seep`;
  `Sim::new_strip`, `Sim::sync_rows`). Each tile's four neighbours and flows sit together (`[u32; 4]`, `[f64; 4]`) and
  `sync_rows` skips the wet-list rebuild when no halo tile turned wet or dry (#288; no SIMD). `water-batch` is the native binary batch jobs run. The same crate
  holds the stacked-column water for terrain above terrain (D448; `columns`, `stack`, `stack_prefill`, `stack_engine`,
  `stack_memory`), ported from #71's reference, whose one-column path is today's water unchanged. It is computation
  only, not wired into the app yet (Foundations does that): `stack_*` exports take Rust-owned typed arrays, one call
  per operation (the interface is in `investigation/rust-stacked/INTEGRATION.md` on PR #255; the core's binding is
  `src/core/sim/stackWater.ts`). Its contracts are
  `cargo test -p water`; `tools/rust/stack-identity.ts` runs #71's game-verified fixtures and one sink case that is not
  game-verified yet (`tests/golden/stacked-water.json`; `tools/rust/stack-sink-fixture.ts`)
  natively (the `stack-fixture` example) and in Node's WebAssembly; D366's check has two stacked-water cases.
- `forces/`: the forces' planning, Carve, Craterize, Erupt, Quake and Glaciate (#158, D381; their TypeScript planners
  are tag `ts-forces-final`). Its Wasm is committed in `src/core/forces/rust/forcesWasm.ts` and bound by
  `src/core/forces/rust/bridge.ts` (one call plans a force); `forces-batch` is the native binary the identity check
  runs. The water a force plans with (a carve's oxbow lake, a glacier's floor) is `water/`'s simulation and settle
  (`Sim`, `SettleRun`), linked without `water/`'s Wasm exports (its default `exports` feature), so the forces get the
  water's speed work. It runs on one thread inside the plan; the multi-core strips stay the editor water's.
- `analysis/`: the six analysis kernels generation and the checks repeat most (#157, D391): `distanceFrom`,
  `walkDistance`, `landRegions`, `spillLevels`, `damSites` and `roomMap` (their TypeScript is tag
  `ts-analysis-final`). Its Wasm is committed in `src/core/analysis/rust/analysisWasm.ts` and bound by
  `src/core/analysis/rust/bridge.ts` (one call runs a kernel on a frame of binary64 values, written straight into
  the module's memory); each kernel's export keeps its TypeScript signature. The outcomes and M9b's descriptive
  rows keep a TypeScript `distanceFrom` (`distanceFromInTs`). `analysis-batch` is the native binary the
  identity check runs. With its `kernels` feature it also gives the kernels as Rust functions, and the two floods
  the checks share with `analysis/regions.ts` (`walk_regions`, `components`), for the other ports (its own Wasm,
  built without the feature, is unchanged).
- `checks/`: the map checks (#207, D465): the load, design, principle and playability checks, their report and
  what they measured, the same bytes as the TypeScript they replaced (tag `ts-checks-final`). Its Wasm is committed
  in `src/core/validate/checksWasm.ts` and bound by `src/core/validate/rust.ts`: one retained instance, the map in
  eight typed input buffers written straight into its memory (the voxels, the settled water and the water model,
  the map's own wet tiles, the thumbnail, and a metadata block with what the host reads from the file's JSON), one
  call per validation (`checks_run`), the report as JSON text and the analysis' layers typed. Its kernels are
  `analysis/`'s (`kernels` feature), linked without its Wasm exports; the data it shares with the TypeScript
  (footprints, the log floor, the calibrated targets, the difficulty rules, the emitters, the objects' names, the
  components the load needs) is generated into `src/tables.rs` by `tools/rust/checks-tables.ts`. An input it
  cannot read as the map it claims to be is refused with a one-line reason (D342), which `validateMap` throws: a
  string with a broken character, a position that is not a whole tile, a setting of the wrong kind, an object
  facing outside Cw0–Cw270 on a full validation, stored water that cannot be read when the approximate-water rule
  needs it, a ruin column whose height is not a number, a resource count that is not whole, a map object of an
  unknown kind or with no tiles. `checks-batch` is the native binary the identity check runs.

**Setup.** Rust 1.90.0 and the `wasm32-unknown-unknown` target, pinned by `rust-toolchain.toml`: install rustup for your
user from https://rustup.rs (on Windows without Visual Studio's C++ tools, pick the host `x86_64-pc-windows-gnu`), then
run `rustup toolchain install` in the repository. `npm run setup:machine` says whether it's ready.

**Build.** `npx tsx tools/rust/build.ts [--native]` rebuilds the committed Wasm, the water's, the forces', the analysis' and the
checks' (source paths written with forward slashes, so every OS builds the same bytes) and, with `--native`, the batch binaries
(Windows ones linked without a timestamp, `.cargo/config.toml`, so a build is reproducible);
`--check` fails when a committed Wasm differs from a fresh build. While `npm run dev` runs, saving any `.rs` file rebuilds it and the page reloads
(`tools/rust/vite-plugin.mjs`; D444); a failed build shows in the page's error overlay.

**Check.** `npx tsx tools/rust/check.ts [--engines]` runs what CI's `rust` job runs: the maths guard over every `.rs`
file, strict builds for wasm32 and the host with their IR, assembly and Wasm audited (no libm, no FMA, no transcendental
intrinsics; `tools/rust/guard.mjs`), then `portable/` against `portable.ts` bit for bit, natively, in Node's
WebAssembly and, with `--engines`, in Chromium, Firefox and WebKit, the Rust water's canonical settle the same
bytes natively, in Node's WebAssembly and in each engine, the forces' byte fixtures (`tools/rust/forces-jobs.ts`)
the same packed results on each, as pinned in `tools/rust/forces-pins.json`, the analysis' byte fixtures
(`tools/rust/analysis-jobs.ts`) the same results on each, as pinned in `tools/rust/analysis-pins.json`, and the
checks' byte fixtures (`tools/rust/checks-jobs.ts`) the same reports and analysis on each, as pinned in
`tools/rust/checks-pins.json`. A deliberate change to a force, a kernel or a check re-pins them
(`npx tsx tools/rust/forces-jobs.ts > tools/rust/forces-pins.json`, and the same for `analysis-jobs.ts` and
`checks-jobs.ts`) and says so in its PR. Cargo runs with `-j 4` (`--jobs N` changes it).

**Threads.** Each Wasm stays single-threaded, built with no extra target features: Rust 1.90 still marks wasm32's
`+atomics` unstable (a warning, and a shared-memory `std` needs nightly's `-Zbuild-std`), so threaded Rust stays parked
(D402, #168). Multi-core work runs several instances of a module in workers, sharing data through a `SharedArrayBuffer`
from JavaScript (the water's strips, `src/core/sim/parallel.ts`).

**Rules for a port.** Use `portable::` for anything beyond + − × ÷, comparisons, `floor`, `abs` and integer maths; never
`f64::sin` and the like, `mul_add`, or `%` on floats (use `portable::rem`). Native builds keep `rust/.cargo/config.toml`'s
flags (no FMA, x86-64-v2). Add each new crate to the workspace and to `CRATES` in `tools/rust/check.ts`, so its compiled
output is audited too. Changing the compiler, a target or a flag means re-running the check.

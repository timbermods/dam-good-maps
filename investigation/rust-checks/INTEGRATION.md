# The checks in Rust: integration

The port of `src/core/validate` (checks.ts, playability.ts, report.ts) under D381's Rust order: the same verdicts
and the same report, byte for byte, natively and in WebAssembly. **Result: every check's verdict, value, message,
`where` and fix, and the analysis the page reads, match the TypeScript exactly on the whole corpus, in Node-Wasm and
natively (RESULT.json).** No product file is changed; nothing is adopted yet.

**Base.** The oracle is `feature/m9b` at `fe3ed80f` with dev (`8b066342`) merged in: dev was already in M9b, so the
merge changed nothing and the base is M9b's tip. This branch, `investigation/rust-checks`, is from dev and touches
only this folder. (The prompt's `C:\Users\krams\…` is not on this PC; the clone is `C:\Users\Kyler\code\DamGoodMaps-rust-checks`.)

## What is here

- `src/`: the port. `checks.rs`, `playability.rs` and `report.rs` are the three files; `land.rs` (edge walls,
  dam walls), `water.rs` (drought storage, sources in a flow, storage near the start, the start's water shore),
  `mechanics.rs` (approximate water), `soil.rs` (the soil by the game's rules, `gameSoil`'s "game" mode with its
  water columns and float32 tick settle) and `misc.rs` (polygon mask, channel bed, `guidFrom`, `officialRange`,
  `tilesToRuns`, `asksForBadwater`) are the parts of other modules the checks call. `js.rs` writes numbers and
  strings as JavaScript does (`toString`, `toFixed(1)`, `toLocaleString("en-US")`, `JSON.stringify`); `json.rs`
  keeps each result's keys in the TypeScript's order.
- The analysis kernels the checks use (`distanceFrom`, `walkDistance`, `walkRegions`, `landRegions`, `components`,
  `spillLevels`, `damSites`) are `investigation/rust-analysis/analysis.rs` itself (#157), included unchanged by
  `build.rs` with thin wrappers: not ported again. The maths is `rust/portable`, used as it is (`round`, `max`, `min`).
- `src/tables.rs` is generated from the TypeScript (footprints, log floor, calibrated targets, difficulty rules,
  emitters): `npx tsx host/gen-tables.ts`, `--check` fails when stale.
- `host/encode.ts`: the adapter. It reads what the checks need from the file's JSON with the TypeScript's own format
  helpers (`placementOf`, `specifiedStrength`, `growthOf`, the singletons' sizes, the features' geometry) and writes
  the input buffers. `host/bridge.ts` binds the Wasm and turns its outputs into validateMap's `Validation`.
  `host/compare.ts` is the comparison.

**The interface** (`src/input.rs`, `src/lib.rs`), shaped as `rust-forces/INTEGRATION.md` asks: the map in typed
memory, one call per validation, no map codec. One retained instance holds eight input buffers the host writes
straight into its memory (`checks_input(kind, bytes)` returns where): the voxels (u8), the settled depth and
contamination and the water model's floor and dam (f64), the stored wet tiles (u8), the thumbnail, and one small
metadata block with what the host read from the JSON (per entity: id, template, placement, five component facts;
the singletons' sizes; the spec's settings; the lakes' outlines, the badwater basins' plans, the extras' tiles).
`checks_run()` validates; the outputs are the report (JSON text, as `JSON.stringify` writes it), the analysis'
moisture, soil contamination, reach and start distance (typed), and its other fields and the mechanics (JSON).
The water stays the caller's, as in validateMap: the given model and canonical settle, or the host's own.

**Refusals.** `checks_run` returns 1 (refused, with the reason) for inputs it does not reproduce, and the host runs
the TypeScript: an object turned outside Cw0–Cw270 on a full validation, the soil's "port" rules (tools only),
unknown difficulty, buildable land, start area or drought reserve, non-integer coordinates, a ruin column whose
height is not a number, a lone surrogate in a string, unreadable stored water, a flat extra without tiles. Most of
these make the TypeScript throw or write NaN into a message; none occurs in the corpus. Before the TypeScript is
deleted (D381), each needs a decision: reject at the boundary, or port the TypeScript's behaviour.

## Build and check

From the repository root, `rustup toolchain install` (Rust 1.90.0 and wasm32, pinned by `rust-toolchain.toml`).
Then, in this folder (`.cargo/config.toml` keeps rust/'s strict floating-point flags; outputs go to `local/`):

```powershell
cargo build --release -j 6                                          # native: local/target/release/rust-checks.exe
cargo build --release -j 6 --lib --target wasm32-unknown-unknown    # local/target/wasm32-unknown-unknown/release/rust_checks.wasm
cargo test --release --lib
cargo rustc --release --lib -- --emit=llvm-ir,asm                   # then tools/rust/guard.mjs ir / assembly on
cargo rustc --release --lib --target wasm32-unknown-unknown -- --emit=llvm-ir,asm   # local/target/**/deps/rust_checks*.ll, .s
node ../../tools/rust/guard.mjs wasm local/target/wasm32-unknown-unknown/release/rust_checks.wasm
```

The guard passes on every source file, both IRs, both assemblies and the Wasm (no libm, no FMA, no
transcendental intrinsics).

**The comparison.** The oracle is a worktree of the base in the ignored `local/oracle`
(`git worktree add local/oracle <base>`, then `npm ci --ignore-scripts` in it; `DGM_ORACLE` names another
checkout). The official maps are extracted read-only from the game into `local/official` with
`investigation/extract_builtin_maps.py`, its `OUT` set to that folder. Then
`local/oracle/node_modules/.bin/tsx host/compare.ts --workers 4`. Everything it
generates stays in `local/` (D195); it writes the summary to `RESULT.json` and the details to `local/result.json`.

## What the comparison covered

- **Maps:** the 22 official maps in the game's data; every theme (7) at 96² and 128², seeds 1–20 (280 maps); and
  the seven 256² maps CI's oracle checks (seeds 1, 5, 9, 10, 14, 18, 19, theme by its rule): 309 maps.
- **Cases**, each validated as the product validates it: a generated map in the generate profile (the generator's
  own call, on its build's settle), the editor's export profile (editing, its mine sites cut at open), load only,
  and as an imported file; an official map in the import profile at Normal and at Hard, the export profile and load
  only. For seeds 1–3 at 96² of every theme, eleven edits that reach rare branches: no start, two starts, an edge
  wall (and the editor's "Lower the wall" fix), Sources: None, No badwater, Easy, Hard, an unmigrated file, duplicate
  ids, a bad orientation.
- **Compared:** the whole report as `JSON.stringify` writes it (every check's id, class, severity, ok, value, limit,
  message, `where`, fix, approximate and applicable, and `passed`), after checking that JSON loses nothing of the
  TypeScript's values; the analysis' typed layers byte for byte; its other fields and the mechanics as text. The
  native binary's eight outputs are compared with the Wasm's byte for byte (SHA-256). A negative control flips one
  byte and is caught.
- **Result:** 309 maps, 1,467 cases, 65,155 checks: no difference in Node-Wasm, no difference natively, nothing
  refused (RESULT.json, with the oracle commit and the Wasm's and binary's SHA-256; the Wasm rebuilds to the same
  bytes, the Windows binary's hash changes with every link, its PE timestamp).

## What adoption moves, and what it replaces

- `src/` becomes the crate `rust/checks` in rust/'s workspace (and `CRATES` in `tools/rust/check.ts`, so CI's
  guard audits it). `build.rs`'s include of `analysis.rs` becomes a dependency on the adopted analysis crate.
- The Wasm is committed and bound as the water's is (`tools/rust/build.ts`, a `checksWasm.ts` beside
  `rustWater.ts`); `host/encode.ts` and `host/bridge.ts` become `src/core/validate/rust.ts`; `validateMap` calls it,
  installed once in the generator and check worker, as the analysis' INTEGRATION.md describes.
- `host/gen-tables.ts` and `host/compare.ts` move to `tools/rust/`, the comparison into CI on a small corpus.
- **The TypeScript it replaces:** checks.ts's checks and `validateMap`'s body (the options and `Validation` stay);
  playability.ts's `checkPlayability` and everything it calls; report.ts's `Collector` (`severityOf`, `blocks` and
  `groupOf` stay: the page uses them); mechanics.ts's `mechanicsOf`, `approximateReason`, `startRing`; storage.ts's
  `leveeStorage`. The other helpers the port carries (`edgeWalls`, `damWalls`, `sourcesInFlow`, `runningFlow`,
  `startWaterShore`, `reachAt`, `droughtStorage`, `gameSoil`, `polygonMask`, `channelTiles`, `guidFrom`,
  `officialRange`, `rulesFor`, `colonyReach`, `mineSitesCutAt`, `basinLeak`) also have callers in the generator,
  the editor or the build: they stay in TypeScript for those until their own ports, then share the Rust.

## What the port depends on that is not adopted yet

- **The analysis** (#157): the seven kernels come from its `analysis.rs`, unchanged. Adopting the checks before the
  analysis means adopting that file with them.
- **The Rust water:** the checks read the canonical settle, never compute it. Today that is the TypeScript's
  `canonicalSettle`; once the Rust water is re-ported to M9b's rules and switched on, the same buffers carry its
  depth and contamination (the arena could then share them instead of copying).
- **The soil:** ported here for the checks (the game's rules only). The build's own soil (sim/soil.ts) stays
  TypeScript; when it is ported, it should be this module.
- **M9b:** the oracle is M9b's tip before it reached dev. After M9b merges, rerun the comparison with `DGM_ORACLE`
  on dev; any later change to the checks or the modules above needs the port changed with it, and the comparison
  rerun.

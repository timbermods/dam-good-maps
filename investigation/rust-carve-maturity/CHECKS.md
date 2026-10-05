# Local adoption checks

Pinned input: dev `59483c63eb3e687944cbea585fb4f51c2019e7ca`; Rust 1.90, Windows GNU native target, Node v24.13.0. Chromium 154.0.8037.95 (installed Chrome), Firefox 155.0, WebKit 26.6. Product files are unchanged. All runs use this clone's ignored `local/workspace` export.

The final `node investigation/rust-carve-maturity/run.mjs --captures` passed. Commands inside the export:

| Command | Result |
| --- | --- |
| `DGM_CARGO_JOBS=8 node node_modules/tsx/dist/cli.mjs tools/rust/build.ts --native` | Both native binaries and embedded Wasm rebuilt; no generated binary committed. |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed. |
| `node node_modules/vitest/vitest.mjs run --project quick --maxWorkers 8 <relevant files>` | 25 files / 195 tests passed; all non-heavy `force*`, `carve*` and `carves*` contract/unit suites. |
| `node node_modules/tsx/dist/cli.mjs tools/rust/check.ts --engines --jobs 8` | Source guard, strict native/Wasm IR/assembly/Wasm guards passed. No native transcendental math, FMA or relaxed arithmetic. 47,063 portable vectors and 19 canonical water cases passed on all five targets. |
| Same `check.ts` force fixtures | **38** complete packed results compared byte for byte, native ↔ Node-Wasm ↔ Chromium ↔ Firefox ↔ WebKit, each as pinned. 30 original pins (including all six Carve pins) unchanged; eight new Maturity cases, including two genuine wet oxbows. |
| `PW_CHANNEL=chrome node node_modules/tsx/dist/cli.mjs tools/determinism/run.ts --smoke --only /maturity/ --serial --no-timings --out-dir <study>/local/determinism` | Four 64² cases at Power 0/100, click/drawn river; 20 map/water/object/literal-record/playback checkpoints per JS target. Zero errors or mismatches. No performance samples collected. |
| `git apply --check --whitespace=error-all investigation/rust-carve-maturity/adoption.patch` | Passed against the pinned dev base. Applying in a separate ignored plain export reconstructs all 16 tested changed source files exactly. |
| `node investigation/rust-carve-maturity/make-captures.mjs` | Four reviewed 1800×700 side-by-side JPEGs, two 900×620 map panels each. Every water preview completes under current game rules, with stored oxbow water supplied. |

The 13 new core contracts cover explicit Young/legacy equality, direct existing-river aging, integer sediment conservation, unchanged sources/no extra objects, narrow/Auto/wide Power-zero aging, new dry carves, bluffs, Floor/Keep, exact dyadic water/badwater budgets, typed/packed tape agreement, reverse-prefix playback, Auto, one-line refusals, actual wet oxbows, undo/redo, project reopen and identical exported bytes (also unchanged export on file reopen).

Fixes during development: inferred width avoids failed tiny or oversized existing-river bank budgets; Power zero has 12 gentle rounds; age increments and their cue direction stay forwards after reversed new-carve playback. A real document application rejected flood-fill-ordered lake tiles: native Rust now sorts all aligned retained rows, with a sorted/unique regression assertion and a genuine oxbow project/file roundtrip. Final byte identity runs have no errors and use no tolerances.

Meander supplies behaviour reference and original data/primitive renderer only. No TypeScript Meander planner is imported or run. Native contraction guards and shared `rust/portable` are unchanged. Rift/Deposit are absent from the source patch.

Full logs, engine manifests, raw maps, Timber fixtures, Wasm, executables, bundles and IR stay under ignored `local/`. Reproduce with `node investigation/rust-carve-maturity/run.mjs --captures`; it serializes the checks, caps Cargo/test workers at eight and runs no timings, corpus, matrix or window machinery. CI on the eventual product adoption runs the rest.

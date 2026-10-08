# tools

Command-line scripts for generating, checking, measuring and releasing. They run on Node with `npx tsx tools/<name>.ts` (some have an `npm run` alias in `package.json`). Read a script's opening comment for its options.

**Rules**
- Tools use the same core as the site (`src/core/`), so what they measure is what players get.
- Large results (bulk JSON, many files, over a few MB) stay out of git: write to `.scratch/` or `investigation/<name>/local/` (PLAN §20 D195).
- Timings and budgets are printed as information and never fail a build (D115, D145).
- Contact sheets use our own generated maps only (D144); commit one small sheet to `docs/sheets/<step>.png` at each step that changes generated maps.
- Nothing here launches Timberborn.

**Generate and check**
- `gen.ts` (`npm run gen`) makes maps from the command line; `try.ts` (`npm run try`) builds and serves the site locally.
- `first-visit-maps.ts` makes and checks the ready-made 128² maps a first visit opens (`public/first-visit/`, gitignored); the deploy runs it before each build and stops on a failed check (D343).
- `check-maps.ts` checks a folder of `.timber` files as a probe batch's maps are checked; `probe-tall.ts` and `probe-sizes.ts` make the probe's tall and size test maps by hand (the writers are in `probe-maps/`, built with the generator's own steps, `places/place.ts` `buildFileFromHeights`; the probe's runner calls them itself before a batch and rewrites any map whose bytes changed); `ingame-files.ts` makes the files for the in-game checks.
- `map-hashes.ts` hashes generated maps' land, water, objects, file and project (every theme and Any, seeds 1–6, 96² and 128² by default): run it on dev and on a branch and diff, to show a change left generated maps alone.
- `probe-3d.ts` writes the DGM Probe's six test maps for terrain above terrain, T1–T6 (their scenes and build are `terrain3d-maps.ts`), to `.scratch/terrain3d/`; `--out C:\dgm-probe\terrain3d --check` compares a fresh build with the files the game played.
- `import-hashes.ts` hashes a folder's maps through import, one sculpt stroke, the project file, reopening and export: run it on dev and on a branch and diff, to show a change left imported maps alone.
- `oracle.ts` (`npm run oracle`) checks generated maps with the Python implementation in `prototype/`.
- `determinism/run.ts` runs the same maps, brushes, forces, placements and water in Chromium, Firefox, WebKit and Node and compares them bit for bit (D366; `--smoke` is CI's short list); `determinism/compare.ts` compares runs from different machines.

**Batches and measures**
- `lib/` holds core measuring code that only tools and tests run, moved out of `src/core/` so the Rust port does not carry it (the coherence review's G3): `metrics.ts` `measure`, `resources.ts` `measureResources`, `startPlanting.ts`, `glaciate.ts` (`measureGlaciate`, `makePlan`), `placeData.ts` (the writer half of a real place's data).
- `batch.ts`, `batches.ts`: pass rates per theme and size. `settings-suite.ts`, `settings-batch.ts`: each setting's effect on its target.
- `official-baselines.ts`, `straight-reference.ts`, `edge-walls.ts`, `start-spread.ts`, `start-water-fed.ts`: measure the official maps, real channels and generated starts.

**Contact sheets and captures**
- `sheet.ts`, `contact-sheet.ts` with `contact-sheet.py`, `resources-sheet.ts`, `start-sheet.ts`, `waterfall-gallery.ts`: sheets of generated maps; `badwater-sheet.ts` with `badwater-sheet.py`: badwater before | after against another checkout, water shaded by how contaminated it is, and whether badwater reaches each map's main water (#265, D476).
- `capture-*.ts`: before and after captures for Kyler's look rounds, taken in a real browser.

**Data the game supplies**
- `log-floor.ts` (needs the installed game's blueprints), `export-footprints.ts`, `export-fixtures.py` (the water golden fixtures), `real-places.ts` (`npm run places`).

**Benchmarks and timings**
- `bench.ts`, `bench3d.ts`, `bench-preview.ts`, `bench-brush.ts` (`npm run bench:*`), `timings.ts`, `ci-timings.ts`.

**Release and machine**
- `release.sh` merges a tagged, green `dev` commit into `main` and watches the deploy (CLAUDE.md, "Deploying"); `build-spike.ts`, `spike-check.ts` build and check the delivery spike; `keep-awake.ps1` and `notify.ps1` are for the long sessions on this machine (`docs/HANDOFF.md`).
- `roadmap-canvas/` is a standalone planning page: what needs Kyler, what is in flight, the roadmap's steps as cards, the order of work, a map and the releases, read live from `dev`'s documents and GitHub (open its `index.html` from disk; its README says how). Not part of the site.
- `retired-terms.json` lists retired features. `tests/unit/retired-terms.test.ts` fails when one reappears in the living documents or the editor code.

**Tests**: the measures in `lib/` have contract tests (`tests/contract/resources.test.ts`, `startPlanting.test.ts`, `glaciate.test.ts`, `glaciatePowerSize.test.ts`; `settings.test.ts` runs `settings-suite.ts`); `tests/unit/` covers `retired-terms.json`, the maths guard (`portable.test.ts`), the smoothness gate (`smooth.test.ts`), CI's change filter (`ci-changes.test.ts`) and `log-floor.ts`. The other scripts have none of their own: the oracle and the batches are the checks they run. Run one with `npx vitest run tests/unit/retired-terms.test.ts`.

## Machine setup

`npm run setup:machine` (`tools/setup-machine.mjs`): on a fresh clone, creates the worktrees the plan uses, installs their
dependencies, writes the probe allow rules for this machine's paths into `.claude/settings.local.json`, checks the tools
the work needs and prints what's ready and what's missing. Safe to run again; `--dry-run`, `--all`, `--no-install`.
Among the tools it checks is Rust (rustup, the pinned 1.90.0 and the wasm32 target); it says how to install them for
the user and never installs anything system-wide.

## Rust and the maths guards

`npx tsx tools/rust/check.ts [--engines]`: the Rust maths guard (`tools/rust/guard.mjs`), strict builds of `rust/` with
their IR, assembly and Wasm audited, and `rust/portable` against `src/core/math/portable.ts` bit for bit (natively, in
Node's WebAssembly, and with `--engines` in Chromium, Firefox and WebKit). CI's `rust` job runs it; `rust/README.md`
has the rules for a port. `tools/portable-guard.ts` is the whole-source guard over the core, the workers and the data
tools (D401), run by `tests/unit/portable.test.ts`.

The Rust water: `npx tsx tools/rust/build.ts [--native] [--check]` rebuilds its committed Wasm
(`src/core/sim/waterWasm.ts`) and the native batch binary; `tools/rust/native-water.ts` runs a process's canonical
settles natively (`tools/batch.ts` by default, `--wasm` to opt out); `npx tsx tools/rust/water-identity.ts`
checks the native settle against the app's, three ways (in CI).

The Rust forces (D381): `tools/rust/build.ts` rebuilds their committed Wasm too (`src/core/forces/rust/forcesWasm.ts`)
and, with `--native`, `forces-batch`; `tools/rust/check.ts` runs their byte fixtures (`tools/rust/forces-jobs.ts`)
natively, in Node's WebAssembly and in each engine against the pins in `tools/rust/forces-pins.json`, taken when
the TypeScript forces (tag `ts-forces-final`) gave the same. A deliberate change to a force re-pins them:
`npx tsx tools/rust/forces-jobs.ts > tools/rust/forces-pins.json`.

The Rust analysis (D391): the same for its six kernels: the committed Wasm `src/core/analysis/rust/analysisWasm.ts`,
`analysis-batch`, and byte fixtures (`tools/rust/analysis-jobs.ts`) against `tools/rust/analysis-pins.json`, taken
when the TypeScript kernels (tag `ts-analysis-final`) gave the same. A deliberate change to a kernel re-pins them:
`npx tsx tools/rust/analysis-jobs.ts > tools/rust/analysis-pins.json`.

The Rust checks (D465): the same for the map checks: the committed Wasm `src/core/validate/checksWasm.ts`,
`checks-batch`, and byte fixtures (`tools/rust/checks-jobs.ts`, validations of the forces' studies) against
`tools/rust/checks-pins.json`, taken when the TypeScript checks (tag `ts-checks-final`) gave the same. A deliberate
change to a check re-pins them: `npx tsx tools/rust/checks-jobs.ts > tools/rust/checks-pins.json`. The data the
checks share with the TypeScript (footprints, calibrated targets, names…) is generated into
`rust/checks/src/tables.rs` by `npx tsx tools/rust/checks-tables.ts` (`tests/unit/checksTables.test.ts` fails when it
is stale).

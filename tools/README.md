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
- `mcp-build.ts` (`npm run mcp:build`) bundles the MCP server (`mcp/`, D141, D501) into one file and packs it as the Claude Desktop extension and the `npx` package in `mcp/dist/`; a release attaches both.
- `premise-plan.ts` prints a premise's plan for a seed (stage 0, docs/PREMISES.md) and writes its water-story diagram as SVG (`--png` a pixel a tile too); `--seeds 1-12` draws several, `--try t` one layout try as far as it got, `--plan file.json` checks and draws a plan file such as `tests/fixtures/four-lakes.plan.json`.
- `premise-water.ts` runs stage 1 (water by number, docs/PREMISES.md §2.2) on the first plan whose water holds: the water table, which `land` invariants hold, stage 1's time, and `<out>/<premise>-<size>-<seed>.water.png` (heights and water, lips, rows, the start); `--settle` settles it and prints each body's level against the table, `--seeds 1-12` checks several, `--plan file.json` a plan file.
- `premise-map.ts` makes a premise map outside the product (docs/PREMISES.md §7 step 3): stages 0 to 2, the start, the plan's sources and rows, one build and the checks in profile "generate"; writes `<out>/<premise>-<size>-<seed>.timber`, its project (`.damgoodmaps`, which the page opens) and a top-down `.png`, and prints the failing checks and the ground measures. `--seeds 1-3` makes several, `--plan file.json` a plan file. A seed's map is made as the page makes it, so its time is a player's wait (`rust/page-path.ts`: the water on the page's threads for this machine, the start's drought beside the map in `rust/drought-node.ts`); `--one-thread` makes it on one thread.
- `check-maps.ts` checks a folder of `.timber` files as a probe batch's maps are checked; `probe-tall.ts` and `probe-sizes.ts` make the probe's tall and size test maps by hand (the writers are in `probe-maps/`, built with the generator's own steps, `places/place.ts` `buildFileFromHeights`; the probe's runner calls them itself before a batch and rewrites any map whose bytes changed); `ingame-files.ts` makes the files for the in-game checks.
- `official-water-match.ts` settles each official map with caves (unedited) and compares it with the map's own saved water and soil (overlaps, ticks, soil match; `[dir] [--only name]`, local only): rerun it after any water change and compare with `docs/progress/3d-foundations.md`.
- `map-hashes.ts` hashes generated maps' land, water, objects, file and project (every theme and Any, seeds 1–6, 96² and 128² by default): run it on dev and on a branch and diff, to show a change left generated maps alone.
- `check-rows.ts` lists every check row of a folder's maps as the editor shows them on import: run it on dev and on a branch and diff, to show what a change to the checks does to real maps.
- `probe-3d.ts` writes the DGM Probe's Terrain 3D maps by hand (T3–T7; the same writer the runner calls, `probe-maps/terrain3d.ts`, on the scenes in `terrain3d-maps.ts`) into `C:\dgm-probe\terrain3d-2\`; `--check` writes nothing. `rust/stack-sink-fixture.ts` writes the sink case of the stacked engine's identity fixtures.
- `import-hashes.ts` hashes a folder's maps through import, one sculpt stroke, the project file, reopening and export: run it on dev and on a branch and diff, to show a change left imported maps alone.
- `ruled-land.ts` prints ruled land's three numbers and verdict (`terrain.ruled_land`, PLAN §11.2) for `.timber` files, a theme's seeds (`--theme canyon|all --seeds 1-12 --size 128`), the lake stair's or the Gate's (`--premise lakeStair|gate`).
- `premise-gate-map.ts` builds the Gate's maps (`--seeds 1-12 --size 128 --out <dir>`; docs/PREMISES.md §5.1): each seed's start numbers, whether it held and what was refused on the way, the share of the valley's ground within 3 tiles of water (and of its floor), the share of its water in straight even reaches, and a picture with those reaches in orange.
- `oracle.ts` (`npm run oracle`) checks generated maps with the Python implementation in `prototype/`.
- `determinism/run.ts` runs the same maps, brushes, forces, placements and water in Chromium, Firefox, WebKit and Node and compares them bit for bit (D366; `--smoke` is CI's short list); `determinism/compare.ts` compares runs from different machines.

**Showcase maps** (`tools/showcase/`: a map as a script of operations, made only through the core's `MapSession`, D342; local only, nothing here runs in CI or in a test)
- `four-lakes.ts` builds Four Lakes from blank ground, about nine minutes with every flag: `--checks` settles and checks it, `--weather` runs a drought and a badtide, `--save` writes `<round>.timber`, `<round>.damgoodmaps.json`, the sheet's shots file and a picture of the land to `--out`; `--firstbad`, `--irrigate` and `--bypass` print the start's first badtide, the irrigation ladder and the old channel's badtide. Run it as `node tools/showcase/run.mjs four-lakes --round r14 --checks --weather --save --out <dir>` (`run.mjs` bundles `core.ts` once; `--core` rebuilds that) or as `npx tsx tools/showcase/four-lakes.ts …`.
- `four-lakes-design.ts` is the land by number (lakes, falls, channels, start); `four-lakes-view.ts` draws it as a picture, `four-lakes-probe.ts` prints its measures and `four-lakes-look.ts` a window of its levels as text; each runs in a second with `npx tsx`, with no core. `core.ts` is the one place the scripts take what they use from the core.
- `the-gate.ts` builds The Gate, the second premise map (docs/PREMISES.md §5.1), the same way, under a minute: its design by number is in the file; `--checks`, `--weather`, `--save` as above, `--irrigate` prints the ladder of works by the Irrigation view's reach, `--design` draws the land alone, `--window x0,y0,x1,y1` prints a window of the settled water (`--beds` the ground), and the build writes `<round>-reach.png`, the walk from the start.
- `swallow-hole.ts` builds The Swallow Hole, the third premise map (a river into a cave under a hill, a tunnel and a spring far below), the same way, in seconds: the tunnel is dug with the Block tool slice by slice, so its water is the stacked engine's; it prints the river, every tunnel column, the spring and the plain's flooded tiles; `--save` writes `<round>.timber` and the project, `--dam` builds the dam before the sink on the same session and saves `<round>-dam`, and `--game <snapshot.json.gz>` (`--game-dam` for the dam's map) reads the game's own water from a probe run's whole-map record beside ours.
- `capture.ts` takes the pictures of a saved map in DGM's own 3D view (real Chrome on the GPU, headed): `npx tsx tools/showcase/capture.ts --project <file> --shots <shots.json> --out <dir> --name <round>`, one JPEG a shot and a contact sheet; it builds the site into `.scratch/showcase-site` first when that build is not of this checkout (the build is stamped with HEAD and a hash of the changed sources).

**Batches and measures**
- `lib/` holds core measuring code that only tools and tests run, moved out of `src/core/` so the Rust port does not carry it (the coherence review's G3): `metrics.ts` `measure`, `resources.ts` `measureResources`, `startPlanting.ts`, `glaciate.ts` (`measureGlaciate`, `makePlan`), `placeData.ts` (the writer half of a real place's data).
- `batch.ts`, `batches.ts`: pass rates per theme and size. `settings-suite.ts`, `settings-batch.ts`: each setting's effect on its target.
- `official-baselines.ts`, `straight-reference.ts`, `edge-walls.ts`, `start-spread.ts`, `start-water-fed.ts`: measure the official maps, real channels and generated starts.
- `forms-read.ts`: whether generated maps' 3D forms read as what they are (D503): each kept arch's sightlines through it at the game's camera angles, each overhang's roof depth, the forms per theme and each map's generate time (`--themes`, `--seeds 1-4`, `--size`, `--vt`).

**Contact sheets and captures**
- `sheet.ts`, `contact-sheet.ts` with `contact-sheet.py`, `resources-sheet.ts`, `start-sheet.ts`, `waterfall-gallery.ts`: sheets of generated maps; `badwater-sheet.ts` with `badwater-sheet.py`: badwater before | after against another checkout, water shaded by how contaminated it is, and whether badwater reaches each map's main water (#265, D476).
- `capture-*.ts`: before and after captures for Kyler's look rounds, taken in a real browser.
- `game-crowns.py` with `crown-models.ts`: the plant crowns, ours and the game's, drawn offline as the game's
  VegetationURP shades them (vertex colours, alpha cut, bump, the yield's detail, self-shadowing) on lit grass from the
  game's camera; each crown's middle, side across the sun, birch bark, area and drawn width compared through sixteen
  turns. `crown-models.ts` writes our Standard and High triangles for it. Needs the installed game's models; prints numbers.
- `object-shadows.ts` with `object-shadow-check.py`: the shadows objects cast in both looks, measured on a flat meadow from above (each object's area, darkness, reach and width) and set beside the game's probe frames (each plant species' darkening of the ground round it, the game's against ours); `--sheet` makes `docs/sheets/object-shadows.jpg` (docs/progress/3d-view.md, "Objects' shadows").

**Data the game supplies**
- `log-floor.ts` (needs the installed game's blueprints), `export-footprints.ts`, `export-fixtures.py` (the water golden fixtures), `real-places.ts` (`npm run places`).

**Benchmarks and timings**
- `bench.ts`, `bench3d.ts`, `bench-preview.ts`, `bench-brush.ts` (`npm run bench:*`), `timings.ts`, `ci-timings.ts`.

**Merging**
- `mergedecisions.py` (Python 3; `python tools/mergedecisions.py`) resolves a `git merge origin/dev` whose conflicts are only in `docs/decisions/*.md`, decision by decision, and `--check <merge commit>` verifies such a merge (docs/RULES.md, "Merging"). Tested by `tests/unit/mergedecisions.test.ts`.

**Release and machine**
- `release.sh` merges a tagged, green `dev` commit into `main` and watches the deploy (docs/RULES.md, "Deploying"); `build-spike.ts`, `spike-check.ts` build and check the delivery spike; `keep-awake.ps1` and `notify.ps1` are for the long sessions on this machine (`docs/HANDOFF.md`).
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

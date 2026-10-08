# 3D, step 1: Foundations (progress)

Terrain above terrain's first step (D481, D280 (1); the spec is ROADMAP.md, "Terrain above terrain" → "1. Foundations"),
on `feature/3d-foundations` (worktree `C:\Users\Kyler\code\DamGoodMaps-3d-foundations`), one draft PR into `dev`. The
reference TypeScript is #71 (`origin/feature/terrain3d-a`, never adopted, D448); its progress file
(`docs/progress/terrain3d-a.md` on that branch) holds the game's verdicts and the design findings for the wiring.

## Now (2026-10-08)

Stages 1, 2, 4 and 5 are on dev (#354, #355, #356, #357), with stage 6's first part (the sink rule) and the probe's
group. **Stage 6 is built** (below) and waits on Kyler's eye: an imported map with caves or overhangs has its water
simulated on every column once it is edited. Stage 3 waits on his word for its rows' wording; stage 7 closes. The
probe batch (below) now holds seven maps and waits for the game's smoke run on 1.1.2.7 and Kyler's yes.

## What dev already has (surveyed 2026-10-07 at 498eb620, against INVENTORY.md)

INVENTORY.md is from 2026-09-25; since then M9a, M9b and the Rust ports moved a good part of it.

- **Terrain's form:** `src/core/terrain/runs.ts` (`ColumnTerrain`, a mask per tile; format 3's `TerrainData`).
  Format 3 stores the base and the field as heights plus runs; formats 1 and 2 convert on read (`doc/document.ts`
  `fromV1`, `fromV2`). So delivers (1)'s format part is done.
- **Soil per run top:** `sim/soil3d.ts` on `sim/columns.ts`, the game's rules; the build already uses it on one run
  per tile (`sim/soil.ts` `gameSoil`). On a cave import the soil shown is still the file's (`session.storedSoil`).
- **The engine:** `rust/water`'s `stack*.rs` and `columns.rs`, in the committed Wasm (`stack_create`, `stack_op`, …),
  reached, when this was surveyed, only by a tool and the fixtures (`tests/golden/stacked-water.json`); stage 4
  gave the core its binding.
- **The checks are Rust** (`rust/checks`, bound by `src/core/validate/rust.ts`; no TypeScript validator is left). They
  take the file's voxels. `terrain.supported` exists (`unsupported_voxels`) but runs only when some tile has two
  floors (`checks.rs`, `multi == 0.0`): INVENTORY's bug 1 stands. Slopes and the start read the top surface
  (`check_slopes`, `check_start`): bug 2 stands. Playability walks the top surface. The Python validator
  (`prototype/validate.py`) already runs its support check on every map.
- **Still heightfield:** the water everywhere (`WaterSim` on `WaterModel.floor`; `sim/model.ts` `waterModel(surface)`;
  created in `sim/prefill.ts`, `preview.ts`, `fed.ts`, `weather.ts`, `worker/session.ts` (two places), the forces and
  the generator); the writer (`format/world.ts` `settledSimulationSingletons`, one slot); imports' roofed water kept
  from the file (D100: `mixedSimulationSingletons`, `session.roofedTiles`, the worker's `waterOf` and `soilOf`, the
  "Under roofs" layer in the page) and the cave cause of approximate water (D98: `rust/checks` `mechanics.rs`
  `cave_share`).
- **Not on dev from #71:** the multi-slot writer (`format/stacked.ts`), the T1–T6 map writers
  (`tools/terrain3d-maps.ts`, `tools/probe-3d.ts`), the plant-clearance rule. The played T files are in
  `C:\dgm-probe\terrain3d\`.

## Stages

Each leaves dev's behaviour intact unless it says otherwise, and merges on its own. The check every stage repeats:
`npx tsx tools/map-hashes.ts` on dev and on the branch (84 maps: seeds 1–6 of the six themes and Any at 96² and
128²), diffed.

1. **The terrain's own representation. Built.** See below.
2. **The support rule and the floor-aware checks, fixed** (delivers 4, the part that adds no check row; ROADMAP's
   "the support check and the floor-aware slope and start checks are fixed and tested"). `rust/checks/src/checks.rs`:
   `terrain.supported` runs on any map with a tile that is not plain (bug 1); `check_slopes` and `check_start` read
   the floor the object stands on, not the top surface (bug 2); `src/core/validate/checksWasm.ts` rebuilt. Checked
   by: `tools/rust/checks-pins.json` unchanged (`checks-jobs.ts` builds its maps from heights, so no report may move), small
   contract tests on hand-made cave maps (an arch cut to z = 0 that the game would drop; a slope and a start under a
   roof), `cargo test -p checks`, `tools/rust/check.ts`. Needs nothing outside the allowed files, no probe.
3. **The new check rows and the floor graph** (the rest of delivers 4): `walk.levels`, `terrain.dropped`,
   `water.sealed_source`, plant clearance and first-run placement, the floor graph in the playability walk (D122),
   `start.dry`'s floor rule under roofs, `terrain.single_floor` retired for generated maps; the build's rule pass
   (D121: a call that drops nothing on plain terrain). `rust/checks` (`playability.rs`, `checks.rs`, `words.rs`), the
   kernels in `rust/analysis` if the walk needs a floor-graph variant, `prototype/validate.py` and `playability.py`
   for the floor graph, `features/build.ts` for the rule pass. Checked by: the pins re-pinned for the new rows only
   (every existing row's bytes the same), contract tests, the 84 maps. **Needs Kyler:** the new rows appear in the
   page's check list, so their wording is his (`needs-kyler`); the code can be built behind his answer.
   Proposed wording (a row is its one line; passing first, then failing, in the existing rows' style):
   - `walk.levels` (information, never fails): "Every level can be walked to from the start" · "3 areas need stairs
     to reach, the highest at level 14".
   - `terrain.dropped` (generated maps only): "No ground had to be removed" · "12 blocks of ground removed: nothing
     held them up".
   - `water.sealed_source` (a warning): "No water source is sealed in" · "Water source sealed inside rock · X 23 ·
     Y 45 · Z 5".
   - `plants.clearance`: "Every plant has room above it" · "5 plants have no room under the rock above them; the
     game removes them".
4. **The multi-slot writer and the T maps** (delivers 2's writer, 6). `src/core/format/world.ts` gains the stacked
   singletons (#71's `format/stacked.ts`: one slot's bytes exactly today's on a heightfield); a `src/core/sim`
   binding to the Rust engine; `tools/terrain3d-maps.ts` ported onto them. **Built**, see below.
   Checked by: the writer's bytes equal `settledSimulationSingletons`' on generated maps; the six T files rewritten
   byte for byte as the ones played in `terrain3d-20260927` and `-20260929` (then no new batch is needed; if a file
   differs, that map needs the batch again, see below).
5. **The engine wired in, one-column path only** (delivers 2). `WaterModel` carries the terrain's columns
   (`sim/model.ts` from a `ColumnTerrain`), `BuildResult` carries its terrain, and the canonical settle, the preview,
   fed water and the weather go through the Rust `Engine`, which hands an open field to today's `Sim`
   (`stack_engine.rs` `open_field`). Files: `sim/model.ts`, `prefill.ts`, `preview.ts`, `fed.ts`, `weather.ts`,
   `rustWater.ts`, `features/build.ts`, `doc/session.ts`, `worker/session.ts`, `validate/rust.ts`. Checked by: the 84
   maps identical, water included (ROADMAP allows the last digits to move; the fast path should not need it); the
   project, reopening and replay tests untouched; D366's check. Touches no forbidden file if the generator and the
   forces keep calling `WaterSim` directly, which they can (heightfields). `src/core/gen/pack.ts`'s
   `voxelsFromHeights` can stay.
6. **Imports with caves on the engine** (delivers 3, 5). **Built**, see below. Roofed water simulated; D100's exception
   (`mixedSimulationSingletons`, `roofedTiles`) and D98's cave cause retire; soil per run top on cave imports; the
   settle in slices with progress (`stack_prefill.rs` `SettleRun`). **A player sees this** (an edited Hollows or
   Canyon shows simulated water under its roofs, the opening notice and the "Under roofs" layer go): `needs-kyler`,
   and lines for the page session (`src/editor/panels.tsx`, `src/editor/render/viewControls.tsx`, `src/ui/View3D.tsx`)
   and the renderer session (the worker's water and soil views feed `src/render3d/model.ts`), posted on #236 when the
   stage starts. Checked by: imports' tests (an unedited import still byte for byte), the information measures on
   the official cave maps (settle against stored water, moisture on 18 of 19), and the probe batch below.
7. **Closing:** the Python validator's note (water under roofs as information, pointing at D279; no Python engine);
   PLAN, EDITOR_PLAN and ROADMAP made true; the acceptance list run once; the contact sheet only if a generated map
   changed (none should).

**Probe batch (stage 6, and stage 4 only if a T file's bytes differ):** three or four maps, about 15 minutes: an
edited Hollows and an edited Canyon exported with simulated roofed water (loads with no issue, every voxel kept,
water after 1 day against the engine's within the fixtures' tolerance, soil per run), plus any T file whose bytes
changed. The milestone session asks Kyler (D117).

## Stage 1: the terrain's own representation (built 2026-10-07)

- **The form:** `ColumnTerrain` (`src/core/terrain/runs.ts`) is the terrain in memory: a `Uint32` mask per tile, bit
  z set when voxel z is solid. `heights()`, `runs(i)`, `runCount(i)`, `notPlain()`, `column(i)`, `voxels()` and
  `toData()` are derived from the mask; `fromHeights`, `fromVoxels` and `fromData` make one.
- **What moved onto it:** a stored base (`doc/base.ts`: `splitTerrain` reads a file's voxels into it, `baseFromFile`
  stores `toData()`, `baseTerrain` decodes it, `fileFromBase` writes `voxels()`); the build's base layer
  (`BaseLayer.terrain`; its cave tests are `isPlain`); the session (`terrain`: the build's surface with the base's
  other tiles kept, `withSurface`, which export writes and the Unstable Core's blast reads; `plainAt` for placing
  and painting; the stored soil's top slot from `runCount`).
- **What did not, and why:** the build's own steps, the brushes and the forces still shape the surface (`heights`)
  and a tile that is not plain is kept exactly: moving them waits for step 3 (D280). `BuildResult` has no terrain
  field yet (stage 5 adds it with the water model that needs it). `BaseTerrain.columns` and `session.columns` stay as
  the derived voxel form the 3D view's mesher takes (the renderer session's contract until step 2).
  `BaseLayer.columns` stays declared, unread, because `tests/contract/editsPlaceNothing.test.ts` (the generator
  queue's file this week) passes an empty one: remove it and the four test literals when that file is free.
  `KeptContent.heights` is old projects' only. `src/core/gen/pack.ts` still writes `voxelsFromHeights` (same bytes;
  not this run's file).
- **One behaviour to know:** a stored run that names a plain tile, or a height that disagrees with its tile's runs,
  can only come from a damaged project file; the mask now decides both (before, the stored heights and the stored
  column could disagree in memory). No file the app wrote has either.
- **Checked:** see #354.

## Stage 2: the support check on every map, floor-aware slope and start checks (built 2026-10-07)

In `rust/checks/src/checks.rs`, with `src/core/validate/checksWasm.ts` rebuilt; `tools/rust/checks-pins.json` unchanged.
- **`terrain.supported`** runs on every map with a tile that is not one plain run from the bottom (`all_plain`),
  where it ran only when some tile had two floors. The rule itself (`unsupported_voxels`) is unchanged.
- **`slopes.connect`, `start.flat`, `start.entrance`** read the floor at the object's own level (`floor_at`: air
  there, solid just below, or the map's bottom), where they compared with the tile's top surface. So a slope or a
  start under a roof or on a ledge is judged on the ground it stands on. On a heightfield the two are the same test.
- **Real maps** (`tools/check-rows.ts` on the 22 official maps, the 9 workshop maps and the one user map in
  `investigation/raw`, before and after): no check newly fails anywhere, and `terrain.supported` changes on none.
  `slopes.connect` now passes on Cliffside, Beavers Rift and Beavertopia and reports fewer slopes on Hollows (2 → 1),
  Beavers Endgame, Lost Underground, Lost Valley and Tower of Beaverlon; `start.flat` and `start.entrance` now pass
  on Beavers Rift and Lost Underground (starts under roofs). Hollows' remaining slope (165, 45, 8) stands on open
  ground with its foot a level above its low side, reported as before; the other maps' remaining slopes were not
  looked at one by one.
- **Not done here:** the Python validator's slope and start checks (`prototype/validate.py`) still read the top
  surface; they run on generated maps only, where it is the same test. Stage 3 mirrors the floor graph there.
- **Checked:** see the PR.

## Stage 4: the multi-slot writer, the engine's core binding, the T1–T6 writers (built 2026-10-07)

On its own branch, `feature/3d-foundations-4`, so it merges apart from stage 2.
- **The writer:** `format/world.ts` `stackedSimulationSingletons` (water, pressure, evaporation per water column
  slot; moisture and contamination per run). A one-slot map is `settledSimulationSingletons` without its outflows,
  byte for byte. Stacked outflows are written "0" (as the played T files were); stage 5 decides whether to write
  them.
- **The binding:** `sim/stackWater.ts` (`StackWater`, `STACK_FIELD`, `STACK_OP`, `STACK_INFO`, `stackObjectRows`,
  `canonicalStackSettle` with a slice and a progress callback). It uses the water module's one instance
  (`rustWater()`). `tools/rust/stack-memory.ts` is gone; the fixtures (`tools/rust/stack-fixtures.ts`, so
  `stack-identity.ts` and the determinism check's stacked cases) and `tests/unit/stackedRust.test.ts` use it.
- **The support rule as a core function:** `terrain/support.ts` `unsupportedVoxels`, moved out of the Unstable
  Core's blast (`sim/explosion.ts`, unchanged in what it computes) and given the stackable objects' tops, because
  T1's writer must say which voxels the game deletes. Stage 3's rule pass can call it.
- **The T maps:** `tools/terrain3d-maps.ts` and `tools/probe-3d.ts`, on the Rust engine, dev's `soil3d` and the
  writer above. Their scenes and their settled water are the fixtures' (`tests/contract/stackedWater.test.ts`).
- **Against the files the game played** (`C:\dgm-probe\terrain3d\`): T1 and T2 are the same bytes. T3, T4, T5 and
  T6 differ in one place only, `WaterMapNew.WaterColumns`: dev writes water with nine significant digits of the
  value as a Single (#310 F3, after September), and the played files have seven. Everything else in them (terrain,
  objects, soil, evaporation, thumbnail, metadata) is the same bytes, and with seven-digit tokens all six files come
  out byte for byte as played (checked by a temporary change, not kept). The largest change to a depth is 6e-7.
  The files as dev writes them now have not been played: whether that needs the Terrain 3D batch again is the
  milestone session's to ask (D117).
- **Stage 5 needs first:** `BuildResult` and `WaterModel` carrying the terrain's columns, then `prefill.ts`'s
  canonical settle through `canonicalStackSettle`'s operations. No forbidden file if the generator and the forces
  keep calling `WaterSim`.

## Stage 5: the engine behind the canonical settle (built 2026-10-07)

On `feature/3d-foundations-5`. Nothing a player sees changes, and no map the app builds takes the new path yet.
- **The switch** is in `sim/prefill.ts` `canonicalRun` (and so `canonicalSettle`): a model with `stacked`
  (`sim/water.ts` `WaterModel.stacked`: the terrain's masks and the objects' rows) settles in the stacked engine
  (`stackedRun` → `sim/stackWater.ts` `canonicalStackRun`); a model without it runs the lines that were there, the
  same code path as before. `stackedModel(model, terrain, objects)` adds `stacked` only when some tile is not one
  plain run from the bottom, and returns the very same model on a heightfield. So the terrain decides, not the
  objects: a heightfield with a badtide drain or a natural overhang keeps today's water.
- **Nobody passes `stacked` yet.** The build still makes an import's model from its surface (`waterModel`), so a
  map with caves behaves exactly as today (D100's and D98's exceptions in force). Stage 6 turns it on with one
  call in `features/build.ts` (`stackedModel(model, base.terrain.withSurface(heights), objects)`).
- **Progress** needs nothing new: the stacked run has `canonicalRun`'s shape (`advance(ticks)`, `ticks`,
  `maxTicks`), which the worker already slices and reports (`src/worker/session.ts`, `onProgress({ stage: "water",
  done: run.ticks / run.maxTicks })`). The result is a `CanonicalWater` whose per-tile fields are the map from
  above (each tile's top column) and whose `stack` holds every column.
- **`BuildResult` does not carry the terrain.** A project stores the whole build result (`doc/stored.ts`), so a new
  field would change every saved project's bytes. The terrain stays derived (`session.terrain`); the model's
  `stacked` appears only on maps with caves, so heightfield projects keep their bytes.
- **Sinks** (a water object with a strength below 0, which the editor's object settings and the game allow, D337):
  the heightfield simulation has the game's rule and keeps it. The stacked engine refuses one in its input checks
  (`rust/water/src/columns.rs`, `stack_memory.rs`, `stack.rs`, `stack_engine.rs`: each wants a strength of 0 or
  more) and its emit step in `stack.rs` has no sink branch,
  and `stackObjectRows` refuses it first with a
  plain line. Reachable only once stage 6 runs a cave map through the engine, and then only if the player sets a
  sink on it. Giving the engine the rule is a Rust change with a new fixture; it changes no golden fixture (none
  has a sink). The game's rule on one column is known (D337); a sink under a roof has not been checked in the game.
- **Also refused on stacked terrain for now:** the tiles of Remove unfed water (`drained`; the engine takes them
  on open fields only). Retained water (a Fill, a carve's lake) is passed through.
- **Covered:** every water object the app can place, on one-column maps, through the engine against today's
  settle, bit for bit, in every facing (`tests/contract/stackEncoder.test.ts`); the two paths, slices and progress
  (`tests/contract/stackedWater.test.ts`).
- **Not done here, for stage 6:** the editor's live water after an edit (`sim/preview.ts`, `fed.ts`, `weather.ts`
  and the worker's jobs run `WaterSim` directly) on stacked terrain; soil per run top and the multi-slot writer in
  the build and export; the checks' water.

## Stage 6, first part: a sink in the stacked engine (built 2026-10-07)

On `feature/3d-foundations-6`. Nothing a player sees changes: no map the app builds reaches the stacked engine yet.
- **The rule** (`rust/water/src/stack.rs`, the emit step; the input checks in `columns.rs`, `stack_memory.rs`,
  `stack.rs` and `stack_engine.rs` now take a strength down to −1,000,000): a sink takes its share off each of its
  columns. In the open, with no pressure, it is the heightfield rule (`sim.rs`, D337) in the same arithmetic. Under a
  roof it follows the game's one task for every column, `UpdateWaterSourcesTask.Run` with
  `WaterDepthSetter.SetWaterDepth` and `UpdateContaminationFromWaterChange` (Timberborn 1.1.2.4, read, not copied):
  the change comes off depth plus pressure together, floored at dry, with the pressure capped as ever, and the
  badwater share is weighed on depth plus pressure × 8 before and after. **From the game's code, not yet played.**
- **Checked:** an open field with a sink through the engine is today's settle bit for bit (Rust and
  `tests/contract/stackEncoder.test.ts`); a sealed cave with a source and a sink (`rust/water/tests/stacked.rs`);
  the new test map T7's settled water pinned (`tests/contract/stackedWater.test.ts`). No golden fixture has a sink,
  and all eight still pass natively and in Node's WebAssembly.
- **Remove unfed water on stacked terrain stays refused.** The heightfield rule names tiles and takes the water no
  source feeds on them; on a tile with several water columns it does not say which column a removal takes (the one
  seen from above, or every one), and "fed" has to be worked out on the column graph. That needs a decision before
  it is built.
- **The probe's maps and group:** see "The probe batch" below.

## Stage 6, the rest: imported caves' water is simulated (built 2026-10-08)

On `feature/3d-foundations-6b`, one PR, landed whole: the settle, the soil, the file, the checks, the view and the
editor's water switch together. Kyler's choices are D280's amendment of 2026-10-07 (#359).

**What "a map with caves or overhangs" is:** an imported map with any tile that is not one plain run from the
bottom. That is every one of the 19 official maps and 7 of the 9 workshop maps here, not only the cave maps:
Beaverome has 25 such tiles, Diorama 3. Generated maps and heightfield imports are untouched (the byte proofs are in the PR).

- **The build** (`features/build.ts`): the water model of a base with such tiles is `stackedModel(...)` on the
  terrain as it stands (`base.terrain.withSurface(heights)`), and the base's own model the same, so an unedited
  import still compares equal, keeps its file's water and exports byte for byte. The settle is the stacked engine's
  canonical one. With live editing (the page) or the preview mode, an edit shows the last water carried over to
  the new ground on every column (`sim/stackWater.ts` `staleStack`: the top column from above, the columns under
  it as they were) and the canonical settle follows; there is no warm-started preview on such a map. Soil is per
  run top (`sim/soil.ts` `stackedSoil`, worked out once per settle); `BuildResult.moisture` and `soilContamination`
  stay per tile, each tile's top run, for the plants.
- **`BuildResult` has no new field.** The cave data rides on `settle.stack` and `waterModel.stacked`, which the
  project's stored map carries by itself: a cave import's project grows, a heightfield's is the same bytes. A cave
  import's stored map saved before this change (its water model has no `stacked`) is built again at open
  (`doc/session.ts` `restored`).
- **The file** (`doc/session.ts` `exportFile`): `stackedSimulationSingletons` from the settle's columns and the
  soil per run, put in place of the file's water singletons in the session itself (`gen/pack.ts` is not touched;
  its `roofed` option and `format/world.ts` `mixedSimulationSingletons` are now unused by the app and can go when
  pack.ts is free). The writer's columns must be the engine's: a mismatch refuses the export with one line.
- **The checks:** a file with caves is settled by the stacked engine wherever the checks settle one themselves
  (`sim/stackWater.ts` `worldWaterModel`, used by `validate/rust.ts` and the worker's check of an import); the
  water they read is the map seen through its roofs, each tile's highest wet column (`seenThroughRoofs`), as the
  map's own stored water is read at any level: with each tile's top column only, a river under a bridge or through
  a tunnel read as water with no outlet and a sealed puddle (tried: Beaverome, Canyon, Cliffside and Terraces
  failed `water.outflow`). How a check counts water under a roof is stage 3's floor graph.
  `rust/checks/src/mechanics.rs`: caves are no cause of approximate
  water any more (D98); `caveShare` stays as information; "the start is under a roof" stays.
  `tools/rust/checks-pins.json` is unchanged. The Python validator still names caves as a cause (it has no stacked
  engine, D279): stage 7's note.
- **A seep in the stacked pre-fill** (`rust/water/src/stack_prefill.rs`): the heightfield's rule (`sim/prefill.ts`
  `flowThrough`, the probe's parity-20260930), which #71's pre-fill did not have: a seep's water stands no higher
  than its anchor's floor plus 0.8 and reaches only ground lower than that. Without it Oasis and Spillage, the two
  seep maps, flooded once edited (Oasis 361 wet tiles and 284 blocks in its file, 1,704 and 3,126 settled), where
  dev's heightfield settle did not; with it both match their files (below). No golden fixture has a seep: all nine
  still pass natively and in Node's WebAssembly, and `waterWasm.ts` is rebuilt.
- **The editor's water** (`src/worker/session.ts`): on such a map no live water job starts after an edit, on a
  stroke or under a force; the page's background check runs the canonical settle in slices with progress (the dot
  says "Settling…") and puts the water in place. The import's own check reuses that settle instead of settling
  the same model again (`MapSession.settledFor`). The view gets every wet column (`waterFromStack`), the soil each
  tile's top run. `settleWater()` (Node tests) settles canonically there.
- **Refused for now, one line each** (`sim/stackWater.ts` `CAVE_REFUSALS`): "Drought and Badtide aren't worked out
  for maps with caves yet" (`sim/weather.ts` `hazardRefusal`, `HazardRun`; the worker's `showWeatherDay`), "Fill
  isn't worked out for maps with caves yet" and "Removing unfed water isn't worked out for maps with caves yet"
  (`doc/ops.ts`; the questions in `doc/waterEdits.ts` answer with the same line). A removal an older project
  stored takes nothing on such a map and the session's notices say the line.
- **Wording:** the opening notice is "This map has caves or overhangs. The tools leave them as they are."; the
  layer is "Caves and overhangs", its tooltip "Show caves and overhangs", its caption "Violet tiles: caves or
  overhangs, which the tools leave as they are". The old words are retired interface text
  (`tools/retired-terms.json`, three patterns).
- **A file from a taller, modded game** (Tower of Beaverlon, objects and water up to level 87): objects and
  stored water outside the water's 34 levels are left out of the stacked model, so the map still opens, edits
  and checks.

### What a player sees change

After one small edit (three corner tiles raised by one), the water the exported file holds, as wet columns / blocks
of water, on the open tiles and on the tiles with caves or overhangs; "edited on dev" is the heightfield settle
with the file's own water kept under roofs.

| Map | Cave tiles | Its file: open, cave tiles | Edited on dev | Edited now | Rows |
|---|---|---|---|---|---|
| Beaverome | 25 | 16,503 / 80,662; 25 / 55 | 16,831 / 81,829; 25 / 55 | 16,503 / 80,400; 25 / 55 | 0 |
| Canyon | 228 | 1,648 / 549; 180 / 14 | 2,030 / 925; 180 / 14 | 1,649 / 550; 182 / 14 | 0 |
| Cliffside | 74 | 541 / 200; 37 / 12 | 818 / 1,097; 37 / 12 | 541 / 200; 37 / 12 | 4 |
| Craters | 199 | 5,981 / 4,571; 125 / 56 | 7,512 / 9,757; 125 / 56 | 5,981 / 4,571; 125 / 56 | 1 |
| Diorama | 3 | 286 / 130; 6 / 2 | 286 / 130; 6 / 2 | 286 / 130; 6 / 2 | 0 |
| HelixMountain | 279 | 12,674 / 4,246; 33 / 13 | 12,522 / 4,264; 33 / 13 | 12,669 / 4,254; 33 / 13 | 2 |
| Hollows | 4,991 | 3,086 / 2,725; 1,031 / 303 | 11,640 / 56,289; 1,031 / 303 | 3,086 / 2,725; 1,031 / 302 | 16 |
| Lakes | 193 | 9,423 / 5,628; 118 / 37 | 9,858 / 5,238; 118 / 37 | 9,423 / 5,616; 118 / 37 | 0 |
| Meander | 179 | 2,263 / 885; 40 / 9 | 2,263 / 889; 40 / 9 | 2,285 / 898; 40 / 9 | 1 |
| MountainRange | 236 | 3,344 / 1,174; 86 / 70 | 3,128 / 1,173; 86 / 70 | 3,344 / 1,174; 86 / 70 | 1 |
| Nomads | 1,571 | 1,218 / 252; 110 / 18 | 33,522 / 151,780; 110 / 18 | 1,218 / 252; 110 / 18 | 18 |
| Oasis | 926 | 361 / 284; 0 / 0 | 361 / 263; 0 / 0 | 361 / 263; 0 / 0 | 0 |
| Pillars | 2,929 | 12,098 / 1,596; 2,292 / 261 | 12,098 / 1,823; 2,292 / 261 | 12,098 / 1,585; 2,292 / 261 | 2 |
| Plains | 121 | 6,042 / 1,811; 64 / 15 | 6,112 / 2,188; 64 / 15 | 6,042 / 1,813; 64 / 15 | 0 |
| Pressure | 7,559 | 3,343 / 3,050; 5,710 / 8,438 | 12,599 / 17,991; 5,710 / 8,438 | 3,343 / 3,044; 5,710 / 8,438 | 17 |
| Spillage | 622 | 3,364 / 2,361; 108 / 24 | 3,956 / 2,619; 108 / 24 | 3,364 / 2,286; 108 / 23 | 3 |
| Terraces | 619 | 9,138 / 5,315; 703 / 140 | 10,005 / 8,060; 703 / 140 | 9,138 / 5,316; 703 / 140 | 0 |
| ThousandIslands | 65 | 35,933 / 12,582; 63 / 53 | 35,933 / 12,700; 63 / 53 | 35,933 / 12,571; 63 / 53 | 0 |
| Waterfalls | 220 | 2,053 / 516; 20 / 9 | 2,053 / 518; 20 / 9 | 2,053 / 518; 20 / 9 | 1 |
| Beavers Endgame - 256x256 | 16,887 | 6,315 / 7,583; 5,759 / 4,716 | 10,372 / 35,252; 5,759 / 4,716 | 5,887 / 7,631; 5,682 / 4,767 | 17 |
| Beavers Rift - 83x83 | 3,883 | 533 / 112; 1,677 / 736 | 809 / 1,055; 1,677 / 736 | 527 / 112; 1,677 / 736 | 0 |
| Beavertopia - 256x256 | 28,877 | 3,394 / 1,648; 10,537 / 18,745 | 3,444 / 2,199; 10,537 / 18,745 | 3,384 / 1,661; 10,545 / 18,768 | 16 |
| Cozy Secret Valley | 817 | 2,548 / 1,247; 601 / 684 | 2,816 / 5,389; 601 / 684 | 2,545 / 1,244; 601 / 684 | 4 |
| Lost Underground (Update 7) | 2,896 | 161 / 115; 1,707 / 2,763 | 544 / 425; 1,707 / 2,763 | 161 / 115; 1,707 / 2,762 | 0 |
| Lost Valley - 151x251 | 11,629 | 5,879 / 3,966; 4,142 / 2,264 | 6,600 / 5,019; 4,142 / 2,264 | 5,879 / 3,962; 4,142 / 1,974 | 15 |
| Tower of Beaverlon - 78x78x100 | 2,129 | 2,414 / 3,992; 3,332 / 9,032 | 1,695 / 378; 3,332 / 9,032 | 354 / 123; 554 / 582 | 15 |

Check rows whose verdict changed after that edit (`~` marks approximate):

- Cliffside: `plants.drought` ok to fail; `plants.survive` fail to ok; `resources.mine_site` ok to fail; `start.water` fail to ok.
- Craters: `start.badwater` fail to ok.
- HelixMountain: `plants.survive` fail to ok; `resources.mine_site` ok to fail.
- Hollows: `start.badwater` ok~ to ok; `start.dry` ok~ to ok; `start.farmland` fail to ok; `start.food` ok~ to ok; `start.level_land` fail to ok; `start.reach` ok~ to fail; `start.ruins_clear` ok~ to ok; `start.water` ok~ to ok; `start.wood` ok~ to fail; `water.clean_exists` ok~ to ok; `water.clean_reach` ok~ to ok; `water.no_flood` ok~ to ok; `water.outflow` ok~ to fail; `water.settles` ok~ to ok; `water.source_in_flow` ok~ to ok; `water.storage_possible` ok~ to ok.
- Meander: `plants.survive` fail to ok.
- MountainRange: `resources.mine_site` ok to fail.
- Nomads: `plants.survive` fail to ok; `resources.mine_site` fail to ok; `start.badwater` ok~ to ok; `start.dry` ok~ to ok; `start.farmland` fail to ok; `start.food` ok~ to fail; `start.level_land` fail to ok; `start.reach` ok~ to fail; `start.ruins_clear` ok~ to ok; `start.water` ok~ to fail; `start.wood` ok~ to fail; `water.clean_exists` ok~ to ok; `water.clean_reach` ok~ to ok; `water.no_flood` ok~ to ok; `water.outflow` ok~ to ok; `water.settles` ok~ to ok; `water.source_in_flow` ok~ to ok; `water.storage_possible` ok~ to fail.
- Pillars: `plants.survive` ok to fail; `water.no_flood` ok to fail.
- Pressure: `plants.drought` fail to ok; `start.badwater` ok~ to fail; `start.dry` ok~ to fail; `start.farmland` fail to ok; `start.food` ok~ to fail; `start.level_land` fail to ok; `start.reach` ok~ to fail; `start.ruins_clear` ok~ to ok; `start.water` ok~ to ok; `start.wood` ok~ to fail; `water.clean_exists` ok~ to fail; `water.clean_reach` ok~ to ok; `water.no_flood` ok~ to ok; `water.outflow` ok~ to ok; `water.settles` ok~ to fail; `water.source_in_flow` ok~ to ok; `water.storage_possible` ok~ to ok.
- Spillage: `start.badwater` ok to fail; `start.food` ok to fail; `water.storage_possible` ok to fail.
- Waterfalls: `plants.survive` ok to fail.
- Beavers Endgame - 256x256: `plants.drought` fail to ok; `start.badwater` ok~ to fail; `start.dry` ok~ to ok; `start.farmland` fail to ok; `start.food` ok~ to ok; `start.level_land` fail to ok; `start.reach` ok~ to fail; `start.ruins_clear` ok~ to ok; `start.water` ok~ to fail; `start.wood` ok~ to ok; `water.clean_exists` ok~ to ok; `water.clean_reach` ok~ to ok; `water.no_flood` ok~ to ok; `water.outflow` ok~ to fail; `water.settles` ok~ to fail; `water.source_in_flow` ok~ to fail; `water.storage_possible` ok~ to fail.
- Beavertopia - 256x256: `resources.mine_site` ok to fail; `start.badwater` ok~ to fail; `start.dry` ok~ to ok; `start.farmland` fail to ok; `start.food` ok~ to ok; `start.reach` ok~ to fail; `start.ruins_clear` ok~ to ok; `start.water` ok~ to fail; `start.wood` ok~ to fail; `water.clean_exists` ok~ to ok; `water.clean_reach` ok~ to ok; `water.no_flood` ok~ to ok; `water.outflow` ok~ to fail; `water.settles` ok~ to fail; `water.source_in_flow` ok~ to ok; `water.storage_possible` ok~ to fail.
- Cozy Secret Valley: `resources.mine_site` ok to fail; `start.farmland` fail to ok; `start.water` fail to ok; `water.storage_possible` fail to ok.
- Lost Valley - 151x251: `resources.mine_site` ok to fail; `start.badwater` ok~ to ok; `start.dry` ok~ to ok; `start.food` ok~ to fail; `start.reach` ok~ to ok; `start.ruins_clear` ok~ to ok; `start.water` ok~ to ok; `start.wood` ok~ to ok; `water.clean_exists` ok~ to ok; `water.clean_reach` ok~ to ok; `water.no_flood` ok~ to ok; `water.outflow` ok~ to ok; `water.settles` ok~ to fail; `water.source_in_flow` ok~ to ok; `water.storage_possible` ok~ to ok.
- Tower of Beaverlon - 78x78x100: `start.badwater` ok~ to fail; `start.dry` ok~ to fail; `start.food` ok~ to fail; `start.level_land` fail to ok; `start.reach` ok~ to fail; `start.ruins_clear` ok~ to fail; `start.water` ok~ to fail; `start.wood` ok~ to ok; `water.clean_exists` ok~ to fail; `water.clean_reach` ok~ to fail; `water.no_flood` ok~ to ok; `water.outflow` ok~ to fail; `water.settles` ok~ to ok; `water.source_in_flow` ok~ to ok; `water.storage_possible` ok~ to fail.

- Where dev flooded a map after any edit (Hollows, Nomads, Pressure, Beavers Endgame and others above: the
  heightfield settle filled hollows whose real outlet is a cave or runs under an overhang), the edited map now
  holds about the water its file had.
- The settle takes longer than the live water did, and nothing moves meanwhile. Hollows, through the page: the
  water was in place 2.3 s after the edit (0.7 s of it the page's own wait before it checks), the dot reading
  "Settling…", the page drawing every frame (longest gap 36 ms). The slowest official maps settle in 9 to 27 s in
  Node (ThousandIslands, Pillars, Pressure, HelixMountain, Beaverome), Beavertopia in 32 s; four official maps
  reach the four-day cap without passing the settle's test (the table below), as on a heightfield some do at six.
- Unedited maps are unchanged: their file's own water, byte for byte.

### The information measures (ROADMAP)

The canonical stacked settle of each unedited map against its own saved water (wet columns deeper than 0.05), and
the soil rules per run on the map's own water against its stored moisture slots:

| Map | Wet columns, settle against file (IoU: all, open, roofed) | Settled, ticks, seconds in Node | Soil: moist or dry agrees (within 0.05) |
|---|---|---|---|
| Beaverome | 1, 1, 1 | yes, 2,304, 9.9 | 100% (100%) |
| Canyon | 0.9984, 0.9994, 0.9892 | yes, 640, 0.4 | 100% (100%) |
| Cliffside | 1, 1, 1 | yes, 512, 0.1 | 100% (100%) |
| Craters | 1, 1, 1 | yes, 1,152, 2.3 | 100% (100%) |
| Diorama | 1, 1, 1 | yes, 896, 0 | 100% (100%) |
| HelixMountain | 0.999, 0.999, 1 | no, 3,072, 11.1 | 100% (100%) |
| Hollows | 1, 1, 1 | yes, 896, 1.5 | 100% (100%) |
| Lakes | 1, 1, 1 | yes, 2,176, 8.9 | 100% (100%) |
| Meander | 0.9905, 0.9918, 0.8333 | yes, 1,152, 1.1 | 100% (100%) |
| MountainRange | 1, 1, 1 | yes, 768, 1.3 | 100% (100%) |
| Nomads | 1, 1, 1 | yes, 768, 0.5 | 100% (100%) |
| Oasis | 1, 1, 1 | yes, 1,152, 0.4 | 100% (100%) |
| Pillars | 1, 1, 1 | no, 3,072, 26.2 | 100% (100%) |
| Plains | 1, 1, 1 | yes, 1,408, 2.9 | 100% (100%) |
| Pressure | 1, 1, 1 | no, 3,072, 17.6 | 100% (100%) |
| Spillage | 1, 1, 1 | no, 3,072, 7 | 100% (100%) |
| Terraces | 1, 1, 1 | yes, 1,664, 6.2 | 100% (100%) |
| ThousandIslands | 1, 1, 1 | yes, 1,664, 26.6 | 100% (100%) |
| Waterfalls | 1, 1, 1 | yes, 512, 0.3 | 100% (100%) |
| Beavers Endgame - 256x256 | 0.9105, 0.8623, 0.9914 | no, 3,072, 18.9 | 99.91% (99.21%) |
| Beavers Rift - 83x83 | 0.9973, 0.9935, 1 | yes, 1,792, 1.6 | 100% (100%) |
| Beavertopia - 256x256 | 0.997, 0.9926, 0.9994 | no, 3,072, 32 | 100% (99.92%) |
| Cozy Secret Valley | 0.9984, 0.998, 1 | yes, 1,152, 1.3 | 100% (100%) |
| Lost Underground (Update 7) | 1, 1, 1 | yes, 768, 0.6 | 100% (100%) |
| Lost Valley - 151x251 | 1, 1, 1 | no, 3,072, 9.7 | 100% (99.94%) |
| Tower of Beaverlon - 78x78x100 | 0.2766, 0.25, 0.2993 | no, 3,072, 2.4 | 88.11% (74.86%) |

### What is not done, and what others need

- **The page** (`session/useSession.ts`, not this session's file): `toggleWeather` and `holdWeatherDay` drop the
  answer of `api.showWeatherDay`. On a map with caves the worker refuses with its line and sends the map's own
  water as day 0, so the Drought or Badtide button stays pressed, the day box reads the hazard's last day, the
  water does not change and no line shows. It needs: catch the refusal, release the button, show the line as the
  other refusals are shown. Fill and Remove unfed water have no control in the page yet; their refusals are the
  operations'.
- **The page** (`paint/usePaint.ts`): the water layers are fetched only while an overlay is on, so the Caves and
  overhangs toggle shows only once Badwater has been on. The same on dev before this change.
- **`src/editor/Header.tsx` line 133** ("The water and start checks are approximate here: …") needs no change: it
  prints whatever reason the checks give, and the cave reason is simply no longer given.
- **The renderer** draws the water it is sent, column by column, as it drew the file's own water under roofs
  before; nothing was changed or found wrong from above. How caves look from inside is step 2's.
- **The engine's sink rule under a roof** was read from Timberborn 1.1.2.4's code; the game here is now 1.1.2.7 and
  the rule has not been played.
- **Remove unfed water on such a map** still waits for its rule; **Drought and Badtide** and **Fill** for theirs.
- **Live water on such a map** would need the engine to warm-start and hand frames over; not built.
- **Tower of Beaverlon** (a workshop map from a taller, modded game, cut to 23 layers on import) loses most of its
  water once edited (2,414 wet open tiles to 354; 3,332 wet cave columns to 554): its sources stand above the
  water's levels and are left out. On dev it kept the file's water under roofs. It was never a map the app could
  hold whole.
- **Found on the way, on dev too** (not this stage's): under heavy load, a file opened right after the generated
  map can leave the checks worker without the map, and the dot stays at "Checking the map" until the next edit
  (`backgroundCheck` answers null). Seen on 1 of 60 opens of a small map on dev's build and 2 of 60 on this
  branch, with four other jobs running; `tests/e2e/maps.spec.ts` then fails on whichever map it hits. And
  `tests/e2e/brushSources.spec.ts` fails now and then as a run's first test (1 of 2 on dev's build).
- **The Python validator** still gives caves as a cause of approximate water, so it and the Rust checks now
  disagree on Hollows, Pressure and Nomads: stage 7's note.

## The probe batch: the Terrain 3D group on the Rust engine (ready to ask for, 2026-10-07)

On `feature/3d-foundations-probe`. Nothing in the app changes.
- **The group** (`investigation/probe/runner/terrain3d.ts`, from #71, with DGM Probe's records of each water
  column's pressure and every run's soil; the mod is 0.3.1 and compiles) is in dev's runner, with its writer
  (`tools/probe-maps/terrain3d.ts`, `GROUP_WRITERS`), so `--group "Terrain 3D"` writes its maps before it plans.
  What the game should show is worked out from each file by the app's own engine: the terrain the support rule
  keeps (`terrain/support.ts`), the water run from the file's own (`sim/stackWater.ts`, rust/water), soil per run
  (`sim/soil3d.ts`). #71's TypeScript engine is not used.
- **The maps:** T3, T4, T5 and T6 as dev writes them now, and T7 (sinks), into `C:\dgm-probe\terrain3d-2\`.
  `C:\dgm-probe\terrain3d\` keeps the files September's runs played; T1 and T2 there are still what dev writes,
  so they are not played again. With stage 6: `hollows-edited` and `canyon-edited`, each official map imported,
  three corner tiles raised by one and exported by the app (the whole map's water the stacked engine's settle,
  soil per run); the writer reads the official maps from `investigation/raw/builtin` and leaves the two out, saying
  so, where they are missing.
- **The plan** (a dry run, nothing launched): 7 maps, about 15 minutes by the runner's own estimate, with the
  installed mods kept (`--keep-mods`). To ask for it: `npm --prefix investigation/probe run batch -- --group
  "Terrain 3D" --keep-mods` prints the plan and a one-time code; the launch is the same command with the code,
  after Kyler's yes (D117).
- **The sink in the identity fixtures:** `tests/golden/stacked-water.json` has a ninth case, `t7-sink`
  (`tools/rust/stack-sink-fixture.ts` writes it), marked in the file as from the game's code and not yet played.
  `tools/rust/stack-identity.ts` and the determinism check's stacked cases run it; the eight #71 cases are
  unchanged.
- **Not covered by this group now:** the support rule's own check ran on T1 (`t3d-support` still runs on every
  map, but no map here has voxels that fall), and walking and pumps stay not measurable, as in September.


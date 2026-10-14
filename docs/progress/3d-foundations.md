# 3D, step 1: Foundations (progress)

Terrain above terrain's first step (D481, D280 (1); the spec is ROADMAP.md, "Terrain above terrain" → "1. Foundations"),
on `feature/3d-foundations` (worktree `C:\Users\Kyler\code\DamGoodMaps-3d-foundations`), one draft PR into `dev`. The
reference TypeScript is #71 (`origin/feature/terrain3d-a`, never adopted, D448); its progress file
(`docs/progress/terrain3d-a.md` on that branch) holds the game's verdicts and the design findings for the wiring.

## Now (2026-10-07)

Stages 1, 2, 4 and 5 are on dev (#354, #355, #356, #357). Stage 3 is built (below), with the wording Kyler approved
(D280's amendment) and D482. Stage 6 is begun: its first part, the sink rule in the stacked engine and the probe's map for it, is
built (below); switching cave imports onto the engine is not, and its plan and open questions are below. Nothing a
player sees has changed yet.

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
3. **The new check rows and the floor graph. Built**, see below; what it leaves is listed there. As planned
   (the rest of delivers 4): `walk.levels`, `terrain.dropped`,
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
6. **Imports with caves on the engine** (delivers 3, 5). Roofed water simulated; D100's exception
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

## Stage 3: four check rows, the floor graph, Slopes connect warns on imports (built 2026-10-07)

On `feature/3d-foundations-3`. A player sees it: three new rows in the checks list, and one row's weight changed.
- **The floor graph** (D122): `rust/checks/src/floors.rs`, with `src/core/terrain/floors.ts` `floorGraph` as its
  plain face (the checks' Wasm, `checks_floors`). A floor is air on solid ground, or on the map's bottom, at any level
  of a tile; floors of neighbouring tiles join at the same level; a Slope joins its own tile's floor to the floor
  one level up on its high side (the links the heightfield walk has); no headroom rule. Areas are numbered in the
  order of their first floor. `open_air` in the same file is the air joined to the sky or the map's edge.
- **`walk.levels`** (playability class, always passing: information). The areas the start does not reach, each of
  400 or more dry floors open to the sky or the edge (`SLOPE_RULES.bigRegion`, the size of a region that earns a
  slope, generated into the Rust's tables). "Every level can be walked to from the start" · "3 areas need stairs to
  reach, the highest at level 14" (one area: "1 area needs stairs to reach, at level 14"). Not applicable without
  one start. The 400 is this stage's choice, not Kyler's: with it the 84 sample maps read from "Every level…"
  (9 maps) to 8 areas; at 9 floors a sample of 42 read 23 to 156.
- **`water.sealed_source`** (playability class, advisory: a warning that never blocks). A water source, badwater
  source or seep with a strength above 0 whose own air cells join neither the sky nor the edge. One line per source:
  "Water source sealed inside rock · X 23 · Y 45 · Z 5".
- **`plants.clearance`** (load class, as `entities.placement`: the game removes the plant). A plant on good ground
  whose upper block is in rock; it is counted here and no longer in `entities.placement`. The rule and its table are
  `src/core/terrain/clearance.ts` (`PLANT_CLEARANCE`, `plantsWithoutRoom`), which `tools/terrain3d-maps.ts` (T5) now
  uses; the Rust reads the same table. Its fix is the existing "Remove the objects the game would delete".
- **`terrain.dropped`** (design class: blocks in `generate`, warns on a generated map being edited, absent on an
  import). The row is in the checks behind `ValidateOptions.dropped`, tested, and **no map shows it yet**: the
  build has no support pass that could report a count, and the generator's own validations are in
  `src/core/gen/generate.ts` (lines 1641, 2790, 2810, 2901 and 2935), which this stage may not edit. The follow-up:
  the build's rule pass (`terrain/support.ts` on the build's terrain, a call that drops nothing on plain terrain)
  reports its count, and those five calls and `MapSession.validate` pass `dropped`. D115 calls 0 dropped voxels a
  principle; the principle class would block the export of an edited map for ground the build already removed,
  so the row is design class until Kyler says otherwise.
- **D482:** `slopes.connect` carries `advisory` on an imported map (`ValidateOptions.external`, which
  `MapSession.validate` sets for every map that was not generated), so it is a warning in every profile and never
  in the export gate's blocking list; a generated map's row is unchanged (an error that blocks). On an import it no
  longer shows among the instant problems after an edit (`checkItems` lists failing checks only); the full check
  lists it with its fix.
- **`terrain.single_floor`** is an imported map's row only: absent in `generate` and on a generated map in the
  editor.
- **The Python validator** (`prototype/validate.py`): slopes and the start read the floor they stand on
  (dev's oracle disagreed on Cliffside since stage 2), the support rule runs on every map that is not plain,
  `plants.clearance` is computed, `terrain.single_floor` is an import's row, `slopes.connect` is advisory on an
  import. `walk.levels` and `water.sealed_source` are reported without being computed (D279: no Python copy of the
  3D rules), marked `information`, and `tools/oracle.ts` does not compare their verdicts.
- **Real maps** (`tools/check-rows.ts`, 22 official, 9 workshop, 1 user; dev against this branch): every map gains
  the three rows; `slopes.connect` turns from an error into a warning on Hollows, Beavers Canyons, Beavers Endgame,
  Cozy Secret Valley, Lost Underground, Lost Valley and Tower of Beaverlon; nothing else changes. `plants.clearance`
  passes on all 32. `water.sealed_source` warns on Hollows (a source on the floor of a closed cave, 146, 129, 0),
  Nomads (two sources that turn on later, each in a one-block pocket, 164, 46–47, 6) and Beavers Endgame (a
  badwater source, 137, 122, 2). `walk.levels` reads from "Every level…" (Diorama) to 48 areas (Oasis).
- **Tests that followed the rows** (D148): `tests/contract/features.test.ts` lists `water.sealed_source` among a
  generated map's advisory rows; `tests/contract/mechanics.test.ts` asks every water row that reads the water to be
  approximate, which `water.sealed_source` does not. The new rows' own tests are `tests/contract/floorRows.test.ts`.
- **Not done here:** the playability checks still walk the top surface (`walk_world`, the analysis kernels), and
  `start.dry` has no floor rule under roofs: they move onto the floor graph with stage 6, when a cave map's water
  is the engine's. First-run placement beyond what `entities.placement` already checks is unchanged.
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

## Stage 6, the rest: what switching cave imports on takes (surveyed, not built)

It has to land as one change: with only the settle switched, the editor's live water and the views would still be
the heightfield's, and a cave map would show water that is not what gets exported.
1. **The build** (`features/build.ts`, the water steps): `stackedModel(model, base.terrain.withSurface(heights),
   objects)`, and the same in `baseModelOf` so an unedited import still compares equal and keeps the file's own
   water (the byte-for-byte export rests on `waterFromFile`). Soil from `soil3d` per run top; `BuildResult.moisture`
   and `soilContamination` stay per tile (each tile's top run) for the plants, with the per-run arrays beside the
   settle. A project stores the build result, so a cave import's project grows these fields; heightfield projects
   do not change.
2. **Export** (`doc/session.ts` `exportFile`, `gen/pack.ts` `worldOf`, which is the generator queue's file this
   week): `stackedSimulationSingletons` from the settle's `stack` and the per-run soil, in place of
   `mixedSimulationSingletons` and `roofed`.
3. **The checks** (`validate/rust.ts`; `rust/checks/src/mechanics.rs`): the settled water passed is each tile's top
   column; the cave share stops being a reason for "approximate" (D98). "The start is under a roof" stays a
   reason until stage 3's floor graph.
4. **The editor's live water** (`sim/preview.ts`, `fed.ts`, `weather.ts`; the worker's water jobs): all step a
   `WaterSim` on one column per tile. The honest first version on stacked terrain is the canonical stacked settle
   in slices after each edit, with no warm start, shown when done; Drought and Badtide on stacked terrain and Fill
   and Remove unfed water on it are refused with one line until they have rules.
5. **The worker's views** (`src/worker/session.ts` `waterOf`, `soilOf`, the layers' `roofed`): every column from
   `CanonicalWater.stack`; clear of #329's regions (the weather runs and `startForceWater`).
6. **The page and the renderer** (not this session's files): the "Under roofs" layer (`src/editor/panels.tsx`
   lines 27, 36–37; `src/editor/render/viewControls.tsx` line 12; `src/ui/View3D.tsx`) and its violet tiles go or
   change meaning; `src/render3d/model.ts` `WaterView` already takes several columns per tile.
7. **Wording a player reads** (Kyler's): the opening notice (`doc/session.ts`: "This map has caves or overhangs.
   Water under them keeps the map's own: the preview is approximate there. "Under roofs" in the view bar marks
   them." → proposed "This map has caves or overhangs. The tools leave them as they are."); the layer ("Water under
   roofs", "Violet tiles: under caves or overhangs, their water approximate", "No caves or overhangs on this map." →
   removed, or kept as "Caves and overhangs" with "Violet tiles: caves or overhangs, which the tools leave as they
   are"); the checks' reason "caves or overhangs cover N% of the map" → gone.
8. **Questions to settle first:** what Remove unfed water takes on a tile with several columns; whether live water
   without a warm start is acceptable on cave maps; whether the layer goes or is renamed.

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
  so they are not played again. The edited Hollows and Canyon join when stage 6 can export them; the writer says
  so in one line until then.
- **The plan** (a dry run, nothing launched): 5 maps, about 12 minutes by the runner's own estimate, with the
  installed mods kept (`--keep-mods`). To ask for it: `npm --prefix investigation/probe run batch -- --group
  "Terrain 3D" --keep-mods` prints the plan and a one-time code; the launch is the same command with the code,
  after Kyler's yes (D117).
- **The sink in the identity fixtures:** `tests/golden/stacked-water.json` has a ninth case, `t7-sink`
  (`tools/rust/stack-sink-fixture.ts` writes it), marked in the file as from the game's code and not yet played.
  `tools/rust/stack-identity.ts` and the determinism check's stacked cases run it; the eight #71 cases are
  unchanged.
- **Not covered by this group now:** the support rule's own check ran on T1 (`t3d-support` still runs on every
  map, but no map here has voxels that fall), and walking and pumps stay not measurable, as in September.


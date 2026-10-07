# 3D, step 1: Foundations (progress)

Terrain above terrain's first step (D481, D280 (1); the spec is ROADMAP.md, "Terrain above terrain" → "1. Foundations"),
on `feature/3d-foundations` (worktree `C:\Users\Kyler\code\DamGoodMaps-3d-foundations`), one draft PR into `dev`. The
reference TypeScript is #71 (`origin/feature/terrain3d-a`, never adopted, D448); its progress file
(`docs/progress/terrain3d-a.md` on that branch) holds the game's verdicts and the design findings for the wiring.

## Now (2026-10-07)

Stage 1 is built (below). Next: stage 2. Nothing a player sees has changed.

## What dev already has (surveyed 2026-10-07 at 498eb620, against INVENTORY.md)

INVENTORY.md is from 2026-09-25; since then M9a, M9b and the Rust ports moved a good part of it.

- **Terrain's form:** `src/core/terrain/runs.ts` (`ColumnTerrain`, a mask per tile; format 3's `TerrainData`).
  Format 3 stores the base and the field as heights plus runs; formats 1 and 2 convert on read (`doc/document.ts`
  `fromV1`, `fromV2`). So delivers (1)'s format part is done.
- **Soil per run top:** `sim/soil3d.ts` on `sim/columns.ts`, the game's rules; the build already uses it on one run
  per tile (`sim/soil.ts` `gameSoil`). On a cave import the soil shown is still the file's (`session.storedSoil`).
- **The engine:** `rust/water`'s `stack*.rs` and `columns.rs`, in the committed Wasm (`stack_create`, `stack_op`, …),
  reached only by `tools/rust/stack-memory.ts` and the fixtures (`tests/golden/stacked-water.json`). No `src/` code
  calls it.
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
4. **The multi-slot writer and the T maps** (delivers 2's writer, 6). `src/core/format/world.ts` gains the stacked
   singletons (#71's `format/stacked.ts`: one slot's bytes exactly today's on a heightfield); a `src/core/sim`
   binding to the Rust engine (from `tools/rust/stack-memory.ts`); `tools/terrain3d-maps.ts` ported onto them.
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
- **Checked:** see the PR.

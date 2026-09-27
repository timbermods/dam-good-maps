# 3D terrain, step 1: foundations (progress log)

> **State at the stop (2026-09-27, `feature/terrain3d-a`):** paused at a clean point on D286 (3): for now only new
> pieces beside the existing code, no existing module changed; the engine moves to another agent definition.
> - **What exists** (new files only, nothing imports them yet):
>   - `src/core/sim/columns.ts`: the game's water columns from voxel masks (one `Uint32` per tile, bit z solid) and
>     the map objects' obstacles (Blockage, NaturalDam, NaturalOverhang2x1–4x1, BadtideDrain), slot-major like the
>     file; `slotAt`, `isOpenField`, `isRoofed`. Heightfield tiles are kept out of the per-tile lists, so building
>     columns for a 256² heightfield is cheap.
>   - `src/core/sim/stack.ts`: `StackSim`, the stacked-column engine ported from the investigation's
>     `proto/stackwater.ts`, "game" mode by default (the five rules the heightfield port simplified), "port" mode kept
>     for the parity tests. Partial obstacles and direction limiters are sparse maps keyed by cell, looked up only on
>     tiles that hold one.
>   - `tests/unit/stack.test.ts`: port mode equals `WaterSim` bit for bit on a heightfield (300 ticks from the
>     pre-fill); game mode changes no wet tile there, depths under 0.05; a sealed cave with a source fills to its
>     roof and holds overflow within the cap, nothing reaching the open columns above.
> - **Verified here:** the typecheck and the new test pass. A scratch run on generated 128² maps (River Valley and
>   Canyon, seed 3, 768 ticks from the pre-fill): port mode 0 tiles differ from `WaterSim` (depth and
>   contamination bits); game mode 0 wet tiles differ (0.05), largest depth change 1.3e-4 and 8.8e-3. The general
>   loop costs 1.5–1.7× `WaterSim` per tick (735 against 431 ms, 441 against 287 ms), as DESIGN.md §3.1 measured.
> - **Not started:** the fast path for one-column tiles, the 3D pre-fill and canonical settle (`proto/prefill3d.ts`),
>   the settle in slices with progress, moisture and contamination per run top, the multi-slot writer, the support
>   check (`proto/support.ts`), T1–T6 and the probe group, golden fixtures. Nothing is wired into the build, the
>   validators or the editor, which waits for the forces and M9b to merge (D286 (3)).
> - **Next for the engine:** see "Next" below.

## Next

In this order, each a new module beside the existing code until the wiring step:

1. **The fast path.** A tile whose own column and whose 8 neighbours are single open columns (every tile of a
   heightfield) can run `WaterSim`'s fixed-neighbour arithmetic: the pressure terms are exactly 0 there (the cap
   (34 − 34)/8 is 0), `neighbourWet` reduces to `D > 0` and `bestWn` to the neighbour's own count. Two levels: a
   map whose columns are all open (`isOpenField`) can use the heightfield engine as it is (with game mode added to
   `water.ts` when wiring is allowed); a map with a few caves needs the per-tile fast path inside `StackSim`, with
   the edge layout unchanged so momentum stays keyed per edge. Prove it bit for bit against the general loop.
2. **The 3D pre-fill and canonical settle** from `proto/prefill3d.ts`, in a new `sim/stackPrefill.ts`: its
   `spillLevels3d` and path walk give today's numbers on heightfields in the same order (the MinHeap breaks ties by
   id, and slot 0's ids are the tile indices). Add a settle in slices with the same test as `SettleRun` (columns
   counted, at most 0.5% of the map's tiles' worth move by more than 0.005), so the page can show progress.
   `proto/prefill3d.ts`'s `port` flag in `spillLevels3d` is a no-op (unreached columns keep their floor level
   either way); drop it.
3. **Moisture and contamination per run top**, new `sim/soil3d.ts`: nodes are the game's terrain columns (run 0
   always present, empty when the bottom voxel is air, so the slot layout matches `SoilMoistureSimulator`). The
   formulas are in the decompiled `MoistureCalculationTask.CalculateMoistureForCell` and
   `SoilContaminationSimulator`'s `GetContaminationCandidate`: own water (the column whose floor is the run top,
   2·sat); a full column directly under the run (range − 6·(thickness − 1); contamination 2(c − 0.5) −
   (5/7)(thickness − 1)); the topmost wet column at or below the run top on each 4-neighbour; spread from
   8-neighbour runs whose [floor, ceiling] overlaps (both ends inclusive), 1 or 1.414 (1/7, √2/7 for
   contamination) plus 6 (5/7) per level up less the neighbour's water depth there (contamination: no depth
   credit). On a heightfield it must equal `moisture.ts` and `contamination.ts`; check it against the official
   cave maps' stored slots (at least 18 of 19).
4. **The multi-slot writer**, a new function beside `settledSimulationSingletons` (or its own file):
   `WaterMapNew.Levels` = the most columns, tokens per (slot, tile) `depth:contamination:overflow:floor:depth`,
   `WaterEvaporationMap` with the same levels, soil with `Size` = the most terrain columns
   (`proto/write3d.ts`).
5. **The support check**, new `terrain/support.ts` from `proto/support.ts` (38 shapes in
   `proto/support-tests.ts` behave as the game's rule predicts): the whole-map check runs every map, gated on
   "any tile not one plain run from z = 0" rather than today's floor count (INVENTORY bug 1). Masks rather than a
   voxel array make it cheap.
6. **T1–T6** (DESIGN.md §8) with a tool like `tools/probe-tall.ts` writing `C:\dgm-probe\terrain3d\`, and a probe
   group in `investigation/probe/runner/catalog.ts`. The mod's records need two small additions for these checks:
   each water column's overflow (`ReadOnlyWaterColumn.Overflow` exists) and the moisture of every terrain column
   of layered tiles (the snapshot keeps only the top one's).
7. **Golden fixtures** once the probe batch and the official maps (`.scratch/official/` on this machine; never
   committed) agree: the engine's results on our own T maps as CI fixtures.

## Design findings for whoever takes it over

- **The Python oracle.** D280 drops the Python copy of the stacked engine, and says heightfield water keeps its
  Python check exactly as today. But adopting game mode for heightfields (D120) moves every generated map's water
  in its last digits, so `prototype/watersim.py`'s heightfield sim needs the same five rules (evaporation on a dry
  tile that receives water; the spill threshold at the padding; the partial obstacle looked up from the higher
  floor to the ceiled surface; the source step's old depth; direction limiters), or the oracle's heightfield check
  stops agreeing bit for bit. On generated maps only the first rule does anything (no padding at floor 0, no
  NaturalDams, no drains). Decide this before the wiring step.
- **M9a overlaps.** `feature/m9a` already has `src/core/terrain/runs.ts` (`ColumnTerrain`, a `Uint32` mask per
  tile, and format 3's `TerrainData`), format 3 in `doc/document.ts` and `doc/base.ts`, and it rewrites
  `sim/water.ts` (the D130 speedups: its direction loop written out). Build on M9a's `runs.ts` rather than a copy,
  and make `water.ts`'s game-mode changes after M9a has merged. `columns.ts` takes `{ W, H, mask }`, which a
  `ColumnTerrain` already is.
- **Objects.** `columns.ts` places obstacles with `sim/model.ts`'s `objectTile` (the footprint's own flippable
  flag), as the heightfield model does, where the prototype flipped only Blockage and NaturalDam.
- **Emitters.** A source whose cell is inside terrain gets no column; keep its tiles (the map-edge walls still
  apply to it) with strength 0, as `proto/loadmap.ts` does.
- **The editor's canonical settle must stay in slices** (`SettleRun` style) so the page shows progress while cave
  water settles; the official maps with the most water took 7–17 s of CPU with the general loop.

## Log

- **2026-09-27.** Branch and worktree `C:\Users\krams\code\DamGoodMaps-3d` from `origin/dev` (c678e5b). Read
  the plans and the investigation. Wrote `sim/columns.ts`, `sim/stack.ts` and their test; the scratch parity run
  above. Stopped on D286 (3) before any existing module was changed.

# 3D terrain, step 1: foundations (progress log)

> **State (2026-09-27, `feature/terrain3d-a`, draft PR #71):** new modules only, beside the existing code (D286
> (3)); nothing existing imports them and no existing module is changed. Built on `build-xhigh` until Tuesday
> 2026-09-29 8:00 PDT, then on `build`.
> - **Done:**
>   1. **The fast path for one-column tiles** (`sim/stack.ts`, level 2; `sim/stackModel.ts` `openFieldModel`,
>      level 1). Bit for bit with the general loop in both modes on generated maps of all six themes, on all
>      22 official maps (one day from their own water and momentum) and in the tests; port mode stays
>      `WaterSim`'s bits. Cost: 1.03–1.3× `WaterSim`'s CPU on generated 128² maps (the general loop
>      1.25–1.95×), and 1.0–1.6× faster than the general loop on the official maps.
>   2. **The 3D pre-fill and the canonical settle in slices** (`sim/stackPrefill.ts`), with a progress share for
>      the page. On heightfields they give today's numbers bit for bit (the pre-fill; in port mode the settle's
>      ticks, depth, contamination and saturation; sealed basins included).
>   3. **Soil moisture and contamination per run** (`sim/soil3d.ts`), two modes. "port" gives `moisture.ts`'s and
>      `contamination.ts`'s numbers bit for bit on heightfields (18 generated maps, the test). "game" runs the
>      game's own per-tick soil rules to their fixed point: on the 19 official maps it has no moist/dry
>      disagreement with their stored soil and matches 99.79–100% of slots (layered slots 99.5–100%).
> - **Next:** 4. the multi-slot writer; 5. the support check (`terrain/support.ts`); 6. T1–T6 and the probe
>   group; 7. golden fixtures. See "Next" below.
> - **With the coordinator for Kyler:** (a) D295's acceptance line holds on 29 of 30 generated maps; Highlands
>   seed 3 has one tile outside it on a strict reading (see "Findings"). (b) Soil: today's heightfield model keeps
>   some land moist that the game keeps dry (114 of 36,453 plants on 18 generated maps stand on it); adopting
>   game-mode soil, like D293 for water, is Kyler's call at the wiring step. Until then nothing that runs today
>   changes: game mode (water and soil) stays off the heightfield path.

## Next

In this order, each a new module beside the existing code until the wiring step:

1. ~~**The fast path.**~~ Done (see the state above).
2. ~~**The 3D pre-fill and canonical settle.**~~ Done. `proto/prefill3d.ts`'s no-op `port` flag was dropped.
3. ~~**Moisture and contamination per run top.**~~ Done (see the state above and "Findings").
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

## Findings

- **Game-mode water on generated maps, against D295's line (2026-09-27).** D295 (Kyler): a tile may change
  between wet (deeper than 0.05) and dry only where its depth is within 0.01 of the wet line (0.04–0.06), and
  the map's water volume stays within 0.1%. At the canonical settle, game mode against today's heightfield
  water on 30 generated maps (six themes, seeds 1–5, 128²): 29 have no tile changing between wet and dry, and
  every volume moves by at most 0.058%. **Highlands seed 3** has 94 such tiles: a 5 cm sheet on flat ground at
  floor 3 (tiles about x 95–105, y 45–61) that today stands at 0.049, just under the wet line, and game mode's
  rules (mostly evaporation on a dry tile that receives water) spread differently. 93 of the 94 have both depths
  within 0.04–0.06; one, (105, 53), goes from 0.000 today to 0.0512. So the map passes the line if "its depth"
  is the new depth, and fails by that one tile if both depths must lie in the band (the volume moves 0.016%).
  Reproduce: `npx tsx tools/stack-band.ts --seeds 3-3 --themes highlands --list` (the whole sample:
  `npx tsx tools/stack-band.ts`, about 5 minutes). The same run checks that port mode equals today on every map
  (30 of 30).
- **Soil: today's heightfield model against the game's rules (2026-09-27).** On the 19 official maps' own water,
  today's `moisture.ts` matches their stored moisture on 87–99.8% of top slots (0.001), and `soil3d` in port mode
  as well or better (it adds the cave rules). The misses are three approximations in the heightfield modules: a
  contaminated wet tile spreads its value before its water's (1 − c) applies, so moisture leaks through a
  badwater stream (Hollows' cave floors beside badwater: stored 0, today's model up to 5.9); a diagonal step
  costs √2 where the game's costs 1.414; clean water's own 2·sat is scaled by (1 − c). `soil3d`'s game mode runs
  the game's own per-tick task (float32, its rates) from dry soil to its fixed point, and matches the stored
  soil on all 19 (no moist/dry disagreement; 99.79–100% of slots within 0.001, layered 99.5–100%, contamination
  99.94–100%). On 18 generated maps (six themes, seeds 1–3) game-mode soil turns 0–376 tiles a map from moist to
  dry, never the other way; 114 of the maps' 36,453 plants stand on such tiles, where the game would dry them.
  `builtin_09` (a test map outside the 19) stores unsettled soil and matches neither model.
- **The canonical settle on the official maps** (game mode, up to 6 days) reproduces their stored water as the
  investigation measured: IoU of wet columns 0.99 or more on 17 of 19 (13 at 1.000, Canyon 0.998, Pillars 0.998,
  Meander 0.991, HelixMountain 0.990), and Spillage 0.59 and Oasis 0.21, whose stored water comes from seeps and
  aquifers. One day from each map's own water keeps it (IoU 1.000, HelixMountain 0.999).
- **The fast path is exact by construction, with one guard.** On a fast column the general arithmetic reduces
  exactly (no overflow on an open column, so the pressure terms are +0 and the head difference is the surfaces');
  the comparisons against the ceiling 34 keep their sign only while surfaces stay below 33, so the fast path hands
  a column to the general loop above that (never reached: terrain tops out at 22).

## Design findings for whoever takes it over

- **The Python oracle.** D280 drops the Python copy of the stacked engine, and says heightfield water keeps its
  Python check exactly as today. Kyler's answer (D293, being recorded): one water model everywhere, the game's;
  when the engine is wired in, `prototype/watersim.py`'s heightfield sim gets the game's rule (evaporation on a
  dry tile that receives water; on generated maps the other four rules do nothing: no padding at floor 0, no
  NaturalDams, no drains) so the Python check keeps agreeing bit for bit. Until then heightfield water stays as
  it is.
- **M9a overlaps.** `feature/m9a` already has `src/core/terrain/runs.ts` (`ColumnTerrain`, a `Uint32` mask per
  tile, and format 3's `TerrainData`), format 3 in `doc/document.ts` and `doc/base.ts`, and it rewrites
  `sim/water.ts` (the D130 speedups: its direction loop written out). Build on M9a's `runs.ts` rather than a copy,
  and make `water.ts`'s game-mode changes after M9a has merged. `columns.ts` takes `{ W, H, mask }`, which a
  `ColumnTerrain` already is.
- **Level 1 at the wiring step.** An open field in port mode can run `WaterSim` on `openFieldModel`'s model today
  (the same bits); in game mode it needs `water.ts`'s game rules, which wait for the wiring step. Until then
  StackSim's fast path covers every tile of an open field at about the heightfield engine's cost.
- **Objects.** `columns.ts` places obstacles with `sim/model.ts`'s `objectTile` (the footprint's own flippable
  flag), as the heightfield model does, where the prototype flipped only Blockage and NaturalDam.
- **Emitters.** A source whose cell is inside terrain gets no column; keep its tiles (the map-edge walls still
  apply to it) with strength 0, as `proto/loadmap.ts` does. A 3×3 badwater source on uneven ground puts its
  strength into its tiles that have a column at its z (the game never places one there).
- **The editor's canonical settle must stay in slices** (`canonicalStackRun`) so the page shows progress while
  cave water settles; the official maps with the most water took 7–17 s of CPU with the general loop.

## Log

- **2026-09-27.** Branch and worktree `C:\Users\krams\code\DamGoodMaps-3d` from `origin/dev` (c678e5b). Read
  the plans and the investigation. Wrote `sim/columns.ts`, `sim/stack.ts` and their test; a scratch parity run on
  generated 128² maps (port mode 0 tiles differ from `WaterSim`; game mode 0 wet tiles differ on River Valley and
  Canyon seed 3). Stopped on D286 (3) before any existing module was changed.
- **2026-09-27 (build-xhigh).** Merged `origin/dev`; opened draft PR #71. Step 1, the fast path (commit db6c149):
  `StackSim`'s per-column fast path, `stackModel`, `openFieldModel`, `setMomentum`, an exact rewrite of the game
  mode's scale step; tests. Step 2, the 3D pre-fill and the settle in slices (35911f1). `tools/stack-band.ts` and
  the Highlands finding (ee1a77d), measured against D295's line since. Step 3, soil per run in two modes
  (ef1d758).

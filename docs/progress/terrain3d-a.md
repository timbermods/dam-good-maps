# 3D terrain, step 1: foundations (progress log)

> **State (2026-09-27, `feature/terrain3d-a`, draft PR #71):** new modules only, beside the existing code (D286
> (3)); nothing in `src/` that existed imports them and no existing `src/` module is changed. Built on
> `build-xhigh` until Tuesday 2026-09-29 8:00 PDT, then on `build`.
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
>      disagreement with their stored soil and matches 99.79–100% of slots (layered slots 99.5–100%). D298:
>      M9b takes `sim/columns.ts` and `sim/soil3d.ts` whole (at 62508d7d) and adopts game-mode soil; tell the
>      coordinator of any further change to either file.
>   4. **The multi-slot writer** (`format/stacked.ts`): today's singletons byte for byte on heightfields; a cave
>      map's water, pressure and soil slot by slot.
>   5. **The support rule** (`terrain/support.ts`): the 38 shapes as tests, equal to the rule's queue on random
>      terrain, nothing falls on the 22 official maps (with their stackables' tops); 0.2–28 ms at 256².
>   6. **T1–T6 and the Terrain 3D probe group** (`tools/probe-3d.ts` → `C:\dgm-probe\terrain3d\`,
>      `investigation/probe/runner/terrain3d.ts`, DGM Probe 0.3.0 with overflow and every run's soil). **Played:
>      run `terrain3d-20260927`** (see "The game's verdict" below): every measured check passes, the support
>      check once it reads the game's terrain after the load (its view refreshes on the first tick).
>   7. **Golden fixtures, verified** (`tools/stack-golden.ts`, `tests/golden/terrain3d.json`,
>      `tests/unit/stack-golden.test.ts`): the engine's results on T1–T6 and two cave maps of our own, hashed and
>      checked on every push (about 15 s, most of it T6 at 256²). Each T case records what run
>      `terrain3d-20260927` confirmed of it, keyed to the file it played and the case it verified.
> - **Next:** the wiring step on `build`, after the forces and M9b have merged into `dev` (D286 (3)): runs through
>   the core, the build and the validator, the engine wired in (see "Design findings").
> - **Decided since:** D295 and D297 (a tile may change between wet and dry only where its depth under the game's
>   rules is within 0.04–0.06, volume within 0.1%): all 30 sampled generated maps pass, Highlands seed 3
>   included. D298: game-mode soil is adopted in M9b. Until the wiring step nothing that runs today changes: game
>   mode (water and soil) stays off the heightfield path.

## Next

In this order, each a new module beside the existing code until the wiring step:

1. ~~**The fast path.**~~ Done (see the state above).
2. ~~**The 3D pre-fill and canonical settle.**~~ Done. `proto/prefill3d.ts`'s no-op `port` flag was dropped.
3. ~~**Moisture and contamination per run top.**~~ Done (see the state above and "Findings").
4. ~~**The multi-slot writer.**~~ Done.
5. ~~**The support check.**~~ Done. The validators keep today's check until the wiring step, which gates it on
   "any tile not one plain run from z = 0" (`allPlain`) rather than the floor count (INVENTORY bug 1).
6. ~~**T1–T6 and the probe group.**~~ Done and played (run `terrain3d-20260927`).
7. ~~**Golden fixtures.**~~ Done and verified. Regenerate with `npx tsx tools/stack-golden.ts` only when the engine is
   meant to change: a changed case loses its verification and needs the Terrain 3D batch again.

## The game's verdict: run terrain3d-20260927

Played 2026-09-27 by the milestone session, DGM Probe 0.3.0, with Kyler's installed mods (Harmony, Hungry Pathing,
MixedStorage, Mod Settings, Late Game Performance, Optimized Local Housing, Persistent Work Areas, The Tipsy Tail,
Timber Together), settings restored clean. Records: `C:\dgm-probe\results\terrain3d-20260927\` (`summary.md`,
`verdicts.json`), contact sheet `C:\dgm-probe\sheet\terrain3d-20260927.html`. 22 checks passed, 1 failed (below), 2 not
measurable (T2's walking and T5's pumps: the probe neither directs beavers nor builds), 6 screenshot sets recorded.

| Map | What agreed with our models |
|---|---|
| T1 support | The game deleted exactly the 24 voxels our rule deletes: its log names each one, its loading issue counts 24 (`TerrainPhysicsPostLoader.TerrainHasNoSupport`), and its terrain from the first records after the load is our rule's, tile for tile and run for run. |
| T2 walking | Loads with no issue; every voxel and run kept; 5 of 5 objects. Walking not measured. |
| T3 cave water | Water after 1, 3 and 3.18 days from the file's (the canonical settle's): 100% of 342 wet columns within 0.1 (the largest difference 0.002), wet IoU 1.000, the same 44 columns under pressure (overflow within 0.001), volume 724.5 → 724.6. Soil on all 4,194 runs as ours (largest difference 0.000). |
| T4 soil | Water after 0.5 and 1 day exactly the engine's (198 columns under pressure, roofs 1–3 thick over a full cave); soil on all 3,301 runs as ours, the roofs' 16, 10 and 4 included. |
| T5 plants | The 5 plants our clearance rule removes were removed on load (loading issues for 2 pines, 2 oaks, 1 birch); the other 10 loaded and lived 3 days; the district center placed on the start under its roof at z + 5, 9 adults and 4 children. |
| T6 heights | 256² to 22: loads with no issue, every voxel and all 2,526 objects kept; water after 0.5, 1 and 1.48 days: 100% of wet columns within 0.1 (the largest difference 0.034 at half a day), wet IoU 0.999–1.000, volume within 0.2%. |

**The one failure was the check, not the game.** T1's support check failed at the load record: 24 tiles still
showed the file's terrain there. The game deletes unsupported terrain while it loads the map
(`BlockAndTerrainBatchLoader` runs `TerrainPhysicsPostLoader.ValidateAll` as the entities are batch-loaded, and logs
each voxel), but the probe reads the terrain from the game's thread-safe column map
(`ThreadSafeColumnTerrainMap`), which copies the columns when it loads, before that pass, and refreshes them only on
each tick. So the probe's view shows the deletions from the first tick on. The check now decides on every record
after the load (the game's terrain must be our rule's), and at the load record accepts each tile as the file's
or ours, failing anything else. Re-run on this run's own records with `--compare-only` against a copy (so the run's
recorded verdicts stay as they were): T1's support check passes ("at the load: 24 tiles still show the file's
terrain …; after 0.48 days: 0 tiles differ from ours"), and every other verdict is unchanged. The runner's
self-tests cover both sides (a load record that is the file's passes; one that is neither fails).

## Findings

- **Game-mode water on generated maps, against the acceptance line (2026-09-27).** D295 and D297 (Kyler): a tile
  may change between wet (deeper than 0.05) and dry only where its depth under the game's rules is within 0.01 of
  the wet line (0.04–0.06), whatever it was before, and the map's water volume stays within 0.1%. At the
  canonical settle, game mode against today's heightfield water on 30 generated maps (six themes, seeds 1–5,
  128²): 29 have no tile changing between wet and dry, and every volume moves by at most 0.058%. **Highlands
  seed 3** has 94 such tiles: a 5 cm sheet on flat ground at floor 3 (tiles about x 95–105, y 45–61) that today
  stands at 0.049, just under the wet line, and game mode's rules (mostly evaporation on a dry tile that receives
  water) spread differently; every one lies within the line (0.0512 the deepest, from 0.000 today at (105, 53)),
  and the volume moves 0.016%. Reproduce: `npx tsx tools/stack-band.ts --seeds 3-3 --themes highlands --list`
  (the whole sample: `npx tsx tools/stack-band.ts`, about 5 minutes; it fails on any map outside the line, and
  on port mode differing from today, which it does on none of the 30).
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
  `builtin_09` (a test map outside the 19) stores unsettled soil and matches neither model. Game mode takes about
  90 ms at 256² (port mode 40 ms, today's modules 20 ms).
- **The canonical settle on the official maps** (game mode, up to 6 days) reproduces their stored water as the
  investigation measured: IoU of wet columns 0.99 or more on 17 of 19 (13 at 1.000, Canyon 0.998, Pillars 0.998,
  Meander 0.991, HelixMountain 0.990), and Spillage 0.59 and Oasis 0.21, whose stored water comes from seeps and
  aquifers. One day from each map's own water keeps it (IoU 1.000, HelixMountain 0.999).
- **The settle's cost at 256² (information).** The canonical settle in game mode costs 1.18× today's on generated
  256² maps (River Valley seed 1: 2.0 s against 1.7 s; Islands seed 1: 15.2 s against 12.8 s, the same ticks), on
  this machine under load. On the official cave maps the phases split between outflows, the per-column update and
  evaporation (Pressure 256²: about 10 ms a tick with 9,000 wet columns); big water is simply big.
- **The support rule on real maps.** With the objects' stackable tops (NaturalOverhangs hold the rock above them),
  nothing falls on any of the 22 official maps; without them Pillars would lose 2 voxels. The build's rule pass
  must pass the objects' stackable tops, as the validator's placement scan already gathers them.
- **The fast path is exact by construction, with one guard.** On a fast column the general arithmetic reduces
  exactly (no overflow on an open column, so the pressure terms are +0 and the head difference is the surfaces');
  the comparisons against the ceiling 34 keep their sign only while surfaces stay below 33, so the fast path hands
  a column to the general loop above that (never reached: terrain tops out at 22).

## Design findings for whoever takes it over

- **The Python oracle.** D280 drops the Python copy of the stacked engine, and says heightfield water keeps its
  Python check exactly as today. D293 (Kyler): one water model everywhere, the game's; when the engine is wired
  in, `prototype/watersim.py`'s heightfield sim gets the game's rule (evaporation on a dry tile that receives
  water; on generated maps the other four rules do nothing: no padding at floor 0, no NaturalDams, no drains) so
  the Python check keeps agreeing bit for bit. Until then heightfield water stays as it is.
- **M9a overlaps.** `feature/m9a` already has `src/core/terrain/runs.ts` (`ColumnTerrain`, a `Uint32` mask per
  tile, and format 3's `TerrainData`), format 3 in `doc/document.ts` and `doc/base.ts`, and it rewrites
  `sim/water.ts` (the D130 speedups: its direction loop written out). Build on M9a's `runs.ts` rather than a copy,
  and make `water.ts`'s game-mode changes after M9a has merged. `columns.ts`, `soil3d.ts` and `support.ts` take
  `{ W, H, mask }`, which a `ColumnTerrain` already is.
- **Level 1 at the wiring step.** An open field in port mode can run `WaterSim` on `openFieldModel`'s model today
  (the same bits); in game mode it needs `water.ts`'s game rules, which wait for the wiring step. Until then
  StackSim's fast path covers every tile of an open field at about the heightfield engine's cost.
- **Objects.** `columns.ts` places obstacles with `sim/model.ts`'s `objectTile` (the footprint's own flippable
  flag), as the heightfield model does, where the prototype flipped only Blockage and NaturalDam.
- **Emitters.** A source whose cell is inside terrain gets no column; keep its tiles (the map-edge walls still
  apply to it) with strength 0, as `proto/loadmap.ts` does. A 3×3 badwater source on uneven ground puts its
  strength into its tiles that have a column at its z (the game never places one there).
- **Soil on heightfields, port mode.** A heightfield tile's run owns the tile's one water column even when a
  Blockage raises the column's floor above the run's top, and that water counts from the run's top, as
  `moisture.ts` pairs them; the writer names the terrain's surface as such a token's floor, as today's writer
  does. Game mode follows the game (no own water under a Blockage).
- **The editor's canonical settle must stay in slices** (`canonicalStackRun`) so the page shows progress while
  cave water settles; the official maps with the most water took 7–17 s of CPU with the general loop (about twice
  that here under today's load).
- **The Probe's T maps** are written from the tool's own scenes; their expectations come from the files at
  compare time (`runner/terrain3d.ts`), so a change to the engine changes the verdicts, not the maps. A map
  change needs the tool run again (`--check` says whether the files on disk are current).

## Log

- **2026-09-27.** Branch and worktree `C:\Users\krams\code\DamGoodMaps-3d` from `origin/dev` (c678e5b). Read
  the plans and the investigation. Wrote `sim/columns.ts`, `sim/stack.ts` and their test; a scratch parity run on
  generated 128² maps (port mode 0 tiles differ from `WaterSim`; game mode 0 wet tiles differ on River Valley and
  Canyon seed 3). Stopped on D286 (3) before any existing module was changed.
- **2026-09-27 (build-xhigh).** Merged `origin/dev`; opened draft PR #71. Step 1, the fast path (commit db6c149):
  `StackSim`'s per-column fast path, `stackModel`, `openFieldModel`, `setMomentum`, an exact rewrite of the game
  mode's scale step; tests. Step 2, the 3D pre-fill and the settle in slices (35911f1). `tools/stack-band.ts` and
  the Highlands finding (ee1a77d), measured against D295's line, then D297's reading. Step 3, soil per run in two
  modes (ef1d758), then game mode about 1.6× faster with the same bits and its output pinned (62508d7), for M9b
  (D298). Step 4, the multi-slot writer (3a08eaa). Step 5, the support rule (713fa9f). Step 6, T1–T6, the Terrain
  3D group and DGM Probe 0.3.0 (a5a612e); the maps written to `C:\dgm-probe\terrain3d\`, the batch command sent
  to the coordinator. Step 7's fixtures and their CI test (4db3e2a), pending the batch. Merged `origin/dev`
  (b24fb6f: D293–D298 recorded).
- **2026-09-27, after run terrain3d-20260927.** The batch's verdicts recorded above. The support check reads the
  game's terrain after the load (the probe's view refreshes on the first tick), confirmed on the run's own records
  with `--compare-only` against a copy; the runner's self-tests extended. The golden fixtures gained T6 and a
  per-case verification by the run, keyed to the file played and the case verified.

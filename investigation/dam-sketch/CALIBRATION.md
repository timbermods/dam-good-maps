# Dedicated-machine Probe batch — written, never run here

`calibration.ts` is the original scene writer. `calibration-batch.json` binds six
16² recipes to exact engine predictions. Run `node local/calibration.cjs` to
regenerate `local/calibration/*-scene.json`, column-level predictions and
`probe-job-template.json`. No game files, blueprint data or game code are included.

Stage **finished real player buildings** at every prescribed x/y/z, bottom to top;
set every double floodgate to **1.50**, not its default. The stacked case is two
dams, not two levees. The bent case has five levees and five dams on foundations
at levels 1 and 2. The roofed case has an upper wall at level 4 and independent
water at level 1 under terrain roof layers 3–4. These are synthetic unit-scale
hydrology scenes, with no sources, pumping, colony demand or forecast weather.

Probe's current `JobMap.actions` only supports `deleteEntities`. It has **no wall
construction or prescribed water-state initialization action**. A dedicated-machine
construction/state bridge must stage these scenes and verify them before the job
template can be used. Do not pass an unmodified base map to the ordinary batch
runner: that would test no wall. Keep that bridge and game-derived scene files on
the dedicated machine; this round does not guess building save components.

The bridge's contract:

1. Start paused at day 1 + 4/24, with the exact authored voxels. Create and finish
   the listed real pieces and select the gate height. Preserve the roof topology.
2. Apply `postWallColumns` at the matching floors/ceilings, clear all momentum,
   exclude consumption, and record every initial column and object placement.
   Compare with the scene before any tick. A failed load/topology/state check
   blocks calibration; a game that deleted or changed a piece is a failure.
3. Use Probe schema 1's job template after replacing `mapFile` with the verified
   staged scene files. The ordinary launch/backup/consent workflow belongs to the
   other session, after Kyler authorizes that launch. Nothing here launches it.
4. Record all prescribed reservoir tiles every **8 ticks** (0.25 game hours), and
   the whole-map moments. Use `layered`/sample `columns` to count every roof column
   once; adding the top snapshot depth again double-counts it. If pressure overflow
   exists, extend the recorder to measure it; missing overflow is not a pass.

Measure absolute water surface **floor + depth**, reservoir volume on the fixed
fill-time mask, whole-map volume, and the first dry-out day on that mask. The mask
does not shrink as tiles dry. “Dry” means no depth/overflow remains, not the 0.05
pump/plant threshold. Empty masks have zero coverage; a 90-day censoring horizon
is a lower bound, not a dry-out date. Roof separation is also checked before the
lower chamber evaporates: the upper/lower columns and surface exposure must stay
distinct. Do not use the existing Probe cycle-model verdicts as sketch verdicts.

The engine's fill stop is often the six-day **unsettled cap**, not equilibrium.
Compare at the exact `filled.ticks` in each prediction. With no emitters, forced
drought and temperate forcing are identical; the dry-out clock starts at this
explicit observation boundary. The supplied 90-day horizon is a measurement
scenario, not a prediction of a player's calendar.

Pass tolerances are fixed in advance: each measured water surface within **0.01
level**, volume within **max(0.05 m³, 1%)**, dry-out within **8/768 day** (the sample
bracket). Apply them at fill, the recorded early roof checks and every daily
checkpoint. Record missing observations as **not measurable**, never passed.
`calibration-measurements.csv` starts with all six game verdicts **NOT RUN**. Exact
values, masks, counts, clock origin and tolerances are in the batch JSON; no
in-game fidelity or game-exact claim is established by this engine replay.

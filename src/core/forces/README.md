# forces

The forces of nature: the shared core and the five forces, Carve, Craterize, Erupt, Quake and Glaciate (D194, D202, D203, D206, D246). A force is a run that starts from the map as it stands and works on its own copy, a step at a time.

**Rules**
- Ten steps are one second of the force, whatever the frame rate. Nothing depends on wall time, frames or effects: the same input and the same number of steps give the same land (`force.ts`).
- The result is stored literally in one operation, `forceResult` (one undo step); a replay assigns it and never runs the force again. A project's `carve` operations, from before D220, become `forceResult` when it opens (`op.ts` `forceOfCarve`, `doc/document.ts`).
- A force leaves alone only the ground it is told to (`protectedGround`: the land above the layer showing, an imported map's caves); the editor carries the start (D257).
- A setting no row could give is refused with a one-line reason, the same when the force starts as in its operation (`settings.ts`).

**Start from**
- `force.ts`: `STEPS_PER_SECOND`, `ForceMap`, `protectedGround`. `op.ts`: the operation (`ForceResultParams`, `forceProblems`). `result.ts`: `literalOf` (what a force left), `forceParamsOf`. `settings.ts`: every force's settings and their ranges (`FORCE_SETTINGS`, `forceSettingsProblem`).
- `random.ts` (`hash`, `clamp`: the forces' shared numbers); the downhill guide is `land/drainage.ts` `drainage` (Barnes' priority flood).
- `runs.ts`: `Staged`, the planned-then-shown runs (`CraterRun`, `EruptRun`, `QuakeRun`; `glaciate/run.ts` `GlaciateRun`).
- `carve/run.ts` `CarveRun`; `carve/result.ts` (`carveForceParams`: the operation a carve becomes); `carve/course.ts`, `character.ts`, `oxbow.ts`, `water.ts`.

**Tests**: `tests/contract/carve.test.ts` (fixtures in `carveFixtures.ts`), `forces.test.ts`, `forceOps.test.ts`, `forceSettings.test.ts`, `glaciate.test.ts`, `carvesBeforeD220.test.ts` (a project saved with `carve` operations opens exactly), and `tests/unit/forceDriver.test.ts`. `tools/carve-equiv.ts` checks Carve against its prototype in `investigation/carve`.

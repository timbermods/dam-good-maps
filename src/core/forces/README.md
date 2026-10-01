# forces

The forces of nature: the shared core, and Carve (D194, D202, D203, D206). A force is a run that starts from the map as it stands and works on its own copy, a step at a time.

**Rules**
- Ten steps are one second of the force, whatever the frame rate. Nothing depends on wall time, frames or effects: the same input and the same number of steps give the same land (`force.ts`).
- The result is stored literally in the operation (one operation, one undo step); a replay assigns it and never runs the force again.
- A force leaves the start and other protected objects alone (`protectedGround`).
- On `dev` this folder holds the shared core and Carve. The other forces arrive with `feature/forces`.

**Start from**
- `force.ts`: `STEPS_PER_SECOND`, `protectedGround`, `forceResult`.
- `drainage.ts` `drainage`: the downhill guide (Barnes' priority flood).
- `carve/run.ts` `CarveRun`; `carve/op.ts` (the stored operation); `carve/result.ts` (`carveParams`: the editor's worker and Claude's steps make the same operation); `carve/course.ts`, `character.ts`, `oxbow.ts`, `water.ts`.

**Tests**: `tests/contract/carve.test.ts` (fixtures in `carveFixtures.ts`) and `tests/unit/carveDriver.test.ts`. `tools/carve-equiv.ts` checks the port against its prototype in `investigation/carve`. Run `npx vitest run tests/contract/carve.test.ts`.

# worker

The page's web workers: the generator and the editor's open map run here, off the main thread (PLAN §2.2,
EDITOR_PLAN §8). The worker holds state, paces work and talks to the page; what an edit does and what a check
says are the core's (D342).

**Rules**
- Messages stay small: after an edit the page gets the session's news (`SessionInfo`) and only the parts of the
  map view that changed, as typed arrays it takes over; never the document itself.
- The worker keeps the state (the open `MapSession`, its version, the last check, the force at work, Try another's
  series), the timing (the live water's slices and frames, a weather run's pace, background checks in slices, a
  force's steps) and the undo mechanics around a force (D341). Ids for new objects and features come from here
  (`crypto.randomUUID()`); the core's planners take them as parameters.
- The editing decisions are plain core functions on the session's map: `core/doc/` (`remove.ts` `planRemove`,
  `placing.ts` `planPlant`, `planEntity`, `withSpringPools`, `strokes.ts`, `tools.ts` `planStart`, `start.ts`
  `applySelection`, `describeTile.ts` `entitiesAtTile`, `checkItems.ts` the checks as the editor lists them) and
  `core/forces/` (`start.ts` `planForce`, `keep.ts` `keptForceParams`). New editing logic goes there, not here.

**Start from**
- `generator.worker.ts`: the messages the page sends (Comlink), each a call into `api.ts` or `session.ts`, the
  big arrays transferred.
- `api.ts`: a generation (`runGenerate`), D329's background search (`runFindVersion`) and the page's view of a
  built map (`responseOf`; the map card's facts are `core/validate/facts.ts` `mapFacts`).
- `session.ts`: the editor's open map: opening, edits, undo, the live water (D133, D197), weather runs
  (`core/sim/weather.ts` `HazardRun`), the instant and background checks, export, the forces' runs.
- `checks.worker.ts`: the checks' own worker, a replica of the open map that follows the editor's log (`follow`,
  `replicaCheck`).

**Tests**: `tests/contract/` drives `session.ts` directly in Node (editor, shelf, parity, live-water, the force
tests); `tests/e2e/` drives the page's workers. Run `npx vitest run tests/contract/editor.test.ts`.

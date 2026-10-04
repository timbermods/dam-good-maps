# doc

The map document and its edit engine: a generation plus an ordered log of edit operations, with undo and redo, incremental rebuilds, export, and the project file (`.damgoodmaps.json`, gzip-compressed).

**Rules**
- A saved document rebuilds to the same map, byte for byte, even after the generator changes (PLAN §19.7). The base map is stored and never mutated.
- A project carries the map as it was saved (`stored.ts`, D367): it opens from it without rebuilding. On reopen the log is replayed once (the checks worker's replica, or `checkReplay`) and compared with the stored map byte for byte: the same, and undo below the save point works as normal; different, and undo stops at the save point, never an approximate replay (D455); an undo that would cross the save point before the comparison is in does it first. A project saved while its water was pending, or by another version, opens by rebuilding.
- Operations are small and serialisable, and are checked against their schema and the current map. An invalid one is rejected, never clamped silently.
- Old saved strokes and operations replay exactly (D158). Changing an operation's meaning breaks saved projects.
- Headless: it runs in the page's worker and in Node.

**Start from**
- `session.ts` `MapSession`: `apply`, undo and redo, export. Edits never replay onto new land (D336): no regeneration under a document's edits.
- `ops.ts`: the operation envelope `{op, params}`; the schema is `ops.schema.json`.
- `document.ts`: `toDocument`, `importDocument`, `encodeProject`, `DOCUMENT_FORMAT_VERSION`.
- `stored.ts`: the stored map (`storeBuilt`, `restoreBuilt`, `sameMap`).
- The editor's edits as plain questions on the session's map, each returning the operations and label (or why not) for
  the worker to apply (D342): `placing.ts` (an object or a source from the shelf, `planEntity`; moving one; trees and
  bushes painted, `planPlant`; a group of edits' spring pools, `withSpringPools`), `remove.ts` `planRemove` (Remove and
  Clear everything), `strokes.ts` (a stroke with Clear sources, `planStrokeClearing`; a new ramped Flatten refused,
  `newRampedStroke`), `tools.ts` (moving, turning or placing the start, `planStart`; what reshaped ground does to the
  objects on it; features' plain names), `describeTile.ts` (what is on a tile: `describeTileOf`, `entitiesAtTile`).
- `checkItems.ts`: the checks as the editor lists them: `checkItem` (every one-click fix a check has, the start's moves
  among them), `instantChecks` (the load and design checks after an edit, those in its region marked), `groupChecks`
  (the export dialog's groups, an import's own problems apart, D43).
- `base.ts` (the stored base map), `bake.ts` (old drawn landforms become plain terrain, D182).
- `start.ts`: the start's helpers the forces, Select, the shelf and the checks' fixes share (`startProblem`, `moveStartNear`,
  `startClears`, `startCarry`, `startMiddle`), and Select's step with its start carry (`applySelection`).
- `waterFix.ts` `waterFix`: the operations that would fix the start's water checks after edits (a spring by the start,
  D330), as one step; its places are `water/springSites.ts` `springCandidates`, the generator's rule too. Only its test calls
  it today (the page's fix waits on #92).
- `waterEdits.ts`: Remove unfed water and Fill (D387, D394), the questions (`unfedWater`, `planFill`) and the operations they build.

**Tests**: `tests/contract/` (document, ops, bake, import, projects, storedMap, views, sourcesUnderEdits, editor, waterEdits; properties is heavy). Old project files live in `tests/fixtures/projects/`. Run `npx vitest run tests/contract/ops.test.ts`.

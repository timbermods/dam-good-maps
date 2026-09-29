# terrain

Terrain as solid runs per tile, the game's own form: each tile's solid intervals from bottom to top. A plain heightfield tile is one run; caves, overhangs and tunnels have more (D119).

**Rules**
- The project file stores the surface per tile plus the runs of every tile that is not plain (project format 3), so a heightfield map stays small.

**Start from**: `runs.ts` `runsOfColumn`, `columnOfRuns`, `plainRuns`, `terrainData`. `doc/base.ts` uses it for the stored base.

**Tests**: none of its own; the document and import tests exercise it (`tests/contract/document.test.ts`, `tests/contract/import.test.ts`). Run `npx vitest run tests/contract/document.test.ts`.

# terrain

Terrain as solid runs per tile, the game's own form: each tile's solid intervals from bottom to top. A plain heightfield tile is one run; caves, overhangs and tunnels have more (D119).

**Rules**
- The project file stores the surface per tile plus the runs of every tile that is not plain (project format 3), so a heightfield map stays small.
- In memory the mask is the terrain and the surface is derived from it (D119), never the other way round.
- The tools shape the surface only until terrain above terrain's step 3: a tile that is not plain is kept exactly.

**Start from**: `runs.ts` `ColumnTerrain` (the terrain in memory: a voxel mask per tile, with `heights()`, `runs(i)`, `voxels()` and `toData()` derived from it; `fromHeights`, `fromVoxels`, `fromData` make one; `withSurface` is a build's terrain: its new surface with the base's caves and overhangs kept). `terrainData` and `terrainColumns` are format 3's terrain for the generator's field. `doc/base.ts` holds a stored base's terrain as one, the build's base layer (`features/build.ts` `BaseLayer.terrain`) reads it, and `doc/session.ts` `terrain` is the map's terrain as it stands, which export writes.

**Tests**: `tests/contract/terrainRuns.test.ts`; the document and import tests exercise it through the base (`tests/contract/document.test.ts`, `tests/contract/import.test.ts`). Run `npx vitest run tests/contract/terrainRuns.test.ts`.

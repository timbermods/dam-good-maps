# terrain

Terrain as solid runs per tile, the game's own form: each tile's solid intervals from bottom to top. A plain heightfield tile is one run; caves, overhangs and tunnels have more (D119).

**Rules**
- The project file stores the surface per tile plus the runs of every tile that is not plain (project format 3), so a heightfield map stays small.
- In memory the mask is the terrain and the surface is derived from it (D119), never the other way round.
- The tools shape the surface only until terrain above terrain's step 3: a tile that is not plain is kept exactly.

**Start from**: `runs.ts` `ColumnTerrain` (the terrain in memory: a voxel mask per tile, with `heights()`, `runs(i)`, `voxels()` and `toData()` derived from it; `fromHeights`, `fromVoxels`, `fromData` make one; `withSurface` is a build's terrain: its new surface with the base's caves and overhangs kept). `terrainData` and `terrainColumns` are format 3's terrain for the generator's field. `doc/base.ts` holds a stored base's terrain as one, the build's base layer (`features/build.ts` `BaseLayer.terrain`) reads it, and `doc/session.ts` `terrain` is the map's terrain as it stands, which export writes.

`support.ts` `unsupportedVoxels` is the game's support rule (what the game deletes on load: nothing hangs more than 3 sideways from supported ground), used by the Unstable Core's blast and the probe's test maps; the checks have it in Rust.

`floors.ts` `floorGraph` is where beavers can stand and what they reach on foot (D122): a floor is air on solid ground at any level of a tile, floors join at the same level, and levels are joined only by the map's slopes; no headroom rule. It runs in Rust (`rust/checks/src/floors.rs`); the checks' `walk.levels` row reads the same graph.

`clearance.ts` `plantsWithoutRoom` is the room a plant needs above its floor (its blocks' height); the checks' `plants.clearance` row has the rule in Rust, from the same table.

**Tests**: `tests/contract/terrainRuns.test.ts`; `tests/contract/floorRows.test.ts` (the floor graph and the plants' room); the document and import tests exercise it through the base (`tests/contract/document.test.ts`, `tests/contract/import.test.ts`). Run `npx vitest run tests/contract/terrainRuns.test.ts`.

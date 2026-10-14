# 3D, step 2: the view (progress)

Terrain above terrain's second step (D280 (2), D126; the spec is ROADMAP.md, "Terrain above terrain" → "2. The view"),
built from `investigation/3d-view` (D365, with Kyler's notes at its approval in its INTEGRATION.md) and the Erode
investigation's mesher (`investigation/erode/core/mesher.ts`) as the proposal. Each part is its own PR into `dev`.

## Part 1: one mesher for runs with undersides (built, `feature/3d-view-mesher`)

- **What:** `src/render3d/mesh.ts` `meshChunk` meshes every tile as a column mask (bit z: voxel z solid, the
  `ColumnTerrain` form): every run's top, and the map's floor (level 0) under a column with air at its bottom; every
  underside not on the floor, facing down; on each side every span solid here and air at the neighbour. Tops and
  undersides merge greedily per level (tile by tile in reading order, along x then y); walls merge along the edge
  with the next tile's identical span. Same interface (`TerrainSource` → `MeshData`), same chunks and dirty-chunk
  rule, both looks (High swaps materials only). The separate voxel path for cave columns is gone.
- **Why not Erode's mesher as it is:** its walls merge in 2D per plane, which changes a heightfield's quads. Keeping
  today's wall strips (one quad from the neighbour's height to the tile's, merged along the edge) gives the
  heightfield's exact mesh, so nothing changes on maps without caves, and the remesh stays as cheap.
- **Equivalence:** `tests/unit/meshEquivalence.test.ts` builds the old mesher (kept as
  `tests/fixtures/heightfieldMesher.ts`) and the new one on seven generated maps (all six themes and Any, 96², 128²
  and 256², mine sites' pits included) and compares positions, normals and indices byte for byte, chunk by chunk:
  identical, same order. On hand-made terrains (an overhang, a cave, a bridge, a floating run, a column with air at
  its bottom, random caves across chunk edges) every exposed voxel face is drawn exactly once, none between solid
  voxels, every quad winding outward and undersides facing down.
- **Official maps** (the 20 with columns that are not plain, checked once by hand, not committed): every voxel
  face the old mesher drew is drawn by the new one, no face twice; the only additions are the map's floor under
  columns with air at level 0 (2,292 tiles on Pillars, 4,226 on Pressure, a few elsewhere), where the old voxel
  path left a hole a plain tile of height 0 never had. Quads fall by up to half (Hollows 38,067 → 16,998; Pressure
  50,419 → 25,388).
- **Remesh, measured once (Node, this machine):** a brush of radius 6 dragged across a chunk edge on a 256² River
  Valley map, the dirty chunks of one dab (1.4 on average): median 0.31 ms before, 0.13 ms after (p95 0.65 → 0.28).
  On official cave maps the same stroke: 0.8–2.3 ms before, 0.2–0.7 ms after.
- **Captures:** `docs/sheets/3d-view-mesher.jpg` (Canyon 128 seed 7 and Hollows, Standard and High, before and
  after, real Chrome on the RTX 2070 SUPER, 1920×1080, dark): the same picture; the pixel differences are the moving
  water and quad edges on merged faces.

## The rest of the step (next parts)

Each reads the same column masks the mesher reads. The seams:

1. **The masks from the worker.** Today the renderer gets heights plus a 23-byte column per tile that is not plain
   (`MapView.columns`) and the mesher derives a chunk's masks from them (`columnMask`). The worker could send
   `ColumnTerrain`'s masks (one `Uint32` per tile) instead; that is a change to `src/worker/session.ts`'s view
   messages (the milestone's and the renderer's contract) and makes `columnMask` a lookup.
2. **Light in 3D** (sky light and sun visibility): today `light.ts` bakes per tile from the heights, so a cave's
   ceiling and floor take the light of the tile's top. Adopt Erode's `lightVolume` (sky walked through air, sun rays
   marched; 2 bytes a cell, about 3 MB at 256²) as a 3D texture the terrain shaders sample half a cell along the
   face's normal, with 3d-view's 0.30 ambient floor; relight only the edited box plus the shadow's reach.
   Typed shader hooks in `materials.ts` (no string substitutions), both looks.
3. **Soil and the Map look per run top:** the tile data texture holds one top per tile; a run texture (3d-view's,
   about 6 MB at 256²) gives each run top its own soil, moisture and contamination (`sim/soil3d.ts` already computes
   them per run).
4. **Water per column:** `waterMesh.ts` already draws lower water columns (`lowerByTile`); seat each slot on its own
   floor and cap it at its ceiling, from the stacked engine's slots, with cave attenuation on its light.
5. **3D picking and selections:** `pick.ts` picks against the heightfield; pick against the masks (a ray through the
   voxels, the face hit and its run), then the Select tool in 3D.
6. **The level-slice cutaway:** today a uniform cuts the world above a level in the shader. 3d-view's rule (D207):
   mesh the clipped mask with caps only where solid rock crosses the cut, lighting from the unsliced terrain.
7. **Kyler's notes at approval:** the stone pattern stretching on ceilings and at corners; cave interiors and deep
   water under roofs tuned on real maps; objects, slopes, falls and moving water inside caves.

## Design note

- The map's floor is drawn at level 0 under every column with air at its bottom, as under a plain tile of height 0.
  The old voxel path drew nothing there (a hole to the sky below the map). Default: keep the floor.

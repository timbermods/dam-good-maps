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

## Part 2: light in 3D (built, `feature/3d-view-light`)

- **What:** `src/render3d/caveLight.ts`, Erode's light volume (`lightVolume`) on the mesher's column masks: two
  bytes a cell, W × H × 24 levels, a 3D texture (`caveTex`, RG, filtered). R the sky: 255 in open air (at or above
  its column's top), 229 in roofed air beside open air or the map's edge and 26 less per step through roofed air,
  never below 64; 0 in rock. G the sun: a ray marched toward the sun from every roofed cell and every open cell
  beside one, 255 or 0. The terrain shader (`materials.ts` `caveAt`, both looks) reads the cell half a cell along
  the face's normal: where that cell is roofed air, the face takes `caveLightOf` (the filtered sky with a 0.30
  floor, and the sun); anywhere else (open air, rock under the slice's cut, outside the map) the baked light of
  `light.ts` stands, untouched. One typed hook, `ShaderHooks.caveSun`: High multiplies the volume's sun by its own
  soft shadow of the real meshes. Water and objects under roofs are not lit by it yet (part 4, and item 7).
- **Equivalence:** a map with no column that is not plain builds no volume (`caveSize` 0: the shader returns before
  reading it). `tests/unit/caveLight.test.ts` builds the volume anyway on seven generated maps (all six themes and
  Any, 96², 128², 256²), meshes every chunk and samples every quad's middle and four inner points through
  `caveSample` (the shader's steps in TypeScript): not one point takes the volume's light, so the baked light is
  used exactly. Frames, before (dev) and after, real Chrome on the RTX 2070 SUPER, the water held at one moment:
  Canyon 128 seed 7, Standard and High, the whole map and a cliff, 1920×1080: 22–109 pixels differ by at most 2
  levels, all on the moving water's surface (located by a diff mask); the terrain is pixel-identical.
- **On cave maps** (official imports): cave floors, walls and ceilings take their own air's light: bright at the
  mouth, dimmer inward to the 0.30 floor, sun where a ray reaches them; floors no longer take the fixed light of
  the overhang's shade, nor walls their top's sky. Seen from above, only the undersides and floors visible along
  hollowed cliffs change (0.4–1.7% of the frame).
- **Relight:** after a change of heights only the changed tiles' cells are reset, the sky walk is redone within 8
  tiles of them (seeded from the unchanged lit air just outside), and the sun only for cells whose ray can cross
  them (within 15 tiles down-sun); the same bytes as building it again (the test, 60 random dabs among random
  caves). The box goes to the GPU by itself (`rowUploads.ts` `BoxUploads`, `texSubImage3D`), not the whole texture.
  Measured once in Node on this machine, the light work of a dab of radius 6 at 256² (sky, tile data, shadows, and
  now the volume), dabs placed on cave tiles: official cave maps 0.52–0.59 ms median before, 0.58–0.72 ms after
  (Hollows-like `builtin_18` at 192²: 0.55 → 1.0 ms); a generated map: no change (no volume). Building the volume
  when a map opens: 1–70 ms on the official maps.
- **Memory:** 2 bytes a cell × 24 levels: 3.0 MB at 256², 12.6 MB at 512² (in memory and on the GPU), only on maps
  with air under a roof.
- **Captures:** `docs/sheets/3d-view-light.jpg`.

## The rest of the step (next parts)

Each reads the same column masks the mesher reads. The seams:

1. **The masks from the worker.** Today the renderer gets heights plus a 23-byte column per tile that is not plain
   (`MapView.columns`) and the mesher derives a chunk's masks from them (`columnMask`). The worker could send
   `ColumnTerrain`'s masks (one `Uint32` per tile) instead; that is a change to `src/worker/session.ts`'s view
   messages (the milestone's and the renderer's contract) and makes `columnMask` a lookup.
2. **Light in 3D:** done (part 2, above). The volume reads `columnMask` too, so item 1 makes its build a lookup.
3. **Soil and the Map look per run top:** the tile data texture holds one top per tile; a run texture (3d-view's,
   about 6 MB at 256²) gives each run top its own soil, moisture and contamination (`sim/soil3d.ts` already computes
   them per run).
4. **Water per column:** `waterMesh.ts` already draws lower water columns (`lowerByTile`); seat each slot on its own
   floor and cap it at its ceiling, from the stacked engine's slots, with cave attenuation on its light (the water shader reads
   `caveTex` as the terrain's does; today water under a roof keeps the open sky's light).
5. **3D picking and selections:** `pick.ts` picks against the heightfield; pick against the masks (a ray through the
   voxels, the face hit and its run), then the Select tool in 3D.
6. **The level-slice cutaway:** today a uniform cuts the world above a level in the shader. 3d-view's rule (D207):
   mesh the clipped mask with caps only where solid rock crosses the cut, lighting from the unsliced terrain.
7. **Kyler's notes at approval:** the stone pattern stretching on ceilings and at corners; cave interiors and deep
   water under roofs tuned on real maps; objects, slopes, falls and moving water inside caves.

## Design note

- The map's floor is drawn at level 0 under every column with air at its bottom, as under a plain tile of height 0.
  The old voxel path drew nothing there (a hole to the sky below the map). Default: keep the floor.

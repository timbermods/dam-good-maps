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
  bytes a cell, W × H × 24 levels, a 3D texture (`caveTex`, RG, filtered). R the sky: roofed air (below its
  column's top, not rock) walks it in from its openings: beside an open cell, that cell's sky (an open cell beside
  roofed air holds the sky the baked light would give ground at its height, 0.55 + 0.45 × the sky visibility: on
  the ground the tile's own, over a drop the sky seen from that height, `light.ts` `skyAt`); beside the map's edge
  229; then 26 less per step, never below 64; 0 in rock. G the sun: a ray marched toward the sun from
  every roofed cell and every open cell beside one, 255 or 0. The terrain shader (`materials.ts` `caveAt`, both
  looks) reads the cell half a cell along the face's normal: where that cell is roofed air, the face takes
  `caveLightOf`; anywhere else (open air, rock under the slice's cut, outside the map) the baked light of
  `light.ts` stands. `caveLightOf` carries the light on from the open ground at the roof line the air opens by
  (`caveMouth`, walked toward the brightest neighbour, the open side nearest the face; over a drop, at the cave's
  own level): the sky never below 0.30, with the look's occlusion as at that line (`ShaderHooks.caveSky`: High's
  ambient field, never more than at the point); the sun the open ground's at the line, fading over 0.6 of a tile
  to the cave's own and never above the line's (`caveSun`: Standard marches the ray through the voxels, under
  overhangs too, until rock or the map's highest ground, then the baked shadow; High uses its soft shadow of the
  real meshes; `caveSunOpen`: each look's sun at the line). Open ground casts no contact shadow toward a mouth (the
  roof above is not a wall at its level), and a cave floor takes the open ground's contact shadow from the rock
  beside it at its own level (`wallAt`), so the line holds beside a mouth's side walls too. Water and objects under
  roofs are not lit by it yet (part 4, and item 7).
- **Equivalence:** a map with no column that is not plain builds no volume (`caveSize` 0: the shader returns before
  reading it). `tests/unit/caveLight.test.ts` builds the volume anyway on seven generated maps (all six themes and
  Any, 96², 128², 256²), meshes every chunk and samples every quad's middle and four inner points through
  `caveSample` (the shader's steps in TypeScript): not one point takes the volume's light, so the baked light is
  used exactly. Frames, before (dev) and after, real Chrome on the RTX 2070 SUPER, the water held at one moment:
  Canyon 128 seed 7, Standard and High, the whole map and a cliff, 1920×1080: 22–109 pixels differ by at most 2
  levels, all on the moving water's surface (located by a diff mask); the terrain is pixel-identical.
- **On cave maps** (official imports): cave floors, walls and ceilings take their own air's light: bright at the
  mouth, dimmer inward to the 0.30 floor, sun where a ray reaches them; floors no longer take the fixed light of
  the overhang's shade, nor walls their top's sky. The light never steps at the roof line and does not rise
  going in from it: measured once on the 28 mouths of the #400 review (builtin_14 and builtin_18), a flat grey on
  every face, sunlit and shaded: the step across ±0.05 tile is at most 4 levels in 54 of the 56 look-mouths (both
  others High, 8 and 10, at tall overhangs whose open ground outside is itself uneven), and where the light rises inward it is a second
  opening the cave is lit by (an overhang open along its side, a second mouth). Sun reaches in as far as the
  geometry lets it, in both looks. Seen from above, only hollowed
  cliffs and the open ground at mouths change (0.6–2.1% of the frame).
- **Relight:** after a change of heights only the changed tiles' cells are reset, the sky is redone within 14
  tiles of them (their tiles' sky visibility reaches 5, the walk 8; seeded from the unchanged lit air just outside), and the sun only for cells whose ray can cross
  them (within 15 tiles down-sun); the same bytes as building it again (the test, 60 random dabs among random
  caves). The box goes to the GPU by itself (`rowUploads.ts` `BoxUploads`, `texSubImage3D`), not the whole texture.
  Measured once in Node on this machine, the light work of a dab of radius 6 at 256² (sky, tile data, shadows, and
  now the volume), dabs placed on cave tiles: official cave maps at 256² 0.51–0.55 ms median before, 0.59–0.79 ms after
  (`builtin_18`, 192², the most caves: 0.55 → 1.2 ms); a generated map: no change (no volume). Building the volume
  when a map opens: up to about 0.25 s on the official maps (once, with the map).
- **Memory:** 2 bytes a cell × 24 levels: 3.0 MB at 256², 12.6 MB at 512² (in memory and on the GPU), only on maps
  with air under a roof.
- **Captures:** `docs/sheets/3d-view-light.jpg`.

## Part 5: 3D picking and selections (built, `feature/3d-view-picking`)

- **What:** `src/render3d/pick.ts` `pickTerrain` walks the voxels of the column masks (`mesh.ts` `columnMask`, the
  masks the mesher draws) with a 3D DDA and lands on the first solid voxel's face. A `TileHit` now also says its
  `face` (`top`, `bottom` or `side`, with `side` the way a wall faces), its `run` (`bottom` and `top`: the solid
  run of the column the face belongs to; the map's floor under air at the bottom is the empty run at level 0) and
  its `level` (the run's top). So Select and the hover highlight aim at what the player sees: a cave's floor
  through its mouth, a ledge under an overhang, a run's underside, never a face behind a wall. Every other tool (the
  brushes, forces, shelf, start and sources) picks the tile's top exactly as the heightfield picker did
  (`pickEditing`: the same ray walk over plain columns, heights clamped by the cut) until step 3 (D484): through a cave's
  mouth they get the tile in front, where the pointer is, since their stroke changes that tile's top. A tool says
  `voxel: true` to be given the ground seen (only Select does).
  Under a layer cut the walk lands on the cut (voxels at or above it are air); the per-pick copy of every height
  that cut used to make is gone. `pickHeightfield` stays as the reference (and for the investigations).
- **Equivalence** (`tests/unit/pickTerrain.test.ts`): on seven generated maps (all themes, 96² to 128²) over a grid
  of camera angles and screen points, straight-down rays and low rays across the map, with and without a layer
  cut, every pick gives the heightfield picker's tile, height, face, `t` and point (a few thousand rays a map). The
  one difference: a ray that reaches the map's floor over a tile of height 0 exactly at the bottom of the box,
  which the old picker sometimes lost to rounding, now lands on the floor. On hand-made overhangs, caves, a bridge
  and a floating run, 6,000 rays each (from above, the side, or inside a void) are checked against every exposed
  face intersected one by one: the first face along the ray, never one behind a wall.
- **Official maps** (the three with the most cave columns, 192² and 256², checked once by hand, not committed): ~290
  rays each aimed at cave tiles, checked against every exposed face intersected one by one: none differ.
- **Pick time (Node, this machine, measured once, information):** 256² River Delta, 4,000 camera rays: 7.3 µs the
  heightfield picker, 9.5 µs the voxel walk; with a 100 × 100 block of cave columns under the rays, 115 µs (the
  mask is rebuilt from its 23 bytes at each cell; a mask array from the worker, seam 1 above, would make it a lookup).
- **Captures:** `docs/sheets/3d-view-picking.jpg` (official map with caves, a cave floor through its mouth and a
  ledge under an overhang; dev against this branch; Standard and High; 1920×1080 dark and 1280×800 light; real
  Chrome on the RTX 2070 SUPER): dev's hover highlight and drag land on the wall or roof in front, this branch's (Select) on the floor. The editing
  tools' cursors are not in the sheet: they stay where dev's are.
  The selection's tint still covers the whole tile (roof, walls and floor), since the overlay is per tile.
- **The Select tool in 3D:** a selection is still a set of tiles (`Selection`, a mask). What a run adds:
  Ctrl+click takes the level of the ground hit (a cave's floor, not the roof's height) as the Level number, and the
  Wand takes the ground joined to the click at that level, a run's top under an overhang too (`levelTiles`, the
  view's `hasTop`). The Alt+click layer pick cuts at the level hit. A run is not named in the selection or the
  operations yet; the brushes and Select's actions still work on the heightfield's top until step 3 (D280 (3)) moves
  them onto runs. Proposed when they do: the selection keeps its tile mask and gains an optional level per tile
  (`Selection.levels`), set from the hit's `level`.
- **What is drawn where the pointer aims (D484):** the hovered tile lights only the top of the run seen (`hover.w` in
  the terrain shader), and the Select tool's ring lies on the top of the run nearest the hit's level in a column with
  terrain above terrain (`groundNear`, `aimedHeights`). The editing tools (brushes and forces) aim at the tile's top,
  as on dev, until step 3: their cursor, ring and band are drawn where the stroke will actually change the ground, since
  a cursor on a cave floor whose stroke would raise the roof breaks what you see is what you get. Everywhere else, as before.
- **Under a layer cut:** the pick treats voxels at or above the cut as air and the cut as a top, and the Wand's
  `hasTop` applies the same cut (`hasTopAt`: a plain tile counts as min(height, cut)), so a click on the cut plateau
  takes the whole flat the cut shows. With caves the shader still flattens a roof run into a lid at the cut, while the
  pick lands on the floor under the drawn lid; part 6 (the cutaway) resolves it.

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
5. **3D picking and selections (built, part 5 above):** `pick.ts` picks against the masks (a ray through the
   voxels, the face hit and its run) and the Select tool reads the run hit.
6. **The level-slice cutaway:** today a uniform cuts the world above a level in the shader. 3d-view's rule (D207):
   mesh the clipped mask with caps only where solid rock crosses the cut, lighting from the unsliced terrain.
7. **Kyler's notes at approval:** the stone pattern stretching on ceilings and at corners; cave interiors and deep
   water under roofs tuned on real maps; objects, slopes, falls and moving water inside caves.
8. **Standard's open ground before a cave:** its baked shadow (`light.ts`) treats every column as solid to its top,
   so ground the sun reaches under an overhang (High and a ray through the voxels have it lit) is shaded, and a
   cave floor beside it carries that shade in about half a tile before its own march lights it (Hollows (47,59,7)
   south, Pressure (238,161,6)). Marching the open ground through the volume only near caves would move the step
   to that ring's edge; the fix is a baked shadow from the voxels themselves on maps with caves.

## Design note

- The map's floor is drawn at level 0 under every column with air at its bottom, as under a plain tile of height 0.
  The old voxel path drew nothing there (a hole to the sky below the map). Default: keep the floor.

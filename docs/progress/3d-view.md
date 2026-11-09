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
  bytes a cell, W × H × 24 levels, a 3D texture (`caveTex`, RG, filtered). Since D497 ("The game's light" below) it
  holds only what a roof changes in the game's light, the sun: R 255 in air, 0 in rock; G the sun, a ray marched toward
  the sun from every roofed cell and every open cell beside one, 255 or 0. The terrain shader (`materials.ts`
  `caveAt`, both looks) reads the cell half a cell along the face's normal: where that cell is roofed air, the face
  takes `caveLightOf`; anywhere else (open air, rock under the slice's cut, outside the map) the baked shadow of
  `light.ts` stands. `caveLightOf` lights the face as open ground's are lit, the game's ambient by its normal, with the
  sun the open ground's at the roof line (`caveMouth`, the open side nearest the face; over a drop, at the cave's own
  level), fading over 0.6 of a tile to the cave's own and never above the line's (`caveSun`: Standard marches the ray
  through the voxels, under overhangs too, until rock or the map's highest ground, then the baked shadow; High uses
  its soft shadow of the real meshes; `caveSunOpen`: each look's sun at the line). Objects and falls under roofs take
  the open air's sky and the sun where it reaches (items 7 and 8 below), and water under roofs (part 4).
- **Equivalence:** a map with no column that is not plain builds no volume (`caveSize` 0: the shader returns before
  reading it). `tests/unit/caveLight.test.ts` builds the volume anyway on seven generated maps (all six themes and
  Any, 96², 128², 256²), meshes every chunk and samples every quad's middle and four inner points through
  `caveSample` (the shader's steps in TypeScript): not one point takes the volume's light, so the baked light is
  used exactly. Frames, before (dev) and after, real Chrome on the RTX 2070 SUPER, the water held at one moment:
  Canyon 128 seed 7, Standard and High, the whole map and a cliff, 1920×1080: 22–109 pixels differ by at most 2
  levels, all on the moving water's surface (located by a diff mask); the terrain is pixel-identical.
- **On cave maps** (official imports): cave floors, walls and ceilings take their own air's sun (and, until D497, a sky
  dimmer inward to the cave's least), sun where a ray reaches them; floors no longer take the fixed light of
  the overhang's shade, nor walls their top's sky. The light never steps at the roof line and does not rise
  going in from it: measured once on the 28 mouths of the #400 review (builtin_14 and builtin_18), a flat grey on
  every face, sunlit and shaded: the step across ±0.05 tile is at most 4 levels in 54 of the 56 look-mouths (both
  others High, 8 and 10, at tall overhangs whose open ground outside is itself uneven), and where the light rises inward it is a second
  opening the cave is lit by (an overhang open along its side, a second mouth). Sun reaches in as far as the
  geometry lets it, in both looks. Seen from above, only hollowed
  cliffs and the open ground at mouths change (0.6–2.1% of the frame).
- **Relight:** after a change of heights only the changed tiles' cells are reset, and the sun redone for the cells
  beside them and those whose ray can cross them (within 15 tiles down-sun); the same bytes as building it again (the
  tests: 60 random dabs among random caves, and 40 blocks dug or filled in a tunnel network, mouths opened and closed,
  new roofs made). A column that comes to hold roofed air after the map opens (a Block dig, an Erode cave) joins the
  tiles the sun is marched in. The box goes to the GPU by itself (`rowUploads.ts` `BoxUploads`, `texSubImage3D`), not the whole texture.
  Measured once in Node on this machine, the light work of a dab of radius 6 at 256² (sky, tile data, shadows, and
  now the volume), dabs placed on cave tiles: official cave maps at 256² 0.51–0.55 ms median before, 0.59–0.79 ms after
  (`builtin_18`, 192², the most caves: 0.55 → 1.2 ms); a generated map: no change (no volume). Building the volume
  when a map opens: up to about 0.25 s on the official maps (once, with the map).
- **Memory:** 2 bytes a cell × 24 levels: 3.0 MB at 256², 12.6 MB at 512² (in memory and on the GPU), only on maps
  with air under a roof.
- **Captures:** `docs/sheets/3d-view-light.jpg`.

## Part 3: soil per run top (built, `feature/3d-view-soil-runs`)

- **What:** every run top below its tile's top (a cave's floor, a ledge under an overhang, the map's floor under
  air) takes its own run's moisture, contamination and the water standing on it, not its roof's. The worker sends
  the soil per run top with the view's soil (`SoilView.runs`: tile, level and the two soil bytes of every run top
  below a top, `runSoilView`), the file's own per run as the export keeps it (`MapSession.storedSoilRuns`, read
  once a base); on the official cave maps that is soil3d's value on the file's water for every run top. The
  renderer writes it into a run texture (`src/render3d/runSoil.ts`, `RunSoil`): two bytes a cell, W × H × 23
  levels, R the soil as the tile data's G, G a run top here (1) or one under water (2). The terrain shader's floor
  branch (`vWorld.y < h0 − 0.5`) reads its own tile and level (`runAt`) and blends toward the ground at the same
  level round it (a run top in the texture, or a tile whose top is at that level), as a top blends toward
  neighbours of its height. Where no run top is (a cap at a layer cut) the floor keeps the top's soil, as before,
  so the cutaway's caps keep their look. Walls and undersides are unchanged. The Map look by height already
  colours a floor by its own level (`heightColor(vWorld.y)`): unchanged. A soil without runs (the page's soil
  growing toward the worker's) keeps the last runs drawn. The hover readout names the tile's top only, not a
  level, so it has nothing to agree with.
- **The contract change** (`src/worker/session.ts`, the view messages): `SoilView` gains an optional `runs`
  (four typed arrays, in `viewBuffers`), set by `soilOf` and `underRoofs` (`withRuns`) on a map with columns that
  are not plain; absent everywhere else. Nothing else in the messages changes. The list is worked out once for the
  columns and the base (1.1 ms on Hollows, 1.9 ms on Pressure) and each send takes a copy of it.
- **A fix on the way:** a tile's top on a column with air at its bottom read the slot below its top run
  (`ColumnTerrain.runCount` counts solid runs; the game's runs start with an empty one there). The view's soil of
  those tops now reads the right slot: 3,355 tops on Pressure, 2,238 on Pillars, 94 on Nomads, 58 on Hollows, a
  few elsewhere.
- **Equivalence:** a map without terrain above terrain has no `runs`, so no texture is built or bound and the
  terrain's `RUN_SOIL` define is not there at all (the program is the one before this part;
  `tests/contract/runSoil.test.ts` on seven generated maps, all six themes and Any). Frames before
  (`feature/3d-view-cutaway`) and after, real Chrome on the RTX 2070 SUPER, Canyon 128 seed 7, Standard and High,
  the whole map and a cliff, 1920×1080, the water held at one moment: 5–120 pixels differ, all on the river's
  moving surface, as many as two runs of the same build differ by (93–123); the terrain is pixel-identical.
- **On cave maps:** `runSoil.test.ts` opens a hand-made cave with water in it (clean and badwater) through the
  worker and checks every run top: a tile's top in the tile data, every run below it in the run texture at its
  own level (`runSoilAt`, the shader's rule), equal to soil3d's value for that run, with its water, unedited and
  after an edit off the cave and one on its roof; a tunnel at the very bottom (a column with air at its bottom)
  checks the top slot's fix. On Hollows and Pressure (local only) the same for every run top: Hollows 5,024 floors below a
  top (2,124 moist, 1,263 contaminated, 984 under water), 3,142 unlike their roof's; Pressure 7,854 (2,895,
  3,371, 5,278), 5,077 unlike their roof's.
- **Refresh:** a water update reads only the water on the run tiles (the run tops' cells, tiles and soil bytes
  are kept from the last soil, and the same soil sent again is recognised), rewrites the cells that changed and
  sends their box up (`refresh` gives it, `BoxUploads` uploads it). Measured once in Node (information): a water
  update 0.42 ms on Hollows, 0.63 ms on Pressure; the same soil again 0.04 ms; a dab does no run-soil work
  (strokes shape the top run only). Building the texture with the map: 7–9 ms.
- **Memory:** 2 bytes × 23 levels a tile: 1.7 MB at 192², 3.0 MB at 256², 12 MB at 512² (in memory and on the
  GPU), only on maps with run tops below a top.
- **Captures:** `docs/sheets/3d-view-soil-runs.jpg` (Hollows cut at 4 over its underground river, Pressure cut at
  3 over its badwater floors; before and after; Standard and High; 1920×1080 dark and 1280×800 light): before,
  the river's banks under the roof are dry earth and Pressure's soaked floors clean; after, grass along the river
  and veins on the soaked floors.
- **Falls short:** CI's browser test checks the branch compiles and draws (`cutaway.spec.ts`, the light look's
  program too), not its colours. (Objects on run tops read their run's soil since "Objects on their run top's soil".)

## Part 4: water per column (built, `feature/3d-view-water-columns`)

- **What:** `src/render3d/waterLayers.ts`. The water view already carries every wet column of a tile, each on its own
  floor (the stacked settle's slots, `waterFromStack`, or the file's own); its depth never passes its ceiling (checked
  on the official maps: Pressure holds 4,610 columns full to their ceiling, none above it). Before, the mesher drew each
  tile's highest wet column as the tile's water and every other column as a bare top: a cave's pool under a dry roof
  (970 of Hollows' 984 cave columns, 4,687 of Pressure's 5,278) took its shores, curtains and falls from the tiles' tops,
  so the lake on a roof poured a fall down through the rock into the cave under the next tile. Now every column is
  drawn the same way, seeing at each tile round it one air gap of that tile's column: the gap holding its surface (a
  hair under it, never above its ceiling); where rock stands there, the lowest gap above it still under its ceiling;
  else a wall (`WALL`, a shore). On a plain tile that is its top, so a map without terrain above terrain sees exactly what
  the heightfield mesher saw. The mesher reads per-tile arrays, so the columns are dealt into layers (`waterLayers`):
  the open sky's first (each tile's top and the water on it, the renderer's surface water itself on a map with no
  water under a roof), then each other column into the first layer whose gaps agree with what it sees within
  `LAYER_REACH` (5 tiles: a top's corners and curtains, the badwater blend round them and a fall's hand-over; checked
  against a reach of 12, the same quads on every map). `meshWaterChunk(W, H, layers, cx, cy)` draws each layer's own tiles;
  `plainLayers(heights, sw)` is the one layer of a map without caves. A fall is a column's own curtain down to the
  water below (D201 amended 2026-10-29).
- **Where it runs:** only where a column needs a layer of its own (`needsLayers`: water under a roof, or open water
  beside a roof that sees under it). A map with an arch or an overhang and no such water draws its water as a
  heightfield's, its moving water meshed in the workers as on dev. With layers, a new water view (a journey's frame, a
  stroke's water, the settled water) remeshes only the chunks within `LAYER_REACH` of the tiles whose columns changed
  (`changedColumnChunks`: a column's mesh reads nothing further), and those are dealt and meshed in the water mesh
  workers on the view itself (`waterMesh.worker.ts`; the columns go with a version, their gaps kept with them), never on
  the page's thread; the page deals them only without workers. A stroke's land meshes the chunks round it on the layers
  dealt for the water on show (their view of the land's plain tiles following the new tops, `followLand`), or sends them
  to the workers, under a new version so the workers' last batch never stands for them, when the water has changed since. The open sky's columns
  ride the land as a heightfield's water does (`rideLand`, now on maps with water under a roof too: a cave's water,
  whose floor is not the tile's top, stays), and the layers follow (`rideLayers`). No column is drawn above its ceiling,
  even when a view holds more (`surfaceOn`); the journey's easing pairs each column with the earlier one on its own
  floor (`src/editor/waterPlayer.ts` `blendWater`), so a cave's pool never eases from the lake on its roof, and an earlier
  column nothing eases from fades out, its tile still wet or not.
- **Light:** the water shader reads the light volume at the air just inside the water, as objects and falls under a
  roof do (`materials.ts`, `CAVES` on the water's materials of both looks): all the sky at a mouth, the cave's least deep
  in, the sun the open air's at a mouth fading to the volume's going in. High's water under a roof takes its own
  column's badwater share, not the share of the water seen from above there.
- **No contract change:** the worker's water view (`src/worker/session.ts`) is as it was; the renderer works out each
  column's ceiling from the columns it already has. (Part 4b makes its outflows each column's own.)
- **Equivalence:** `tests/unit/waterLayers.test.ts` keeps the mesher as it was (`tests/fixtures/heightfieldWaterMesher.ts`)
  and meshes seven generated maps (all six themes and Any, 96², 128² and 256², falls included) both ways, and through
  the per-column path forced (every tile given as a column of one plain run): positions, depth and badwater, foam
  flags, normals, indices and falls byte for byte, chunk by chunk. Frames before (dev) and after, real Chrome on the RTX
  2070 SUPER, Canyon 128 seed 7, Standard and High, the whole map and a cliff, 1920×1080, the water held: 26–105 pixels
  differ, as many as two runs of the same build differ by (18–94), all on the water; the terrain is pixel-identical.
- **On cave maps:** the same test on a hand-made map (a cave with a pool running out through its mouth to a pool
  outside, a ledge whose water falls into it, a chamber full to its ceiling, a lake on the roof, water under an arch at
  the map's floor) and on Hollows, Pressure, Pillars and Nomads (local only): every column's top drawn once, at its own
  floor plus depth, under its ceiling; no quad and no fall through rock (points just off every face, a fall's arc).
  Dev drew 30 of Hollows' 118 falls through rock (its badwater on a roof pouring into the river's cave), 369 of
  Pressure's 430 (between full caves of different ceilings) and 2 of its curtains; now none of 88 and 61. Layers:
  Hollows 7, Pressure 9, Pillars 8, Nomads 4.
- **Speed (measured once, information):** the page's thread's water work in each frame of the water after an edit,
  real Chrome (the water updates and the frame's drawing of meshes): Hollows, a lowered riverbed, dev 32 ms median,
  81 ms the most (every chunk meshed on the page) → 1.2–1.5 ms median, 11–12 ms at the 90th percentile, 31–36 ms the
  most (the first update after the edit); Pressure, its one update after the settle, 90 → 13–32 ms. The workers are
  sent the map's columns only when their version changed. Dealing the layers in a worker: Hollows about 11 ms,
  Pressure 24 ms. A generated map draws as on dev (the same path). Memory: about 22 bytes a tile for each layer past
  the first, on maps with water under a roof (5 MB on Hollows, 12 MB on Pressure), in each worker that deals them.
- **Captures:** `docs/sheets/3d-view-water-columns.jpg` (Hollows: its river's cave through a mouth, and cut at 6 over the
  river where dev's falls from the roof came through; Pressure: a badwater tunnel's mouth, and cut at 2 over its
  tunnels; before and after, Standard and High, 1920×1080 dark, and the cuts at 1280×800 light).
- **Falls short:** (water sliced by the cut: built, "Water sliced by the cut" below). (Water under a wet roof flowing as its
  roof's, and a cave column's falls estimating their flow: built, part 4b.) `tests/e2e/cutaway.spec.ts` compiles and draws the water's branch on a
  hand-made cave with a pool and a puddle on its roof in CI.

## Part 4b: water under water flows by its own column (built, `feature/3d-view-cave-current`)

- **The outflows, each column its own** (the worker's view, `WaterView.outflow`, the same field, four a column): an
  unedited import's are the file's per column (`ColumnOutflows` at each column's own slot: `storedColumnOutflows` in
  `world.ts`, `MapSession.storedColumnOutflows`), no longer each tile's surface water's copied to every column under it;
  an edited map with caves now has them at all (dev sent none, so its water was still): the stacked settle's
  (`StackSettle.flows`, `stackWater.ts` `columnFlows`: the engine's momentum per pair of columns, summed by its way, the
  quantity the heightfield's `WaterSim.out` is), gathered from each strip's own rows on the multi-core settle
  (`stackParallel.ts`; on one thread and on four the same bytes, every fixture of `tools/rust/stack-identity.ts`, which
  now compares them), and carried by `settledAgain` on the tiles an edit left (`stackSettleAgain*.test.ts` compare them
  with a settle from cold). A view has every column's own outflows or none (a weather day under caves: the stacked
  engine's water in flight has none). On a map without terrain above terrain nothing changes: one column a tile, the
  same values. The estimate `waterLayers` made for a cave column's outflows is gone; its falls pour its own.
- **The current under water** (`src/render3d/caveCurrent.ts`): where a column stands below its tile's surface water,
  the bake worker deals the water into its layers (`waterLayers`), works out each such layer's flow from its own
  columns' outflows (`bake.ts` `bakeFlow`, the flow texture's own, over the tiles within 8 of those columns), and writes
  it into a volume by level (RGBA a cell, only the levels such columns stand in: RG the flow as the flow texture packs
  it, B its smoothed contamination, A 255 in their cells; each tile's surface water fills its cells too with the flow
  texture's own values, so a river reads one current across the line where its roof turns dry). The water shader (both looks, `materials.ts` `ownFlowAt`, under `CAVES`)
  reads the cell it stands in (`texelFetch`), and where A says so takes the volume's current, filtered across tiles at
  its level, for the flow-carried surface (both looks); everywhere else the flow texture,
  as before. `motion.ts` keeps the texture (`caveFlowTex`, `caveFlowLevels`), rewritten in place; renderer.ts only
  hands it the water per column at a bake.
- **Equivalence:** a map with no column below its tile's surface water builds no volume (`caveCurrent` null), and the
  shader's new lines are all under `CAVES`, so a map without terrain above terrain compiles the same program; the
  water's outflows there are the same numbers. `tests/unit/waterLayers.test.ts` (generated maps meshed through the
  heightfield mesher and the per-column path, byte for byte; the official maps, local) and the outflow tests
  (`current.test.ts`, `outflows.test.ts`, `fallOutflow.test.ts`) pass unchanged.
- **On caves** (`tests/contract/caveCurrent.test.ts`): a tunnel flowing east under a trench on the hill's top flowing
  west. As an import with its water stored: every column's outflows are its own; the bake's flow texture moves the
  trench west, the volume moves the tunnel east at its own level; the tunnel's fall at its step pours its column's 0.4,
  not an estimate. Edited (sources at each head, the stacked settle): the view's outflows are the settle's per column,
  the tunnel's east, the trench's west, and the current as drawn follows.
- **Official maps** (local, measured once): Hollows has 14 tiles of water under water (its river under the badwater on
  its roof at 66,124): dev moved all 14 with the roof's current, 13 of them against the river's own; Pressure has 8
  (5 moving, now by their own); Pillars and Nomads none (no volume). Real Chrome on the RTX 2070 SUPER, both looks, no
  shader error. The bake's extra work where there is water under water: dealing the layers once more, in the bake
  worker (Hollows about 16 ms in Node, Pressure 25–160 ms on a loaded machine); none elsewhere. Memory: 4 bytes a cell
  over the levels such water stands in (one level on Hollows and Pressure: 0.1 and 0.3 MB).
- **Captures:** `docs/sheets/3d-view-cave-current.jpg` (Hollows cut at 5 over the river in its cave, dev against this
  branch, Standard and High, 1920×1080 dark; the arrows an overlay of the current each tile's surface moves by).
- **Falls short:** the foam threads, wakes and seams and the Flow view's streaks are the surface water's only (motion
  shapes): water under water has none. A weather day under caves has no outflows (its water is still, as before). The
  export still writes a map with caves' outflows as "0" (3D Foundations, `3d-foundations.md`: the game rebuilds the flow from
  rest); the settle now has them per column, should a later stage write them.

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
  mask was rebuilt from its 23 bytes at each cell; a lookup since item 1, below).
- **Captures:** `docs/sheets/3d-view-picking.jpg` (official map with caves, a cave floor through its mouth and a
  ledge under an overhang; dev against this branch; Standard and High; 1920×1080 dark and 1280×800 light; real
  Chrome on the RTX 2070 SUPER): dev's hover highlight and drag land on the wall or roof in front, this branch's (Select) on the floor. The editing
  tools' cursors are not in the sheet: they stay where dev's are.
  The selection's tint then still covered the whole tile (roof, walls and floor), since the overlay is per tile; it
  is now drawn on the run it names (below).
- **The Select tool in 3D:** a selection is still a set of tiles (`Selection`, a mask). What a run adds:
  Ctrl+click takes the level of the ground hit (a cave's floor, not the roof's height) as the Level number, and the
  Wand takes the ground joined to the click at that level, a run's top under an overhang too (`levelTiles`, the
  view's `hasTop`). The Alt+click layer pick cuts at the level hit. A run is not named in the selection or the
  operations yet; the brushes and Select's actions still work on the heightfield's top until step 3 (D280 (3)) moves
  them onto runs.
- **A selection is drawn on the ground it names** (`fix/selection-at-level`): the Wand on land keeps the tile mask
  (the operations' input, unchanged) and names the level it took in each tile (`Selection.levels`, level + 1 a tile;
  null for every other selection: Rectangle, Circle, Freehand, Brush, the Wand on water, Whole map). Added tiles take
  their own level or none; tiles taken out lose theirs. The page hands the levels to the renderer
  (`setOverlayRuns(levels, LOCKED)`), which finds in each column with terrain above terrain the run holding that
  level (`overlayRuns.ts` `runHolding`: the run topped at it, or one a layer cut at it caps; its bottom and the
  underside above it) and writes them to a per-tile texture. The terrain shader (`overlayOnRun`, compiled only under
  `CUTAWAY`) draws the tile's overlay on that run's top and walls, and the water's (only under `CAVES`) on the water
  over it; the rest of the column (the roof over a cave, its walls and underside) takes the land outside's dimming.
  A plain column, and every plain map, draws exactly as before (same program). The columns changing (an edit) finds
  the runs again. Test: `tests/unit/overlayRuns.test.ts`. Captures: `docs/sheets/selection-at-level.jpg` (Hollows,
  a Wand click on the cave floor at (46, 139), level 3, 149 tiles; from the mouth, from above and under a cut at 5;
  Standard and High; 1920×1080 dark and 1280×800 light; real Chrome; dev against this branch): dev's yellow strips
  up the cliff and round the roof's top are gone, the outline lies on the floor. Until step 3, Up 1,
  Down 1, Flatten, Cut down, Fill up and Delete → Ground are refused on a cave column with one line
  (`src/core/doc/ops.ts`: "has a cave or overhang: shape its top with a brush"), so nothing acts on the roof while
  the floor is drawn selected; hovering those actions tints nothing and says the core's reason, and the roof over a floor selected by level is outside the brushes' working area (`renderer.overlayBelowTop`), as it is drawn. Other overlay layers on a level-named tile (a drawing preview, a problem mark) show only on its run.
- **What is drawn where the pointer aims (D484):** the hovered tile lights only the top of the run seen (`hover.w` in
  the terrain shader), and the Select tool's ring lies on the top of the run nearest the hit's level in a column with
  terrain above terrain (`groundNear`, `aimedHeights`). The editing tools (brushes and forces) aim at the tile's top,
  as on dev, until step 3: their cursor, ring and band are drawn where the stroke will actually change the ground, since
  a cursor on a cave floor whose stroke would raise the roof breaks what you see is what you get. Everywhere else, as before.
  On a wall below a tile's top (a cliff's face, a cave's mouth seen from low down: the editing pick lands on the wall of
  the tile whose top the stroke changes) the brush and its stroke lie where the ray meets that wall, following the
  level plane of that point (`brushes.ts` `aimAt`); they once lay where the ray crossed the tile's top level, in front of
  the wall toward the camera, tiles from the pointer, a target's plane then a pale veil across the view
  (`tests/e2e/brushOnWall.spec.ts`; before and after in `docs/sheets/caves-brush-camera.jpg`). Over water, the water's
  surface is taken only where the ray meets it before the ground (`pickSurface`): a roof over a cave's water keeps its
  own hit, where a force's cursor and the zoom once went to the water's level beyond it, under the rock.
- **Under a layer cut:** the pick treats voxels at or above the cut as air and the cut as a top, and the Wand's
  `hasTop` applies the same cut (`hasTopAt`: a plain tile counts as min(height, cut)), so a click on the cut plateau
  takes the whole flat the cut shows. With caves the drawing now agrees (part 6).

## Part 6: the level-slice cutaway (built, `feature/3d-view-cutaway`)

- **What:** under a layer cut every voxel at or above the cut is gone (D207): through the cut the player sees down
  into caves and under overhangs (the cave's floor, its walls up to the cut, the undersides still below it), and a
  cap is drawn at the cut only where solid rock crosses it, in the lid's hatched look. `src/render3d/cutaway.ts`.
  The terrain's vertex shader already folds everything above the cut down onto it, which is exactly the clipped
  column for a plain column (its walls stop at the cut, its top lies on it); a column with terrain above terrain
  got a lid over its cave (the roof run's top and underside folded down). The fragment shader now drops a
  horizontal face at the cut wherever the voxel just below the cut is air under a roof (read from the light
  volume, which is not sliced), and hatches only a face at the cut whose voxel at the cut is rock (`cutFace`:
  "gone", "cap" or "top"), so a cave's floor under the cut is ground, not a lid. Nothing is remeshed when the
  level changes: the level control stays one uniform. The light is the unsliced terrain's (the volume and the High
  look's shadow map are never sliced): a cave sliced open keeps its own dim light, a cap the baked light the lid
  had. Picking, the hover, the Wand's `hasTopAt` and Select's ring already used the clipped masks (part 5) and now
  match what is drawn. The branch is compiled only on a map with terrain above terrain (`CUTAWAY`, set by the
  renderer's `setCutaway` from `cutawayOn`); every other map draws with the same program as before.
- **Equivalence** (`tests/unit/cutaway.test.ts`): what is drawn is worked out as the GPU does it (the mesher's quads
  folded onto the cut, less the faces `cutFace` drops) and compared unit face by unit face with the exposed faces
  of the clipped columns. On seven generated maps (all six themes and Any, 96² and 128²) at four cuts each: the
  same surface, the cutaway's branch off, and the hatch the same tiles as before. On hand-made terrains (an
  overhang, a cave, a bridge, a floating run, random caves across chunk edges) at every cut 0–14: the same surface;
  1,500 rays at each of six cuts land on the first drawn face (the same face and `t` as `pickTerrain`), a top hit lies at
  its level (the hover), and `hasTopAt` and `groundNear` name only drawn tops. Frames before (dev) and after, real
  Chrome on the RTX 2070 SUPER, Canyon 128 seed 7 at cuts 15, 8 and 3, Standard and High, 1920×1080, the water held
  at one moment: 0–32 pixels differ by at most 2 levels, all on the water's surface; the terrain is pixel-identical.
- **Official maps** (the 20 with columns that are not plain, checked once by hand, not committed): at every cut
  from 0 to the map's top, the drawn surface is the clipped columns' exactly. The lids opened, summed over the
  cuts: Hollows 25,443 tiles, Pressure 16,891, Pillars 13,452, Nomads 5,075, the rest 36–2,177.
- **A level step (measured once, real Chrome, the step and one frame drawn to the GPU's end; information):**
  generated 256² Delta 4.7 ms median Standard, 4.0 ms High; Hollows (192²) 5.9 and 6.4 ms; Pressure (256²) 4.1
  and 5.8 ms. No remesh at any cut.
- **Captures:** `docs/sheets/3d-view-cutaway.jpg` (Hollows at cuts 8 and 5, Pressure at 6 and 3, dev against this
  branch, Standard and High, 1920×1080 dark, and Hollows at 8 at 1280×800 light): dev's hatched lid over the
  river's cave and over Pressure's tunnels, here the caves open with their water, walls and floors in their own
  light.
- **Ground at the cut, and the cap that reads (`fix/cut-level-ground`):** a top lying exactly at the cut under water
  (a pond's shelf, Canyon 128 seed 7's at 7) was drawn near-black: the cut takes away the water standing above it, and
  the shelf kept the bed's colour meant to be seen through water, in its gorge's shade. The terrain now counts a top as
  under water only where the water's surface is drawn (`soilOf`: the surface the tile data's water byte gives at or
  below the cut's 0.05, as the water's shader cuts it), so ground whose water the cut took away is a top like any other,
  with or without caves on the map; without a cut nothing changes. Water deeper than three levels (a dammed
  reservoir, an imported map's) has the water byte in whole levels (`light.ts` `waterByte`: 178 + K, its surface at most
  K + 0.05 over the top and more than K − 0.95), so whether the cut takes its surface away is known exactly however
  deep it is; the byte was linear to 4.23 levels and saturated, so a deeper bed under a cut drew dark with no water
  over it (`fix/cut-deep-water`). The cap (where solid rock crosses the cut) was a
  grey-brown close to the stone tops, its hatch blurring flat at editing distance: it is now a cool slate darker than
  the tops round it (`palette.ts` `CUT_CAP`), drawn over the ground's own colour (no veins through it) and lit by the
  unsliced top's light, softened, with diagonal stripes three a tile close up; farther out every other stripe fades
  as they close in, so they stay about seven pixels apart and never blur to flat. The overlays go on it as on any top.
  `tests/e2e/cutaway.spec.ts`: a pond's shelf cut at its level, and ground at 2 under a reservoir six levels deep cut
  at 7, draw as the same ground dry (each failed before its fix by 38 levels). Captures: `docs/sheets/cut-level-ground.jpg` (dev against the branch, Canyon's shelf and Hollows at cut 7,
  Standard and High, 1920×1080 dark and 1280×800 light).
- **Falls short:** objects and the drought line are cut as before: what stands above the cut is not drawn. Water whose
  surface stands above the cut and whose floor lies below it is drawn sliced at the cut, its bed a bed under it (built,
  "Water sliced by the cut" below). `tests/e2e/cutaway.spec.ts` compiles and draws the branch on a hand-made cave in CI.

## The camera keeps out of the rock (`fix/caves-brush-camera`)

- **What:** the orbit camera sits on an arm from the point it looks at; where the arm's end would be inside solid
  ground (a cliff behind a low camera, the rock round a cave), it is drawn in along the arm to the nearest place in the
  air toward that point (`cameraClamp.ts` `armReach`, read by `placeCamera`); close to a point under a roof (a cave's
  floor, a tunnel, under an arch; within 24 tiles, `CAVE_NEAR`) it stays in that point's air, drawn in to where the arm
  first meets rock, so turning round in a cave never puts the camera outside behind its wall. The eye keeps 0.8 of a
  tile from rock, more than the near plane's corners reach; where nothing on the arm has that room (a narrow tunnel),
  0.25 or 0.12, with the near plane brought in to match (`nearFor`). Only drawn: the view's distance is kept, so the
  camera springs back out once the rock no longer holds it. A zoom in starts from where the camera is drawn and stops
  short of the ground under the pointer (`framing.ts` `zoomStep`, `zoomStopShort`, 1.6 tiles), so a zoom into a mouth
  ends in its air; a zoom out starts from the view's own distance, so it carries the camera out of the rock that held it
  as far as on dev. Under a layer cut, the rock left is what counts.
- **The same where nothing holds it:** where the eye is clear (and, under a roof, the arm too), the camera is exactly
  where its view puts it: a map without terrain above terrain is drawn as before wherever the camera stayed above the
  ground. Cost: a ball test of up to 27 voxels; a short walk along the arm only under a roof or while the rock holds
  the camera; worked out once per view and terrain (every change to the terrain is a new source), so a frame and its
  picks share it.
- **Tests:** `cameraClamp.test.ts` on hand-made terrain (a cave, an arch, a pillar, an overhang, a tunnel two tiles
  wide): the eye is never in a solid voxel nor nearer one than its least room after random orbits, pans and zooms
  (composed as `zoom` composes them); a zoom toward the cave's mouth ends in its air; orbited inside, the camera stays
  in the cave and the tunnel, its near plane inside its room; where the eye is clear and the target not under a roof,
  the camera is where its view puts it (a rough heightfield and the cave world, 3,000 views each); zoomed out while the
  rock holds it (in the cave, and a low camera with a canyon's cliff behind it), it goes as far out as on dev and comes
  out of the rock; on a generated
  canyon (96², seed 7), looking flat (tilt 0.18 to 0.35) at the foot of steep walls and orbited, panned and zoomed, the
  eye stays above the ground under it by the room it keeps (`setView` clamps only the tilt; the clamp holds the eye's
  height on every map, not only out of cave rock).
- **Captures:** `docs/sheets/caves-brush-camera.jpg` (dev against this branch, real Chrome, High: Raise hovered in a
  Hollows mouth at 1280×800 light; turned inside a Pressure arch after a zoom, and a low orbit beside a Hollows cliff,
  at 1920×1080 dark: dev draws both from inside the rock).
- **Falls short:** being drawn in and springing back out each happen in one frame: a camera held in by rock springs
  back at once when its place leaves the rock on the far side (tilted up through a thin roof, turned past a wall's end;
  a low orbit by a plain cliff can jump many tiles in one small turn). Easing it would draw the rock in between, so it
  is not eased. Looking
  at a point on a tunnel's floor, turned low toward a wall two tiles off, the arm has no room at all, and the camera
  keeps its place outside, beyond the wall.

## Items 7 and 8: caves that read (built, `feature/3d-view-caves-read`)

Kyler's notes at the approval of `investigation/3d-view` (item 7, the terrain side; moving water waits for item 4) and
Standard's shadow before a cave (item 8).
- **The stone on ceilings:** a run's underside (a cave's ceiling, an overhang's roof seen from below) was a flat mortar
  colour. It is now the walls' cobbled stone laid on the level plane, its stones along x and its courses along y, at
  the walls' scale (`materials.ts`, the wall branch with `ceiling`), so it keeps its scale and orientation on ceilings,
  walls and their corners in both looks (High's strata hook reads the same `along` and `y`); the level lines, the seams
  between levels and the top's lip stay the walls' alone. Only maps with terrain above terrain have undersides.
- **Interiors that read** (*superseded by D497*: a cave is lit as open ground, "The game's light" below): a cave's least sky rose from 0.30 to 0.55 (`caveLight.ts` `CAVE_SKY_FLOOR`, the volume's
  least byte too) and the walk in from an opening loses 16 a cell instead of 26, so light carries about six cells in
  before the least; deeper in, the sky's light comes bounced off the rock, so walls and ceilings take nearly a floor's
  share (`caveLightOf`: from the open ground's 0.7 + 0.3 n.y at the mouth to 0.85 + 0.15 n.y deep). The least holds
  deep in only, never at the mouth, where the open ground's light (High's occlusion with it) carries on. Murky, never
  near-black: deep floors at 0.55 of the sky (0.30 before), about 0.6 of the open ground's shade.
- **Objects and falls under a roof** (trees, bushes, ruins, sources, slopes, the ghosts; falls): the air they stand
  in, from the same volume (`materials.ts` `CAVE_POINT`: `caveAirAt`): the open air's sky (D497), and the sun only
  where it reaches, the volume's (High: its soft shadow of the real meshes, `ShaderHooks.roofedSun`). The branch is compiled only on a map with air under a roof (`CAVES`, the renderer's
  `setCaveBranch`, on the objects' and falls' materials of both looks); every other map draws them with the same
  program as before. Their looks by soil follow the run top they stand on (below, "Objects on their run top's soil").
- **Standard's baked shadow from the voxels (item 8):** on a map with terrain above terrain the sweep (`light.ts`
  `shadowTopsInto`) carries each tile's rock from the map's floor as it carries a plain tile's height, and the runs
  above air are added along each sample's ray, lowered as the sweep lowers a height (`shadowRock`, `voxelTops`): of
  the shadow's pieces, the one the sample's ground lies in gives its top, and ground lit through a gap takes the top
  of the highest piece below it. So the sun reaches ground under an overhang, through an arch and under a floating run
  as in High and as a ray through the voxels finds it. An object casts from the run it stands on (`objectCasters`
  keeps each tile's caster level): a tree on a cave's floor casts from the floor, not the roof. A tile with terrain above terrain is judged at its lowest floor
  (the level its cave opens onto the ground beside it, where the filtered shadow map blends the two). A map without
  terrain above terrain has no rock: its shadows are the heightfield's, byte for byte (the code is not entered).
- **Tests:** `caveLight.test.ts`: on a terrain with an overhang, an arch and a floating run (and trees on two roofs),
  every open-ground sample is in shadow exactly where the sweep's ray through the voxels meets rock (both suns, over
  4,000 samples, more than 40 of them lit under rock the heightfield would shade); redoing the samples round 30 edits
  gives the bytes of baking the whole map again; the cave least's constants. `tests/e2e/cutaway.spec.ts` draws a tree
  under the cave's roof and the falls' programs with the branch, both looks, no shader error (it fails when the branch
  is broken).
- **Equivalence:** frames before (`feature/3d-view-soil-runs`) and after, real Chrome on the RTX 2070 SUPER, Canyon
  128 seed 7, Standard and High, the whole map and a cliff, 1920×1080, the water held: 5–89 pixels differ, as many as
  two runs of the same build differ by (11–147), on the moving water; the terrain is pixel-identical.
- **Mouths** (flat grey, ground only, measured once): 24 mouths each on Hollows and Pressure found by the rule (a
  cave floor beside open ground at its level), both looks: the step across ±0.05 tile is at most 4 levels in all 96
  look-mouths, before and after.
- **Relight after a dab** (radius 6 on cave tiles, the whole draw of a dab, real Chrome, median of 80, measured once):
  Hollows 2.1–2.5 → 2.6–2.7 ms, Pressure 2.2–2.4 → 2.8–3.1 ms; a generated 256² map 1.4–2.2 → 1.6–1.7 ms (no change).
  The shadows' share is kept small by redoing only the samples whose sweep tops moved (`shadowPairRect`'s
  `heightsOnly`) and one look at the sums of cave tiles along a ray before walking it.
- **Captures:** `docs/sheets/3d-view-caves-read.jpg` (Hollows cut at 5, a forest in a cave, a tunnel, the overhang at
  (47,59); Pressure's tunnel and the mouth at (238,161); before and after, Standard and High, 1920×1080 dark, and the
  tunnels at 1280×800 light).
- **Falls short:** deep interiors are murky by choice, and stone
  in shade is dark in both looks (an open cliff in shade is as dark).
- **Known limits:** the shadow map keeps one top a sample, so a cliff face inside an overhang's shadow can show lit
  above a lit gap below it (the ground itself is right).
- **A cave made after the map opened** (a Block dig or an Erode cave on a plain map; the usability pass's finding):
  the renderer follows the columns of every terrain update (`renderer.ts` `syncCaves`), so the first column with air
  under a roof switches on the cutaway's branch, builds the light volume whole (once, about as long as a map with
  caves takes to open) and the roofed objects' branch, and the last one filled switches them off again. The cut opens
  into a hollow dug under it as it does on an imported cave map (`tests/e2e/cutaway.spec.ts`, its second test).
- **No frame waits on a shader compile** (D453; a fresh reviewer's finding on the RTX 2070 SUPER: the first hollow froze
  the page 3.6 s in `getProgramInfoLog`): a branch switched on (or off) is compiled first, in the background
  (`programs.ts`, `KHR_parallel_shader_compile`: compile and link sent, completion asked without waiting), and the
  material takes its new defines only once the program is ready, before the next frame when it is compiled already;
  the frames until then draw with the program it has.
  - **Compiled ahead:** half a second after a map is drawn, while the page is idle, and at once when a layer cut is set
    (how a hollow is dug), the programs an edit could need: the look's in every state a map can reach (cut and caves,
    their floors' soil, an overhang alone, plain; the likeliest first), the water's while none is drawn, the
    drought line's; then the other look's in every state too (in Standard the High look's, from a copy of its
    materials and the sun's depth map included; in High Standard's). Leaving High keeps its programs in every
    state, so a switch back and a dig right after are drawn at once.
  - **A switch's program first:** the browser compiles what it is sent in turn, so the programs compiled ahead are
    sent two at a time (`WARM_IN_FLIGHT`), and none while a switch waits for its own (a dig's branches, or the switch
    to High's programs), whose compile is sent at once and waited for alone: it never waits behind the warm-up's queue,
    and a program sent already is never queued again (`tests/unit/programs.test.ts`). The map's picture waits for
    the branches its map asks for (up to 20 s, the page's thread free, then drawn with a warning), never drawn without
    its caves' look unsaid.
  - **The program the frame asks for:** each is compiled with every kind of object that draws its material (a fall's
    template has no position or normal, the objects are instanced), or a stand-in of that kind, and the branches always
    come in one order (`withDefine`). `tests/e2e/cutaway.spec.ts` checks that a switch to High and a dig right after
    it compile nothing in the frames that follow.
  - **Numbers** (real Chrome, RTX 2070 SUPER on a loaded machine, 256² map; compile on the page's thread): the first
    hollow dug 4.1 s (Standard) and 11.8 s (High) before, 7 and 11 ms after; the switch to High 9.2 s before, 24 ms
    after; opening Hollows ~12 s before, 11 ms after.
    A Block dig in High right after the switch from Standard, and on a map just opened in High (the cut set a second
    after it was up, the dig a second later): the branches switched in the dig's own update, no frame with the old
    program, nothing compiled by a frame.
  - **Falls short:** a hollow dug before the programs compiled ahead are ready draws the old program, a lid over it
    under the cut, until they are (the background compile of High's programs takes seconds on a loaded machine: before
    this order and the warm-up's earlier start, a dig 1–3 s after the cut on a map just opened in High showed it for
    5–6 s); a first switch to High before Standard has compiled High's draws Standard until they are ready (no freeze). The forces' moments'
    materials are compiled ahead with the rest (`ForceEffects.materials`: Erode's dust and stones, Erupt's puffs,
    Glaciate's ice through an empty stand-in of its tongue, which is made only when it plays, its gathering ice and
    crystals, Craterize's dust, rocks and flash), and so are the brush's cursor and a force's ring, made hidden with the
    warm-up (three.js compiles a hidden object's program as any other's); the first Erode on a page compiled two
    programs in its frames, a frame held 265–435 ms on Highlands 128 seed 12, and the first Glaciate three, now none
    (`erode.spec.ts`). Quake's crack (a line, which the warm-up has no stand-in for) and the water effects' materials are
    not. Where the browser draws in software nothing is compiled ahead; without the
    extension a define is set at once, as before. The map's picture compiles its own programs before its first frame
    (`compileAhead`) and compiles nothing ahead.

## The game's light (D497; `draft/game-ambient`)

- **The rule** (planning, 2026-10-29): draw it as the game draws it; editing aids get their own channel.
- **The game's terrain shader** (TerrainURP's ForwardLit program, disassembled from the game's `resources.assets` by
  #703's reviewer; its notes are kept with the review): the game renders in Gamma colour space (`globalgamemanagers`
  PlayerSettings m_ActiveColorSpace 0), so it lights in display values. A face's colour is its albedo × 0.912 (URP's
  diffuse share, `_Metallic` 0.05) × (the ambient + 1.1 × the sun's colour × max(n·L, 0) × its shadow), with a little
  specular. The ambient is Unity's Trilight light probe (decompiled `Timberborn.SkySystem` `Sun`: `AmbientMode.Trilight`;
  the day's colours in `Configurations/Sun.blueprint.json`: sky (0.62, 0.63, 0.97) from above, equator (1, 1, 1) from
  the side, ground (0.28, 0.23, 0.37) from below) as Unity's ambient probe: irradiance SH, the gradient projected to L2
  with the clamped cosine's convolution (`GAME_AMBIENT_SH`; up 0.78/0.79/0.98, side 0.84/0.83/0.91, down
  0.65/0.64/0.68), turned back to display values (URP `SampleSH` under Gamma); a frame capture of the game's SH is still
  to check the engine's projection. No ambient-occlusion setting in `GraphicsQualitySystem`. Its height terms: the
  ground's altitude ramps, twice the texel at height / 22 (`_AltitudeCeiling`), on grass and dry ground before
  contamination; and the cliffs' tint from (0.416, 0.431, 0.475) at level 0 to (0.941, 0.925, 0.894) at level 22.
- **What:** the terrain shader (`materials.ts`, both looks and the light look) lights each face in display values by
  `gameLight` (`palette.ts` `GAME_LIGHT`: the ambient SH by the normal, plus the sun by its shadow, × 0.912). Gone: the sky visibility (`light.ts` `skyVisibility`, `skyAt`, the tile data's
  B), the contact shadow at a wall's foot and a cave floor's, the wall's foot darkening, and High's ambient occlusion
  (`ambientVisibility`, its field `hlAmbient`, the bake worker's `ambient` and `cover` jobs, `AmbientField`, the
  "Ambient occlusion" effect and its switch `hlAO`, and the relight that rebuilt them after a brush). The thin dark line
  along the top of a drop stays (the game's blocks draw their edges). Grass and dry ground take the game's altitude
  ramps (`ALTITUDE_RAMP`, read from the game's `resources.assets` by `tools/altitude-ramp.ts`: 32 texels each, RGB24),
  twice the texel at the ground's height over 22 levels, mirrored past it, before contamination's veins. Under a roof
  the same light, the sun only where it reaches: the light volume keeps the sun alone (Part 2), so a roof's relight is
  local again.
- **The game's colours** (the calibration, #703's follow-up): the colours the light multiplies are the game's texture
  means. `tools/albedo-means.ts` draws the terrain in the page with the light, the ramp, the cliff gradient and the
  haze off (High also without its warm sunlight; since the finish, no fog, specular or post chain either), picks every 4th pixel and averages tops by
  their tile's soil (a tile's middle, no contamination or water) and walls. Each kind's colours were scaled by one
  factor per channel so that mean is the game's: dry ground (`GROUND.dry`, `dryCool`, `dryWarm`, `crack`) the
  `Desert` texture's 63/52/42 × 1.098 (the detail texture `GrassDetailsAlbedo`, mean 140, doubled) = 69/57/46; grass
  (`moistLow`, `moistHigh`) the `Grass` texture's 67/73/25 × 1.098 = 74/80/27; walls (`WALL.stone`, `mortar`, and
  High's strata stone) `CliffDetail`'s 68/62/52. Measured after: dry 69/57/46, grass 74/80/28, walls 68/62/52
  (Standard; High's walls 70/64/53). Walls are tinted by the game's cliff gradient (`WALL.gradient`, `cliffTint`:
  (0.416, 0.431, 0.475) at level 0 to (0.941, 0.925, 0.894) at 22, unclamped) and lose D334's every-other-level
  shading, which the game's cliffs don't have. The legend shows ground and walls as a sunlit top shows them
  (`sunlitTop`).
- **The game's finish** (#722's follow-up), every look, in place of our haze, Standard's warm tint and High's tone
  curve, grade and haze: the game's scene settings (`level2`'s RenderSettings, read raw) and its `Rendering/Volume`
  profile (`palette.ts` `GAME_FINISH`, `materials.ts` `finish`, `GAME_POST_GLSL`).
  - The fog: `m_FogMode` 2, exponential, density 0.003, as URP's FOG_EXP programs in TerrainURP draw it
    (`exp2(-density / √ln 2 × the view depth)`), toward the day's fog colour or a held hazard's (#716). None looking
    straight down. From farther than the game's farthest default zoom (154 units) it is held at what that zoom shows
    (`fogShift`), so whole-map views stay readable: an editing view the game doesn't have. High's Fog switch (on by
    default) turns it off, an editing aid.
  - The reflection: URP's environment term on the terrain (`gameSpecular`: the probe × the reflection intensity, 1 /
    (r² + 1) × the Fresnel blend toward the grazing term) and the sun's GGX highlight. The probe is the game's own
    Cubemap (`sharedassets1.assets` "TimberbornEnvironmentRelfectionProbe", 128², 8 mips, BC6H), which
    `tools/reflection-probe.ts` decodes on the GPU; `GAME_ENV` keeps its roughest mip, up, side and down, and `--json`
    writes every face and mip. The water reflects it too (`WATER.sky`: the probe at the water's mip 5.29, toward a
    reflection 60° up; `WATER_SURFACE.reflection` 1). The reflection intensity was the scene's `m_ReflectionIntensity`
    0.65 until 2026-11-07, then the 1 the game's `Sun.UpdateColors` sets every frame (`fix/water-light`). The light
    look leaves out the terrain's specular (D453: in software it cost a third of the finish's frame time; the set draws
    the light look in 30 ms against dev's 25 at 1280×800, SwiftShader).
  - The post chain: URP's LDR grading under Gamma: to linear, +0.15 EV, Neutral tonemapping, contrast +14 round
    ACEScc's mid grey in LogC, saturation +3, back to display values; the sky takes it too.
  - Editing aids are drawn after the fog and the post chain, in their own channel, so they keep their full contrast:
    the selection and footprints, hatching, the Markers' outlines and their ledge and groove on walls, level lines,
    the hovered tile, clear water's veil (D196, D212), the water's overlays, the sources' wells, the pointer's source's
    glow and a highlighted source (D196, D249), and a highlighted object or the placement ghost (its instance colour
    comes negative, less 10 times its tint's index, and the shader tints it after the grade: `AID_TINT`). The slice's
    cut cap is the cut view's look (D207) and is graded.
  - An eruption's lava (D206, D378) is its own light, as a URP emission: bright enough (3.2, 0.5, 0.02 at its
    hottest) to come through the Neutral tonemap the strong orange it was, and fogged with distance as URP fogs
    emission.
  - Not drawn: `m_AmbientIntensity` 1.2, settled (D497 amended 2026-11-07: the decompiled `Sun` sets
    `RenderSettings.ambientMode` to Trilight when it loads and its three colours every frame, and nothing in the
    decompiled game sets `RenderSettings.ambientIntensity`; that a Trilight ignores the multiplier is Unity's behaviour,
    not something the decompile shows).
  - **Bloom** (D497 amended 2026-11-08, `fix/game-bloom`; `render3d/bloom.ts`, `tools/game-bloom.py`): the game's,
    in Standard and High, not in the light look. The game's runs in play: its profile has threshold 1.5, intensity 50,
    scatter 0.55, clamp 2, high-quality filtering, Gaussian, half resolution, 6 levels, no dirt; on at Medium, High and
    Ultra (`BloomSetting`); the URP asset's `m_SupportsHDR` 1 (B10G11R11) and the camera's `m_HDR` 1 with
    post-processing on. Its compiled programs (`globalgamemanagers.assets`, URP's Bloom and UberPost, `D3DDisassemble`)
    say where it sits: the prefilter works on the frame's display values (Gamma colour space) with the threshold as
    URP converts it, `Mathf.GammaToLinearSpace(1.5)` = 2.537, so only a pixel brighter than 1.269 (its soft knee) feeds
    it, clamped at 2; the pyramid stores square roots; the uber pass squares the result, × 50, and adds it to the
    linear colour before the exposure, tonemap and grade. Ours draws the same: the frame before the grade a second time
    at half resolution into a half-float target (`bloomSource`: every look material writes the colour `gamePost` was
    given, before any editing aid; the placement ghost and the slopes' arrows on `AID_LAYER` left out), the game's
    pyramid pass for pass, and the canvas given what it changes, post(before + bloom) − post(before), `before` read back
    from the canvas's code through the grey's curve (`inverseTable`), so a pixel it leaves alone keeps its every bit,
    editing aids too (the forces' moments are on `AID_LAYER` too, and an object faded round the pointer goes into the
    source by the dither, as it has no coverage there). The canvas alone could not carry it: the chain reaches 255 from a
    display value of 1.28, under the knee's middle. An eruption's lava blooms as everything does.
  - **Drawn only when something can pass the knee** (D453): by day nothing does, so the passes would change no pixel and
    are skipped; `renderer.ts` `blooms` draws them only while an eruption's lava gives off light (its age set, its
    cooling short of `LAVA_CRUST`'s end). Measured with the passes forced on, about 2,900 day views (the start, ruins,
    mines, every tree, clean water and its sources, a Badtide's water, both looks): the brightest source 1.28 (a water
    glint), the start up close 1.270, and the bloom's result 0 or under a code (the start up close: 4 × 10⁻⁶), the
    canvas the same to the byte. `tests/unit/bloom.test.ts` holds it: every model colour a face can turn to the sun, lit
    as the game lights it, under the knee (the brightest, a mine's pale rubble, 1.262); the ruins' rust skeleton
    (upright, 1.282 square to the sun) and a mine's pale roots held at their bounds; the sky's densest clouds 1.271,
    which move no code. The birch's bark is held there too, at its upright bound (near-white, 1.37 on a trunk square to
    the sun in Standard and 1.42 in High; in the game's warm grey 1.23 and 1.155, below).
    `tests/e2e/look-high.spec.ts` checks the frame by day is skipped and the same to the byte with the passes and
    without, and that an eruption's lava draws them.
  - **The colours bloom found** (D178, D496's rule: the game's albedo at our lightness; `tools/game-model-albedo.py`
    reads a model's Timbermesh and its material, EnvironmentURP's 2 × detail × vertex colour × `_MainTex` × `_Color`,
    VegetationURP's vertex colour × `_MainTex`, area-weighted over each triangle): the start's marker
    (StartingLocationMaterial's `_Color` 0.5 halves its texture's greys: walls 0.395, trim 0.42, roof 0.48, the
    openings 0.18; ours had taken the texture's 0.79 to 0.96 and stood near-white), High's berries (the blue of the
    game's blueberry texture, 0.294/0.302/0.414; ours were #7f9bff; the grown model maps almost none of it, 0.1 % of
    its area) and the ruins' panels (RuinColumnA–E's lightest tenth, 0.507/0.430/0.272; ours were #E3CF96). Before,
    the bloom at the game's values would have lifted up to 1.39 % of our frames by 2 luma (+90 luma at most on High's
    berries, +62 round the start in High); with them, no day frame of ours reaches the knee but by its foot (below; the start from 11 to 42,
    crowns and bushes close up, two maps, both looks: the brightest 1.26 of a knee at 1.269), as the game's own lift
    at most 0.21 % of a frame by day, median none (the probe's 680 day-lit start shots, an upper bound).
  - **The birch's bark** (`fix/birch-bark`, after #863; D496's rule): the game's grown birch's bark, its white-vertex
    part (11.9 % of BirchMature's area), is a light warm grey with dark marks: its texture parts in two, the marks
    under 0.2 and the bark over 0.4, with 3 % of it between (`tools/game-model-albedo.py BirchMature --above
    0.1,0.2,0.3,0.4,0.5`: 94, 81, 76, 73 and 67 % of it over each). Our models draw the marks as geometry of their own
    (Standard a dark ring on the trunk, High five bands up close), so the bark is the texels over 0.3,
    0.634/0.579/0.490, not the whole texture's 0.525/0.474/0.392, which would count the marks twice (a first take on
    this branch did, and its trunks read 15–20 % darker than the game's). At our lightness, as the pine's and oak's barks
    (`TREE_COLOURS.birchBark`, 0.835/0.763/0.646), where ours was a near-white, neutral 0.93/0.91/0.86 (High #f2efdd).
    The dead birch's wood is the same part of BirchMatureDead, 0.517/0.466/0.388, so 0.815/0.805/0.792 of the living
    bark (`DEAD_FORM`; it was 0.93/0.93/0.92). High: `underSun` keeps the pine's and oak's browns' hue (lit, High's r/b
    and g/b within 3 % of Standard's), but the birch's near-grey came out neutral (r/b 1.04 against Standard's 1.19), so
    it takes half the correction (`BIRCH_SUN`, #c8c3b4), measured by recolouring the bark alone in a real frame (River
    Valley 128² seed 1's grove, the brightest quarter of its bark's pixels): Standard r/b 1.19, 1.17 and 1.14 and g/b
    1.11, 1.10 and 1.10 up close, at the start camera and at play distance; High at half 1.17, 1.16 and 1.13 and 1.09
    throughout (the whole correction 1.04, 1.04, 1.02; none 1.31, 1.31, 1.27). Its pixels at the start camera (18 away,
    55°): p90 192/181/165 in Standard and 197/185/170 in High, against the game's frames' 203/205/169 scaled to our
    grass (their green held up by the leaves round a thin trunk in a JPEG). The bloom: an upright trunk square to the
    sun shows 1.229 in Standard and 1.154 in High, under the knee, but the stems lean up to a quarter radian (1.36 and
    1.28) and High's twigs up close more (1.38); no frame shows it there, its brightest pixel over a grove up close, at
    the start camera and at play distance from 8 sides being code 219 in Standard and 230 in High (0.86 and 1.05 before
    the grade; the knee is code 240), so `bloom.test.ts` holds it at its upright bound. The game's birch foliage by the
    same tool, 0.188/0.249/0.108 over its green vertices, is 2.4 L* lighter than ours (0.174/0.231/0.099; the pine's 2.8
    lighter, the oak's 2.8 darker, the same reading's spread): left as it is.
  - Its cost** (`npx tsx` of a probe, RTX 2070 SUPER, 1280 × 800, River Valley 256² with dense forest and ruins,
    orbiting, the same build with it off and on, two rounds each): by day, skipped, dev's: p50 7.00 ms, p95 7.02, the
    page's time 0.96 ms in Standard and 1.26 in High against 0.96 and 1.38 without it, the GPU's 3.5 and 3.0 against 3.7
    and 3.1. While lava glows (its passes forced on, as they cost the same whatever they find): the frame holds dev's in
    both looks, p50 7.00 ms and p95 7.03 at the display's 144 Hz either way; the page's time a frame +0.6 ms in Standard
    (0.95 → 1.54) and +0.7 in High (1.13 → 1.85); the GPU's timer +1.4 ms in High (3.1 → 4.5) and no higher in Standard
    (4.1 → 3.2, inside its spread). Standard keeps it (D453).
- **The game's sky** (`fix/game-sky`, after #734): its camera's skybox, read from its pixel program (shader path
  1816, `D3DDisassemble`). Its colour by the view's height is the strip "DayCycleSkybox_8k_Manual" (16 × 8192,
  RGBAHalf) at `_DayProgress` 0.2, the day (`tools/game-sky.ts` prints the 145 heights `GAME_SKY.day` keeps); its
  stars (a Voronoi field, by night only) are left out; its clouds come in a band round the horizon (full from −13.5°
  to +18°, gone by −36° and +36°), the shape eroded by the detail, in the sun's colour. The shader's constants are read
  by name and offset from its own table (UnityPerMaterial), not guessed from their use: the shape (`Skybox_ShapeNoise`,
  128³, at `_ShapeScale` 1, 3, 1) sets the clouds' size, the detail (`Skybox_DetailNoise`, 64³, at `_DetailScale`
  6, 12, 6) erodes their edges, and `_Blending` (0.7) scales them. The game reads both from noise textures; ours are our
  own value noise, an octave a channel at the textures' scales, spread so the field comes out as the game's, worked out
  from its decoded textures over the band (a mean 0.016 against ours 0.016, 13% over 0.05 against 13%, features about
  4° across: autocorrelation 0.44 at 4° against 0.47). They stand still (the game's drift a
  quarter of a degree a second). No fog, as Unity's skybox; the post chain as the rest. Straight down, graded, it is
  (47, 90, 132): the game's shots show (47, 90, 133) behind the map. High's own sky and its switch go. The light look
  draws no sky: its background is that colour straight down.
- **Objects, water and falls** keep their own light (their sky colour and sun), less High's ambient occlusion; they
  take the fog and the post chain.
- **Captures and numbers:** in the PRs (#703, #722, and the finish's, which carries the set).
- **Falls short:** the ambient SH's projection waits for a frame capture (`m_AmbientIntensity` is settled: not applied, D497): shade reads about 0.8
  of the game's (floors truly in shade 57–62 in the game's shots, our overhang floor 49–50). The game's sky behind
  the map is still ours. The water is graded before it blends over the ground, where the game grades the finished
  frame; grading after would take a full-frame pass (D110's rejected 25–27 MiB target).
- **The sun turns with the camera** (`fix/game-sun`, after #734): the game's (`Sun.UpdateRotation`: the camera's
  turn + `RotateWithCameraOffset` 40, `SunXAngle` 45). `light.ts` `sunOfYaw`; the baked shadow's sweep takes any sun
  (the row or column it lies nearer, interpolated along the other: the same bytes as before on the old diagonal);
  the baked shadows roll: a bake for the sun as it stands starts as soon as the last has landed, in a worker of
  their own (`sunBaker`, never behind the water's fields), so while the camera turns they trail it by one bake
  (at 90° a second on Canyon 256², a median 24° behind, from 40° with the old settle-then-bake); Standard's and the
  light look's light go with them. High's light and depth map take the camera's sun every frame it turns half a
  degree, as the game's sun turns each frame (`LateUpdate`): 0.7° behind, for one depth pass a frame (the turn's
  95th-percentile frame 14.7 ms against 9). A turned sun's depth map is drawn with the next frame (the wait between
  depth maps is a brush's), and its shaders read it through the matrix it was drawn with, never the next sun's
  (`sunShadows.test`); a bake the worker refuses (its job threw, and would again) takes the sun on the shadows already
  baked, never asked again each frame (`sunRefused.spec`). Under roofs the light volume holds air alone and the shader
  marches the sun through it (`sunMarch`, mirrored in `caveLight.ts` for the tests), so a roof needs no relight when
  the sun turns: the volume read filtered (air 1, rock 0, blended between cells' middles) and the least kept, so a
  shadow's edge is soft over a voxel rather than stepped, from a hashed first step, in enough steps to climb the whole
  volume
  (`SUN_MARCH_STEPS`). The map's picture bakes the sun for its camera at once (`sunNow`), on the map as it is (no
  quarter turns). A map opened is baked once, for the sun of the view Reset view opens it in, so framing it bakes
  nothing more (`sunOnOpen.spec`; before, a second bake of 30–60 ms at 256²). The forces' worn stones take the
  scene's sun.
- **Caves and overhangs in the game's light, measured (dev 7d2a3dbd, 2026-11-07):** `tools/capture-forms-read.ts` now
  finds each form where the generator put it (its intentions' `at` and `from`) and stands its camera in air: lower first
  at the whole distance, then nearer. Its fixed cameras had fallen on bare walls once D503 moved the forms. In High,
  Canyon 128² seed 1's spring cave from inside measures 39 mean luma (roofed walls 31, the floor 56, ceilings 26),
  against the look audit's 27; in Standard, 50 against 32. Under the overhangs (Canyon 1's cliff overhang and River
  Valley 1's start and cliff overhangs, High), the roof's underside measures 15–27 and the back wall 23–31, against
  open walls of 35–64: the lip's darkening the audit missed is the game's light (#734). **Falls short:** an overhang's
  outside view can still stand under its own roof, as the tool checks only that the eye is in air, not the line of
  sight to the form.

## Objects on their run top's soil (built, `feature/3d-view-objects-run-soil`)

D491 lets objects stand in caves, so an object's looks by soil follow the ground it stands on, not its tile's top.
- **What:** `runSoil.ts` `objectSoilAt(soil, W, x, y, z)`: the soil an object at level z of a tile reads, its run
  top's own where one is at that level below the tile's top (`SoilView.runs`), else the tile's top as before. What
  reads it: a ruin's ivy (`entities3d.ts` `buildEntities`, both looks; the light look's ruins have none), so a ruin on
  a soaked cave floor under a dry roof is overgrown and one on the dry roof bare; and High's slopes, whose grass reads
  the run texture at the slope's own tile and level (`high/shaders.ts` `slopeHooks`, the same rule as `runSoilAt`),
  only where `RUN_SOIL` is compiled (`highLook.ts` `runSoilMaterials`, switched with the terrain's). The renderer hands
  a soil without runs (the page's soil growing toward the worker's) the last runs drawn, as the terrain keeps them.
  Nothing else in the objects reads soil: trees, bushes, sources and the ghosts take their colours from their models
  and flags, Standard's slopes have no grass, and withering (the Weather view's dead plants) is the core's and isn't
  worked out on maps with caves yet (`session.ts`, `stackedMap`).
- **Equivalence:** a map without run tops below a top has no `runs`: `objectSoilAt` gives the tile's top (the same
  bytes as before) and `RUN_SOIL` is not defined, so every material compiles the program it did; checked by hashing
  every Standard, light and High material's sources with the `RUN_SOIL` branches taken out, dev's and this branch's,
  all equal (the Standard and light ones are unchanged byte for byte). Frames before and after, real Chrome headed,
  River Valley 128 seed 4242, Standard and High, the whole map and a ruin close up, 1920×1080: the ruin 0 pixels
  differ in both looks; the whole map 36 (Standard) and 10 (High), each by one step in one channel, on the moving
  water.
- **Tests:** `runSoil.test.ts`: on the hand-made cave with water, a tile whose floor is moist under a dry roof: an
  object on the floor reads the floor's run top (`objectSoilAt`, and the run texture holds the same for the slope's
  shader), one on the roof the top's; a ruin on the floor has ivy at its foot, the same ruin on the roof none; without
  the runs, the top's. `cutaway.spec.ts` puts a slope and a ruin on the cave's floor: High's slope takes the branch,
  no shader error in either look, and the ruin is overgrown.
- **Captures:** `docs/sheets/3d-view-objects-run-soil.jpg`: a hand-made cave (a spring's stream across its floor out
  through a tunnel, three ruins, bushes, birches and a slope on the moist floor under the dry roof), cut at 7,
  Standard and High, dark and light, before and after, and High close up: before, the ruins bare and High's slope
  grey; after, ivy at the ruins' feet and grass on the slope.
- **Falls short:** ivy is chosen when the objects are built, so it follows a new soil on the next objects' build, as
  on open ground. Plants under roofs have no soil look of their own to follow until withering runs on maps with caves
  (the core's).

## Block tool's rendering (D488; `feature/block-tool-render`)

Two plain pieces for the Block tool, only drawn or plain data; the page's interface wires them up (the operation and
`blockFalls` are the core's, `docs/progress/3d-creating.md` "Delivers 2" on `feature/block-tool-core`).
- **`blockAim(hit)`** (`pick.ts`): the 3D pick's hit as `{at: [x, y, layer], side}` for the `blocks` operation. A run's top
  face is its top block's `+z` (layer `top − 1`), its underside the bottom block's `-z`, a wall the block at the layer hit
  (`TileHit.layer`, new: the voxel the face belongs to) with the wall's way as `+x` east, `-x` west, `+y` north (toward
  y + 1, −Z in world space), `-y` south. Null for no hit (sky, off the map), a hit with no run, and the map's floor under
  air (layer 0 is a block only where the ground holds one). Tested on caves, overhangs and a floating run: a ray at every
  exposed face of every block gives that block and side. **Only right on a hit of the voxel pick (`pickSeen`), so the page
  registers the Block tool with `voxel: true`.** Under a layer cut, `blockAim(hit, cut, mode)` treats a top whose run
  reaches the cut (the cut's cap, or a real top at the cut) as the block at layer `cut − 1`, which is seen: Remove
  takes it, and Add gets null (it would fill the hidden layer `cut`); walls, undersides and tops below it aim as usual.
- **`renderer.showBlocks({added, removed, falls} | null)`** (`blockGhost.ts` `BlockCells`): the cells `blockFalls` lists,
  one instanced mesh per kind, each block with its edges. Colours (D335, a refused action shows the blocks that would fall
  in red): falls solid red; while any fall, `added` and `removed` are drawn muted grey, since they will not happen;
  otherwise added translucent white and removed red just outside the ground's own faces, as the area brush's ghost. A mesh
  is kept and rewritten only when its cells or the layer cut change (nothing per frame); cells at or above the cut are not
  drawn, and `setSlice` redraws them. The area brush's `BlockGhost` is unchanged. `renderer.blocksDrawn` gives the counts
  (tests). Capture (valid add, valid remove, refused remove, and the dark look, 1920×1080 frames):
  `docs/sheets/block-tool-preview.jpg`.

## Item 1: the masks from the worker (built, `feature/3d-view-worker-masks`)

- **What:** the worker sends each listed column's mask (`ColumnTerrain`'s, bit z: voxel z solid) with its voxels, and
  `mesh.ts` `columnMask` looks a column up instead of rebuilding it from 23 bytes at each look. Every reader of
  `columnMask` (the mesher, the light volume, picking, the hover, the Wand's `hasTopAt`, Select's ring, the cutaway's
  checks) gets the lookup without change. The renderer spreads the masks over the map once per columns message
  (`model.ts` `columnMasks`: a listed tile's mask, 0 on a plain tile, `TerrainSource.masks`). A map without terrain
  above terrain has no masks at all, and its columns are its heights, as before.
- **The contract change** (`src/worker/session.ts`, the view messages): `MapView["columns"]` gains an optional
  `masks: Uint32Array`, one per listed tile in `tiles`' order, set by `columnsOf` (the view, an edit's columns, Block,
  Erode's end) and by a force's frames (Erode's changed tiles); it is in `viewBuffers`. It is empty on a heightfield. Nothing else
  changes: `tiles` and `voxels` stay for their other readers (the water layers, the shadow rock, the run soil, the
  water mesh workers, which are not sent the masks). The page's `mergeColumns` (a force's frames onto the map's
  columns) carries the masks when both sets have them. A view without masks (made by hand) has them worked out from
  its voxels, once.
- **Strokes on the page:** the page paints a stroke into the heights in place before the worker answers. The lookup
  ends a listed column's top run at its tile's height (`terrain/runs.ts` `reshapeTop`, the build's own rule in
  `terrainUnder`), so a stroke on a roof or a ledge reshapes the top run as the worker's columns will have it, and a
  plain column follows its height. The worker's own heights give the masks exactly as sent (`reshapeTop` on a column whose top is its height
  changes nothing). Before, the mesh, the light and picking kept a roof's old top until the worker's columns came.
  Erode's frames, Block digs, a cave dug after opening (`syncCaves`) and a refused stroke's heights coming back all go
  through `updateTerrain`, which takes the masks with the columns.
- **Equivalence:** the equivalence tests pass unchanged (meshEquivalence, caveLight, pickTerrain, cutaway, runSoil,
  waterLayers, pickCut, blockAim). `tests/contract/workerMasks.test.ts` opens the hand-made cave map through the worker
  and checks its masks against the voxels' mask, opened and after four edits: a roof raised, a roof cut down to its floor, the ledge
  raised, and a Block dig into the cliff. After each stroke, the masks as they stood, looked up at the new heights, equal the worker's new columns on every
  tile (the page's stroke). On that map and on random caves (96 × 80, across chunk edges), lookups and voxels give the same
  meshes byte for byte, chunk by chunk, the same light volume bytes and the same picks (3,000 rays).
- **Pick time (Node, this machine, measured once, information):** 256² Delta with a 100 × 100 block of cave columns,
  4,000 rays aimed into the block from above: 28.3 µs reading the voxels, 3.8 µs looked up (2.9 µs on the plain map).
- **Falls short:** the other readers of the 23-byte columns (the water layers, Standard's shadow rock, the run soil)
  still follow a roof's top only when the worker's columns come, as before.

## The hollow under the cursor (D488, D487; `feature/hollow-under-pointer`)

- **Why:** at an editing pitch a cave or a tunnel under a plateau is invisible unless the Caves layer or a cut is on,
  and the layer marks whole roof tops, not where the air is or how much roof is left. Since D487 the brushes shape a
  roof's top run, so a map maker painting on a plateau needs to see the hollow under the brush.
- **What:** `src/render3d/hollow.ts`. While an editing cursor is over ground with air right under its top run, the
  air's footprint is laid on the roof's top inside the cursor's reach: a fill in the Caves layer's violet (170 90
  220), stronger the thinner the roof (`roofTone`: alpha 0.5 at one block, as low as a stroke can take it, then 0.37,
  0.27, 0.19 and a quiet 0.13 from five blocks), a little fainter toward the reach's edge, and a thin light-violet
  outline over a dark edge (the brush ring's) where the hollow ends. Air only between lower runs does not count: the
  top run is what the pointer is over and what a brush shapes. The reach (`renderer.ts` `layHollow`): the brush's disc
  (Select's ring too, counting a roof only where the ring lies on it, `aim`), else a force's or the shelf's ring (a
  force's marker: 1.5 tiles), else the square a tile round the Block tool's blocks, aimed at their lowest layer (blocks
  added on a cave's floor do not mark the roof over them). Under a layer cut it reads the cut masks, so a roof cut
  thinner reads thinner and a cave cut open shows nothing. Drawn over the brush's disc so the violet reads the same
  under every brush's tint, under a target's plane.
- **Cost:** a map with no column that is not plain never builds the marks; the setters raise one flag and the frame
  returns at its first test. On a cave map the footprint is worked out once a frame the cursor moved (a mask lookup a
  tile): measured once in Node (information), a 256² map all roofs, radius 6 0.011 ms, radius 24 0.067 ms.
- **Tried:** A, the footprint on the roof's top (built); B, an x-ray of the footprint at the cave's ceiling, drawn
  through the rock. B gives depth by parallax, but at an editing pitch it lands off the tiles a stroke would change
  (toward the camera by the roof's thickness), so it reads as "somewhere under here"; A says which tiles and, by its
  tone, how thin.
- **Tests:** `tests/unit/hollow.test.ts` (the roof of a column, the footprint in a disc and a square, the aim, a cut,
  the tone, the Block tool's reach); `tests/e2e/cutaway.spec.ts` draws it under a brush on the hand-made cave in both
  looks with no shader error (9 tiles, 12 outline pieces), never makes it on a plain map, and draws it for a hollow dug
  after opening until it is filled.
- **Captures:** `docs/sheets/hollow-under-pointer.jpg` (`tools/capture-hollow.ts`, real Chrome on the RTX 2070 SUPER):
  Hollows and Pressure with the Raise brush over a roof's edge, Craterize's ring and the Block tool there; a tunnel dug
  with the Block tool into a cliff of Canyon 128 seed 7, the Lower brush over it; the same map with no caves, nothing
  drawn; Standard and High, 1920×1080 dark and 1280×800 light. "Before" is the same frame with the marks hidden (they
  are all this change draws).
- **Falls short:** the tone says thin or thick, not a number of blocks; a big force's ring over a cave map marks a lot
  of violet (all of it ground the force leaves as it is, D487). Under water on a roof the marks lie on the ground,
  seen through the water as the brush's own disc is.

## What an edit changed (D488; `feature/3d-edits-show`)

- **Why:** two usability audits agreed that a 3D edit is hard to see once it lands: a block added to a cliff or dug into
  a wall is the same stone as its neighbours, an Erode cave opens in shade, and from an editing distance the player
  cannot tell what changed or that anything did.
- **What:** `src/render3d/editGlow.ts`. When an edit lands, the faces it opened glow in the Block tool's preview colours
  (D335), each outlined so the change reads as blocks: a block added, its open faces white; a block taken, the faces it
  left open in the hollow (the rock round it: floor, ceiling, back and sides) red. It holds a quarter of a second, then
  fades out over 0.85 s. Its clock runs with the frames drawn, at most 250 ms a frame, so a page held by the first cave's
  light and shaders (seconds, `syncCaves`) never uses it up unseen. A change landing while one glows joins it and both
  start over, so a force's frames glow together until a second after its last. With reduced motion, and in the light
  look (software drawing, where each frame of a fade is a whole frame's cost), it shows still for a second, then goes. Under a layer cut what the cut hides is left out; the cut moving puts the glow away.
- **What counts** (worked out by the renderer from each terrain update, no operation change: `editedCells`): every
  cell whose solid state differs between the columns drawn before and the update's, on tiles with terrain above terrain
  before or after (stored masks, not reshaped to the heights, so a roof's top a stroke painted first still counts): a
  Block dig or overhang, an Erode cave, a stroke or a Select action that reshapes a roof's top (D487), their undo and
  redo, a History jump. On plain tiles, only the Block tool's edits and Erode's frames: the Block tool says so as it
  sends its operation to the worker (`renderer.blockEditSent()` in `useBlockTool.ts` `commit`, once the edits queued
  before it have landed), and the next land that comes takes it, however long the answer takes (no clock: on CI's
  software drawing a Block click's answer came after the 4 s an earlier stamp allowed, and glowed nothing); once the
  operation's answer is back (taken, refused or failed) the word is dropped (`blockEditSent(false)`), so a refused edit
  never lends it to a change that lands after; Erode's frames' plain ground is painted through `flushTerrain` while its moment plays.
  Plain heightfield edits otherwise get nothing, the Block tool in hand or not: a brush paints its land as it goes
  (D197), a Select action is the selection's own, and the other forces have their own moments (D240), so nothing is
  doubled. Compare's flip to another version and back is not an edit: `useCompare.tsx` asks for its land with
  `updateTerrain(h, undefined, { glow: false })`, so it never glows, on cave maps too. (Branch from here opens the copy
  as a new map, which glows nothing.)
- **Tried by eye** (real Chrome, Highlands 128 seed 12, the same cliff): A, the opened faces (built); B, the changed cells
  as whole ghost blocks, the preview lingering. They read the same for an add. For a dig, B fills the hole it confirms
  with four red blocks, which reads as blocks added; A lights the hollow's floor, walls and ceiling, so the hole reads as
  a hole, and draws only what is open (12 quads to B's 24 for a 2 × 2 dig).
- **Its program, compiled ahead:** the glow's one material (no tone mapping, no defines: one program in every look)
  is the renderer's, put on the warm-up list (`scheduleWarm`, programs.ts) with the cave states, and a glow whose
  program is not ready yet waits for it, drawn and its clock started only once it is (`programs.ready`), so a first
  glow never compiles in a frame (D453; `cutaway.spec.ts` counts the programs the frames compile after a dig: 0).
- **Cost:** nothing per frame once faded (no mesh drawn, no frame asked for); the cells are found inside the update's
  changed rectangle (typed arrays, a mask compare a tile), the faces rebuilt when an edit lands (six mask lookups a
  cell, at most 20,000 cells).
- **Tests:** `tests/unit/editGlow.test.ts` (a dig into a wall, an overhang and its undo, a roof's top a stroke painted
  first, plain tiles only when asked, the faces of an added block, a dug block, the map's edge and floor and the cut, the
  fade); `tests/e2e/editGlow.spec.ts` (a plain edit draws nothing; a dig into a wall glows on the hollow's 5 faces and is
  gone after it fades; its undo glows the block put back; with reduced motion it holds still, then goes; the Block
  tool's click on flat ground glows its block's 5 faces, while a plain edit with the Block tool in hand and a Compare
  flip and back glow nothing, the click's answer held back 5 s; a Block click the core refuses, then a plain edit a
  moment later, glows nothing). The spec watches the glow in every frame from before each edit (`watchGlow`): on a slow
  machine the glow can show and go while a poll from the test still waits for the edit's answer.
- **Captures:** `docs/sheets/3d-edits-show.jpg` (`tools/capture-edits-show.ts`, real Chrome on the RTX 2070 SUPER):
  before, just after (the glow held at full for the shot) and a second later; a Block dig into a cliff, an overhang built out of it, a Block tool click on
  the plain ground at its foot and an Erode click on its face (Highlands 128 seed 12); a dig into a cave's wall under a
  layer cut and a Lower dab on a roof (Hollows); Standard and High, 1920×1080 dark and 1280×800 light.
- **Falls short:** a change seen only from inside (a hollow behind its mouth, the far side of a roof) glows where the
  camera cannot see it, and the red reads weaker beside badwater (Hollows' cave lake). The undo of a Block edit on plain
  ground does not glow (the page's undo does not say which operation it takes back); on caves it does. Right after a
  dig, the Block tool's next preview (white) over the red glow reads pink for a moment. The first hollow dug on a plain
  map held the page for seconds in a cold browser (the cave light and shaders, before this change and dev's shader
  warm-up); the glow waits for it.

## Software frames (`perf/software-frames`)

- **Why:** dev's CI (software drawing, SwiftShader) took 21–29 s a Block tool click in `blockTool.spec.ts`. Measured
  under SwiftShader (Chrome `--use-angle=swiftshader`, 1920×1013, a Block click on Lake Basin 96 seed 77): each frame
  drawn holds the page's thread as long as SwiftShader draws it (the canvas is read back for the software compositor at
  each frame), so a click costs its frames times a frame. CI draws a frame in 1–2.5 s (its trace's screencast), this
  machine in ~50 ms; frames a click were the same at 2026-10-15 and on dev (8–12 with frames held at 1.5 s), and CI's
  2026-10-15 runs of the spec failed at their first click (33–39 s was a failure's time, not the spec's pace).
- **What grew:** the light look's terrain program, about 13% a frame since 2026-10-15 (the thin-water film's bed, the
  cut's new hatch, the run soil's water flag, all paid on every top pixel in software, where branches do not skip), and
  the edit glow's fade, at least five frames an edit whatever they cost (its clock moves at most 250 ms a frame).
- **What changed (software only; on a GPU every program's translated source is the same, Standard's 13 and High's 10):**
  the light look's tops work out the tile's own soil, sky, level and film once (its neighbours are the tile itself, so
  the blend comes to that; no edge wobble, D135), with no contact shadow or lip (none to draw), and its walls drop the
  stone bevel and cracks (D135: no patterns); the edit glow shows still in the light look (two frames); `commitOverlay`
  draws nothing when the page paints the same overlay again (a frame at rest, from the page's effects).
- **Numbers (this machine, SwiftShader):** a frame 48–49 → 43.5 ms (2026-10-15: 47–49); `blockTool.spec.ts` 147 → 131 s
  of tests; an edit's glow 6+ frames → 2.
- **Falls short:** a frame in software is still about 2 s on CI's runners; the next lever is drawing fewer pixels in
  the light look (0.75 of the resolution: 34 ms here), which softens its picture, so it is not done.

## High within 16 samplers (`fix/high-software-link`)

- **Why:** on a map with terrain above terrain (every generated map with a 3D form, the cutaway's and the run soil's
  branches), High's terrain program read 17 textures; a fragment shader is sure of 16 (WebGL 2's least, and all that
  ANGLE on Direct3D 11 gives, so Chrome on Windows, GPU or not), so there it did not link (`useProgram: program not
  valid`) and the terrain drew empty. Since #571, whose thin-water film read the flow texture in the terrain shader,
  where High already reads the same texture as `hlFlow`. Seen first in headless Chrome; a browser allowing 32 (Vulkan's
  SwiftShader) never showed it.
- **What:** the film's badwater share is a hook (`ShaderHooks.filmShare`); High reads it through `hlFlow`, the same
  texture at the same size, so its terrain reads 16 and the picture is the same (frames at a held moment, Standard and
  High: only the run-to-run noise). `cutaway.spec.ts` now fails any program past 16 samplers, in every browser.
- **Falls short:** High's terrain is at the limit: a 17th texture there needs another one packed first (the eruption's
  two or the edges' two are the candidates).

## Water sliced by the cut (`feature/cut-water`)

- **Why:** under a layer cut every voxel at or above the cut is gone (D207), the water's too, but water whose surface
  stood over the cut was not drawn at all, even where its floor lay below the cut: a cut through a lake or a river
  showed its bed as dry ground with nothing over it (since #571's films it read as plain ground, and since #518 the bed
  as an ordinary top). What you see is now the lake sliced.
- **The rule** (`src/render3d/cutWater.ts`, the shaders' rules in plain code): a water column is drawn whole where its
  surface stands at most 0.05 over the cut (`CUT_SLACK`, as before); sliced, its top lying flat on the cut, where its
  floor is below the cut; not at all where its floor is at the cut or above it (`surfaceAtCut`). A sliced top is
  shallower by what the cut took off its water (`cutCornerDepth`: a corner's shared depth less that much times the
  corner's wet share, so neighbouring tops still meet at their corners and the water still thins to its shore), and it
  keeps only its shore foam; its sides stop at the cut, their drop and depth shortened with it. A fall whose lip stands
  over the cut is gone; its landing stays where its pool is below the cut (`fallSheetCut`). The terrain counts a top as
  a bed under water exactly where a top is drawn over it (`bedAtCut`: `soilOf` adds "or the top is below the cut"; a run
  top at the cut or above it has no water drawn over it), and a film's depth (#571) is the depth left under the cut
  (`waterDepthOf`).
- **How it is drawn:** no remesh, the cut stays one uniform (`setSlice`). The water's mesh carries, per vertex, its
  column's floor and, on a top, the corner's wet share (`WaterMeshData.cut`, the `wcut` attribute; 8 bytes a vertex), and
  the water's vertex shader folds a sliced column onto the cut as the terrain's folds the ground (`waterMaterial`, both
  looks and the light look; every look's flow-carried surface reads the current by tile, so it moves on
  the sliced surface). The falls' vertex shader drops a sheet whose lip stands over the cut. The ribbons and the Flow
  view's streaks carry the water's floor too (`motionShapes.ts`) and lie on a sliced surface. The water's chunk bounds
  reach down to each column's floor (`boundingSphereOf`), where the cut may fold it. A force's cursor and ring
  (`pickSurface`, the force ring) stand on the water as drawn: on the cut over sliced water.
- **Check:** `tests/unit/cutWater.test.ts` works out what is drawn as the GPU does it (the vertex shader mirrored) on
  Canyon 128 seed 7, Lake Basin 128 seed 5 and a hand-made cave pool under a roof with a lake on it, at every cut through
  their water: each column drawn where `surfaceAtCut` says, every top flat, a sliced column's sides under the cut,
  tops of one water meeting at their corners, the terrain's bed (from the tile data's water byte, as `soilOf` reads it)
  exactly under drawn water, and nothing moved with no cut. `tests/e2e/cutaway.spec.ts`: a reservoir six levels deep cut
  at 7 draws as five levels of water would, not as its bed dry (it drew as the bed dry before), in Standard and High,
  with no shader error and every program within 16 samplers.
- **Real Chrome** (`tools/capture-cut-water.ts`; the RTX 2070 SUPER, and Chrome in software for the light look):
  Canyon 128 seed 7 cut at 9 (its river is mostly under a level deep, so a whole-level cut slices it only where it pools
  deeper), the official Lakes at 1 (222 columns sliced round the frame), Hollows at 2 (a shaft by its underground river,
  which is under a level deep and so is drawn whole or gone at any cut) and at 10 (a badwater cave pool). With no cut, dev
  against this branch, the water held: Standard and High within the run-to-run noise of two loads of one build (0–93
  pixels, all on the water and the Items panel's animated icon), the light look 0 on the map (on Hollows the outlines
  of the camera buttons, page controls, differed). Captures:
  `docs/sheets/cut-water.jpg` (dev against this branch, Standard, High and the light look, 1920×1080 dark and
  1280×800 light).
- **The sides of water the cut removes (`fix/cut-curtain-sliver`, from #642's review):** a side of a column whose floor
  is at the cut or above was only clipped per fragment, so one hanging below its floor (a step of less than a fall down to
  lower water in front of a cliff) left a sliver up to the cut's slack in front of the cut face. The water's vertex
  shader now folds such sides flat (the no-cut path is unchanged: `slice` is 99). `tests/unit/cutWater.test.ts` checks
  every removed column's sides at every cut on its maps (dev's fold drew some on each) and a shallow step in front of a
  cliff. Captures: `docs/sheets/cut-curtain-sliver.jpg` (`tools/capture-cut-water.ts --slivers`: Canyon 128 seed 7 at
  cut 4 and the official Waterfalls, close up, dev against the branch, Standard and High, 1920×1080 dark).
- **Falls short:** a sliced top whose upper water poured in a fall (now gone) has no side where the fall was, down to the
  pool below (it would need a quad meshed only for a cut; no such case found on the official maps, whose lips are
  shallower than a level); a top next to water whose floor the cut reaches (gone) keeps no shore foam at the new bank
  (each top would need its neighbours' floors). A film exactly
  on a run top at the cut is counted dry by the terrain (the run texture has no depth). Objects and the drought line are
  cut as before. The cut is whole levels, so water under a level deep is never sliced (drawn whole or gone, as before).

## The map's picture and ruins from afar (D488; `fix/render-audit-small`)

- **Ruins from afar never break into noise** (both looks; every map with ruins, at the opening camera's and the
  picture's distance): the far block's frame (`entities3d.ts` `LOD_FAR_FRAME`) keeps its lattice (D305), but the
  object shader filters it to the pixel, the struts' share of each pixel's footprint (`fwidth`), drawn as coverage
  (alpha to coverage on the multisampled view; the canvas has no alpha). Its cells were at most 2.8 pixels wherever
  the far block is drawn (below `RUIN_NEAR_PX`), so the old discard test made orange noise. A cell shows the column's
  inside, darker and letting little through (`RUIN_INSIDE_SHADE`, `RUIN_INSIDE_COVER`), so a far ruin reads as the
  orange scaffold with its cream panels (D334), now solid (the lattice had discarded them too), and settles to an
  even veil of its colour as it shrinks. The game draws one textured model per ruin height at every distance (no
  LOD meshes for `RuinColumn*` in its `resources.assets`), its textures mipmapped: the same averaging.
- **The picture is what the game shows** (`heroView.ts`, from the decompiled `MapThumbnailCapturing`, `SkySystem`
  and `opening.ts`): the new game's opening camera at the default zoom's widest (the very first zoom holds only the
  start's 30 × 45 tiles), the sun turning with the camera as the game's does (`RotateWithCameraOffset` 40; since
  `fix/game-sun` the renderer's own sun, no longer the map turned under a fixed one), the start hidden, drawn at
  twice its size. Before, it
  looked down at 40° at the whole map (the official maps' authored thumbnails do; a new map has none).
- **The forms in it:** Canyon 128 seed 1 at the default Verticality grows one form, the overhang sheltering the
  start; no spring cave or arch. At the opening camera it stands at the picture's middle, a ledge of a few pixels: a
  60° camera looks down on its roof, the shelter under it out of sight, as in the game. Exposure and size hide
  nothing else.
- **Captures:** `docs/sheets/hero-ruins.jpg` (`tools/capture-hero.ts`, real Chrome on the GPU).

## Seeing the land behind objects (`feature/object-fade`)

Trees go to the game's size, about twice ours, so they hide more of the land being edited. Planning ruled an editing aid
in its own channel (#236, 2026-10-30; D496/D497's rule: the look itself never changes). This part is the renderer's
side. The page wires it: the terrain tools' hover and stroke set the fade, and a held key hides all objects.

- **`setObjectFade({ x, y, radius } | null)`** (`src/render3d/objectFade.ts`). The region is in the map's tiles, as the
  brush cursor's are. Every object whose place is within `radius` shows a quarter of itself (`OBJECT_FADE`). The object
  goes whole, by its instance's origin, not part by part. Past the radius it comes back to full over a tile
  (`OBJECT_FADE_EDGE`). The fade is one uniform (`objectFade`), read by the one object program every look draws objects
  with (`objectMaterial`: Standard's; High's object, vegetation, landmark and slope; the light look's). The light look's
  baked batches carry each vertex's object place (`origin`). No define and no sampler is added, so no new program
  variant needs warming, and the cutaway's 16-sampler check holds. The warm-up before a switch to High compiles the
  sun's depth pass with the fade's own material (`fadingDepth`), so the first High frame compiles nothing.
- **Never the land's own shape:** a mine site and a seep stand in tiles whose tops the terrain leaves out
  (`mineCutout`), their models drawing the pit and its rim. Fading or hiding them would show the sky through the hole,
  so they are never faded or hidden (`LAND`). Their instances carry a negative `grow.x` (`LAND_GROW`), which the
  objects' program and the depth pass read.
- **Never an editing aid:** the shelf's placement ghost is drawn with the objects' program, but it is the thing being
  placed, not one of the map's objects (D496; planning's ruling on #759). So it is never faded or hidden, and its
  shadow is never dropped. `markEditingAid` makes the last value of its `grow` negative (its size on screen is read as
  the absolute value, so it keeps its growth in Markers). Any later aid drawn this way is marked the same.
- **How it is drawn:** on a multisampled canvas (Standard, High) the object's alpha goes to coverage, a quarter of each
  pixel's samples. It needs no sorting and composites with the water and the cutaway like any opaque object. The
  canvas has an alpha channel, so while the fade is on, the frame ends with a clear of the alpha alone. Without it the
  page would show through a faded object. Without multisampling (the light look) a 4 × 4 ordered dither is drawn.
- **Shadows:** a faded object casts none. High's sun depth map drops it with the same test (`shadows.ts`, a
  `MeshDepthMaterial` with the test added). The map is drawn again when the region moves, at most every tenth of a
  second, as for a brush. Standard's baked shadows are cast again round the region and where it was, once a frame
  (`castersNow`, `light.ts` `withoutCasters`, into two arrays used in turn). Only the tiles round the region are
  compared, and the shadows are redone only where the dropped tiles changed, so a move within a tile costs no rebake. A
  caster is dropped by its model's place, as its fade is: the start's casters stand on the nine tiles of its footprint,
  its model round the footprint's middle (`casterPlaces`).
- **`setObjectsHidden(on)`:** the objects' program discards every object but the land's own shape (`objectHide`). The
  baked shadows are cast again without the objects and High's depth map is drawn again (no canopy shade: High's
  ambient occlusion went with D497). False brings it all back.
- **Pictures:** the map's picture, sized pictures and Showcase cards are drawn on a renderer of their own (`hero.ts`),
  so they never see either setting. The shelf's icons are drawn on the view's renderer with the fade put off for the
  picture (`thumbnailAsync`), with the hiding put off too.
- **The shelf's icons never make the page wait for the GPU (`thumbnailAsync`):** each of a picture's three passes is
  copied on the GPU into a buffer of its own, and the view's state is put back right after each draw, as the view's own
  frames run while the copy waits. The buffer is read once a fence has passed and no frame of the view has been queued
  since (`readBack`): Chrome's read, `getBufferSubData` as much as `readPixels`, waits for everything queued before it,
  so a read just after the fence still waited for the frames drawn meanwhile. A frame queued meanwhile is waited for
  in turn with a fence after it, for up to 2 s (`READ_PATIENCE_MS`: a view that never stops drawing), then the read
  waits for that one frame. A read that waited (`readRenderTargetPixels`, before) held the page until the GPU had
  finished the frame queued before it: seconds on CI's software drawing, between a stroke's moves (dev's
  `strokesBackToBack` timeout). The pictures are the same bytes; a picture begun before a change of look is drawn
  again in the new one. The shelf draws one at a time when the page is idle (`useShelf.ts`), and starts none while a
  press is held on the map: the next waits for the stroke's end.
- **Cost (measured once, real Chrome, GPU, a 256² River Valley, a 76-tree forest; information):** the call itself is
  a few µs (a uniform write). A frame after a move of a whole tile costs about 0.6 ms more on the page's thread (0.5 ms
  in Standard): the baked shadows round the region and their upload. A frame with the fade on and still costs the
  same as with it off. High's
  depth pass is about 2 ms of GPU, at most ten times a second while the region moves. Hiding or showing is one
  12 ms step: every object's baked shadow. With the fade off nothing
  changes; with it on and still, the cost is a branch on a uniform and the alpha's clear.
- **Tests:** `tests/unit/objectFade.test.ts` checks the region test, its edge, the shadow's halfway mark, the land's own
  shape, the start's place and the dither. `tests/e2e/objectFade.spec.ts` checks Standard and High on a meadow of trees,
  bushes and ruins, as coverage and as dither. Objects in the region keep under half of themselves, those outside are
  drawn unchanged, and the canvas stays opaque. Hidden objects leave the land as with none. A mine site's and two seeps'
  footprints show no more of what is behind the map hidden or faded than as drawn, where taking their models away
  shows it through most of them. For that check the sky is replaced by a magenta background: its clouds are near
  white and fall where the GPU's arithmetic puts them, so on CI's software drawing a cloud filled both seeps' holes and
  a test of the sky's blue saw no hole there. The shelf's icon is unchanged, the map's picture is the same with the view's objects faded and hidden, and a
  warmed switch to High compiles no program in its first frame. The light look is checked where the browser draws in
  software (CI).
- **Captures:** `docs/sheets/object-fade.jpg` (High and Standard: as drawn, faded round the pointer at radius 5, and
  hidden).
- **Found on the way:** the objects' material said the view's canvas has no alpha (the comment is gone). It has an
  alpha channel (`premultipliedAlpha`), so a far ruin's lattice cells (`RUIN_INSIDE_COVER` 0.75) let a little of the page
  through on screen. That is a follow-up for the look, not changed here.

## The landmarks as the game draws them (D496, D178 amended; `feature/game-landmarks`)

Group 2 of the object audit: the landmarks every map has, our own models at the game's measures. They were read from
the game's models in resources.assets (positions, materials and texture means only; nothing of the game's is kept).

- **The start** (`startTower`): the game's map-editor marker, a lantern tower of pale grey stone, 4.37 high on its
  3 × 3. It has a walled base 2.86 across to 1.04 with a door toward the entrance and windows, a white cornice, a hipped
  roof to 1.8, a tapering shaft to 2.8, a gallery 1.82 across, a lantern of four posts round a dark light to 3.8, and a
  cap. It replaces the timber lodge with its red roof and banner. The entrance marker stays. Its shadow casters stand
  4.0 high on its footprint's middle tile, where the tower is, and 1.4 on the eight round it, its walls and roof
  (`light.ts`, was 2.2 on its Coordinates' corner, then the tower alone; the fade drops them by the model's middle,
  objectFade.ts `casterPlaces`), and a press takes it as drawn: the walls two levels over the 3 × 3, the tower four
  over the middle tile (`editor/start/startPick.ts`).
- **A water source:** an outcrop of dark rock 1.0 high, about 1.1 across (the game's is 1.14 × 1.18). Highlighted (Remove's
  red, D249), a source's rock takes the whole red, three times its colour rather than twice (`highlightObjects`), so the
  dark rock reads as clearly as the red water round it; and a source the pointer's water comes from (D196) glows in its
  model as in its water (`tintObjects`, the water's glow as a tint of the rock), since the rock now stands where the
  glowing water was seen. The tints are put back before High copies the objects' colours and laid again once the
  map's objects are the ones drawn (a source placed while one glows, a look switched; look-high.spec checks it).
- **A badwater source:** a flat dark crater 2.5 across over its 3 × 3, darker toward the middle, with low stones round
  its rim. Nothing stands higher than 0.06.
- **A mine site:** the pit is the game's 1.35 deep (`MINE_PIT.depth`, was 1.6). The scaffold towers, the beams across
  the pit, the rope and bucket, the ladder, the crates and the shaft are gone, as the game has none. Rusty posts stand
  down into the pit round its lip, joined along each side and across each corner. In the pit's corners is the ground
  the game's round pit leaves: a ledge 0.1 under the level, in the game's colour there (`MINE.ledge`), its edge an arc,
  falling into the pit as a bank of topsoil over earth, with a few stones on it (it was a flat pale block that read as
  a tarp). High's pulley went with the scaffolding.
- **A seep:** a stone slab at the ground round a pit, heaped with twelve rounded rocks about the game's size, nine low
  ones and three stacked in the middle (they were sixteen stretched columns that read as spikes). The heap rises to 0.57 for
  water and 0.40 for badwater, and the gaps between the rocks are dark teal or rust orange. The pit is 0.5 deep for
  water and 0.2 for badwater, as the game's are.
- **Colours:** the game's albedo at our lightness, by the ratio of our grass to the game's (`palette.ts` `LANDMARK`,
  by `asOurs`, as the trees'). The legend's pictures follow the new shapes. The start's greys pass white at our
  lightness, so `START` takes the game's own greys by part, as the trees take its own colour in every look: walls and
  shaft 0.79, cornice and cap 0.84, the roof lightest at 0.96 (it was the darkest, the cornice and lantern the
  lightest, so the shaft and the white trim read flat).
- **Every look:** Standard's models are the light look's, and High copies them for the start and the sources
  (`landmarks.ts`), so the three looks draw the same shapes. The mine site and the seeps stay the land's own shape for
  the object fade (`LAND`).
- **Tests:** `tests/unit/landmarksGame.test.ts` pins each to the game's measures. `look-mine-ruins.test.ts`'s pit depth
  is re-based to the game's 1.35, and `startHouse.test.ts`'s ray over the roof passes beside the tower, with a new
  case for the tower itself (D148).
- **Captures:** `docs/sheets/landmarks-game.jpg` shows before and after, on a flat meadow (the landmarks' water off) and
  on River Valley, in Standard, High and the light look. The game's own models were rendered beside ours to check
  them; those renders stay local. `docs/sheets/landmarks-polish.jpg` shows the follow-ups (the start's greys, the
  mine's corners, the seeps' rocks) before and after, the same way.
- **Short:** a water seep's gaps still read dark rather than the teal the game shows (the model's own albedo there is
  dark; the teal likely comes from the game's water or shader), and the mine's pit stays square under its round banks.

## The water's surface as the game draws it (D496, D497; `fix/water-flow-surface`)

- **What:** both looks draw the game's flow-carried surface (Q9 P5, P11, investigation/notes/water_and_soil.md) and
  clean water by the game's own colour formula (Q9 P4); the water's terms of our own (D334's, and smaller ones) are gone.
- **The flow:** each column's outflow ÷ 14 (`current.ts` `gameFlowOf`: right − left, top − bottom, averaged with its
  wet 3×3 as the game's vertex averages its linked neighbours), in the flow texture's RG as `bake.ts` `flowByte`
  (128 + 127 × sign × √|f|; the shaders' `waterFlowOf` squares it back). The cave volume (`caveCurrent.ts`) packs it the
  same way.
- **The surface** (`waterTextures.ts`, `WATER_FLOW_GLSL`): two phases of time × 0.4, half a cycle apart, each sampling
  at xz × 0.06 − flow × frac × 2 and jumping by (0.3, 0.42) or (0.58, 0.73) each cycle, cross-faded by |2 frac − 1|. One
  512² texture of our own (made in the bake worker, about 160 ms, once a page; flat at its mean until then): RG an
  albedo's two fields, BA the normal's slopes. The albedo multiplies the colour; the slopes are the surface's normal,
  × 4 and × (1 + badwater share), as the game's. A fall's face samples its water over the lip. The light look draws the
  surface flat (the textures' mean), as the game's Low quality.
- **The textures' statistics** (`python tools/game-water-shader.py --textures` measures the game's; numbers only, held by
  tests/unit/water-flow-surface.test.ts): the albedo's mean RGB 68.6/73.8/77.8 and spread 9.0/8.0/8.9 matched exactly
  (fitted along the game's first two principal components), its percentiles within 4 codes, its feature size 0.079 tile
  (the game's 0.079); the slopes' spread 0.118 (0.116/0.120) and feature 0.142 tile (0.153).
- **The colour** (`waterPalette.ts` `GAME_WATER`, `gameCleanColour`; materials.ts `gameWaterFormula`): lerp(#446C71,
  #000F48, d/5) × the `_DepthGradients` R ramp at d/5 × 2 × the albedo, lit by the game's light (its ambient probe by the
  normal and its sun, palette.ts `GAME_LIGHT`). Chosen by the pixel judge (`tools/water-pixel-judge.ts`): six probe water
  shots (River Valley, Lake Basin, Highlands, two seeds each; the snapshot drawn by our renderer from the shot's camera,
  fitted to it), 8,574 clean tiles, RMS distance to the game's pixels in display RGB: Standard dev 42.5, our calibrated
  colour × the albedo 38.4, the formula 15.0; High 25.1, 20.8, 14.9.
- **Gone:** Standard's pale streaks, crests' light, ripple cosines and slowed badwater ripples; High's chop streaks,
  grazing and streak colours, light network, ribbons, broad swells, rolling packets, their brightness swing, still-water
  drift, its own ripple normal, a film's lifted opacity, the Rough water switch (`hlRiver`) and the rough water bake
  (`roughWater`, below falls and in rapids) with its texture.
- **Kept:** badwater's own light patches, troughs and bubbles (Q9 class (c): its flowing pattern, P9, followed since: below),
  now carried by the same two phases, by the tile's badwater share or the flow texture's smoothed one where that is more
  (so a front's patterns are there in High, which reads that one); the camera highlight, gloss, sky reflection and sun glint; High's `rippleLight`.
- **Badwater against clean water** (*withdrawn 2026-11-07, `fix/water-light` below: these frames are near sunset; by day
  the game draws badwater darker*) (the judge's `--water bad|clean`, on the two Islands end shots, where the game shows
  both): the game draws badwater lighter than clean water of the same depth, as ours does: on islands-128-2-end its own
  pixels read L* 34.6 for badwater a level or two deep (898 tiles) and 28.7 for clean water (573), 35.7 and 31.1 under
  half a level (168, 64). D496's 6 L* rule (badwater darker) is amended to the game's order, and the clean water hue
  window to the formula's (look-water-slopes, look-readable and look tests, on the shipped colours:
  `tests/unit/waterShown.ts`). islands-128-1-end's fit misses the frame (its "badwater" samples
  read blue in the game's frame), so it is left out.
- **Falls short:** deep water (3 levels and more) reads a little darker than the game's and the shallowest band a little
  lighter; at a film ours keeps clean water lighter than badwater, where the game's frames show badwater the lighter
  under half a level too; the game's detail albedo (P6), refraction (P2) and shore films moved sideways (V3) are still
  missing; badwater's own calibration (`WATER_CALIBRATION`) was not re-measured under the stronger normals, and on the
  low Islands camera (34° down, 133 away) the judge's render of pure badwater reads grey-blue (L* 43, 92/106/112)
  where the game's reads red-brown (101/75/72), on dev too: badwater's colour (planning's item (c)) is the next step.

## Badwater as the game draws it (Q9 P9; D496, D497; `fix/water-badwater`)

- **What:** badwater's surface is the game's: its base colour between `_Base_Contamination_Color_A` and `_B` by a
  pattern's R, its emissive detail (the pink-orange light, D334's bubbles cue) by the pattern's G, both carried by the
  flow in #826's two phases (`badwaterPatternAt`), its smoothness toward 0.15 by the tint × the pattern's R; normals
  × (1 + c) as before. Both looks (materials.ts, high/shaders.ts); the light look draws the pattern flat at its means.
- **Gone:** our own badwater troughs, streaks, light patches and veins (`badTrough`, `badStreak`, `badVein`, Standard's
  `BADWATER_TROUGH`/`_STREAK`/`_VEIN`/`_BUBBLES`, High's `hlBadwaterBubbles` and its trough and streak block).
- **The pattern** (`waterTextures.ts` `makeBadwaterTexture`, 512², made in the bake worker beside the flow texture; flat at
  its means until then): our own, tuned to the game's `_ContaminationAlbedoEmissionSource` as `python
  tools/game-water-shader.py --textures` measures it (numbers only, `GAME_BADWATER_TEXTURE`, held by
  tests/unit/water-flow-surface.test.ts): R mean 121.8 (the game's 122.1), spread 30.2 (29.5), feature 0.039 tile
  (0.045), broad share 0.35 (0.33); G mean 20.0 (19.6), spread 47.4 (47.0), 63 % black (63 %), feature 0.056 (0.057),
  broad 0.24 (0.25); both channels' 16 percentiles within 3 codes (ranked onto the game's).
- **The emissive detail** (`gameBadwaterEmission`): lerp(#D99053, #E09C65, the noise's mean) × the pattern's G × the
  game's 10-tile grid modulation (d² + 0.1 c, held to 0.25–0.55) × the tint × 4.5 easing to 1.2 by 40 % bad, unlit.
- **The colour** (`GAME_BADWATER`): the game's formula as read (ps 680–790: the base colour × 1.75 easing to 1 above 60 %,
  overlaid with the detail albedo by 1 − c/2, × `_DepthGradients` G, the shallow glow) is built in both looks behind
  `BADWATER_FORMULA`, and the pixel judge (`tools/water-pixel-judge.ts --water all`, now banding clean, mixed and bad
  water) kept ours: on the two shots whose camera it fits (islands-128-2-end, islands-128-2-badtide2-end; 1,731 pure
  badwater tiles), RMS to the game's pixels for pure badwater Standard dev 25.3, #826 25.9, this 26.5, the formula 27.6;
  High 20.5, 21.8, 20.8, 28.0; for the mixed front (10,874 tiles) Standard 29.7, 25.1, 26.3, 23.3; High 22.6, 20.3,
  20.0, 23.0. Over all six Badtide and Islands shots (four with the probe's pose, the fit failing) pure badwater
  Standard 24.7, 24.9, 25.7, 27.8; High 23.7, 25.0, 24.1, 29.3. The formula draws pure badwater a dark crimson (L* 8 a
  level deep, lit) that reads teal-grey on screen; the game's frames show a lighter red-brown (101/76/72 on
  islands-128-2-end, 113/91/76 on its Badtide end), which neither ours (94/103/109) nor the formula reaches.
- **Falls short:** pure badwater still reads grey-blue where the game's reads red-brown, in every version: the formula as
  read does not explain the game's lighter red-brown, so something in the game's light of badwater is not yet
  modelled (close up and in the editor's own Badtide view ours reads crimson and red-brown; the judge's renders of the
  probe's far, fitted cameras read grey-blue for every version, its land too, which points at the judge's render
  conditions as much as the colour); the film case stays (under half a level the game shows badwater about 6 L*
  lighter than clean water; ours 2.9 L* lighter in Standard, 2.4 darker in High): the game overlays clean water with its detail albedo too (P6, ps 455–475),
  which darkens its films, and following it changes all clean water, which #826's judge settled, so it waits for P6;
  `_Contamination_Flow_Distortion` (0.00125 a tile) is not followed; High's falls and side faces keep `HW_BAD` × the
  ramp (followed since: "Badwater's front and High's falls" below). The sheet: `docs/sheets/water-badwater.jpg` (`tools/capture-water-badwater.ts`; `--motion` for six moments).

## The pixel judge validated on the land (D496, D497; `fix/water-judge`)

- **Why its far renders read grey-blue:** the time of day. The game's light changes through the day (decompiled
  `SkySystem` `DayStageCycle` and `Sun.UpdateColors`; `Sun.blueprint`'s Sunrise, Day, Sunset and Night colours: the
  sun's colour, intensity and height, the Trilight and the fog's colour, each stage turning to the next over its last
  hour), and the probe's shots fall at their moments' hours: a game's start at hour 4 (the day's light), a hazard's end
  at midnight (the sunrise's: a 32° sun of 1.2 × warm white, an orange ground ambient, grey fog), a game's end at hour
  15.53 (55 % of the way to the sunset's light, which is 50 % at 15.5: pinkish fog, an orange sun 36.8° up). The judge
  drew every shot in the day's light, so its five sunrise frames and its sunset frame read grey-blue against the game's
  warm ones, land included. Also: the camera fit's dark-teal water test finds no water at a sunrise or where the water
  is all badwater, so four of the six badwater shots fell back to the probe's pose and one fitted a wrong camera
  (islands-128-2-end's own fit was 17° too low); and the judge's soil moisture took 16 a level where the editor takes
  15.
- **The fix** (`tools/water-pixel-judge.ts`, `tools/game-day-light.ts`): ours is drawn in the game's light at the
  shot's hour and weather, the shaders' light constants swapped (the sun, the ambient's SH, palette.ts `trilightSH`)
  and the sun's height and the fog's colour set; every shot of a map takes the camera fitted on its start shot (the
  probe places its camera by the map alone; the start shots fit 85–99 %). `--light day --fit own` is the judge as it
  was.
- **Its validation, the land:** level dry tops of grass, dry ground and contaminated ground, and cliff faces, away from
  water, from anything ours doesn't draw (plants, buildings, ruins, slopes) and from what a higher tile could shade,
  by the camera's distance; the floor is two game samples' distance at the game's own spread (√2 × it). RMS to the
  game's pixels, display RGB 0–255, with the mean's distance (bias):

  | shots | look | before | after | floor |
  |---|---|---|---|---|
  | the six badwater shots (sunrise, sunset; 4,001 land samples) | Standard | 34.8 (bias 31.2) | 9.2 (bias 4.4) | 11.4 |
  | | High | 34.5 (30.8) | 9.5 (5.4) | 11.4 |
  | the six clean-water start shots (day; 4,394) | Standard | 12.2 (7.5) | 12.2 (7.5) | 13.6 |
  | | High | 12.6 (7.8) | 12.6 (7.8) | 13.6 |
  | six start shots with badwater in view (day; 3,684) | Standard | | 11.3 (6.7) | 12.4 |
  | | High | | 12.0 (7.5) | 12.4 |

  The land is within the floor on every set; dry ground everywhere (bias 3–5). ("Before" on the six badwater shots
  counts the land each shot's own fit put in view.)
- **What the land shows of ours (look findings, not the judge's; not changed here):** grass reads darker than the
  game's, about 12 % (Standard bias 15 on the start shots: 120/139/68 against 144/158/75 at 70–110 away; floor 17);
  cliff faces read darker on some shots (bias 11–16; two Highlands bands 40 darker, perhaps a lit face against our
  shaded one); contaminated ground at a badwater shore shows our orange veins brighter than the game's at these
  distances. And the game's `Sun.UpdateColors` sets `RenderSettings.reflectionIntensity` from its stage's
  `ReflectionsIntensity`, 1 at every stage, every frame, where D497 takes the scene's 0.65. The judge can't tell them
  apart (`--reflection 1`: land 9.1 and 11.9 against 9.2 and 12.2, clean water 15.3 against 15.2 on the start shots,
  pure badwater in Standard 8.2 against 8.6 for the formula), so D497's number stays for planning to settle.
- **Clean water re-judged:** #826's choice holds. Its six start shots fall in the day's light, so nothing moved: the
  formula 15.2 against our colour's 38.3 in Standard, 15.2 against 20.7 in High (8,573 tiles). At islands-128-2-end's
  near-sunset hour clean water (862 tiles) reads 4.5 from the game's pixels in Standard, 3.2 in High.
- **Badwater re-judged** (pure badwater, ours / the formula): at the frames' hours (4,592 tiles) Standard 17.0 / 8.6,
  High 9.7 / 11.0 (before: 26.4 / 27.0, 22.9 / 28.0); by day (104 tiles) Standard 18.3 / 13.2, High 12.3 / 15.9; the
  mixed front (19,318) Standard 14.1 / 9.8, High 9.2 / 11.2. The fixed judge moved Standard to the formula by 8.4 and
  left High with ours by 1.3; one switch serves both looks (D154), and on screen the formula draws pure badwater about
  as light as clean water (islands-128-2-end, 1–2 levels: L* 29.7 against 29.4 in Standard, 28.0 against 28.4 in High)
  where the game's frames show it 5.1 lighter (33.3 against 28.2), D496's order; ours keeps the order (37.5 against
  29.4, 32.0 against 28.4). **No shipped colour changed:** our crimson stays (the formula ships only where it is closer
  in both looks), `GAME_BADWATER.judged` holds the new numbers and the test holds the switch to them. The game's own
  badwater is a near-neutral grey by day (about 72/69/66) and a red-brown at sunrise and sunset (about 82/62/55): the
  red-brown #830 found missing was the hour's light.
- **Falls short:** the formula reads 3–4 L* too dark on screen, and darker in High than in Standard (82/62/61 against
  85/66/66 on islands-128-2-end), which clean water doesn't show; the grass, cliff and vein findings above; P6 (the
  detail albedo) comes next.

## The light as the game sets it (D496, D497; `fix/water-light`)

- **The reflection intensity is 1, in both looks:** the game's `Sun.UpdateColors` (decompiled `Timberborn.SkySystem`)
  sets `RenderSettings.reflectionIntensity` every frame from its day stage's `ReflectionsIntensity`, 1.0 at all four
  stages in `Sun.blueprint`, so the scene's saved `m_ReflectionIntensity` 0.65, which D497 took, never shows in play
  (`GAME_FINISH.reflectionIntensity`, `WATER_SURFACE.reflection`; D497 amended).
- **The land's albedo recalibrated:** `tools/albedo-means.ts` had left the post chain in after the finish moved into
  `finish()`, so it read our albedo 3–5 % high and the colours were calibrated 3–5 % low; its patches now throw when one
  finds nothing. Measured again (Standard, Canyon 1 and River Valley 4242, display 0–255): dry ground 66.7/55.1/44.7,
  all-grass tops 70.1/77.9/27.5, walls 65.4/60.1/50.4 against the game's 69.2/57.1/46.1, 73.6/80.2/27.5 and 68/62/52.
  Each kind's colours scaled by one factor per channel (`GROUND`, `WALL`, High's strata), they now read 69.1/57.0/46.2,
  73.7/80.2/27.5 and 67.9/62.0/51.9; High 68.5/56.7/45.9, 68.2/77.9/30.7 and 68.1/62.0/52.0.
- **The ambient term:** the game's ambient is Unity's Trilight (`RenderSettings.ambientMode = Trilight` when `Sun` loads,
  its three colours set every frame), and nothing in the decompiled game sets `RenderSettings.ambientIntensity`; that
  the scene's `m_AmbientIntensity` 1.2 does not scale a Trilight is Unity's behaviour, not something the decompile
  shows (D497 amended 2026-11-07, which says the same); so ours stays as it is. (The judge's `--ambient 1.2` would take grass to 15.3 and cliffs to 17.6 on the start
  shots, but it is not the game's term.)
- **The land on the judge** (RMS to the game's pixels, display RGB 0–255, with the mean's distance (bias); dev → this
  branch):

  | shots | material | Standard | High | floor |
  |---|---|---|---|---|
  | the six clean-water start shots (day; 4,394 samples) | grass (137) | 17.9 (14.8) → 15.5 (11.6) | 19.0 (15.2) → 16.7 (12.0) | 16.7 |
  | | dry (3,531) | 9.8 (3.7) → 9.5 (2.5) | 10.1 (4.1) → 9.9 (3.3) | 11.9 |
  | | cliff (726) | 19.3 (15.3) → 18.1 (13.6) | 19.7 (15.6) → 18.8 (14.4) | 19.6 |
  | | all | 12.2 (7.5) → 11.6 (6.3) | 12.6 (7.8) → 12.1 (6.9) | 13.6 |
  | the six badwater frames (sunrise, sunset; 4,001) | dry (3,592) | 8.4 (3.0) → 8.4 (2.9) | 8.6 (4.0) → 8.4 (3.5) | 10.7 |
  | | cliff (409) | 14.3 (10.7) → 13.6 (9.6) | 15.3 (11.7) → 14.6 (10.6) | 16.0 |
  | | all | 9.2 (4.4) → 9.1 (4.1) | 9.5 (5.4) → 9.2 (4.8) | 11.4 |
  | six start shots with badwater in view (day; 3,684) | grass (104) | 14.7 (9.7) → 13.0 (6.3) | 17.6 (13.1) → 15.5 (9.8) | 8.3 |
  | | dry (2,992) | 9.4 (3.9) → 8.9 (2.1) | 10.0 (4.8) → 9.4 (3.1) | 10.8 |
  | | cliff (588) | 17.6 (13.7) → 16.4 (12.1) | 18.2 (14.3) → 17.3 (13.1) | 18.7 |
  | | all | 11.3 (6.7) → 10.6 (5.3) | 12.0 (7.5) → 11.3 (6.2) | 12.4 |

  The reflection alone moved the land by 0.1–0.6 (grass 17.9 → 17.3 in Standard on the start shots); the albedo the
  rest. Water: clean water on the start shots 15.2 → 15.6 (the ground seen through it, a shade lighter).

- **Badwater against clean water, by day:** the game draws badwater darker. On the six start shots with badwater in
  view, in the day's light, the game's own pixels read L* 27.5 for pure badwater a level or two deep (73 tiles) against
  31.7 for clean water (10,063); only toward sunset does the order turn (islands-128-2-end, 55 % of the way to the
  sunset's light: 33.3 against 28.2), the frame `fix/water-badwater`'s amendment rested on. That amendment is withdrawn
  (D496 amended again): badwater the darker, which `look-water-slopes` holds from half a level to two levels deep and
  `waterShown`'s order checks hold on the shipped colours. The game's gap is 4.2 L*; ours is wider (`fix/water-veins`
  below).
- **Badwater's colour by look** (`GAME_BADWATER.use`, split: `BADWATER_FORMULA` for Standard and the light look,
  `BADWATER_FORMULA_HIGH` for High's water): pure badwater, ours / the formula, at the frames' hours (4,592 tiles)
  Standard 18.0 / 8.3, High 9.8 / 10.9; by day (104 tiles) Standard 19.3 / 12.9, High 12.5 / 15.8; the mixed front (19,318) Standard 14.7 / 9.7, High 9.4 / 11.2. Standard takes the
  formula, High keeps our crimson; both keep the day order on screen (Standard 24.7 against 33.2 for clean water, High
  26.3 against 32.2; dev's Standard drew them alike, 32.9 against 33.0).
- **The sheet:** `docs/sheets/water-light.jpg` (`tools/capture-water-light.ts`): dev against this branch, Standard and
  High, a grassy valley, a cliff, a lake, pure badwater and badwater meeting clean water.
- **Falls short:** grass and cliffs still read darker than the game's (bias 6–14); some near cliff bands read 40
  darker where the game shows a top's colour (lakeBasin-1, highlands-1), likely the game's bevelled `CliffEdge`
  geometry rather than the light; High's grass albedo 68/78/31 against the game's 74/80/28 (its soil edges and colour
  variation); the formula reads 3–4 L* too dark; the veins; the day's badwater evidence is 104 tiles.

## The clear water view, the mine pit and the badwater gap (D496, D497; `fix/water-veins`)

- **The clear water view keeps the look's badwater:** with T on, clean water turns to a veil over the badwater it
  carries; that badwater came from Standard's formula in both looks, so High's T view showed brown water over its
  crimson. The water shader now names it `clearBad` (materials.ts) and High's hook sets its own (`hlBadLit`, the
  crimson lit, with its glowing lines, and on faces the face's badwater), so each look's T view shows its own badwater.
  `look-readable` and `highLook` hold the wiring.
- **The mine pit by day is lighter than badwater, in the game and in ours:** the judge's new `--water pit` (the 3 × 3
  centre of each `UndergroundRuins` pit floor, 0.02 above it) on sixteen day-lit start shots: the game's pits read L*
  43.4 (114 samples, seven shots) against 32.3 for pure badwater (172 tiles, six shots); on the three shots with both,
  pit 49.6, 41.6, 38.9 against badwater 27.9, 27.0, 34.2. Ours: Standard 40.8 against 29.5, High 48.9 against 30.7.
  D496's "a mine pit darker than badwater" and D154's 5 L* margin (#682, D324 (a)) are gone (D496 amended, D154
  marked); `look-mine-ruins` now holds the pit lighter than each look's badwater by day, from half a level to two
  levels deep. Standard's pit sits 2.6 L* under the game's.
- **The badwater gap:** D496 now states the game's measured gap by day, 4.2 L* (27.5 against 31.7), and ours: 8.4 in
  Standard (24.8 against 33.2), 6.0 in High (26.3 against 32.3). `look-water-slopes` adds that High's badwater body is
  darker than clean water from half a level to a level.
- **The ambient term's wording:** D497 and this file say the same: the decompile shows `Sun` setting Trilight and its
  three colours every frame and never `RenderSettings.ambientIntensity`; Trilight ignoring 1.2 is Unity's behaviour.
- **The sheet:** `docs/sheets/water-pit-clear.jpg` (`tools/capture-water-pit.ts`): dev against this branch, Standard
  and High, badwater meeting clean water, pure badwater with T on, the front with T on, a mine pit.
- **Falls short (the next PR):** the clean water by band is not too dark on the judge (Standard 40.3/35.9/32.2/28.3
  against the game's 35.6/33.0/30.7/28.0 at 0.05–0.5/0.5–1/1–2/2–3 levels; High 39.4/35.0/31.4/27.4); the 3–4 L* is
  the badwater formula's (Standard 32.0/24.7/24.9 against the game's 33.5/27.0/27.9 at 0.5–1/1–2/2–3; High's
  formula 29.8/22.5/22.4). The game's badwater by day is 68/63/59 against the formula's 60/58/57, a warm addition of
  about 8/5/2, the shape of the glow's colour, so likely the emission; High lacks the sky's reflection and highlight
  (Q9 (c)); water takes the land's diffuse 0.912 where water's metallic 0 gives 0.96. Not settled here, so the gap's size has no
  test yet. The veins: the game's are a dense rusty network (texture alpha 20 %, colour 78/33/5, L* 19, cells about
  half a tile over a 4-tile repeat, no glow; weight `saturate((c^0.65 + 0.975 (noise − 0.45) − 0.5) × 18 + 0.5)`
  from four taps 0.2 apart); ours are sparse (about 4 %), redder and glowing; both wait on the next PR.

## The game's contamination veins and the water's own light (D154, D496, D497; `fix/ground-veins`)

- **The veins are the game's (D154 amended):** TerrainURP lays its `SoilContamination` texture (1024², four tiles a
  repeat) over the ground after the altitude ramp and before the light, by lerp(albedo, its colour, weight × its
  alpha), with no emission. The weight: the tile's map value (`SoilContaminationMap`: 0.1 at the least, whole from
  0.2), blended across the tiles by the desert's four taps 0.2 round the point, to the power 0.65, at least 0.2,
  + 0.975 × (blending noise − 0.45), softness 18 (`palette.ts` `CONTAMINATION`, `contaminationMap`,
  `contaminationWeight`; materials.ts `tapBlend`, `blendNoise`, `contaminationWeight`). So the same pattern shows at
  any level over a fifth, and patches of it below. Dev drew sparse red fissures that widened and glowed with the level;
  they, their glow and High's Soil edges switch are gone.
- **The pattern is ours, to the game's numbers:** `python tools/game-water-shader.py --soil` measures the game's
  texture (read raw, numbers only): 19.8 % of texels over half alpha, mean alpha 0.20, 11 % soft edge, crack colour
  78/33/5 (spread 20/10/4), 48/33/24 between, cracks 0.023/0.039/0.067 tile wide (5th/50th/95th percentile), 4.8
  tiles of crack a square tile, about 5.4 cells a square tile, one joined network. `render3d/soilTexture.ts` makes
  ours in the bake worker (512², about 130 ms): a warped Voronoi network with a sparser fine network for branches,
  widened until its cover is the game's: 19.8 %, mean alpha 0.197, soft 11.3 %, cracks 80/35/8, widths
  0.016/0.035/0.078, 4.9 tiles a square tile, 7.6 cells. `soil-texture.test.ts` holds it there. The light look,
  with no patterns, takes the pattern's mean (the soil a fifth of the way to 54/32/19).
- **Judged on the game's frames:** of the sixteen day-lit start shots, only any-128-1-start shows contaminated
  ground away from water (19 samples, all over 110 from the camera, where a vein is under a pixel): the game's reads
  118/120/113; dev's 132/122/112 (bias 8.2, distance 13.4), this branch's 119/118/111 (bias 1.5, distance 8.0;
  the floor, two game samples, 7.3). High: dev bias 8.7, this branch 1.2. The judge now also counts the pixels a
  vein's rust tints past a test (red 18 over green, blue under half of red; `veinsAt`, 13 × 13 pixels round each
  sample) and takes contaminated ground two tiles from water, not five: of those 3,211 pixels the game's show none, dev
  13.0 % (a glowing orange, 192/112/79), this branch none.
- **The water's own light (D496, D497), found and held back:** two of the game's terms are missing where the game's
  formula draws the water's colour. The water's diffuse share is URP's 0.96 (its metallic 0: `WaterMetalAndGloss`
  red, `_Contamination_Metallic`), not the terrain's 0.912; and URP's environment term has a head-on part, sky × f0 /
  (1 + roughness²), which our calibrated colours held but the formula does not. Built and judged (`--water all`, the
  sixteen day-lit starts, each drawn in its shot's light), L* by band, game / dev / with both terms:
  - Standard badwater: 0.5–1 35.8 / 33.0 / 34.1; 1–2 27.5 / 24.8 / 26.2 (distance 15.3 to 14.3, 172 tiles).
  - Standard clean water: 0.05–0.5 39.2 / 44.4 / 46.1; 0.5–1 31.9 / 35.3 / 37.0; 1–2 31.4 / 33.1 / 34.7; 2–3
    27.0 / 27.9 / 29.3 (distance 13.1 to 15.6, 37,853 tiles).
  - High clean water (the diffuse share only): 43.6 to 44.4, 34.4 to 35.0, 32.2 to 32.6, 27.0 to 27.3 (distance
    12.2 to 13.1); High's badwater is its crimson, unchanged.

  Both terms are shared, so they lift clean water with badwater: badwater closes about half its gap while clean water,
  already lighter than the game's, moves 1.4–1.7 L* further away, and the gap between them at 1–2 levels stays 8.5 L*
  (8.3 on dev) against the game's 3.9. On the look review's finding (the game wins on screen) they are held back, noted
  where they belong (palette.ts `GAME_LIGHT`, waterPalette.ts `WATER_SURFACE`), for the water PR that finds the
  rest: badwater's remaining darkness is warm (the game's 69/64/61 against the terms' 62/62/62 at 1–2 levels: red +7,
  blue −1), the shape of its emission or glow, not the light; clean water's excess is its own (largest in the
  shallows). The water draws as on dev.
- **High's step faces:** the clear water's veil over a small step now keeps the step's own badwater at its depth,
  not the fall's 0.05-deep film (`clearBad`).
- **The sheet:** `docs/sheets/ground-veins.jpg` (`tools/capture-ground-veins.ts`): dev against this branch, Standard
  and High: contaminated dry earth and contaminated ground meeting grass close up, a held Badtide wide, and badwater by
  day.
- **Falls short:** badwater by day is as dark as on dev (the terms above held back), so the gap's size has no test yet.
  High's sky reflection and GGX (Q9 P15) wait for their own PR. No day-lit shot has contaminated ground near the camera,
  so the veins' coverage and colour on screen are judged from afar only; the texture's statistics are the close-up
  measure.

## The game's light on its water (Q9 P15, P6; D496, D497; `fix/water-sky`)

- **P15 read term by term** (`investigation/notes/water_and_soil.md` Q9): URP Lit at the water's metallic 0, on display
  values. Diffuse = albedo × 0.96 × (the SH ambient + the sun × N·L × shadow); the environment = the scene's baked
  reflection probe (`TimberbornEnvironmentRelfectionProbe`, the terrain's too, the same every hour, reflection
  intensity 1 at every stage) by reflect(−V, N) at mip pr × (1.7 − 0.7 pr) × 6, × (0.04 + (saturate(s + 0.04) − 0.04)
  × (1 − N·V)^4) / (1 + r²); the sun's GGX, f0 × r² / (d² × max(0.1, (L·H)²) × (4r + 2)) × N·L × shadow; the camera
  highlight × the sun's colour and badwater's glowing lines unlit; then the fog. #839's two held-back terms (0.96, the
  head-on f0 part) are this same lighting. The probe is read by the reflected direction's height at mips 4–6
  (`WATER_PROBE`, `tools/reflection-probe.ts`; numbers only): its horizon haze lighter than its zenith, the ground
  below darker; its mip 6 is the terrain's `GAME_ENV`. Not read, assumed: the HDR decode the game uploads (1, no RGBM),
  that `unity_SpecCube0` in play is that probe, its turn against our axes (averaged round the turn) and the SH it
  uploads.
- **P6 was clean water's excess:** the game overlays clean water's colour × albedo with its still detail albedo
  (ps 462-477), which we drew for badwater only. At the texture's mean (69.7/88.7/95.3) it darkens and cools clean
  water to about 0.55/0.70/0.75 of itself (`waterDetailOverlay`). P15 alone moved clean water further from the game
  (Standard 13.1 to 15.7, High 12.2 to 15.6); P6 alone brought it nearer (10.0, 10.7); both are nearest.
- **Built in both looks (D496: the game's quality tiers)** behind `WATER_LIGHT.game`, `.held`, `.detail` by look, all
  on: `waterEnvironment`, `waterProbeAt`, the GGX glint and highlight in the game's sun colour (`GAME_SUN_COLOUR`), the
  0.96 share; High's surface and faces draw the same. Badwater's colour in High is now the game's formula
  (`GAME_BADWATER.use.high`), which the judge finds nearer under this light.
- **Judged** (`tools/water-pixel-judge.ts`, each frame in its hour's light, RMS distance 0–255, dev → this PR). The
  sixteen day-lit start shots: clean water Standard 13.1 → 10.0, High 12.2 → 9.9 (37,853 tiles); pure badwater
  Standard 15.4 → 14.2, High 14.6 → 15.0 (172). The six end shots at their hours (sunrise, near sunset): pure badwater
  Standard 8.3 → 7.1, High 9.5 → 7.5 (4,592); partly bad Standard 9.7 → 9.0, High 9.3 → 9.0 (19,318); clean 5.1 → 3.5,
  3.4 → 3.4 (862). L* by band on the start shots, game / dev / PR: Standard clean 0.05–0.5 39.2 / 44.3 / 41.0, 0.5–1
  31.9 / 35.3 / 33.1, 1–2 31.4 / 33.1 / 31.8, 2–3 26.9 / 27.9 / 27.8, 3– 22.2 / 20.0 / 21.1; High clean on this PR
  within 0.1 of Standard's, on dev 43.6, 34.4, 32.1, 27.0, 18.8; badwater 1–2 Standard 27.5 / 24.8 / 26.0, High 27.5 / 26.1
  (crimson) / 25.1 (formula). At their hours High's formula badwater a level or two deep reads 27.0 against the
  game's 28.6 (the ~5 L* under on screen #826 found is closed to under 2); our crimson read 31.2.
- **The gap by day (D496), now tested** (`tests/unit/water-sky.test.ts`, `WATER_LIGHT.gap`): on the six start shots
  with badwater, a level or two deep, the game's clean water 32.2 against badwater 27.5 (4.7; D496's 4.2), its shots'
  spread allowing 3.1 to 6.5. Standard 32.5 against 26.0, 6.5 (9.1 on dev); High 32.4 against 25.1, 7.3 (6.8 on dev).
  The order holds in both mirrors half a level to two levels down (`look-water-slopes.test.ts`, both looks from half a
  level).
- **The sheet:** `docs/sheets/water-sky.jpg` (`tools/capture-water-sky.ts`): dev against this PR, Standard and High: a
  lake from a low grazing camera, a river, the game's opening camera, pure badwater.
- **Falls short:** High's formula badwater reads 2.4 L* under the game's by day (about 1 under Standard's), so High's
  gap is wider than the game's frames allow; by day alone its crimson reads a little nearer (14.5 against 15.0). The
  probe is read by height round the turn, not by direction; P6's detail pattern (67 tiles a repeat) was drawn at its
  mean only (drawn since `fix/water-detail`, below).

## The game's still detail on its water (Q9 P6; D496, D497; `fix/water-detail`)

- **P6's role, exactly** (`investigation/notes/water_and_soil.md` Q9): per channel, overlay(a, d) of clean water's
  colour × its flow albedo with `_DetailAlbedoTex` (`PhysicalWaterDetailAlbedo`) sampled still at xz × 0.015 (ps
  462-477), with no weight, depth or contamination in it; badwater's base colour takes the same sample, mixed in by
  (1 − c / 2) × (1 − the source mask). The game's Low quality draws it too (its variant without
  `_HIGH_QUALITY_WATER_ENABLED`), so the light look draws it as Standard and High do.
- **The texture, measured** (`tools/game-water-shader.py --textures`; numbers only): 2048² over a 66.7-tile repeat,
  mean 69.7/88.7/95.3, spread 9.9/8.9/3.7. Nearly all of it lies along one axis (0.73, 0.656, 0.192): spread 13.6,
  skewed bright (+1.98; −19.9 to +99.5), features about 1.5 tiles across, its power mostly between 4 and 32 tiles. The
  second axis (spread 2.7) is a quadratic in the first (0.9 left over); the third is nothing.
- **Ours** (`waterTextures.ts` `GAME_DETAIL_TEXTURE`, `makeDetailField`): a spectral field at the game's band powers,
  remapped to its percentiles, in badwater's texture's B byte (512² over the same 66.7 tiles); the colour is the
  quadratic in that byte (`DETAIL_COLOUR`, `waterDetailAt`). Its statistics are the game's within 0.3 in the mean, 2%
  to 5% in the spread, 3% in the feature size (`tests/unit/water-detail.test.ts`, on the bytes as stored, each held
  to 0–255). All three looks set `waterDetail` from it before any shading; mirrors take its mean. It is made in the bake
  worker: Standard and High with the water's other patterns (the whole bake about 0.9 s off the page's thread, as dev's:
  the FFT's twiddles made once and the rank remap a typed sort), the light look on its own (`detailTexture`, about
  0.1 s), since it reads no other pattern.
- **#842's notes:** the probe now has mip 3 (`WATER_PROBE`, the glossiest clean water reads mip 3.7); the glint's
  roughness floor is URP's 0.0078125; the light look's slopes doc reads "from half a level". The gap is printed by the
  judge for the shipped build against the game's frames ("the gap by day"); `WATER_LIGHT.gap` records it.
- **Judged** (`tools/water-pixel-judge.ts`, dev with #842 → this PR). Sixteen day-lit start shots, clean water
  (37,853 tiles): RMS Standard 10.0 → 10.2, High 9.9 → 10.1 (a pattern not in phase with the game's adds a little per
  pixel). L* and the tiles' RGB spread by band, game / dev / PR, Standard: 0.05–0.5 39.2 (15.3/13.9/13.4) / 41.1
  (16.1/13.9/14.2) / 41.1 (16.2/14.2/14.2); 0.5–1 31.9 (11.5/9.8/7.8) / 33.1 (12.8/10.2/6.7) / 33.0 (12.9/10.6/6.8);
  1–2 31.4 (11.4/10.5/9.2) / 31.8 (12.5/10.1/8.2) / 31.8 (12.5/10.2/8.3); 2–3 27.0 / 27.9 / 27.9; 3– 22.3 / 21.2 /
  21.2; High within 0.1 L* of Standard's. Badwater by day (172 tiles) 14.2 → 14.2, 15.0 → 14.9; at the six end shots'
  hours (4,592) 7.1 → 7.1, 7.5 → 7.5, a level or two deep L* 27.8 / 27.0 against the game's 28.6, unchanged. The mean
  doesn't move (the overlay is linear in the detail) and the tiles' spread grows by under 0.5: at the shots' distance
  the pattern is as faint as the game's.
- **The gap by day (D496):** Standard 6.5 (on the frames' top bound, dev) → 6.3, within 3.1 to 6.5; High 7.3 → 7.1,
  still wider. `look-high.spec.ts` now renders two pools through the shipped shaders and holds the order in both
  looks; the band itself is judged on the game's frames, since the game never drew that scene.
- **The sheet:** `docs/sheets/water-detail.jpg` (`tools/capture-water-detail.ts`): dev against this PR, Standard and
  High: a lake close up, the opening camera, a river, a shallow shore and the farthest zoom, where the 67-tile repeat
  doesn't show.
- **Falls short:** High's badwater is still 2.2 L* under the game's by day, so its gap is wider than the frames
  allow; our pattern is the game's in its statistics, not its texels, so it adds about 0.2 to the per-pixel distance.

## The game's refraction and waterfall mask (Q9 P2, P1; D496, D497; `fix/water-refraction`)

- **Read, exactly** (`investigation/notes/water_and_soil.md` Q9; the game's compute shader `WaterColumnPostprocessor`
  and its water's pixel shader, disassembled, numbers only). The game makes both only with high-quality water
  (`WaterQualitySetting.HighQualityWaterEnabled`: the Medium preset and up; it also turns on URP's opaque texture), so
  Standard and High draw them and the light look, as Low, draws neither. **P1:** `FindWaterfalls`, per tile and stacked
  column, keeps smoothstep(0.35, 0.6, how far its highest linked neighbour's surface stands over its own) (its sixteen
  mesh heights from `CalculateHeights`; a neighbour linked when wet, a corner one only where both tiles between are wet too (read again 2026-11-08: it said dry),
  `BreakCornerLinks`), so the mask lies on the tile a fall lands in, whole from a step of 0.6. The pixel shader reads it
  in four taps ±0.075 round the pixel, weighted by their distance to the nearest tile corner, dry tiles left out, and
  sharpens it, w = saturate(m + smoothstep(0, 0.5, m)); w takes off the refraction and the camera highlight and moves
  the see-through from 0.35 to 0.2 (× 0.5). **P2:** the screen position behind moved by `PerlinNoise3` at (xz + T ×
  0.075) × 1.1, (2n − 1) × (0.003, 0.004) of the screen (one scalar along a fixed direction, not a normal), full within
  40 units of the camera and none past 60, × (1 − w), and kept only where the opaque scene there lies behind the pixel;
  the see-through and the depth are read at the moved position.
- **Ours:** the mask is worked out from our water as the game's (`fallMask.ts`, in the bake worker and the still flow)
  and rides the flow texture's A (0 dry, 1 + 254 × the mask), read by `waterFallMask` as the game's pixel shader; the
  fall faces keep their own see-through by the face, in every look. The refraction (`refraction.ts`): the screen as
  drawn before the water is copied once a frame, just before the first water (a `FramebufferTexture`, the water meshes'
  `onBeforeRender`), and the shader adds (copy(moved) − copy(here)) × (1 − α) / α, so the blend gives the game's
  composite. Its noise is the pattern texture's value noise at PerlinNoise3's measured statistics (half-width 0.0345
  tiles, mean −0.064, spread 0.607 against our 0.600; `tests/unit/water-refraction.test.ts`). No copy while no water can
  be within 60 of the camera (the opening camera and farther).
- **Cost** (`tools/capture-water-refraction.ts --cost`; a 256² Highlands map, 1280 × 800 on the GPU, a frame drawn and
  finished, median of 120, dev → this PR): Standard close 3.12 → 3.17 ms, High close 4.12 → 4.31 ms; from the opening
  camera, where no copy is made, 4.15 → 4.18 and 6.03 → 5.95. Within High's budget (22 ms) by far.
- **Judged** (`tools/water-pixel-judge.ts --water falls`, the six day-lit start shots, dev → this PR): clean water
  unchanged, RMS Standard 14.3 → 14.3, High 14.1 → 14.1 (8,573 tiles); a fall's foot (103 tiles) 25.5 → 25.4 and
  24.6 → 24.4, its L* 40.3 → 39.7 and 39.9 → 39.2 against the game's 40.0. The probe's frames are 85 or more from their
  water, past the game's falloff, so neither side refracts there: the refraction is judged by its terms and by eye. On
  its own it moves 0.2 % to 0.4 % of a close view's pixels by more than 3 levels (at most 10 to 19): the ground behind
  shimmers, as the game's, by up to about five pixels under 17.5 % of the water.
- **The judge's framing:** a camera fit may take only a field of view of 28° to 46° (round Q8's 31-37°), so `--fit own`
  no longer frames islands-128-1-badtide2-start at 12° from 120 away, on the island alone; each run clears the pairs of
  the runs before it (the 13:15 pairs of the own-fit era had stayed beside new ones), and each pair names the shot its
  camera was fitted on. The shipped default fits each map's start shot, which frames that shot as the game's.
- **The sheet:** `docs/sheets/water-refraction.jpg`: dev against this PR, Standard and High: a shallow stream close, a
  lake's edge, a waterfall close and the falls from the opening camera.
- **Falls short:** in place of the game's depth test (we keep no depth of the opaque scene), the shift is taken off
  where a tile's shore is within its reach, so an object standing in front of the water close by can lend its edge a
  few pixels; the noise is ours at the game's statistics, not its texels; the mask follows our surface water only (a
  cave's water under a surface takes none), and the game eases it from the last tick's to this one's.

## Still films at the shore, High's bed, the sources' own pattern (Q9 V3, P7; D496, D497; `fix/water-shore`)

- **V3, read exactly** (the game's water vertex shader, vs 381-395, 486; its Low quality's program is the same): a shore
  vertex of a still film moves toward its own tile's middle, 0.15 tile across its open side, or along its diagonal by
  0.21 a side where both its sides are open, none between two linked sides (a neighbour is linked when wet), × saturate(2
  − 20 d) × max(0, 1 − 100 |f|). **Ours** (`shoreFilm.ts`): the mesh gives each corner of a film's top, and of the
  curtains hanging from it, its shift × the depth's share (`wshore`; the depth as the terrain's water byte reads it); the
  vertex shader takes the flow's share at the corner from the flow texture, so a flow changing needs no new mesh. A
  neighbour links as the terrain's water byte has it, so a tile whose water the open sky's layer leaves to a layer
  under a roof still links (`WaterLayer.wet`). The terrain draws the margin as dry ground on the same outline
  (`shoreFilmOwn`, `filmInside` its twin for the tests): only an open side's edge bounds it, and only where the film
  draws back there, so a side shared with other water never dries; the fade from dry to wet is centred on the outline,
  a pixel wide. A dry tile beside a film keeps the film's wet blend as far as the film still reaches it
  (`shoreFilmKeep`: none where it is drawn back, all where it flows). So neither our underwater bed nor the
  behind-tint shows in the margin. Only the open sky's layer on its tile's top moves. Our four corners a tile against the game's sixteen vertices: a straight shore is the game's; a corner open on
  both sides is cut a little deeper. Picking, the editing aids, the cutaway and the clear veil read the map's water, not
  the drawn outline (`cutaway.spec.ts` and `look-high.spec.ts` pass).
- **High's bed** (D496 as amended): its poisoned bed (#38) made the ground under badwater its dry contaminated ground,
  darker, and the 17.5 % see-through showed it. Gone: both looks draw the one bed. Judged on the sixteen day-lit start
  shots: High's pure badwater a level or two deep L* 25.3 → 26.2 (Standard's 26.2, the game's 27.4), its RMS by day
  14.9 → 14.3, its gap by day 7.1 → 6.2, inside 3.1 to 6.5; the gap test (`water-sky.test.ts`) covers both looks. The
  bed drawn as the dry ground in both looks (the game's terrain has no underwater input) read darker, 25.4 in both, and
  Standard's RMS 14.2 → 14.7, so the underwater bed stays.
- **P7, read exactly** (ps 356-418, 477, 700-720; the decompiled `Timberborn.WaterSourceRendering`): only the seeps and
  the badwater source carry the pattern, a seep while it can run, a badwater source while its strength is over 0; the
  shape in polar coordinates round the footprint's middle, streaming out at 0.04 a second, s = saturate(8 × shape × k² +
  min(1, 2.5 k⁶)), k = max(0, 1 − 2r); clean water's colour × albedo half way to max(itself, s × the detail albedo);
  badwater's emission pattern toward t9's B and × (1 + s × (`_Water_Source_Color` × 0.8 − 1)), its detail overlay ×
  (1 − s). **Ours** (`GAME_WATER_SOURCE`, `makeSourceShape`, `waterSourcePattern`, `sourceMarks.ts`): the shape our own,
  a spectral field remapped to the game's percentiles (mean 63.5 against 62.9, spread 61.5 against 61.8, its power by
  band within 0.004, half-width 7 % under the game's), in badwater's texture's A, made in the bake worker (the light
  look's job too); every look draws it, under our rings and bubbles (D249, with Markers on). As the game's mask does, the sources'
  texture gives each tile of a footprint its place in it (`SOURCE_FOOTPRINT`), so a pixel reads one texel. A seep in a
  held drought shows none.
- **Cost** (`capture-water-shore.ts --cost`, 120 frames, median): close over the seep Standard 3.23 → 2.98 ms, High
  3.56 → 3.47; from the opening camera 2.67 → 2.53, 3.01 → 2.93: within the runs' noise (a first version reading the
  nine tiles round each pixel cost 0.3 to 0.55 ms close up).
- **Judged** (`tools/water-pixel-judge.ts`, dev → this PR, sixteen day-lit start shots): clean water (37,853 tiles)
  RMS Standard 10.2 → 10.2, High 10.1 → 10.1 (the shift is a few pixels at the shots' distance); badwater (172) 14.2 →
  14.2, 14.9 → 14.3; the gap by day Standard 6.3 → 6.3, High 7.1 → 6.2; the land unchanged. At the six end shots'
  hours: badwater (4,592) Standard 7.1 → 7.1, High 7.5 → 7.0; partly bad (19,318) 9.1 → 9.1, 9.1 → 8.8; clean 3.6, 3.5
  unchanged.
- **The sheet:** `docs/sheets/water-shore.jpg` (`tools/capture-water-shore.ts`): dev against this PR, Standard and High:
  a still lake's shore close, badwater a level or two deep by day, a badwater source and a water seep placed in a lake.
  After the reviews (seams dark along sides shared with other water, now gone), the reviewers' views checked against dev
  close up: those seams, a corner open on two sides, a partly bad river (unchanged in Standard; High's bed at most
  6 of 255 apart), a close waterfall (unchanged) and the highlight and brush over shallow water (drawn as before).
- **Falls short:** a corner open on both sides is cut deeper than the game's, and where two films beside each other
  draw back by different amounts, the margin has a small notch at their shared corner; t9's B is drawn at its mean (our B carries
  the detail albedo); the game's distortion held back over a source and a seep's activation day are not followed; High's
  badwater is still 1.2 L* under the game's by day, as Standard's.

## The land's tone (D497; `fix/land-tone`)

- **The finding** (`fix/water-light` above): grass read about 12 % darker than the game's on the start shots (bias
  11.6 in Standard), cliff faces darker on some shots (bias 13.6), dry ground within 2.5.
- **The cause, by the game's shader** (TerrainURP read again, investigation/notes/water_and_soil.md Q10): grass and dry
  ground take the same light and differ only in albedo, and the game's grass has no moisture term. The game's texture
  means × its ramps × its light, through its fog and post chain, put the start shots' dry tops at 113/116/111 and grass
  at 113/140/80; the game's pixels sit 6–7 over that on both (120/122/115, 119/146/84), so its light is the same for both,
  and ours alone was off on grass: dev drew dry ground 7 over the model and grass 6 under it. Two terms of ours, neither
  the game's: grass ran from a lighter green at the moist area's edge to a deeper one by the water (`moistLow` →
  `moistHigh`, 7 % darker), and the patterns faded with distance: the grass's painted strokes, widened by their
  anti-aliasing at 34 away (where the colours were calibrated) and faded out from afar, left the grass 3.5 % darker from
  100 away than at 34, while the earth's cracks faded the other way (1.3 % lighter).
- **The fix:** grass is one colour at every moisture (`GROUND.grass`; only the desert's share moves with moisture, as
  the game's); the strokes keep their shape (widened by a pixel's footprint, so they read up close and at a grazing view)
  and what the widening adds is taken off the grass (`STROKE_WIDEN_K`: their mean grows by `PAINTED_MEAN` × 12.5 aa /
  (1 + 0.406 aa²), within 1.2 % of `paintedMean` from aa 0.025 to 1.2), and from afar they fade to their own mean
  (`PAINTED_MEAN`, 0.0076); the cracks keep their depth (their texture's mips keep the mean). Grass recalibrated to the
  `Grass` texture's 64² mip × the detail texture doubled, 74.2/80.6/27.4: measured after (`tools/albedo-means.ts`, now
  with `--distance`) 74.4/80.8/27.5 from 34 away and 74.0/80.4/27.5 from 100 in Standard (dev: 73.7/80.2/27.5 at 34, its
  strokes' share lower from 100). The models keep their colours (`ALBEDO_SCALE` held at the grass they took them from).
- **On the judge** (`tools/water-pixel-judge.ts`, now with `--samples`; RMS to the game's pixels and bias, dev → this
  branch):

  | shots | material | Standard | High | floor |
  |---|---|---|---|---|
  | the six clean-water start shots (day) | grass (137) | 15.5 (11.6) → 14.3 (9.9) | 16.7 (12.0) → 15.6 (10.4) | 16.7 |
  | | dry (3,531) | 9.5 (2.5) → 9.4 (2.5) | 9.9 (3.3) → 9.8 (3.2) | 11.9 |
  | | cliff (726) | 18.1 (13.6) → 18.1 (13.6) | 18.8 (14.4) → 18.8 (14.4) | 19.6 |
  | the six badwater frames (sunrise, sunset) | dry (3,592) | 8.4 (2.9) → 8.3 (2.7) | 8.4 (3.5) → 8.4 (3.5) | 10.7 |
  | | contaminated (100) | 5.7 (3.2) → 5.9 (3.7) | 6.6 (4.4) → 6.9 (5.0) | 5.4 |
  | | cliff (409) | 13.6 (9.6) → 13.6 (9.6) | 14.6 (10.6) → 14.6 (10.7) | 16.0 |

  Water unchanged: clean water on the start shots 14.3 → 14.2 (Standard), 14.1 → 14.0 (High); pure badwater on the
  frames 7.1 → 7.1, 7.5 → 7.5.
- **Up close** (the look review of the first version): it box-filtered the strokes by the larger of a pixel's two
  footprints, several times their width at a grazing view, so they read as smudges. At the reviewer's views (orbit 22,
  pitch 0.38, four yaws over River Valley 4242's field at 64.5, −98.5) the near grass's fine-detail contrast (the high-pass
  std of luma over the frame's lower third): Standard dev 5.24/6.07/5.22/4.81, that version 4.77/5.49/4.79/3.59, now
  5.30/6.09/5.27/4.87; High dev 5.57/6.10/5.25/5.02, that version 4.94/5.43/4.81/3.76, now 5.68/6.13/5.32/5.09. The
  field's centre mean from 20 to 180 away is that version's to 0.3 at every step.
- **Dryness shows as the game shows it** (planning's check): every look draws it through the game's desert share, never
  through the darkening this drops. Standard and High blend the share across tiles (`desertBlend`: `tapBlend` and the
  game's noise; High's ground is Standard's `groundColor`, its `moist` hook the same share); the light look takes each
  tile's own share (`grassOf`, no blend, D135). The judge's `--samples` now also takes tops at moisture 1 to 5 (`edge`,
  where the desert covers part of the grass). On the six start shots, how much of grass's green over dry ground the edge
  shows, at moisture 1/2/3/4: the game 0.65/0.81/1.00/0.93, dev 0.84/0.98/1.04/1.03, this branch 0.83/0.98/1.04/1.03 (the
  same: the darkening never carried dryness). Grass over dry ground in luma: the game +10.2, dev −0.2, this branch +2.7.
  Our faintest edge (moisture 1 to 2) reads greener than the game's; the share is the game's formula
  (`UpdateDesertIntensity`), so the gap is elsewhere (its intensity's easing over time, or the noise's), still to find.
  `docs/sheets/land-tone-dryness.jpg` (`tools/land-dryness-sheet.ts`, from the judge's `--ours`): riverValley-128-1-start,
  irrigated and dry side by side, dev against this branch, Standard and High, from the judge's fitted camera; the
  game's frame of it stays out of git (`C:\dgm-probe\shots\20261002-1610-batch\m9b-riverValley-128-1-start-water.jpg`).
- **What's left of grass is where our broad patches fall:** the 137 grass samples sit in a few patches of two River
  Valley shots, and our grass's broad light and dark patches (10–20 tiles across) decide their mean. Moving those
  patches (three other offsets, judged the same way) gives grass bias 4.5, 6.9 and 5.2 against 9.9 as shipped. The
  offsets are not changed to suit the judge.
- **Cliffs are the samples, not the light:** where the game's pixel and ours both show a face, ours reads 2–4 darker
  (the start shots: 65/83/82 against 63/80/80, 81/99/96 against 77/97/95, and so on). The bias comes from 17 % of the
  samples (124 of 726; 65 on highlands-128-1, fitted at 85 %), where the game's pixel shows a top's colour
  (114–122/116–120/96–112) while ours shows the face: the fitted camera puts the 5 × 5 patch a few pixels off a face
  12 pixels tall. The game's cliff albedo is `CliffDetail` × the gradient (ours matches it, 67.9/62.0/51.9), with no
  detail texture; nothing in its light differs from a top's but the normal.
- **The sheet:** `docs/sheets/land-tone.jpg` (`tools/capture-land-tone.ts`): dev against this branch, Standard and High,
  grass by the water, a grassy valley from 100 away, a cliff, dry ground, and the light look (software) from the valley.
- **Falls short:** the residual 2–4 on cliff faces (perhaps the game's normal map on the triplanar cliff, or the SH's
  side term, which a frame capture would settle); contaminated ground on the badwater frames 0.5 darker (the cracks now
  as deep from afar as near); High's grass close up reads 69/78/31 from 34 away (its broad variation over the few views),
  73.2/79.8/27.3 from 100.

## Dry land that reads dry (D135, D497; `fix/dry-land`)

- **The finding:** on the game's riverValley-128-1 start shot grass reads +14.0 luma over dry ground, ours +2.7 (+10.2
  and +2.7 over the six start shots). Dry ground itself was within 1 of the game's (judge bias 0.9 in luma); the gap
  was grass on that shot, and how the two vary.
- **The game's numbers, read from its files** (2026-11-08, Timberborn 1.1.2.8; numbers only, nothing of the game's in
  git): `SoilMoistureMap.blueprint` (`MaxDesertIntensity` 0.7, `DesertMoistureThreshold` 5) and
  `TerrainMaterialMap.blueprint` (margin 0.2, noise multiplier 0.96, softness 5.8, `BlendingNoiseScale` 0.2) are ours
  already. Three things were not:
  - **The blending noise.** The game's `BlendingNoise` texture (read at world × 0.2, so it repeats every five tiles) has
    mean 0.473 and spread 0.081, and most of its variance lies in features half a tile to two tiles across. Ours had mean
    0.50, spread 0.095, and features four times as broad (spread over one-tile blocks 0.072 against the game's 0.025).
    Ours is now two octaves of value noise at 3 and 6 cells a tile, held to the game's mean and spread (`BLEND`,
    `blendNoise`). Contamination's weight reads the same noise, now at the game's statistics too.
  - **Moisture unrounded.** The game takes a tile's moisture as it is (1.3, 2.6, …; only 31 of 248 edge samples on the
    start shots sit on a whole level); ours rounded it to the whole level. The tile data's B, unused since D497, now holds
    the game's desert intensity from the moisture byte (light.ts `desertByte`, a byte as the game's own RG16 map), and
    a top's share reads it (`grassAt`). Run tops (caves' floors) keep the whole level, which is all their soil carries.
  - **How the ground varies.** The game's `Desert` × `GrassDetailsAlbedo` × 2 varies in luma over blocks of ¼, 1, 4 and 8
    tiles by 9.4, 7.7, 5.3 and 3.4 % of its mean; our dry ground by 6.5, 4.8, 2.9 and 1.9. Its grass by 10.8, 9.1, 5.7 and
    3.6; ours by 12.5, 10.3, 8.0 and 6.8, and the dark patches of it fell on the shot's grass. Dry ground gets a broad
    shade of its own (`DRY_BROAD`), grass's broad shade is cut from 0.27 to 0.15 (`GRASS_BROAD`), both means held.
- **Measured in the page** (`tools/ground-variation.ts`: a flat map of one soil, the shader patched to its albedo, from
  100 away; Standard, base → this branch): the grass's share at moisture 1/1.5/2/2.5/3 is 0.29/0.78/0.78/0.99/0.99 →
  0.36/0.67/0.88/0.98/1.00, the game's formula with its own noise 0.36/0.66/0.88/0.97/0.99. Dry ground's spread over
  ¼/1/4/8 tiles 9.0/7.8/5.6/3.6 %, grass's 11.0/8.4/5.3/4.1 %. Means held: dry 69.3/57.2/46.5 → 69.2/57.2/46.4, grass
  73.3/79.5/26.1 → 73.8/80.0/26.2. High adds its own broad variation (#65) on top: dry 9.8/8.6/6.6/5.0, grass
  11.6/9.2/6.5/5.4.
- **On the judge** (`tools/water-pixel-judge.ts --samples`, the six start shots; base → this branch): grass over dry in
  luma +2.7 → +4.4 (Standard), +2.2 → +3.8 (High), the game +10.2; on riverValley-128-1, +2.7 → +5.0 and +1.9 → +4.2,
  the game +14.0. Grass RMS 14.2 → 13.2 (bias 9.9 → 8.7) in Standard, 15.6 → 14.6 (10.4 → 9.3) in High. Dry ground's
  RMS rises 9.4 → 10.6 (bias 2.5 → 2.7) and 9.8 → 10.8, under its floor of 11.9: its spread is now the game's, and two
  patterns of the same spread that don't line up sit further apart pixel by pixel than a flat one does. On the
  badwater frames, contaminated ground 5.9 → 7.2 and 6.9 → 8.1 (100 samples, floor 5.4), dry 8.3 → 9.0 and 8.4 → 9.0
  (floor 10.7). Water unchanged.
- **The sheet:** `docs/sheets/dry-land.jpg` (`tools/land-dryness-sheet.ts`, from the judge's `--ours`): riverValley-128-1,
  base against this branch, Standard and High, from the judge's fitted camera.
- **Falls short:** grass on riverValley-128-1 still reads 7–9 under the game's. The rest of the gap is grass's light,
  not dryness: against Q10's model of the game's terms our dry tops sit about 5 over it and our grass about 2 under,
  while the game's pixels sit 6–7 over it on both. The edge tiles (moisture 1 to 2) still read greener than the game's
  (0.86 of grass's green against 0.65), though our share by moisture is now the game's formula to 0.01; the snapshot's
  moisture may be ahead of the frame's at the start, while the band still spreads. Contaminated ground's RMS rose with
  the dry ground's spread under it.

## Grass in the game's light (D497; `fix/grass-light`)

- **The finding:** after `fix/dry-land`, grass tops on the six start shots still read 7–9 luma under the game's frames
  (judge bias 8.7 in Standard, 9.3 in High; dry ground 2.7 and 3.3). The light is not why: grass and dry ground take the
  game's light to about a luma each. The gap is where the samples fall on two textures, the game's and ours, plus one
  shadow edge.
- **The game's numbers, read from its files** (2026-11-08, Timberborn 1.1.2.8; numbers only): TerrainURP lights grass
  and dry ground alike (albedo × 0.912 × (Trilight SH + sun × n·L × shadow), small specular, fog, post chain). The Grass
  material's other values change nothing between them: emission 0, grayscale 0, normal-map strength 0, smoothness the
  glossiness × the splat filter (0 on tops), splat gradient 1. Only the albedo differs.
- **The game's texture at the samples:** the judge's grass samples cluster (160, 108 of them on riverValley-128-1). The
  game's `Grass` (world xz / 16) × `GrassDetailsAlbedo` (xz / 32) is world-anchored (orientation correlation 0.58 grass,
  0.56 dry, ≤ 0.23 any other way), and round those 108 samples it is 4.1 % over its mean: +2.7 luma of the gap is the
  game's own texture there (`tools/land-texture-check.py`, numbers only, nothing of the textures written). Our light on
  the game's texture means (the judge's `--define GROUND_MEANS`) against the game's pixels with that texture taken out:
  grass +1.3, dry +1.0 in Standard; +1.6 and +1.0 in High.
- **Our pattern at the samples:** at the shipped placement our grass pattern reads 3.7 luma under its own mean at those
  samples (Standard; 4.6 High), dry ground 0.6. Moved by three arbitrary offsets it reads −0.6, +0.6 and −0.3: luck of
  placement, not the pattern's mean, which `tools/albedo-means.ts` holds at the game's. Grass over dry at the three
  offsets, Standard pooled: 7.9, 9.5, 8.5 (the game's 10.2; riverValley-128-1: 9.0, 11.9, 7.7 against 14.0).
- **Standard's shadow edge, as the game's.** A column of grass at riverValley-128-1 (x 14.5, y 104–111) beside a
  cliff's shadow is lit in the game's frame and in High but read 5–7 luma dark in Standard. Its edge was an angle: two
  sweeps at the sun's elevation ± 6° spread it the more the higher the cliff. The game's is a shadow map's few texels,
  the same width under any cliff. Measured (`tools/shadow-edge-check.py`: the hard shadow's edge found on flat, dry,
  plant-free open ground, the lines across it averaged by shot and cliff height, a blurred step fitted; the 10–90 %
  width at right angles to the edge, in tiles of ground, through the frame's pixels; 129 + 70 lines under cliffs of
  six levels or more, 69 of four or five, 59 of two, on five start shots):

  | cliff | game | ours, 6° | ours, 2° | ours now (0.35) | High |
  |---|---|---|---|---|---|
  | 2 levels | 0.38 | 0.74 | 0.49 | 0.41 | 0.51 |
  | 4–5 | 0.50 | 1.84 | 0.71 | 0.55 | 0.59 |
  | 6 or more | 0.36 | ≥ 2 | 0.92 | 0.34 | 0.54 |

  The game's settings (Timberborn 1.1.2.8, numbers only): one URP asset (`globalgamemanagers.assets`), one cascade,
  soft shadows at High quality (URP's 7 × 7 tent); the main light's map by `ShadowQuality` (Low 1024, Medium 2048,
  High 4096, Ultra 8192; the default preset High); the shadow distance `ShadowDistanceUpdater` sets every frame (the
  farthest screen corner on y = 0, at most 150), though the probe's shots set it to 2.5 × the pose's distance
  (ShotTaker.cs), and its game ran the Medium preset. Fitted in a sphere round the view to that distance, a texel is
  0.16–0.20 of a tile in those frames, so a 7 × 7 tent (about 3.95 texels, 10–90 %) would read 0.84–1.08 on the ground:
  the frames read about 1.4 texels. Either the filter is lower or the texel smaller than that reading; either way the
  width is texels, the same under any cliff. So the baked edge is now a constant width (`LIGHT.edge`; `LIGHT.penumbra`
  0), the game's in play, worked out from those frames and the game's settings (no probe batch: the probe's shadow
  distance is not what players get, D483):
  1. *The multiple.* Through the same measure our edge reads as the game's at 0.35 of a tile along the sun's way (0.3
     read 0.33 and 0.4 read 0.46 over all the lines, the game 0.39), 0.35 × sin 45° = 0.247 of a tile across the
     light. The six shots' texels (2048, the probe's 2.5 × distance, a 16:10 frame) are 0.156–0.199, mean 0.183, so
     the game's edge is 0.247 / 0.183 = 1.35 texels (1.24–1.59 by shot): about 1.4. The frames' own blur cancels, as
     ours went through the same pixels.
  2. *The texel in play.* The default preset High: 4096, one cascade, a shadow distance of at most 150 (the farthest
     screen corner on y = 0, which a usual play view passes). At the camera's fov 40.3° on a 16:9 screen the sphere
     round the frustum to 150 has a radius of 116.9, so a texel is 2 × 116.9 / 4096 = 0.057 of a tile (0.054 at
     16:10). Closer in, the distance and the texel shrink.
  3. *The edge.* 1.4 × 0.057 = 0.080 of a tile across the light; along the sun's way, / sin 45°, 0.113. `LIGHT.edge` is
     0.11.
  4. *What the bake resolves.* North-south cliffs of 1 to 14 levels on flat ground (their shadows' ends at every phase
     between the samples), read as the shader reads the bytes (bilinear, the 0.11-level step), give a ramp 0.71–1.22 of
     the width asked and a middle −0.03 to +0.06 of a tile off the true line, alike at every width from 0.05 to 0.35:
     the samples and the bytes set those, not the width, so the half-tile bake resolves 0.11 as cleanly as 0.35. The
     screen is the limit: from far out a pixel spans more than 0.11 of a tile, so the shader keeps the ramp at least a
     pixel wide (`sunPx`, the change across the pixel of the height over the shadow's top), and the edge never steps.
- **The bake's speed (D453).** The walk is exact per sample (every tile entered toward the sun, none it only touches at
  a corner), and fast: it walks once (no penumbra), over a window of the map round the samples asked, skipping blocks
  of 4 and 16 tiles whose highest tile cannot rise over the top so far, and a strip of 16-blocks toward the sun at once;
  the first 16 tiles' crossings from each of a sample's four positions in its tile are a table. Medians of 15 bakes
  each, dev and this branch interleaved (Node, the probe's maps; 512² is each map tiled 2 × 2):

  | map | 256² dev | 256² branch | 512² dev | 512² branch |
  |---|---|---|---|---|
  | chaos-256-1 | 17.6 | 18.8 | 78.2 | 71.5 |
  | chaos-256-2 | 20.9 | 21.9 | 81.7 | 81.0 |
  | slow-lb-16-256 | 19.4 | 15.9 | 87.2 | 69.4 |
  | gentle-lb-24-256 | 18.4 | 15.0 | 76.2 | 62.4 |

  A brush dab's terrain update (`flushTerrain` after a 5 × 5 raise, 300 dabs at random on a 256² map, in Chrome; ms,
  median and 90th centile): riverValley Standard dev 1.33–1.44 / 2.5–2.6, branch 0.84–1.19 / 2.0–2.5; mountains dev
  1.21–1.36 / 2.3, branch 0.86–0.98 / 2.1; riverValley High dev 1.42 / 2.55, branch 1.10 / 2.38. (`npm run
  bench:brush` waits on a stroke the page no longer paints that way and times out on dev too.)
- **#853's review notes:** the light look's soil and contamination took the blend noise at 0.5; they now take the mean of
  the blend over the game's noise (its mean 0.473 and spread 0.081, a five-point Gauss–Hermite sum, `noiseMean`), so
  its grass share by moisture is the game's formula's (0.36/0.66/0.88/0.97/0.99 at 1/1.5/2/2.5/3). A cave's mouth had a
  seam: an open top counted the cave column beside it as desert and a cave floor took its open neighbour's rounded
  moisture, so a brown fringe showed on the open side only; both sides now read each other's desert intensity
  (`runDesert`, the run tops' `grassOf`). The `DESERT` and `soilOf` comments say what the tile data carries.
- **On the judge** (six start shots; `fix/dry-land` → this branch): Standard grass RMS 13.2 → 12.8 (bias 8.7 → 8.4),
  dry 10.6 (2.7), cliff 18.1 → 18.4 (bias 13.6 → 13.8), edge unchanged; High unchanged (grass 14.6, bias 9.3).
  Grass over dry, Standard 4.4 → 4.7 (riverValley-128-1 5.0 → 5.4), High 3.8; the game 10.2 (14.0). The 2° edge read
  grass bias 7.8 and grass over dry 5.2: it lit that column by spreading the edge into the shade, not as the game does.
  Clean water's RMS 14.4 in Standard, 14.1 in High, as dev. The badwater frames were not run: nothing on water or
  contamination changed outside the light look and the shadow's edge. At 0.11 the edge reads 0.18–0.26 under cliffs of
  four levels or more through the probe's measure (the game's probe frames 0.33–0.64 there, at their coarser texel):
  the edge players get is about a third of the probe's, and the frames' pixels set the rest.
- **The sheet:** `docs/sheets/grass-light.jpg`: riverValley-128-1, dev (`fix/dry-land`) against this branch, Standard
  and High. Standard's shadows end crisp and stepped as the cliffs are; High is unchanged.
- **Falls short:** grass on the judge still reads several luma under the game's: about 2.7 of it the game's texture
  where the samples sit, about 1–4 our pattern's placement there, a luma the light. A judge that samples more grass
  across more shots would read it truer; changing either pattern to suit these samples would not be drawing as the game
  draws. High's edge read 0.5–0.6 in the probe's measure; it is the game's now as near as its depth map allows ("High's
  shadow edge", below). The bake still keeps two tops a sample (the same now, copied). The 1.4 texels rest
  on the probe's Medium frames and the cascade's sphere fit; a frame at the default preset would check them. The edge
  tiles' greenness (#853's falls-short) is untouched.

## High's shadow edge (D497; `fix/high-shadow-edge`)

- **What it was.** High's sun shadows come from a 2048² depth map of the real meshes (`high/shadows.ts`), framed as a
  square of ±(0.76 × the map's side + 24) round the map whatever the sun's turn, read with 25 nearest taps 0.8 of a
  texel apart (a box about four texels across). Over a 128² map a texel was 0.118 of a tile, so the edge was about
  3.2 texels, 0.38 across the light and 0.54 along the sun's way: the probe's measure read 0.49–0.79. The game's in play
  is 0.11 along the sun's way ("Grass in the game's light", above), as Standard's is since #855.
- **What it is now.**
  - The map is framed to the map's box (its tiles, from under the floor to the tallest caster, 32 levels) as the sun
    sees it at each turn: a rectangle in the light's plane. The map stays 2048²: a texel is now 0.06–0.09 of a tile
    over a 128² map and 0.10–0.18 over a 256² one, by the turn (the game's in play: 0.057). The game's own High
    preset's 4096 (0.03–0.045 and 0.05–0.09) waits on the gate below.
  - It is read as four bilinear compares (each one the share of its four texels the point is in front of, fetched, so
    no gradient is taken in a branch), spread so that the edge is the game's (`LIGHT.edge` along the sun's way), never
    under half a texel apart (closer, one compare's own texels show as steps) nor under half a pixel (a far view's edge
    would step). A 2 × 2 of bilinear compares turns over about 0.8 × (a texel + the spread). At 2048 the half-texel
    floor binds: 1.6 texels, 0.13–0.17 of a tile along the sun's way over a 128² map and 0.23–0.31 over a 256² one. At
    4096 it reaches the game's 0.11 over a 128² map (0.11–0.15 over a 256² one).
  - The pass writes depth alone (no colour; the colour target a byte a texel).
- **Measured** (`tools/shadow-edge-check.py` on the judge's six start shots, through the probe's frames' pixels; the
  10–90 % width at right angles, tiles; the game's column is the probe's coarser shadow map, not play's):

  | shot | cliff | game (probe) | Standard dev | Standard now | High dev | High now |
  |---|---|---|---|---|---|---|
  | highlands-128-1 | 2 | 0.38 | 0.74 | 0.23 | 0.51 | 0.21 |
  | highlands-128-1 | 6+ | 0.64 | ≥ 2 | 0.26 | 0.49 | 0.26 |
  | highlands-128-2 | 2 | 1.15 | 0.69 | 0.18 | 0.49 | 0.18 |
  | highlands-128-2 | 4–5 | 0.36 | 1.77 | 0.18 | 0.49 | 0.18 |
  | lakeBasin-128-2 | 4–5 | 0.62 | 1.90 | 0.46 | 0.67 | 0.28 |
  | lakeBasin-128-2 | 6+ | 0.33 | ≥ 2 | 0.23 | 0.54 | 0.26 |
  | riverValley-128-1 | 6+ | 0.33 | ≥ 2 | 0.18 | 0.54 | 0.21 |
  | riverValley-128-2 | 2 | 2.02 | 1.44 | 0.36 | 0.79 | 0.28 |
  | riverValley-128-2 | 6+ | 0.33 | ≥ 2 | 0.23 | 0.56 | 0.23 |

  ("Standard dev" is the judge's base, before #854; "High now" at 2048.) Both looks now read alike, 0.18–0.28 where
  the frames' pixels allow. The judge's land is unchanged in High (grass 14.6, bias 9.3 → 9.4; cliff bias 14.3 → 14.2). (At 2048, the
  4096 take, High read 0.13–0.28: 0.18, 0.23, 0.15, 0.13, 0.28, 0.26, 0.18, 0.21, 0.21.)
- **No acne, peter-panning or new shimmer.** The close frames of caves and overhangs (`capture-forms-read`) show none.
  As the sun turns a quarter of a degree a step (13 steps, the water held still, Canyon's 128² view at 20 and 45
  tiles), the pixels whose luma goes both up and down by 4 or more were 7.3 % and 3.3 % of the frame on dev, where
  the 25 nearest taps crawl in broad bands, and are 3.0 % and 1.6 % now (1.9 % and 0.9 % at 4096), along the edges'
  own pixels.
- **Speed (D453; Chrome, GPU-synced by a one-pixel read, medians of 100 passes and 200 frames, ms; three runs each,
  dev and this branch interleaved, riverValley seed 1; this machine's RTX 2070 SUPER):**

  | | 128² dev | 128² 4096 | 128² 2048 | 256² dev | 256² 4096 | 256² 2048 |
  |---|---|---|---|---|---|---|
  | shadow pass | 1.43–1.54 | 1.87–2.08 | 1.41–1.98 | 1.04–1.90 | 1.93–2.45 | 1.71–1.78 |
  | frame | 1.72–2.11 | 1.94–2.19 | 1.66–2.11 | 2.63–3.51 | 2.47–3.07 | 2.63–2.91 |
  | a turning frame (pass and frame) | 1.92–2.47 | 2.36–3.34 | 2.06–2.20 | 3.38–3.81 | 3.53–3.75 | 3.56–3.63 |

  The pass at 4096 costs about 0.4 ms more, most of it the trees' fill (writing depth alone, dropping faded objects in
  the vertex shader and front faces alone saved none of it). Planning would take 4096 (the game's High's, D496) on one
  condition in place of dev's speed: the smoothness gate's slower profile, the integrated GPU with the CPU 4× slower,
  orbiting at 256², stays inside its budget with no new frames over two refreshes. That profile cannot run on this
  machine (one GPU), and `npm run smooth` is broken on dev: it waits on an "All N checks passed" line the page no
  longer shows, and times out. In its place, the orbit (High, 256², seed 4242, ten seconds, the sun turning with the camera, a depth pass
  every half degree) timed by animation frames in headed Chrome on the discrete GPU, natively and with the CPU 4×
  slower, with other sessions busy on the machine:

  | | dev | 4096 |
  |---|---|---|
  | native: median / p99 / worst, ms | 7.0 / 7.0–21 / 14–84 | 7.0 / 7.1–230 / 14–517 |
  | native: frames over 33 ms | 0, 0, 0, 6 | 0, 0, 1, 1, 26, 90 |
  | CPU 4×: median / p99 / worst, ms | 14 / 28–56 / 42–181 | 7–20.5 / 28–77 / 42–119 |
  | CPU 4×: frames over 33 ms | 15, 19, 13, 5 | 11, 10, 19, 6, 17, 72 |

  Natively both hold the display's 144 Hz, but two of six 4096 runs stalled for a quarter to half a second (26 and 90
  frames over 33 ms), against one of four dev runs (6). That leans against 4096, so planning's fallback applies: the
  map stays 2048 (`SHADOW_SIZE`), which keeps the pass at dev's.
- **Falls short:** High's edge at 2048 is 1.2–1.5 × the game's in play over a 128² map and 2–3 × over a 256² one.
  4096 reaches the game's 0.11 and waits on the igpu-4x gate (integrated GPU, CPU 4× slower, 256², the sun turning),
  run on a machine with an integrated GPU, with `npm run smooth` mended first.

## Falls as the water below's slope (D154 amended 2026-11-08; `fix/falls-as-slopes`)

- **What the game does** (decompiled `Timberborn.WaterSystemRendering` `WaterMesh`, and its compute shader
  `WaterColumnPostprocessor` disassembled from `resources.assets`; numbers only): every water tile is a grid of four
  by four vertices (0, ⅓, ⅔, 1), split along the anti-diagonal, and `CalculateHeights` raises each vertex to its linked
  neighbour's surface across a side it lies on, to that surface less 0.3 a third of a tile in, and to the linked corner
  neighbour's (less 0.3 unless on both sides), never below its own. So a fall is the lower tile's own surface rising to
  meet the water above: its edge at the upper surface, 0.3 lower a third in, its own surface from two thirds in; no
  face of its own. It is lit with the up normal and its flow textures, sampled at the world's xz, stretch and pour
  down it. `FindBestProperties` hands the slope its highest linked neighbour's outflow (edges) and contamination
  (edges and corners) by saturate(the rise). A neighbour is linked only where its surface stands under the tile's
  ceiling (`ProcessColumns`). A corner is linked only where it and both tiles between are wet
  (`BreakCornerLinks`); `fallMask.ts` had that turned round (both between dry), so its mask read water across a dry
  corner and missed the corner of a fall: corrected, and the mask is now smoothstep(0.35, 0.6, `tileRise`).
- **Ours** (`render3d/fallSlope.ts`): `slopeHeights` makes the sixteen heights for any wet tile with a vertex 0.02 or
  more over its own surface (`SLOPE_MIN`; under it, the one flat quad as before, so still water meshes byte for byte as
  dev's), `slopeTop` draws them as nine quads with the up normal in both looks and the Light look (one mesh). A raised
  vertex's depth is what the game's camera sees through there (its pitch, 60°: the gap to the cliff or the upper
  water's floor along the view, never more than its height over its own floor), the rest bilinear from the tile's
  corners. Badwater and the current are handed over before the blend and the flow (`handOver`, `handedWater`;
  `current.ts` `gameFlowOf`), so a badwater fall keeps its colour and the slope runs with the fall's current. No curtain
  between two waters any more; the water's side hangs toward lower dry ground and at the map's edge, in three segments
  along a slope's edge. The water's data never changes (D342, D497).
- **Skirts** (#867's review): where two wet tiles' tops part along their edge (a corner neighbour linked to one and
  not the other, or a neighbour not linked), the higher hangs a skirt down to the lower one's height at each vertex
  (its grid's, where it is a slope), as the game's water vertex shader drops each tile's side skirt; drawn as the
  surface going on (`SKIRT_FLAGS`). A skirt, and any side of a fall's slope, takes the tile's own badwater share (the
  fall's, handed over), as the game's skirt takes its own tile's properties: before, the corners' blend with the water
  beside it drew a clean fall's skirts red-brown over a badwater pool (#867's look review). Open edges (`tests/fixtures/openWaterEdges.ts`: a gap of 0.025 or more between the
  two tops with no water side or ground across it), before → after: Canyon 3 at 256² 27 → 0, Highlands 2 25 → 0,
  Canyon 2 28 → 0, Canyon 1 at 128² 8 → 0, Canyon 2 at 128² 12 → 0 (among them the look review's pale sliver along
  its narrow badwater fall, tile 31,119: the canyon's ground through the window at x = 31) (`waterSkirts.test.ts`,
  its 256² maps in `waterSkirts.heavy.test.ts`).
- **The ceiling rule:** each layer's water keeps its tiles' ceilings (`SurfaceWater.ceiling`, waterLayers.ts), and a
  tile links a neighbour only where the neighbour's surface is not over its ceiling, so a tunnel's slope never rises
  into its roof toward higher open water outside. `LAYER_REACH` 4 → 5: the hand-over reads a tile further. A corner
  links as `BreakCornerLinks` reads it: the corner tile's own links toward the tiles between (a cave's mouth, where
  their ceilings differ: `waterSkirts.test.ts`).
- **The share at once:** since #865 the tops read their badwater share from the flow texture's B, which `writeShare`
  (high/flow.ts) fills on every water change; it hands the share over itself, as the bake does (the same bytes on the
  three 256² maps), so a fall's slope carries the fall's share from the frame the water comes, no bake behind it
  (`stillFlow.test.ts`). Rows with no badwater within a row of them skip the search: at 256² in Node, the least of 300
  runs, 0.18–0.25 ms → 0.28–0.36.
- **The cut:** a slope's vertex carries a cut share under −0.5 in place of its wet share (`slopeCutShare`: whether it
  is a third in, and how far it stands over the floor of the water it rose to); sliced, it lies on the cut with the
  depth seen behind it from there as from its own height (`cutWater.ts` `cutSlopeDepth`): against the cliff where the
  cut is under the upper water's floor (0.05 at the lip, 0.58 a third in), else into the upper water to its floor.
  The first reading took the water's depth from its floor up to the cut, several levels: a dark navy patch at a
  sliced fall where dev drew teal. A side's vertex standing over its column's surface (a slope's edge, a skirt) is
  sliced by its own height, so it stops at the cut too (it stood over it). A fall whose upper water the cut took keeps
  its slope up to the cut (`tests/unit/cutWater.test.ts`).
- **Re-based (D148):** the curtain tests in `look-waterfalls`, `look`, `render3d`, `look-badwater`, `cutWater`,
  `waterLayers` and `caveCurrent` (the tunnel's fall is its water's slope under the roof); the corner rule in
  `water-refraction`; the fixture mesher mirrors the slope.
- **Judged** (`tools/water-pixel-judge.ts --water falls --look both`, the six day-lit start shots, dev → this branch,
  RMS to the game's pixel): a fall's foot (103 tiles) Standard 24.8 → 24.0, High 24.1 → 23.4; clean water (8,573) and
  the land unchanged (14.4, 14.2; 12.3, 12.6). The sheets: `docs/sheets/falls-slopes-canyon.jpg`,
  `falls-slopes-riverValley.jpg` (each map's tallest and strongest fall at 60° and 35°, Standard and High) and their
  `-light` pair (`tools/capture-falls-slopes.ts`).
- **Speed** (D453): the water meshed whole in Node at 256², min of 20, Highlands 2 26.2 → 25.2 ms, Canyon 3 31.2 →
  27.3, River Valley 2 25.7 → 25.5, with 25–28 % more water quads (a slope's nine). High at 256² on the GPU
  (`--bench`, three rounds): frame time p50 7.0 ms on both, the render call the same (1.2–1.5 ms), the GPU's 2.2–3.3 ms
  on both; the build's median Highlands 561 → 549 ms, Canyon 520 → 586 (rounds of one tree vary by ±90).
- **Falls short:** our links take a neighbour as linked where it is wet and under the ceiling, with no barriers (none on
  our ground) and the ceilings as each layer of waterLayers.ts sees them; a slope's seen depth is worked out along the game's pitch, not
  read from a depth buffer.

## The foam in the Flow view alone (D497; `fix/foam-to-flow`)

- **Why.** The game's water has no foam term (`docs/progress/water-character-audit.md` on
  `docs/water-character-audit`, gap 2), but ours drew foam threads, wakes and seams on every fast river in both looks,
  always on (D353, D446, D154). Planning's ruling on #236 (2026-11-08, under D497): they move to the Flow view, the
  editing aid's own channel, and the river itself is drawn as the game draws it.
- **What changed.** `motion.ts`: the cues mesh is hidden outside the Flow view, as its streaks were; the Flow view shows
  both exactly as before. Outside it the bake makes none of their shapes (`high/bake.ts`: a flow job with `shapes`
  false skips the current and `motionShapes`, and sends `noShapes()`); the flow texture the surface moves by is the
  same byte for byte (`tests/unit/flowViewFoam.test.ts`). A switch to the Flow view bakes the last water again at
  once with the shapes: a bake waiting to start starts then, and one already sent is dropped (#866's look review found
  the first switch waiting about half a second for a queued bake). Both programs are compiled ahead with the others
  (`scheduleWarm`), so the first switch compiles nothing. The light look drew neither the foam nor the streaks before (no moving water in software), and still
  draws neither. The Flow toggle's tooltip is "Show the currents, foam and wakes".
- **Measured** (`tools/capture-foam-flow.ts`, River Valley 128² seed 2, its fastest narrow river, the game's 55°
  pitch, the clock held, real Chrome on the RTX 2070 SUPER, dev against this branch). Flow off: Standard 4,021 pixels
  (0.39% of the frame) close up and 7,380 (0.72%) at 35 units, darker by 8.2 and 8.4 L* on average, 32 and 44 at
  most; High 4,019 and 7,340, 8.3 and 8.5, 33 and 45. Flow on: 0 pixels in both looks. The light look: 0 either way.
  Sheet: `docs/sheets/foam-flow.jpg`.
- **The probe frames** (`tools/water-pixel-judge.ts --water all`): unchanged, as the snapshots carry no outflows, so
  neither build draws any foam there. RMS to the game, dev and this branch: Standard clean 3.5, mixed 9.1, bad 7.1;
  High 3.5, 8.8, 7.0; the land the same.
- **Speed.** One bake on that map in the worker: dev 52 ms, this branch 21 ms with the Flow view off (the current and
  shapes skipped, and no cue arrays sent or uploaded) and 77 ms on (single samples). A first switch to the Flow view
  compiles 0 programs, against dev's 1 (the streaks').
- **Falls short:** the light look has no Flow view drawing at all (as before); its toggle changes nothing there.

## The sources' rings with Markers alone (D497; D249 as amended; `fix/source-rings-markers`)

- **Why.** The game draws its own pattern over a seep (2 × 2) and a running badwater source (3 × 3) only (Q9 P7) and
  nothing over a plain water source; ours drew rings of `WATER_FOAM` (up to 0.44 mixed in, 0.07 tiles wide, 1.4 tiles
  out every 2.9 s) and bubbles over every source in Standard and High, always (the water-character audit's gap 6, on
  `docs/water-character-audit`). D196 made them an editing aid, but without a channel of their own.
- **What changed.** `materials.ts`: the rings and bubbles, and their mix into the water, sit under a branch on the
  `markers` uniform, the renderer's one Markers switch (`setMarkers`, as the contamination outline and the wall levels);
  High's water shares that block (`high/shaders.ts` hooks only the surface before it). With Markers off the water over
  a source is the plain surface. Unchanged: the game's own pattern over seeps and badwater sources, the glow on the
  sources feeding the pointer's water while it hovers (its own channel), the light look (it drew none). The Markers
  tooltip already says "Show sources, slope arrows and wall levels". Pinned by `tests/unit/water-source-pattern.test.ts`.
- **Measured** (`tools/capture-source-rings.ts`, River Valley 128² seed 2, the clock held, real Chrome on the GPU,
  dev `e725f16` against this branch, both built from the same file list). Markers on: 0 pixels differ in Standard and
  High over a plain source and over a badwater source close up; from the game's 55° pitch at 90 units 39 and 38, at most
  1.3 L*, all outside the rings (two loads of the same build differ there by 47 and 46, at most 2.2). Markers off: over
  a plain source 9,251 (Standard) and 9,228 (High) pixels, over a badwater source 10,888 and 10,868, all within 1.5 tiles
  of a source's middle, darker on average by 8.9 and 3.9 L* (24 and 15 at most): the rings and bubbles gone.
- **Speed (D453).** No new texture read, uniform or program; the branch is on a uniform, so every pixel takes the same
  way. Markers off skips the rings' noise and smoothsteps for each source tile near a pixel; Markers on draws as before.
- **Falls short:** nothing shows a source's rings while a source tool is held with Markers off; that needs the page.

## Objects' shadows (D497; `fix/high-object-shadows`)

- **What it was.** A look review found High's shadows of trees, bushes and landmarks lighter and smaller than
  Standard's. Measured (`tools/object-shadows.ts`: each object alone on a flat meadow, drawn from straight above in both
  looks with its objects and without, at the game's 45° sun), High's are its models' own (the depth map of the real
  meshes), and both looks shade the core of a shadow fully (its darkest points 1.1–1.2 of the full shadow under a
  pillar), as the game does (the day's shadow strength 1, `Sun.blueprint`). Standard's were too large: its baked map
  cast each plant as a whole tile's column from the ground to its top, and read between its samples (two a tile,
  bilinear), which widens a shadow by 0.2–0.45 of a tile a side. A pine's shadow covered 2.7 times its model's, a
  birch's 3.2 times, and a blueberry bush cast none.
- **The game's.** Against the probe's frames (`tools/object-shadow-check.py`, the eight 128² start shots of batch
  20261002-1610: ours drawn from each shot's pose with the snapshot's land, water and plants, aligned to the game's
  frame; every flat, dry point in view given to the grown plant up-sun whose shadow's box holds it; the darkening of
  the visible ground round each species, 1 a full shadow), High's matched the game's and Standard's did not.
- **What it is now.** Standard casts each plant as its model: a stack of upright discs round its tile's middle (a
  pine's trunk and whorls, an oak's and a birch's crowns over their trunks, a bush's mound; `light.ts` `PLANT_SHAPES`),
  each disc cast 0.2 narrower than its radius for the filter's widening (`PLANT_INSET`), its radii fitted so each
  plant's shadow covers what its model's does in High. Ground the rays reach under a crown is lit, as under the
  game's trees. A young plant's shape is scaled with its height. A dead plant stands at its dead form's height
  (`dying.ts` `DEAD_FORM`, 0.68–0.79 of the living one, where it was cast at 0.35): a tree's bare wood a thin post, a
  bush and a succulent their own shapes, smaller. A ruin column is a post as wide as its square's diagonal
  (`POST_RADIUS`). The start casts its walls and roof, 1.4 high over its 3 × 3, round the tower's 4.0 (`START_BASE`).
- **Where the ground drops away.** A shape's shadow falls on past its own level where the ground below it is lower (a
  bank over a river, a terrace's edge, a cliff's top): each plant's strip is walked out along the sun's way, half a tile
  a step, until the highest its shadow can be there is under all the ground across the strip (the 3 × 3 round the
  step), past which a ray to anything passes through the ground and the ground shades it. A piece of shadow wholly
  under a sample's ground is left out, so how far a strip looked never shows in the bytes; plants are looked for as far
  up-sun as any shadow falls (`SHADOW_DROP`, 30 levels, as `shadowReach`). The first cut of this PR stopped every
  shadow where it would end on the plant's own level: a pine at a two-level bank cast 3.5 tiles where its column had
  cast 5.5, and from three levels down nothing (#864's look review).
- **Edits.** The shapes are cast after the sweep (`plantTopsInto`), with the same arithmetic in any window, so an edit's
  bytes are still the whole map's; their kinds are kept after the casters' levels and go to the bake's worker with
  them. That rests on every disc after the inset staying under the 0.75 of a tile from its tile's middle to the
  nearest sample outside it (the samples an edit of the tile redoes reach no further round it): `PLANT_WIDEST` (0.66,
  the oak's crown) is checked as `light.ts` loads, and by `look.test.ts`. `caveLight.test.ts` redoes 60–70 shapes of
  every kind on roofs, floors and banks, under nine turned suns, with and without the rock, against baking again.
  High is unchanged.
- **Measured.** The meadow (area darkened at least half, tiles², outside the object's own footprint; dev → now):

  | | pine | oak | birch | bush | ruin H2 | ruin H4 | start | dead pine |
  |---|---|---|---|---|---|---|---|---|
  | Standard | 4.14 → 1.60 | 2.67 → 1.64 | 2.21 → 0.54 | 0 → 0 | 2.13 → 1.46 | 5.08 → 4.00 | 2.54 → 3.91 | 0 → 0.34 |
  | High | 1.52 | 1.71 | 0.69 | 0.02 | 1.94 | 4.14 | 4.04 | 0.19 |

  (A bush's shadow, 0.4 high, falls within its own footprint seen from above; dead oaks, birches and bushes cast 0.05
  or less in both looks, `--dead`.) The probe's frames (`object-shadow-check.py`: the mean darkening of the visible
  ground in each species' shadow boxes on its own level, 1,832 / 2,087 / 3,000 points; and of the water below a step
  from a plant up-sun, within its shadow's box lengthened by the drop, 3,351 points, mostly river banks):

  | | game | Standard dev | Standard now | High |
  |---|---|---|---|---|
  | pine | 0.18 | 0.63 | 0.31 | 0.20 |
  | oak | 0.16 | 0.19 | 0.08 | 0.13 |
  | birch | 0.15 | 0.49 | 0.17 | 0.13 |
  | water below a step | 0.15 | 0.38 | 0.15 | 0.21 |

  A plant at a step's edge (`.scratch` probe, d from its middle down-sun in quarters of a tile, shaded at the ground):
  a pine two levels up shades to 4.75 tiles off (its column 5.5, the first cut 3.5, the step alone 2.75), three
  levels up to 5.75; an oak two levels up to 4.25, a four-storey ruin to 5.5. The sheet:
  `docs/sheets/object-shadows.jpg` (River Valley 4242, 128², round the start near and mid, dev and now, in both looks).
- **Speed (D453).** Standard's bake (Node, the best of eight interleaved medians, ms, dev → now): River Valley 4242
  128² (773 plants) the whole map 9.3 → 7.9, a plant taken away 0.39 → 0.40, a 3 × 3 raised 0.32 → 0.52; River Valley
  256² 74.1 → 62.6, 0.60 → 0.84, 0.20 → 0.29; Delta 256² 40.4 → 43.7, 0.58 → 0.75, 0.25 → 0.30 (the machine was
  shared: the whole maps vary by a tenth from run to run). The columns no longer enter the sweep, which pays for the
  shapes on a whole map; each plant's discs are cast only over the strip its shadow can reach, and a plant whose shadow
  cannot come down to an edit's lowest ground before it gets there is passed over. An edit costs up to a quarter of a
  millisecond more: the plants round it walk their strips. High's pass and frame are untouched.
- **Falls short.** Standard's pine still darkens the visible ground round it more than the game's (0.31 against
  0.18): seen from the game's pose, the part of a shadow beside its tree's own screen box is its side, where the
  filter's widening stays (the meadow's width 1.3 against High's 1.1). Standard's oak and both looks' oaks read a
  little light against the game's (0.08 and 0.13 against 0.16), and High's shadows on the water below a bank a little
  dark (0.21 against 0.15). The sun's turn moves Standard's areas by up to a fifth as a shadow's edge crosses the
  samples.

## A dead plant casts its dead form (D497, D135; `fix/dead-shadows`)

- **What it was.** A look review of River Valley 128² seed 1 found dead birches casting diamond-shaped shadows of a
  crown they don't have, in High. Its cause: a plant that dies or starts dying in place (a held drought or badtide's
  withering, the ground starting it dying, `HighLook.setPlantStates`) moved to its new form's batch, but High's depth
  map was kept, so the plant went on casting the form the map was drawn with: for a birch seen from afar, its living
  far model's two octahedra, the diamonds. It held until something else redrew the map (an edit, the sun's turn, the
  objects hidden). Every species and both changes did the same: a dead pine cast its whorls, a dying oak its full
  crown. Standard was right: its baked shadows are cast again from the objects as drawn (`bakeShadows`, a dead tree's
  bare wood a post, `light.ts` `DEAD_KIND`).
- **What it is now.** A change of state marks the depth map to be drawn again, as an edit does: one depth pass for
  each change (at most one every 100 ms, `SHADOW_EVERY`), nothing a frame. So a dead tree casts its bare wood, as the
  game's dead tree casts its own dead model. `tests/unit/sunShadows.test.ts` holds it.
- **Measured.** A grove of 36 plants on a flat meadow, drawn still at 1280 × 800 on the GPU (Chrome with ANGLE on
  D3D11, the RTX 2070 SUPER), from 16 and 45 tiles at the game's 55°, then each plant dead or dying in place; the
  pixels whose luma differs by more than 4 from the frame with the depth map drawn again (dev → now):

  | High | dead, 16 | dead, 45 | dying, 16 | dying, 45 |
  |---|---|---|---|---|
  | birch | 105,519 → 0 | 13,886 → 0 | 87,781 → 0 | 11,448 → 0 |
  | pine | 251,032 → 0 | 32,994 → 0 | 120,067 → 0 | 14,618 → 0 |
  | oak | 392,831 → 0 | 50,569 → 0 | 102,061 → 0 | 12,750 → 0 |
  | blueberry bush | 49,577 → 0 | 6,623 → 0 | 43,594 → 0 | 5,854 → 0 |

  Standard: 0 before and after, dead. The frame drawn twice without a change differs by 0.

## Caves and overhangs, captured again after #852–#855

`tools/capture-forms-read.ts` (as #820 ran it) on Canyon 128² seed 1, dev (`ba8fc1ef`, before #855) and this branch
(#855 merged in), 1920 × 1080, mean Rec. 709 luma:

| | #820 | dev | this branch |
|---|---|---|---|
| inside the spring cave, High | 39 | 40.5 | 40.7 |
| inside the spring cave, Standard | 50 | 44.4 | 42.6 |
| its roofed floor / walls / ceiling, High | 56 / 31 / 26 | 42.4 / 32.3 / 29.0 | 42.8 / 32.4 / 29.0 |
| its roofed floor / walls / ceiling, Standard | | 46.0 / 33.1 / 29.1 | 45.3 / 33.1 / 29.1 |
| under the cliff's overhang: ceiling, High / Standard | 15–27 | 31.9 / 30.1 | 31.9 / 30.1 |
| its back (roofed) wall, High / Standard | 23–31 | 31.9 / 29.0 | 31.9 / 29.0 |
| its open walls, High / Standard | 35–64 | 34.4 / 33.0 | 34.9 / 32.9 |
| the gorge arch, all, High / Standard | | 50.4 / 51.4 | 50.4 / 51.1 |

The roofed faces, which make a cave and an overhang read, hold or brighten against #820 and are the same on dev and
this branch. Standard's cave view lost 5.6 on dev since #820 (the ground's tone, #852–#854, the game's) and 1.8 more
here: its open walls (45.4 → 42.7) and floor at the mouth, where #855's narrow edge leaves the overhang's shadow on
the outside wall fully dark instead of half lit, as the game's is. No regression to fix; the frames read as #820's
did. (#820's open walls 35–64 also took River Valley seed 1's overhangs, not captured here.)

## Badwater's front and High's falls (Q9 P9; D154 as amended, D496; `fix/badwater-fronts`)

The water-character audit's gaps 3 and 4 (`docs/progress/water-character-audit.md`).

- **The front, as the game blends it:** the game's water shader (`PhysicalWaterURP` ps 502–650, read again with
  `tools/game-water-shader.py`) samples a column's contamination at the pixel ± a margin of 0.45–0.5 tiles (its margin
  noise at (xz + 0.2 T) × 0.175), weights each sample by |dx| × |dy| from the nearest tile corner, leaves out a column
  not linked to this one, and eases the mean b to b × saturate(2b + 0.5): a straight blend about a tile wide, centred on
  the tiles' edge. Ours, in both looks (`waterPalette.ts` `WATER_SHARE_BLEND`, `waterShareFrom`; `materials.ts`
  `waterShareAt`): the same four taps, each its tile's own share in the flow texture's B, a dry tile left out by its A,
  our own noise for the margin's, then eased. B and A follow the water on the page's thread the moment it changes
  (`high/flow.ts` `writeShare`, from `WaterMotion.waterChanged` and `StillFlow.update`, the rows that changed going up
  with the next frame; `now` reaches the moving water's bake too), so badwater is drawn with the water it came with;
  the bake brings the current, the waterfall mask and, for the ground under a film, a dry tile's carry (the mean of the
  water round it). High's two smoothing passes are gone. A water top in the open reads it; a fall's face, the water's
  side and water under a roof or below its tile's surface water keep the mesh's corner share, now each tile's own
  (`BLEND_KERNEL` [1], was [20, 15, 6, 1]). Clean water's tint 1, 2 and 3 tiles from a straight front: 0, 0, 0 in both
  looks (Standard was 0.72/0.41/0.10, High 0.70/0.30/0), the game's; badwater a tile in is pure (was 0.92).
- **High's falls and small steps:** a badwater face takes the formula High's surface takes (`GAME_BADWATER.use.high`:
  `gameBadwaterColour` at its shallowest by the pattern carried over the lip, lit by `gameWaterLight`, with its glowing
  lines), as Standard's falls; a small step is High's surface itself facing up (`measuredSurfaceWater` at its depth,
  its patterns at their means). The gallery's badwater fall (`docs/sheets/badwater-fall-high.jpg`; the front: `docs/sheets/badwater-front.jpg`, River Valley 256² seed 4242): High's face 60/11/10, L*
  10.8, flat (pixel gradient 0.19) on dev; 45/13/5, L* 7.6, gradient 1.87 here; Standard's 44/12/4, L* 7.1, 1.85.
- **The judge** (`tools/water-pixel-judge.ts --water all`, the six Badtide and Islands ends, at their hours), RMS to the
  game's pixels, dev → this branch: Standard clean 3.54 → 3.38, mixed 9.08 → 9.10, bad 7.08 → 7.09; High clean 3.50 →
  3.34, mixed 8.80 → 8.82, bad 6.99 → 6.99. The mixed band samples tile centres from about 110 units, where both
  blends give nearly the tile's own share, so the front's width barely moves it (0.02 further); clean water by
  badwater gains in both looks. The land is unchanged (the judge's own check).
- **Falls short:** the game leaves out a neighbour on another surface (its column not linked); our texture's filter
  doesn't know the levels, so across a fall between waters of different shares the half tile at the lip and at the
  foot blends with the other water (as High's did before, then over more tiles); Standard's tops kept to their own
  level until now. A link-aware share (the surface levels beside the share) would close it.

## The rest of the step (next parts)

Each reads the same column masks the mesher reads. The seams:

1. **The masks from the worker (built, item 1 above):** the view's columns carry `ColumnTerrain`'s masks, and
   `columnMask` is a lookup that follows the page's strokes.
2. **Light in 3D:** done (part 2, above). The volume reads `columnMask`, a lookup since item 1.
3. **Soil and the Map look per run top (built, part 3 above):** a run texture (3.0 MB at 256²) gives each run top
   below its tile's top its own soil, moisture, contamination and water.
4. **Water per column (built, part 4 above):** every water column drawn on its own floor under its ceiling, seeing the
   water and ground at its own level, and lit by the air it stands in.
5. **3D picking and selections (built, part 5 above):** `pick.ts` picks against the masks (a ray through the
   voxels, the face hit and its run) and the Select tool reads the run hit.
6. **The level-slice cutaway (built, part 6 above):** the clipped columns drawn, caps only where solid rock crosses
   the cut, lit from the unsliced terrain (D207).
7. **Kyler's notes at approval (built, items 7 and 8 and part 4 above):** the stone on ceilings and at corners,
   cave interiors tuned on real maps, objects, slopes and falls inside caves, water under roofs in the cave's light and
   falls between a cave's own levels. Water under water flows by its own column (part 4b).
8. **Standard's open ground before a cave (built, items 7 and 8 above):** the baked shadow is cast from the voxels on
   maps with terrain above terrain.

## Design note

- The map's floor is drawn at level 0 under every column with air at its bottom, as under a plain tile of height 0.
  The old voxel path drew nothing there (a hole to the sky below the map). Default: keep the floor.

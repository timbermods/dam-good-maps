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
  235; then 16 less per step, never below the cave's least (`CAVE_SKY_FLOOR`, items 7 and 8 below); 0 in rock. G the sun: a ray marched toward the sun from
  every roofed cell and every open cell beside one, 255 or 0. The terrain shader (`materials.ts` `caveAt`, both
  looks) reads the cell half a cell along the face's normal: where that cell is roofed air, the face takes
  `caveLightOf`; anywhere else (open air, rock under the slice's cut, outside the map) the baked light of
  `light.ts` stands. `caveLightOf` carries the light on from the open ground at the roof line the air opens by
  (`caveMouth`, walked toward the brightest neighbour, the open side nearest the face; over a drop, at the cave's
  own level): the sky, deeper in never below the cave's least, with the look's occlusion as at that line (`ShaderHooks.caveSky`: High's
  ambient field, never more than at the point); the sun the open ground's at the line, fading over 0.6 of a tile
  to the cave's own and never above the line's (`caveSun`: Standard marches the ray through the voxels, under
  overhangs too, until rock or the map's highest ground, then the baked shadow; High uses its soft shadow of the
  real meshes; `caveSunOpen`: each look's sun at the line). Open ground casts no contact shadow toward a mouth (the
  roof above is not a wall at its level), and a cave floor takes the open ground's contact shadow from the rock
  beside it at its own level (`wallAt`), so the line holds beside a mouth's side walls too. Objects and falls under
  roofs take it too (items 7 and 8 below), and water under roofs (part 4).
- **Equivalence:** a map with no column that is not plain builds no volume (`caveSize` 0: the shader returns before
  reading it). `tests/unit/caveLight.test.ts` builds the volume anyway on seven generated maps (all six themes and
  Any, 96², 128², 256²), meshes every chunk and samples every quad's middle and four inner points through
  `caveSample` (the shader's steps in TypeScript): not one point takes the volume's light, so the baked light is
  used exactly. Frames, before (dev) and after, real Chrome on the RTX 2070 SUPER, the water held at one moment:
  Canyon 128 seed 7, Standard and High, the whole map and a cliff, 1920×1080: 22–109 pixels differ by at most 2
  levels, all on the moving water's surface (located by a diff mask); the terrain is pixel-identical.
- **On cave maps** (official imports): cave floors, walls and ceilings take their own air's light: bright at the
  mouth, dimmer inward to the cave's least, sun where a ray reaches them; floors no longer take the fixed light of
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
  `LAYER_REACH` (4 tiles: a fall's lips, their pools and the badwater blend round them; checked against a reach of 12,
  the same quads and falls on every map). `meshWaterChunk(W, H, layers, cx, cy)` draws each layer's own tiles;
  `plainLayers(heights, sw)` is the one layer of a map without caves. Every column's falls pour its own outflow
  (part 4b); a view without outflows estimates them from the depth, as a fall without outflows always has (`falls.ts`).
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
- **Falls short:** the cut still drops what stands above it, water included. (Water under a wet roof flowing as its
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
  the bake worker deals the water into its layers (`waterLayers`), works out each such layer's current from its own
  columns' outflows (`currentOf`, each face against the column it meets at its level) and its rough water from its own
  surface (`roughWater`, over the tiles within 8 of those columns), and writes them into a volume by level (RGBA a cell,
  only the levels such columns stand in: RG the current as the flow texture packs it, B the rough water, A 255 in their
  cells; each tile's surface water fills its cells too with the flow texture's own values, so a river reads one current
  across the line where its roof turns dry). The water shader (both looks, `materials.ts` `ownFlowAt`, under `CAVES`)
  reads the cell it stands in (`texelFetch`), and where A says so takes the volume's current, filtered across tiles at
  its level, for the moving surface and High's light and rough water (`shaders.ts`); everywhere else the flow texture,
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
- **Falls short:** water, objects, falls and the drought line are cut as before: what stands above the cut is not drawn
  (each water column stands at its own level since part 4). Water whose surface stands above the cut is not drawn even
  where its floor lies below the cut, so that floor shows as ground, not as a bed under water.
  `tests/e2e/cutaway.spec.ts` compiles and draws the branch on a hand-made cave in CI.

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
- **Interiors that read:** a cave's least sky rises from 0.30 to 0.55 (`caveLight.ts` `CAVE_SKY_FLOOR`, the volume's
  least byte too) and the walk in from an opening loses 16 a cell instead of 26, so light carries about six cells in
  before the least; deeper in, the sky's light comes bounced off the rock, so walls and ceilings take nearly a floor's
  share (`caveLightOf`: from the open ground's 0.7 + 0.3 n.y at the mouth to 0.85 + 0.15 n.y deep). The least holds
  deep in only, never at the mouth, where the open ground's light (High's occlusion with it) carries on. Murky, never
  near-black: deep floors at 0.55 of the sky (0.30 before), about 0.6 of the open ground's shade.
- **Objects and falls under a roof** (trees, bushes, ruins, sources, slopes, the ghosts; falls): the light of the air
  they stand in, from the same volume (`materials.ts` `CAVE_POINT`: `caveAirAt`, `roofedSky`): the whole sky at a
  mouth, as in open air, the cave's least deep in; the sun the open air's at a mouth, fading going in to the volume's
  (High: its soft shadow of the real meshes, `ShaderHooks.roofedSun`), as the ground's does at the roof line. The branch is compiled only on a map with air under a roof (`CAVES`, the renderer's
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

# 3D, step 3: Creating them (progress)

Terrain above terrain's third step (D280 (3); the spec is ROADMAP.md, "Terrain above terrain" → "3. Creating them"):
Erode, the Block tool, and the brushes, forces and recorded strokes on runs.

## Delivers 1: Erode (built 2026-10-14, core and Rust)

On `feature/erode`, from `feature/3d-strokes-on-runs`. Built directly in Rust (D438, D444): `rust/forces/src/erode.rs`
plans it, `core/forces/erode.ts` `ErodeRun` shows it; `investigation/erode` is the reference for behaviour and look.

**The land decides (D257, D258).** One rule set, no modes: every solid voxel with open air beside it gathers wear,
step by step, from each open side; more near the foot of the face (the height above the face's foot: wind and splash
wear hardest near the ground), more just under a hard bed (the map's beds, every fourth level, and fresh volcanic
rock; hard rock wears at a ninth of the rate), and from both sides at once where a ridge is thin. Wear starts only at
faces within the gesture's reach (Size, 4–40 tiles across, Auto 6 + 0.14 × Power) and reaches into the rock as far as
Power gives (1.5 to 10 tiles; a hollow up to 2.4 to 6 levels high); each voxel goes when its wear passes its
resistance (noise from the seed: Try another changes the seams). The shape is worn, not cut: deepest at its base,
its crown rising toward the middle of the opening and falling toward its back, both varying with the rock's grain. So a
cliff's foot becomes a cave or an alcove, a hard bed over softer rock a lip over an undercut, a thin ridge an arch.
Then no rock one block thick is left between hollows or between a hollow and the open air (it wears through, or the
hollow fills back where it may not wear), no hollow is one block high, and every hollow opens to the outside (a sealed
one, or one of a voxel or two, fills back).

**What it never touches:** every tile keeps its top three blocks, so the surface, the objects on it and the water on
it stay where they are; no rock that holds back water wears (beside or under water at its level, the heightfield's on
top and an imported map's own in its caves, `ForceMap.wet`), nor any tile with water on it or in its caves, nor the
three levels under any object (a tree on a cave's ledge keeps its ground), nor a water source's or seep's tile (a
source stands on its tile's lowest run), nor the map's edge tiles, below the Floor, outside the working area or above
the layer showing. It plans only on settled water ("Erode waits for the water to settle: try again in a moment").

**Held, not dropped (D121, D487).** Where a roof would hang more than 3 tiles from support, the rock that wore least,
set back from the open air and best grown from a wall, comes back down to the floor as a ragged remnant two to three
tiles across, until nothing is left that the game would delete (the rule as `terrain/support.ts`, in Rust, objects'
tops left out, so only ever stricter; checked in the worked area, then on the whole map). The
showing is 24 buckets in the order the rock wore, over 2 s (Power 0) to 4 s (Power 100); a voxel that would hang at
the end of a bucket goes in that bucket, so no frame shows ground the game would drop. The session checks the result
as every edit (`newFalls`) and would refuse it with D487's words; Erode never gives it cause.

**A visible effect everywhere (D356).** Where no face can wear (flat ground, steps under three levels), water and wind
scour the dry ground into a shallow hollow round the gesture, 1 to 3 levels deep with Power, the tile under the pointer
always among it unless it is wet; no tile with water is scoured and none goes below the water beside it, so a lake and
its rim stay as they are; what stands there rides it down. It refuses only with the true reason: "the Floor leaves no rock to
wear here", "Nothing here can wear away without leaving ground to fall", "Erode leaves water and the ground that
holds it as they are", or "There is no rock here that Erode may wear" (the layer showing or the working area named
instead when the whole gesture is above it or outside it).

**It writes runs.** Its operation (`forceResult`, verb `erode`, mode `wear`) keeps the tiles it hollowed and each one's
whole mask (`runs`); `tiles`/`heights` hold only scoured ground. The build gives those tiles their masks in the log's
order as it does the Block tool's (`features/build.ts` step 6, `features/raster/terrain.ts` `applyHollows`): from there
on they are caves to every later edit (the brushes shape their tops, D487; the other forces leave them), on a
generated map too, and the session's `terrain`, `columns`, `terrainState()`, falls checks and export follow them as they
follow the Block tool's. A tile with water never hollows, so the columns under a roof are dry, as the export writes
them.

**Checked:** `cargo test -p forces` (a cliff's foot, an arch, Power, Try another, flat ground); the Rust fixtures
(`tools/rust/forces-jobs.ts`: a cliff, a sweep, a ridge, a hollowed cliff given as voxels and flat ground at three
Powers, and the shared fixtures; the same bytes natively and in Node's Wasm; the other forces' pins unchanged);
`tests/contract/erode.test.ts` (a cave at a cliff's foot, an overhang under a hard bed and an arch through a ridge on
hand-made maps and on generated Canyon and Highlands maps; no frame of any random gesture drops ground; Power 0 changes
the land at any click, corners included, and adds no object; Try another; on a generated map the last frame is the
land kept, undo and redo exact, the project reopens with the same voxels and the export holds them, dropping none);
generated maps unchanged (`tools/map-hashes.ts`). Sheet: `docs/sheets/erode-1.jpg` (six erosions on generated maps
and an arch on a hand-made fin, generated maps having few dry fins: top-down, a plan slice that marks any sealed
hollow, two profiles at right angles and an oblique cutaway; `tools/erode-sheet.ts`).

**For the page and the renderer** (not built here): Erode's row on the forces bar (after Glaciate, D352; its key the number of its place
in the bar), its tooltip "Wear caves and arches" with its key cap; Power, Size (Auto), Try another, Sources;
a click or a drawn sweep (a stroke band as it is drawn, a ring for a click, D258), sent as `{ verb: "erode", settings,
path, cut }`. The worker's force frames carry `columns` (the tiles whose voxels changed since the last frame) for
`renderer.updateTerrain(heights, columns)`; the cue is phase `rumble`, then `wear`, then `done`, with `erode.went` (the
voxels that went in the stage just shown, z·N + tile, where the dust and falling stones start), `erode.worn` and
`erode.scoured`. Effects and two to four seconds of dust, stones bouncing once where they land, a grinding sound that
swells with how much goes and a heavier fall to close; CC0 sounds (the investigation's four Freesound recordings,
`investigation/erode/ATTRIBUTION.md`, are candidates).

## Delivers 3: the brushes, forces and recorded strokes on runs (built 2026-10-14)

On `feature/3d-strokes-on-runs`, core only. Nothing changes on a map without caves or overhangs.

**The rule (D487), per brush, on a tile that is not one plain run from z = 0** (an imported map's cave roof, overhang or
floating ground). Every brush shapes the tile's top run and nothing below it; the lowest a roof's top may go is one
layer above its underside (`terrain/runs.ts` `topFloor`, `topFloors`), so the roof keeps a layer, the cave's air and
floor stay exactly, and no tile gains or loses a run.
- **Raise** grows the top run upward (to its target, or softly), up to the editor's ceiling as on any tile.
- **Lower** cuts the top run down, to its target or softly, stopping one layer above the underside.
- **Flatten** moves the top run toward its level both ways, the same stop below.
- **Smooth** and **Naturalize** read the roof's top as the tile's surface, as for any tile, and keep the same stop
  (`BrushStroke`'s `low` takes the floor; Naturalize's weathering holds it after its repairs, `weather.ts` `floor`).
- A riding piece (D249) is never levelled below a roof's stop.
- The build's pit-and-spike pass leaves a roof's top as the strokes leave it, and the features never reshape one.

**The support rule.** Nothing an edit does may leave ground the game would drop. After every step on a map with
caves or overhangs (`MapSession.apply` and `applyAll`: a stroke, a force's result, a removed object that held ground)
the session compares the blocks the game would delete before and after (`terrain/support.ts` `newFalls`); any new
one and the step is taken back as if never taken, refused with one line: "12 blocks of ground would fall: nothing
would hold them up" (`fallsReason`). Ground an imported map already loses is not the edit's. Only lowering can
drop ground (Raise adds blocks standing on the roof): cutting the cliff that holds a ledge, or thinning a roof whose
upper layers carried its span. The page's stroke can show that ground while it is painted: `StrokePreview.falls()`
on the `TerrainState` the session hands it (`floor`, `masks`, `stackTops`), the same cells the session refuses.

**The forces** stay on heightfield ground (their Rust and TypeScript read surfaces): on a map with caves they leave
the caves' tiles as they are, as before (the planner keeps them, `forceResult`'s check refuses them), and a result
that would drop ground is refused by the same rule. Moving them onto roofs waits for Erode.

**Terrain as built:** `ColumnTerrain.withSurface(heights)` now reshapes each tile's top run to the surface
(plain tiles exactly as before; on the rest, everything below the top run kept), so the session's `terrain`, the
export's voxels, the support pass and `columns` (the mesher's voxels, now as they stand) all follow the strokes. A
surface equal to the base's gives the base, voxel for voxel: an unedited import exports byte for byte.

**Recorded strokes** replay onto the same runs: the floors come from the stored base, which never changes (D336).
Projects saved before this replay strokes over roofs differently (D475: no old-project compatibility).

**The page and the renderer** (two lines, okayed on #236): the worker's `ViewUpdate` carries `columns` when an
edit reshaped a roof's top, and `renderer.updateTerrain(heights, columns)` takes them and remeshes their chunks (the
mesher draws those tiles from their columns). While a stroke is still being painted a roof shows its old shape; it
takes the new one as the worker answers. The page may later show `StrokePreview.falls()` in red while painting.
A step refused this way costs no full build: a stroke or force is checked on its terrain alone first
(`MapSession.fallsAhead`), the build's check after it covering the rest.

**Judged in the browser** (D484; `docs/sheets/3d-strokes-on-runs.jpg`, light and dark, 1280, 1920 and 2560): on
Hollows' floating ledge at x 176–177, y 80–83 (rock over open air, seen from below against the sky), Raise grows its
top (column 9–12 → 9–14) and Lower brings it down a level (9–13), at once; a Lower to its last layer is refused
("3 blocks of ground would fall: nothing would hold them up"), and cutting the cliff behind it too (47); the line has
the existing refusals' style; a generated map's Raise as before. No stroke left the page's map different from the
worker's.

**Found while judging, fixed here:** (1) plants standing on a roof did not ride its new top (`build.ts`
`snapToGround` left every column that is not plain alone), so a Raise buried them and the checks marked them red
("Succulent inside terrain"); an object on a roof's top now rides it, one in the cave stays. (2) An imported map's
water carried to new ground before its first settle had no saturation (`session.ts` `topWater`), so its soil read
dry everywhere until the settle landed; it now has the file water's. (3) The page: the soil's two-second growth of
the map left was still running when another map opened and painted the old map's colours over it
(`useSession.ts`, the timer is cleared when the editor closes). Not from this change, seen in passing: after the
background settle, Hollows' soil and water are the app's heightfield settle's, not the file's (9,163 tiles' wet or dry
differ outside roofs); that is stage 6's (the stacked engine).

**Checked:**
- On a map without caves, byte for byte: `tools/stroke-hashes.ts` (480 strokes, every brush, sizes ½ to 9, soft,
  targets, squares and areas, on four generated maps and the same maps imported) and `tools/map-hashes.ts` (the 84
  maps), on dev and on the branch: identical.
- `tests/contract/strokesOnRuns.test.ts` (CI, a hand-made cave map): Raise grows a roof, Lower stops at its lowest
  layer, cutting a ledge's cliff is refused with the count the page's stroke shows, the page paints what the build
  makes, random strokes keep every run under a roof and drop nothing, undo gives each state's exact runs, a full
  build equals the incremental one, the project replays onto the same runs, an unedited cave map exports its voxels.
- `tests/contract/strokesOnRunsOfficial.test.ts` (local only, skipped on CI): the same on Hollows, Canyon and
  Pillars, 30 strokes each, refusals included; an unedited import exports byte for byte.

## Delivers 2: the Block tool's core (built 2026-10-15)

On `feature/block-tool-core` (on #396's branch), core only: no page, no renderer. Nothing changes on a map that has no
block operation. Names below are in `src/core/doc/blockTool.ts` (the API) and `src/core/terrain/blocks.ts` (the cells and
refusals).

**The operation `blocks`** (`ops.schema.json`; in the log like a stroke, one undo step per click or drag):
`{ op: "blocks", params: { mode: "add" | "remove", side: "+x" | "-x" | "+y" | "-y" | "+z" | "-z", at: [x, y, layer][], size: 1–8, shape?: "square" | "round", area?: [y, x0, x1][], cut?: layer } }`.
- `at[0]` is the block whose `side` face is pointed at (a click names only it); a drag adds the positions it swept, all in
  that face's plane (same layer for +z/-z, same x for ±x, same y for ±y). Layers count from 0 (bottom); the surface of a
  tile is its first free layer, so the top of a level-8 tile is layer 7.
- **Add** puts a block in the cell beyond each swept face (`at + normal`), **remove** takes the swept blocks themselves; each
  across the footprint in the plane: a square of `size` blocks, or the disc of that diameter (`shape: "round"`); offsets
  run from −⌊(size−1)/2⌋ for `size` blocks. A footprint over the edge of the map or the layers is clipped, as a brush is
  (the cell beyond the face still has to be on the map). A cell that already holds a block (add) or none (remove) is
  skipped.
- **Exposure (a remove):** a remove takes a swept block only if the cell beyond its `side` face is air (or off the map or
  the layers) or at or above `cut`, so a drag across a hill takes the surface a viewer sees and nothing buried, and a
  cut opens what it hides. It is always applied (no `cut` means no cut), read from the ground before the operation: a
  block taken earlier in the sweep opens nothing for the next. To dig into a wall, aim at its open face; to go deeper,
  click again (or hold Shift on the page). If every swept block is buried the operation is refused,
  `there is no block there to remove`.
- **Chaining (an add):** a block goes into a cell only where it touches a block, one of the terrain or one this operation
  added earlier, so a drag over air grows a span from the ground across it. Within one swept position the footprint
  fills until no more cells touch (the order of its cells decides nothing: a size 3 click gives the same 3 × 3 at an
  east- or a west-facing edge); across positions it is sweep order, so a position reached before the span gets to it
  adds nothing; the support rule still limits the span
  (a block more than 3 sideways from support falls and the operation is refused with its line).
- **`area`** is Select's working area as runs, taken as the brushes take it: a cell (the one beyond the face for an add)
  outside it refuses the operation, `(x, y) is outside the selection`. **`cut`** is the view's cut level (the level
  control's value; layers from it up are hidden, 0 to 22: the page sends none for no cut, and 22 hides nothing, layer 22
  being empty): the operation touches nothing in layer `cut` or above, those
  layers count as open air for a remove's exposure, and is refused,
  `nothing below layer N would change`, when nothing below it would. The page sends the cut only when one is set.
- **Plants** (trees, bushes, succulents, ruin columns) never refuse a click (D368 (10)). A plant stays on the top of the
  run of blocks it stands on. Only a change to the top of that run moves it: the run grows over its base, or loses its
  top blocks, and it rides to the new top (`plantsRiding`). A block added into its cells takes it away
  (`plantsRemoved`; the session lists the ids in `params.plants` and the build deletes them quietly with the step, undo
  brings them back). A block added above it, its cells left free, leaves it where it is, under the block, though the
  tile's surface is now higher: the session records each plant it puts on another layer than the tile's top in
  `params.stands` ([id, layer]) and the build puts it there. Anything else standing there (a slope, a source, a building)
  still refuses, below.
- The session fills in `params.cells` (the blocks changed, pairs [tile, layers]) when it takes the operation; the build and
  every replay apply those literally. A caller never sends it. An operation moves no tile but its own: the integrity pass
  never tidies the tiles beside a dug one.
- **Refusals**, never clamped, one line, nothing logged: `(x, y) is outside the map`; `layer 22 is above the highest layer
  (21)` (layer 22 stays empty) or `below the lowest layer (0)`; `(x, y) has no block in layer z to point at` (`at[0]` must be
  solid); `an object stands at (x, y) in layer z` (an add into an object's cell, or a remove of one); `an object stands on
  the block at (x, y) in layer z` (a remove of the block an object stands on); `there is no room for a block there` / `there
  is no block there to remove` (it would change nothing); `(x, y) is outside the selection`; `nothing below layer N would
  change`; and the support rule's `N blocks of ground would fall: nothing would
  hold them up` (`1 block of ground would fall: nothing would hold it up`), counted as the game's rule (#396's `newFalls`)
  would, before and after, on the whole map.

**The query** `blockFalls(session, op)` (also `session.blockFalls(params)`), plain data, no build, cheap:
`{ reason: string | null, errors: string[], added: [x, y, layer][], removed: [x, y, layer][], falls: [x, y, layer][], plantsRemoved: number, plantsRiding: number }`.
`added` and `removed` are exactly the blocks the click changes (the ghost), `falls` the blocks of ground that would drop
(red), `reason` the one line `apply` would refuse with (the same string), `null` when it would be taken. `errors` is the
refusal when the operation cannot be taken at all (then the three lists are empty). `apply` runs the same check before it
logs anything, so the count in the refusal is the length of `falls`. With nothing falling, `reason` also names an object
the step would move or leave for the game to remove (D491; `session.ts` `blockLost`): a block over the tile an object takes
its level from, which the build would carry it up onto (`a mine site stands under it at X 25 · Y 30`), each object read
the build's way (the start by its middle tile, an object placed or moved by hand by its own tile or the level the edit
names, a generated map object by the highest surface under it, a spring's source on its floor), and a dig deep under a
mine site that leaves its ground off the bottom of the map, by the same rule as the step's last guard (`objectLost`). So
the page never shows a step as fine that `apply` refuses. Measured with it: about 2.4 ms a query at 128² (1,143 objects). The slope, like any object, holds its block: removing
the block it stands on is refused with the object line. **The page should call `blockFalls` when the pointer's block
changes, not on every move**: it costs about 7 ms at 256² on a loaded machine once the first call has worked out the
build's objects (about 30 ms), which are kept per build.

**What the session gives the page after a block edit.** `session.terrain`, `columns` (every tile that is not one plain run,
for the mesher), `plainAt`, `roofedTiles`, `terrainState()` (`columns`, `floor`, `masks` for `StrokePreview.falls()`) and
the .timber export all follow the dug and built ground, on a generated map too: a hollow turns a heightfield into a map with
caves. `built.heights` stays the surface, so a hollow under the surface changes no height. The step's dirty rectangle
(`built.dirty.terrain`) covers the tiles whose blocks changed. Still the page's and worker's to take: the worker sends
`ViewUpdate.columns` only when a roof's top changed (`roofIn`), so it must also send them when `dirty.terrain` is set and the
session has `columns`; collaboration's map state (`collab/mapState.ts`) diffs heights and entities only, so a hollow under
the surface is not carried to a peer yet.

**How it is built.** The tool's operations run in the build's step 6 in log order, tile by tile (`raster/terrain.ts`
`applyBlocks`): each touched tile keeps its own mask (`BuildCache.terrain.masks`, tile → bits), its surface follows it, the
brushes' floor follows its top run (so a stroke after a block shapes the top and nothing under it, a roof keeping its lowest
layer), the integrity pass leaves it as it is, and the forces and old sculpts leave it as they leave a cave. The terrain of a
build is `terrainUnder(base, heights, masks)`. Undo, redo, replay and an incremental build are the same as for a stroke (the
build is a function of the log); a stored map carries the masks and `sameMap` compares them, so a reopened project opens
from them and the replay check covers them.

**Water.** Nothing in the water engine changed. A block edit that changes the surface settles in the background as any
stroke does; a hollow under the surface changes no surface height, so no water moves until the stacked engine (#370) reads
the runs. The export keeps the file's own water under dug and built roofs, as for an imported cave.

**Not done here:** the ghost, the red blocks, the sounds, Shift-dig stepping and Natural Overhangs are the page's; a
decision number for the tool's rules is the milestone session's.

**Checked:** `tests/contract/blocks.test.ts` (CI): a click on top and against a wall, removing and hollowing, a drag, a round
footprint, every refusal, a ledge cut from its cliff refused with the count `blockFalls` shows, what the query names is what the
step changes, random blocks and strokes (nothing falls, an incremental build equals a full one, undo and redo give each state's
exact runs, the project replays onto the same runs and saves byte for byte), and the same on a generated map (build up, hollow,
export). The 84 generated maps' hashes (`tools/map-hashes.ts`) are unchanged.

## Delivers 3 (the Block tool's page): built 2026-10-15

On `feature/block-tool-page` (stacked on `feature/block-tool-core`, with `render3d`'s `blockAim` and `showBlocks` from
`feature/block-tool-render` taken in): the tool the player uses. **Block**, key 7, on the tools row (the bar is 14 cells now,
`settings.tsx` `fromThirteen`); hover a face and see what a click would add, take or drop (`blockFalls` through the worker,
no build); click adds, Shift removes, a drag paints the plane of its first face (an add chains over air, a cell going in where it touches a block or one added just before: a bridge or an arch is one drag), one `blocks`
operation and one undo step on release; Size 1–8 (F, { }), Shape, Action. EDITOR_PLAN "The block tool" says how it behaves;
`tests/e2e/blockTool.spec.ts` (add, remove, drag, undo, Esc, the fall preview and its note, a cave map) and
`tests/unit/blockTool.test.ts` check it; captures `docs/design/block-tool-*.jpg`. The worker sends `ViewUpdate.columns` whenever
the session's columns changed (a hollow under the surface included), not only when a roof's top moved. Not done: the blocks'
own pop-in and crumble (renderer), the Block sounds of D335 (the brushes' thud and dust stand in), Shift-hold digging.

**Review fixes (2026-10-15).** The tool is registered with `voxel: true` and aims with `blockAim(hit, cut, mode)`; falls are
drawn solid red and, while any fall, the added and removed ghosts are muted grey (forces play's `showBlocks`, D335); the
page's legend and notes name no amber for them. The refusal note has its own state (`blockNote`), apart from the size flash.
Select's row is laid out on the 14 cells (not stretched by `fromThirteen`): the modes on cells 1 to 7 with Whole map across
6 and 7, the resting words on 8 to 12; Naturalize has room at 1280.

**Adopting the core's follow-ups (#453, 2026-10-15).** The page's own core change (an `exposed` field) is gone; the core's
final `blocks` operation is used as it is. The page sends `area` (the open selection's runs) and `cut` (the view's layer
cut) with every operation and makes no refusals of its own (`blockRefusal` is gone): the core's lines ("(x, y) is outside
the selection", "nothing below layer N would change") show in the preview before the click, and the blocks from the cut up
are left alone and not drawn. A Remove takes only what is open to the aimed side, read by the core. Drags chain over air as
the core allows, and the preview draws the whole span from `blockFalls`. Plants show in the preview's note: "N plants
removed", "N plants ride with the ground" (`plantsWords`, quiet, not an error). Tests: `tests/unit/blockTool.test.ts`,
`tests/contract/blocks.test.ts`, `tests/e2e/blockTool.spec.ts` (a drag up a pillar's wall chains, a block over a plant, the area's
and the cut's lines).

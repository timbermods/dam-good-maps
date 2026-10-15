# 3D, step 3: Creating them (progress)

Terrain above terrain's third step (D280 (3); the spec is ROADMAP.md, "Terrain above terrain" → "3. Creating them"):
Erode, the Block tool, and the brushes, forces and recorded strokes on runs.

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
`{ op: "blocks", params: { mode: "add" | "remove", side: "+x" | "-x" | "+y" | "-y" | "+z" | "-z", at: [x, y, layer][], size: 1–8, shape?: "square" | "round" } }`.
- `at[0]` is the block whose `side` face is pointed at (a click names only it); a drag adds the positions it swept, all in
  that face's plane (same layer for +z/-z, same x for ±x, same y for ±y). Layers count from 0 (bottom); the surface of a
  tile is its first free layer, so the top of a level-8 tile is layer 7.
- **Add** puts a block in the cell beyond each swept face (`at + normal`), **remove** takes the swept blocks themselves; each
  across the footprint in the plane: a square of `size` blocks, or the disc of that diameter (`shape: "round"`); offsets
  run from −⌊(size−1)/2⌋ for `size` blocks. A cell that already holds a block (add) or none (remove) is skipped, and so is
  an add's cell with no block to put it against (each swept position and footprint cell checks its own face; a drag over a
  gap never leaves a floating block). Only an operation that would change nothing at all is refused.
- The session fills in `params.cells` (the blocks changed, pairs [tile, layers]) when it takes the operation; the build and
  every replay apply those literally. A caller never sends it. An operation moves no tile but its own: the integrity pass
  never tidies the tiles beside a dug one.
- **Refusals**, never clamped, one line, nothing logged: `(x, y) is outside the map`; `layer 22 is above the highest layer
  (21)` (layer 22 stays empty) or `below the lowest layer (0)`; `(x, y) has no block in layer z to point at` (`at[0]` must be
  solid); `an object stands at (x, y) in layer z` (an add into an object's cell, or a remove of one); `an object stands on
  the block at (x, y) in layer z` (a remove of the block an object stands on); `there is no room for a block there` / `there
  is no block there to remove` (it would change nothing); and the support rule's `N blocks of ground would fall: nothing would
  hold them up` (`1 block of ground would fall: nothing would hold it up`), counted as the game's rule (#396's `newFalls`)
  would, before and after, on the whole map.

**The query** `blockFalls(session, op)` (also `session.blockFalls(params)`), plain data, no build, cheap:
`{ reason: string | null, errors: string[], added: [x, y, layer][], removed: [x, y, layer][], falls: [x, y, layer][] }`.
`added` and `removed` are exactly the blocks the click changes (the ghost), `falls` the blocks of ground that would drop
(red), `reason` the one line `apply` would refuse with (the same string), `null` when it would be taken. `errors` is the
refusal when the operation cannot be taken at all (then the three lists are empty). `apply` runs the same check before it
logs anything, so the count in the refusal is the length of `falls`. The slope, like any object, holds its block: removing
the block it stands on is refused with the object line. **The page should call `blockFalls` when the pointer's block
changes, not on every move**: it costs 13–28 ms at 256² on a loaded machine.

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
no build); click adds, Shift carves, a drag paints the plane of its first face (bridges over air included), one `blocks`
operation and one undo step on release; Size 1–8 (F, { }), Shape, Action. EDITOR_PLAN "The block tool" says how it behaves;
`tests/e2e/blockTool.spec.ts` (add, carve, drag, undo, Esc, the fall preview and its note, a cave map) and
`tests/unit/blockTool.test.ts` check it; captures `docs/design/block-tool-*.jpg`. The worker sends `ViewUpdate.columns` whenever
the session's columns changed (a hollow under the surface included), not only when a roof's top moved. Not done: the blocks'
own pop-in and crumble (renderer), the Block sounds of D335 (the brushes' thud and dust stand in), Shift-hold digging.

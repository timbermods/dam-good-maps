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

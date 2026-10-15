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
scour the ground into a shallow hollow round the gesture, 1 to 3 levels deep with Power, the tile under the pointer
always among it; what stands there rides it down. It refuses only with the true reason: "the Floor leaves no rock to
wear here", "Nothing here can wear away without leaving ground to fall", or "There is no rock here that Erode may
wear" (the layer showing or the working area named instead when they are why).

**It writes runs.** Its operation (`forceResult`, verb `erode`, mode `wear`) keeps the tiles it hollowed and each one's
whole mask (`runs`); `tiles`/`heights` hold only scoured ground. The build lays the masks over the map's terrain in the
log's order (`features/build.ts` step 6, `terrain/carved.ts`): from there on those tiles are caves to every later edit
(the brushes shape their tops, D487; the other forces leave them), on a generated map too. The session's `terrain`,
`columns`, `terrainState()` (the page's strokes), its falls checks and the export follow them; the export writes each
hollowed tile's water in its top column and its soil on its top run, the columns under the roof dry
(`format/world.ts` `withCarvedColumns`).

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

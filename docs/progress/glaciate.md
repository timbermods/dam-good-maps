# Glaciate: adopted onto the forces core, the floor's water as one river

> **State (2026-09-27; where a fresh session resumes).** Branch `feature/glaciate` (from `feature/forces`, both merged in
> at every stop; `dev` too). Built and tested; captures of the floor before and after in `docs/progress/glaciate/`. Waiting
> for the preview with the forces and Kyler's sitting (checklist item 18 in `docs/STATUS.md`); nothing merges into `dev`
> without his yes (D291). Open: Kyler's eye on the floor (D292), his listening check of the sounds with the others'.

Kyler's decisions: D246 (Glaciate), D257 (bound only by nature, the start carried), D258 (clean gestures), D265 (the
camera never moves on its own), D266 (its own pace), D277 (no Claude step), D289 (its row), D291 (round 4 pre-approved,
adopted on its own branch), D292 (his answer of 2026-09-27: #69 merged as an investigation at 8ef9842; adopt it, and
finish the floor's water during the adoption). The source: `investigation/glaciate` round 4 (#69), its INTEGRATION.md.

## What was built

- **The planner** (`src/core/forces/glaciate/`): the investigation's `model.ts` and `morphology.ts`, ported in their
  order. With the floor's water left as round 4 left it, it gives the investigation's land, water and objects byte for
  byte (tests/contract/glaciate.test.ts, on the hero click and Kyler's cross-valley Aim). Cut into slices (a generator
  that yields between its phases; the rim's textures worked out once a tile), so the worker answers the page between
  them; slicing never changes the result. It builds to the forces core's ceiling (`maxHeight`: 16, or the map's own top
  up to 22), not the investigation's fixed 22; D244 step 2 lifts it.
- **The start is the editor's** (D257): the planner leaves it; the worker's `carryStart` carries it to level ground in
  the same undo step when its ground breaks.
- **One operation** (`forceResult`, verb `glaciate`): settings Power, Size (null: Auto), Meltwater, the seed, and the
  gesture's mode (flow or aim, from the gesture: no Mode control); its levels, and every level of its own ground listed
  too (its trough, benches, moraine, channels and outwash, unchanged ones included), so the build's integrity pass never
  wears a bank down and opens a spillway (without it, one bank tile lowered by two let the river sheet over 900 floor
  tiles on Canyon 10); the objects it swept; its springs (`sources`: the cirque head's and the hanging valleys') and its
  tarn's water (`lake`). The schema and the engine check them; replay assigns them.
- **The run** (`run.ts`): while it's planned the ice gathers; then 30 stages of advance (the land under the ice takes its
  final levels as the front passes) and 20 of retreat (the valley's water revealed), ten a second: five seconds at its
  own pace (`GLACIATE_PACE`, D266). Planning slices take up to 80 ms a step.
- **The page**: its button in the forces group (key -); its row Power, Size (Auto), Meltwater, and Try another once one
  is kept (D289); a click Flows, a drag of six pixels or more Aims with only the thin arrow (D258); the cursor where it
  acts; the ice gathers under the pointer as it's pressed. The camera never moves (D265).
- **Effects** (`render3d/forces.ts` `Glacier`): the investigation's tongue (fixed cross sections over the land, a curved
  nose and flowing streaks, on its own clock: three seconds out, two back), and the gather (a frosty dome and circling
  crystals). None with reduced motion.
- **Sounds**: the investigation's recipe from the editor's CC0 bank (its five recordings are the bank's, byte for byte):
  a held bed of grinding stone and a low wooden groan while it advances, two slow cracks, meltwater as it retreats.
  Trim 1 (the investigation measured −17.1 dBFS against the forces' −16.5): Kyler's listening check covers it.
- **No Claude step** (D277).

## The floor's water (D292)

Round 4's floor had several wet passages beside its main river: pools at the foot of the falls and side inflows, joined
by long channels across the floor or along the walls' feet. The adopted planner (`floor.ts`, and `plan.ts` where it says
D292):

- **The river visits them.** Its course winds across the level floor to the falls' pools and the rivers coming in (the
  biggest first; it leaves the cirque's middle and the snout's), so their water drops straight into it. A fall it can't
  reach, nor pass within six tiles of, stays a dry hanging valley (its lip and gully uncut, no spring).
- **Joins go straight to the river**, the nearest way at or below their pool's level, never to another join along a
  wall's foot; a lip's other face runs into its own pool; an inflow's join is as wide as the river.
- **The floor is sealed where water could reach it**: an inflow's shore two tiles out; banks beside a pool or the river
  above its outlet by the freeboard; no bench cut where water stands within two tiles; the outgoing river starts no
  higher than the river reaches it.
- **Checked by the game's water.** As it's planned, the game's water runs 300 ticks on the finished floor; if it would
  wet the dry floor (more than 1% of it), the river bends toward the falls instead, or keeps round 4's meander, and the
  way that keeps the floor driest is kept. Floods showed within 250 ticks on every case.

Literal land and the game's own water throughout: nothing is masked.

### The passage count, before and after (information, D292)

Round 4's measure, unchanged: separate wet passages is the most disjoint wet runs on any section across the floor (goal
1); it counts a winding river crossed twice as two. Side passages are the runs that don't touch the main river. Each case
settled as the game settles it. `npx tsx tools/glaciate-cases.ts` prints it.

(filled in below)

## Captures

(filled in below)

## Checked

(filled in below)

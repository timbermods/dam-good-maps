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

| Case | Round 4: wet · passages · side · falls · longest join | Finished: wet · passages · side · falls · longest join | Course kept |
| --- | --- | --- | --- |
| hero-canyon | 11.8% · 6 · 4 · 7 · 23 | 12.0% · 5 · 3 · 5 · 6 | visits (floor wet in the check: 0) |
| hero-highlands | 10.3% · 4 · 2 · 7 · 23 | 7.2% · 2 · 1 · 2 · 3 | visits (floor wet in the check: 0) |
| hero-tall | 9.2% · 4 · 2 · 3 · 18 | 6.3% · 1 · 1 · 1 · 3 | visits (floor wet in the check: 0) |
| random-1 | 13.0% · 2 · 2 · 2 · 13 | 14.9% · 1 · 1 · 1 · 13 | visits (floor wet in the check: 0) |
| random-2 | 11.2% · 1 · 0 · 1 · 15 | 12.6% · 1 · 1 · 1 · 16 | visits (floor wet in the check: 0) |
| random-3 | 16.4% · 5 · 3 · 10 · 18 | 12.9% · 4 · 1 · 4 · 7 | visits (floor wet in the check: 0) |
| random-4 | 6.6% · 1 · 1 · 0 · 0 | 5.9% · 1 · 1 · 0 · 0 | visits (floor wet in the check: 0) |
| random-5 | 14.1% · 2 · 2 · 2 · 12 | 17.9% · 1 · 1 · 0 · 15 | visits (floor wet in the check: 0) |
| random-6 | 9.5% · 1 · 1 · 2 · 23 | 10.5% · 1 · 1 · 2 · 22 | bends (floor wet in the check: 40) |
| modest-1 | 9.5% · 2 · 2 · 5 · 32 | 10.8% · 3 · 1 · 5 · 23 | visits, benches (floor wet in the check: 21) |
| modest-2 | 11.9% · 3 · 2 · 10 · 23 | 10.2% · 3 · 2 · 4 · 3 | visits (floor wet in the check: 5) |
| modest-3 | 13.0% · 1 · 1 · 0 · 0 | 11.2% · 1 · 1 · 0 · 0 | visits (floor wet in the check: 0) |
| power-low | 11.5% · 5 · 3 · 6 · 18 | 11.7% · 5 · 1 · 3 · 3 | visits (floor wet in the check: 0) |
| power-high | 12.5% · 4 · 3 · 10 · 30 | 9.9% · 2 · 1 · 6 · 3 | visits (floor wet in the check: 0) |
| another-1 | 13.0% · 4 · 3 · 9 · 18 | 10.6% · 2 · 1 · 4 · 3 | visits (floor wet in the check: 0) |
| another-2 | 12.3% · 3 · 2 · 8 · 19 | 11.2% · 3 · 2 · 6 · 6 | visits (floor wet in the check: 0) |
| another-3 | 12.6% · 5 · 3 · 8 · 24 | 12.1% · 5 · 1 · 6 · 5 | visits (floor wet in the check: 0) |
| aim | 10.7% · 3 · 2 · 9 · 18 | 9.0% · 2 · 1 · 3 · 4 | visits (floor wet in the check: 0) |
| kyler-aim | 13.9% · 3 · 2 · 8 · 29 | 11.1% · 2 · 1 · 3 · 23 | visits (floor wet in the check: 0) |
| through-start | 11.8% · 6 · 4 · 7 · 23 | 12.0% · 5 · 3 · 5 · 6 | visits (floor wet in the check: 0) |
| performance-256 | 10.3% · 4 · 2 · 7 · 23 | 7.2% · 2 · 1 · 2 · 3 | visits (floor wet in the check: 0) |
| flat | 7.9% · 3 · 1 · 2 · 7 | 8.2% · 2 · 1 · 1 · 7 | visits (floor wet in the check: 0) |
| spring | 7.3% · 2 · 2 · 2 · 19 | 5.8% · 1 · 0 · 0 · 0 | visits (floor wet in the check: 0) |
| spring-dry | 0.0% · 0 · 0 · 0 · 0 | 0.0% · 0 · 0 · 0 · 0 | visits (floor wet in the check: 0) |

Kyler's cases: the default Canyon click (hero-canyon) goes from **6 passages to 5**, 4 side passages to 3, its longest
join from 23 tiles to 6; his cross-valley Aim (kyler-aim) from **3 to 2**, side 2 to 1. Across the heroes, Aims, Power
and Try another cases the side passages fall to one or two. What the passage count still counts: the winding river
crossed twice by one section (an S-bend counts two), the tarn beside the river's first reach, and each fall's small pool
with its three-tile join. The falls are fewer (only the ones the river reaches or passes near keep their springs):
Canyon 7 to 5, Highlands 7 to 2, the Aim 8 to 3. Wet share stays under 15% except random-5 (17.9%: its narrow floor, no
fall reached) and the check's leftovers: random-6 (bends kept; 40 floor tiles wet in the check) and modest-1 (21, under
its allowance of 1% of its floor). random-3, round 4's flooding exception, goes from 16.4% to 12.9%.

## Captures

In `docs/progress/glaciate/` (each case made in the editor as a player makes it, the water settled, the same camera;
before · round 4's floor · the finished floor, oblique above and top-down below; `tools/capture-glaciate.ts`):

- `canyon-floor.png`: Canyon 10, click 22,22 (Kyler's default).
- `kyler-aim-floor.png`: Canyon 10, the drag 24,80 → 96,36.
- `highlands-floor.png`: Highlands 7 at 256², click 150,20.
- `two-acts.gif`: the default click from a still camera: the ice advancing, melting back, the valley's water.

## Checked

- The planner against the investigation, byte for byte with the floor left as round 4 left it (hero click and Kyler's
  Aim; the four heroes by hand: heights, water and objects the same).
- tests/contract/glaciate.test.ts: the investigation's result; the floor finished (the river visits, no long joins, the
  check's floor dry, fewer passages than round 4); sliced planning gives the same land and respects the ceiling; in the
  worker a click Flows and a drag Aims, Esc drops it all, its end is one step exactly as shown, Try another varies it and
  undo brings the first back; through the start it completes and the start stands on level ground in the same step; the
  project file reopens it, its springs and its tarn, and the export is the same bytes; the schema and Ajv agree.
- tests/e2e/glaciate.spec.ts: the row is Power, Size (Auto), Meltwater and, once kept, Try another, nothing else; a click
  Flows with the camera still through the whole event, kept exactly as shown, Esc, Try another and undo; a drag shows
  only the arrow (no stroke, no cursor, no words) and grinds that way; about five seconds at Slower and at Instant water.
- The other forces' browser tests and the lists of forces (release, brush kit, public site) with Glaciate in them; the
  sounds' tests with its recipe; the whole quick suite (712 passed); typecheck and build.
- Not run: Timberborn (no probe asked for); the heavy nightly suite.

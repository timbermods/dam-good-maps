# 3D, step 4: Generation (progress)

Terrain above terrain's fourth step (D280 (4), D488; the spec is ROADMAP.md, "Terrain above terrain" → "4. Generation"):
3D forms as intentions, grown by processes on M9's fields and drainage. Part 1 builds the three forms D488 names first.

## Part 1: spring caves, sheltering overhangs, arches (built 2026-10-15)

On `feature/3d-generation`. The processes are `src/core/land/forms3d.ts` (site finders and carvers, plain data in and out,
headless); `src/core/gen/forms3d.ts` draws which forms a map looks for, turns a cave's spring into its stream, and checks
each form on the finished map; `gen/generate.ts` grows them at the end of an attempt that passed.

**The forms** (D138: outcomes, failure allowed, many realizations; nothing stamped: each takes its shape from its place).
- **A spring cave feeding the river** (`spring-cave`). Where a river's clean water runs 0–4 tiles from a cliff's foot (dry
  bank between, never down, away from the map's other sources and objects), the cliff is worn into a gallery 2–3 wide and
  2–3 high, 3–10 long, wiggling, its floor half a level or more above the river's water and a pool a level lower at its
  back. A spring rises in the pool (a small row, 0.3–0.7 blocks a second, `river/caveSpring/<k>`, D171: a tributary at
  its own head) and its stream runs out of the mouth and over the bank into the river. Its walls hold everywhere but the
  mouth, so its water leaves by the mouth alone. It is worn, not cut, so it reads as a cave, not a doorway: the mouth a
  rough arch, wider and higher than the gallery behind it (its middle up a level, two where the rock is thick, a shoulder
  up a level now and then, a corner left in), its jambs eaten back a tile to varying heights and now and then flared a
  second tile out; inside, the gallery bulges a tile to one side here and there (its width wandering 2–4, each bulge
  taken only where its own walls hold the water), its roof a level higher in places, mostly down its middle, a corner
  left in, its walls notched at varying heights, and the back chamber domed and worn wider over the pool. Never at the
  floor, and a notch never opens a window out of the cliff; where the rock would not hold the corners they are left out,
  and where it would not hold the wear the gallery is cut plain. The surface does not change.
- **An overhang sheltering the start** (`start-overhang`). Where the start's level ground meets a cliff 3 or more above it
  within 8–12 tiles, a stretch of 3–14 tiles of the face is worn back 1–3 tiles, as soft rock under a harder cap, 2–3 high,
  its depth wandering along the face; where the rock would not hold that, less deep, down to a tile. Level ground at the
  start's floor runs on under the rock. The surface does not change. The start itself is never roofed (cave starts are
  for Verticality 70+, later).
- **An arch over a gorge** (`gorge-arch`). Where a river runs between rims at one height 3 to 6 + Verticality/6 tiles apart
  with 3 or more levels of air over its water, the span between the rims is filled to the rims' level, 2–3 wide along the
  river, over an arch's curve: its underside 2 or more above the water under every row at its feet, rising as
  1 − (2t − 1)² to a crown 2 layers thick (sometimes 3, 1 where the gorge leaves no room), worn a level here and there;
  the support rule then takes away what nothing would hold up: the remnant of a roof the river wore through. It is worn,
  not a plank: one row, its spine, joins the two rims whole at their level; the rows beside it each have their own curve
  (the crown off the spine's by a tile, the underside up to a level higher, so the arch thins toward its faces), their
  decks waisted toward the crown a level or two lower (through, where that leaves nothing) and a level off here and
  there; and its feet flare, a buttress a row out on either face by each rim, now and then, 1–2 under the rims. The
  surface rises on the arch's tiles only.

**How often, and where.** None at or below the theme's default Verticality (`formsFor`): a map with caves has no Fill
or Remove unfed water in the editor yet (they are refused with one line, as on an imported cave map; Drought and Badtide
run on caves since #404), so the ordinary map stays exactly as it was until those have their rules for caves; above it,
`formsWanted` draws from the map's own stream (`stream(seed, "forms3d")`, the same on every attempt, nothing else drawn
differently): Verticality 0 none; a spring cave on 25% + Verticality% of maps (up to 90%), two
from 50, three from 75; an overhang on 20% + Verticality% (up to 85%); an arch from 35, more in Canyon and Highlands, fewer
in Lake Basin and Delta, two at 70+ on most maps. A drawn form that finds no place, or that the map cannot keep, is
recorded as dropped with why (`GenerateResult.intentions`, outcome "dropped"); one that emerged carries where it is and
where it is best seen from (`at`, `from`). No arch above 128², and no spring cave on a map made with Sources: None.

**What keeps the map right.** Each form is carved against the support rule as it grows (`terrain/support.ts`
`unsupportedVoxels`: kept only when nothing would fall), and no two touch. Then the map is built again with them and
must still pass, or the forms near what failed are dropped and it is built again (at most two builds): every blocking
check, and no check (advisory ones included) failing that passed without them; nothing dropped by the rule pass; the
water settled if it settled before; no ruler-straight channel; relief within the map's top; every intention that had
emerged still emerging; the three outcomes' score no lower; and each form's own check on the built map (a cave's sources
under their roof and its course wet out to the river; 4 or more tiles of the start's level ground under rock; deck tiles
over water with 2 or more levels of air between the water and the arch). A map whose forms are all dropped is the map it
was, byte for byte.

**How they enter the map.** The forms are the generated field's terrain as runs (`GeneratedField.caves`, stored as format
3's `runs` in the document's `field`, so a heightfield field is unchanged). The build treats the field's caves as an
imported map's (D487): the features never reshape them, the brushes shape their top runs only, the forces leave them, and
the water is the stacked engine's on every column (`features/build.ts`: the stacked model wherever the terrain is not a
heightfield, the field's caves or the Block tool's, which closes #435's gap for generated maps). A spring's sources stand
on the top of the run from z = 0, a cave's floor (GAME_RULES §3.4; `terrain/runs.ts` `bottomRunTop`), each held to the game's own rule as an object placed in a cave is
(D491, `features/objects.ts` `standProblem`), its cells free of the map's objects; an object placed at a level is refused
in a source's cells ("a water source stands there"). The file writes the
caves' voxels and the stacked water and soil (`gen/pack.ts` `stackedWorld`, as an exported cave import does). The session
opens such a map as a generated map with caves: `columns`, `plainAt`, the support refusals and the Block tool read the
field's terrain.

**Changed for every map with terrain above terrain** (no heightfield map changes):
- the settle cache compares a stacked model's terrain too (`sameModel`): the same surface over other caves is other water;
- on a generated map only (not an import), the checks read the water seen through the roofs on its own floor
  (`validate/rust.ts`, `sim/stackWater.ts` `seenFloor`): a cave's pool and a river under an arch stand on their floors,
  not on the roof over them; an imported map keeps the surface's floor, as its rows were pinned against the official maps;
- `water.source_in_flow` leaves out a source under a roof (`rust/checks` `playability.rs` `roofed`): the surface's spill
  levels cannot see into a cave, whose water leaves by its own mouth; when every source is under a roof the row says so
  ("9 water sources under a roof, where no other source's flow reaches"), not that there are none. On the 22 official
  maps this changes two rows: Terraces' `water.source_in_flow` turns from 3 of 19 flagged to ok (its 3 were under a
  roof), and Pressure's reads as above (it was ok);
- the water story and the intentions' checks read the water seen through the roofs (`seenWater`), and a cave's spring and
  its few tiles of stream are no river of the map's story (`analysis/story.ts`).

**The first look (D348).** An arch is the one form that changes the land seen from above, so a map that looks for an arch
holds its first look until the map is done: the land shown is the land at the end (`generate`; only at 128² and under,
where the first look waits for the settled start anyway; above 128² no arch is grown).

**Names.** A map whose standout is a form takes a title from its own list ("Hidden Spring Gorge", "Rock Shelter Valley",
"Stone Arch Heights", `gen/names.ts`) and says it in its own numbers ("A spring rises in a cave 6 tiles into the cliff and
feeds the river.").

**Checked:** `tests/unit/forms3d.test.ts` (each form on hand-made land: its place, nothing falls, the surface kept where
it should be, the same draw the same terrain, none where the land offers none); `tests/contract/forms3d.test.ts` (Canyon
96² seed 3 at Verticality 80: spring caves and an arch, nothing dropped, the file's caves and stacked water, the project
reopens to the same .timber; none at Verticality 0); the batches and the 84 maps below.

**Numbers** (`tools/batch.ts`, 128², seeds 1–10 of every theme and Any at each Verticality, 70 maps a row; this
machine shared with other sessions' runs, so times are high; the batches ran before the worn mouths, the arch's curve
and its 2–3 wide deck, with up to three builds, now two):

| Verticality | final | spring caves | overhangs | arches | forms a map, median by theme | project round trip |
|---|---|---|---|---|---|---|
| 20 | 70 of 70 | 2 | 0 | 0 | 0 (max 1; only Lake Basin and Delta, whose default is 10, are above theirs) | 70 of 70 |
| 50 | 70 of 70 | 56 | 12 | 16 | 0–2 (max 4) | 70 of 70 |
| 80 | 70 of 70 | 74 | 22 | 44 | Canyon 5, Highlands 4, Any 3, Delta 2, River Valley 1, Lake Basin 1, Islands 0 (max 6) | 70 of 70 |

- **Rerun after the shape changes (worn mouths, the arch's curve, 2–3 wide decks), PARTIAL** (stopped when usage ran
  out; 10 of 21 batches, seeds 1–10 each): every batch 10/10 final, 0 blocks dropped, 10/10 projects reopen equal.
  Kept (caves / overhangs / arches): Vt 20: Canyon, Highlands, River Valley 0 / 0 / 0 (at or below their default),
  Lake Basin 1 / 0 / 0; Vt 50: Canyon 13 / 2 / 4, Highlands 13 / 2 / 5, River Valley 7 / 3 / 2; Vt 80: Canyon 24 / 3 / 9,
  Highlands 18 / 4 / 8, River Valley 2 / 5 / 4. Median time at Vt 80: Canyon 14.3 s, Highlands 15.7 s, River Valley
  18.3 s (loaded machine). Not rerun yet: Delta, Islands and Any at all three, Lake Basin at 50 and 80.
- The rule pass dropped 0 blocks on every map; relief stayed within 16 below 70 (up to 19 at 80, tall maps).
- Where they grow: spring caves wherever a river runs by a cliff (Canyon and Highlands most, Islands none: its rivers
  run on low land); overhangs only where the start stands by a cliff; arches in gorges (Canyon, Highlands, Delta's
  upland at 80). River Valley at 80 drops most of its caves: its terraced banks hold sites whose checks then fail.
- The 84 maps (`tools/map-hashes.ts`, seeds 1–6, 96² and 128², every theme at its default Verticality): identical in
  land, water, objects and checks (no forms at the default); generator 0.10.0 changes every .timber and project by its
  version string only. With forms at the default (built first, then gated): 31 changed, every one where a form was
  placed (22 with a spring cave, 11 an overhang, 8 an arch, on Canyon and Highlands, whose defaults are 40 and 45), and
  their caves turned off Fill and Remove unfed water in the editor (and Drought, before #404), which is why the gate is
  there.
- Time: at Verticality 80, 12 maps (Canyon, Highlands, River Valley, Any, seeds 1–3) took a median of 14.7 s against
  dev's 7.9 s on the same loaded machine: a map with forms is built and checked once or twice more, each time with the
  stacked engine's settle. Under 3 s at 128² is not met, by dev either on this machine.

**Captures:** the contact sheet (`docs/sheets/3d-generation-1.png`, D144) shows the default maps, unchanged; the forms
themselves, in the editor's 3D view from where each is best seen, are `docs/sheets/3d-generation-1-forms.jpg` (Canyon 2
at Verticality 50, Highlands 2 and Canyon 3 at 80; `tools/capture-forms3d.ts --maps theme:seed:vt,… [--views
close,high,top] [--only …]`). The worn shapes against the boxes they replaced (Highlands 2 at 80: its cave's mouth, its
big arch from above and straight down): `docs/sheets/3d-generation-1-natural.jpg`.

**Falls short, for the next parts:**
- No forms at the default Verticality: on a map with a form, Fill and Remove unfed water are refused as on an imported
  cave map. Once the stacked engine has their rules, the gate can go (the forms at the default were built and measured:
  on the 84 maps they changed 31, every one where a form was placed).
- Overhangs are rare: most starts stand on open ground with no cliff in reach. Steering the settler toward a cliff when
  the map looks for one would change maps that then find none, so it waits for a round where that is allowed.
- No arch above 128² (its first look is not held there); a land-stage arch on the planned water would bring them back.
- The 3D view shows the forms from outside; seeing into a cave and under an arch is the view's (step 2).
- The other processes of step 4 (tunnels, sky bridges, cliff paths, underground rivers, collapses), cave starts, and the
  probe batch (T1–T7) come later.

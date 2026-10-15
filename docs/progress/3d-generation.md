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
  mouth, so its water leaves by the mouth alone. The surface does not change.
- **An overhang sheltering the start** (`start-overhang`). Where the start's level ground meets a cliff 3 or more above it
  within 8–12 tiles, a stretch of 3–14 tiles of the face is worn back 1–3 tiles, as soft rock under a harder cap, 2–3 high,
  its depth wandering along the face; where the rock would not hold that, less deep, down to a tile. Level ground at the
  start's floor runs on under the rock. The surface does not change. The start itself is never roofed (cave starts are
  for Verticality 70+, later).
- **An arch over a gorge** (`gorge-arch`). Where a river runs between rims at one height 3 to 6 + Verticality/6 tiles apart
  with 3 or more levels of air over its water, the span between the rims is filled from a layer 2 or more above the water
  to the rims' level, 1–3 wide along the river, and the support rule takes away what nothing would hold up (the rule's
  own corbelled shape, sometimes a layer thicker): the remnant of a roof the river wore through. Its deck joins the two
  rims at their level. The surface rises on the deck's tiles only.

**How often, and where.** `formsWanted` draws from the map's own stream (`stream(seed, "forms3d")`, the same on every
attempt, nothing else drawn differently): Verticality 0 none; a spring cave on 25% + Verticality% of maps (up to 90%), two
from 50, three from 75; an overhang on 20% + Verticality% (up to 85%); an arch from 35, more in Canyon and Highlands, fewer
in Lake Basin and Delta, two at 70+ on most maps. A drawn form that finds no place, or that the map cannot keep, is
recorded as dropped with why (`GenerateResult.intentions`, outcome "dropped"); one that emerged carries where it is and
where it is best seen from (`at`, `from`). No arch above 128², and no spring cave on a map made with Sources: None.

**What keeps the map right.** Each form is carved against the support rule as it grows (`terrain/support.ts`
`unsupportedVoxels`: kept only when nothing would fall), and no two touch. Then the map is built again with them and
must still pass, or the forms near what failed are dropped and it is built again (at most three builds): every blocking
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
on the top of the run from z = 0, a cave's floor (GAME_RULES §3.4; `terrain/runs.ts` `bottomRunTop`). The file writes the
caves' voxels and the stacked water and soil (`gen/pack.ts` `stackedWorld`, as an exported cave import does). The session
opens such a map as a generated map with caves: `columns`, `plainAt`, the support refusals and the Block tool read the
field's terrain.

**Changed for every map with terrain above terrain** (no heightfield map changes):
- the settle cache compares a stacked model's terrain too (`sameModel`): the same surface over other caves is other water;
- the checks read the water seen through the roofs on its own floor (`validate/rust.ts`, `sim/stackWater.ts` `seenFloor`):
  a cave's pool and a river under an arch stand on their floors, not on the roof over them;
- `water.source_in_flow` leaves out a source under a roof (`rust/checks` `playability.rs` `roofed`): the surface's spill
  levels cannot see into a cave, whose water leaves by its own mouth;
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

**Numbers** (128², seeds 1–4 of every theme and Any; this machine shared with other sessions' runs, so times are high):

| Verticality | maps with a form | spring caves | overhangs | arches | forms a map (median, max) | relief |
|---|---|---|---|---|---|---|
| 20 | NUMBERS | | | | | |
| 50 | | | | | | |
| 80 | | | | | | |

**Falls short, for the next parts:**
- On a map with a form, Drought, Badtide and the drought line are refused as on an imported cave map ("Drought and Badtide
  aren't worked out for maps with caves yet"): the stacked engine's drought is the next piece for the Weather view.
- Overhangs are rare: most starts stand on open ground with no cliff in reach. Steering the settler toward a cliff when
  the map looks for one would change maps that then find none, so it waits for a round where that is allowed.
- No arch above 128² (its first look is not held there); a land-stage arch on the planned water would bring them back.
- The 3D view shows the forms from outside; seeing into a cave and under an arch is the view's (step 2).
- The other processes of step 4 (tunnels, sky bridges, cliff paths, underground rivers, collapses), cave starts, and the
  probe batch (T1–T7) come later.

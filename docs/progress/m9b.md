# M9b: composition and variety

> **In progress (2026-09-28).** Branch `feature/m9b` (draft PR #70), from `feature/m9a` (merged in
> to 6be0d53) and `dev` (to d02ac283). Generator **0.8.0**. Built: one readable water system with
> courses held end to end, Islands' sea in six layouts, the themes steered toward their promises
> and checked, the candidate choice, D274's intentions, the 8 orientations, names and a
> how-it-plays line in the map's own numbers, Another like this, Variety as a setting, the game's
> soil rules (D298) and now the game's water rules and edge spill (D293, D303: one switch, D308),
> the probe's badwater finding (D302 (1)). **The plan (D308):** the rules switch lands with one
> re-pin of the tests and golden fixtures (the water golden vectors done; the map-bound tests and
> `npm run oracle` next, once the generator settles); then iterate on contact sheets and small
> samples; the full batches, the 200-seeds-per-theme measures and one pooled probe batch run once,
> at the release candidate; a review set only when Kyler's eye is needed. **Asked of Kyler:** D297's
> line fails on 8 of 18 maps under the game's rules (the dry-tile evaporation; see "The game's
> water rules"). Defaults this session chose: decisions-pending #100–#109 and #130–#133.

Kyler's decisions: PLAN §20 D252, D273–D278, D282, D286, D294 (the starting list from M9a's review
set), D298 (the game's own soil rules). The yardstick: `docs/PERFECT.md`'s "Maps", "Water" and
"Challenge" (Challenge's terrain difficulty is deferred, D276).

## What was built

### One readable water system (D273 (1), D294 (1))

M9a's maps held 4–9 separate water systems each: every river head, spring and spring lake found its
own way to its own edge. Now (`land/hydro.ts`):

- **The main river first, tributaries after.** The first head traced is the main river; every later
  head must join the water already traced, as a tributary at least 18% of the map's side long. Only
  a Rivers count the player set may enter as a river of its own when none can join. At most 4–6
  heads (4 at 96², 5 at 128², 6 at 192², 7 at 256²), a spring lake's kept room among them.
- **Rivers that can be followed** (`land/courses.ts`). Before the water settles, a priority flood
  from every draining edge tile (all but an inflow's sealed mouth) and a second from the stretch of
  edge the river's system leaves by (35% of the side either way, and a delta's mouths): where some
  course tile's water has a strictly lower way out elsewhere, the plan is refused and made again
  (an attempt refused before its water settled now keeps only its land for the record, no settle).
- The causes it found, each fixed at the source:
  - **a lake standing above where its river begins**: a lake found on a course now stands below the
    head's level (the mouth's banks, or the spring) as well as within the water budget; a
    budget-cut hollow is one lake, not several copies;
  - **a head below the spill of its own way down** (a low point of the upstream edge behind a ridge,
    or a hollow on the way filling above the head): refused when it is traced;
  - **an inflow's banks lowered to its channel**: the carve and the edge relaxing now leave the
    outer two rows of an inflow's edge beyond its mouth's own width (the game drains every edge tile
    but a mouth's sources), and an inflow heads inland from its mouth, never along its edge;
  - **a weir whose pool drained by an edge 40+ tiles upstream**: its pool is followed all the way;
  - **an inflow's water running back out by its own edge** (a low plain along the edge beside the
    mouth; a tie with the exit counted too, since the near edge takes it all): the edge row there
    gets a lip a level over the water, at most two levels high and a quarter of the side long, else
    the plan is made again; the mouth's own tiles never;
  - **a lake standing higher than an inflow's mouth could hold** (its water would stand over the
    mouth's edge beside it): a lake on a river stands no higher than the lowest spill of every
    inflow mouth whose water reaches it;
  - **an inflow's mouth** keeps a level block three tiles wide and three deep at its lowest bed
    (the edge's banks beside it are kept now; a narrower mouth held no BadwaterSource when the
    player turned the river to badwater in the editor: 4 of 16 River Valley mains could, now all);
  - **a spring lake's water** joins the rivers already traced, as a spring's does (a spring lake
    with a way out of its own was a second system, sometimes larger than the river's);
  - **a hollow on the course above the river's reach** (a pit on a shoulder the course crosses, its
    water standing over the channel's banks upstream, where they drain away lower): no lake of that
    river's, so its channel runs on through it (it was left uncarved, then dropped as unreached,
    and the course stood high and dry across it).
- **The water story** (`analysis/story.ts`, information and the candidate choice): the main
  system's share of the water, other systems, heads, rivers that never join, how much of each
  river's course holds water, and how much of the dry land lies within 14% of the side of clean
  water (D294's "water in one corner").

### Themes keep their promise (D273 (2))

`analysis/signature.ts` measures each promise; `gen/outcomes.ts` `PROMISES` sets the lines where
the theme's maps part from the others (on seeds 1–10 of every theme at 128²):

| Theme | Promise | Measure and line |
|---|---|---|
| River Valley | a main river through a broad valley | the main river's valley floor (within a level of its water), median across its course, ≥ 20% of the side at 128², growing as the square root of the side |
| Canyon | a river cut deep between cliffs for a real stretch | a river whose ground 2–6 tiles out rises 3+ levels over its water on both sides, for max(16, 16% of the side) tiles and 20% of its course |
| Highlands | high, rugged ground with plateaus and valleys among it | 60%+ of the dry land 4+ levels over the rivers, 3+ plateaus (level ground of 120+ tiles at 128² whose rim mostly drops 2+ levels), cliffs on 10%+ |
| Lake Basin | big lakes that dominate the water | 55%+ of the water in the natural lakes the generator found (its read-back lake features; level bodies counted wide rivers too), the largest 4%+ of the map |
| Delta | a river splitting into several channels as it reaches low ground | the main system leaves by 3+ separate mouths |
| Islands | land broken by water into islands | 3+ islands of 30+ tiles (at 128²) in a sea of 25%+ of the map, 5%+ of the land apart from the largest mass |

**Larger maps** (the paused 256² batches: River Valley missed its promise 40 times in 14 maps,
and "only a fifth of the land near clean water" was the commonest water miss on every theme): the
valley floor, the springs and the heads grow with the map (the floor and the springs as the square
root of the side and the area, the heads as the area to the ¾), and River Valley's line is a floor
25.6 tiles wide at 128², growing as the square root of the side (36 at 256²).

The priors were steered toward them (they blurred, D294 (2)): River Valley's big river clears a
floor of 7–13 tiles; Canyon's floor 0–2.5 and its cut 3–6 levels; Highlands leans up (lean
0.55–0.9), with more and broader plateaus, benches 2–3, rivers set 1.5–3.5 into their valleys;
Delta always fans into two or three more mouths; Canyon has 2–5 springs, so side canyons carry
water across its plateaus (its water sat in one corner, D294 (1, 4)).

**Islands had no sea** (D294 (2)): the Lakes setting's None applied at Islands' own preset (None),
cutting every sea's lake budget to nothing. A setting now leans the genome only where it moves from
the theme's preset. The sea lies in one of six layouts (`land/genome.ts` `addSea`, its own random
stream): off-centre, off one edge behind a strip of coast, an archipelago across most of the map,
an island chain along an arc, atolls (rings of islets, lobed, with passes), or two seas with a
ridge between. A sea is fed by springs on the heights round it (an inflow enters low on the bowl's
rim, and no lake stands above where its water comes in), and keeps a rim of land along the map's
edges: a sea that ran to an edge spilled out there and stood low, its islands on the dry floor
joined to the land (Islands met its promise on 3 of 10 maps; the archipelago's sea is broad again,
its islands scattered where the water is deep).

### A character on every map (D273 (3), D274)

- **The set** (`land/intentions.ts`): Kyler's four and the seven, and the ten he picked: the oxbow
  lake, lakes stepping down the valley, the river split round a big island, two falls side by side,
  a long cliff splitting the map, hanging side valleys, two ways to grow, badwater through the
  richest land, a relic on a pinnacle, a plug holding back a lake. Each has its steering (a nudge,
  never a build) and its check on the finished map. Every map draws one (60%) or two (40%).
- **The recipes fold in** (D275 (1)): the great scarp is the long cliff's steering, the island in a
  river the split island's, the chain of lakes the stepped lakes', the mesa field one of the
  landmark's, the hanging lake and the caldera already Kyler's high lake and crater; the badwater
  volcano and the volcano island are dropped (the Islands layouts stand for the second).
- **Lakes read per level body**: the checks read every level lake within the water (a river joins
  the lakes along it into one body, and each counted as one before).
- Emergence, forced on Any seeds 1–6 at 128² (`tools/intention-rates.ts`), first round: the long
  cliff 6/6, badwater through rich land 3/6, the split island, two ways and the relic 2/6, twin
  falls, the oxbow and stepped lakes 1/6, hanging valleys and the plug 0/6. Since: the oxbow tries
  any river where its bed has room below it; two ways and badwater through rich land steer the
  start (its preference reads the farmland one way and higher ground the other, and the low land
  beside badwater within 60 tiles) and are re-steered once like the other start intentions (two
  ways 3/3 on seeds 1–3).
- **A map's own intention** (D138: failure allowed, many realizations): when none of the
  intentions a map was steered toward emerged, the set is checked on the finished map in an order
  drawn from its seed, and the first that holds is its standout ("found", not steered). Every map
  of seeds 1–10 of every theme then had a standout (58 of 70 had one before it).

### Candidates by the outcomes (D278 (1a))

`generate` makes candidates until one meets the three outcomes (readable water, the theme's promise,
a standout intention); a candidate that misses one grows new land; after 4 the best stands (the most
outcomes met, then stored water near the start where the player asked for more reserve). It replaces
K = 3 and the score (dropped with M9c, D278 (3)). Each candidate is announced (`onCandidate`); the
page shows the first one found, its water settled, and "Found a map. Looking for a better one (2 of
4)" while it looks on.

Where the outcomes stand (seeds 1–10 of every theme at 128², `tools/look.ts`; three rounds, the
last after the course, sea, Canyon, badwater and found-intention changes). Times are medians on this
machine while other sessions' tests and conversions ran (four maps at a time), so they are high:

| Theme | Promise | Water reads | Standout | All three | Attempts | Time | First candidate |
|---|---|---|---|---|---|---|---|
| Any | — | 8 | 10 | 8 | 3 | 12.6 s | 8.8 s |
| River Valley | 10 | 6 | 10 | 6 | 5 | 23.2 s | 4.7 s |
| Canyon | 10 | 10 | 10 | 10 | 5 | 17.7 s | 5.6 s |
| Highlands | 10 | 10 | 10 | 10 | 3 | 11.2 s | 4.7 s |
| Lake Basin | 7 | 10 | 10 | 7 | 5 | 11.9 s | 5.3 s |
| Delta | 9 | 10 | 10 | 9 | 2 | 10.3 s | 7.2 s |
| Islands | 8 | 10 | 10 | 8 | 3 | 32.9 s | 15.5 s |

(The first round: 30 of 70 met all three; Canyon's water read on 4, Islands kept its promise on 3.)
Most of the time is the water's settle, once or twice an attempt (about 0.6 s at 128², a broad sea
2–2.5 s: Islands' first candidate is slow for that). What still misses: River Valley's water on 4 of
10 (a separate spring lake larger than the river's own water, a tributary dry most of its course,
dry uplands), Lake Basin's lakes on 3.

### Nothing stamped (D273 (5), D294 (5))

- Crater rims (the caldera part) and round lakes are lobed by two waves round them (on a
  pseudo-angle, the deterministic sine) and stretched along a drawn axis; cone craters noisier.
- The badwater pit is 1.5–2.1 times as long as wide, along the fall of the ground, so its stain
  runs down toward its ditch instead of a round disc; a ditch joins only a channel whose water
  leaves the map without passing a lake (it poisoned whole seas and lakes), and only in the last
  12% of the side before it leaves (joined higher up, it turned the main river's whole lower course
  purple), else it runs to the edge; on its way it never crosses or runs beside other water.

### The 8 orientations (D275 (2))

`land/orient.ts`: each map's land is turned or mirrored into one of its 8 orientations right after
it is made, from a stream of its own, and the water's way with it; the rivers, the start and the
objects are then found on the turned land. A map that is not square takes the 4 that keep its sides.
Measured on the draw (seeds 1–100; it does not depend on the theme): all 8 appear, the most common
18% (genome 0), 17% (genomes 1 and 2).

### Names, how it plays, Another like this, Variety

- **Names** (`gen/names.ts`, D278 (1b)): from the standout, a few titles each ("Stair Lakes", "Relic
  Spire", "Oxbow Bend"), some with the land's noun (the theme's, the sea layout's, or for Any what
  the map shows most); chosen by the seed, never a title the names study forbids (official and
  workshop titles, real places: `src/core/data/forbiddenNames.json`). **How it plays**: the
  standout in the map's own numbers (each intention's check says what it found, "A river winds
  back and forth 12 times down the hill, dropping 5 levels at its bends.") and one thing read from
  the map (the start's water in the first drought, a dam site near the start, where the badwater
  lies, the woods). On the map card; the theme moves to
  the line under the name.
- **Another like this** (D278 (1c)): on the page beside Refine, and in the editor's menu. A sibling
  keeps the theme, settings and intentions and grows different land (the genome's variation, D143);
  its link carries `vr=` and `in=`. A sibling whose land matches the map it came from (85% of tiles
  within a level) is passed over for the next.
- **Variety** is a setting (`vy=`, 0–100, 70 the default; D276), beside Verticality.

### The game's own soil rules (D298)

`src/core/sim/columns.ts` and `soil3d.ts` are taken whole from `feature/terrain3d-a` at 62508d7d
(identical on both branches). `sim/soil.ts` `gameSoil` runs its game mode on one run per tile; the
build and the TypeScript validator's moisture, soil contamination and drought moisture use it;
`prototype/soil.py` is the Python validator's port (float32, one whole-grid update a tick),
bit for bit with the TypeScript. `tests/unit/soilGame.test.ts` holds the heightfield half of the 3D
branch's soil test (its cave half needs the stacked engine) and the Python parity.

Measured (`tools/soil-compare.ts`, the same maps with the old model and the game's; seeds 1–3 of
every theme at 128², and Any, River Valley and Islands seed 1 at 256²):

| Theme | Plants | Moved or changed | Old model's time / game's (mean, ms, under load) |
|---|---|---|---|
| Any | 5,980 | 1,745 (29%) | 19,852 / 18,641 |
| River Valley | 5,954 | 1,683 (28%) | 5,474 / 5,923 |
| Canyon | 4,937 | 1,580 (32%) | 21,166 / 17,905 |
| Highlands | 5,461 | 0 | 28,876 / 30,084 |
| Lake Basin | 5,947 | 1,964 (33%) | 17,271 / 14,268 |
| Delta | 7,085 | 4,334 (61%) | 12,716 / 14,992 |
| Islands | 6,161 | 0 | 25,576 / 25,555 |

Most of the moves are a cascade: planting draws over the moist land, so one tile of difference
shifts every later draw; where no tile's moisture crossed zero (Highlands, Islands here), nothing
moved. The time is the same within the machine's noise (game mode ~20 ms at 128²). Not yet on the
game's rules: the Real places conversion (`places/place.ts`), `planMapResources` (Real places and
Pick a place) and the editor's soil view; decisions-pending #109.

### The game's water rules (D293, D303, D308)

`sim/water.ts` runs the game's rules by default (`rules: "port"` keeps the port as it was, for the
tests): evaporation on every active tile, a dry one that receives water too; the spill threshold at
the map's edge (floor-0 tiles beside the padding; `edgeSpill`, taken from `feature/weather-days`);
a partial obstacle (NaturalDam) read from the higher of the two floors; the source step setting the
old depth. The game's fifth rule, direction limiters, needs a badtide drain's roofed cell, which a
heightfield cannot hold. `prototype/watersim.py` runs the same rules, bit for bit (every golden
fixture and the edge, dam and seep grids: 0 difference); the golden vectors are regenerated; the
speed-ups test keeps its port digests (still byte-exact) and pins the game's beside them.

**D297's line** (`tools/water-rules-band.ts`, information: the canonical settle, game against port, on the same
map's water model): 10 of 18 maps within (six themes, seeds 1–3, 128²). Outside: River Valley 2
(139 tiles, volume −0.36%), Lake Basin 3 (156 tiles, 0.057 → 0), Delta 3 (30 tiles, −0.85%),
Delta 1 and 2, Highlands 1 and 2, River Valley 3 (3–30 tiles). Taking the rules one at a time on
three of them, the dry-tile evaporation makes all of it (without it: 0 tiles, 0.000%); the edge
spill alone moves a few edge-row tiles from 0 to 0.1. Thin spreading films (0.04–0.09 deep) no
longer form, or take another way, since a dry tile loses 1e-3 a second before it wets. The game's
result is the line's own reference; asked of Kyler through the milestone session, with the
session's default: accept the game's rules with this departure, the pooled probe batch at the
release candidate checking the water against the game itself (decisions-pending #133).

### The probe's two findings (D302)

Measured with the weather-cycle model the probe compares the game against, which followed the game
on both (`investigation/m9b/cycle-check.ts`: 3 temperate days, a 3-day drought, 3 temperate, a
3-day badtide; 10–40 s a map, no game):

- **Badwater refilling pools** (D273 (1), (5)): water over 10% badwater more than 3 tiles from the
  file's badwater, just before the badtide. On M9b's Any 128² seed 1, 40 tiles: refilling after the
  drought, the ditch (cut one below the ground beside it) rose over its banks and left a 0.1-deep
  sheet of badwater on the flat beside it. Ditches are now cut two below the ground beside them: 0
  tiles outside the way down on 15 maps (two Delta maps keep 2 tiles, within the probe's allowance).
- **A sheet in the badtide** (D273 (2)): tiles 0.05–0.12 deep a day into the badtide, dry in the
  file and more than 2 tiles from its water. Delta on M9b: 0–7 tiles (seeds 1–5). River Valley:
  284 and 491 tiles on seeds 1 and 4 (none on 3); Any 4 and 5: 65–77. It is the floodplain: the
  valley floor one level over the bed (PLAN §7.4), the channel running about 0.7 deep; after the
  drought the refill overtops onto the floor and leaves a film. **Kyler's answer (D307):** a floor
  one level over its bed that floods when the river refills or in a badtide is a floodplain, as the
  game plays it; the floor rule and the channels' depth stay (decisions-pending #132).

### Chaos (D273 (6))

Any at Variety 100 and Verticality 100 (`tools/batches.ts --set "vy=100&vt=100"`, 4 jobs, the
results in `investigation/m9b/local/chaos/`):

| Size | Seeds | Final | First attempt | Attempts (mean) | Time a map (median / p90 / max) |
|---|---|---|---|---|---|
| 128² | 100 | 98% | 17% | 5.4 | 15 s / 41 s / 78 s |
| 256² | 50 | 98% | 14% | 6.3 | 102 s / 200 s / 354 s |

**Breakage found and fixed:** 16 of 147 accepted maps' project files did not reopen: on land above
16 a river's natural fall can drop more than 15 levels, and the feature schema's bed step allowed
15 (its start already 22). A bed step's drop now goes to 22, as its start (`features.schema.json`);
the waterfall set piece keeps its own 15 (PLAN §9.10); two of the maps re-checked reopen and rebuild
byte for byte. The time at 256² is too long (most attempts refused after their settle: the course
check, the start, the water settling).

## Tools

- `tools/look.ts` (+ `look-grid.py`): chosen maps drawn large with their water story, signature,
  outcomes, intentions and name; `--systems`, `--paths`, `--intention <id>`.
- `tools/intention-rates.ts`: each intention forced on the same seeds, how often it emerges.
- `tools/soil-compare.ts`: D298's report.

## Tests updated because a decision changed what they tested

- `tests/contract/spec.test.ts`: the codec's round trip draws Variety too (D276: a setting).
- `tests/unit/genome.test.ts`: "draws zero, one or two intentions" is now "draws one or two
  intentions, never none" (D273 (3): every map has a character).
- `tests/contract/live-water.test.ts`: a regeneration whose own map passed takes the attempts its
  candidate choice takes (D278 (1a)), fewer than every layout, instead of exactly one.
- `tests/e2e/editor.spec.ts`, `tests/e2e/legend.spec.ts`: the editor's heading and the page's
  caption name the map by its own name (D278 (1b)), read from the card, not "River Valley".
- `tests/contract/ops.test.ts`: the placed Blockage goes on a free tile found on the map, not at
  (40, 3), which 0.8.0's map of seed 77 covers.

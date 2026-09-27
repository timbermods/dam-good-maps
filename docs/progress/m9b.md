# M9b: composition and variety

> **In progress (2026-09-27).** Branch `feature/m9b` (draft PR #70), from `feature/m9a`'s frozen
> generator (merged in to 788c145) and `dev` (to 61bd0ff). Generator **0.8.0**. Built so far: one
> readable water system, courses that never run dry, Islands' sea in six layouts, the themes steered
> toward their promises and checked, the candidate choice by D273's outcomes, D274's intentions set,
> the 8 orientations, names and a how-it-plays line, Another like this, Variety as a setting, and
> D298's game soil (the build and both validators). **Left, in order:** the intentions' emergence
> (four of the ten new ones rarely emerge yet), the Canyon and Islands promises, generation time
> (median 8–25 s at 128² under load: too many attempts), chaos (Any at Variety 100, Verticality
> 100), the tests for 0.8.0 (not yet run: M9a's probe batch holds the machine), the docs (ROADMAP,
> PLAN, EDITOR_PLAN), the contact sheet, then the first review set. The defaults this session
> chose are decisions-pending #100–#109.

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
  heads (4 at 96², 5 at 128², 6 at 256²), a spring lake's kept room among them.
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
  - **a weir whose pool drained by an edge 40+ tiles upstream**: its pool is followed all the way.
- **The water story** (`analysis/story.ts`, information and the candidate choice): the main
  system's share of the water, other systems, heads, rivers that never join, how much of each
  river's course holds water, and how much of the dry land lies within 14% of the side of clean
  water (D294's "water in one corner").

### Themes keep their promise (D273 (2))

`analysis/signature.ts` measures each promise; `gen/outcomes.ts` `PROMISES` sets the lines where
the theme's maps part from the others (on seeds 1–10 of every theme at 128²):

| Theme | Promise | Measure and line |
|---|---|---|
| River Valley | a main river through a broad valley | the main river's valley floor (within a level of its water), median across its course, ≥ 20% of the side |
| Canyon | a river cut deep between cliffs for a real stretch | a river whose ground 2–6 tiles out rises 3+ levels over its water on both sides, for max(16, 16% of the side) tiles and 20% of its course |
| Highlands | high, rugged ground with plateaus and valleys among it | 60%+ of the dry land 4+ levels over the rivers, 3+ plateaus (level ground of 120+ tiles at 128² whose rim mostly drops 2+ levels), cliffs on 10%+ |
| Lake Basin | big lakes that dominate the water | 55%+ of the water in lakes (level bodies of 150+ tiles with open water), the largest 4%+ of the map |
| Delta | a river splitting into several channels as it reaches low ground | the main system leaves by 3+ separate mouths |
| Islands | land broken by water into islands | 3+ islands of 30+ tiles (at 128²), the largest body 18%+ of the map, water 25%+, 12%+ of the land apart from the largest mass |

The priors were steered toward them (they blurred, D294 (2)): River Valley's big river clears a
floor of 7–13 tiles; Canyon's floor 0–2.5 and its cut 3–6 levels; Highlands leans up (lean
0.55–0.9), with more and broader plateaus, benches 2–3, rivers set 1.5–3.5 into their valleys;
Delta always fans into two or three more mouths.

**Islands had no sea** (D294 (2)): the Lakes setting's None applied at Islands' own preset (None),
cutting every sea's lake budget to nothing. A setting now leans the genome only where it moves from
the theme's preset. The sea lies in one of six layouts (`land/genome.ts` `addSea`, its own random
stream): off-centre, off one edge behind a strip of coast, an archipelago across most of the map,
an island chain along an arc, atolls (rings of islets, lobed, with passes), or two seas with a
ridge between. A sea is fed by springs on the heights round it (an inflow enters low on the bowl's
rim, and no lake stands above where its water comes in).

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
  falls, the oxbow and stepped lakes 1/6, hanging valleys and the plug 0/6. Being worked on.

### Candidates by the outcomes (D278 (1a))

`generate` makes candidates until one meets the three outcomes (readable water, the theme's promise,
a standout intention); a candidate that misses one grows new land; after 4 the best stands (the most
outcomes met, then stored water near the start where the player asked for more reserve). It replaces
K = 3 and the score (dropped with M9c, D278 (3)). Each candidate is announced (`onCandidate`); the
page shows the first one found, its water settled, and "Found a map. Looking for a better one (2 of
4)" while it looks on.

### Nothing stamped (D273 (5), D294 (5))

- Crater rims (the caldera part) and round lakes are lobed by two waves round them (on a
  pseudo-angle, the deterministic sine) and stretched along a drawn axis; cone craters noisier.
- The badwater pit is 1.5–2.1 times as long as wide, along the fall of the ground, so its stain
  runs down toward its ditch instead of a round disc; a ditch joins only a channel whose water
  leaves the map without passing a lake (it poisoned whole seas and lakes), else it runs to the edge.

### The 8 orientations (D275 (2))

`land/orient.ts`: each map's land is turned or mirrored into one of its 8 orientations right after
it is made, from a stream of its own, and the water's way with it; the rivers, the start and the
objects are then found on the turned land. A map that is not square takes the 4 that keep its sides.

### Names, how it plays, Another like this, Variety

- **Names** (`gen/names.ts`, D278 (1b)): from the standout, a few titles each ("Stair Lakes", "Relic
  Spire", "Oxbow Bend"), some with the land's noun (the theme's, the sea layout's, or for Any what
  the map shows most); chosen by the seed, never a title the names study forbids (official and
  workshop titles, real places: `src/core/data/forbiddenNames.json`). **How it plays**: the
  standout's sentence and one thing read from the map (the start's water in the first drought, a
  dam site near the start, where the badwater lies, the woods). On the map card; the theme moves to
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

## Tools

- `tools/look.ts` (+ `look-grid.py`): chosen maps drawn large with their water story, signature,
  outcomes, intentions and name; `--systems`, `--paths`, `--intention <id>`.
- `tools/intention-rates.ts`: each intention forced on the same seeds, how often it emerges.
- `tools/soil-compare.ts`: D298's report.

## Tests updated because a decision changed what they tested

- `tests/contract/spec.test.ts`: the codec's round trip draws Variety too (D276: a setting).

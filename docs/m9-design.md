# M9 design, version 2: a generator that invents

**Status: design version 2, for Kyler's approval by judgement** (PLAN §20 D112, D115, D145). It
keeps what worked in version 1 and adds relief and Verticality, wider theme priors, authored
intentions, a drought-aware start, a faster pipeline, a cave-ready terrain model, and the four
investigations folded in. Version 1 is in git history (PR #14). The prototype is in
[investigation/generative/v2/](../investigation/generative/v2/); every number is in
[REPORT-v2.md](../investigation/generative/REPORT-v2.md). Measures are information: only breakage,
Kyler's decided principles and what a player feels block (D115). The numbers, briefs and maps come
from the prototype before dev's core start and edge rules (#44) were merged into its branch; at the
branch's tip it runs on them, and its maps differ (REPORT-v2 §10).

## Contents

0. [Changes from version 1](#0-changes-from-version-1)
1. [The design in six lines](#1-the-design-in-six-lines)
2. [The principle](#2-the-principle)
3. [Composition: the genome and the themes](#3-composition-the-genome-and-the-themes)
4. [Emergence: the processes](#4-emergence-the-processes)
5. [Relief and Verticality](#5-relief-and-verticality)
6. [Intentions: maps that feel authored](#6-intentions-maps-that-feel-authored)
7. [The start and the guards](#7-the-start-and-the-guards)
8. [No dam walls, and the natural narrows](#8-no-dam-walls-and-the-natural-narrows)
9. [What M9 keeps](#9-what-m9-keeps)
10. [Measures](#10-measures)
11. [Play: the cycle signature, the strategy axes and difficulty](#11-play-the-cycle-signature-the-strategy-axes-and-difficulty)
12. [The document model: cave-ready terrain](#12-the-document-model-cave-ready-terrain)
13. [Speed: what a player feels](#13-speed-what-a-player-feels)
14. [Batch pass rates](#14-batch-pass-rates)
15. [The investigations folded in](#15-the-investigations-folded-in)
16. [Keep M12 ready](#16-keep-m12-ready)
17. [Cost, version and risks](#17-cost-version-and-risks)
18. [Staging (proposal)](#18-staging-proposal)
19. [What Kyler decides](#19-what-kyler-decides)
20. [Appendix: every one-height assumption in `src/`](#20-appendix-every-one-height-assumption-in-src)

---

## 0. Changes from version 1

| Version 1 | Version 2 | Why |
|---|---|---|
| Height range medians 7–11 levels | 11–14 by theme, 13 over all six (official 13, workshop 14); the highest ground 16 at the median (14–16); tallest fall median 5.9 levels (official 3.9, workshop 5.7) | Too flat (task a) |
| No Verticality | Verticality (`vt`, 0–100) beside Variety: caprock and weathering (stacks, buttes, mesas), knickpoints and gorges, hanging valleys, cliff benches, natural ramps; above 16 only at 70+ (D132, D145), which the tall-maps probe batch has confirmed loads in the game (D172) | D132 |
| Whole-map clusters up to 68% of a theme (Delta) | The largest cluster holds 10–12.6% of a theme in four themes: the regional tilt no longer dominates the layout, and water and relief are drawn wider. Delta 18%, and Islands 33.5% since every Islands map got its sea in the middle (a proposal for M9b, §17) | Task b |
| No-approximation: 2–20% of a theme below the floor | 0.5–14% (River Valley 9.5%, Highlands 6%, Islands 3.5%; Lake Basin 12% and Delta 14% over the target) | Task c, D128 |
| No intentions | Zero, one or two per map from a set of eleven, four of them Kyler's own; steered by the prior and the settler, checked on the finished map, dropped when absent. Kyler's four emerge on 58%, 68%, 26% and 16% of their draws; fourteen more are drafted for him to pick | D138 |
| The start's water on its own level (D85) | Kyler's start water rule: a walk over the map's own terrain and slopes to a shore a pump reaches, within 12 / 20 / 28 tiles; 27% of starts now drink from another level | Kyler, 2026-09-25 |
| Starting trees counted | Starting wood (D164): logs by species within 20 tiles' walk (Oak 8, Pine 2, Birch 1); the woods (oak-rich, mixed, birch-rich) are a composition lever and a strategy axis | D164 |
| Thin bands left along the edges | No edge walls: the land runs on past the edge, and a blocking check finds none on any map | Kyler, extends D111 |
| The start ignores droughts | The settler prefers water that lasts through the first Normal drought; requiring it is decisions-pending #59 | Task e |
| Two to four settles an attempt | One settle for 88% of maps, two for 11%; a first look at 0.15 s at 128² | Task f |
| Heights only | Terrain kept as runs per column; format 3 stores runs; caves slot in with no format change | Task h, D118, I-1 |
| The Dam site tool proposed as spurs | Built: a natural-narrows builder that never reads as a wall | Task g, D111 |
| Round, blob-shaped lakes; Islands maps that don't read as islands | Lakes take the land's shape (valley-shaped basins, valley lakes), as round as real lakes; every Islands map has a broad sea with islands scattered through it | Kyler, 2026-09-25 |
| The cycle and axes studies beside the measures | A cheap cycle signature in the generator, the exact model as its check, the verified axes (version 3) in the measures and briefs, difficulty proposed as positions on them | Task d |

What stays from version 1: the genome of continuous parameters, themes as priors, uplift, erosion
and snapping, rivers from the drainage, lakes at their sills, falls, pools, splits and deltas,
starts and hazards found in the land, the product's own objects, resources, build, writer and
validators, 8 flow directions, Variety and Surprise me, no clones, names, the score as a tiebreaker
only (D137), D85's start requirements, `water.storage_possible`, and exact arithmetic (D15).

## 1. The design in six lines

1. A **genome** of continuous parameters is drawn from a theme's prior: land, water, hazards,
   resources and the woods, Verticality and intentions. A theme weights; it never lays out.
2. **Processes** make the land: uplift of parts over warped noise and a slow regional field;
   caprock, stream-power erosion and weathering; snapping to levels with benches.
3. **Water finds its own way**: rivers from the drainage with their sources at their heads, lakes
   where hollows hold water, spring lakes where no river passes, falls where beds drop, knickpoints
   and hanging valleys. Rivers leave and lakes may drain; nothing walls the edges.
4. **Everything else is found**: the start (by Kyler's start water and wood rules), dam sites,
   badwater hollows, ramps and landmarks. No dam wall, no edge wall, nothing stamped.
5. **Intentions** steer the prior and the settler toward an outcome; a check keeps or drops them.
6. **The product's own pipeline** builds, validates and writes every map; the terrain lives as runs
   per column, so caves arrive later with no format change.

## 2. The principle

- **Maps are created, not copied** (PLAN, Product principles; D108): two maps must play
  differently, not only look different.
- **No built dam walls** (D111), and no edge walls (Kyler, extending it).
- **Maps feel authored** (D138), through outcomes, never recipes.
- **Claude steers the generator and never hand-builds the map** (D139).

What the current generator does against these, and what replaces it:

| Today (m8-done) | Why it fails the principle | This design |
|---|---|---|
| One planner layout per theme: a valley along an axis with terrace bands, a dam-site ridge, falls on bed steps | Every River Valley map is the same valley with noise | Parts and processes; the layout emerges (§3, §4) |
| A dam-site ridge on every map (D25) | A stamped, spoon-fed dam | Dam sites found where valleys narrow (§8) |
| Premises as planner variants with a stamped landmark | Landmarks on the same base add at most 0.02 to a theme's variety | At most a forced part in the same system (§3) |
| Rivers drawn as polylines, terrain built round them | The river decides the land | The land decides the river (§4) |
| Badwater in a 7×7 box with a straight ditch | Engineered | A hollow found on high ground, draining by its own winding ditch (§4) |

## 3. Composition: the genome and the themes

The genome (`v2/genome.ts`) holds every number one map is made from: version 1's groups (the frame,
noise, parts, processes, water, hazards, resources and the settler's preferences) and these:

| Group | New in version 2 |
|---|---|
| Relief | `base` (0.3–1.3) and `top` (up to 16; up to 22 at Verticality 70+, D172); hypsometry: `eq` blends the field toward equal area per level, `lean` tips the land toward uplands or lowlands |
| Regional field | a slow noise field, 0.3–0.6 of the map's side across and 3–7 levels high, beside the regional tilt or instead of it: an independent spatial control (playbook #1) |
| Verticality | `vt` and what it sets: the caprock's share, patch size and stratum; weathering; the main river's extra cut (`hanging`); the knickpoint reach; bench heights; the ramp chance |
| Water | spring lakes (`lakeSprings`), extra basins, basins with islands; the water's wander (`wander`, `wanderCell`), which the snaking river's nudge raises |
| Woods (D164) | the grove species weights the resources planner draws (`woods`): oak-rich, mixed or birch-rich by theme and Variety. Oak woods stand thinner and birch woods thicker, so the starting wood holds either way: a few big trees slow to regrow (30 days), or many small ones quick to regrow (7 days) |
| Intentions | zero to two, from the set of §6 |
| Variation | a sibling index (D143) |

**The parts** (version 1's, `v2/field.ts`): ridge and trough, basin (now sometimes with an
island), caldera, mesa and plateau, mesa field, escarpment (now a band that dies out along its
length), cone, knolls and spiral. Each adds to the uplift field with continuous parameters and
noise-pushed outlines, so combinations nobody authored appear.

**Themes are priors, drawn wider than version 1** (task b). Every part can appear in every theme
(a floor weight of 0.3); relief tops, water budgets and river counts are drawn over the workshop's
range; the regional tilt is weaker, and a third to a half of the maps of River Valley, Canyon,
Highlands and Delta have none. Version 1's largest whole-map clusters were maps shaped like one
tilted plane (the share of their height picture a plane explains: 0.43–0.57, against 0.22 for
workshop maps). Under the variety distance's rotations and mirrors, one tilted plane looks like
every other, so those maps clustered (REPORT-v2 §3.2).

**Variety and Surprise me** as version 1: Variety widens every range and flattens the part
weights; from 85 every part and recipe is open to every theme; Surprise me draws a theme at
Variety 100. New: from Variety 60 the Verticality setting jitters, and from 85 a map may jump to
70–100 (4% of maps at 85, 16% at 100), so the extremes come now and then (D132).

**Recipes** (the named premises) stay at most a forced part inside the system, drawn sometimes:
island in a river, great scarp, mesa field, badwater volcano, hanging lake, caldera, chain of
lakes, volcano island.

## 4. Emergence: the processes

1. **Uplift** (`v2/field.ts`): the regional tilt (toward an edge, or toward a bowl), the regional
   field, domain-warped fractal noise, and the parts. Escarpments die out along their length (36–110
   tiles; the great-scarp recipe keeps a map-wide one): a scarp across the whole map is a planar
   step, the archetype driver of version 1.
2. **Caprock**: hard rock in patches of the upper stratum (a noise field over the land above a
   drawn level). Its share, patch size and level come from Verticality.
3. **Erosion**: stream-power incision and diffusion (Braun and Willett, as version 1), slowed where
   the rock is hard, so hard rock keeps its edges.
4. **Weathering**: soft rock in the upper stratum wastes down toward the lowest ground near it;
   hard rock stands. Stacks, hoodoos, buttes and mesas stand where the caprock lay, and a mesa with a
   soft middle keeps a rim round a hollow (a summit lake when a spring feeds it).
5. **Levels** (`v2/levels.ts`): the field is spread from `base` to `top` with its hypsometry,
   bent toward the top instead of cut there, and benched in the terraced share (benches of 1–5
   levels by Verticality, with a drawn phase so benches never align across the map). Regions under
   4 tiles merge; a 2×2 stack survives, as the build's integrity rule keeps it.
6. **Rivers from the drainage** (`v2/hydro.ts`): version 1's (edge inflows and springs follow the
   eroded field's drainage; channels cut below the ground round them; lakes where a river crosses a
   hollow, at the level of the rim where the water leaves, the outlet cut down when a lake passes
   the water budget; falls where the bed drops; pools scoured below drops; splits round islands;
   deltas), with three additions:
   - **hanging valleys**: the main river cuts 0.6–3.2 levels deeper than its tributaries, so
     their water falls where they join;
   - **knickpoints**: where a bed falls 3+ levels within a reach (5–21 tiles, longer as
     Verticality rises), the drops gather into one fall at its head and the river below cuts down
     to its foot, as a retreating waterfall leaves a gorge;
   - **spring lakes**: a closed hollow of 100+ tiles that no river crosses may get a spring at its
     head, just above its highest edge (45–100% of the time by theme). The stream runs down into the
     hollow, fills it to its rim and spills on.

7. **Natural ramps** (`v2/levels.ts`): where a cliff band cuts an upland (or lowland) of 200+ tiles
   off from the land round it, a gully steps down along the gentlest line the land offers, one level
   every two tiles or more, three tiles wide, with the genome's chance (lower as Verticality rises).
   An upland left without one needs stairs: a reward. A ramp's steps get slopes (M9a extends the
   derived-slope rule to join a ramp's steps wherever it is; the prototype pins them;
   decisions-pending #62).
8. **Hazards found in the land** (version 1's): badwater rises in a pit dug two levels into high
   ground, draining by its own winding ditch to a river below the start's water; `water.badwater_contained`
   proves it holds. Thorn belts, relics, geothermal fields, mine sites and ruins come from the
   product's own planners on the built ground.
9. **Found, never stamped**: dam sites (the validators' dam sampling), falls, lakes, the start, the
   badwater hollow, stacks and landmarks.

**Sources start rivers** (D171). Every water source sits where water begins: on the map edge where a
river enters (several sources side by side on the mouth), or as a spring at a valley head, below a
ridge or at a hollow's head. None sits inside a river or a lake, or downstream; a tributary has its
own spring at its own head, and more flow means more sources at the head or stronger ones. The
rivers come from the drainage, so they already start at heads. A check (`v2/rules.ts`,
`sourcesInFlow`) finds any spring inside a planned lake or on another river's course, and that
hydrology is planned again: 51 of the attempts on v2-128, and no finished map has one. The core
check (on dev since #44) replaces it in M9a.

**Lakes take the land's shape** (Kyler, 2026-09-25: "many round, blob-shaped lakes"). Measured first
(REPORT-v2 §3.9, `v2/lakes.ts`, the measures fixed before any result was read): version 2's lakes were rounder and less
elongated than real ones: roundness 0.20 at the median against 0.14 for the survey's real lakes and
the workshop's, elongation 1.7 against 2.1, and fewer arms. The official maps' lakes are rounder
still (0.28), but they are few (33) and hand-made. So the
generator changed, not the measure:
- a large basin is now a valley-shaped hollow: 1.6–3.4 times as long as wide, bent, with a ragged
  shore of bays and one to three fingers reaching out as side valleys would;
- **valley lakes**: a stretch of a river's valley is deepened in its middle, as ice leaves a trough.
  The lake that fills it follows the land's contours, long along the valley, with fingers up the
  side valleys whose floors lie below its level. Only ground is taken away (D111);
- round lakes stay where they belong: ponds, calderas and cone craters, and Kyler's crater and
  round-lake intentions.

After (1,154 lakes on v2-128): roundness 0.15, elongation 1.9, branching 1.67, fill 0.26, against
real terrain's 0.14, 2.0, 1.65 and 0.23, and the workshop's 0.14, 2.1, 1.68 and 0.23. Round lakes
(roundness 0.5+ and elongation under 1.5) fell from 2.9% to 1.5%. The kept-round lakes, in calderas
and cone craters, stay round (0.24).

**Islands in a sea** (Kyler: "Islands maps that don't clearly read as islands in a sea"). Before,
no Islands map read as islands in a sea: water covered 13% at the median, its largest body 9%, and
0.7% of the land lay in islands. Now every Islands map has a broad sea in its middle:
- the land rises from the sea toward every edge, a steep bowl with quiet noise, so the sea holds
  inland (water that reaches the edge leaves the map, and edges are never walled);
- the sea keeps a broad floor below steep shores, with inlets (thin sheets of water would settle
  slowly on large maps), and a map that needs a new genome gets a smaller sea;
- 12–22 islands, cones and mesas, stand clear of it, spread through it;
- weathering is kept low there, so the islands aren't worn down into the sea.

After (200 Islands maps): water covers 27% at the median and the largest body 26%, 21% of the land
lies in islands, and a map has 3 islands of 30+ tiles (up to 6). 17% of the maps meet all four
parts of the "reads as islands in a sea" test, against 0% before. The current generator reaches
25.5% only with rims at its edges, which Kyler's rule now forbids. Official Thousand Islands meets
it, as do 15% of the workshop's maps. The rest hold a broad sea but too few, too small islands;
more islands and a larger share of the land in them is M9b's next step (§17). One sea in the middle of
every map also made Islands maps alike (the largest whole-map cluster 33.5%); M9b places it
off-centre, elongated or as two or three seas.

**How this meets the refinement note "containment should look natural"**: nothing is stamped, so
nothing needs a special shape (no straight dam ridge, no square badwater box or straight ditch, no
bullseye lake, no raised banks). Steps in straight runs of 8+ and the longest straight run on
version 2's batch: REPORT-v2 §3.6.

## 5. Relief and Verticality

**Relief at the default** (task a; REPORT-v2 §3.5). Theme medians of the height range (p5–p95):
Canyon 14; River Valley, Highlands and Lake Basin 13; Delta 12; Islands 11; 13 over all six
(official 13, workshop 14; version 1 7–11). Levels in use: 15 (official and workshop 16). Tallest
fall median 5.9 levels (official 3.9, workshop 5.7; Islands' islands stand 8.9 over their sea). Flat
share 0.44 (official 0.52, workshop 0.44); cliff share 0.16 (official 0.16, workshop 0.11). The
highest ground stands at 16 on the median map (14 at p10); none goes above 16 at the default.

**Verticality** (`vt`, 0–100, beside Variety, share-link key `vt`; D132, D145):

| Value | What it does |
|---|---|
| The default | The theme's: River Valley 20, Canyon 40, Highlands 45, Lake Basin 10, Delta 10, Islands 20 (the terrain design's). Ordinary maps at the relief above, within 16 |
| Rising | taller parts (up to 1.6 times), more caprock in smaller patches (stacks at high values), stronger weathering, deeper incision, knickpoints on more rivers with longer reaches, taller benches (one level more from 35–55, 2–4 levels from 70, 3–5 from 85), fewer natural ramps (more stairs-only rewards) |
| 70 and above (high) | all of the above at full strength; heights above 16 (the top rises from 16 at 70 to 22 at 100, layer 22 kept empty). The tall-maps probe batch confirmed that such maps load and keep their terrain, water and objects (23 checks passed, D172), and both validators' `terrain.max_height` rises to 22 with the start and edge rules (D172 (1)). What M9a still changes, for Verticality 70+ only: the build's terrain cap (`MAX_TERRAIN` and `integrityAt` in `features/raster/terrain.ts`, which clip at 16 today). A tall map's description says the in-game map editor only edits up to level 16 (D172 (4)) |

**The vertical parts** (D132 (3)) and the processes that make each:

| Part | Process |
|---|---|
| Spires and hoodoo stacks | caprock in small patches, then weathering |
| Sheer escarpments with hanging valleys | tapered scarps, and the main river's extra cut |
| Stepped canyons and deep gorges | benches, incision and knickpoints |
| Towering mesas with summit lakes | tall mesa parts, soft middles weathered into hollows, springs on high ground and spring lakes |
| Cascades of falls with plunge pools | knickpoints, benches and version 1's pools |
| Cliff-bench terraces | benches with a drawn phase |

None is placed: each appears where its process finds the land for it.

**Vertical but traversable**: the settler takes only ground joined by one-level steps to 12% of the
map or more (1,966 tiles at 128²), with 160 tiles of moist land within 20 tiles' walk over the
slopes the build would derive (food and wood grow there); natural ramps join cut-off uplands;
stairs-only uplands are rewards (the hidden-valley intention checks one).

**At the default and at high Verticality** (REPORT-v2 §3.5, beside the official and workshop maps):
relief range, levels used, land above 16, tallest fall, flat and cliff shares, and vertical reach
(dry land reached on foot from the start with the map's slopes, against land reached only with
stairs). At the default, 15% of the dry land is reached on foot (official 9%, workshop 7%): in
every Timberborn map most land waits for stairs. At Verticality 85 with heights kept within
16: relief 13 (11–15), cliffs 22% of the land, tallest fall 6.2 levels, 15% of the dry land on
foot, first attempts 44–60% by theme, and 98–100% final (one seed of 50 missed in Canyon and in
Lake Basin). Tall
(heights to 22; the land before the build, since the product's build still clips at 16): relief 16 (13–18), the highest ground 19
(18–20), 8.2% of the land above 16 (2.8–15.5%), on every map, and cliffs 26% of the land.

**Heights above 16 in the game**: the tall-maps probe batch (D172) confirmed maps up to 22 load and keep
their terrain, water and objects. M9a lifts the build's cap for Verticality 70+ and measures the
built maps again; its own probe batch (D116) plays them.

## 6. Intentions: maps that feel authored

Each map draws zero (25% of maps), one (50%) or two (25%) intentions (D138) from the set below,
weighted by theme and, for the vertical ones, by Verticality. Pairs that pull the start two ways are
never drawn together (`v2/intentions.ts`). Four are Kyler's own, in his words:
- "I love when the start sits under a cliff with water below."
- "I want a snaking river going down a hill."
- "I want a large crater where multiple rivers converge."
- "I want a cliffside with a waterfall that goes into a large circular lake."

| Intention: what a player finds | Steering: a nudge, never a build | The check on the finished map | Emerged (v2-128) |
|---|---|---|---|
| **The start sits under a cliff, with water below** (Kyler's own) | benches and escarpments more likely; the settler prefers places under a cliff | a cliff (a step of 2+ levels) rising from the start's ground within 7 tiles; 8+ tiles standing 2+ levels above the start; the start's pumpable water within 12 tiles' walk, below it | 58% |
| **A snaking river winds down a hill** (Kyler's own) | the water's way wanders more from the steepest line (noise in the routing field, not in the land); drops stay spread along the course | a river whose course turns 3+ times, back and forth (bends of 30°+ on a course simplified to 1.5 tiles), while its bed descends 3+ levels, with a level dropped at 2+ bends; the stretch holds water | 68% |
| **A large crater gathers rivers into its lake** (Kyler's own) | a large caldera (an uneven rim round a hollow 30–50 tiles across at 128²), more heads upstream, room for its lake | a lake of 250+ tiles in a closed rim (2+ levels over the lake on 12 of 16 rays, falling again outside the crest on 8); 2+ rivers flowing in; one way out through the rim | 26% |
| **A waterfall plunges off a cliff into a large, round lake** (Kyler's own) | knickpoints, caprock and hanging valleys stronger; a scarp and a hollow (often near the scarp's foot); room for lakes | a fall of 3+ levels into a lake whose open water (without its thin arms) is 200+ tiles and broadly round (its axes within 0.55 of each other, filling 40% of its widest circle) | 16% |
| A signature landmark stands out | a cone, mesa, caldera or scarp more likely; more caprock | a form of 300 tiles or fewer standing 8+ levels over the ground round it, or a fall of 6+ levels | 95% |
| A lake high on the heights spills over a fall | a tall mesa and a spring more likely; more weathering | a lake of 60+ tiles, 5+ levels over the map's middle, with a fall at its edge | 53% |
| A hidden valley up the cliffs holds riches | fewer ramps; a plateau more likely; more ruins | an upland 2+ levels above the start, cut off by cliffs, reached only by stairs, 400+ tiles with 10+ ruins, relics or trees, within 60 tiles | 47% |
| A waterfall shields the start | deeper incision, more benches, a badwater hollow; the settler prefers places near falls | a fall of 1.5+ levels within 20 tiles; the nearest threat twice as far on foot as in a straight line | 30% |
| The start looks out from high ground | a plateau or scarp more likely; the settler prefers high ground | the start in the top quarter of the map's heights, 4+ levels over the lowest ground within 15 tiles | 32% |
| Two rivers meet by the start | more springs and inflows; the settler prefers confluences | a confluence within 18 tiles of the start | 23% |
| The best farmland lies past the gorge | deeper incision, wider floors; the settler prefers a start with bigger farmland across a gorge | a farmland patch of 400+ tiles, 1.5 times the start's own, across water whose banks stand 2+ levels over it | 35% |
| ~~The only safe water is uphill~~ | – | an uphill lake keeping half its water through a 9-day drought while the start's keeps under 35% | left the set |

**Kyler's three principles**:
1. **Outcomes, never recipes.** Each row says what a player finds. Steering only moves the prior
   and the settler's preference; the processes decide. The crater is a caldera part like any other:
   where the rivers go, whether a lake forms and where it spills are the hydrology's.
2. **Failure is allowed.** An intention absent from the finished map is dropped, never forced. A
   start intention is re-steered once: the settler again on the finished land and water, the
   intention weighted up, the settle reused. Drop rates are recorded (REPORT-v2 §4). "The only safe
   water is uphill" emerged on 4 of 86 draws in version 2's first run, so it left the set: uphill
   lakes that keep their water are too rare in the land these processes make.
3. **Many structural realizations.** No-clone and no-archetype run within each intention, over the
   maps where it emerged, all themes together (REPORT-v2 §4). No two such maps are clones (the
   nearest pair 0.37 or more apart). The largest cluster holds 7–14% for most intentions. It holds
   18–20% for meeting waters, the crater and the round lake, but on only 17–28 maps.

**Kyler's three new intentions, drawn on every map** (seeds 1–30 of every theme, 180 maps each; a
steering test, REPORT-v2 §4): the snaking river emerges on 69%, the crater on 20% and the
waterfall into a round lake on 13%. None has clones (nearest pairs 0.39, 0.46 and 0.43 apart). The
largest cluster holds 8.1% of the snaking rivers and 11% of the craters, but 21% (5 of 24) of the
waterfalls, where the nudge's tall scarp makes one big step. A shorter, tapered scarp is M9b's fix.

The mix varies by map: of 1,198 maps, 274 have none, 623 one and 301 two. Each brief names its
map's intentions. Kyler's four appear in briefs 1 (under a cliff), 2 (the snaking river), 3 (the
crater) and 4 (the waterfall into a round lake). Player and Claude controls wait until the set proves
itself (D138); Kyler's further one-sentence intentions join the same way.

### Candidate intentions (for Kyler to pick)

Fourteen drafts in the same form as Kyler's four: a plain sentence, the outcome, and a simple check.
They are not in the set and not prototyped. Only the ones Kyler picks join it, under the same three
principles (decisions-pending #66). Sources: the workshop catalogue (`investigation/WORKSHOP.md`), the landscape families
(`investigation/landscapes/FAMILIES.md`) and the mechanics study (`investigation/mechanics/`:
`CATALOGUE.md`, `AXES.md`).

**Water systems**
1. **"The river loops back on itself and leaves an oxbow lake."** Outcome: a crescent lake cut off
   beside the river that keeps its water when the river runs low. Check: a curved lake of 60+ tiles
   within 6 tiles of the river but off its course, keeping half its water through a 9-day drought.
   *Source: workshop, big meanders and oxbows; landscapes, meander.*
2. **"Lakes step down the valley, each spilling into the next."** Outcome: three or more lakes on
   one river, each lower than the last, joined by short falls. Check: 3+ lakes of 60+ tiles on one
   course, falling 1+ level from each to the next. *Source: workshop, chain of lakes; landscapes,
   lakes.*
3. **"The river splits around a big island and joins again below it."** Outcome: two arms carrying
   water round an island big enough to settle. Check: a dry region of 150+ tiles ringed by one
   river's water, both arms flowing. *Source: workshop, river that splits round an island;
   landscapes, braided.*
4. **"Round bowls cluster together, some wet and some dry."** Outcome: several closed basins close
   together, some holding lakes, joined by low saddles. Check: 4+ hollows of 100+ tiles within 50
   tiles of each other, at least 2 wet and 1 dry. *Source: workshop, cluster of basins (five official
   maps); landscapes, karst.*

**Landmarks**
5. **"Two waterfalls pour side by side over the same cliff."** Outcome: a pair of tall falls seen
   together. Check: two falls of 3+ levels on different courses, 4–15 tiles apart. *Source:
   workshop, landmark falls; landscapes, falls.*
6. **"A long cliff splits the map into an upper and a lower world."** Outcome: a scarp across much of
   the map with only one or two natural ways up. Check: a line of steps of 3+ levels spanning half
   the map's width, the two sides joined by one-level steps in at most two places. *Source:
   workshop, great scarp or wall; landscapes, escarpment.*

**Verticality**
7. **"Side valleys hang above a wide valley floor, their streams falling in."** Outcome: a broad
   main valley with tributaries dropping into it over falls. Check: 2+ tributaries meeting the main
   river over falls of 2+ levels, the main valley floor 20+ tiles wide. *Source: landscapes, glacial
   (hanging tributaries).*
8. **"The hillside is stepped like rice terraces, with a stream running down beside them."**
   Outcome: a slope of many level benches following the contours. Check: 4+ benches in a row, each
   3+ tiles deep, with a stream within 10 tiles stepping down the same levels. *Source: workshop,
   contour terraces; mechanics 21, vertical construction.*

**Relations between places**
9. **"Two ways to grow: open farmland one way, wood and ruins up the cliffs the other."** Outcome:
   two frontiers reached by different routes, each richer in something different. Check: two
   frontier regions, one with twice the other's fertile land, the other with twice its logs or
   scrap. *Source: workshop, choose your side; mechanics axes, expansion choice.*
10. **"The strongest current runs far from home."** Outcome: the start's water is slow, and good
    water-wheel sites lie a trek away. Check: no reach of 0.5 m³/s beside dry land within 64 tiles'
    walk of the start, and one of 1 m³/s or more beyond it. *Source: mechanics 02 and axes, power
    location.*
11. **"A broad dry plateau stands over deep water."** Outcome: wide dry land a few levels above
    clean deep water, where a deep pump reaches what a basic one cannot. Check: 10+ shore tiles
    within 40 tiles' walk that only a 6-level pump reaches. *Source: mechanics axes, faction
    opportunity; mechanics 06.*

**Hazards and risk-reward**
12. **"Badwater spills through the richest land: tame it and the land is yours."** Outcome: the best
    fertile land lies beside a badwater stream, away from the start's clean water. Check: 400+
    fertile tiles within 60 tiles of the start with contaminated water flowing through or beside
    them; the start's own water clean. *Source: mechanics 10 and axes, threat exposure; workshop,
    hazard play.*
13. **"A relic waits on a pinnacle, reached only by building up to it."** Outcome: a big science
    reward on high ground no one can walk to. Check: a medium or large relic within 60 tiles on dry
    land not reached on foot from the start. *Source: mechanics 20, relics; workshop, tower or sky
    island.*
14. **"A plug holds back a lake: open it when you are ready."** Outcome: a blocked spillway above
    the valley, with stored water to release later. Check: a blockage whose removal lets 500+ tiles'
    worth of water flow downhill, not onto the start. *Source: mechanics 12, blockages and release
    events; workshop, buried water.*

## 7. The start and the guards

**Kyler's start rules** (2026-09-25, amending D85). The core rules reached dev with #44 after the
prototype's batches ran; the prototype applies its own versions (`v2/rules.ts`), in place of the
validators' `start.water` and `start.wood`:
- **Water**: clean water counts when a walk from the start over the map's own terrain and its own
  slopes (never player-built stairs) reaches a shore tile within 12 / 20 / 28 tiles by difficulty,
  and a pump on that shore reaches the water (0.3+ deep, its surface 0–2 levels below the shore).
  The water no longer has to be on the start's own level.
- **Starting wood** (D164): logs, not trees. Every Pine, Birch and Oak within 20 tiles' walk,
  living or dead, counts at its species' yield (Oak 8, Pine 2 plus resin, Birch 1). The prototype
  converts 60 / 40 / 20 trees to 170 / 110 / 55 logs at the default species mix's 2.8 logs a tree;
  the core rule on dev (#44) asks for 120 / 80 / 40 logs, which M9a takes (decisions-pending #68).
- The berry bushes rule and D85's other requirements stay.

**The settler** (`v2/start.ts`) reads the land with its water, as a player would:
- hard limits, never traded: a pump shore within the water rule's walk (on the start's own level
  with 5 tiles to spare; on another level, a walk over the slopes the build would derive with 2
  tiles to spare), the 3×3 and its ring dry, the door onto level ground facing the water;
- among the places that qualify, the genome's preferences (a lake shore, a river bank, a
  confluence, below a fall, a high bench, a spring's stream), the intentions' preferences and the
  seed choose among the best few, kept 20 tiles apart;
- if no place qualifies, a 5×5 within a level is levelled, or as a last resort a pad and a path to
  the water (D97).

**New in version 2:**
- **It reads the settled water.** The badwater hollow is planned first, away from where the start
  will likely be (the settler run on the water the hydrology planned); the water settles once; the
  start is then chosen on the real water.
- **Reach**: the start's ground must join 12% of the map by one-level steps, and moist land within
  20 tiles' walk over the slopes the build would derive must reach 160 tiles. This fixed most of
  version 1's "too little wood" failures.
- **The new rules' effect** (REPORT-v2 §2.1). On v2-128:
  - 27% of starts drink from a shore on another level, and 23.5% of the maps would fail D85's
    water rule;
  - 5.6% would fail the old tree count;
  - the starting wood is 259 logs at the median (139–521), plus about 110 logs growing;
  - first attempts are 63% under all of Kyler's new rules, against 68.5% before them. Starting
    wood turns down more attempts than the tree count did (310 on v2-128); finals stay at or above
    98% everywhere (Canyon 99% at 128²).
- **Drought-aware start water** (task e), re-checked under the new rule: among places that pass,
  the settler weights up (×1.25) places whose clean water within the rule's walk stays pumpable
  through the first Normal drought (the analytic drought over 3 days: 2 in the game's schedule,
  after a day of ramp-down), and down (×0.8) the rest. A shore on another level now counts too.
  Measured (REPORT-v2 §5): the start keeps its water through the first Normal drought on 53% of
  maps (52% with the preference off; 42% before Kyler's start water rule, which lets lakes on other
  levels count; version 1 29%). Requiring it gets 100%, but first attempts fall from 63% to 40% and
  finals to 99% (Islands 96%, Canyon 98%). Requiring it is decisions-pending #59.

**Every guard stays**, as Kyler amended them:
- both validators in the `generate` profile, but for `start.water` and `start.wood`, which his
  rules replace;
- D85's other start requirements;
- `water.storage_possible` in place of `water.reservoir` (the workshop study's rule: running clean
  water at the start's pump shore, and storage possible within 40 tiles by a dam, natural pools or
  levees). It asks only that the land lets the player store a drought's water; whether it stays a
  guard now that nothing else about water is guaranteed is decisions-pending #67;
- the dam-wall and edge-wall checks in the loop (§8);
- determinism (exact arithmetic, D15; iteration in index order; heaps that break ties by index);
- batches ≥ 98% final.

**Kyler's resource rules** (for every map; a shared baseline is being built on `feature/resources`):
- **Mine sites**: at least one on every map; the Mine sites setting becomes 1–4. The prototype
  checks it in the loop: no finished map lacks one (one attempt of 1,200 maps was planned again).
- **Trees, clusters and ruins**: M9a takes them from the shared baseline. Tree counts scale with
  map size within the official maps' 25th–75th percentiles, about two-thirds dead, living trees on
  moist ground and dead ones on dry. Trees stand in groves with clearings, and bushes grow in
  patches. Ruins lie in irregular fields with a spread of heights and a few tall towers, and their
  scrap stays within the official range for the map's size. The prototype still uses today's
  resources planner. The woods (D164) then choose each map's species within the spread of mixes
  the official maps show; M9a checks that oak-rich and birch-rich woods stay inside it.

**Maps need not hold their water** (Kyler): rivers leave and lakes may drain; draining is the
player's challenge. No prototype check or measure requires water to stay on the map:
- lakes fill hollows and spill at their sills;
- nothing raises the edges (§8);
- the drought-aware start is a preference;
- the cycle measures describe how long water lasts, and never require it.

The validators' own water checks (`water.settles`, `water.clean_exists`, `water.clean_reach`,
`water.outflow`, `water.no_flood`) are unchanged here, since there is no `src/` change; the core
rules decide them.

## 8. No dam walls, and the natural narrows

Kyler's decision (D111): "The dam-site ridge goes away completely." The generator never builds a
dam-site ridge, in any theme, difficulty or setting, and never adds terrain to make a dam site. Dam
opportunities exist only where the land makes them (a valley narrowing between spurs, a gorge, a
lake's outlet), and the validators' dam sampling finds them. The dam-wall check (`lib/ridge.ts`:
a straight band 2–6 levels high across a valley, with vertical faces, a flat crest, even thickness
and dry floor on both sides, and a gap for the river) runs in the generate loop and on every batch
map. **Version 2's final batches: 0 flagged maps of 3,353**, across every set, size and
Verticality (the maps with files also rechecked from them). In the loop the check turned down 6
attempts on v2-128 whose land made a wall-like band; each was planned again.

**No edge walls** (Kyler, 2026-09-25; extends D111). No map raises a wall along its edges to hold
water; rivers enter and leave naturally. Version 1 and version 2's earlier runs left some. Erosion
never lowers the border tiles, which are outlets with nowhere to drain, and a channel's floor could
stop a tile short of the edge. So a thin band stood along the edge with water behind it:
- on 9.4% of version 2's earlier maps;
- on 4.3% of version 1's;
- on 2% of the current generator's, where Islands' and Lake Basin's rings reach past the map.

Now the land runs on past the edge. The two outer rows follow the land just inside (the next tile
in, plus its rise toward the edge, never a fall), before the water is planned and again after the
channels are cut. The edge-wall check (`v2/rules.ts`) looks for 6+ tiles along an edge where the
outer two rows stand 2+ levels over everything 2–5 tiles in, with water lying behind below the
band's top. It runs in the loop and blocks: **0 maps of 3,353** flag it (2 attempts on v2-128
turned down).

**What replaces the ridge-based rules** (version 1, unchanged): natural dam sites and
`water.storage_possible` replace D25, D30 and D49's dam site; Hard's 3-deep rule moves into
`water.storage_possible` (on Hard, storage at a mean depth of 3 or more); the ridge-based premises
are gone, and names say so when the processes make a gorge, a narrows or a lake outlet.

**Reservoir help**: no setting; Easy prefers a natural narrows near the start among its candidates;
Normal and Hard don't steer (version 1's recommendation).

**The natural-narrows builder** (`v2/narrows.ts`; task g): the editor's Dam site tool, and a place
M12's Claude can steer to, rebuilt as land. Two hillside spurs close in on a river from its two
banks, each a tongue of uneven thickness that falls 1–2 levels from its root on the valley side to
a tip still 1–2 levels over the banks. The two are drawn apart (length, bend, height, thickness, an
offset along the river), so together they never read as one band. The channel keeps its gap; the
dam is the player's to build. It refuses with a reason ("the valley here is too narrow or too open
for spurs on both banks"; "the spurs would read as a wall") and draws once more before it gives up.
The generator never calls it.

Tried at 96 places on the batch's maps (REPORT-v2 §8): it fits at 64; the dam-wall check flags
none; the spurs vary in level (standard deviation 0.65) and in thickness (coefficient of variation
0.44). A dam holding a Normal drought's water gets shorter at 8 of the 57 places where the ground
was raised: at most places the valley upstream holds too little for any short dam, before or after.

## 9. What M9 keeps

- **8 flow directions**: every genome draws one; the rivers find their own path (REPORT-v2 §3.7).
- **Variety and Surprise me** (§3).
- **No clones**: K candidates; the one farthest from the theme's reference signatures wins
  (decisions-pending #53's default).
- **The score**: default weights, a mild tiebreaker only, never a gate (D137, D145).
- **Names** from the land (§15).
- **Variations of this map** (D143; M9c): a sibling draws its genome from the same stream with each
  continuous value nudged by up to 12% of its range, keeps the theme, settings and intentions, and
  grows its land from noise of its own. Tried on 30 families of five maps (REPORT-v2 §8): no pair of
  300 is a clone (the closest 0.27 apart, the median 0.57), and every sibling keeps the map's
  intentions. Siblings sit as far apart as the theme's maps do (nearest-seed medians 0.48–0.52): a
  variation is a new map with the same settings and intentions, not a near copy. How close a
  sibling should stay is for M9c to tune (smaller nudges, or sharing the regional field's noise).
- **D85's start requirements** as hard checks; **`water.storage_possible`**; **exact arithmetic**:
  the source audit finds nothing but + − × ÷, square root, floor, round, abs, min and max on the
  output paths of `v2/`.

## 10. Measures

Version 1's measures run unchanged on version 2: M1 no clones, M2 no archetypes (whole maps, river
networks, relief), M3 openings, M4 no approximation, M5 a good natural dam site near the start, M6
no built dam walls, M7 storage possible, M8 batch pass rates. Distances are on scales read from the
130 workshop maps; clusters are average-linkage (UPGMA), cut at the workshop's own p10 nearest-peer
distance. They run on 200 seeds per theme at 128², beside version 1 and the current generator,
measured by the same batch code (REPORT-v2 §3). New in version 2:

| Measure | What it adds |
|---|---|
| M2a drivers | for the largest cluster: the layout half against the feature half of the distance, the layout's planarity, and how much more its maps agree on each feature than a workshop pair does (`v2/archetypes.ts`) |
| M2 within intentions | M1 and M2a among the maps where each intention emerged (D138) |
| M3c, the cycle | the cheap cycle signature on every map (§11), the exact model on seeds 1–30 |
| M3d, the axes | the verified strategy axes (version 3) on every map |
| M4, corrected | the share of a theme's maps closer to their nearest workshop map than the workshop's p10 (D128), and which features make the close pairs close |
| Relief and Verticality | §5, against the official and workshop maps |
| The landscape bench | river networks, relief and water features against real terrain (§15) |
| Intentions | drawn, emerged, re-steered, dropped |
| Lake shapes | roundness, fill, elongation and branching of every lake of 150+ tiles, against the survey's real lakes and the official and workshop maps (REPORT-v2 §3.9) |
| Island seas | on Islands maps: the water share, the largest body, land in islands, the islands' count and size, and whether the map reads as islands in a sea |
| Speed | first look, first settled water, finished map; settles per map |

**Headline results** (v2-128: 200 seeds per theme, Variety 70, the themes' default Verticality):
- no dam walls or edge walls on any map; batches 100% final but Canyon (99%), 63% on the first
  attempt;
- M2a whole maps: the largest cluster holds 10–12.6% of a theme in four themes (version 1: 11.5–68%).
  Delta holds 18%, and Islands 33.5%: every Islands map now has its sea in the middle, and the
  distance's rotations and mirrors make those layouts alike. M9b varies the sea (§17);
- M1 no clones: every map's nearest other seed is 0.35–0.42 away at least and 0.44–0.50 at the
  median by theme (version 1: 0.33–0.38 and 0.42–0.48; targets 0.25 and 0.40);
- M3 openings: the largest cluster holds 1.5–4.5% of a theme and the spread is 0.85–0.98 (a
  workshop pair is 1; version 1 0.68–0.84); M3d strategy axes (nine with the woods): 189–199 joint
  signatures in 200 maps per theme, the largest shared by 1–1.5%;
- M4 no approximation: River Valley 9.5%, Canyon 0.5%, Highlands 6%, Islands 3.5%, Lake Basin 12%,
  Delta 14% of maps below the floor (a target of 10% at most; information, D128). The close pairs
  are close on islands (none), one-level steps, cliffs, scrap and trees in River Valley and Lake
  Basin. In Delta no single feature stands out: scrap, trees, bushes, one-level steps and lakes all
  agree a little (REPORT-v2 §3.4);
- M5 a good natural dam site within 40 tiles of the start: 43.4–81.5% by theme, 60% over all six
  (official 36%, workshop 46%; the band "comparable to the official maps" is 26–56%): the lakes'
  outlets make short dams, so three themes sit above the band;
- lake shapes and island seas: §4 and REPORT-v2 §3.9;
- M7 `water.storage_possible` holds on every map (a guard).

## 11. Play: the cycle signature, the strategy axes and difficulty

**The cheap cycle signature in the generator** (`v2/cycle.ts`; task d). The exact cycle model
(`investigation/cycles`, PR #15) takes 12–20 s a map at 128²: too slow for every candidate. The
signature is estimated in milliseconds from the settled water with the analytic drought (D101):
the water kept after the first Normal drought (3 days) and a later Hard one (26 days); how many
days of a drought the start keeps pumpable water; the wet tiles a long drought dries; and the share
of the water that runs (a badtide turns every source bad, VERIFIED.md, so running water is where
badwater goes first). Its group uses the exact signature's bins. **Checked against the exact model**
on 90 maps (seeds 1–15 of every theme; REPORT-v2 §6): it matches the water kept through the first
Normal drought and the later Hard one (r = 0.999 for both; the retention bin agrees on 98% of maps),
how long the start keeps water (r = 0.98; the bin agrees on 69%, days near a bin's edge falling
either side), and whether the start keeps water through the first Normal drought (every map). Its
badwater proxy tracks the exact exposure only moderately (r = 0.68): where badwater reaches needs the model's mixing,
so exposure stays the exact model's. The exact model stays the check: on a sample in every
milestone's full check, and on every brief map (the worst of three weather seeds).

**The Weather view** (D133; its own step after the 3D stages). This design proposes:
1. the instant estimate is this cheap signature, shown with the map at once;
2. the full timeline is the exact model in a cancellable worker, streaming the key days (the first
   hazard's day 1 and end, the badtide's day 1, the recovery), as the cycles study proposes;
3. the map card's first-drought line comes from the estimate, then from the exact timeline when it
   arrives; they agreed on all 90 maps checked;
4. the signature feeds M3c (play variety) and the drought-aware start (§7).

**The strategy axes** (`investigation/mechanics`; measurement version 3,
the power axis by the game's wheel rule). The eight axes and their fixed bins run on every batch map
and every brief. A ninth, the woods (D164), joins them: oak's share of the starting wood's logs,
below 0.35 pine and birch (quick to regrow), 0.75 and above oak (plenty of wood, slow to regrow),
mixed between. The brief's card says it in words ("mostly oak: plenty of wood, slow to regrow").
Play variety on them: REPORT-v2 §3.3 and §6.

**Difficulty as positions on the axes** (a proposal; decisions-pending #65). Difficulty today is
D85's start rules and the drought need. The axes let the generator prefer, among a seed's
candidates, the one whose position suits the difficulty best (the most conditions met; a
preference, never a rejection):

| Axis | Easy | Normal | Hard |
|---|---|---|---|
| Storage work (`storageRatio`, × a Normal drought's need kept within 40 tiles) | ≥ 0.5 | ≥ 0.1 | < 1: storage is the player's work |
| Threat exposure (`badwaterDistance`, tiles) | ≥ 30, or none | ≥ 15, or none | < 60: a threat within reach |
| Resource timing (`logs20`, logs within 20 tiles' walk; starting wood asks for 170 / 110 / 55) | ≥ 250 | ≥ 150 | ≥ 55 |
| Land and height (`flatDry40`, flat dry tiles within 40 tiles' walk) | ≥ 250 | ≥ 150 | any |
| Power, fertile land, expansion and faction | variety axes, not difficulty | | |

On v2-128, 9.7% of maps meet all of Easy's positions, 38.5% Normal's and 35.2% Hard's (version 1:
7.3%, 39.3%, 50.6%; the current generator 0%, 26.1%, 62.8%). With three candidates, Easy finds a
suited one about a quarter of the time, so M9b would also steer Easy's prior (more lakes and storage
near the start). Each brief says which positions its map suits.

## 12. The document model: cave-ready terrain

The generator and the editor are one app (PLAN §19). The design keeps version 1's model, **a stored
field plus features read back out of it**, and changes how terrain is held (task h; D118, D119,
I-1).

**The field and the features read back.** The processes produce the field; the document stores it,
as it stores an imported map's base today, so rebuilds never rerun the processes. Everything the
player grabs stays a feature, found in the field: rivers (paths in flow order, with `pools`,
`floor` and `incise`), natural lakes (an area of tiles with its outlet sill), badwater basins (with
the pit's outline), the start, forests, berry patches, ruin fields and map objects. Landmarks
(stacks, calderas, scarps) are named in `derived` (PLAN §7.10).

**Every editor capability keeps working** (version 1 §12): handles and inspectors; incremental
rebuilds equal to full ones (the field is constant input to build step 1); orphans; undo and redo
over the log; autosave; import (a base and no field); export; "generate, keeping my edits" (the
processes rerun with the player's features, locks and keep-out regions as constraints); M11's locks,
regenerate area and stamps; M12's planners; both validators.

**In memory: runs per column** (`v2/terrain.ts`, the prototype of `core/terrain/runs.ts`). The
terrain is one 23-bit mask per tile (bit z set: voxel z is solid), 256 KB at 256². Everything else
derives from it: the surface (`heights`: the highest solid voxel + 1), a tile's runs (its solid
intervals, bottom to top, as [floor, ceiling) pairs), whether it is plain (one run from z = 0), and
the writer's voxels. The prototype keeps its field and its built base this way; M9's processes make
only plain tiles.

**In the document: format 3's `TerrainData`** (terrain3d DESIGN §2.2), for both `field` (what the
processes made) and `base` (the built map):

```ts
interface TerrainData {
  heights: string;                        // base64, one byte per tile: the surface
  runs: [tile: number, runs: number[]][]; // tiles that are not one plain run from z = 0,
                                          // [floor0, ceil0, floor1, ceil1, …], bottom to top
}
```

A generated M9 map stores an empty `runs` list. **Checked** (`v2/check.ts`, on 40 maps: seeds 1–3 of every theme at 128², the ten brief maps, and
seed 1 of every theme at 96² and 256²): the
voxels from runs are byte for byte `voxelsFromHeights`'s, and field and base round-trip exactly.
Format 3's terrain (field and base, heights as base64 as DESIGN §2.2 has it) takes 6.3 KB gzipped
at 128² and 18.2 KB at 256²: more than version 1's run-length field alone (2.3 and 6.5 KB), beside
project files of about 180 KB and 370 KB.

**Other format changes** (version 1's): `MapSpec` gains `variety`, `verticality` and, optionally,
`recipe`; the genome is not stored (it is a pure function of seed, theme, size, settings and the
generator version); the feature schema gains the river's `pools`, `floor` and `incise`, the lake's
`area` and `natural`, the badwater basin's `pit`, and the intentions a map was steered toward.
Formats 1 and 2 open as today. `.timber` files do not change format.

**How caves, overhangs and tunnels slot in later, with no format change:**
1. **The field and the base already hold runs.** A carved tile is a tile with two or more runs: a
   cave is a gap between runs; an overhang is a run over air; an arch's span is a run whose floor
   stands above the ground. `heights` stays the surface, so every reader of today's format still
   reads the top.
2. **Features**: format 3 reserves the `carve` feature kind (a tile set or a path with a
   cross-section, and a z range) and the `floor` a placement stands on (a run top; the surface when
   absent). M9 writes neither; 3D-b's processes write them.
3. **The build**: step 4b (carve) acts on the masks; step 7 adds the support rule pass (D121); every
   placement takes a floor. In M9 these steps exist with nothing to do.
4. **The writer** writes the masks' voxels (the checked identity above), and the water singletons'
   `Levels` from the largest number of runs (1 in M9).
5. **Kept content and locks**: `KeptContent` keeps `TerrainData`, so a lock keeps a cave.
6. **The analysis interfaces** take the terrain object, not a heights array: `surface(i)`,
   `runs(i)`, `floors(i)`. M9's analysis reads `surface` only; 3D-a swaps the walks to the floor
   graph (D122) and the water to stacked columns (D120) behind the same signatures.
7. **Formats 1 and 2** convert on read: their `columns` become `runs` (the same voxels).

The places in `src/` that assume one height per column, which M9a and 3D-a change, are listed in
§20.

## 13. Speed: what a player feels

What blocks is what a player feels: the page never stalls, and a first result appears quickly
while the rest streams in (D115). Timings are information. The planned savings are built into the
prototype and measured (task f; REPORT-v2 §7):

1. **The field once**: a failed attempt whose land was fine (no start, no storage, too little
   wood, no clean water) is planned again on the same field before a new genome is drawn. 82% of
   maps pass on their first genome.
2. **One settle**: the hollow is planned before the settle from where the start will likely be,
   and the start is then chosen on the settled water; a start on level ground reuses the settle.
   One settle for 88% of maps, two for 11%, three for 0.3% (version 1: two to four an attempt).
3. **First-attempt fixes**: the settler's reach and moist-walk checks, and planning again on the
   same field.
4. **Progressive preview**: the land and its planned water come first (the first look), then the
   settled water, then the checked map. One map at a time (the bench): 1.3 s at 128² and 5.7 s
   at 256² in Node (1.2 s and 7.1 s in Chrome), with the first look at 0.15 s and 0.6 s (version
   1: 1.0 s and 5.7 s; the current generator: 0.7 s and 2.7 s). The batches ran on a machine other
   agents' jobs loaded fully, so their times stretched (at 128² a median of 5.8 s, the first look
   1.0 s).
5. **A time budget** (new, for M9a): maps that need several attempts form a slow tail. In the
   bench the worst took 3.2 s at 128² and 41 s at 256² (Islands seed 2, 5 attempts); under the
   batches' full load, 29% of maps at 128² took over 10 s. After about 3 s the generator should
   draw a new genome rather than plan again, and run candidates in parallel workers.
6. **The simulation speedups** (D130; `investigation/simspeed`): proposals for M9a, bit for bit
   identical, 1.19 times faster on the canonical settle; not used by the prototype.

The page shows the first look at once, the water when it settles, and the map card when the checks
finish; a later candidate replaces the preview with a short notice (PLAN §2.2).

## 14. Batch pass rates

200 seeds per theme at 128², 30 at 96², 20 at 192² and 256², and 50 at Verticality 85 and at
Variety 100, all Normal (REPORT-v2 §2). Final: 100% in every theme and size but Canyon at 128²
(99%: seeds 42 and 143 missed after 12 attempts); at Verticality 85, 98% for Canyon and Lake Basin
(one seed of 50 each) and 100% for the rest; at Variety 100, 100%. Every theme and size meets the
98% rule. First attempt: 63% at 128² over all six (Canyon lowest, 49.5%). Most failed attempts had
no storage near the start, no place for a start, or too little wood within reach; each is planned
again on the same field first. Requiring the drought-aware start (#59, an experiment, not the
default) drops Islands to 96% (seeds 4 and 18) and Canyon to 98%.

## 15. The investigations folded in

- **Cycles** (#15): §11: the cheap signature in the generator, the exact model as its check and in
  the briefs, and the Weather view's instant estimate.
- **Verified mechanics** (`investigation/mechanics`): the axes in the
  measures and briefs, difficulty as positions (§11), and the facts the design leans on (a
  Folktails pump reaches 2 levels down, the Iron Teeth deep pump 6; wheels by the axial-flow rule;
  every source off in a drought; a badtide turns every source bad).
- **Landscapes** (#16): the bench runs on seeds 1–30 per theme of version 2, version 1 and the
  current generator (REPORT-v2 §9). Version 2 is the closest of the three to real terrain on relief
  (group distance 0.52; version 1 0.60, the current generator 0.66) and on the height and slope
  histograms (total variation 0.27 and 0.07; version 1 0.42 and 0.09; current 0.54 and 0.14), and
  stays near version 1's naturalness (0.95 against 0.82; current 2.98). It is further on water (1.67;
  version 1 1.14):
  more falls (7 a map against the real 1), taller (2.0 levels at the median against 1.0), and more
  and more efficient dam sites, which is what Timberborn maps and Kyler ask for. The bench stays
  descriptive: real terrain at 60 m a tile is gentler (steps of 2+ levels on 1.2% of edges).
- **Names** (`investigation/names`): each brief is named by its rules. The
  prototype emits read-back landforms and premise roles only where the built map passes a shape
  check (a great scarp: an escarpment crossed by a fall of 4+ levels; a mesa field: 4+ standing
  forms; a hanging lake: the high-lake intention; twin falls; a moat island; many mouths; a crater
  lake; a staircase). **Adoption in M9c**: the lexicon, patterns and forbidden list move into
  `score/naming.ts`; the read-back roles become the analysis's landmarks (`derived`); the forbidden
  list grows from the whole workshop catalogue; the 30 hand-checked maps of M9's acceptance (10 at
  Variety 100) confirm that names match the land.
- **Techniques playbook** (#19), as proposals: #1 independent spatial controls became the regional
  field; #3 starts by guarantees, then opportunities, is the settler's order; #6 connect useful
  shelves and keep dramatic cliffs is the natural ramps; #7 keep catchments and spill levels is the
  hydrology; #5 rare traits fold into intentions (decisions-pending #51's default); #2 protected
  contours and #8 opening coverage stay for M9a and M9c to try; #4 caves wait for 3D-b.
- **Simspeed** (#17): §13, a proposal for M9a (D130).

## 16. Keep M12 ready

M9 adds these Claude tool entries (D134), in the shape of the groundwork's tools
(`investigation/claude/lib/tools.ts`: a name, a description and an input schema of at most 4 KB;
arguments checked in code, with an error that says what is allowed; results of at most 32 KB; a
refusal from the map returns `ok: false` with the reason and the nearest feasible alternative,
never built silently):

| Tool | Kind | Arguments and limits | Refusals: reason → alternative | Stage |
|---|---|---|---|---|
| `generate` | operation | theme; size 96–256; seed; Variety 0–100; Verticality 0–100; a flow direction (one of 8, optional); intentions (at most 2, from the set) | "heights above 16 wait for the probe batch" → the same map within 16; "these two intentions pull the start two ways" → either one | M9a (intentions from M9b) |
| `steer` | operation | intentions and setting changes, for the whole map (from M11: an area, with locks) | "regenerating part of the map waits for M11" → the whole map; an intention not in the set → the nearest one in the set | M9b |
| `landmarks` | query | a kind, optional: falls, lakes, standing forms, ramps, stairs-only uplands, rivers in flow order | – | M9a |
| `reach` | query | none: land on foot, stairs-only land, the levels reached without stairs | – | M9a |
| `place_narrows` | operation | a river and a place along it (words or 0–1); reach 0.5–1; rise 1–4 | "the valley here is too narrow or too open for spurs on both banks" → the nearest place along the river where they fit; "the spurs would read as a wall" → drawn once more, else refused | M9a |
| `check_intention` | query | an intention | an intention not in the set → the list | M9b |
| `describe_map` | query | none | – | M9c |
| `how_it_plays` | query | a difficulty, optional | – | M9c |
| `variations` | operation | a count, 1–6 | "a sibling came out a clone" → fewer siblings | M9c |

**The steering flow** (D139; D145 (7)). Requests that change the map's character ("harsher",
"more vertical", "more varied"), and requests for new landforms, water features or dam
opportunities, steer:
1. Claude turns the request into intentions (outcomes, from the set) and settings (Variety,
   Verticality, the theme's settings);
2. the generator regenerates (in M9, the whole map; from M11, the area, with locks on what the
   player keeps), several candidates when K > 1;
3. the analysis checks each intention and the settings' measured targets on the result;
4. Claude reports honestly what emerged and what did not, with the nearest alternative, and never
   builds the missing part by hand.

Precise follow-ups ("make it wider"), resources, map objects, the start and drawn rivers stay
editor operations. Suite requests for each new tool join `investigation/claude/requests.json` in
the stage that builds it; a request whose steered solution needs a capability not built yet is
marked "waiting for capability".

## 17. Cost, version and risks

**What stays** (unchanged or nearly): the build pipeline, derived slopes, the water model and the
canonical settle, moisture and contamination, both validators and the Python oracle, the writer and
pack, the resource and map-object planners, the second district, the badwater basin builder, the
analysis, the score, the editor's tools and builders.

**What goes from the generator** (the editor keeps its tools): the valley and Lake Basin planners,
the terrace bands and relief fit, riverside ponds and the badwater box, the dam-site ridge
everywhere, and the on-river waterfall set piece as a planned feature (falls emerge; the editor
keeps the tool).

**New code**: the genome and priors, the field (uplift, caprock, erosion, weathering, levels with
benches), the hydrology (drainage rivers, lakes, spring lakes, pools, splits, deltas, hanging
valleys, knickpoints), natural ramps, the settler, hazards from the land, intentions and their
checks, the cheap cycle signature, the runs model and format 3, the natural-narrows builder,
`water.storage_possible` and the dam-wall check in both validators, the read-back features, and the
measures as tools. About 2,800 lines in the prototype over the product's code; perhaps 5,000–6,000
with tests and the Python side.

**Generator version** 0.6.0 → 0.7.0 with M9a. Every map changes; old share links reproduce only
from M13's versioned deploys.

**Risks:**
- *No approximation*: Lake Basin and Delta sit at 12% and 14%. M9b can push their water and their
  one-level steps away from the workshop's middle. Information (D128).
- *Islands alike*: one sea in the middle of every Islands map made them alike (the largest
  whole-map cluster 33.5%), and only 17% read fully as islands in a sea. M9b places the sea
  off-centre, elongated or as two or three seas, with more of the land in islands.
- *Intentions that rarely emerge*: meeting waters, the waterfall shield and the long view emerge on
  23–32% of draws, and Kyler's crater and waterfall into a round lake on 26% and 16%. If M9b's
  steering cannot lift the first three, they leave the set, as "the only safe water is uphill" did.
  Kyler's own stay unless he drops them. The waterfall-into-a-lake maps also cluster (21% of 24 on
  the forced set), from its nudge's tall scarp; a tapered scarp is M9b's fix.
- *A slow tail*: a map whose attempts keep failing is slow to finish (41 s at 256² for Islands seed
  2 in the bench, 5 attempts). The page never stalls, but M9a's time budget (§13) is needed.
- *Above 16*: confirmed in the game by the tall-maps probe (D172), but the build's cap at 16 must be
  lifted for Verticality 70+ (the prototype measured the land before the build).
- *Natural ramps* need the derived-slope rule changed in `features/slopes.ts` (#62).
- *The core start and edge rules* (on dev since #44) have their own definitions and numbers. The
  prototype's are approximations: starting wood's 170 / 110 / 55 logs, the planner's wood target,
  and the edge-wall check's band (#68). M9a re-measures with the core rules. At the branch's tip
  the prototype runs on them: on the 40 checked maps first attempts fall from 25 to 19, mostly
  because the core's `water.source_in_flow` finds springs inside a flow that the prototype's own
  check lets through.
- *In-game behaviour*: M9a's probe batch (D116).

## 18. Staging (proposal)

M9a, M9b and M9c are approved (D145); what goes into each waits for Kyler's approval of this
version. The proposal (also in ROADMAP M9):

- **M9a, terrain and water from processes**: version 2's genome and themes; the field (uplift with
  the regional field, caprock, erosion, weathering, levels with benches) and the hydrology (hanging
  valleys, knickpoints, spring lakes); natural ramps and the derived-slope rule for them;
  Verticality (above 16 from 70, confirmed by the tall-maps probe, D172); the settler with reach and the drought-aware
  start (#59); Kyler's start and edge rules on the generator's side (the settler's walk over the
  derived slopes, the planner's wood target from starting wood, the land running on past the
  edges), with the core rules on dev (#44); the one-settle order and the
  progressive preview; the runs model and format 3 (§12);
  the natural-narrows builder as the Dam site tool; tool entries `generate`, `landmarks`, `reach`
  and `place_narrows`.
- **M9b, composition and variety**: intentions (the set, steering, checks, re-steer, drop records,
  the within-intention measures), Variety and Surprise me (with Verticality's jumps), recipes, the woods
  (D164), the cycle signature and the axes in the openings, difficulty as positions (#65), the permanent
  measures; tool entries `steer` and `check_intention`.
- **M9c, score, names and candidates**: K = 3 with progressive preview; the score as a tiebreaker;
  names from the names study with read-back roles; "how it plays" cards; Variations (D143); the
  place resolver and judgement words; tool entries `describe_map`, `how_it_plays` and `variations`.

## 19. What Kyler decides

Kyler approves version 2 by judgement from the ten briefs
([investigation/generative/briefs/v2/](../investigation/generative/briefs/v2/)), the measures
([REPORT-v2](../investigation/generative/REPORT-v2.md)) and the contact sheets: one readable
image per theme in [docs/sheets/design-v2/](sheets/design-v2/) (seeds 1–30 at 128² and a row at
Verticality 85, drawn from above in the clean look at 2 px a tile, labelled), beside the small
record [docs/sheets/design-v2.png](sheets/design-v2.png) (D144); a local page shows version 1,
version 2 and high Verticality side by side. The ten maps to play are in
[investigation/generative/out/v2/](../investigation/generative/out/v2/). This version's pending
decisions are decisions-pending #59–#68.

## 20. Appendix: every one-height assumption in `src/`

Every place that reads or writes one height per column, by module (read at `dev` 965e128;
`investigation/terrain3d/INVENTORY.md` lists most with line numbers). M9a moves the document and
the build's terrain to runs (§12); 3D-a changes the rest. "Multi-run aware" marks places that
already handle caves.

**Format I/O**

| File | Functions | How they assume one height |
|---|---|---|
| `core/format/world.ts` | `surfaceOf` | heights are the first free layer above the top solid voxel: the source of every imported and validated heights array |
| `core/format/world.ts` | `voxelsFromHeights` | voxels [0, h) per tile (pack, the legacy decode) |
| `core/format/world.ts` | `SettledState.floor`, `settledSimulationSingletons` | one water, moisture, contamination and evaporation slot per tile (`Levels` 1); the floor is the surface |
| `core/format/world.ts` | `decodeWorld` | voxels from the project's `joinTerrain` |
| `core/gen/pack.ts` | `toWorld`, `toTimberFile` | voxels and singletons from `built.heights`; the thumbnail from heights |
| `core/render/shade.ts` | `shadeTiles`, `thumbnailRgba`, `thumbnailJpeg` | top-down shading from heights |
| Multi-run aware | `floorsOf`, `emptySimulationSingletons(levels)`, `mixedSimulationSingletons`, `storedSoil(topSlot)`, `storedWater` | count runs; keep every slot on roofed tiles |

**Document and project format**

| File | Functions | How |
|---|---|---|
| `core/doc/base.ts` | `BaseMap.heights`, `BaseMap.columns`, `BaseTerrain`, `splitTerrain`, `joinTerrain`, `baseFromFile`, `baseTerrain`, `fileFromBase` | one height byte per tile; caves only as frozen 23-voxel strings; a height edit on a stored column is dropped |
| `core/doc/document.ts` | `DOCUMENT_FORMAT_VERSION = 2`, `KeptContent.heights`, `DocumentV1.base.heights`, `fromV1`, `decodeProject`, `toDocument`, `importDocument` | locks keep the surface only (a lock loses a cave); formats 1–2 only |
| `core/doc/ops.ts` | `OpParams.sculpt`, `SculptMode`, `Lock.region`, `pinSlope`, `removeSlope`, `moveEntity`, `placeEntity`, `OpContext.lockedColumns`, `validateOp`, `regenerateRegion.area` | 2D cells and regions; z from heights at build; sculpts refused on cave columns (D40) |
| `core/spec/mapspec.ts` | `Region`, `terrain.highestTerrain`, `relief` | 2D regions; highest terrain 10–16; no Verticality yet |
| `core/doc/session.ts` | `MapSession`: `columns`, `roofedTiles`, `check`, `captureKept`, `baseStuff`, `exportFile`, `withSettledWater`, `keptLayerOf`, `sameWaterModel`, `openedWet` | terrain changes, joins, floors and kept layers on heights (`storedSoil`'s top slot is multi-run aware) |
| `core/doc/placing.ts` | `waterDepth`, `objectGround`, `planArea`, `entityProblem`, `planRiverBadwater`, `footprintCheck` | the deepest stored column per tile; z = heights; columns refused or skipped |
| `core/doc/tools.ts` | `planContextOf`, `planRiver`, `planLake`, `planLandform`, `objectsOnNewGround`, `movePatch`, `moveStartNear`, `startProblem` | beds, rims, tops and benches from heights |

**Features, build and raster**

| File | Functions | How |
|---|---|---|
| `core/features/build.ts` | `BaseLayer`, `LockedLayer`, `BuildResult.heights`, `PlacedSource.z`, `TerrainCache`, `DirtyInfo.terrain`, `buildTerrain`, `terrainStage`, `run`, `badwaterMouth`, `fileSlopeLinks`, `snapToGround`, `sameModelAsBase`, `dirtyInfo`, `SettleCache`, `sameModel` | the build's terrain is heights; every placement at z = heights; water, moisture and soil from heights; dirty regions are 2D |
| `core/features/target.ts` | `TargetInit`, `BuildTarget`, `TileRegion`, `Rect` | heights, protection, channel and lock masks per tile |
| `core/features/raster/terrain.ts` | `MAX_TERRAIN = 16`, `rasterizeLandform`, `rasterizeLake`, `rasterizeRiver`, `rasterizeBench`, `applySculpt`, `sculptBounds`, `sculptReadsNeighbours`, `integrityAt`, `terrainFootprint` | write heights; clip at 16; pits and spikes against 4 neighbours (a pit under a roof would be a cave) |
| `core/features/slopes.ts` | `placeSlopes` | level regions of heights; steps where `h[j] === h[i] + 1`; z = heights |
| `core/features/raster/resources.ts` | `ResourceGround.heights`, `rasterizeBerries`, `rasterizeForest`, `rasterizeRuins` | z = heights; no headroom |
| `core/features/objects.ts` | `rasterizeObjects`, `FitGround`, `fitProblems` | z = the highest height under the footprint; columns refused |
| `core/features/edits.ts` | `EditGround.heights`, `applySlopeEdits`, `applyEntityEdits` | z = heights |
| `core/features/route.ts` | `RouteInput.heights`, `routeChannel`, `stepCost`, `carveChannel` | cut = heights − level |
| `core/features/geometry.ts` | `bedAt`, `floorAt` | one scalar level per point |
| `core/features/schema.ts` | every feature kind | 2D outlines and paths with scalar levels; no vertical extent |
| `core/features/setpieces/*` | `PlanContext.heights`, `SetPieceBuilder.slopes`; gorge, damSite (`reservoirOf`), badwaterBasin, terracedCliffs, waterfall (`measureLip`), obstaclePayoff, plugSpillway, secondDistrict (`pumpableWithin`, `planDistrict`) | plan and rasterize on heights |

**Simulation**

| File | Functions | How |
|---|---|---|
| `core/sim/water.ts` | `WaterModel.floor`, `WaterSim`, `SettleRun` | one column per tile, 4 neighbours, no ceiling |
| `core/sim/model.ts` | `waterModel`, `waterModelFromWorld`, `moistureBarrier` | the floor is the surface; emitters by (x, y) |
| `core/sim/prefill.ts` | `spillLevels`, `prefill`, `canonicalSettle`, `canonicalRun` | a 2D priority flood; saturation per tile |
| `core/sim/preview.ts` | `changedTiles`, `warmStart`, `previewSettle` | floors diffed per tile |
| `core/sim/drought.ts` | `droughtStorage` | spill per tile |
| `core/sim/moisture.ts` | `clusterSaturation`, `moisture` | climb costs against one floor |
| `core/sim/contamination.ts` | `soilContamination` | the same |

**Validation and analysis**

| File | Functions | How |
|---|---|---|
| `core/validate/checks.ts` | `validateMap`, `checkTerrain` (`terrain.max_height`, `terrain.single_floor`), `checkSlopes`, `checkStart` (`start.flat`, `start.entrance`) | on the surface; the support check skipped on single-floor maps (multi-run aware: `unsupportedVoxels`, `checkEntities`, `checkFile`) |
| `core/validate/playability.ts` | `PlayabilityInput.surface`, `checkPlayability`, `checkContained`, `basinLeak`, `checkOutflow`, `checkStart` (`start.dry`, pumpable water, walks, `plants.survive`, the drought, dam sites, `ruins.access`), `checkExtras` | every playability check on the surface |
| `core/analysis/walk.ts` | `walkDistance`, `shoreDistance` | moves on one level of heights |
| `core/analysis/regions.ts` | `walkRegions`, `components` | same-height regions |
| `core/analysis/damsites.ts` | `damCandidate`, `damSites` | crest = height + dam height |
| `core/analysis/metrics.ts` | `measure` | percentiles, steps, basins, falls and benches on heights |
| `core/analysis/mechanics.ts` | `mechanicsOf`, `storedWetMask`, `startRing` | multi-run aware (caves make checks approximate), but the wet mask collapses levels |
| `core/math/grid.ts` | `levelRegions`, `distanceFrom`, `Runs` | 2D |

**Generation** (the current planners, which M9a replaces): `core/gen/water.ts` (`PlanGround.heights`,
`groundOf`, `placeRiversidePonds`, `placePonds`, `nearestLevel`, `placeBadwater`), `core/gen/valley.ts`
(`planValley`, `objectsAndResources`, `startWalkable`, `walkableFromStart`, `reservoirReach`,
`highlandsOf`, `planStairs`), `core/gen/lakeBasin.ts` (`startLand`, `planLakeSpillways`),
`core/gen/extras.ts` (`planExtras`, `districtCandidates`, `obstacleSpots`), `core/gen/resources.ts`
(`Ground.heights`, `walkFromStart`, `planResources`), `core/gen/layout.ts` (`heightRange`,
`fitRelief`, `layoutTargets`, top ≤ 16).

**3D view**

| File | Functions | How |
|---|---|---|
| `render3d/model.ts` | `MapView.heights`, `surfaceWater`, `waterFromDepth`, `columnMap`, `emptyColumns`, `viewBuffers` | heights plus sparse voxel columns (multi-run aware for imports); the water's floor is heights |
| `render3d/mesh.ts` | `TerrainSource`, `meshChunk`, `changedRect`, `dirtyChunks` | greedy tops over heights, walls from neighbour heights; cave columns as unmerged voxel faces |
| `render3d/pick.ts` | `pickHeightfield`, `TileHit`, `pickPlane` | a 2D ray march against heights; no z in a hit |
| `render3d/light.ts` | `skyVisibility`, `shadowTops`, `shadowMap`, `objectCasters`, `waterByte`, `tileData` | horizon scans and shadows over heights |
| `render3d/materials.ts` | the terrain shader (`heightOf` over `tileTex`) | soil blends and contact shadows by neighbour heights; a fixed shade under overhangs |
| `render3d/waterMesh.ts` | `meshWaterChunk`, `changedWaterChunks` | one surface quad per tile; lower columns get tops only |
| `render3d/renderer.ts` | `MapState.heights`, `setMap`, `updateTerrain`, `pick`, `pickAtLevel`, `tileToClient`, `heightAt`, `resetView` | columns never updated after an edit |
| `render3d/entities3d.ts` | `buildEntities` | soil per tile (objects stand at their own z) |

**Editor, worker and UI**

| File | Functions |
|---|---|
| `editor/Editor.tsx` | `Mirror.heights`, `mirrorOf`, `applyView`, `slopeAt`, gestures on `hit.x` and `hit.y`, `featureFromRect`, `showTile`, the handles (`heightAt`, `pickAtLevel`), `startPreview`, the inspector |
| `editor/tools.ts` | `ToolOptions.height` and `level`, `featureFromRect` (capped at 16), `paintOverlay` |
| `editor/features.ts` | `TileContext.heights`, `entitiesByTile`, `describeTile`, `movePatch`, `checkStartAt` |
| `editor/panels.tsx` | the inspector's height facts, `LandformControls` (0–16), the level selects |
| `worker/session.ts` | `ViewUpdate.heights` and `terrainRect`, `sessionView`, `viewUpdate`, `columnsOf` (columns only when a map opens), `importModel`, `waterLayers`, `damSiteLayer`, `entitiesAt`, `instantCheck` (multi-run aware: `waterOf`, `soilOf`) |
| `worker/api.ts`, `worker/generator.worker.ts` | `GenerateResponse.heights`; the transfer list |
| `ui/Preview3D.tsx` | `viewOfResponse` (`emptyColumns`, `waterFromDepth`) |
| `ui/previewModel.ts`, `ui/Preview2D.tsx`, `ui/View3D.tsx`, `ui/SettingsPanel.tsx`, `ui/settingsModel.ts` | one pixel per tile, "level N", the height toggle, highest terrain 10–16 |

**Tests and fixtures**: `tests/golden/water.json.gz` (heightfield golden vectors),
`tests/fixtures/projects/*` (format 2), `tests/unit/render3d.test.ts`,
`tests/contract/import.test.ts`, `tests/contract/document.test.ts`,
`tests/contract/mechanics.test.ts`.

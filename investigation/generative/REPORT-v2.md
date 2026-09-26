# M9 design step, version 2: the prototype's numbers

The numbers behind [docs/m9-design.md](../../docs/m9-design.md) (design version 2). Every measure is
information for Kyler's judgement (D115); what blocks is breakage, Kyler's decided principles (no
built dam walls, nothing stamped) and what a player feels (no stalls, a first result quickly).

**The sets.** All at 128² and Normal unless named, measured by the same batch code
(`v2/batch.ts`: the workshop study's record, relief and verticality, the cheap cycle signature and
the strategy axes on every map):

| Set | What it is | Seeds |
|---|---|---|
| `v2-128` | design version 2 at Variety 70 and each theme's default Verticality | 1–200 per theme |
| `v2-128-vt85` | version 2 at Verticality 85 (high), heights kept within 16 | 1–50 |
| `unlocked-v2.json` | Verticality 85 tall (heights up to 22, D172): the land before the build, since the product's build caps terrain at 16 | 1–100 |
| `v2-128-i-snaking`, `v2-128-i-crater`, `v2-128-i-cliff` | each of Kyler's three new intentions drawn on every map (a steering test) | 1–30 |
| `v2-128-v100` | version 2 at Variety 100 (Surprise me's setting) | 1–50 |
| `v2-128-dreq`, `v2-128-doff` | the drought-aware start required, and off (the default prefers it) | 1–50 |
| `v2-96`, `v2-192`, `v2-256` | version 2 at other sizes | 1–30 at 96², 1–20 at 192² and 256² |
| `v1-128` | design version 1 (byte for byte version 1's batch) | 1–200 |
| `cur-128` | the current generator (`m8-done`, 0.6.0; byte for byte version 1's baseline) | 1–200 |

**Machine and conditions.** Kyler's machine (AMD Ryzen 7 9800X3D, 8 cores, 16 threads; Node 24;
the installed Chrome), shared with other agents' jobs at full load throughout: every time is
inflated. Workshop maps and their per-map numbers stay local (`C:\dgm-workshop`); only aggregates are
here. `fit-score` and `ratings.json` are not used (D137).

**Which code.** Every number, brief, map, render and sheet here comes from the prototype
0.7.0-proto2.1 at commit 07da086, before dev's start and edge rules (#44) and mine sites and ruins
(#42) were merged into this branch. At the branch's tip the prototype (0.7.0-proto2.2) runs on
those core rules and dev's resources planner, and its maps differ in their bytes (§10).

## Summary: every measure against its target

The first rows block (D115); the rest are information. The targets come from design §10, the
workshop and the official maps. Every version 2 number here is from the final run, with all of
Kyler's rules (the start water walk, starting wood, the woods, no edge walls, sources that start
rivers, a mine site on every map) and the lake and island fixes.

| Measure | Target | Version 2 | Version 1 | Current (m8-done) |
|---|---|---|---|---|
| No dam walls, no edge walls (block) | none | **0 dam walls and 0 edge walls** on every batch map; 3,353 maps across every set, size and Verticality | 0 dam walls; edge walls on 51 of 1,200 | 765 dam walls; edge walls on 24 |
| Batches (block) | ≥ 98% final per theme and size | 100% final in every theme at 96², 128², 192² and 256² but Canyon at 128² (99%); 98–100% at Verticality 85 | 100% | 100% |
| Same bytes from a seed; both validators (block) | always; 0 disagreements | **40 of 40** maps give the same bytes twice and in a fresh process; **0 disagreements** in 1,720 checks, and both validators pass all 40; the same at the branch's tip, after merging dev (§10) | 58 of 58; 0 | – |
| A first result quickly, no stall (block) | quickly | the page never waits (the product generates in a worker); one map at a time, the first look at 0.15 s (128²) and 0.6 s (256²), the whole map 1.3 s and 5.7 s (Node); a slow tail when many attempts fail (Islands seed 2 at 256²: 41 s, §7) | – | – |
| First attempt | 60% (a target) | 63% at 128² (Canyon lowest, 49.5%) | 62.5–90.5% | 96–100% |
| M1 no clones | nearest ≥ 0.25, median ≥ 0.40 | 0.35–0.42 / 0.44–0.50: **6 of 6** | 0.33–0.38 / 0.42–0.48: 6 of 6 | 0.04–0.16 / 0.06–0.22: 0 of 6 |
| M2a whole-map archetypes | no cluster over 15% | 10–12.6% in four themes; Delta 18%, Islands 33.5%: **4 of 6** | 11.5–68%: 1 of 6 | 100% |
| M2b river networks | no cluster over 15%; many shapes | 6–14.6%, 104–135 shapes | 8–20%, 108–137 shapes | 42.5–100%, 4–25 shapes |
| M2c relief | no cluster over 15% | 2–6%, 17–36 shapes | 2–5%, 12–49 shapes | 9–29.5%, 6–14 shapes |
| M3 openings | no cluster over 15%; the spread | 1.5–4.5%, spread 0.85–0.98 | 2–7.5%, 0.68–0.84 | 21.5–64.5%, 0.34–0.57 |
| M3c cycle (cheap signature, 200 per theme) | play differs | 25–33 groups, the largest 13–40.5% | 15–32 groups, 20.5–62.5% | 1–3 groups, 60.5–100% |
| M3d strategy axes (nine, with the woods) | play differs | 189–199 joint signatures of 200, the largest 1–1.5% | 169–196, 1–3% | 37–80, 5.5–16.5% |
| M4 no approximation (D128) | at most 10% below the workshop's p10 | River Valley 9.5%, Canyon 0.5%, Highlands 6%, Lake Basin 12%, Delta 14%, Islands 3.5%: **4 of 6** | 2–20%: 3 of 6 | 0–2.5%: 6 of 6 |
| M5 good natural dam within 40 tiles | comparable to official (36%; workshop 46%): 26–56% | 60% (43.4–81.5% by theme; 3 of 6 in the band) | 48% (27–73.5%) | 60% (0–100%) |
| M7 storage possible | a guard | 100% | 100% | 99–100% |
| Relief range | official 13, workshop 14 | **13** (11–14 by theme) | 8 | 10 |
| Levels in use | 16, 16 | 15 | 11 | 10 |
| Tallest fall (levels) | official 3.9, workshop 5.7 | 5.9 | 3 | 2 |
| Flat share / cliff share | 0.52 / 0.16 official; 0.44 / 0.11 workshop | 0.44 / 0.16 | 0.56 / 0.06 | 0.68 / 0.11 |
| Reach on foot | 9% official, 7% workshop | 15% | 40% | 35% |
| Above 16 | none by default; at 70+ only (confirmed in the game, D172) | none by default; at Verticality 85 tall, 8.2% of the land on every map (the land before the build) | – | – |
| Naturalness: steps in straight runs of 8+ / longest run | official 0.07 / 18 | 0.03 / 14 | 0.04 / 14 | 0.14 / 28 |
| Lake shapes: roundness / elongation / branching | real terrain 0.14 / 2.0 / 1.65 | **0.15 / 1.9 / 1.67** (0.20 / 1.7 / 1.58 before the fix) | 0.15 / 2.0 / 1.63 | 0.08 / 2.9 / 1.70 |
| Islands maps that read as islands in a sea | a broad sea with land scattered through it | **17%** (0% before the fix); water 27%, 21% of the land in islands | 0.5% | 25.5%, with rims at the edges |
| Landscape bench, relief group | lower is closer to real terrain | 0.52 | 0.60 | 0.66 |
| Intentions | outcomes that emerge; some maps none | Kyler's four emerge on 58% (under a cliff), 68% (the snaking river), 26% (the crater) and 16% (the waterfall into a round lake) of their draws; the other seven 23–95%; "safe water uphill" left the set | – | – |
| Start's water on another level; starting wood | Kyler's rules | 27% of starts drink from another level; 259 logs at the median (139–521), plus about 110 growing | – | – |
| Start water through the first Normal drought | a proposal (#59) | 53% (off: 52%; required: 100%, first attempts 40%, final 99%) | 29% | 33% |

## 1. The prototype

`investigation/generative/v2/` (no `src/` change), on top of version 1's modules:

| File | What it does |
|---|---|
| `genome.ts` | the genome and the six themes' priors, Verticality, the variation index |
| `field.ts` | uplift (tilt, regional field, noise, parts), caprock, erosion with hardness, weathering |
| `levels.ts` | levels (hypsometry, benches), natural ramps |
| `hydro.ts` | version 1's hydrology with hanging valleys, knickpoints and spring lakes |
| `start.ts` | the settler: reach, moist land by walk, drought-aware water, the intentions' preferences |
| `hazards.ts` | version 1's badwater hollow |
| `intentions.ts` | the set (eleven, four of them Kyler's), the draw, the nudges, the settler's preferences, the checks |
| `generate.ts` | the pipeline: the field once, one settle, re-plans, the intention checks and re-steer |
| `terrain.ts` | the runs model and format 3's `TerrainData` |
| `cycle.ts` | the cheap cycle signature |
| `narrows.ts`, `narrows-check.ts` | the natural-narrows builder and its trial |
| `vertical.ts`, `refs.ts`, `unlocked.ts` | relief and vertical reach, the official and workshop yardstick, and tall maps' land |
| `batch.ts`, `measures.ts`, `archetypes.ts`, `tables.ts` | the batches, the measures, the cluster drivers, these tables |
| `simplay.ts` | the exact cycle model on a sample, and the cheap signature against it |
| `landscapes.ts` | the landscape bench |
| `names.ts`, `card.ts`, `export.ts`, `render.ts`, `sheet.ts` | names, the "how it plays" card, the ten briefs, renders, contact sheets |
| `rules.ts` | Kyler's start water rule, starting wood (D164) and the edge-wall check |
| `woodaxis.ts` | starting wood, the woods axis and edge walls for version 1's and the current generator's batch maps |
| `lakes.ts` | lake shapes and island seas, against real terrain and the official and workshop maps |
| `sheets3d.ts` | the readable contact sheets, drawn in the app's 3D view |
| `bench.ts`, `check.ts`, `variations.ts` | speed, determinism and parity, Variations |

## 2. Batch pass rates

A map passes when the real validators pass in the `generate` profile (with Kyler's start water rule
and starting wood in place of their `start.water` and `start.wood`), `water.storage_possible` holds,
and neither the dam-wall check nor the edge-wall check finds a wall; up to 12 attempts, planning again on the same field
before a new genome (design §13).

### Pass rates (first attempt / final, maps)

| Set | River Valley | Canyon | Highlands | Lake Basin | Delta | Islands |
| --- | --- | --- | --- | --- | --- | --- |
| v2-96 | 56.7% / 100% (30) | 40% / 100% (30) | 56.7% / 100% (30) | 50% / 100% (30) | 46.7% / 100% (30) | 56.7% / 100% (30) |
| v2-128 | 65.5% / 100% (200) | 49.5% / 99% (200) | 65% / 100% (200) | 66.5% / 100% (200) | 70% / 100% (200) | 61.5% / 100% (200) |
| v2-192 | 40% / 100% (20) | 65% / 100% (20) | 70% / 100% (20) | 70% / 100% (20) | 60% / 100% (20) | 75% / 100% (20) |
| v2-256 | 70% / 100% (20) | 65% / 100% (20) | 60% / 100% (20) | 45% / 100% (20) | 60% / 100% (20) | 40% / 100% (20) |
| v2-128-vt85 | 44% / 100% (50) | 44% / 98% (50) | 60% / 100% (50) | 54% / 98% (50) | 50% / 100% (50) | 44% / 100% (50) |
| v2-128-v100 | 64% / 100% (50) | 46% / 100% (50) | 54% / 100% (50) | 60% / 100% (50) | 74% / 100% (50) | 60% / 100% (50) |
| v2-128-dreq | 32% / 100% (50) | 32% / 98% (50) | 42% / 100% (50) | 48% / 100% (50) | 44% / 100% (50) | 44% / 96% (50) |
| v2-128-doff | 64% / 100% (50) | 54% / 100% (50) | 68% / 100% (50) | 68% / 100% (50) | 62% / 100% (50) | 68% / 100% (50) |
| v1-128 | 87% / 100% (200) | 62.5% / 100% (200) | 86% / 100% (200) | 75% / 100% (200) | 90.5% / 100% (200) | 89.5% / 100% (200) |
| cur-128 | 99.5% / 100% (200) | 100% / 100% (200) | 96% / 100% (200) | 100% / 100% (200) | 99% / 100% (200) | 100% / 100% (200) |

Every seed gives a map at every size and setting but a few: Canyon seeds 42 and 143 at 128² (99%
final for Canyon), and one seed each of Canyon and Lake Basin at Verticality 85 (98% of 50). All sit
at or above the 98% rule. First attempts are lower than version 1's: the settler asks for more
(reach, moist land by walk, the drought-aware start, starting wood), and the land is taller and
cliffier. 82% of maps finish on their first genome: most failed attempts are planned again on the
same field. The reasons are in [measures-v2.json](measures-v2.json) (`failedAttempts`); the most
common are `water.storage_possible` (482 attempts on v2-128), the start's placement (359) and
starting wood (310).

The batches ran while other agents' batches loaded the machine fully, so the sizes and settings
other than the default were trimmed: 50 seeds at Verticality 85, Variety 100 and the drought sets,
20 at 192² and 256².

### 2.1 Kyler's start and edge rules

Kyler's start water rule and starting wood (D164) replace D85's water and tree rules, and no map may
keep an edge wall (`v2/rules.ts`, the prototype's own versions; the core rules reached dev with
#44 after these batches ran, and M9a builds the generator's side on them).

### Kyler's start and edge rules (rules.ts): the start's water, starting wood and the woods, edge walls

| Set | Start water on another level | D85 would fail | Old tree count would fail | Walk to the pump shore: median (p10–p90) | Starting wood, logs: median (p10–p90) | Woods: quick / mixed / slow | Maps with an edge wall | No mine site |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v2-128 | 27.1% | 23.5% | 5.6% | 6 (2–13.8) | 259 (139–521) | 29.7% / 34.4% / 35.9% | 0 of 1198 | 0 |
| v2-128-vt85 | 16.1% | 14.8% | 4.4% | 4.4 (2–12.8) | 263 (146–538) | 28.5% / 28.5% / 43% | 0 of 298 | 0 |
| v2-128-v100 | 20.7% | 18.3% | 4.3% | 5 (2–13.2) | 281 (142–616) | 26.3% / 28% / 45.7% | 0 of 300 | 0 |
| v2-96 | 19.4% | 16.1% | 12.8% | 4.4 (2–13.1) | 242 (136–543) | 30.6% / 30.6% / 38.9% | 0 of 180 | 0 |
| v2-192 | 25% | 22.5% | 0.8% | 5.7 (1.4–13.4) | 224 (144–424) | 30% / 38.3% / 31.7% | 0 of 120 | 0 |
| v2-256 | 20.8% | 20.8% | 2.5% | 4.8 (2–13.5) | 235 (130–471) | 34.2% / 35% / 30.8% | 0 of 120 | 0 |
| v2-128-dreq | 19.9% | 16.2% | 4% | 5.2 (2–13.8) | 250 (138–514) | 30% / 28.3% / 41.8% | 0 of 297 | 0 |
| v2-128-doff | 28.3% | 23.3% | 5.3% | 5.4 (2–14.1) | 266 (140–592) | 29% / 33.7% / 37.3% | 0 of 300 | 0 |
| v1-128 | – | – | – | – | 234 (98–480) | 32.2% / 53.3% / 14.6% | 51 of 1200 | 0 |
| cur-128 | – | – | – | – | 185 (84–335) | 31.1% / 53.3% / 15.6% | 24 of 1200 | 0 |

On v2-128, under all of Kyler's new rules:
- **The start's water**: 27% of starts drink from a shore on another level, reached down the map's
  own slopes; 23.5% of the maps would fail D85's rule, which asked for water on the start's own
  level. The walk to the pump shore is 6 tiles at the median.
- **Starting wood** (D164): 259 logs within 20 tiles' walk at the median (139–521), grown trees only,
  plus about 110 logs growing. 5.6% of the maps would have failed the old tree count.
- **The woods**: 30% of the starts stand in pine and birch woods (quick to regrow), 34% in mixed woods
  and 36% in oak woods (plenty of wood, slow to regrow). Version 1's and the current generator's are
  mostly mixed (53%).
- **Edge walls and mine sites**: no finished map has an edge wall or lacks a mine site. In the loop
  two attempts were turned down for an edge wall and one for no mine site; 51 hydrologies were
  planned again because a spring sat inside a flow (D171).
- **First attempts** fall to 63%, from 68.5% before the new rules.

## 3. The measures

Version 1's definitions (design §10), unchanged; the workshop's scales and cuts are aggregates in
[measures-v2.json](measures-v2.json).

### 3.1 No clones

### M1 no clones (nearest other seed; min / median)

| Theme | v2 | v1 | current |
| --- | --- | --- | --- |
| River Valley | 0.413 / 0.496 | 0.326 / 0.441 | 0.109 / 0.161 |
| Canyon | 0.375 / 0.474 | 0.328 / 0.451 | 0.035 / 0.06 |
| Highlands | 0.381 / 0.496 | 0.355 / 0.468 | 0.137 / 0.207 |
| Lake Basin | 0.416 / 0.503 | 0.377 / 0.475 | 0.107 / 0.161 |
| Delta | 0.397 / 0.484 | 0.335 / 0.416 | 0.088 / 0.154 |
| Islands | 0.345 / 0.437 | 0.354 / 0.451 | 0.16 / 0.216 |

### 3.2 No archetypes

### M2 no archetypes: largest cluster's share (clusters)

| Theme | Whole maps v2 | v1 | current | Rivers v2 | v1 | Relief v2 | v1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| River Valley | 11.5% (53) | 46.5% (30) | 100% (1) | 9.5% (58) | 8% (58) | 2.5% (139) | 2.5% (129) |
| Canyon | 12.6% (52) | 26% (34) | 100% (1) | 14.6% (44) | 8% (60) | 2% (143) | 2% (153) |
| Highlands | 10% (59) | 29% (36) | 100% (1) | 13% (51) | 20% (61) | 2% (138) | 2% (151) |
| Lake Basin | 11.5% (60) | 11.5% (36) | 100% (1) | 13.5% (50) | 8% (62) | 3.5% (110) | 3.5% (122) |
| Delta | 18% (56) | 68% (19) | 100% (1) | 13% (48) | 11% (61) | 4.5% (123) | 5% (97) |
| Islands | 33.5% (23) | 55.5% (30) | 100% (1) | 6% (68) | 8.5% (47) | 6% (109) | 4.5% (84) |

What drove version 1's clusters, and what version 2 changed (task b). A cluster's maps are close
when both halves of the variety distance are small. In version 1 the layout half was the driver:
the largest clusters were maps shaped like one tilted plane (planarity: the share of a map's 16×16
height picture a plane explains), and under the distance's rotations and mirrors every tilted plane
looks alike. They also shared no islands, low water and lake shares, and a narrow relief. Version 2
weakened the regional tilt, added a regional field of several highs and lows, made escarpments die
out along their length, and drew water, islands and relief wider. Its largest clusters are less
planar than version 1's in every theme but Lake Basin (0.18–0.36 against 0.26–0.57; the workshop's
typical map 0.22), though still more planar than the rest of their theme in five. What they share
now is mostly structural (no caves, rarely islands) and a low water share. Canyon's water prior was
drawn wider in the second run (more lakes, spring lakes and river islands), which brought its
cluster from 19.5% to 11% then (12.6% in the final run). Islands' largest cluster is the exception:
its maps share the broad sea in the middle (§3.9).

### M2a drivers of the largest whole-map cluster (v2 against v1)

| Theme | Set | Layout half / feature half (workshop pair 0.51 / 0.53) | Planarity: cluster / rest (workshop 0.22) | Features its maps agree on most (ratio to a workshop pair) |
| --- | --- | --- | --- | --- |
| River Valley | v1-128 | 0.34 / 0.216 | 0.492 / 0.3 | caveShare 0, islands 0.044, waterShare 0.156, lakeShare 0.188 |
| River Valley | v2-128 | 0.374 / 0.188 | 0.294 / 0.195 | caveShare 0, islands 0.06, waterShare 0.191, lakeShare 0.204 |
| Canyon | v1-128 | 0.327 / 0.231 | 0.459 / 0.336 | caveShare 0, islands 0.052, waterShare 0.14, lakeShare 0.16 |
| Canyon | v2-128 | 0.367 / 0.19 | 0.178 / 0.221 | caveShare 0, waterShare 0.127, lakeShare 0.165, islands 0.185 |
| Highlands | v1-128 | 0.349 / 0.212 | 0.432 / 0.25 | caveShare 0, islands 0.024, lakeShare 0.177, waterShare 0.178 |
| Highlands | v2-128 | 0.37 / 0.176 | 0.302 / 0.175 | islands 0, caveShare 0, waterShare 0.17, relief 0.19 |
| Lake Basin | v1-128 | 0.361 / 0.193 | 0.287 / 0.188 | islands 0, caveShare 0, cliffShare 0.124, lakeShare 0.181 |
| Lake Basin | v2-128 | 0.39 / 0.179 | 0.356 / 0.165 | caveShare 0, islands 0.115, waterShare 0.189, lakeShare 0.204 |
| Delta | v1-128 | 0.343 / 0.213 | 0.567 / 0.35 | caveShare 0, islands 0.04, cliffShare 0.165, waterShare 0.199 |
| Delta | v2-128 | 0.378 / 0.176 | 0.332 / 0.212 | caveShare 0, islands 0.039, cliffShare 0.197, step1Share 0.215 |
| Islands | v1-128 | 0.356 / 0.202 | 0.262 / 0.199 | caveShare 0, cliffShare 0.161, step1Share 0.247, relief 0.308 |
| Islands | v2-128 | 0.328 / 0.229 | 0.191 / 0.137 | caveShare 0, islands 0.24, cliffShare 0.283, flatShare 0.339 |

### 3.3 Play variety: openings, the cycle signature and the axes

### M3 openings; M3c cheap cycle; M3d strategy axes

| Theme | Openings: largest, spread (v2 / v1 / current) | Cycle groups, largest (v2 / v1 / current) | Axes: joint signatures, largest (v2 / v1 / current) |
| --- | --- | --- | --- |
| River Valley | 2%, 0.922 / 2.5%, 0.827 / 21.5%, 0.554 | 33, 28.5% / 22, 48% / 2, 97.5% | 199, 1% / 188, 1.5% / 80, 5.5% |
| Canyon | 2.5%, 0.895 / 5.5%, 0.788 / 55%, 0.376 | 26, 40.4% / 20, 51% / 2, 99.5% | 189, 1% / 176, 3% / 37, 15.5% |
| Highlands | 1.5%, 0.975 / 2%, 0.839 / 21.5%, 0.565 | 31, 17.5% / 30, 30% / 3, 60.5% | 193, 1.5% / 196, 1% / 71, 5.5% |
| Lake Basin | 4%, 0.867 / 3%, 0.769 / 64.5%, 0.354 | 32, 21% / 32, 20.5% / 2, 97.5% | 199, 1% / 194, 1.5% / 40, 16.5% |
| Delta | 2%, 0.849 / 4%, 0.735 / 52.5%, 0.347 | 25, 40.5% / 15, 62.5% / 2, 68% | 193, 1% / 169, 2.5% / 49, 9.5% |
| Islands | 4.5%, 0.895 / 7.5%, 0.684 / 48.5%, 0.343 | 33, 13% / 24, 28.5% / 1, 100% | 193, 1% / 189, 2.5% / 58, 8% |

### 3.4 No approximation

### M4 no approximation (share of a theme's maps closer to a workshop map than the workshop's p10, 0.591)

| Theme | v2 | v1 | current | v2's close pairs: layout half / feature half (all maps' nearest pairs) | Features that make v2's close pairs close (ratio to all nearest pairs) |
| --- | --- | --- | --- | --- | --- |
| River Valley | 9.5% (19) | 20% (40) | 0% (0) | 0.365 / 0.203 (0.402 / 0.266) | islands 0, step1Share 0.52, treesPer10k 0.566, cliffShare 0.659, scrapPer1k 0.669 |
| Canyon | 0.5% (1) | 9% (18) | 2.5% (5) | 0.396 / 0.178 (0.414 / 0.354) | islands 0, waterfalls 0, caveShare 0, treesPer10k 0.024, cliffShare 0.192 |
| Highlands | 6% (12) | 15.5% (31) | 0% (0) | 0.397 / 0.175 (0.422 / 0.282) | flatShare 0.304, step1Share 0.399, scrapPer1k 0.42, cliffShare 0.551, treesPer10k 0.561 |
| Lake Basin | 12% (24) | 4% (8) | 0% (0) | 0.378 / 0.182 (0.419 / 0.226) | islands 0, step1Share 0.481, cliffShare 0.608, scrapPer1k 0.639, waterfalls 0.735 |
| Delta | 14% (28) | 16.5% (33) | 2.5% (5) | 0.363 / 0.202 (0.394 / 0.245) | scrapPer1k 0.668, treesPer10k 0.714, bushesPer10k 0.802, step1Share 0.817, lakeShare 0.84 |
| Islands | 3.5% (7) | 2% (4) | 0% (0) | 0.371 / 0.203 (0.414 / 0.281) | islands 0.101, damSitesPer10k 0.283, relief 0.388, lakeShare 0.489, treesPer10k 0.51 |

**Which features make the close pairs close** (task c). A close pair is a generated map and its
nearest workshop map. Each ratio compares the pair's difference on one feature with the typical
nearest pair's; a low ratio means the feature is what makes them close. No workshop map is used in
generation, and per-map workshop numbers stay local.
- **River Valley** (9.5%): islands (neither has one), one-level steps (0.52), trees (0.57), cliffs
  (0.66) and scrap (0.67).
- **Lake Basin** (12%): islands (none), one-level steps (0.48), cliffs (0.61), scrap (0.64) and falls
  (0.74).
- **Delta** (14%): no single feature stands out: scrap (0.67), trees (0.71), bushes (0.80), one-level
  steps (0.82) and lakes (0.84). Delta's gentle, bushy lowland sits near the workshop's middle on many
  features at once.
- **Highlands** (6%): flat land (0.30), one-level steps (0.40) and scrap (0.42).
- **Islands** fell from 15% to 3.5%: the broad sea moved them away from the workshop's middle.

Version 1 against version 2: River Valley 20% → 9.5%, Highlands 15.5% → 6%, Delta 16.5% → 14%,
Canyon 9% → 0.5%, Islands 2% → 3.5%, Lake Basin 4% → 12%.

### 3.5 Relief and verticality

### Relief and verticality (medians; p10–p90 in brackets)

| Measure | Official | Workshop | v2 default | v2 Verticality 85 (≤ 16) | v2 Verticality 85 unlocked (the land before the build) | v2 Variety 100 | v1 | current |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| range | 13 (10–15) | 14 (8–18) | 13 (10–14) | 13 (11–15) | 16 (13–18) | 12 (10–14) | 8 (6–12) | 10 (10–13) |
| levels | 16 (12–17) | 16 (9–17) | 15 (9–17) | 13 (7–16) | 14 (8–19) | 13 (8–17) | 11 (8–14) | 10 (8–14) |
| maxHeight | 16 (16–16) | 16 (16–22) | 16 (14–16) | 16 (14–16) | 19 (18–20) | 15 (13–16) | 15 (12–16) | 16 (16–16) |
| above16 | 0% (0%–0%) | 0% (0%–22.6%) | 0% (0%–0%) | 0% (0%–0%) | 8.2% (2.8%–15.5%) | 0% (0%–0%) | 0% (0%–0%) | 0% (0%–0%) |
| tallestFall | 3.94 (0.97–6.96) | 5.74 (1.99–10.87) | 5.93 (2.02–10.24) | 6.15 (2.92–11.14) | – | 5.1 (1.98–10.08) | 3 (1–6.94) | 1.98 (0.95–5) |
| flatShare | 52% (34.3%–59.3%) | 44% (25.1%–57%) | 43.8% (30.8%–57.6%) | 53.2% (38.2%–63.5%) | 48.9% (34.3%–61.8%) | 46.4% (35.4%–61.9%) | 56.1% (44.3%–66.8%) | 68.1% (58.7%–76.5%) |
| cliffShare | 15.8% (8.6%–18.1%) | 10.9% (4.6%–20.9%) | 16.1% (9.2%–30.7%) | 22.2% (14.7%–30%) | 25.7% (17.8%–35.4%) | 17.3% (8.7%–31.7%) | 5.8% (3.1%–15.3%) | 10.7% (6%–14.7%) |
| onFoot | 8.6% (3.2%–26.2%) | 7% (1.9%–16.6%) | 14.8% (3.1%–38.4%) | 14.5% (2.9%–45%) | – | 17.6% (4.1%–44.4%) | 40.1% (5.7%–76.6%) | 34.6% (14.4%–65.7%) |
| stairsOnly | 91.4% (73.8%–96.8%) | 93% (83.3%–97.4%) | 85.1% (61.4%–96.8%) | 85.2% (54.5%–97.1%) | – | 82.1% (54.9%–95.8%) | 59.8% (23.3%–94.2%) | 65.4% (34.3%–85.6%) |
| oneStep | 43.6% (3.1%–87.4%) | 17.2% (4.7%–47.2%) | 59.2% (8.1%–94.5%) | 38.2% (3.5%–76.6%) | – | 59.3% (4.8%–94.8%) | 44.9% (4%–94.4%) | 28% (5%–44.8%) |

### Relief by theme (v2 default: range, levels, tallest fall, flat, cliff; median)

| Theme | Range | Levels | Tallest fall | Flat | Cliff | On foot | At Verticality 85: range, fall, cliff, on foot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| River Valley | 13 | 15 | 5 | 40% | 16.5% | 13.1% | 13, 5.99, 22.1%, 15.9% |
| Canyon | 14 | 10 | 5.16 | 49.8% | 26.9% | 13.7% | 14, 5.92, 26.4%, 22.9% |
| Highlands | 13 | 15 | 5.97 | 43% | 24.7% | 12.9% | 13, 6.99, 24.8%, 13% |
| Lake Basin | 13 | 15 | 5.05 | 35.3% | 15.2% | 11.9% | 13, 5, 23.4%, 9.2% |
| Delta | 12 | 15 | 5 | 39.8% | 9.7% | 16.5% | 13, 5, 18%, 11% |
| Islands | 11 | 14 | 8.89 | 52.4% | 12.9% | 20% | 12, 10.42, 16.8%, 20.4% |

**At the default** the relief reaches the official median (13) and is one level short of the
workshop's (14); the themes sit at 11–14. The highest ground is 16 at the median (14–16). The
tallest fall (5.9 levels) is a little above the workshop's median (5.7) and well above the official
maps' (3.9); Islands' islands stand high over their sea (8.9). Flat and cliff shares sit near the
workshop's (0.44 and 0.16). Canyon uses fewer levels (10) because its benches are 2–4 levels tall.
More land is reached on foot than on official or workshop maps (15% against 9% and 7%).

**At Verticality 85** with heights kept within 16, the land turns to cliffs (22% against 16%) and
benches (13 levels in use), with taller falls (6.2). **Tall** (heights to 22, confirmed in the game
by the tall-maps probe, D172; `unlocked-v2.json`), every map goes above 16: the highest ground is 19
(18–20), 8.2% of the land is above 16 (2.8–15.5%), and the relief is 16 (13–18). These are measured on
the land before the build: the product's build clips terrain at 16 (`MAX_TERRAIN`, `integrityAt`),
and M9a lifts that for Verticality 70+. **At Variety 100** (Surprise me), 17% of maps jumped to
Verticality 70+ (50 of 300), as D132 asks ("now and then").

### 3.6 Naturalness and shape

### Naturalness and shape (medians)

| Set | Steps in straight runs of 8+ | Longest straight run | Ridge height std | Basin rim thickness CV | Water share | Lake share | Maps with an island | Waterfalls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Official | 0.07 | 18 | – | – | 15.2% | – | – | 4 |
| Workshop | 0.03 | 17 | – | – | 26.5% | – | – | 6 |
| v2 (theme median) | 0.03 | 14 | 0.31 | 0.37 | 11.4% | 8.2% | 12.7% | 4 |
| v1 (theme median) | 0.04 | 14 | 0 | 0.31 | 10.2% | 7.6% | 10.1% | 1 |
| current (theme median) | 0.14 | 28 | 0 | 0.18 | 8.3% | 2.5% | 16.8% | 2 |

### 3.7 Flow directions

### Flow directions (v2: share of maps whose water leaves toward each side)

- River Valley: NE 15%, S 13%, NW 12.5%, SE 12.5%, SW 10.5%, E 9.5%, N 9.5%, W 9%, local 8.5%
- Canyon: NE 15.7%, SE 13.6%, S 13.6%, SW 12.1%, N 11.1%, NW 10.6%, W 9.6%, E 9.1%, local 4.5%
- Highlands: SE 14.5%, E 14.5%, N 13%, W 12.5%, S 12%, NW 11.5%, NE 10.5%, SW 7%, local 4.5%
- Lake Basin: N 16%, W 13.5%, NW 13%, SE 12.5%, E 10.5%, S 10.5%, NE 10%, SW 9.5%, local 4.5%
- Delta: SE 15%, NE 14.5%, E 14%, W 11%, NW 10.5%, SW 10%, S 10%, N 8%, local 7%
- Islands: SW 14.5%, E 14%, SE 12.5%, S 12.5%, W 11.5%, NW 10.5%, NE 10.5%, N 9.5%, local 4.5%

### 3.8 Natural dam sites, dam walls and storage

### M5–M7: good natural dam site within 40 tiles (workshop 46.3%, official 36.4%); dam walls; storage possible

| Theme | M5 v2 | v1 | current | M6 walls v2 | v1 | current | M7 v2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| River Valley | 52% | 41.5% | 78% | 0 of 200 | 0 of 200 | 198 of 200 | 100% |
| Canyon | 43.4% | 33% | 100% | 0 of 198 | 0 of 200 | 170 of 200 | 100% |
| Highlands | 64% | 55% | 83% | 0 of 200 | 0 of 200 | 197 of 200 | 100% |
| Lake Basin | 69% | 57.5% | 2.5% | 0 of 200 | 0 of 200 | 0 of 200 | 100% |
| Delta | 48.5% | 27% | 96.5% | 0 of 200 | 0 of 200 | 200 of 200 | 100% |
| Islands | 81.5% | 73.5% | 0% | 0 of 200 | 0 of 200 | 0 of 200 | 100% |

### 3.9 Lake shapes and island seas

Kyler, from the contact sheet: many round, blob-shaped lakes across themes, and Islands maps that
don't clearly read as islands in a sea. The measures (`v2/lakes.ts`) were chosen before any result
was read: each lake's roundness (the isoperimetric quotient 4πA/P², tile edges), fill (its area over
the circle through its farthest tile), elongation (its major over its minor axis) and branching (its
shoreline over its convex hull's). A lake here is level water of 150+ tiles at 128², off the map's
edge. An Islands map reads as islands in a sea when water covers 35%+ of it, one body 25%+, 30%+ of
the land lies in islands, and 3+ islands have 30+ tiles.

### Lake shapes (lakes of 150+ tiles at 128², not ponds or craters; median, p10–p90)

| Source | Lakes | Roundness 4πA/P² | Fill | Elongation | Branching | Round lakes |
| --- | --- | --- | --- | --- | --- | --- |
| Real terrain (the survey's library) | 65 | 0.138 (0.048–0.347) | 0.234 (0.09–0.44) | 2.049 (1.372–3.882) | 1.649 (1.29–2.641) | 0% |
| Workshop maps | 218 | 0.143 (0.049–0.383) | 0.23 (0.1–0.504) | 2.075 (1.273–3.888) | 1.676 (1.306–2.599) | 2.3% |
| Official maps | 33 | 0.279 (0.077–0.521) | 0.26 (0.131–0.633) | 1.631 (1.159–3.142) | 1.42 (1.241–1.885) | 15.2% |
| v2 before the fix | 1164 | 0.204 (0.081–0.408) | 0.299 (0.123–0.542) | 1.723 (1.201–3.225) | 1.582 (1.321–2.059) | 2.9% |
| v2 | 1154 | 0.153 (0.07–0.323) | 0.262 (0.12–0.462) | 1.902 (1.247–3.486) | 1.671 (1.375–2.283) | 1.5% |
| v1 | 847 | 0.146 (0.068–0.381) | 0.227 (0.095–0.506) | 2.014 (1.202–3.871) | 1.631 (1.344–2.093) | 3.5% |
| current | 450 | 0.077 (0.035–0.146) | 0.089 (0.076–0.146) | 2.909 (1.705–10.592) | 1.703 (1.142–2.169) | 0% |

Kept round on purpose (v2): the lakes in calderas and cone craters, and the maps where Kyler's crater or round-lake intention emerged.

| v2 lakes | Lakes | Roundness | Fill | Elongation | Branching |
| --- | --- | --- | --- | --- | --- |
| In calderas and cone craters | 188 | 0.239 (0.074–0.48) | 0.397 (0.168–0.645) | 1.422 (1.096–3.046) | 1.55 (1.277–2.345) |
| On maps where Kyler's crater or round lake emerged | 97 | 0.166 (0.076–0.317) | 0.275 (0.109–0.451) | 1.922 (1.257–3.931) | 1.58 (1.352–2.22) |
| Ponds (60–150 tiles) | 721 | 0.195 (0.106–0.387) | 0.216 (0.101–0.42) | 2.481 (1.429–5.579) | 1.414 (1.259–1.636) |

### Island seas (Islands maps; median, p10–p90)

| Source | Maps | Water share | The largest body | Land in islands | Islands of 30+ tiles | Island size (tiles) | Read as islands in a sea |
| --- | --- | --- | --- | --- | --- | --- | --- |
| v2 before the fix | 200 | 0.129 (0.057–0.22) | 0.088 (0.034–0.192) | 0.007 (0–0.361) | 1 (0–2) | 62 (0–3233) | 0% |
| v2 | 200 | 0.271 (0.132–0.422) | 0.264 (0.082–0.42) | 0.214 (0.001–0.508) | 3 (0–6) | 248 (0–2746) | 17% |
| v1 | 200 | 0.212 (0.139–0.304) | 0.209 (0.123–0.302) | 0.343 (0.109–0.538) | 2 (1–4) | 2068 (127–5121) | 0.5% |
| current | 200 | 0.339 (0.313–0.359) | 0.322 (0.297–0.342) | 0.611 (0.539–0.664) | 8 (7–9) | 213 (167–269) | 25.5% |
| Official: Thousand Islands | 1 | 49.5% | 48.3% | 52.8% | 35 | 267 | yes |
| Workshop maps (all) | 130 | – | – | – | – | – | 14.6% |

**Lakes.** Version 2's lakes were rounder and less elongated than real ones (roundness 0.20 against
real terrain's 0.14, elongation 1.7 against 2.0). After the fix, lakes of 150+ tiles sit with real
terrain and the workshop's maps on every measure: roundness 0.15, fill 0.26, elongation 1.9,
branching 1.67. Round lakes (roundness 0.5+, elongation under 1.5) fell from 2.9% to 1.5%. Canyon's
are the most drawn out (roundness 0.12) and River Valley's the longest (elongation 2.1); Islands'
seas branch the most (2.0), with inlets and islands. The lakes kept round on purpose, in calderas and
cone craters, stay round (0.24). On the maps where Kyler's crater or round-lake intention emerged,
their lakes taken together are no rounder than the rest (0.17); the crater and the round lake
themselves are checked by their intentions (§4).

**Island seas.** Before, no Islands map read as islands in a sea: water covered 13% at the median,
its largest body 9%, and 0.7% of the land lay in islands. Now every Islands map has a broad sea in
its middle: water covers 27% at the median, the largest body 26%, and 21% of the land lies in islands
(3 islands of 30+ tiles, up to 6). 17% meet all four parts of the test. The current generator reaches
25.5% only with rims along its edges, which Kyler's rule now forbids; official Thousand Islands meets
it (35 islands), as do 15% of the workshop's maps. The rest hold a broad sea but too little land in
islands. And one sea in the middle of every map makes Islands maps alike: its largest whole-map
cluster rose to 33.5% (§3.2). Both are proposals for M9b (§12).

## 4. Intentions

### Intentions (v2-128; maps with none / one / two: 274 / 623 / 301)

| Intention | Drawn | Emerged | Re-steered | Dropped | Drop rate | Within: M1 min / median | Within: M2a largest (clusters) | On the sheet |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The start sits under a cliff, with water below (Kyler's own) | 149 | 85 | 1 | 63 | 42.3% | 0.375 / 0.535 | 14% (39) | canyon-2, highlands-2, lakeBasin-2 |
| A signature landmark stands out: a spire, a mesa, a peak or a tall waterfall | 133 | 127 | 0 | 6 | 4.5% | 0.427 / 0.517 | 7.1% (56) | islands-1, canyon-3, highlands-4 |
| The best farmland lies past the gorge | 94 | 32 | 1 | 61 | 64.9% | 0.482 / 0.574 | 12.1% (21) | delta-3, riverValley-13, highlands-16 |
| A waterfall shields the start: its cliff stands between the start and the nearest threat | 96 | 28 | 1 | 67 | 69.8% | 0.472 / 0.565 | 13.8% (17) | islands-18, lakeBasin-20, delta-28 |
| A hidden valley up the cliffs, reached only by stairs, holds riches | 76 | 36 | 0 | 40 | 52.6% | 0.475 / 0.538 | 13.9% (18) | riverValley-8, canyon-9, delta-25 |
| A lake high on the heights spills over a fall | 112 | 59 | 0 | 53 | 47.3% | 0.474 / 0.528 | 11.9% (29) | islands-2, canyon-4, riverValley-9 |
| Two rivers meet by the start | 108 | 25 | 0 | 83 | 76.9% | 0.463 / 0.556 | 20% (13) | canyon-10, highlands-16, delta-19 |
| The start looks out from high ground over the land below | 114 | 35 | 1 | 78 | 68.4% | 0.439 / 0.541 | 13.9% (20) | riverValley-7, islands-21, highlands-23 |
| A snaking river winds down a hill, dropping a level at its bends (Kyler's own) | 130 | 88 | 0 | 42 | 32.3% | 0.42 / 0.53 | 10.2% (41) | delta-2, lakeBasin-5, riverValley-8 |
| A large crater gathers two or more rivers into its lake, which leaves through a gap in the rim (Kyler's own) | 107 | 28 | 0 | 79 | 73.8% | 0.494 / 0.558 | 17.9% (15) | delta-7, lakeBasin-14, riverValley-20 |
| A waterfall plunges off a cliff into a large, roughly round lake (Kyler's own) | 106 | 17 | 0 | 89 | 84% | 0.486 / 0.595 | 17.6% (13) | canyon-1 |

### Kyler's three new intentions on every map (seeds 1–30 of every theme, each drawn alone)

| Intention | Maps | Emerged | Re-steered | Dropped | Drop rate | By theme (emerged) | Within: M1 min / median | Within: M2a largest (clusters) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A snaking river winds down a hill, dropping a level at its bends (Kyler's own) | 180 | 124 | 0 | 56 | 31.1% | Canyon 22, Delta 22, Highlands 26, Islands 15, Lake Basin 18, River Valley 21 | 0.387 / 0.513 | 8.1% (53) |
| A large crater gathers two or more rivers into its lake, which leaves through a gap in the rim (Kyler's own) | 180 | 36 | 0 | 144 | 80% | Canyon 4, Delta 5, Highlands 7, Islands 3, Lake Basin 10, River Valley 7 | 0.457 / 0.551 | 11.1% (22) |
| A waterfall plunges off a cliff into a large, roughly round lake (Kyler's own) | 180 | 24 | 0 | 156 | 86.7% | Canyon 4, Delta 3, Highlands 5, Islands 6, Lake Basin 2, River Valley 4 | 0.431 / 0.558 | 20.8% (13) |

**Kyler's four.**
- **"The start sits under a cliff, with water below"** emerges on 58% of its draws (85, and one
  re-steered, of 149). On the sheet: Canyon 2, Highlands 2, Lake Basin 2; in the briefs: 01.
- **"A snaking river going down a hill"** emerges on 68% (88 of 130), in every theme. A course turns
  three times or more, back and forth, while its bed drops 3–15 levels. On the sheet: Delta 2, Lake
  Basin 5, River Valley 8; in the briefs: 02.
- **"A large crater where multiple rivers converge"** emerges on 26% (28 of 107). Of the 79 drops,
  27 had a rim open on too many sides, 25 a closed crater lake that one river or none entered, 15 no
  large lake, and 12 a second way out. On the sheet: Delta 7, Lake Basin 14, River Valley 20; in the briefs: 03.
- **"A cliffside with a waterfall into a large circular lake"** emerges on 16% (17 of 106). Of the 89
  drops, 28 had a round lake with no fall of 3+ levels into it, 28 no large lake, 20 neither a round
  lake nor a fall, and 13 a fall into a lake that was not round. On the sheet: Canyon 1; in the briefs: 04.

**Drawn on every map** (the steering test: each of the three new ones drawn alone on seeds 1–30 of
every theme, 180 maps each):
- **The snaking river** emerges on 69% (124), in every theme. No clones within it (the nearest pair
  0.39 apart), and the largest cluster holds 8.1% (53 clusters).
- **The crater** emerges on 20% (36), in every theme. No clones (0.46), and the largest cluster holds
  11% (22 clusters).
- **The waterfall into a round lake** emerges on 13% (24). No clones (0.43), but the largest cluster
  holds 21% (5 of 24), from its nudge's tall scarp; a tapered scarp is M9b's fix.

**The others.** A landmark (95%), a high lake (53%) and a hidden valley (47%) come from the land;
they are common because the relief is high. The long view (32%), farmland past the gorge (35%), a
waterfall shield (30%) and meeting waters (23%) need the start to find a rare place. They stay: each
emerges on about one draw in three or four, and M9b's steering is the next lever.

**"The only safe water is uphill"** left the set: in version 2's first run it emerged on 4 of 86
draws, because uphill lakes that keep their water through a drought are too rare in this land.

**Within each intention** of the default draw, no two maps are clones (the nearest pair 0.37 or more
apart). The largest cluster holds 7–14% for most; 18–20% for meeting waters, the crater and the
round lake, on only 13–15 clusters of 17–28 maps.

## 5. Drought-aware start water

### Drought-aware start water (the start keeps pumpable water through the first Normal drought, analytic)

| Set | Share of maps | First attempt | Final |
| --- | --- | --- | --- |
| v2-128 | 52.6% | 63% | 99.8% |
| v2-128-dreq | 100% | 40.3% | 99% |
| v2-128-doff | 52% | 64% | 100% |
| v1-128 | 29.2% | 81.8% | 100% |
| cur-128 | 33.4% | 99.1% | 100% |

The start keeps pumpable water through the first Normal drought (the analytic drought over 3 days)
on 53% of maps with the preference (the default), and 52% with it off; version 1 had 29% and the
current generator 33%. Kyler's start water rule raised it (42% before): shores on other levels, often
lakes, count now. The preference itself barely moves it (×1.25 up, ×0.8 down), because few places a
start can go have a choice between water that lasts and water that doesn't.

Requiring it (`v2-128-dreq`) gets 100% of maps, at a cost:
- first attempts fall from 63% to 40%;
- finals fall to 99%: Islands 96% and Canyon 98%.

Hence #59's default: prefer on Normal and Hard, require on Easy only. On Easy a stronger preference
(×2) is the alternative, for M9a to measure.

## 6. Simulated play

### The exact cycle model (seeds 1–15 per theme at 128², weather seed 1729)

| Theme | Groups, largest (v2 / v1 / current) | Nearest-peer median (v2 / v1 / current) | Water kept through the Hard drought, range (v2) | Start keeps water through the first Normal drought (v2) |
| --- | --- | --- | --- | --- |
| River Valley | 8, 20% / 4, 46.7% / 2, 80% | 0.077 / 0.032 / 0.016 | 0%–37.8% | 40% |
| Canyon | 7, 33.3% / 5, 46.7% / 1, 100% | 0.049 / 0.034 / 0 | 0%–49.1% | 53.3% |
| Highlands | 10, 20% / 7, 26.7% / 4, 46.7% | 0.079 / 0.085 / 0.024 | 0%–29% | 46.7% |
| Lake Basin | 10, 26.7% / 9, 26.7% / 4, 46.7% | 0.091 / 0.096 / 0.019 | 0%–48.1% | 13.3% |
| Delta | 9, 33.3% / 7, 40% / 3, 60% | 0.051 / 0.056 / 0.021 | 0%–49.6% | 20% |
| Islands | 13, 13.3% / 11, 26.7% / 2, 86.7% | 0.107 / 0.092 / 0.015 | 0.1%–71.9% | 33.3% |

The cheap signature against the exact model (90 maps of v2): long retention r = 0.999, short retention r = 0.999, start days r = 0.984, running share against badwater exposure r = 0.675; the retention bin agrees on 97.8%, the start-days bin on 68.9%, the first-drought verdict on 100%.

The exact model (the cycles study's, unchanged) played the same 15 seeds of every theme. Version 2
splits into more cycle groups than version 1 in every theme, and its largest group is smaller in five
(equal in Lake Basin); its nearest-peer distance is the larger in three (Canyon, Islands, River
Valley). The water's year differs more from map to map, and the current generator's maps fall into
one to four groups. The water kept through the late Hard drought ranges, by theme, from none to
between 29% and 72% of the map's clean water (Islands' seas keep the most). With weather seed 1729,
the start keeps pumpable water through the first Normal drought on 13% (Lake Basin) to 53% (Canyon)
of these maps.

The cheap signature (design §11) is what the generator can afford on every candidate. It stands in
for the exact model on retention and the first drought: r 0.999 on both droughts; the retention bin
agrees on 98% of maps and the first-drought verdict on all of them. Start days agree by value (r
0.98) but less by bin (69%), because days near a bin's edge fall either side. Its badwater proxy
tracks the exact exposure only moderately (r 0.68), so exposure stays the exact model's.

## 7. Speed

### Speed in the batches (all six themes, loaded machine; the set's name gives its size; ms)

| Set | Whole map: median (p90) | First look | First settled water | Settles per map: median (p90) |
| --- | --- | --- | --- | --- |
| v2-128 | 5843 (19944) | 1005 (13678) | 4134 (17659) | 1 (2) |
| v2-96 | 1988 (6143) | 539 (4623) | 1444 (5770) | 1 (2) |
| v2-192 | 7285 (34937) | 997 (21820) | 5351 (32638) | 1 (1) |
| v2-256 | 12368 (34606) | 1495 (25495) | 10347 (30825) | 1 (1) |
| v1-128 | 2551 (5726) | – | – | – |
| cur-128 | 1628 (3403) | – | – | – |

### Speed bench (AMD Ryzen 7 9800X3D 8-Core Processor × 16, Node v24.13.0; seeds 1, 2 of every theme, one map at a time; ms)

| Where | Size | Generator | Median | Max | Node CPU median | First attempt | First look median (max) | First water median |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| node | 128 | proto2 | 1313 | 3167 | 1798 | 58% | 146 (2642) | 1134 |
| node | 128 | proto | 977 | 4738 | 1078 | 92% | – | – |
| node | 128 | current | 695 | 1470 | 781 | 100% | – | – |
| node | 256 | proto2 | 5660 | 41190 | 5860 | 75% | 636 (30190) | 4529 |
| node | 256 | proto | 5738 | 12561 | 5859 | 83% | – | – |
| node | 256 | current | 2660 | 5090 | 2781 | 100% | – | – |
| chrome | 128 | proto2 | 1181 | 2857 | – | 58% | 141 (2413) | 1027 |
| chrome | 128 | proto | 957 | 3731 | – | 92% | – | – |
| chrome | 128 | current | 644 | 1309 | – | 100% | – | – |
| chrome | 256 | proto2 | 7092 | 40411 | – | 75% | 835 (29604) | 5646 |
| chrome | 256 | proto | 7109 | 14411 | – | 83% | – | – |
| chrome | 256 | current | 3628 | 6131 | – | 100% | – | – |

The product generates in its worker (`worker/generator.worker.ts`), so the page never stalls; what a
player waits for is the first look. One map at a time (the bench, while other agents' jobs loaded
the machine, so every time is inflated):
- **At 128²** version 2 takes 1.3 s in Node and 1.2 s in Chrome at the median (version 1 1.0 and
  1.0 s, the current generator 0.7 and 0.6 s). The first look comes at 0.15 s.
- **At 256²** it takes 5.7 s in Node and 7.1 s in Chrome, as version 1 does (the current generator
  2.7 and 3.6 s), within PLAN's 8 s target. The first look comes at 0.6 s in Node and 0.8 s in
  Chrome.
- When the first attempt fails (5 of the 12 maps at 128², 3 of 12 at 256²), the kept map's land
  comes later: at worst 2.6 s at 128² (Highlands seed 1, 4 attempts) and 30 s at 256² (Islands seed
  2, 5 attempts, finished at 41 s). The page shows the first attempt's land at once and replaces it
  with a short notice (PLAN §2.2), so it never stalls, but 41 s is a long wait for the checked map.
  M9a's time budget is the fix (design §13).
- In the batches (six to eight maps at once, on a machine other agents' jobs loaded fully) every
  time stretched: at 128² the median map took 5.8 s (p90 20 s), its first look 1.0 s, and 29% of
  maps took over 10 s; at 256² the median was 12.4 s (p90 35 s). Version 1's and the current
  generator's batches ran earlier, under a lighter load, so batch times don't compare across
  generators; the bench's do.

## 8. The natural narrows, Variations and the runs model

**The natural narrows** (`narrows-check.ts`, `narrows-v2.json`) were tried at 96 places: two on the
main river of 8 maps of each theme.
- The spurs fit at 64 places and raised ground at 57; the rest are valleys too narrow or too open
  for spurs on both banks, and the builder says so.
- The dam-wall check flags none, and no first draw read as a wall.
- The spurs vary in level (a standard deviation of 0.65 of a level) and in thickness along their
  length (a coefficient of variation of 0.44), where the refinement note asks for variation.
- A dam holding a Normal drought's water (380 blocks) got shorter near the place at 8 of 57. At most
  places the valley upstream holds too little for any short dam, before or after: the spurs give the
  shape, and the valley decides the reservoir.

**Variations** (`variations.ts`, `variations-v2.json`) made 30 families of a map and four siblings.
No pair of the 300 is a clone (the closest 0.27 apart, an Islands family; the median 0.57). Every
sibling keeps the map's intentions (120 of 120). Siblings sit about as far apart as the theme's maps
do, so a variation is a new map with the same settings and intentions.

**The runs model** (`terrain.ts`, checked by `check.ts`) was tried on 40 maps. The terrain as runs
gives byte for byte the voxels of today's writer, field and base round-trip exactly, and a generated
map's `runs` lists are empty. Format 3's terrain takes 6.3 KB gzipped at 128² and 18.2 KB at 256².

## 9. The landscape bench

### The landscape bench (named/128/60/normalised/16/all, 99 real regions; seeds 1–30 per theme)

| Group (median distance from the real median; lower is closer) | v2 | v1 | current |
| --- | --- | --- | --- |
| network | 0.658 | 0.619 | 0.834 |
| water | 1.673 | 1.135 | 1.146 |
| relief | 0.518 | 0.597 | 0.663 |
| naturalness | 0.952 | 0.818 | 2.983 |
| heightHistogram (total variation) | 0.265 | 0.416 | 0.542 |
| slopeHistogram (total variation) | 0.074 | 0.089 | 0.138 |

| Measure | Real p10 / median / p90 | v2 median (outside the real 80%) | v1 | current |
| --- | --- | --- | --- | --- |
| branching (network) | 0.61 / 7.324 / 10.376 | 8.545 (14.4%) | 7.324 (7.8%) | 6.714 (6.7%) |
| drainageDensity (network) | 0.043 / 0.059 / 0.076 | 0.055 (1.7%) | 0.054 (5%) | 0.051 (30%) |
| sinuosity (network) | 1.057 / 1.207 / 1.333 | 1.283 (21.7%) | 1.263 (23.9%) | 1.157 (2.2%) |
| junctionAngle (network) | 33.69 / 71.565 / 90 | 90 (39.4%) | 90 (36.1%) | 93.366 (52.8%) |
| segmentLength (network) | 17.314 / 21.485 / 30.243 | 21.828 (20%) | 22.799 (16.7%) | 25 (32.8%) |
| splitTileShare (water) | 0.393 / 0.554 / 0.65 | 0.555 (13.9%) | 0.583 (22.8%) | 0.511 (33.9%) |
| rejoinTileShare (water) | 0.37 / 0.529 / 0.636 | 0.544 (14.4%) | 0.577 (23.3%) | 0.514 (30.6%) |
| enclosedIslands (water) | 0 / 0 / 5 | 1 (5.6%) | 0 (0%) | 0 (3.3%) |
| stepLength (relief) | 1 / 1 / 1 | 1 (0%) | 1 (0%) | 1 (3.9%) |
| valleyWidth1 (relief) | 3 / 5 / 7 | 5 (7.2%) | 5 (21.7%) | 5 (5.6%) |
| valleyWidth2 (relief) | 5 / 9 / 12 | 8 (5.6%) | 9 (17.2%) | 5 (43.6%) |
| narrowingRatio (relief) | 0.1 / 0.25 / 0.6 | 0.111 (41.7%) | 0.188 (32.2%) | 0.25 (11.7%) |
| straightShare8 (naturalness) | 0.001 / 0.02 / 0.056 | 0.031 (7.2%) | 0.035 (13.3%) | 0.139 (98.3%) |
| longestRun (naturalness) | 9 / 12 / 16 | 15 (32.2%) | 14 (23.9%) | 28 (98.3%) |
| ridgeThicknessCV (naturalness) | 0.306 / 0.353 / 0.458 | 0.353 (3.3%) | 0.338 (6.1%) | 0.323 (38.3%) |
| ridgeHeightStd (naturalness) | 0 / 0 / 0.515 | 0.331 (15.6%) | 0 (0.6%) | 0 (0%) |
| basinRimThicknessCV (naturalness) | 0.244 / 0.419 / 0.475 | 0.365 (18.8%) | 0.298 (44.1%) | 0.184 (70.1%) |
| lakeShare (water) | 0 / 0.05 / 0.203 | 0.087 (12.8%) | 0.068 (8.3%) | 0.021 (33.3%) |
| lakes (water) | 0 / 1 / 2 | 2 (33.3%) | 2 (24.4%) | 1 (18.9%) |
| fallCount (water) | 0 / 1 / 4 | 7 (73.3%) | 3 (29.4%) | 3 (25%) |
| fallDrop (water) | 1 / 1.009 / 1.732 | 2.039 (86%) | 1.851 (59%) | 1.856 (79.1%) |
| fallSpacing (water) | 2.915 / 15.133 / 73.082 | 8.732 (2.9%) | 10.977 (12.6%) | 14.142 (15.8%) |
| damSites (water) | 0 / 6.1 / 14.04 | 12.82 (39.4%) | 8.54 (16.7%) | 6.1 (0%) |
| reservoirVolume (water) | 0 / 1264 / 4478 | 2943 (27.2%) | 1809 (13.3%) | 2483 (33.3%) |
| reservoirEfficiency (water) | 0 / 173.3 / 762.7 | 735.8 (49.4%) | 361 (33.3%) | 501.8 (33.9%) |
| damLength (water) | 2 / 8 / 13 | 4 (2.8%) | 4 (6.7%) | 4 (5.6%) |

Version 2 is the closest of the three to real terrain on relief (0.52; version 1 0.60, the current
generator 0.66) and on the height and slope histograms (0.27 and 0.07; version 1 0.42 and 0.09). Its
naturalness (0.95) is a little further than version 1's (0.82), and far closer than the current
generator's straight contours (2.98). It is further on water (1.67; version 1 1.14):
- more falls: a median of 7 a map against the real 1;
- taller falls: 2.0 levels against 1.0;
- more dam sites (13 against 6), and shorter ones.

That is what Timberborn maps and Kyler ask for: real terrain at 60 m a tile is gentle (steps of 2+
levels on 1.2% of edges). Junction angles stay wider than real (90° against 72°), as in version 1:
D8 channels meet square. The bench describes; it never gates (its README).

## 10. Determinism, exactness and parity

- **Exact arithmetic** (D15): the source audit of `v2/`'s output paths finds nothing but + − × ÷,
  square root, floor, round, abs, min and max. The output paths are the genome, field, levels,
  hydrology, settler, hazards, intentions, generate, terrain, narrows and cycle. The intention
  checks use no trigonometry: bends are measured with dot and cross products.
- **Same seed, same bytes**: 40 of 40 maps give the same bytes twice in one process and again in a
  fresh process: seeds 1–3 of every theme at 128², the ten brief maps, and seed 1 of every theme at
  96² and 256².
- **Both validators**: every map above is written with its project file and checked in the
  `generate` profile, with Kyler's start water rule and starting wood in place of `start.water` and
  `start.wood`. The Python oracle and the TypeScript validator re-read the files: 0 disagreements in
  1,720 checks compared (774, 430 and 516), and both pass all 40 maps. D85's old water rule would
  fail 5 of them; 5 of the 40 starts drink from another level.
- **Kyler's rules** hold on all 40: no dam wall, no edge wall, a mine site on every map, no spring
  inside a flow, and his start water and starting wood rules.
- **The runs model** is exact on every one (§8).
- **At the branch's tip** (0.7.0-proto2.2, after merging dev's #42 and #44), the same 40 maps
  again: each gives the same bytes twice and in a fresh process, both validators pass all 40 with
  0 disagreements in 1,800 checks, and Kyler's rules hold on all 40. Every map differs in its bytes
  from the ones above, and first attempts fall from 25 to 19 of the 40. Mostly the core's
  `water.source_in_flow` (D171) turns them down: it finds springs inside a flow that the
  prototype's own check lets through. M9a builds the hydrology to the core's definition.

## 11. Briefs, renders and sheets

- **Ten briefs** ([briefs/v2/](briefs/v2/), 01–10):
  - six themes at their default Verticality, 01–06, with Kyler's four intentions in 01 (a start under a cliff with water below), 02 (a snaking river), 03 (a crater gathering rivers) and 04 (a waterfall into a round lake);
  - three at Verticality 85 within 16, 07–09;
  - one with no intention, 10.

  Each brief has its terrain, the "how it plays" card (the start's water and how it is reached, the
  starting wood and the woods, with the wood still growing), and the exact model's cycle timeline
  (the worst of weather seeds 1729, 7 and 99). It also has the verified axes and the woods, the
  difficulty positions it suits, its intentions (emerged or dropped, each named) and a name from the
  names study.
- **The maps** ([out/v2/](out/v2/), with a README): each passes both validators in the `generate`
  profile with Kyler's start rules, has no dam wall or edge wall, and comes back byte for byte from
  its seed with 0.7.0-proto2.1 (commit 07da086).
- **Renders** ([renders/v2/](renders/v2/)): the app's own 3D view in the released clean look, at
  1600×900, from the default camera (the game's angle over the whole map) and from above.
- **Contact sheets**:
  - readable, one per theme: [docs/sheets/design-v2/](../../docs/sheets/design-v2/), seeds 1–30 at
    128² and a row at Verticality 85, drawn from above in the clean look at 2 px a tile, labelled;
  - the small committed record (D144), [docs/sheets/design-v2.png](../../docs/sheets/design-v2.png);
  - a local page, `C:\dgm-workshop\generative\v2\sheet.html`, with version 1, version 2 and
    Verticality 85 side by side (not committed).

## 12. What is short, and what would fix it

Plainly, against the targets. Scope is frozen (D189): each fix below is a proposal for M9a, M9b or
M9c, not a change to version 2.
1. **Islands maps look alike** (largest whole-map cluster 33.5%), and only 17% read fully as islands
   in a sea. One sea in the middle of every map fixed the sea and made the layouts alike. **M9b**:
   place the sea off-centre or elongated, or as two or three seas, and raise the share of land in
   islands (more, larger islands, a lower rim).
2. **Delta's largest cluster is 18%** and its no-approximation 14%; Lake Basin's 12%. **M9b**: draw
   Delta's water and one-level steps further from the workshop's middle.
3. **Two of Kyler's intentions emerge rarely**: the crater (26%) and the waterfall into a round lake
   (16%, and its forced maps cluster at 21%). **M9b**: steer the crater's rivers into the caldera
   (heads upstream of its rim), and taper the round lake's scarp.
4. **A good natural dam near the start is above the official band** in three themes (60% over all;
   the band is 26–56%): lake outlets are short dams. If Kyler wants it lower, lakes' outlets widen.
5. **First attempts** are 63% (version 1: 62.5–90.5%); Canyon is 49.5%, and at 99% final its seeds
   42 and 143 missed. **M9a**: a time budget (a new genome after about 3 s rather than planning again)
   and the simulation speedups (D130).
6. **A slow tail**: a map whose attempts keep failing waits long for its checked map. In the bench,
   Islands seed 2 at 256² took 41 s (5 attempts); under the batches' full load, 29% of maps at 128²
   took over 10 s. The page never stalls, since it shows each attempt's land at once. **M9a**: the
   time budget of item 5, and candidates in parallel workers.
7. **Above 16 was not built** here: the product's build clips at 16, so tall maps were measured
   before the build. **M9a** lifts the cap for Verticality 70+ (the probe confirmed such maps load,
   D172).
8. **The cheap cycle signature's badwater proxy tracks the exact exposure only moderately** (r 0.68),
   so the exact model keeps that part.
9. **The drought-aware preference barely moves** the share (53% against 52% off); requiring it costs
   finals in Islands and Canyon (#59).
10. **Not built** (for M9b and M9c): player and Claude controls for intentions (D138), tuning how
    close Variations stay, difficulty positions as a candidate preference, the fourteen candidate
    intentions (#66), and the resource rules' trees, clusters and ruins (from `feature/resources`).

## 13. Reproducing it

Local data goes to `C:\dgm-workshop\generative\` (`DGM_GENERATIVE` moves it); the batches' per-map
records stay there, out of git (D195). Run at commit 07da086 to get these numbers exactly; at the
branch's tip the maps differ (§10). On the shared machine v2-128's 1,200 maps took about an hour and
a half with 8 jobs, and the sets of 300 maps or fewer under an hour each.

```sh
npx tsx investigation/generative/v2/batch.ts --set v2-128 --seeds 1-200 --jobs 8
npx tsx investigation/generative/v2/batch.ts --set v2-128-vt85 --vt 85 --seeds 1-50 --jobs 8
npx tsx investigation/generative/v2/unlocked.ts --seeds 1-100
npx tsx investigation/generative/v2/batch.ts --set v2-128-i-snaking --intentions snaking-river --seeds 1-30 --jobs 8 --no-files   # and -i-crater, -i-cliff
npx tsx investigation/generative/v2/batch.ts --set v2-128-v100 --variety 100 --seeds 1-50 --jobs 8
npx tsx investigation/generative/v2/batch.ts --set v2-128-dreq --drought require --seeds 1-50 --jobs 8 --no-files
npx tsx investigation/generative/v2/batch.ts --set v2-128-doff --drought off --seeds 1-50 --jobs 8 --no-files
npx tsx investigation/generative/v2/batch.ts --set v2-96 --size 96 --seeds 1-30 --jobs 6    # and v2-192, v2-256
npx tsx investigation/generative/v2/batch.ts --set v1-128 --gen proto --seeds 1-200 --jobs 8
npx tsx investigation/generative/v2/batch.ts --set cur-128 --gen current --seeds 1-200 --jobs 8
npx tsx investigation/generative/sidecars.ts --dir v2-128          # openings and dam walls, per set
npx tsx investigation/generative/v2/woodaxis.ts --sets v1-128,cur-128          # wood and edge walls from their files
npx tsx investigation/generative/v2/woodaxis.ts --sets v2-128,v1-128,cur-128 --rebin   # after the woods cuts change
npx tsx investigation/generative/v2/refs.ts
npx tsx investigation/generative/v2/lakes.ts --sets v2-128,v1-128,cur-128 --refs --survey
npx tsx investigation/generative/v2/measures.ts --fresh --sets v2-128,v1-128,cur-128,v2-128-vt85,v2-128-v100,v2-128-i-snaking,v2-128-i-crater,v2-128-i-cliff
npx tsx investigation/generative/v2/measures.ts --sets v2-96,v2-192,v2-256,v2-128-dreq,v2-128-doff --light v2-96,v2-192,v2-256,v2-128-dreq,v2-128-doff
npx tsx investigation/generative/v2/simplay.ts --gen proto2 --seeds 1-15 --jobs 4
npx tsx investigation/generative/v2/simplay.ts --gen proto --seeds 1-15 --jobs 4
npx tsx investigation/generative/v2/simplay.ts --summary
npx tsx investigation/generative/v2/landscapes.ts --seeds 1-30
npx tsx investigation/generative/v2/narrows-check.ts --maps 8
npx tsx investigation/generative/v2/variations.ts --seeds 1-5
npx tsx investigation/generative/v2/bench.ts --sizes 128,256 --seeds 1-2
npx tsx investigation/generative/v2/export.ts
npx tsx investigation/generative/v2/render.ts
npx tsx investigation/generative/v2/sheet.ts
npx tsx investigation/generative/v2/sheets3d.ts
npx tsx investigation/generative/v2/check.ts --seeds 1-3 --sizes 128
npx tsx investigation/generative/v2/check.ts --maps <the ten brief maps> --sizes 128
npx tsx investigation/generative/v2/check.ts --seeds 1 --sizes 96,256
```

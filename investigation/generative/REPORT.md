# M9 design step, version 1: the prototype's numbers

**Design version 2's numbers are in [REPORT-v2.md](REPORT-v2.md)**; this report stays as version 1
left it.

The numbers behind [docs/m9-design.md](../../docs/m9-design.md) (design version 1): a prototype
generator that invents by composition and emergence, measured against the current generator
(`m8-done`, 0.6.0) on the design's measures. Kyler approves design version 2, not this one; this
version shows whether the direction holds and what it still misses.

**Machine and conditions.** Kyler's machine: AMD Ryzen 7 9800X3D (8 cores, 16 threads), Node
24.13.0, the installed Chrome. The machine was shared with other long jobs throughout (other agents'
investigations), so wall times are inflated; §5 gives CPU time beside wall time.

## Summary

| Measure | Target | Prototype, run 2 (Variety 70) | Baseline (m8-done) | M9 plan (River Valley + recipes) |
|---|---|---|---|---|
| M1 no clones | every map ≥ 0.25 from its nearest seed, median ≥ 0.40 | min 0.33–0.38, median 0.42–0.47: **pass in 6 of 6** | min 0.04–0.16, median 0.06–0.22: fail in 6 of 6 | min 0.04, median 0.15: fail |
| M2 no archetypes: whole maps | no cluster over 15% | largest 11.5–68%: **fail in 5 of 6** (pass: Lake Basin); at Variety 100: River Valley 14%, Delta 17% | 100%: fail in 6 of 6 | 100%: fail |
| M2 river networks | no cluster over 15%; many shapes | largest 8–20% (pass in 5 of 6); 108–137 distinct codes | largest 42.5–100%; 4–25 codes | – |
| M2 relief | no cluster over 15%; many shapes | largest 2–5% (pass in 6 of 6); 12–49 distinct codes | largest 9–29.5%; 6–14 codes | – |
| M3 play variety: openings | no cluster over 15%; the spread | largest 2–7.5%: **pass in 6 of 6**; spread 0.68–0.84 | largest 21.5–64.5%: fail in 6 of 6; spread 0.34–0.56 | largest 13.9%, spread 0.70 |
| M4 no approximation | every map ≥ 0.591 from every workshop map | min 0.47–0.56; 4–40 maps below per theme: **fail in 6 of 6** | min 0.58–0.68; fail in 2 of 6 | min 0.59: pass |
| M5 good natural dam site within 40 tiles | comparable to official (36.4%; workshop 46.3%): 26–56% | 47.9% over all six: **pass**; by theme 27–73.5% (4 of 6 within) | 60% over all six; by theme 0–100% | 75.8% |
| M6 built dam walls | zero | **0 of 1,200**, and 0 of 540 at other sizes (in the generate loop the check rejected 10 attempts; those seeds drew another genome) | 765 of 1,200 (River Valley, Canyon, Highlands, Delta) | 298 of 310 |
| M7 storage possible | a guard | 100% | 99–100% | – |
| M8 batches, 128² | ≥ 98% final | **100% final**, first attempt 62.5–90.5% (all sizes: 100% final; first attempt below 60% in two cells, §2) | 100% final, first 96–100% | – |
| Score (median) | – | 41–49 | 31–51 | – |
| Simulated play (seeds 1–30) | maps play differently | cycle nearest-peer median 0.031–0.084 (baseline 0.000–0.021); strategy-axes largest joint signature 3.3–6.7% (baseline 10–30%) | | |

## 1. The prototype

`investigation/generative/proto/` (no `src/` change): a genome drawn from each theme's prior
(`genome.ts`), an uplift field of parts over warped noise (`field.ts`), stream-power erosion
(`erode.ts`), levels (`levels.ts`), rivers from the drainage with lakes, falls, pools, splits and
deltas (`hydro.ts`), the settler (`start.ts`), badwater in natural hollows (`hazards.ts`) and
`water.storage_possible` (`storage.ts`), then the product's own map objects, resources, build,
writer and validators (`generate.ts`). The terrain reaches the build as sculpt edits over the planned
features (design §12 says what the real code does instead). Six themes, each a prior over the same
parameters, at Variety 70 (the planned default).

**Two runs.** Run 1 (`0.7.0-proto.1`) was measured in full first. Its dam-wall check flagged 16 of
its 1,200 maps: crater rims and ridges that came out thin, flat on top and cliff-faced, and tops
cut flat at level 16 where rivers crossed them. None was built as a dam, but a player could not tell
them from one, so run 2 (`0.7.0-proto.2`) changed the generator, not the check: rims and ridges now
rise and fall and swell along their length with sloping flanks, the land bends toward level 16
instead of being cut flat there, and regional slopes are gentler, with more noise and one part more
(to widen whole-map variety, which run 1 missed). The measures did not change between runs. The
tables are run 2's; §8 sets run 1 beside it (`measures-proto1.json`, `simplay-proto1.json`).

## 2. Batch pass rates

200 seeds per theme at 128², 30 per theme at 96², 192² and 256², Normal. A map passes when the real
validators pass in the `generate` profile, `water.storage_possible` holds and the dam-wall check
finds no wall (run 1 had no wall check in the loop). A retry draws a new genome (a new map from the
same seed), up to 12 attempts. Cells: first attempt / final (maps); `proto` is run 2, `proto1` run
1 and `current` the baseline.

| Set | River Valley | Canyon | Highlands | Lake Basin | Delta | Islands |
| --- | --- | --- | --- | --- | --- | --- |
| proto-96 | 86.7% / 100% (30) | 56.7% / 100% (30) | 86.7% / 100% (30) | 66.7% / 100% (30) | 96.7% / 100% (30) | 83.3% / 100% (30) |
| proto-128 | 87% / 100% (200) | 62.5% / 100% (200) | 86% / 100% (200) | 75% / 100% (200) | 90.5% / 100% (200) | 89.5% / 100% (200) |
| proto-128-v100 | 86.5% / 100% (200) | – | – | – | 90.5% / 100% (200) | – |
| proto-192 | 86.7% / 100% (30) | 73.3% / 100% (30) | 80% / 100% (30) | 80% / 100% (30) | 93.3% / 100% (30) | 83.3% / 100% (30) |
| proto-256 | 66.7% / 100% (30) | 70% / 100% (30) | 90% / 100% (30) | 53.3% / 100% (30) | 86.7% / 100% (30) | 66.7% / 100% (30) |
| proto1-96 | 56.7% / 100% (30) | 70% / 100% (30) | 90% / 100% (30) | 90% / 100% (30) | 76.7% / 100% (30) | 76.7% / 100% (30) |
| proto1-128 | 82.5% / 100% (200) | 63.5% / 100% (200) | 90.5% / 100% (200) | 79.5% / 100% (200) | 92.5% / 100% (200) | 92% / 100% (200) |
| proto1-192 | 80% / 100% (30) | 76.7% / 100% (30) | 80.8% / 100% (26) | – | – | – |
| proto1-256 | 76.7% / 100% (30) | 63.3% / 100% (30) | 90.9% / 100% (11) | – | – | – |
| current-96 | 100% / 100% (30) | 100% / 100% (30) | 90% / 100% (30) | 100% / 100% (30) | 100% / 100% (30) | 100% / 100% (30) |
| current-128 | 99.5% / 100% (200) | 100% / 100% (200) | 96% / 100% (200) | 100% / 100% (200) | 99% / 100% (200) | 100% / 100% (200) |
| current-192 | 100% / 100% (30) | 100% / 100% (30) | 93.3% / 100% (30) | 100% / 100% (30) | 100% / 100% (30) | 100% / 100% (30) |
| current-256 | 100% / 100% (30) | 100% / 100% (30) | 100% / 100% (30) | 100% / 100% (30) | 96.7% / 100% (30) | 96.7% / 100% (30) |

How the build reaches ≥ 98% final with a first attempt ≥ 60%: design §14.

## 3. The measures

Definitions in design §10, written and committed before any was run on the prototype. Workshop
references (aggregates, in `measures.json`): the variety nearest-peer p10 0.591 and median 0.671 over
the 130 workshop maps; the river, relief and opening scales and cuts. On its own measures the
workshop's largest whole-map cluster is 1.5% (125 clusters of 130 maps) and its largest opening
cluster 2.6% (75 clusters of the 78 workshop and official maps whose start can be measured). The
dam-wall check flags 0 of the 19 official maps and 2 of the 130 workshop maps (those two were not
looked at further: they are other creators' maps).

### M1 no clones (nearest other seed of the theme, variety scale)

| Theme | Prototype min | Prototype median | Pass | Baseline min | Baseline median | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| River Valley | 0.33 | 0.44 | pass | 0.11 | 0.16 | **fail** |
| Canyon | 0.33 | 0.45 | pass | 0.04 | 0.06 | **fail** |
| Highlands | 0.36 | 0.47 | pass | 0.14 | 0.21 | **fail** |
| Lake Basin | 0.38 | 0.48 | pass | 0.11 | 0.16 | **fail** |
| Delta | 0.34 | 0.42 | pass | 0.09 | 0.15 | **fail** |
| Islands | 0.35 | 0.45 | pass | 0.16 | 0.22 | **fail** |

### M2 no archetypes (largest cluster's share of the theme; clusters; distinct coarse codes)

| Theme | Whole maps: prototype | baseline | River networks: prototype | baseline | Relief: prototype | baseline |
| --- | --- | --- | --- | --- | --- | --- |
| River Valley | 46.5% (30) | 100% (1) | 8% (58; 137 codes) | 100% (1; 9 codes) | 2.5% (129; 35 codes) | 29.5% (21; 7 codes) |
| Canyon | 26% (34) | 100% (1) | 8% (60; 125 codes) | 100% (1; 4 codes) | 2% (153; 42 codes) | 28.5% (16; 10 codes) |
| Highlands | 29% (36) | 100% (1) | 20% (61; 122 codes) | 53.5% (11; 25 codes) | 2% (151; 49 codes) | 9% (49; 14 codes) |
| Lake Basin | 11.5% (36) | 100% (1) | 8% (62; 126 codes) | 42.5% (16; 6 codes) | 3.5% (122; 24 codes) | 20.5% (34; 11 codes) |
| Delta | 68% (19) | 100% (1) | 11% (61; 108 codes) | 93% (3; 12 codes) | 5% (97; 16 codes) | 24% (21; 6 codes) |
| Islands | 55.5% (30) | 100% (1) | 8.5% (47; 136 codes) | 100% (1; 8 codes) | 4.5% (84; 12 codes) | 18.5% (24; 9 codes) |

### M3 openings (largest cluster's share; clusters; spread = mean pairwise opening distance, workshop pair = 1)

| Theme | Prototype largest | clusters | spread | Baseline largest | clusters | spread |
| --- | --- | --- | --- | --- | --- | --- |
| River Valley | 2.5% | 153 | 0.83 | 21.5% | 41 | 0.55 |
| Canyon | 5.5% | 132 | 0.79 | 55% | 11 | 0.38 |
| Highlands | 2% | 161 | 0.84 | 21.5% | 46 | 0.56 |
| Lake Basin | 3% | 145 | 0.77 | 64.5% | 6 | 0.35 |
| Delta | 4% | 117 | 0.74 | 52.5% | 5 | 0.35 |
| Islands | 7.5% | 96 | 0.68 | 48.5% | 7 | 0.34 |

### M4 no approximation (distance to the nearest workshop map; floor 0.59)

| Theme | Prototype min | p10 | median | maps below | Baseline min | p10 | median | maps below |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| River Valley | 0.49 | 0.57 | 0.64 | 40 | 0.59 | 0.64 | 0.68 | 0 |
| Canyon | 0.49 | 0.59 | 0.67 | 18 | 0.58 | 0.62 | 0.63 | 5 |
| Highlands | 0.52 | 0.57 | 0.65 | 31 | 0.59 | 0.65 | 0.69 | 0 |
| Lake Basin | 0.47 | 0.62 | 0.69 | 8 | 0.67 | 0.70 | 0.73 | 0 |
| Delta | 0.51 | 0.57 | 0.64 | 33 | 0.58 | 0.60 | 0.63 | 5 |
| Islands | 0.56 | 0.66 | 0.71 | 4 | 0.68 | 0.73 | 0.78 | 0 |

### M5 a good natural dam site within 40 tiles of the start (a dam of ≤ 5 tiles holds 380 blocks); workshop 46.3%, official 36.4%

| Theme | Prototype ≤ 5 tiles | ≤ 12 tiles | any length | Baseline ≤ 5 tiles | ≤ 12 tiles | any length |
| --- | --- | --- | --- | --- | --- | --- |
| River Valley | 41.5% | 64% | 69.5% | 78% | 94.5% | 94.5% |
| Canyon | 33% | 64% | 72.5% | 100% | 100% | 100% |
| Highlands | 55% | 74% | 78% | 83% | 94.5% | 96% |
| Lake Basin | 57.5% | 71% | 75.5% | 2.5% | 74.5% | 92.5% |
| Delta | 27% | 48% | 57% | 96.5% | 99% | 99% |
| Islands | 73.5% | 82% | 85% | 0% | 52% | 78% |
| All six | 47.9% |  |  | 60% |  |  |

### M6 dam walls, M7 storage possible, score (median, p10–p90)

| Theme | Prototype walls | Baseline walls | Prototype storage | Baseline storage | Prototype score | Baseline score |
| --- | --- | --- | --- | --- | --- | --- |
| River Valley | 0 of 200 | 198 of 200 | 100% | 100% | 47 (35–55) | 40 (33–46) |
| Canyon | 0 of 200 | 170 of 200 | 100% | 100% | 49 (37–59) | 31 (26–38) |
| Highlands | 0 of 200 | 197 of 200 | 100% | 99% | 49 (37–60) | 51 (45–57) |
| Lake Basin | 0 of 200 | 0 of 200 | 100% | 100% | 41 (30–50) | 41 (36–47) |
| Delta | 0 of 200 | 200 of 200 | 100% | 100% | 42 (33–51) | 40 (35–45) |
| Islands | 0 of 200 | 0 of 200 | 100% | 100% | 42 (32–51) | 40 (36–44) |

### Shape medians (prototype / baseline)

| Theme | Height range | Flat share | Water share | Falls | Tallest fall | Plateaus | Steps in straight runs of 8+ | Longest straight run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| River Valley | 9 / 11 | 0.53 / 0.65 | 0.09 / 0.07 | 2 / 2 | 3.84 / 1.90 | 5 / 7 | 0.04 / 0.12 | 14 / 27 |
| Canyon | 11 / 11 | 0.56 / 0.73 | 0.07 / 0.04 | 2 / 4 | 3.61 / 1.96 | 7 / 3 | 0.02 / 0.37 | 13 / 30 |
| Highlands | 10 / 14 | 0.53 / 0.60 | 0.09 / 0.08 | 4 / 6 | 5.00 / 5.87 | 6 / 9 | 0.03 / 0.11 | 14 / 24 |
| Lake Basin | 7 / 10 | 0.57 / 0.73 | 0.12 / 0.27 | 1 / 1 | 2.00 / 3.86 | 6 / 6 | 0.05 / 0.15 | 15 / 25 |
| Delta | 7 / 10 | 0.64 / 0.62 | 0.11 / 0.09 | 1 / 0 | 1.93 / 0.92 | 5 / 10 | 0.04 / 0.13 | 14 / 34 |
| Islands | 7 / 10 | 0.55 / 0.73 | 0.21 / 0.34 | 1 / 1 | 1.89 / 2.15 | 8 / 10 | 0.04 / 0.14 | 13 / 28 |

### Flow directions (prototype, share of maps whose water leaves toward each side)

- River Valley: NE 15.5%, E 14.5%, SE 12%, W 12%, N 12%, S 11.5%, SW 11.5%, NW 10%, local 1%
- Canyon: SW 15.5%, SE 15.5%, E 12.5%, NW 12%, N 11%, NE 11%, W 10%, S 9%, local 3.5%
- Highlands: NE 16%, SE 13%, NW 13%, W 12.5%, SW 12.5%, N 11.5%, S 9.5%, E 7.5%, local 4.5%
- Lake Basin: W 15%, SE 15%, N 13.5%, SW 13%, E 11%, NE 10%, S 9%, NW 9%, local 4.5%
- Delta: N 16.5%, S 15.5%, NE 12.5%, SW 11.5%, E 11%, SE 11%, NW 11%, W 10%, local 1%
- Islands: W 17.5%, S 15.5%, SW 14%, SE 14%, NE 13%, E 9.5%, N 8.5%, NW 7%, local 1%

### Plateaus, flat share and height range by size (medians; prototype / baseline)

| Size | River Valley | Canyon | Highlands | Lake Basin | Delta | Islands |
| --- | --- | --- | --- | --- | --- | --- |
| 96² | 4 pl, 0.48 flat, 10 lv / 6 pl, 0.55 flat, 11 lv | 4 pl, 0.52 flat, 12 lv / 3 pl, 0.63 flat, 13 lv | 4 pl, 0.51 flat, 11 lv / 6 pl, 0.50 flat, 14 lv | 4 pl, 0.51 flat, 7 lv / 5 pl, 0.69 flat, 10 lv | 4 pl, 0.58 flat, 7 lv / 10 pl, 0.51 flat, 10 lv | 5 pl, 0.55 flat, 7 lv / 8 pl, 0.68 flat, 10 lv |
| 128² | 5 pl, 0.54 flat, 10 lv / 7 pl, 0.65 flat, 11 lv | 7 pl, 0.54 flat, 12 lv / 3 pl, 0.73 flat, 11 lv | 6 pl, 0.53 flat, 10 lv / 9 pl, 0.62 flat, 13 lv | 6 pl, 0.57 flat, 7 lv / 6 pl, 0.73 flat, 10 lv | 5 pl, 0.64 flat, 7 lv / 10 pl, 0.62 flat, 10 lv | 7 pl, 0.57 flat, 6 lv / 10 pl, 0.73 flat, 10 lv |
| 192² | 10 pl, 0.59 flat, 9 lv / 8 pl, 0.76 flat, 11 lv | 13 pl, 0.59 flat, 11 lv / 3 pl, 0.82 flat, 11 lv | 11 pl, 0.58 flat, 9 lv / 11 pl, 0.73 flat, 14 lv | 10 pl, 0.62 flat, 7 lv / 6 pl, 0.81 flat, 10 lv | 8 pl, 0.69 flat, 6 lv / 12 pl, 0.73 flat, 10 lv | 16 pl, 0.58 flat, 7 lv / 15 pl, 0.77 flat, 10 lv |
| 256² | 11 pl, 0.62 flat, 8 lv / 9 pl, 0.82 flat, 11 lv | 14 pl, 0.65 flat, 11 lv / 5 pl, 0.86 flat, 11 lv | 13 pl, 0.60 flat, 10 lv / 13 pl, 0.79 flat, 14 lv | 12 pl, 0.61 flat, 7 lv / 9 pl, 0.84 flat, 10 lv | 10 pl, 0.73 flat, 6 lv / 14 pl, 0.79 flat, 10 lv | 16 pl, 0.59 flat, 7 lv / 17 pl, 0.82 flat, 10 lv |

### The current M9 plan: River Valley with the study's recipes as premises (310 maps: 200 seeds and 110 recipe maps)

- M1: nearest other map min 0.04, median 0.15 (**fail**); M2 whole maps: largest cluster 100% (1 cluster); M3 openings: largest 13.9%, spread 0.70; M4: min 0.59 (pass); M5: 75.8%; M6: 298 of 310 flagged.

### Variety 100 (Surprise me), 200 seeds each at 128²

| Theme | M1 min / median | M2 whole maps: largest | M2 rivers | M2 relief | M4 min, maps below |
|---|---|---|---|---|---|
| River Valley | 0.34 / 0.47 | 14% (55 clusters) | 5% | 2.5% | 0.48, 43 |
| Delta | 0.35 / 0.45 | 17% (37 clusters) | 9% | 4.5% | 0.50, 33 |


## 4. Simulated play (gate 1b)

The cycles branch (PR #10) and the mechanics branch (PR #9) both finished during this step, so both
are used, read only (`simplay.ts`): the cycles study's eleven-value signature through the first
Normal drought, a later Hard drought and the first badtide, with its own distance and fixed groups;
and the mechanics study's eight strategy axes with its own fixed bins and joint signature. Seeds 1–30
per theme (each simulation takes 15–60 s a map on this loaded machine), the two studies' own
baseline size. The baseline's numbers are the two studies' own committed results for the same seeds
(the same code on the same maps: both branch from `m8-done`).

| Theme | Cycle: nearest-peer median (proto / base) | largest group | groups | Water kept after the Hard drought (proto) | (base) | Axes: nearest-peer median | largest joint signature | signatures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| River Valley | 0.0312 / 0.0126 | 43.3% / 73.3% | 9 / 2 | 0%–35.5% | 5.8%–12% | 0.0833 / 0 | 3.3% / 10% | 30 / 20 |
| Canyon | 0.0344 / 0 | 53.3% / 100% | 6 / 1 | 0%–22.7% | 0%–0% | 0.1042 / 0 | 6.7% / 30% | 29 / 9 |
| Highlands | 0.0608 / 0.0214 | 30% / 50% | 12 / 4 | 0%–58.5% | 0%–12% | 0.125 / 0 | 3.3% / 13.3% | 30 / 19 |
| Lake Basin | 0.0836 / 0.0162 | 23.3% / 66.7% | 17 / 2 | 0%–76.1% | 48.8%–50.7% | 0.125 / 0 | 3.3% / 30% | 30 / 10 |
| Delta | 0.0458 / 0.0093 | 36.7% / 66.7% | 7 / 4 | 0%–22.1% | 0%–6.9% | 0.0625 / 0 | 6.7% / 23.3% | 29 / 13 |
| Islands | 0.0673 / 0.0096 | 20% / 63.3% | 15 / 2 | 0.3%–46.8% | 48.3%–49.2% | 0.125 / 0 | 6.7% / 20% | 28 / 15 |

What it shows: the prototype's maps behave differently through the weather, not only look
different. On the cycles study's own distance, a prototype map's nearest peer is 2.5–7 times as far
as a current map's (in Canyon every current map behaves alike: distance 0). The study's coarse
groups split each theme into 6–17 groups where the current generator makes 1–4, and the largest
group holds 20–53% of a theme instead of 50–100%. On the mechanics axes nearly every prototype map
has a joint signature of its own (28–30 of 30 per theme, the largest shared by 3–7%), where the
current generator repeats 9–20 signatures (the largest 10–30%). The water a map keeps through a
26-day Hard drought ranges from 0 up to 22–76% within one prototype theme, where each current theme
sits in one narrow band.

What it does not show yet: the cycle groups are still above 15% in every theme. Their bins are
coarse, and most river starts lose pumpable water within a day of any drought (sources stop and
rivers drain, a rule of the game that no land shape changes); what differs is how much the land
keeps and where. Version 2 runs 200 seeds and several weather seeds, and decides how the signature
joins the opening clustering.

## 5. Budgets

The budgets (design §13): a whole generation of 128² in under 3 s; at 256², K = 3 candidates in
20 s or less, so about 6 s a candidate. `bench.ts` times one candidate per theme for seeds 1 and 2
and reports the slower of the two: every attempt until one passes, then validation and the writer.
Node gives wall and CPU time; Chrome runs the same code bundled into a page with the harness of
`tests/e2e/water.spec.ts` (Playwright, the installed Chrome) and gives wall time and the renderer's
task time. The machine was fully loaded by other jobs throughout. Chrome's task time tracks its wall
time, so it carries the load too; Node's CPU time is the closest to an idle machine.

Seconds, the slower of seeds 1 and 2; "attempts" are the prototype's, seed 1 and seed 2 (the current
generator passed every one on its first attempt).

| Theme | Size | Attempts | Chrome, prototype | Chrome, current | Node CPU, prototype | Node CPU, current | Node wall, prototype | Node wall, current |
|---|---|---|---|---|---|---|---|---|
| River Valley | 128² | 1, 1 | 1.4 | 0.9 | 2.7 | 1.5 | 4.2 | 2.2 |
| Canyon | 128² | 5, 1 | 6.1 | 0.4 | 8.1 | 1.0 | 15.0 | 2.1 |
| Highlands | 128² | 1, 1 | 1.3 | 1.2 | 1.3 | 1.6 | 3.0 | 3.0 |
| Lake Basin | 128² | 1, 1 | 2.6 | 1.1 | 2.9 | 1.7 | 6.8 | 3.3 |
| Delta | 128² | 1, 1 | 1.8 | 1.1 | 2.1 | 1.1 | 4.7 | 2.7 |
| Islands | 128² | 1, 1 | 2.0 | 2.2 | 2.3 | 2.9 | 5.3 | 5.5 |
| River Valley | 256² | 2, 1 | 13.1 | 3.7 | 15.5 | 4.3 | 28.5 | 8.1 |
| Canyon | 256² | 2, 1 | 15.0 | 1.9 | 16.5 | 2.0 | 29.3 | 4.3 |
| Highlands | 256² | 1, 1 | 6.7 | 5.2 | 7.0 | 5.4 | 12.0 | 12.1 |
| Lake Basin | 256² | 1, 1 | 9.3 | 4.2 | 10.3 | 4.9 | 19.6 | 10.0 |
| Delta | 256² | 1, 1 | 9.7 | 6.7 | 10.5 | 7.3 | 18.6 | 14.0 |
| Islands | 256² | 1, 1 | 19.2 | 7.1 | 22.0 | 8.1 | 45.5 | 19.0 |

**Against the budgets.** At 128² the prototype's one-attempt maps take 1.3–2.6 s in Chrome, under
the 3 s budget, against 0.4–2.2 s for the current generator; Canyon's seed 1 needed 5 attempts and
took 6.1 s. At 256² it misses the 6 s: 6.7 s (Highlands) to 19.2 s (Islands) for one attempt, and
13–15 s for River Valley's and Canyon's two attempts, against 1.9–7.1 s for the current generator.
So the prototype meets the 128² budget only on a first attempt, and is up to about three times
over at 256².

**Where the time goes.** Median stage times of the batches' one-attempt maps (the same loaded
machine, several workers at once; 981 maps at 128², 130 at 256²):

| Stage | 128² | 256² |
|---|---|---|
| The field: genome, uplift, erosion, levels | 0.5 | 1.3 |
| Hydrology: rivers, lakes, falls, splits, deltas | 0.1 | 0.3 |
| First build and settle (for the settler) | 1.6 | 5.2 |
| The settler | 0.1 | 0.6 |
| Hazards (with a rebuild and settle) | 1.0 | 4.1 |
| Map objects | 0.1 | 0.7 |
| Resources and the final build | 0.4 | 1.6 |
| Validation | 0.6 | 0.9 |
| Storage check, dam-wall check and writer | 0.2 | 0.4 |
| Sum of the medians | 4.7 | 14.9 |

The processes themselves are cheap: the field and the hydrology take 0.6 s at 128² and 1.5 s
at 256². The two settles before the final build take 57% and 62% of an attempt. That is
where the real generator saves (design §13): it plans the badwater hollow on the first settle's
drainage instead of settling again, caps lake area by the water budget, and raises the
first-attempt rate so fewer maps pay for a retry. The canonical settle's own budget (0.6 s at 128²,
3 s at 256²) was not timed apart from its build here; the first-build stage, which
contains it, is above both on this loaded machine.

## 6. Determinism, exactness and parity

- **Exact arithmetic** (D15): `check.ts` audits the prototype's source for anything but + − × ÷,
  square root, floor, round, abs, min and max on output paths (no sin, cos, exp, log, pow, atan2,
  hypot, random or clock): none found. Oriented parts use the deterministic sine (`detmath.ts`),
  noise the product's integer-hash value noise, and heaps break ties by index.
- **Same seed, same bytes**: seeds 1–5 of every theme at 128² (30 maps), seed 1 of every theme at
  96², 192² and 256² (18 maps) and the ten playable maps: every one gives the same bytes twice in
  one process and once more in a fresh process (58 of 58).
- **Both validators**: the same maps are written with their project file and checked in the
  `generate` profile by the Python oracle (`prototype/validate.py`) and by the TypeScript validator
  re-reading the files. At 128²: 30 maps, 1,290 checks compared, 0 disagreements, and TypeScript
  passes 30 of 30. At 96², 192² and 256²: 18 maps, 774 checks, 0 disagreements, and TypeScript
  passes 18 of 18. The ten playable maps: 430 checks, 0 disagreements, and both validators pass
  all ten.
- The ten playable maps come back byte for byte from their seeds (`out/index.json`).

## 7. Renders, playable maps and briefs

- Ten playable maps in [out/](out/), with their seeds and how each plays; picked for variety (half
  shape and numbers, half opening), not score.
- One brief per map in [briefs/](briefs/): terrain, the "how it plays" card, the cycle timeline and the
  strategy axes.
- Small renders of the ten (top-down, north up; 3D from the south-east) in [renders/](renders/). The
  batches, renders and per-map numbers stay local (`C:\dgm-workshop\generative\`).
- The blind rating page was dropped: Kyler's new gate makes it optional and it decides nothing, and it
  had not been started when the gate changed. `approve.ts` was not written for the same reason.

## 8. Run 1 beside run 2

| Measure | Run 1 (proto.1) | Run 2 (proto.2) |
|---|---|---|
| M1 median (min) | 0.35–0.47 (0.26–0.37) | 0.42–0.47 (0.33–0.38) |
| M1 themes passing | 5 of 6 (Delta median 0.35) | 6 of 6 |
| M2 whole maps, largest cluster | River Valley 68%, Canyon 23.5%, Highlands 37.5%, Lake Basin 25%, Delta 94.5%, Islands 72% | River Valley 46.5%, Canyon 26%, Highlands 29%, Lake Basin 11.5%, Delta 68%, Islands 55.5% |
| M2 rivers / relief, largest | 6–16.5% / 1.5–7% | 8–20% / 2–5% |
| M3 openings, largest | 2.5–11% | 2–7.5% |
| M4 maps below the floor | River Valley 60, Canyon 19, Highlands 39, Lake Basin 7, Delta 86, Islands 2 | River Valley 40, Canyon 18, Highlands 31, Lake Basin 8, Delta 33, Islands 4 |
| M5 over all six | 49.7% | 47.9% |
| M6 walls | 16 of 1,200 | 0 of 1,200 |
| Height range, median | 7–11 levels | 7–11 levels |
| Score median | 40–50 | 41–49 |
| Cycle nearest-peer median | 0.031–0.074 | 0.031–0.084 |

## 9. What failed, and what would fix it

Plainly, against the targets (run 2 at Variety 70 unless said):

1. **M2 whole maps fails in 5 of 6 themes** (largest cluster 26–68%; Lake Basin passes at 11.5%).
   Within one theme the coarse layout (height rank under the 8 symmetries) and the numbers stay closer
   than workshop maps do, so average-linkage clusters at the workshop's p10 cut still merge. Evidence
   of the fix: at Variety 100 River Valley passes (14%) and Delta nearly does (17%, from 68%). What
   would fix it at the default: wider theme priors (every part in every theme at some weight, relief
   and water budgets drawn wider, several basins or rivers as often as one), or Kyler deciding that
   the default Variety is higher. Not changed here.
2. **M2 river networks: Highlands 20%** (springs-only networks look alike). Fix: vary inflows against
   springs more in its prior.
3. **M4 no approximation fails in every theme**: 4–40 maps per theme (of 200) come within 0.591 of
   some workshop map; the closest is 0.47. No workshop map is used anywhere in generation. The
   prototype's numbers (flat share, water, relief, resources) sit nearer the workshop's than the
   current generator's do, so some maps land near one on the variety scale. The floor is the
   workshop's own p10, so 10% of workshop maps fail it against the others; the prototype puts 2–20%
   of a theme below it. What would fix it: (a) prefer, among the K candidates, the one farthest from
   the workshop, which needs the workshop's signatures at generation time and so cannot ship (it
   could run only as the local milestone check); (b) push the numbers away from the workshop's
   dense middle, which trades against its playability range; (c) Kyler sets the floor as a share
   (for example: at most 10% of maps below the workshop's p10, as the workshop itself). Not changed
   here.
4. **M5 by theme**: Lake Basin 57.5% and Islands 73.5% are above the 26–56% band (a lake's natural
   outlet is often a short dam); Delta 27% is at its bottom. Over all six themes 47.9%, within the
   band. If the band applies per theme, Lake Basin and Islands would widen their outlets.
5. **Relief is lower than the official maps'**: height range medians 7–11 levels in both runs
   (official 13, workshop 14; the current generator 10–14). The relief draws and the p2–p98 stretch
   keep most land within a narrow band. Fix: draw relief higher and let tall parts reach 15–16
   without flattening (#37).
6. **#21 is only half met**: 10–16 plateaus at 256² (official large and max maps 26–27), and the flat
   share still grows with size (River Valley 0.48 at 96² to 0.62 at 256²), though much less than the
   current generator's (0.55 to 0.82). Fix: part counts in proportion to the area, not its square
   root; more plateau and mesa parts on large maps.
7. **First attempts below 60%** (the premise gate's floor) in two cells: Canyon 56.7% at 96² and
   Lake Basin 53.3% at 256²; Canyon at 128² is just above (62.5%). Finals are 100% everywhere.
   Canyon's failed attempts at 128² mostly have no storage near the start (103 of 128) or no start
   at all (48); Lake Basin's at 256² lack clean water (8 of 18), storage (7) or a settle in time
   (6). An attempt can fail several checks. Design §14 lists the planner fixes.
8. **Not built**: the poisoned stream from an edge (in the genome, it falls back to a hollow),
   meanders and oxbows, and the settler's steering for Easy (Reservoir help as a preference).

## 10. The Codex investigations

- `investigation/cycles`: PR #10 finished during this step (1a8eba2). Used read only: the cycle
  signature (§4) and each brief's cycle timeline. It is not yet part of the opening vector's
  clustering: no workshop map has a signature to scale it on. Version 2 decides how it joins.
- `investigation/mechanics`: PR #9 finished during this step (bb394cc). Used read only: the eight
  strategy axes (§4) and each brief's axes. Its proposals for the genome and the settler are
  version-2 inputs. PR #11 (`investigation/mechanics-verified`, 0e688f9) was opened after these
  simulations ran and supersedes #9: it checks the open facts against the game code and changes the
  power axis to water-wheel flow (its measurement version 3). The axes here are #9's (version 2);
  version 2 of the design re-runs them with #11's.
- `investigation/landscapes`: no branch or PR when this step ended (2026-09-25): a version-2 input.

## 11. Reproducing it

Local data goes to `C:\dgm-workshop\generative\` (set `DGM_GENERATIVE` to move it); nothing there
is committed. `measures.ts` and `sidecars.ts --workshop` read the workshop maps from
`C:\dgm-workshop` (`DGM_WORKSHOP`). `DGM_PRIORITY=normal` runs the tools at normal priority (the
default is below normal).

```sh
npx tsx investigation/generative/batch.ts --gen proto --themes riverValley --seeds 1-200 --size 128
npx tsx investigation/generative/batch.ts --gen current --seeds 1-200 --size 128
npx tsx investigation/generative/sidecars.ts --workshop
npx tsx investigation/generative/sidecars.ts --dir proto-128
npx tsx investigation/generative/sidecars.ts --dir current-128
npx tsx investigation/generative/sidecars.ts --path C:/dgm-workshop/recipes
npx tsx investigation/generative/measures.ts
npx tsx investigation/generative/simplay.ts --gen proto --seeds 1-30
npx tsx investigation/generative/simplay.ts --summary
npx tsx investigation/generative/check.ts --seeds 1-5 --sizes 128
npx tsx investigation/generative/check.ts --seeds 1 --sizes 96,192,256
npx tsx investigation/generative/check.ts --maps riverValley:18,canyon:8 --sizes 128
npx tsx investigation/generative/bench.ts --sizes 128,256 --seeds 1-2
npx tsx investigation/generative/export.ts
npx tsx investigation/generative/tables.ts
```

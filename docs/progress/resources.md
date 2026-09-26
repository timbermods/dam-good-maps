# Resources like the official maps

**Built** on branch `feature/resources`, from Kyler's four decisions of 2026-09-25 (metal on every
map; tree counts roughly like the official maps; resources in clusters; ruins that look and vary like
the official maps; D167–D170). Kyler approved it ("look much better") and it merges after the start
and edge rules (#44). Generated maps change: generator **0.6.2** (0.7.0 stays for M9a), and old
share links (0.6.0, 0.6.1) open with the note that the map may differ.

## The official baselines

`tools/official-baselines.ts` measures the official maps (read from the local
`investigation/raw/builtin`) with `src/core/resources/measure.ts` and writes the aggregates only to
[investigation/official-baselines.json](../../investigation/official-baselines.json).

- **Left out:** Nomads and Oasis (Kyler: exceptional maps; a nomad map with cores, few bushes and
  scattered small groves, and a desert map around aquifers with half its bushes stored dead). For
  each rate, a map is also left out when it is a clear outlier against the size trend (Tukey's
  fences on its log ratio): **Beaverome's trees** (0.59× the trend) and **Lakes' bushes** (2.54×).
  The game marks five more maps unconventional (Beaverome, Diorama, Pillars, Pressure, Spillage);
  they stay in, because on these measures they sit within the official spread, apart from the two
  outliers above. 17 of the 19 maps are kept.
- **By size:** the size-class medians (small up to about 100², medium 128², large 192² and 256×150,
  max 256²), joined in ln(area) as the calibration table always has. There are only two or three
  small and medium maps, so the spread among maps of one size is measured on the large and max
  maps (five or six each): each map's rate ÷ its class median, pooled. A size's **typical range** is
  its median × the 25th and 75th percentile factors.

| | small | medium | large | max | typical range (×median) |
|---|---|---|---|---|---|
| Trees per 10k tiles | 1,715 | 1,061 | 544 | 559 | 0.92–1.17 |
| Berry bushes per 10k tiles | 265 | 92 | 40 | 44 | 0.98–1.07 |
| Scrap per 1k tiles (15 a storey) | 840 | 705 | 236 | 235 | 0.75–1.41 |
| Ruin columns per 1k tiles | 16.4 | 14.6 | 5.9 | 5.3 | 0.66–1.18 |
| Groves per map | 8 | 28 | 35 | 66 | 0.88–1.11 |
| Berry patches per map | 2 | 4 | 3 | 6 | 0.79–1.19 |
| Ruin fields per map | 2.5 | 6 | 4.5 | 7.5 | 0.88–1.33 |
| Columns per field | 19 | 32 | 39 | 42 | |
| Mine sites per map | 1 | 2 (2–3) | 3 (2–4) | 3.5 (3–4) | |

- **Trees:** a third alive (per map 25th–75th 0.27–0.43); 70% of pines, 76% of birches and 74% of
  oaks are stored dead, succulents never. Species: pine 47%, birch 27%, oak 21%, succulent 6%.
  Living trees cover 16% of the moist land (0.13–0.19), dead ones 6% of the dry land.
- **Groves** (trees within 2 tiles of each other): 99% of trees stand in one; a median grove of 40
  trees (25th 18, 75th 81), the largest of a map about 212; each grove one species; a tree has 41%
  of its eight neighbours in trees; clearings between groves of 4 tiles (25th 2, 75th 7).
- **Berry patches** (bushes within 2 tiles): 44 bushes (35–58), the largest about 64; a bush has
  63% of its neighbours in bushes; they stand 4 tiles from water; patches are about 29 tiles apart.
- **Ruin fields** (touching columns): 37 columns (28–52); they fill 56% of their box, aspect 1.3
  (up to 2); storeys H1 28%, H2 22%, H3 16%, H4 10%, H5 8%, H6 6%, H7 4%, H8 5% (mean 3.06);
  per field the mean runs from 2.2 to 3.9 storeys (10th–90th); a median field has 5 towers of 6+
  storeys and a tallest column of 7; 11% of fields have no tower; touching columns differ by 1.8
  storeys on average; every field has all five models, A 26% and B–E 18–19% each; turns Cw0 59%,
  Cw90 14%, Cw180 10%, Cw270 17%.
- **Mine sites:** 1–4 a map; the nearest to the start a median 61 tiles out (25th 53).
- **Saplings:** 48% of the official maps' living trees are stored as saplings (the generator stores
  35%). Information only: starting wood stays as D164 decides.

**Against the generator before this step** (0.6.0, 108 maps: every theme, seeds 1–6, at 96², 128²
and 256²): the tree, bush and scrap totals were the size's median on every map (the same count on
every seed); 43% of trees alive and 59% of pines, birches and oaks dead; about twice the official
number of groves, half their size (median 15–20) and 50% fuller (a tree had 60% of its neighbours
in trees); 5–10 berry patches of 24 at 128² (official 4 of 44); ruins as official in amount, their
heights clumped (touching columns differed by 1.4 storeys, official 1.8), every model equally
often and turns at random. The table's medians changed little: trees at max size 500 → 559 per
10k and bushes 38 → 44 (Nomads and Oasis left out), scrap at max 237 → 235, field sizes 21 / 31 /
40 / 41 → 19 / 32 / 39 / 42, and the storey shares by up to 1 point.

## The shared baseline

`src/core/resources/` (product code; Real places and Pick a place call it, the generator too):

- `budget.ts` `resourceBudget(W, H, settings, seed)`: a map's trees, living trees, bushes, scrap and
  mine sites. Each is the median for the size moved within the typical range by the seed (evenly in
  ratio), times its setting. The seed alone moves it, so a map keeps its amounts on every attempt.
  Light: the settings panel shows it.
- `baseline.ts`: the placers.
  - `planGroves`: groves of one species, their size drawn from the official sizes (Grove size moves
    the median: 20 / 40 / 80), grown as a blob about twice the trees' number and thinned from the
    edge, a 2-tile clearing round each; living groves on moist ground (seeded near water), dry
    groves on dry ground (dead pines, birches and oaks, or living succulents), species drawn by what
    is left of each species' share; living trees on at most a quarter of the moist land.
  - `planPatches`: patches of about 44 along the banks (within 8 tiles of water where there is
    room), 14 tiles apart where there is room.
  - `planRuinFields` and `ruinColumns`: fields grown in an ellipse (aspect 1–2) on one level of dry
    ground with 4–10% holes and a one-tile moat; each with a tallness from −1 to 1 that tilts the
    official storey shares (a field averages 2.4 to 3.8 storeys); heights placed by a mildly
    clumped key, so a few towers stand among shorter columns; models and turns in the official
    shares. The planner stops at the scrap asked for, counting each field's exact scrap.
  - `pickMineSite`: flat free 5×5 ground with a level ring, out of flood reach, in its band from the
    start (60+ tiles, scaled below 128²): a third of the band beyond its start when there is room
    (the official maps' mine sites stand a median 95 tiles out, the nearest 61; a site on the band's
    edge would stand in the way of moving the start), and on ground the colony walks to without
    stairs when there is any at that distance.
  - `planBaseline` and `baselineEntities`: everything on one map's ground in the generator's order
    (ruins, bushes and groves near the start, the rest), as entities.
- `plan.ts` `planMapResources(input)`: the whole of it for a map the generator did not plan (see
  below).
- `measure.ts`: the measures, for the official maps and ours alike.

**In the generator** (`gen/resources.ts`): the near-start patches and groves are planned as the start
requirements need (with #44, groves grow until their grown trees give 1.35× Minimum starting wood,
drawing species by the wood they give where the walk's moist land is short), now thinned like the
rest where the walk has room, and filled where it has little; the rest of the budget comes from the
baseline. Ruin fields
carry a new optional feature param `layout: { tallness }`; the rasterizer draws their heights, models
and turns with `ruinColumns` from the feature's own stream, so a rebuild gives the same bytes, and
fields without it (old project files, the editor's and Claude's tools) keep the old algorithm. The
ruins on a plateau are a taller field (tallness 0.5), and their scrap counts toward the map's
budget. Mine sites go through `pickMineSite` (`gen/extras.ts`).

### For the Real places round

`src/core/resources/plan.ts` is the one call. After the place's own objects (sources, start, any
slopes) are built and the water settled (resources never move water, so no second settle is
needed):

```ts
const rules = DIFFICULTY_RULES.normal;
const r = planMapResources({
  W, H, heights, water: settle.depth, moisture, soilContamination: soil,
  entities: base,                          // the place's sources, start and slopes
  start: startCentreOf(startObject),       // resources/measure.ts: the 3×3's centre tile
  settings: defaultSettings("riverValley", "normal", { x: W, y: H }).resources,
  seed: hash32("real-place", place.id),
  nearStart: { wood: Math.ceil(1.35 * rules.woodWithin20), bushes: Math.max(rules.berriesTarget, Math.ceil(1.15 * rules.bushesWithin20)) },
  ruinsClear: rules.ruinsWithin + 7,
  owner: `real-place:${place.id}`,
});
entities.push(...r.entities);             // trees, bushes, ruin columns, mine sites
```

- It places at least one mine site whenever any flat dry 5×5 ground exists: in the generator's band
  first (60+ tiles, scaled below 128²), then down to half of it.
- `nearStart` is what to grow within 20 tiles' walk: starting wood in logs of grown trees (D164) and
  living berry bushes (the generator aims at 1.35× Minimum starting wood and 1.15× Minimum starting
  bushes, never below Berries near start). Groves grow there until their grown trees give the wood;
  a share of living trees are saplings (the generator's 35%), whose logs do not count. A place whose
  start lacks moist land there gets what fits, and its validation says so.
- It is a pure function of the ground, settings and seed: a place can store only its terrain, water
  and start and compute its resources when its `.timber` is built, the same bytes everywhere.
- The places tests expect today's places to lack a mine site (`PLACES_LACK_MINE_SITES` in
  `tests/contract/placesCommon.ts`, beside #44's `PLACES_HAVE_EDGE_WALLS` and
  `PLACES_SOURCES_IN_FLOW`); the rebuild turns it to `false`.
- A scratch build of Yosemite Valley through it passes every check but the two advisory ones it
  already had (walkable land and drought water for the bushes), with one mine site.

## Settings

- **Mine sites** is 1–4, keeping the size defaults (1 / 2 / 3 / 3). Old share links with `ms=0`
  decode to 1 with no problem reported; project files saved with 0 open asking for 1
  (`upgradeMineSites`). The spec schema's minimum is 1.
- **Forest density**, **Berry bushes elsewhere** and **Ruins and scrap** multiply the baseline. The
  panel says how many this map gets and the official range for its size ("About 1,812 trees, in
  groves with clearings. Official maps this size: 1,600–2,000."). **Grove size**: "Official groves:
  most about 40 trees." **Mine sites**: "Where the late scrap mine can be built. Every map has at
  least one. Official maps: 1–4."
- `tools/settings-suite.ts`: the Forest density, Grove size, Berry bushes, Ruins and Mine sites
  experiments name their new targets; Mine sites compares 1 and 3.

## Checks

- **`resources.mine_site`** (new, both validators, in the oracle's parity): at least one mine site.
  It blocks generation, warns on export and is reported on import (a playability check).
- **`resources.trees`, `resources.bushes`, `resources.scrap`** are information now (advisory): a
  warning under half the official median at the map's settings, and the message says whether the
  amount is within the official typical range. The batch tool reports how many accepted maps sit in
  the range.
- The start requirements are unchanged and still block.

## Results

On the combined generator: this step merged with the start and edge rules (#44), generator 0.6.2.

**Batches** (`tools/batch.ts`, 100 seeds per theme and size at Normal, 30 at Easy and Hard at 128²),
final pass / first attempt. Blocking: final ≥ 98% in every theme and size: **passes, 100%
everywhere** (36 runs, 2,760 maps). First attempts are information (#44 alone: 92–100% at Normal).

| Theme | 96² | 128² | 192² | 256² | Easy 128² | Hard 128² |
|---|---|---|---|---|---|---|
| River Valley | 100% / 98% | 100% / 99% | 100% / 100% | 100% / 99% | 100% / 100% | 100% / 100% |
| Canyon | 100% / 99% | 100% / 100% | 100% / 100% | 100% / 98% | 100% / 93% | 100% / 100% |
| Highlands | 100% / 92% | 100% / 97% | 100% / 95% | 100% / 94% | 100% / 87% | 100% / 97% |
| Lake Basin | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Delta | 100% / 98% | 100% / 99% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Islands | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 98% | 100% / 100% | 100% / 100% |

Retries: `start.wood` 17, `start.water` 11, `water.settles` 10, `start.dry` 5 and
`terrain.edge_wall` 1 (Delta 96²), Highlands most. Every accepted map had its full mine sites
(1 / 2 / 3 / 3 by size); every project file reopened to the same bytes. In the official typical
range for the size and settings (information): trees on 93–100% of maps (the lowest Hard River
Valley, 28 of 30), scrap on 95–100%, bushes on 92–100% (the lowest at 192², where the range is
narrowest, ±4%).

Before the merge, this step alone also passed 100% final everywhere (first attempts 87–100%).

**Before and after** (the comparison page's maps, as Kyler approved them, measured on this branch
before the merge with #44; the official range at the map's size and settings; ↑↓ outside it):

| Map | | Trees (alive) | Bushes | Scrap (columns) | Mine sites |
|---|---|---|---|---|---|
| River Valley 128², seed 1 | before | 1,721 (743) | 180 ↑ | 16,020 (338) | 2 |
| | after | 1,778 (617) | 151 | 13,080 (271) | 2 |
| | official | 1,604–2,036 | 147–161 | 8,686–16,252 | 1–4 |
| Canyon 128², seed 2 | before | 1,390 (597) | 152 | 13,080 (292) | 2 |
| | after | 1,557 (489) | 154 | 13,575 (267) | 2 |
| | official | 1,284–1,628 | 147–161 | 10,423–19,502 | 1–4 |
| Highlands 96², seed 3 | before | 1,091 (503) | 148 | 9,765 (214) | 1 |
| | after | 1,260 (458) | 150 | 7,320 (145) | 1 |
| | official | 1,008–1,278 | 144–157 | 5,251–9,825 | 1–4 |
| Islands 128², seed 4 | before | 1,739 (770) | 159 | 11,085 (234) | 2 |
| | after | 1,636 (551) | 156 | 13,950 (320) | 2 |
| | official | 1,604–2,036 | 147–161 | 8,686–16,252 | 1–4 |
| Lake Basin 256², seed 1 | before | 3,276 ↓ (1,340) | 260 ↓ | 14,325 (327) | 3 |
| | after | 3,734 (1,175) | 289 | 18,165 (390) | 3 |
| | official | 3,381–4,290 | 282–309 | 11,582–21,669 | 1–4 |
| Delta 256², seed 2 | before | 3,932 ↓ (1,696) | 259 ↓ | 16,290 (358) | 3 |
| | after | 4,921 (1,608) | 295 | 12,000 (241) | 3 |
| | official | 4,058–5,148 | 282–309 | 9,265–17,335 | 1–4 |
| Yosemite Valley 96² (a scratch build) | before | 1,213 (486) | 147 | 7,050 (235) | 0 |
| | after | 1,247 (426) | 153 | 5,415 (94) | 1 |
| | official | 1,120–1,420 | 144–157 | 5,251–9,825 | 1–4 |

Yosemite Valley's amounts were already about the official ones for a 96² map, per tile (its trees
are the size's median). What differed is the layout, which the numbers above hide: a tree or bush on
every other tile everywhere, and 235 ruin columns, every one 2 storeys of model A, in square blocks.
Against the official small maps by count (50² and 100×50: 497 and 721 trees, 47 and 70 columns)
it has far more, as they are a quarter and half its area.

- **Contact sheet** (D144): [docs/sheets/resources.png](../sheets/resources.png), seeds 1–30 of
  every theme at 128², from the combined generator, 571 KB.
- **Comparison page** (local, for Kyler): `C:\dgm-workshop\resources\compare.html`: before and
  after for six generated maps and Yosemite Valley, each the whole map top-down, the start's
  surroundings, and its two largest ruin fields in 3D, coloured by model.
- **Oracle** (`npm run oracle`, seeds 1–50 at 96², 128² and 256², and the 19 official maps):
  150 maps generated, load checks and round trips pass; **0 disagreements** on 2,300 checks of 50
  generated maps and on the official maps. Both validators agree on the newer checks: every
  accepted generated map passes `terrain.edge_wall`, `water.source_in_flow`, `resources.mine_site`
  and `start.water`; on the official maps both flag `water.source_in_flow` on Beaverome,
  MountainRange, Pillars and Terraces and `start.water` on Cliffside, HelixMountain, Spillage,
  Terraces and Waterfalls, and neither flags an edge wall or a missing mine site. (The official
  maps are local only, so their parity ran as a second pass beside one generated map.)
- **The canonical file** (D148): the live check's download (River Valley 4242, 128², Normal) is
  now sha256 `b358b4f8…` (0.6.1: `e4f2f72c…`). `tests/contract/look-mine-ruins.test.ts` (#42)
  pins it and is re-pinned here (see Tests).
- **Browser tests** (`npm run test:e2e`, the installed Chrome): 63 passed before the merge, the
  local-only map imports included; CI runs them on the combined generator.
- **Keep M12 ready** (D134): the Claude reference suite passes **103 of 120** on the combined
  generator (dev with #44: 105). Newly passing against dev: S04. Newly failing: J11 and P12 (the
  one site their lake and canyon fit breaks `entities.placement` and `extras.placement`; before
  the merge, a geothermal field and a relic stood in the south third where they went) and S06 (on
  `rv128b` the start moves from 36.7 to 41 tiles from the lake, not nearer). The waterfall
  follow-ups' setup (`rv128-fall`) pins the fall where the site search put it on 0.6.0 (it ranks
  sites by what they clear, so it moved with the resources); S05 passes. Before the merge this
  branch passed 104 (dev at 3da4b1a: 101). The orchestrator re-tunes the setups after both
  generator steps land (STATUS, D134).

## Tests

- New `tests/contract/resources.test.ts`: the calibration table is the measured baseline; budgets
  scale with size, stay in the typical range and differ by seed; mine sites 1–4 and old links;
  groves (one species, apart, as full as the official ones, alive on moist and dead on dry
  ground); patches beside water; ruin heights (the official storey shares at tallness 0, towers in
  nearly every field, neighbours differing as officially, every model); ruin fields holding the
  scrap asked for, on one level, never touching; `pickMineSite` (in band, reachable first);
  every generated map has a mine site and a map without one fails `resources.mine_site` in each
  profile as it should; a project file with 0 mine sites opens with 1; generated maps carry the
  official amounts.
- Updated per D148 (they still passed or no longer meant what their names say, after Kyler's
  decisions):
  - `tests/unit/math.test.ts`: the max class's scrap median is 235 (measured without Nomads and Oasis).
  - `tests/contract/validate.test.ts`: `resources.mine_site` is in the check list; "not applicable on
    a map without map objects" now takes the objects out of a generated map's plan, since a map can
    no longer ask for no mine site.
  - `tests/contract/features.test.ts`: the advisory list gains the three resource amounts.
  - `tests/contract/spec.test.ts`: random specs draw 1–4 mine sites.
  - `tests/contract/places.test.ts`, `placesCommon.ts`: every place passes every check but the
    missing mine site, which both validators flag, until Real places 2 rebuilds them.
  - `tests/contract/look-mine-ruins.test.ts` (#42): the seed-4242 download's sha256 is
    `b358b4f8…`, as generator 0.6.2 makes it. The test checks that the 3D view's models leave the
    download unchanged; a step that changes generated maps on purpose updates the pin.
- `tests/contract/objects.test.ts`: the every-object map moves from seed 13 to seed 15, a seed on
  which every theme still places every kind of object (a seed choice, not a decision).

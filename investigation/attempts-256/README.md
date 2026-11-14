# Refused attempts at 256²

**Question.** Why do maps at 256² take many attempts, and which changes to how the land is made would stop the
refusals from happening, rather than catching them afterwards? This report covers every theme, seeds 1–6: 42 maps and
245 attempts. All runs used dev at `bad05e4e5`, generator 0.10.22.

**Answer, in short.** 203 attempts were refused. 194 of them were refused by the land checks, before the first look
and before any water settled. Three causes in the land's making account for most of them:

1. **A pool a level under a river's bed** (`land/hydro.ts`), whose standing water finds a lower way out.
2. **Ditches that cannot be bent** at this size (`land/hazards.ts`), which leave no place for badwater.
3. **High ground that is too low** in Highlands.

I measured the three changes that would stop them on all 42 maps. Together they could remove roughly 100 of the 203
refusals. The ranking is at the end.

## How this was measured

- **The runs.** Each map was made as the page's generator worker makes it: `generate(spec)` with the page's parallel
  water (3 threads), one map per process.
- **Seeds 1–3 were made again.** Dev's generator still gives the same `.timber` sha256 and the same attempt and refusal
  lists for them as the earlier base table, so they match it.
- **The instrumentation was temporary.** I added hooks to record each refusal: its reason, the generator's progress
  stage, and whether the land was fresh or already shown. For "a river's water leaves its course", the hooks also
  recorded the tiles involved. No generator code is committed with this report.
- **The changes were tested as toggles.** Each change in sections 2 and 3 was tried with an environment toggle on the
  same harness, one run per seed.
- **One run per seed is noisy.** A change alters the attempts that follow it, so later attempts draw different land, and
  other refusals come and go. The counts are the total effect on each map's attempts, not a controlled measure of one
  refusal.
- **The raw table.** One row per refusal is in [refusals.csv](refusals.csv): theme, seed, attempts, `.timber` sha,
  attempt number, reason, stage, and fresh or shown land.

**The stages.**
- **Land checks.** These are `attemptOnce`'s checks on fresh land, before the first look and before any settle
  (`gen/generate.ts` 1928–2505). The generator reports this as its "water" progress stage, because `planHydro` begins
  it.
- **Start.** These refusals fire while the start is placed, after the water settled.

## 1. Every map

| Theme | Seed | Attempts | Refusals (land checks, before any settle) | Refusals (start, after the settle) |
|---|---|---|---|---|
| any | 1 | 8 | leaves its course 6, dam wall 1 | – |
| any | 2 | 2 | – | start water moved 1 |
| any | 3 | 5 | leaves its course 1 | start water moved (shown land) 2, start water moved 1 |
| any | 4 | 20 | leaves its course 9, no place for badwater 5, one place for a start 2, source in a flow 1, no start 1 | start.reach 1 |
| any | 5 | 14 | leaves its course 6, water story 3, no start 2, one place for a start 1, no place for badwater 1 | – |
| any | 6 | 2 | water story 1 | – |
| riverValley | 1 | 4 | leaves its course 2, no rivers 1 | – |
| riverValley | 2 | 11 | leaves its course 5, no rivers 4, no place for badwater 1 | – |
| riverValley | 3 | 6 | no place for badwater 3, no rivers 2 | – |
| riverValley | 4 | 1 | – | – |
| riverValley | 5 | 2 | no place for badwater 1 | – |
| riverValley | 6 | 6 | leaves its course 3, water story 1, no place for badwater 1 | – |
| canyon | 1 | 9 | water story 2, no place for badwater 2, no rivers 1, promise 1, one place for a start 1, leaves its course 1 | – |
| canyon | 2 | 4 | promise 2, water story 1 | – |
| canyon | 3 | 9 | no place for badwater 3, promise 3, leaves its course 2 | – |
| canyon | 4 | 5 | promise 2, source in a flow 1, water story 1 | – |
| canyon | 5 | 4 | promise 3 | – |
| canyon | 6 | 6 | promise 2, ruler-straight channel 1, water story 1 | – |
| highlands | 1 | 24 | one place for a start 5, leaves its course 4, promise 3, dam wall 3, no start 3, ruler-straight channel 2 | start water moved (shown land) 2, start water moved 1 |
| highlands | 2 | 11 | dam wall 4, leaves its course 2, promise 2, water story 1, one place for a start 1 | – |
| highlands | 3 | 12 | promise 3, source in a flow 3, dam wall 1, no start 1, leaves its course 1 | start water a sealed puddle 1, start water moved (shown land) 1 |
| highlands | 4 | 7 | promise 3, no start 2, leaves its course 1 | – |
| highlands | 5 | 10 | no place for badwater 3, promise 2, water story 1, head under a lake 1, leaves its course 1, no start 1 | – |
| highlands | 6 | 7 | promise 3, no place for badwater 2, no start 1 | – |
| lakeBasin | 1 | 1 | – | – |
| lakeBasin | 2 | 1 | – | – |
| lakeBasin | 3 | 1 | – | – |
| lakeBasin | 4 | 1 | – | – |
| lakeBasin | 5 | 4 | leaves its course 3 | – |
| lakeBasin | 6 | 1 | – | – |
| delta | 1 | 4 | leaves its course 3 | – |
| delta | 2 | 2 | leaves its course 1 | – |
| delta | 3 | 4 | leaves its course 3 | – |
| delta | 4 | 5 | leaves its course 4 | – |
| delta | 5 | 4 | leaves its course 3 | – |
| delta | 6 | 1 | – | – |
| islands | 1 | 2 | one place for a start 1 | – |
| islands | 2 | 11 | no place for badwater 5, no island to expand to 2, one place for a start 2, promise 1 | – |
| islands | 3 | 5 | no place for badwater 3, no start 1 | – |
| islands | 4 | 4 | no place for badwater 2, water story 1 | – |
| islands | 5 | 1 | – | – |
| islands | 6 | 4 | no place for badwater 2, no island to expand to 1 | – |

| Theme | Attempts (6 maps) | Refusals by reason |
|---|---|---|
| any | 51 | leaves its course 22, no place for badwater 6, start water moved 4, water story 4, one place for a start 3, no start 3, dam wall 1, source in a flow 1, start.reach 1 |
| riverValley | 30 | leaves its course 10, no rivers 7, no place for badwater 6, water story 1 |
| canyon | 37 | promise 13, water story 5, no place for badwater 5, leaves its course 3, no rivers 1, one place for a start 1, source in a flow 1, ruler-straight channel 1 |
| highlands | 71 | promise 16, leaves its course 9, dam wall 8, no start 8, one place for a start 6, no place for badwater 5, start water moved 4, source in a flow 3, ruler-straight channel 2, water story 2, start water a sealed puddle 1, head under a lake 1 |
| lakeBasin | 9 | leaves its course 3 |
| delta | 20 | leaves its course 14 |
| islands | 27 | no place for badwater 12, one place for a start 3, no island to expand to 3, promise 1, no start 1, water story 1 |
| **all** | **245** | leaves its course 61, no place for badwater 34, promise 30, one place for a start 13, water story 13, no start 12, dam wall 9, start water moved 8, no rivers 8, source in a flow 5, ruler-straight channel 3, no island to expand to 3, start.reach 1, start water a sealed puddle 1, head under a lake 1 |


**Where the refusals fired.**
- **Land checks: 194 of 203**, all on fresh land. Here the planned water and the land alone refused the attempt, before
  any settle.
- **Start: 9 of 203**, after the settle. They are "start water moved" (8, of which 5 on a land already shown) and
  "start water a sealed puddle" (1).
- Every map passed in the end. Attempts equal refusals + 1 on every map.

## 2. Each theme's two commonest refusals

### "A river's water leaves its course": 61 refusals (Any 22, Delta 14, River Valley 10, Highlands 9, Lake Basin 3, Canyon 3)

`blockedCourses` (`land/courses.ts` 142) runs at the end of `planLandStage` (`gen/generate.ts` 1729). It refuses the
attempt when water on a river's course can leave the map by another way, lower than the way by its exit's stretch of
edge. For an inflow, it refuses even a tie, when that water would run back out by the inflow's own edge (`back`). The
edge lip (`closeBackEdges`, `land/courses.ts` 64) did not close any of these. It refuses a run of edge tiles longer than
a quarter of the side, or a rise of more than 2 levels.

I recorded the blocked rivers after each step of `planLandStage`. This shows the step that first opened each leak:

| Step that opened the leak | Refusals | Of which run back out by the inflow's own edge |
|---|---|---|
| `planHydro` itself (the hydrology's plan) | 39 | 27 |
| `relaxEdges(h, W, H, mouthBanks(...))`, the second edge relax (`gen/generate.ts` 1591) | 9 | 4 |
| `carveOutlets`, the large and small calls (`gen/generate.ts` 1635, 1643) | 11 | 0 |
| tidying (`mergeSmallRegions`, `cleanPitsAndSpikes`, `fillDryHollows`) | 2 | 0 |

**Cause A: the pools (shown).** `planHydroSingle` scours a pool below each drop on a reach of 8 tiles or more: three
tiles cut a level under the bed (`land/hydro.ts` 1414–1423, `bedOf[q] = prof[j] - 1`). Water stands in the pool at the
bed's level. That standing water finds a lower way out in two ways:
- **Near an inflow's head**, the inflow's own edge row is at the bed's level for a long run, so the water runs back out
  beside the mouth. This is the 27 `back` cases.
- **Elsewhere**, the ground beside the pool is no higher than the pool's floor, and it drains to another edge.

The course profiles show this shape again and again: the mouth's bed, a drop of one level, three tiles a level lower
still, then the bed (for example "13 13 13 · 11 11 11 · 12 12…").
- **Shown on Delta 3, attempt 0.** The main river enters by the north edge. At (173, 234), 21 tiles inside the edge, its
  bed drops from 13 to 12, and the three pool tiles stand at 11. Water stands at 12 there. The north edge row is at 12
  or lower from the mouth along to (28, 255), so the water leaves there. The lip cannot close a run that long. With the
  pools turned off, Delta 3 makes its map in 1 attempt instead of 4.
- **Shown on Any 4, attempt 13.** The inflow enters by the east edge with its bed at 9. It drops to 8, and pool tiles at
  7 lie at (240, 76). The water at 8 runs back out by the east edge at (255, 238).
- **Shown on River Valley 1, attempt 1.** The main river enters by the east edge with a mouth bed of 7 and a pool at 5
  at (252, 232). It leaves at (255, 113).

**Cause B: a planned lake's outlet stands above a lower way out of its basin (Highlands; partly shown, partly a
guess).** In Highlands the escaping water crosses planned lakes on its way out: 146–268 lake tiles on the route in
Highlands 1, 2 and 5. The course downstream rises to the lake's outlet bed (`run = lakes[inLake].outletBed`,
`land/hydro.ts` 1197).
- **Shown on Highlands 1, attempt 6.** The main river at (49, 110) has its bed at 3, under water that stands at 5. That
  water leaves by the west edge at (0, 212). The river's own way on must rise to 7, at (67, 132).
- **The guess.** `hollow` takes its sill from `lv.filled`, the spill level read before the rivers were carved
  (`land/hydro.ts` 1079). Later carving can open a lower rim elsewhere, but the lake keeps its old sill. I did not prove
  this.
- Turning off the pools removed none of the Highlands leaks.

**Cause C: new low ways out cut after the plan (shown by the steps, mechanism read from the code).**
- **`carveOutlets` (11 refusals).** It cuts a channel a level under a basin's flat, "to where the land falls away or to
  the map edge" (`land/levels.ts` 662–670). Where a river runs through that basin, the river's water gets a second way
  out. Lake Basin 5, attempt 0: the blocked rivers went from 1 to 3 at `carveOutlets`. Spring 4 at (182, 158), bed 9,
  leaves at (255, 237).
- **The second `relaxEdges` (9 refusals).** It lowers the two edge rows to the ground just inside them. Where a planned
  channel runs within two tiles of the edge, this opens the edge to the channel.

**Changes that would prevent it:**
- **A. A pool only where its water stays.** In `planHydroSingle` (`land/hydro.ts` 1414–1423), do not cut a pool when:
  - its surface (`prof[j]`) reaches the level the inflow's own edge lets water out (`maxSill`, computed in the same loop
    from `upSpill`, 1353), or
  - the ground beside its three tiles is no higher than its surface.

  **Measured on all 42 maps with every pool turned off,** which is the upper bound: leaks fell from 61 to 25 and attempts
  from 245 to 214 (−31). Delta lost 11 leaks, River Valley 9, Any 13. A targeted rule keeps the pools that hold. Its
  effect will be a little less than this, and I did not measure it.
- **B. Re-read a lake's sill on the ground as carved so far.** In `hollow` / `profileOf` (`land/hydro.ts` 1079, 1145),
  read the sill again after earlier rivers are carved, or cut the outlet down to the basin's present spill. This is not
  measured.
- **C. Outlets and edge relax.**
  - `carveOutlets` (`land/levels.ts` 670) should not cut from a basin that a planned river crosses, except along that
    river's own way out.
  - The second `relaxEdges` (`land/levels.ts` 553, called at `gen/generate.ts` 1591) should keep the edge rows beside
    every planned channel, not only beside the mouths.

  This is not measured.

**Pins these would move.** A, B and C each change the land of every map with a river, at every size:
- `GENERATOR_VERSION` (`spec/mapspec.ts`, 0.10.22),
- the 128² sha in `tests/contract/premiseMap.test.ts`,
- the values read by hand in `tests/contract/showcase.test.ts` (Lake Basin 96² seed 2, where it has a pool or an
  outlet).

Saved projects reopen from their stored field and should not move. I did not run the pins for any of these
experiments.

### "No place for badwater": 34 refusals (Islands 12, Any 6, River Valley 6, Canyon 5, Highlands 5)

**Cause, except Islands (shown).** Every pit tried is passed over because its ditch cannot be bent. `windDitch`
(`land/hazards.ts` 510) draws each route with the rivers' meander: a swing of up to 3.2 tiles and a wavelength of 13–20
tiles. It rejects any drawing with a straight stretch longer than `DITCH_STRAIGHT` = 9 tiles (472). At 256², water that
a ditch may join is far from the pits, so the ditches are long.
- **Shown on River Valley 6, attempt 4.** All 180 pits tried were turned down by `windDitch`. 1,598 of the 1,620
  drawings broke the straight limit. 130 of the ditches were 40–80 tiles long and 49 were longer than 80.
- Any 5 attempt 4, Canyon 3 attempt 4 and Highlands 6 attempt 4 show the same: "notWound" on every pit tried.

**Cause on Islands (shown in counts; the reason is read from the code).** Every pit has no route at all: 117–180
"noRoute" per refused attempt on Islands 2 and 3. On Islands, all the water is the sea or joined to it, and D498 (3)
spares it from badwater (`atStandingLevel`, the `spare` keep-off). A ditch may therefore end only at the map's edge, and
the sea's lip lies along that edge.

**Change that would prevent it.**
- **Most themes.** Bend a long ditch at a shorter wavelength, so that no 9-tile run is left between bends. In
  `windDitch`'s `meanderPath` call (`land/hazards.ts` 522), the cell `13 + 7 * rng.float()` becomes `8 + 4 *
  rng.float()`.
  - **Measured on all 42 maps:** attempts fell from 245 to 208 (−37), and "no place for badwater" from 34 to 18. The 12
    on Islands did not change. Outside Islands it fell from 22 to 6.
  - **A side effect to check:** Delta 1 went from 4 to 7 attempts with 3 new `water.outflow` refusals. That may come
    from the new ditch shape, and it needs a look before adoption.
  - This change is in `land/hazards.ts`, which another session owns. It is a proposal only.
- **Islands.** This is a design question for planning, not a tuning change. Either the land keeps a dry route from the
  main body to an edge, or Islands gets a sealed badwater sink. D498 forbids the sea.

**Pins this would move.** Every map with badwater, at every size: the generator version, the premiseMap sha, the
showcase values, and the badwater contract tests that pin ditch routes (`tests/contract/badwater*.test.ts`).

### Canyon: "promise" (13) and, tied, "water story" (5) / "no place for badwater" (5)

**Cause of the promise refusals (the numbers are shown; the cause is a guess, supported by one measurement).** In all
13, the walled stretch is long enough but its share of the course is too small. At 256² the promise needs `canyon` ≥ 29
tiles and `canyonShare` ≥ 0.141 (`gen/outcomes.ts` 46). 12 of the 13 had a walled run of 32–86 tiles, and all 13 had a
share of 0.03–0.137.
- **Shown on Canyon 3, attempt 2:** walled for 79 tiles, a share of 0.110.
- **The guess.** From 128² up, the inflow search prefers the mouth with the longest way across (`lengthWeight` 0.06,
  `land/hydro.ts` 647). A longer course lowers the walled share that the promise asks for.

**Change that would prevent it.** At 256², weigh the inflow by the walled share it would get rather than by length. As a
test, I used the smaller-map weight of 0.012 at 256².
- **Measured on Canyon 1–6:** promise refusals fell from 13 to 8, and attempts from 37 to 26 (−11). No other theme
  changes.
- Canyon's `incise` is already raised to at least 7 by `shapeCanyon` (`land/canyon.ts` 46), so a deeper incision changed
  nothing: tested as +5 against +3.
- **Pins:** the generator version only. No pinned seed is a Canyon of 256² or more.

**The second Canyon refusal.**
- **Badwater** has the ditch cause above.
- **Water story** I did not diagnose. Its reasons read "only 28–34% of the land lies near clean water", or "the main
  system holds 43–66% of the water, 5–6 rivers never join it".

### Highlands: "promise" (16) and "leaves its course" (9)

**Promise (the numbers are shown; the cause is not).** 13 of the 16 fail because too little high ground is
high: `high`, the share of dry land 4 or more levels over the median water surface, is 0.04–0.55 against 0.6. 3 fail
only on cliffs: 0.062–0.067 against 0.071.
- **Shown on Highlands 4, attempt 1:** `high` 0.107, while the cliffs (0.098) and plateaus (8) pass.
- Fewer lakes (lake budget × 0.4) changed nothing, so lakes high up are not the cause.
- **A broader change to the land's making:** let 256² Highlands lean lower, with `hyps.lean` at most 0.55 instead of 0.65
  (`land/highlands.ts` 43).
  - **Measured on Highlands 1–6:** attempts fell from 71 to 35 (−36). Fewer starts were refused (one place, no start)
    and fewer dam walls.
  - But promise refusals only fell from 16 to 13, so this does not fix the promise.
  - The comment at `land/highlands.ts` 32–37 records that a lower lean once left bare rock (then with the lowest bench
    at 5). The look has not been judged. Treat this as a candidate for a look, not a fix.
- **Pins:** the generator version only, if limited to 256² as tested. The Highlands fixtures are 48².

**Leaves its course:** see Cause B above. Pools are not the cause in Highlands.

### Any: "leaves its course" (22) and "no place for badwater" (6)

Both have the causes above:
- **The leaks** (`plan` 10, `carveOutlets` small 6, edge relax 6): mostly pools. Shown on Any 4, attempt 13.
- **Badwater:** unbendable ditches. Shown on Any 5, attempt 4.

### River Valley: "leaves its course" (10) and "no rivers" (7)

**Leaves its course:** pools at the main inflow's head, 9 of the 10 opened in `planHydro`. Shown on River Valley 1,
attempt 1, and River Valley 2, attempts 1–3, where the water leaves at the corner (0, 255).

**No rivers (shown in counts).** River Valley's default trunk must enter by an edge and span half the map (`land/hydro.ts`
609–615). Trunks that do span it are then turned down by the checks after it.
- **Shown on River Valley 3, attempt 0:** 498 edge heads spanned the map. Of those, 372 stood below the spill of their
  own way down (`spillHead`, 625), 118 ran within 4 tiles of the border (`nearBorder`, 631), and 8 met a hollow above
  the head. The same pattern appears in River Valley 1 attempt 2 and River Valley 2 attempts 0, 6, 8 and 9.
- **Change:** give River Valley's default trunk the one-level allowance D357 gives a long map's head (`rise = 1`,
  `land/hydro.ts` 624). The head may then stand a level under the rise ahead, and its channel cuts through.
- **Measured on River Valley 1–3:** "no rivers" fell from 7 to 4, and attempts from 21 to 15 (−6, all on seed 2).
- **Pins:** River Valley at every size as tested: the generator version, and `river-valley-96-11` if it is regenerated.

### Lake Basin: "leaves its course" (3, its only refusal)

All 3 are on seed 5 and come from Cause C: `carveOutlets` raised the blocked rivers from 1 to 3 (attempt 0). The other
five maps passed at once.

### Delta: "leaves its course" (14, its only refusal)

13 of the 14 were opened in `planHydro`, 11 of them at the main inflow's head: the pools of Cause A. Shown on Delta 3,
attempt 0. With the pools off, Delta's leaks fell from 14 to 3.

### Islands: "no place for badwater" (12) and, tied, "one place for a start" (3) / "no island to expand to" (3)

**Badwater:** see the Islands cause above. It is a design question for planning.

**One place for a start / no island to expand to:** not diagnosed. They are 6 refusals in all.

## 3. Ranking: the three changes that remove the most attempts across the 42 maps

| # | Change | Where | Attempts removed (of 245) | Refusals it targets |
|---|---|---|---|---|
| 1 | Bend long ditches at a shorter wavelength | `land/hazards.ts` `windDitch` (522) | **37** (245 → 208) | no place for badwater 34 → 18 (Islands' 12 untouched) |
| 2 | 256² Highlands leans lower (`hyps.lean` ≤ 0.55) | `land/highlands.ts` `shapeHighlands` (43) | **36** (Highlands 71 → 35; no other theme changes) | starts and dam walls; promise only 16 → 13 |
| 3 | No pool where its water would leave (measured: all pools off) | `land/hydro.ts` `planHydroSingle` (1414–1423) | **31** (245 → 214) | leaves its course 61 → 25 |

**Also measured:** Canyon's inflow weighed less by length at 256² removed −11 attempts. River Valley's trunk with the
D357 rise removed −6 (one seed).

**Not measured:** the lake's sill read again (Cause B), and the outlets and edge relax kept off the courses (Cause C),
which together opened 22 of the 61 leaks.

**Plainly:**
- Each number comes from one run per seed, and other refusals moved in and out with each change.
- Change 3 is an upper bound: it removed every pool.
- Change 2 has not had its look judged.
- Change 1 brought 3 new `water.outflow` refusals on Delta 1, which need checking.
- None of these changes has been through the pin tests.

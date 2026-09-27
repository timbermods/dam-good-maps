# M9a: terrain and water from processes

> **The probe's second run is diagnosed and judged again with the probe fixed; waiting on the
> orchestrator (2026-09-27).** The re-run 20260927-1443-batch on 0d9e473's maps passed 99 of 103
> checks, the water check on all 15 (see "The DGM Probe re-run 20260927-1443-batch" under Results).
> The orchestrator's go fixed the probe, not the maps or the tolerances: its model starts from the
> file's stored outflows, as the game does, and the start's water is the water `start.water` counts.
> Judged again (`C:\dgm-probe\results\20260927-1443-batch-recompare\`): 99 passed, 4 failed. Canyon
> 128² seed 1's start water passes (a gap of 0.4%). What fails: Any 128² seed 1's post-drought
> badwater pool (the map; the model agrees with the game), Delta 128² seed 1's flats after a drought,
> and the 0.05 wet threshold on No badwater seed 6 and, newly, Islands 128² seed 1 (5.8%; 141 tiles
> 0.048–0.051 deep). Nothing in the generator changed for it. Waiting on: Kyler's call on the pool,
> on Delta's flats and on the wet-tile threshold.
>
> Kyler said yes to M9a on D252 (2)'s
> review set (D294); its shortfalls go to M9b. Kyler's D252 (1) unfroze the generator: starts stop
> looking alike (37b2f50; see "Starts stop looking alike" under What was built and under Results).
> **The generator is frozen at 788c145** (its code as of 5e15143, which keeps a walk short of moist
> land for the start's wood). An earlier freeze, ca63a56, made River Valley 96² seed 1333 (an e2e
> determinism seed) mapless and was dropped; the batches at 0f70fcb, 37b2f50 and ca63a56 were
> stopped (only this worktree's processes) and re-run. M9a's pending #77–#80 became #87–#90 and the
> start planting's default is #93; Kyler answered them (D270, D294: #87, #88, #90 and #93 accepted;
> #89 for the feature operations and Claude only). D277 took the Claude suite off M9a's gates.
> **Done on 788c145's generator:** every settings experiment moves its target (seeds 1–4); every
> batch, 100 seeds of every option at 96², 128², 192² and 256² at Normal and at 128² on Hard: every
> option and size at 98% final or better (the tables under Results). **The probe batch
> 20260927-0853-batch** (the orchestrator's) failed 5 of 103 checks; the main cause was the file
> writing its water's outflows as 0 (see "The DGM Probe batch 20260927-0853-batch" under Results).
> **0d9e473 writes the settled outflows into the file** (FORMAT.md §4.3): depths, checks and the
> generator's decisions unchanged, every file's bytes new; CI green on it (push 36327168832, PR
> 36327171912, Nightly 36327171917 with the heavy tests). The probe group's 15 maps are rebuilt on it
> in `C:\dgm-probe\maps\20260927-1443-batch` (run id `20260927-1443-batch`; `tools/check-maps.ts`:
> every check passes, the Hard map at Hard), never launched by this session; CI green on the docs
> commit after it (6be0d53, push 36329518714). **Left:** the orchestrator's decisions on the second
> run, then the merge into `dev`, `m9a-done` and the release. **Caveats** for Kyler (see "Found and
> parked" and the probe sections): a river that stands in pools (River Valley 96² 4242), Designed
> for reshapes the land, the Real places' wood as known faults for Real places 2, River style
> (braided) and Berries near start at their thresholds, a start whose walk is mostly moist land still
> gets the start rules' trees on every side, Delta's flats after a drought (a sheet over a plain in
> the badtide) and the post-drought badwater pool on Any 128² seed 1.

**Built** on branch `feature/m9a` from `dev` at f04674d, after Kyler approved design version 2
(PLAN §20 D209). The generator grows every map from the processes of design version 2 (the genome,
the field, the hydrology, the settler) instead of planning stamped features. Generated maps change:
generator **0.7.0**; share links made with 0.6.x open with the note that the map may differ.

## What was built

### The generator (src/core/land, src/core/gen)

- **The genome and the themes as priors** (`land/genome.ts`, `land/intentions.ts`): design version
  2's genome, ported slice by slice and checked against the prototype on 2,880 genomes (identical).
  **Any** (Surprise me) is a theme of its own: its prior is the union of the six themes' ranges, the
  mean of their chances and all their lists; a chosen theme only leans the ranges (D208, D209). The
  settings lean the genome (`leanGenome`).
- **The field** (`land/field.ts`, `land/levels.ts`, `land/drainage.ts`): uplift, caprock, erosion
  with hardness, weathering, levels with hypsometry and benches, small regions merged, pits and
  spikes cleaned, dry hollows filled, the edges relaxed (no edge walls, D151), natural ramps. The
  field is identical to the prototype's on 24 fields. One fix: a ramp path too short for its drop
  used to take every round of the ramp planner on the same component (the prototype's too); it is
  now left to stairs, and the next component gets its turn.
- **The hydrology** (`land/hydro.ts`): rivers from the drainage (edge inflows, springs, spring
  lakes), valley troughs, lakes at their sills, profiles with knickpoints and pools, splits,
  deltas, hanging valleys. With M9a's meanders off it is identical to the prototype's on 24 maps.
- **No ruler-straight rivers** (D209; `analysis/straight.ts`): rivers meander (a quasi-periodic
  course whose wavelength and amplitude vary along it, kept inside its valley) and their width
  varies. The measure: the longest bank run within 0.75 tiles of a straight line, and the longest
  stretch where both banks run parallel (a canal), on the settled water, three tiles in from the map
  edge. The limits are the largest seen on real terrain (the landscape survey) and the official maps
  (`investigation/m9a/straight-reference.json`: a run of 44 tiles, a canal of 34.3). A map with a
  channel straighter than that is planned again.
- **The settler** (`gen/settler.ts`): the start by reach, moist land by walk and water it can drink
  through the first drought (#59's default: Easy requires it, Normal and Hard prefer it), on the
  water the hydrology planned, then checked on the one settle.
- **Badwater on every map** (`land/hazards.ts`, D200): a hollow with a ditch down to a river or the
  edge, kept away from where the start will be, planned before the one settle; none with No
  badwater.
- **Features read back from the field** (`gen/readback.ts`): the rivers (the main one as
  `river/main`), the natural lakes (their outline and outlet), the badwater hollows, and ruins on a
  rise. The field `contains` them: the build marks their channels and leaves their ground.
- **Objects and resources**: the map objects as before; a second district's site where the land
  has one (D77); a pre-built weir on half the maps where a channel takes one (D72, `gen/weir.ts`);
  ruins on a rise the land already holds, one flight of stairs up (PLAN §9.4, nothing raised,
  `riseSpots`); the resources through the shared baseline (D167–D170).
- **Intentions** (`gen/intentions.ts`): checked on the finished map, a start intention re-steered
  once (D138).
- **Water that settles and sources that start rivers.** The batches found three ways the processes'
  water failed the checks, each fixed at its cause:
  - a sea rose for days: a basin starts full to its spill level (the canonical settle), then its
    water rises until its outlet passes the flow coming in, a whole level where the outlet is a
    river's width. Over a sea's area that took past the settle's four days (Islands 256² seed 1: 6,144
    ticks). A sea's way out to the map edge is now as wide as its water needs, 1.6 tiles per block a
    second of flow, on the water's own route (`widenOutlets`): that sea rises a third of a level and
    settles after 2,432 ticks. Islands at 256²: first attempts 1 in 8 before, 5 in 12 now; a map in
    about 15 s instead of 67. A broad basin whose spill level is a wide flat also gets a winding
    outlet a level below it (`carveOutlets`);
  - a lake the land no longer led its river into (the land changed after the hydrology found it)
    filled only by seeping over a bank, for days: such a lake is filled as the dry hollows are. A
    river's mouth on the map edge holds its sources and is not an outlet when this is judged (it
    once took a whole sea for unreached);
  - after the one settle, a spring-fed river whose spring another source's water reaches leaves the
    map (its valley stays, dry), and a badwater hollow that is reached is planned again (D171).
  Water still changing after the settle's four days fails the attempt at once and the next attempt
  draws a new genome (it is the field's), and a source inside a flow fails before the objects.
  Tried and dropped (no better in 20-seed batches): raising a lake's shore where a river ran beside
  it, and keeping a river's bed at the lake's outlet level along its shore.
- **Badwater like the official maps** (merged from `feature/badwater-source`, D200): as many
  hollows as the official budget's sources for the size, each as strong; the start is kept beyond
  the badwater distance from their water and soil where it can be, and hollows that still reach
  within it are planned again from the start as it is.
- **Progress while a map is made**: the page shows the stage of the attempt under way and a first
  look at its land before the water is settled.
- **Nothing is stamped**: no dam-site ridge, no landform, no terrace ring, no plateau. The old
  planners are gone (their exports that other branches use are kept, see below).

### The document (project format 3)

- Terrain as heights plus solid runs (`terrain/runs.ts`; I-1, D119): `BaseMap.runs` replaces
  `BaseMap.columns`. Formats 1 and 2 open (their columns become runs).
- The generated field is stored (`MapDocument.field`: heights, runs, the features it contains, its
  ramps, its top). The build takes it as step 1. A read-back feature the player changes is built as
  it now says; locking or renaming it leaves it the field's.

### The checks

- `water.storage_possible` replaces `water.reservoir`: running flow and the storage a dam, a natural
  basin or a levee can hold near the start. Information the generator prefers, never a guard (#67).
- `terrain.dam_wall` blocks: no built ridge that is a dam in all but name (D115's principle).
- Both in the Python validator too (`prototype/storage.py`), with parity.
- **A1**: the Python validator requires `WaterSimulationMigrator.IsMigrated`; the oracle checks an
  unmigrated copy of a map in both validators.
- **A2**: the ZIP entry times are written from the timestamp's own fields; a DST-gap timestamp gives
  the same bytes in every time zone (`tests/contract/timezones.test.ts`).
- **The simulation speedups** (D130): the interior saturation count and the outflow directions,
  each proved bit for bit (every sha256, exact depths, Node and Chromium).

### The app

- Any is the default theme and first in the strip; Verticality has its slider (from 70 the land may
  rise above 16).
- The map's description says what the map is, its badwater choice ("No badwater sources; badtides
  still come", D200) and, above 16, that the game's map editor edits only up to 16 (D172). Any's
  maps are named "Dam Good Map" in the game's list.

### Changes in the session that resumed on the dedicated machine (2026-09-26)

- **Badwater at the distance the settings ask** (D200 (2)): the settler picks the real start,
  among the places nearly as good as the best, nearest the guess the hollows were planned from; and
  when the start still stands far from it (the settled water moved the good places), so the nearest
  badwater lies more than 26 tiles beyond the distance asked, the hollows are planned again from the
  start, once (as when they come too near). At 96² with a Badwater distance of 20 every map of
  seeds 1–8 now has its badwater 19–27 tiles off (47 and 68 on two before); Designed for (Easy →
  Hard) moves it 16 tiles.
- **The badwater budget's total** (D200 (3)): where fewer hollows fit than the budget asks (a
  small map), the ones placed share its total strength, each up to the builder's 3. Badwater Off →
  High now moves the badwater-to-clean ratio 0.86 (0.55 before).
- **Drought reserve** (decisions-pending #88, a default): a reserve larger than the theme's own adds
  valley lakes along the rivers and keeps a passing map without storage near the start while up to
  three more attempts look for one; a smaller reserve takes valley lakes away. The storage
  preference in `generate` never ran before (a passing map was never planned again). Scarce →
  Plenty moves the stored water 410 on seeds 1–4 and 810 on 1–12 (the wrong way before).
- **Start area** (D211; decisions-pending #87): its choices read Prefer tight, Normal and Prefer
  roomy, its note says it is a preference, and the map card shows the **Start bench** (level tiles
  round the district center, within 8). Its experiment and Theme's are information
  (`tools/settings-suite.ts` `info`).
- **The editor keeps other features' sources on their ground** (decisions-pending #89, a default):
  a lake, landform, set piece or move that would reshape the ground under another feature's water
  or badwater source is refused with the reason (Lake Basin seed 13's lake left a badwater spring
  floating).
- **Natural ramps only climb cliffs** (D209; found on the contact sheet): a ramp's route between
  the two grounds it joins is no longer than the ramp needs (2 tiles a level + 2, plus 2), and every
  tile of its path stands between its two ends' levels. Before, the ramp planner could regrade a
  route of up to 197 tiles across the map (Canyon 128² seed 12: 113 tiles from level 5 to 16) into a
  3-wide road with right-angle turns, or cut a ruler-straight slot through a plateau between two
  lower grounds (Highlands 128² seed 16: 25 tiles long, 9 deep, with shallow water in it, which the
  straightness measure did not see: it reads water 0.1 deep or more). Such an upland is now left to
  stairs, as #62 allows. Canyon and Highlands stay at 100% final on 20 seeds at 128².
- **Badwater ditches wind** (D209: badwater streams never run ruler-straight): a ditch to the
  nearest map edge was a straight line (a sideways step only added length; 20 tiles dead straight
  on Canyon 128² seed 17). Its line is now moved sideways by a wave (up to 2.5 tiles, 9–15 long,
  none at either end) and redrawn as side-to-side steps, where every tile is allowed. On seeds 1–6
  of every theme at 128² the longest straight run of a ditch fell from a median of 10 tiles (p90
  20) to 5 (p90 7); one ditch in 57, hemmed in by keep-off ground, keeps its straight route (30
  tiles, within the D209 limit of 44).
- **Relief below the theme's own** leans the land's top down to the spread PLAN §5.2 asks for (7 +
  0.08·relief levels from p5 to p95): Relief 20 now gives 8–10 levels at 96² (11–12 before, the
  target 8.6). The experiment moved 2.8, below its 3, once the ramps changed.
- **The last badwater spring** (Kyler's D213): removing it is never refused; the map becomes a No
  badwater map (`MapSession.badwaterRemoved`, `effectiveSpec`): its checks treat it so, its file
  says so in its description ("No badwater: a peaceful map…"), and undoing the removal brings the
  spring and the setting back. The delete's report says "that was the map's last badwater spring:
  the map is now No badwater, a peaceful map (badtides still come)" (the editor's and Claude's P09).
- **After the merge of `dev` (Live editing)**, on M9a's maps:
  - the page's stroke preview knows the generated field: the build's integrity pass (pits and
    spikes) only touches the tiles an edit changed from the stored field, as on an imported map,
    and caps at a tall map's top; the page ran it over every tile, so what it painted could differ
    from what the build (and the file) held by a tile (`brush.test`'s exactness on River Valley 3 and
    Islands 5 found it);
  - a brush's walkable ground (D204's ramped rim, a walkable smooth) gets slopes on its steps
    wherever it is: the slope rule only grew them from ground already joined to the start's, and
    M9a's terraced land leaves a stroke 40 tiles out off that network (a ramped flatten got no rim
    slopes on 11 of 12 maps; now 2–3 on most);
  - D213's quiet line: the editor's notices say "No badwater: you removed the map's last badwater
    spring, so this is a peaceful map now. Badtides still come." once it is gone, whichever way it
    went (Remove, a source's delete).
- **Tools:** `tools/settings-batch.ts --detail` (each seed's value), `tools/batches.ts` (every theme
  and size at once, reports in `investigation/m9a/local/batches/`, a summary table), and the batch
  report counts second-district sites and ruins on a rise (information).

### The starting-logs floor (D224, D227, D229), built in the same session

- **The floor** (`src/core/data/logFloor.ts` reads `log-floor.json`, nothing hard-coded: 178 logs
  within 40 tiles' walk for 1.1.2.4): `start.wood_floor`, a new check in both validators (the
  playability class: it rejects a generated map at every difficulty, and shows on the editor's quiet
  dot without blocking export; never approximate, since its logs are counted over the ground and its
  slopes, never the water). The same grown logs as `start.wood`, dead trees included, saplings apart,
  within the longer walk. Every species in the pin counts (Maple, ChestnutTree and Mangrove on
  imported maps); `TREE_LOGS` now comes from the pin. The map card and the editor's start indicators
  show it ("Logs for a Forester").
- **Minimum starting wood** stays `start.wood`, within 20 tiles' walk, with D227's defaults: Easy 250,
  Normal 200, Hard none (0); its range stays 0–800 (D227 replaced D224's "never below the floor").
  The generator's near-start groves aim at 1.35 × it, as before.
- **The floor's wood** (D229): after every other tree is planted, the grown logs within 40 tiles'
  walk are counted; where they come short of 1.15 × the floor, groves are added the way the land
  offers them (`floorWood` in `gen/resources.ts`): a river's banks on the start's side, the far side
  of water ("a forest across a stream"), a plateau two levels above the start (oaks), a side valley
  (ground below its surroundings, away from the water: pines), open moist ground, and last dry ground
  for standing dead wood (a dead tree keeps its logs). One kind is drawn by seed among those with
  room, weighted by their room and how natural each is; its grove starts on that ground and grows up
  to 3 tiles into the land beside it; its one species is drawn from the settings' mix weighted by
  where it grows, and sized by the logs it gives (a few oaks, a forest of pines). On Hard the wood
  goes beyond the 20 tiles' walk first ("trees that aren't easy to reach", PERFECT.md). A separate
  random stream, so a map that needs no wood keeps every other draw. The groves' roles name their
  kind (`forest/floor/<kind>/…`); the start's own groves are now `forest/start/…`.
- **Seen and counted:** the batch report says on how many maps wood was added, and each grove's kind,
  distance and direction from the start; `tools/start-sheet.ts` makes the start-area sheet (40 tiles
  round each start, the floor's groves outlined orange, the start's groves cyan).
- **The Real places** as converted plant their starts for the old 80 logs: 69 of the 85 fall short
  of Normal's 200 within 20 tiles and 20 fall below the floor. Their files are unchanged; the tests
  list them as known faults (`PLACES_SHORT_OF_WOOD`, `PLACES_BELOW_THE_FLOOR`) for Real places 2 to
  plant for, as the edge walls and the missing mine sites are.

### Starts stop looking alike (PLAN §20 D252 (1)), built 2026-09-27

The start-area sheet showed the same ring of groves and berry patches within about 10 tiles of
every start at Normal: the start rules' own planting for Minimum starting wood and Minimum starting
bushes (D85), planted first and evenly on the moist land nearest the start, and larger since D227's
200 logs. Now (`gen/resources.ts`; decisions-pending #93, a default):

- **The map's own groves and patches come first**, the start's share kept back; the start rules then
  add only what those leave short within 20 tiles' walk (1.35 × Minimum starting wood in grown logs
  and the berries' target, as before), the way the floor's wood does (D229); what the start does not
  use goes to the rest of the map afterwards, so the map's amounts stay the baseline's. On many maps
  the start stands in the map's own woods and the start rules plant few trees or none.
- **A layout per map** (`startLayout`, its own random stream `start-planting`): a side and a distance
  for the groves (a bearing, how strongly they lean to it, 1–3, and a walk of 6–17 tiles they gather
  round), a side and distance for the berries (with the groves, or 60° off to one side, 6–16 tiles
  out), a grove size (1–3 × the Grove size median) and an opening (D164's lever: as the mix, twice as
  often as oak-rich or a pine forest). Each tile of the walk gets a weight for groves and one for
  berries (basic operations only: `cosDet`, `sinDet`, `expDet`); they lean the draws and never forbid
  a tile.
- **The groves read the land** (`placeKinds`, shared with the floor's wood): each draws a kind of
  place within the walk (a river's banks, across the water, a plateau, a side valley, open ground),
  weighted by its room on the layout's side and by how natural it is (D229's weights), and grows from
  it into the land beside it; its species leans to the place and the opening. Roles name the kind
  (`forest/start/<kind>/…`; the start's patches are `berryPatch/start/…`).
- **The start's yard** (6 tiles from its middle) stays clear of its own planting where the walk has
  room elsewhere; standing dead groves on the walk's dry ground only where its moist land runs out,
  as before.
- **A walk short of moist land** (a narrow floodplain: less than 1.25 × the room the start's berries
  and trees need): the map's own groves and patches keep out of it on their first pass, and the
  start's groves draw their species by the wood they give (D164's tight rule), with no lean to the
  place or the opening, so all of that land goes to the start's wood as before. Found by CI on
  ca63a56: without it, River Valley 96² seed 1333 (one of the e2e determinism seeds) made no map (12
  attempts; three short of Minimum starting wood, the map's own low-yield groves having taken the
  scarce moist land, and the place's lean cutting the oaks). With it, the seed passes on its second
  attempt (the even planting took five).
- **Measured** by `src/core/analysis/startPlanting.ts` (the planting's share within 6 and 10 tiles,
  the directions it fills within 10, its lean to one side, its nearest tile, kinds and species) and
  `tools/start-spread.ts` (per theme and seed; see Results). Tested by
  `tests/contract/startPlanting.test.ts`: the measure tells a ring from a side, and on River Valley and
  Any at 96² (seeds 1–8) every start meets Minimum starting wood, Minimum starting bushes and the
  floor, the planting leans (mean lean above 0.45; the even planting it replaced gave 0.36 there and
  fails the test), at most 3 of 16 fill 6 of the 8 directions, yards stay clear, and the groves go to
  several kinds of place with oak-rich and pine-rich openings.

## Results

### The settings experiments (ROADMAP M6), CI's seeds 1–4 at 96²

**On the re-frozen generator (788c145's, after D252):** every experiment moves its target again
(`tools/settings-batch.ts --seeds 1-4`): Relief 4.8 (at least 3), Verticality 0.032 (0.03), River
style 0.096 (0.08), Braided 1.1 (1), River flow 5.81 (5), Drought reserve 367 (200), Lakes and
basins 3.4 (3), Badwater 0.80 (0.6), Badwater distance 25.7 (15), Berries near start 31 (30), Mine
sites 1.8 (1.5), Minimum starting wood 163 (60), Minimum starting bushes 76 (30), Designed for 21.8
(10), the rest as before; Start area and Theme information (−46 and 0.078). Berries near start now
sits at its threshold too (43 before D252): with the map's own patches first, a low setting still
finds the map's berries near the start. M9b's changes will need Verticality, Braided and Berries
near start looked at again.

Before D252 (kept as written): every experiment moves its target on the final generator (`tools/settings-batch.ts --seeds 1-4`):
Relief 4.5 (at least 3), Verticality 0.036 (0.03, 8 seeds), Buildable land and its reach, Rivers
(exact), River style 0.096 (0.08), Braided 1.0 (1, 8 seeds), River flow 5.8, Drought reserve 668
(200), Lakes and basins 3.3 (3, 12 seeds), Waterfalls, Badwater 0.80 (0.6), Badwater distance 22.4
(15), the objects, the resources, Berries near start 43 (30), Water without stairs, starting wood
103 (60, 8 seeds), starting bushes, both start rules, Designed for 19.7 (10). Start area and Theme
are information (D211): −23 and 0.066. Verticality and Braided pass at their thresholds; M9b's
changes will need them looked at again.

### The full batches on the re-frozen generator (788c145; ROADMAP M9a: ≥ 98% final per option and size, blocking)

On 788c145's generator (its code as of 5e15143), 100 seeds of every option at every size
(`tools/batches.ts`, reports in `investigation/m9a/local/batches-d252/` and
`investigation/m9a/local/batches-d252-hard/`, out of git, D195; the commands are in "Next session").
**Every option and size at 98% final or better.** Three seeds of 2,800 make no map, each after 12
attempts: 192² Any 33 (one attempt short of wood on a tight walk, the others the water) and 78, and
96² Lake Basin 99; 78 and 99 made no map on the even planting either. The straight channels stay
within real terrain's and the official maps' limits everywhere (the longest bank 44 at 256² Canyon,
the limit itself; the longest canal 34.0). Times are with eight to ten batches at once on the
machine. Why attempts failed, over the Normal batches: the water not settling 616, a source in a
flow 615 and 324, the start's water moved 347, Minimum starting wood 271, no start 246, the floor
157, Minimum starting bushes 143.

Normal:

| Size | Option | Final | First attempt | Time median / p90 (ms) | Longest straight bank (limit 44) | Longest canal (limit 34.3) | Floor wood added |
|---|---|---|---|---|---|---|---|
| 96² | Any | 100/100 | 49% | 4,711 / 15,434 | median 19, max 35 | median 10.4, max 23.9 | 0 |
| 96² | River Valley | 100/100 | 54% | 3,727 / 8,592 | median 19, max 29 | median 11, max 21.9 | 0 |
| 96² | Canyon | 100/100 | 56% | 3,249 / 9,735 | median 20, max 32 | median 11.6, max 17.4 | 0 |
| 96² | Highlands | 100/100 | 50% | 3,283 / 12,178 | median 19, max 35 | median 11.1, max 17.6 | 0 |
| 96² | Lake Basin | 99/100 | 49% | 4,307 / 13,336 | median 18, max 29 | median 9.9, max 19.8 | 0 |
| 96² | Delta | 100/100 | 47% | 5,372 / 15,499 | median 20, max 33 | median 11.5, max 19.1 | 1 |
| 96² | Islands | 100/100 | 85% | 3,307 / 7,942 | median 22, max 30 | median 13, max 19 | 0 |
| 128² | Any | 100/100 | 55% | 7,845 / 21,322 | median 21, max 33 | median 12.2, max 27.9 | 0 |
| 128² | River Valley | 100/100 | 59% | 5,550 / 15,633 | median 20, max 35 | median 11.2, max 17.9 | 0 |
| 128² | Canyon | 100/100 | 56% | 5,769 / 14,899 | median 21, max 34 | median 12.2, max 33 | 0 |
| 128² | Highlands | 100/100 | 65% | 5,551 / 14,779 | median 20, max 33 | median 11.7, max 21 | 0 |
| 128² | Lake Basin | 100/100 | 59% | 7,691 / 14,446 | median 19, max 34 | median 11.3, max 21.8 | 0 |
| 128² | Delta | 100/100 | 68% | 5,673 / 16,158 | median 21, max 36 | median 12, max 19.9 | 0 |
| 128² | Islands | 100/100 | 82% | 5,019 / 11,590 | median 23, max 36 | median 13.4, max 27.9 | 0 |
| 192² | Any | 98/100 | 43% | 45,016 / 132,050 | median 23, max 37 | median 13.4, max 23.2 | 0 |
| 192² | River Valley | 100/100 | 56% | 18,723 / 54,224 | median 22, max 39 | median 13.2, max 27.9 | 0 |
| 192² | Canyon | 100/100 | 55% | 21,374 / 80,097 | median 22, max 37 | median 13.1, max 33 | 0 |
| 192² | Highlands | 100/100 | 69% | 18,755 / 62,864 | median 23, max 37 | median 13, max 34 | 0 |
| 192² | Lake Basin | 100/100 | 48% | 27,846 / 62,907 | median 22, max 36 | median 13, max 29 | 0 |
| 192² | Delta | 100/100 | 62% | 19,079 / 40,226 | median 23, max 35 | median 13.4, max 21 | 0 |
| 192² | Islands | 100/100 | 71% | 16,799 / 39,629 | median 23, max 36 | median 14.3, max 34 | 0 |
| 256² | Any | 100/100 | 37% | 87,603 / 217,101 | median 24, max 39 | median 13.9, max 28 | 1 |
| 256² | River Valley | 100/100 | 48% | 68,979 / 170,456 | median 23, max 38 | median 13.4, max 23.8 | 0 |
| 256² | Canyon | 100/100 | 48% | 53,829 / 147,302 | median 23, max 44 | median 13.4, max 30 | 0 |
| 256² | Highlands | 100/100 | 52% | 58,634 / 126,575 | median 23, max 40 | median 14.3, max 34 | 0 |
| 256² | Lake Basin | 100/100 | 38% | 79,901 / 233,028 | median 23, max 34 | median 13.4, max 30 | 0 |
| 256² | Delta | 100/100 | 50% | 65,635 / 184,433 | median 23, max 35 | median 13.5, max 29.1 | 0 |
| 256² | Islands | 100/100 | 62% | 55,405 / 181,753 | median 21, max 38 | median 12.2, max 30 | 0 |

Hard, 128² (the floor's wood added on the maps counted in the last column):

| Size | Option | Final | First attempt | Time median / p90 (ms) | Longest straight bank (limit 44) | Longest canal (limit 34.3) | Floor wood added |
|---|---|---|---|---|---|---|---|
| 128² | Any | 100/100 | 44% | 19,265 / 46,612 | median 21, max 35 | median 11.9, max 21 | 59 |
| 128² | River Valley | 100/100 | 60% | 9,798 / 37,235 | median 20, max 31 | median 11.7, max 27 | 49 |
| 128² | Canyon | 100/100 | 43% | 16,908 / 43,986 | median 21, max 33 | median 12.4, max 31.9 | 47 |
| 128² | Highlands | 100/100 | 64% | 9,221 / 25,642 | median 20, max 35 | median 12, max 17.7 | 46 |
| 128² | Lake Basin | 100/100 | 61% | 12,221 / 38,199 | median 19, max 39 | median 10.5, max 20 | 60 |
| 128² | Delta | 100/100 | 58% | 12,237 / 32,306 | median 21, max 31 | median 11.4, max 18 | 54 |
| 128² | Islands | 100/100 | 81% | 8,952 / 25,436 | median 22, max 35 | median 13.4, max 22 | 40 |

### The full batches at Normal before D252 (superseded: D252 changed every map; kept as written)

On the frozen generator (`tools/batches.ts --seeds 1-100`, reports in
`investigation/m9a/local/batches-final/`, out of git). Stopped part-way for the session restart; the
rest is step 1 of "Next session". Finished runs:

| Size | Option | Final | First attempt | Time median / p90 (ms) | Longest straight bank (limit 44) | Longest canal (limit 34.3) | Floor wood added |
|---|---|---|---|---|---|---|---|
| 256² | Any | 100/100 | 39% | 63,558 / 140,427 | median 23, max 39 | median 14.1, max 28.0 | 0 |
| 256² | River Valley | 100/100 | 49% | 43,646 / 114,089 | median 23, max 38 | median 13.4, max 23.8 | 0 |
| 256² | Canyon | 100/100 | 46% | 35,691 / 105,918 | median 23, max 44 | median 13.4, max 30.0 | 0 |
| 256² | Highlands | 100/100 | 53% | 36,872 / 87,572 | median 23, max 40 | median 14.3, max 34.0 | 0 |
| 256² | Lake Basin | 100/100 | 39% | 53,515 / 164,716 | median 23, max 34 | median 13.4, max 30.0 | 0 |
| 256² | Delta | 100/100 | 52% | 42,469 / 127,908 | median 23, max 35 | median 13.4, max 29.1 | 0 |
| 256² | Islands | 100/100 | 62% | 39,422 / 111,374 | median 21, max 38 | median 12.3, max 30.0 | 0 |
| 192² | Any | 99/100 | 43% | 24,487 / 79,152 | median 22, max 37 | median 13.2, max 23.2 | 0 |
| 192² | River Valley | 100/100 | 56% | 14,446 / 38,980 | median 22, max 39 | median 13.3, max 27.9 | 0 |
| 192² | Canyon | 100/100 | 55% | 17,044 / 51,559 | median 22, max 37 | median 13.0, max 33.0 | 0 |
| 192² | Highlands | 100/100 | 71% | 13,465 / 38,749 | median 23, max 37 | median 13.0, max 34.0 | 0 |
| 128² | River Valley | 100/100 | 60% | 4,195 / 10,952 | median 20, max 35 | median 11.2, max 18.6 | 0 |

Stopped part-way, every map made so far passing: 128² Any 88/88, Canyon 93/93, Highlands 10/10,
Lake Basin 3/3; 192² Delta 79/79, Islands 46/46, Lake Basin 94/94. Not started: 128² Delta and
Islands, and 96². Any 192² seed 78 makes no map in 12 attempts (the water never settles, or no river
or no start, on each). Times are with seven batches at once and other runs beside them on the
machine.

### "Any" measured like each theme (ROADMAP M9a; information, D115)

60 seeds of every option at 128² on the final generator (`investigation/m9a/any-measures.ts`, the
maps made by design version 2's batch with `--gen current`; records in
`investigation/m9a/local/generative/`, out of git):

| Option | Final | First attempt | M1 nearest other: min / p10 / median (≥ 0.25 each, median ≥ 0.40) | M2a largest whole-map cluster (≤ 15%) | M2b river networks: largest / shapes | M2c relief: largest / shapes |
|---|---|---|---|---|---|---|
| Any | 100% | 56.7% | 0.404 / 0.461 / 0.514 | 10 of 60 (16.7%) | 10% / 50 | 5% / 25 |
| River Valley | 100% | 56.7% | 0.413 / 0.429 / 0.491 | 26 of 60 (43.3%) | 18.3% / 45 | 10% / 19 |
| Canyon | 100% | 58.3% | 0.381 / 0.402 / 0.468 | 25 of 60 (41.7%) | 13.3% / 50 | 6.7% / 16 |
| Highlands | 100% | 61.7% | 0.383 / 0.419 / 0.477 | 18 of 60 (30%) | 13.3% / 44 | 6.7% / 13 |
| Lake Basin | 100% | 58.3% | 0.418 / 0.466 / 0.494 | 17 of 60 (28.3%) | 21.7% / 46 | 5% / 18 |
| Delta | 100% | 65% | 0.401 / 0.417 / 0.477 | 23 of 60 (38.3%) | 15% / 49 | 5% / 17 |
| Islands | 100% | 86.7% | 0.285 / 0.313 / 0.364 | 52 of 60 (86.7%) | 21.7% / 42 | 8.3% / 23 |

Any is coherent and playable (every map passes), has no clones (every map's nearest other at least
0.40 on the variety scale) and the most river and relief shapes of the seven; its largest whole-map
cluster is 16.7%, just over the 15% aim (information). The named themes cluster more, as leanings
do (Islands most: its maps share the broad sea). M3 (openings) and M4 (no approximation) need the
workshop maps, which live on Kyler's main PC.

### The starting-logs floor (D224, D227, D229)

- **After D252 (788c145's generator; the tables under "The full batches"):** Hard at 128² stays
  100% final on all seven; the floor's wood was added on 355 of the 700 maps (Any 59, Lake Basin 60,
  Delta 54, River Valley 49, Canyon 47, Highlands 46, Islands 40): 1,227 groves, by kind across the
  water 365, standing dead on dry ground 342, riverside 189, open moist ground 159, side valley 85,
  dead on a plateau 68, oaks on a plateau 19. At Normal it was added on 2 of the 2,797 accepted maps.
- **Hard, 128², seeds 1–100 of every option** (`tools/batches.ts --sizes 128 --difficulty hard`,
  `investigation/m9a/local/batches-hard/`; before D252, kept as written): 100% final on all seven (first attempts 44–83%). The
  floor's wood was added on 326 of the 700 maps (Any 54, Lake Basin 51, Delta 49, Canyon 47, River Valley 47,
  Highlands 43, Islands 35): 1,108 groves, by kind across the water 367, standing dead on
  dry ground 293, riverside 150, open moist ground 140, side valley 83, dead on a plateau 55, oaks on
  a plateau 20; their middles 4–39 tiles from the start (medians 17–22), in every direction about
  evenly (each of the eight between 7 and 34 groves per option).
- **Normal:** the start's own groves for Minimum starting wood (200 logs within 20 tiles' walk) meet
  the floor on every map seen: no floor wood on the 120 maps of the start-area sheet (see the batch
  table for every size and option).
- **Every map meets it:** the floor rejects a map in the generate profile, so every accepted map of
  every batch has it; the 15 probe maps hold 240–1,307 logs within 40 tiles' walk.
- **The start-area sheet** (`docs/sheets/m9a-start-areas.png`; `npx tsx tools/start-sheet.ts`):
  40 tiles round each start, seeds 1–30 of Any, River Valley, Canyon and Highlands at 128², Normal
  and Hard; the floor's groves outlined orange, the start's own groves cyan. What it shows, plainly:
  - at Hard the added wood follows each map's own water and land, in every direction and at every
    distance within the walk; its living groves hug the banks (living trees need moist soil, which
    on M9a's land is a narrow band by the water), and about a quarter of its groves are standing
    dead wood on dry ground where the moist band had no room;
  - at Normal the floor adds nothing; what recurs beside every start is the start's own planting
    (D85: groves for Minimum starting wood and patches for Minimum starting bushes on the moist
    ground within about 10 tiles, cyan and magenta), which D227's 200 logs made larger. It follows
    each map's water, but it is recognisably the same arrangement at every start (River Valley 7's
    groves ring its start). That is the start rules' planting, not the floor's; spreading it over
    the 20 tiles' walk the way `floorWood` reads the land would be the change, for Kyler to decide.
    *(Kyler decided it: D252 (1), built 2026-09-27; the sheet above shows the planting before it.
    The sheet after it is part of D252 (2)'s review set.)*

### Starts stop looking alike (D252 (1)): the start rules' planting before and after

`npx tsx tools/start-spread.ts --themes any,riverValley,canyon,highlands,lakeBasin,delta,islands --seeds 1-16 --size 128`,
Normal, 112 starts; "before" is the even planting at 0f70fcb's generator (with the start's patches
given their own role to be measured), "after" the re-frozen generator (37b2f50, the same maps as
ca63a56). A ring: 6 or more of the 8 directions round the start each holding a sixteenth of the
planting within 10 tiles. Lean: how much the planting sits to one side (0 all round, 1 on one bearing).

| | Rings | 5+ directions filled | Mean lean | Share within 6 tiles (median) | Share within 10 tiles (median) | Plants the start rules planted (median) |
|---|---|---|---|---|---|---|
| Before | 14 | 36 | 0.38 | 19% | 54% | 140 |
| After | 3 | 12 | 0.54 | 13% | 45% | 112 |

Every start of both meets Minimum starting wood, Minimum starting bushes and the floor. Starts
with standing dead trees in the start's own groves, at 96² (River Valley, Any, Canyon, Highlands,
seeds 1–12): 11 of 48 before, 9 after; at 128² after: 17 of 112. The kinds of place the groves went
(after, 128², 715 groves): open ground 279, river banks 229, across the water 105, side valleys 80,
and dead wood on dry ground 22 where the moist land ran out; no plateau (moist ground two levels
above the start is rare on 0.7.0's land). Zoomed crops of River Valley and Any seeds 1–16
before and after were looked at (not committed): before, cyan groves and magenta patches round
nearly every start; after, the planting on one side or farther out, and many starts standing in the
map's own woods. A start whose walk is mostly moist land still gets trees on every side.

### The Claude suite (D134)

> **No longer an M9a gate (PLAN §20 D277, 2026-09-27): all M12 work is deferred, preparation
> included.** The suite is not re-run or re-tuned for D252's maps; its files and the Claude code stay
> as they are, and a quick or CI test that depends on them and breaks is skipped with a note pointing
> to D277. A run on 37b2f50's maps, stopped part-way when the generator changed again, had 16 of its
> first 69 cases failing, 6 of them new since the floor's maps (S04, S06, S07, P01, P03, F09: sites
> or ground near the start that the map's own woods now fill). What follows is as it stood before.

`npx tsx investigation/claude/bin/reference.ts`: 81 of 120 on 0.7.0 before the re-tune (the
handoff's 81), 100 after it (the full run gave 99; F05's re-tune came after it). After the merge of
`dev` (Live editing re-expressed lakes as a Lower stroke and a spring, D184): 96 of 120; with the
starting-logs floor's maps (D227's 200 logs at Normal) and the re-tunes below: **103 of 120** (118 of 141 with the 21 cases added since, B01–B21, which pass 15).
Re-tuned, each to the map as it now is, the pass criteria unchanged (`bin/retune.ts` runs a setup's
cases against candidates):
- After the Live editing merge and the floor: `rv96-lakes` (River Valley 96² seed 9) for P01, M02,
  X03 and Z05 (seed 3's start sits on a low bench where every lake near it floods its berries and
  wood; seed 14 held one until the floor's maps made its lake 23 tiles); `rv128-lakes` (seed 5) for
  C01 and J11 (rv128's northeast corner has relics beside every hollow, and its south third a river
  everywhere); `rv128-lake-start` (seed 2) for S06 (on seed 17 no spot nearer its lake meets Normal's
  200 logs within 20 tiles' walk); `rv128-tribs-south` on seed 44 (W13's dam site below the junction
  moved above it on seed 23); P08's creek from the north edge into rv96's river as it now flows,
  (28, 95) to (52, 75). W04 stays: on every seed with a south tributary tried the lake is found but
  its river is named "the inflow from the south edge", not "the south tributary", or no lake fits.
- `rv128-fall` (S05, F01–F04, F09, I03, Q06): the 20-wide fall's lip from (78, 108) to (88, 116),
  still in the north part, facing south: the old lip broke `extras.placement`.
- `rv96-creeks` (W06, W07), `rv128-east` (W05) and P08's creek: each creek drawn from its edge into
  the main river the map now has (their old ends were on no river; P08's runs north to south).
- `rv96-lake` (F05): the lake near the start stands at level 3 (the site search's lake stood at
  level 1, which no lake can be made deeper than).
- `rv128b` (S06, S07, W01, W08): seed 17 (seed 2's start had no room for a dam site near it; 17
  passes S06, S07 and W01).
- `rv128-tribs-south` (W04, W13), a new setup at seed 23: a River Valley whose tributary enters from
  the south edge (`rv128-tribs`, seed 7, keeps the north one for W03 and Q05).
- Stale expectations (D148): J03 and M06 check Normal's badwater rule, 15 tiles since D85 and #34
  (they checked 30, the rule before); Q04 the water rule, 20 (it checked 16); Q02 counts the map's
  rivers (it counted 3 set pieces and a dam site: D209 stamps none); Q01 names the checks `rv48`
  fails now (`start.reach`, `water.storage_possible`); I05 the direction `rv96`'s river flows now
  (southwest to northeast).
- Not re-tuned, and why: the tributary cases (W03, W04, W13, M09, W11) name a tributary from the
  north and one from the south edge, and on 0.7.0's River Valley maps with three rivers the inflows
  enter on the main river's own edge or one beside it (none of seeds 1–200 has both; the flow
  directions are M9b's, D209); the dam-site cases (S07, W08, M01, M04, X08, and F07–F08's setup)
  ask the old dam-site builder for reservoirs the land here does not hold (#63: the natural narrows
  replaces it for M12's Claude); W02, W15 and M05 place falls where the land's own falls or a bed at
  level 0 leave no room; J05's map is already at the 16 cap below high Verticality; J11's south
  third holds a river everywhere; X01's start stands at the head of its river (nothing is upstream);
  P04's new patch lands outside the start's 20-tile walk; I07's premise (badwater cannot fit on a
  48² map) held under the old 30-tile rule only.

### The DGM Probe batch 20260927-0853-batch (the orchestrator's, on 788c145's maps)

15 maps played through a drought and a badtide with Kyler's installed mods: 98 checks passed, 5
failed (results in `C:\dgm-probe\results\20260927-0853-batch\`, out of git). Diagnosed with small
checks against the generator's own water simulation (`src/core/sim/water.ts`, the game's rules):

- **The cause of 1, and most of 3 and 4: the file wrote every outflow as 0.** Restarted from a
  probe file's stored depths with its flows at rest, the simulation gives the game's day 1 exactly
  (Delta 128² seed 1: volume 2,582 → 2,650 and 78.5% of wet tiles within 0.1, the worst tile
  (53, 63) 1.015 → 0.759 against the game's 0.760; the weir map 1,728 and 1,806 wet tiles, the
  game's; the Hard map 1,205 against the game's 1,207). Continued with the settle's own flows, the
  same water holds a day (Delta 100% within 0.1, volume 2,582 → 2,584; the weir map 1,713 → 1,713;
  the Hard map 1,125 → 1,126). The settle was right; the file threw its momentum away
  (`world.ts`: "outflows 0, momentum rebuilds within a few ticks", as official maps ship), and the
  game restarted every river from rest. Every map surges (3–8% more water in the first 128 ticks)
  and most settle back within 0.1; a map whose flow can settle more than one way re-routes: seeds
  1–30 of every option at 128², 4 of 210 (Canyon 1, Delta 2, Islands 1) below 95% within 0.1 a day
  after a restart from rest.
- **The fix (the orchestrator's go):** the settled outflows go into the file
  (`WaterMapNew.ColumnOutflows`, the game's `Bottom:Left:Top:Right` of `targetIndex|flow`, targets in
  its grid padded by one tile, `settledSimulationSingletons`; FORMAT.md §4.3). Depths, every check
  and every generator decision are unchanged, so the batches stand; the bytes of every file change
  (generated maps, the editor's exports of imports, and the Real places, which share the writer:
  their gallery index re-pinned; Real places 2's branch picks it up at merge). Loaded with its
  outflows, the stored water holds a day (`tests/contract/outflows.test.ts`: Delta 128² seed 1 over
  99% within 0.1). The Python oracle: 0 round-trip failures, 0 disagreements. The probe maps are
  rebuilt for the whole M9a group to be played again.
- **Failure 2** (Delta, cal-timeline after the drought: wet tiles 2,120–2,220 in the game against
  2,311–2,462 in the model, the volume within 0.8%): Delta's flats hold thin sheets near the probe's
  0.05 wet threshold, and the refill's split between its channels depends on the path (the
  simulation restarted from rest gives a third answer, 2,297–2,453). Partly the start from rest;
  if it persists after the fix, it is the check's 5% on wet tiles for a braided delta: Kyler's call.
- **Failure 3** (Hard 128² seed 5, cal-timeline: water 1,207 in the game against 1,160 in the model
  on day 1): the game matches the restart from rest; the cycle model (`investigation/cycles` at
  a9cdb86) does not reproduce the momentum reset. The fix should close it; otherwise it is the
  model's fidelity, not the map.
- **Failure 4** (the weir map, cal-timeline: 1,806 wet tiles in the game against 1,550 in the model
  on days 1–2): the same; the 256 extra tiles are thin sheets (the water check passed at 100%).
- **Failure 5** (Any 128² seed 1, m9a-badwater: 21 tiles 10–21% bad more than 3 tiles from the
  file's badwater, just before the badtide): not the stored water (days 1 and 2.83 match the file,
  in the game and the simulation). At the refill after the drought, badwater reaches a side pool at
  (77–80, 92–93) beside its way down before the clean water flushes it; the simulation shows the
  pool turn bad at the refill (day 6) and clear by day 7, the game keeps it 10–21% bad through day
  8.83. The start's water stays clean (0%; the pool is about 42 tiles from the start). The rule
  "only within 3 tiles of the file's" does not allow for that: Kyler's call on the tolerance, or
  M9b (keep badwater's way down clear of stagnant pools). Not a contamination-timing artefact of the
  model at a hazard's start: this check compares the game with the file, and the pool turned bad
  before the badtide.

### The DGM Probe re-run 20260927-1443-batch (the rebuilt maps, their outflows in the file)

The orchestrator played the 15 rebuilt maps: 99 checks passed, 4 failed (`C:\dgm-probe\results\20260927-1443-batch\`,
out of git). The water check now passes on all 15 (Delta 128² seed 1: 97.3% within 0.1 after a day,
78.5% before), and the Hard map and the weir map pass cal-timeline. Diagnosed without launching the
game, from the run's own snapshots, with the probe's own code (`evaluate`, the run's results) and
the cycle model it compares against, run two ways:

- **What cal-timeline and drought-start-water compare against:** the cycle model
  (`investigation/cycles` at a9cdb86, `investigation/probe/runner/model.ts`), started from the
  file's depths with every flow at rest (`fileState`: "momentum is zero"; `runModel` does not pass
  the model's `settleMomentum` option). Not the product's editor run. That start was right while
  files stored their outflows as 0; since 0d9e473 the game loads the stored outflows and the model
  does not, so the reference is stale. Given the file's stored outflows as its starting momentum
  (the model's own `settleMomentum`, fed the file's `ColumnOutflows`), the same model follows the
  game: Delta day 1 water 2,606/2,606, wet 2,486/2,486, moist 7,090/7,090 (from rest: 2,640, 2,326,
  6,660), and every wet tile the same through day 9.83; Canyon's start water 21.3%/21.3% and
  0.0%/0.0% (from rest 43.0% and 15.2%).
- **The product's editor run** (the Drought and Badtide buttons, `startWeather`: `WaterSim` from
  the settled water at rest, the sources off at once for the whole drought) does not follow the
  game either way, and not because of the outflows: the game eases its sources down before a
  drought and back up after (`DroughtWaterStrengthModifier`), so over the probe's weather the
  editor run is a day late at the drought's start (No badwater seed 6, day 2.83: 1,787 water against
  the game's 765; Canyon 506 against 324). With the stored outflows it moves little (Delta day 1:
  2,584 against 2,650 from rest; the game 2,606).
- **1. Any 128² seed 1, m9a-badwater:** unchanged from the first run, to the tile (386 badwater
  tiles, 403 in the file; the same 21 tiles; (77, 92) 17.7%, (78, 92) 10.2%, (77, 93) 21.0%,
  (78, 93) 14.9%). The model with the outflows gives the same pool the same contamination to 0.1%
  (after the drought, day 7: 12.3% in the game, 12.4% in the model; before the badtide: 17.7% in
  both). A clean side pool empties in the drought and fills again with water carrying badwater:
  the map, not the measure. The start's water stays at 0%.
- **2. Canyon 128² seed 1, drought-start-water (new):** the stale model only. With the outflows the
  model gives the game's 21.3% and 0.0% (gap 0.0% of the start volume, against 19.2%). The "one
  tile" is the probe's pick, not the start's water: the nearest tile 0.3+ deep is a sealed
  one-tile hole at (63, 77) (0.88 deep, 4.2 tiles from the start), touching the river only
  diagonally, where water does not flow. The start's water is the river beside it (440 tiles, 337
  water, 4.5 tiles away) and a 19-tile pool 5 tiles away. `start.water` passes (clean water a pump
  reaches 2.4 tiles' walk from the start; Normal allows 20); the rules set no size for the start's
  water, and the drought reserve is information since M9a (#67). Through the game's first drought
  (3 days at Normal) the river beside the start drains (337 → 15 water after a day, 4.9 at the end),
  and the 19-tile pool holds: 17.8 → 13.0 at the drought's start → 7.8 at its end, all 19 tiles
  still 0.3+ deep and clean. Whether that is enough for PERFECT's "the start still survives its
  first cycles" is Kyler's eye; the probe colony builds no pumps, so it cannot say.
- **3. Delta 128² seed 1, cal-timeline:** with the outflows the model matches the game through day
  9.83 (every wet tile the same; mean |Δ| 0.0002–0.0005), and the check still fails at 19.3% on wet
  tiles (water within 1.7%). After the drought's refill (from day 7) the two differ in thin films
  under the 0.05 wet threshold on the flats around (38–47, 41–48) (e.g. (45, 46): 0.040 in the game,
  0 in the model). In the badtide, from about day 9.5, the game's film spills a sheet onto the level-3
  and level-4 plain south of it (x 29–47, y 15–45: 237 tiles 0.06–0.10 deep at day 10; the 3-tile hole
  at (44, 32) refilled from 0.53 to 1.08 deep), and by day 11 the sheet runs on to the bottom-left
  edge. The game holds about 40 more water than the model instead of draining it off the map. Every
  source runs at full strength throughout in the game's snapshots, and the model does not flip under
  tiny changes to its start (depths ±1e-6, outflows ±1e-5, outflows rounded to float32: 2,085 wet
  tiles on days 10 and 11 in every one). So this is Delta's flats: after a drought the refill's thin
  films pick their own way, and here one reaches the plain in the game and not in the model. What a
  player sees: a shallow sheet over part of that plain a day into the badtide. For Kyler, as parked.
- **4. No badwater (Any 128² seed 6), cal-timeline, day 3.83:** 449 wet tiles in the game, 420 in
  the model (6.5% of the larger; the check allows 5%); the water 116/116. The 29 tiles are the river
  draining through the threshold at that moment, all of them 0.04–0.06 deep in both (six of them
  0.05001–0.05009 in the game and 0.04962–0.04998 in the model, e.g. (80, 66) 0.050035 against
  0.049909), and 70/70 wet four hours later. The model with the outflows gives the same 420; the
  first run had 421/420 at that moment. The measure, not the map or the model; the tolerance is not
  changed.

With the model started from the file's outflows, 2 and the stale part of 3 go away; 1 is the map's
behaviour (the model agrees with the game), 3 is Delta's post-drought flats and 4 is the wet-tile
threshold. The model change is in the probe (`runModel`), not the generator, and waits for the
orchestrator.

### The probe fixed, and the re-run judged again (20260927-1443-batch-recompare)

The orchestrator's go (a stale reference corrected, not a tolerance changed), in `investigation/probe`:

- **The model starts from what the game loads.** `runModel` gives the cycle model the outflows the file
  stores (`storedOutflows` in `runner/mapfile.ts`, each part's target checked against the game's padded
  grid; the model's own `settleMomentum`). A file that stores every outflow as 0 starts at rest, as
  before. `verdicts.json` records each model's start (every M9a map: "the file's outflows", 1,795–37,120
  flowing).
- **The start's water is the water `start.water` counts** (`startWaterOf` in `runner/catalog.ts`): clean
  water a pump reaches (0.3 deep or more, under 5% badwater, its surface 0–2 levels below the shore)
  beside a shore tile the start walks to within the difficulty's walk (12 / 20 / 28), over the map's own
  ground and slopes, walking blocked by the same objects, and the whole bodies of water (4-connected,
  over 0.05 deep) those tiles belong to. `drought-start-water` measures those bodies together;
  `m9a-badwater` and the sampled tiles take the six nearest by walk. On Canyon 128² seed 1 that is 3
  bodies, 460 tiles, 356 water: the river beside the start (440 tiles), the 19-tile pool 5 tiles away and
  the sealed hole at (63, 77), which `start.water` itself counts (its nearest water, 2.4 tiles' walk,
  tied with the river at (64, 78)). **For Kyler:** `start.water` counts a sealed one-tile hole holding
  0.9 water as the start's water. On Canyon seed 1 the river also passes, so the verdict stands; the rule
  sets no size.
- **`--compare-only RUN --compare-to NAME`** judges a run again into `results\NAME` and `sheet\NAME.html`,
  leaving the run's own verdicts, summary and sheet as they were (checked: their hashes unchanged), and
  refuses when this checkout builds other maps than the run played (all 15 byte for byte the same).
- **Self-test** (`npm --prefix investigation/probe test`): all passed, 49 checks (44 before), among
  them the stored outflows read on an M9a map, the model's start (outflows on an M9a map, at rest on
  the M8 file), and the probe's nearest start water the same walk and tile as the product's
  `start.water` on every M9a map. Typecheck ok.

Judged again: **99 passed, 4 failed** (the same count, not the same four):

| Map | Check | 1443-batch (model at rest) | recompare (model from the outflows) |
|---|---|---|---|
| Any 128² seed 1 | m9a-badwater | failed (21 tiles, the side pool) | failed, unchanged (the check does not use the model) |
| Canyon 128² seed 1 | drought-start-water | failed (1 tile; gap 19.2%) | **passed** (460 tiles; gap 0.4%: 71.9 / 7.4 / 3.6% left, model 71.5 / 7.4 / 3.6%) |
| Delta 128² seed 1 | cal-timeline | failed (wet 16.2%) | failed (wet 19.3%, water 1.7%; the model matches the game to day 9.83) |
| Islands 128² seed 1 | cal-timeline | passed (water 4.4%, wet 4.1%) | **failed** (wet 5.8% on day 3.83: 2,451 / 2,310; water 1.7%) |
| No badwater seed 6 | cal-timeline | failed (wet 6.5%) | failed (wet 6.5%, water 0.3%) |

Every other cal-timeline is closer to the game than before (largest water differences 0.1–1.1%, from
up to 4.5%; Any 256² 3.9% → 0.1%, Canyon 4.5% → 1.1%, Hard 3.0% → 0.2%). **Islands is the wet-tile
threshold, like item 4:** a day into the drought the game has 141 wet tiles the model does not, every
one 0.048–0.051 deep (e.g. (85, 1) 0.050 in the game, 0.048 in the model), none more than 0.1 apart,
all of them on the flats draining at that moment (x 25–88, y 1–32), and 1,605 / 1,605 four hours later.
The model itself swings as much under changes far below what a file can hold: at that moment it gives
2,310 wet tiles as loaded, 2,302 and 2,450 with its start depths moved by ±1e-6 (two draws), 2,374
with the outflows moved by 1e-5 of themselves and 2,307 with them rounded to float32; the game's 2,451
is at the edge of that spread (the model is deterministic: 2,310 run after run). From rest it passed,
its largest difference 4.1% of wet tiles on day 1. The tolerance is not changed; with No badwater
seed 6 it is Kyler's call on the wet-tile threshold.

### Kyler's D302: the probe's findings (2026-09-28)

- **The wet-tile counts are judged as D297 judges water** (item 3): `cal-timeline` leaves out of both
  counts every tile within 0.01 of the 0.05 wet line in the game or the model (`runner/compare.ts`;
  the raw counts stay in the detail beside the judged ones; a self-test check: 20% of wet tiles moved
  to 0.045 change nothing, to 0 fail). Judged again (`C:\dgm-probe\results\20260927-1443-batch-recompare-d297\`):
  **101 passed, 2 failed.** Islands 128² seed 1 passes (wet tiles 0.5%, from 5.8%) and No badwater
  seed 6 passes (0.9%, from 6.5%); every other cal-timeline's wet tiles 0.0–2.5%, water 0.1–1.7%.
- **Handed on to M9b (D302):** item 1, Any 128² seed 1's clean side pool at (77–80, 92–93) that
  empties in the drought and refills with badwater (10–21% bad before the badtide; the model agrees
  with the game), and item 2, Delta 128² seed 1's flats spreading a thin sheet over the plain in the
  badtide (`cal-timeline`, wet tiles 19.6%). These are the two checks the D297 recompare still fails.
- **Item 4, the start's water in a sealed puddle:** counted over the batches before the release (the
  next section).

### Found and parked

- **Edge inflows that run backwards** (information, for M9b's hydrology): on 3 of 36 edge inflows
  (seeds 1–6 of every theme at 128²) the settled water rises along the first 40 tiles of the
  planned course by more than 0.3 (Any 3's and Lake Basin 4's main rivers, Delta 6's inflow): the
  mouth sits in the lowest ground (a flat the outlets or the edge relaxation left at level 0, or a
  course along the border row), so water from downstream drains back out by the edge tiles beside the
  sealed mouth. Every check passes; a player sees water leave by the edge beside the river's mouth.
  The heavy `rivers.test.ts` meets the same on a drawn river: on 256² seed 13 the first river drawn
  from the east edge at (255, 238) loses water off the map beside its mouth at (255, 232) (0.049
  deep on the nightly of 2026-09-26, before D252; 0.070 on D252's maps), so the PR's Nightly
  (heavy-tests) was red on that one case (44 of 45 passed). **Skipped under D277** (the orchestrator's
  call, 2026-09-27): the drawn-river planner is unmaintained until M12; the generator and the player
  never use it (the editor's river tool is gone since D184), only the worker's old `river` tool
  request and Claude's steps reach it. The 96² and 128² cases still run; nothing was re-seeded or
  weakened.
- **Second districts are rare** (D77: only where one fits): 6 of 70 maps at 128² (seeds 1–10 of
  every theme; Islands 5, Canyon 1), where M7's planner found one on most Delta and Lake Basin maps.
  The batch report now counts them.
- **A river that stands in pools** (information, for M9b's hydrology; found by the editor test):
  River Valley 96² seed 4242's main river (north edge to east edge, 4.21 blocks/s) holds its water
  in level-0 pools exactly 2.0 deep, with dry level-2 stretches between them (tiles 48–54, 63–69 and
  81–90 of its path), a level-5 ridge across its planned bed at (34, 80), and its last tiles at the
  east edge dry. The water stands at the height of the level-2 plain round it, so one added spring
  of 1.5 floods 292 tiles and halves the land the start walks to (1,175 → about 500 tiles). On seeds
  1, 2 and 4244 at least 95% of the path is wet. Every check passes; a player sees ponds where the
  map says a river runs to the edge.
- **Designed for reshapes the land** (information): a harder drought asks for more stored water
  (PLAN §11.4), and the extra basins are drawn from the same random stream as the rest of the
  genome, so 4,488–8,380 of the 9,216 tiles differ between a seed's Normal and Hard maps at 96². So
  "Generate, keeping my edits" after changing Designed for keeps the player's edits on a different
  valley (the editor names what they then break). Drawing the extra basins from their own stream
  would keep the rest of the land; not done this late, since it would change every Easy and Hard
  map.
- **Starts and the starting-logs floor** (D229; the start-area sheet): see "The starting-logs
  floor" under Results. Plainly: the floor's added wood does not put the same forest beside every
  start (it follows each map's own water and land, in every direction). What does recur beside every
  start is the start's own planting for Minimum starting wood and Minimum starting bushes (D85's
  near-start groves and berry patches, cyan and magenta on the sheet), and at Normal those groves are
  larger since D227 (200 logs within 20 tiles' walk, 80 before). *(Answered by Kyler's D252 (1),
  built 2026-09-27: see "Starts stop looking alike" under What was built. What remains: a start whose
  walk is mostly moist land still gets the start rules' trees on every side, since the amount they
  ask for fills it.)*

## Tests updated because a decision changed what they tested

The stale-tests rule (CLAUDE.md): each still passed or failed for a reason that no longer applies.

- `projects.test.ts`: "Lake Basin seed 1 at 96² has a terrace ring past the old bounds" now checks
  that a generated map's features reaching past the edge (its rivers' mouths) reopen; "a Lake Basin
  terrace ring past the edge: locked, changed and moved" now uses a natural lake along the edge (the
  generator plans no terrace rings, D108).
- `objects.test.ts`: "ruins on a plateau" became "ruins on a rise … the rise is the land's own"
  (nothing is raised); the generated weir, second district, plugged spillway (a natural lake), river
  made badwater and every-object tests moved to seeds that have what they test at 0.7.0; the weir
  test counts only the water beside its own river.
- `features.test.ts`: the set pieces are the hollows, rises and district sites the land holds, and
  the field contains the rivers, natural lakes, hollows and rises.
- `setpieces.test.ts`: the on-river fall uses a river whose bed has room below it (main rivers often
  cut to level 0), the 20-wide fall at 128² a seed whose fall water settles within 4 days.
- `document.test.ts`: format 3, and the format-1 stand-in is a map without natural ramps.
- `look-mine-ruins.test.ts`: the live check's pinned sha256 for 0.7.0.
- Resumed session (2026-09-26):
  - `settings.test.ts` and `tools/settings-suite.ts`: Start area and Theme are information (D211);
    their maps must still pass their checks, and the test's title says "information".
  - `validate.test.ts`, `water.badwater_contained`: the notch runs from the pit through its whole
    rim to lower ground or the map's edge (a hollow is dug two levels into high ground; the old
    box's rim was 4–6 tiles), and must cross ground above the sill.
  - `objects.test.ts`: the editor's weir and plug take the first free place from 30 tiles down the
    main river (the tool refuses where another object stands, as it should); the second district's
    site (Islands 2, 3, 5 and Canyon 10), ruins on a rise (Highlands 1, Islands 2, Lake Basin 2, Delta
    3) and the generated weir (Islands 3, Canyon 3, Lake Basin 4, Highlands 3, Islands 4) moved to
    maps that have them.
  - `setpieces.test.ts`: the on-river fall asked to drop 16 takes the first river and place (30–70
    tiles along it) whose bed has room below (main rivers often cut to level 0, and the land's own
    falls take their stretch).
  - `reshape.test.ts`: the lake over a relic uses River Valley seed 1 (seed 13's relic now stands by
    the map edge, where no lake may go).
  - `shelf.test.ts` (from Live editing): the painted grove goes on River Valley 96² seed 4 (seed
    4242 has no open level ground 9 wide clear of other pines at 0.7.0).
  - `carve.test.ts` (from Live editing), the oxbow lake kept with its carve: Canyon 96² seed 5, the
    carve from (20, 80) aimed at (76, 16), the same settings (seed 1's course cuts no bend off now;
    the search tried 10 aims on 25 maps).
  - `tests/e2e/editor.spec.ts`: seed 4244 (0.7.0's 4242 start stands on a floodplain a level above
    the river's outlet: the test's spring floods it, halving the land it walks to, and the checks
    rightly warn of its berries and wood). The regeneration changes Grove size, which leaves the land
    as it is: on M9a's maps Designed for reshapes the valley (a harder drought asks for more stored
    water), so the lowered ground would have been compared across two lands. Every assertion kept,
    "Checks: Ready to play" included.
  - The starting-logs floor and D227's defaults: `start.test.ts` (the defaults 250 / 200 / 0; D164's
    tree counts still convert at 2 logs a tree; the scene that meets every requirement at Normal has
    210 logs, 150 before; the sapling and 20-tile-walk tests give their rule, which was Normal's old
    default; a new test for the floor: the same logs within 40 tiles' walk, the same at every
    difficulty, rejecting); `spec.test.ts` (a link's unreadable tree count keeps Normal's default,
    whatever it is); `placesCommon.ts` and `places.test.ts` (the places' wood as known faults, above);
    `look-mine-ruins.test.ts` (the live check's sha for the maps as they now are); `tests/e2e/start.spec.ts`
    (the card's Normal wood is at least 200; new: the floor's row on the card and in the editor's
    indicators, and the page's count equal to the validator's).
  - `tests/e2e` re-seeded for 0.7.0's maps (dev's Live editing tests were written on the old
    generator's 4242): `brushKit` on seed 24 (flat, dry, empty ground at level 4 or more for its pits
    and an unturned mine site), `shelf` on seed 1 (level open ground 7 and 9 wide), `waterTools` and
    `waterView` on seed 15 (4242's river stands in pools; there one group of sources feeds the
    water); `waterView`'s new source goes on level ground (the badwater source it becomes stands 3 × 3).
  - `tools/settings-suite.ts`: River style (braided) on 12 seeds (0.9 on 8 once D227's start rules
    changed which attempt a seed ends on; 1.0 on 12, its threshold unchanged).
- With D252's start planting (2026-09-27):
  - `look-mine-ruins.test.ts`: the live check's sha re-pinned for the maps as they now are (D148),
    twice (`fb0e9f70…` at 37b2f50, `ec1ff6d3…` with the tight-walk rule).
  - `parity.test.ts`: the worker's background check test sculpts ground clear of the map's objects
    (its first candidate on Any seed 21 is now the map's mine site, and a sculpt under a mine site
    leaves it floating, a load problem that blocks the export); what it checks is unchanged.
  - `tests/e2e/waterTools.spec.ts` on River Valley seed 9 (seed 15 now has only one stretch of flat,
    dry, empty ground 7 wide away from the start; the test places two sources) and
    `tests/e2e/brushKit.spec.ts` on seed 35 (seed 24 now has room for two of its four stretches at
    level 4 or above; seed 35 has all four and an unturned mine site), D148. Each seed was found by
    replaying the test's own search on the generated maps.
  - New: `tests/contract/startPlanting.test.ts` (D252) and `tests/contract/sourcesUnderEdits.test.ts`
    (D270's #89: a brush stroke and a Select action over a badwater spring are never refused).
- With the settled outflows written into the file (after the probe batch, 2026-09-27):
  - `look-mine-ruins.test.ts`: the live check's sha re-pinned again (`776a9a44…`; `ec1ff6d3…`
    before the outflows), D148.
  - `public/real-places/index.json`: every place's `.timber` sha256 and size re-pinned (the places
    share the writer; their data files are unchanged).
  - `properties.test.ts`: the large preset (192²) on seed 305: dev's housekeeping (no `setLock` in
    `randomOps.ts`) shifted the random draws, and on seed 303's M9a map none of them applied a tool
    edit, which the test requires (D148).
  - New: `tests/contract/outflows.test.ts` (the file stores the settle's outflows in the game's
    format; loaded with them, Delta 128² seed 1's water holds a day).

## API changes (for the Live editing merge)

- `planFeatures` is gone; `MapSession.regenerate` calls `generate(spec, { context })` and refuses
  only when planning failed ("no layout fits").
- `BaseMap.columns` became `BaseMap.runs` (`runsOfColumns` converts); `BaseTerrain.columns` stays.
- `toDocument(…, field?)` and `generatedDocument(r)`; `MapDocument.field?`, `KeptContent.solid?`.
- `BuildInput.field?` (a `GeneratedField`); `ResourceGround.channel?`.
- `GenerateResult` adds `field`, `intentions`, `info`, `timings`.
- The check `water.reservoir` is now `water.storage_possible`; `terrain.dam_wall` is new.
- Removed with the old planners: `planValley`, `planLakeBasin`, `planRiverValley`, `gen/water.ts`,
  `obstacleSpots`. Kept for their users: `gen/layout.ts` (`layoutTargets`, feature/live-editing's
  features test), `startWalkable` in `gen/valley.ts` (the design prototypes), `PlanConflict` in
  `gen/riverValley.ts` (feature/live-editing's session.ts).

## Parked for Kyler

(See the final section of the PR.)

## Next session

The D252 session's list (2026-09-27). D252 (1) changed generated maps, so every batch and the probe
maps are made again on the re-frozen generator (reports in `investigation/m9a/local/`, out of git,
D195):

1. ~~**Every batch**~~ done on 788c145's generator (≥ 98% final per option and size, blocking; the tables under Results; run as `--sizes 96,128` then `--sizes 192,256`). For a re-run:
   - Normal, all seven options at every size:
     `npx tsx tools/batches.ts --sizes 96,128,192,256 --seeds 1-100 --jobs 8 --out investigation/m9a/local/batches-d252`
   - Hard at 128²:
     `npx tsx tools/batches.ts --sizes 128 --seeds 128=1-100 --jobs 2 --difficulty hard --out investigation/m9a/local/batches-d252-hard`
   - then `npx tsx tools/batches.ts --summary-only --out investigation/m9a/local/batches-d252` (and
     with `--sizes 128 --difficulty hard` for the Hard folder) writes `summary.md`; the tables go under
     Results.
2. ~~**The probe maps**~~ done on 788c145: `npm --prefix investigation/probe run batch -- --job-only --group M9a`
   made the 15 maps in `C:\dgm-probe\maps\20260927-0853-batch` (run id `20260927-0853-batch`, job
   preview `investigation/probe/.cache/job-preview.json`); `npx tsx tools/check-maps.ts C:/dgm-probe/maps/20260927-0853-batch`
   checks them (every check in TypeScript and the Python load checks; `--difficulty hard` for the Hard
   map). The launch is the orchestrator's (`npm --prefix investigation/probe run batch -- --group M9a`);
   never launched by this session.
3. ~~**Merge `origin/dev`**~~ done (to c678e5b, d1fd46b; to 641e9c4, cc95a5b; then the last merge before the
   release, with the seed-4242 sha unchanged); CI green on #56 (`gh run list --branch feature/m9a`).
4. **Left for the orchestrator:** ~~the DGM Probe batch on `C:\dgm-probe\maps\20260927-0853-batch`~~ run
   twice (20260927-0853-batch, then 20260927-1443-batch on the maps with their outflows; both diagnosed
   under Results). Next: whether the probe's model starts from the file's stored outflows
   (`runModel`), Kyler's call on the badwater pool and Delta's flats, then the merge into `dev`,
   `m9a-done` and the release.
5. The start planting's measures: `npx tsx tools/start-spread.ts --themes any,riverValley,canyon,highlands,lakeBasin,delta,islands --seeds 1-16 --size 128 --jobs 7`.

### The restart's list (2026-09-27, kept as written; its step 1 is superseded by D252: every batch is re-run above)

Where the session that built the starting-logs floor stopped (2026-09-27, a restart of the milestone
session). Every step before these is done (the list it followed is kept below, as written).

1. **The rest of the Normal batches** (the report of each finished run is in
   `investigation/m9a/local/batches-final/`, out of git, D195; the runs stopped part-way are
   re-run whole):
   - `npx tsx tools/batches.ts --sizes 96 --seeds 96=1-100 --jobs 7 --out investigation/m9a/local/batches-final`
   - `npx tsx tools/batches.ts --sizes 128 --themes any,canyon,highlands,lakeBasin,delta,islands --seeds 128=1-100 --jobs 7 --out investigation/m9a/local/batches-final`
   - `npx tsx tools/batches.ts --sizes 192 --themes lakeBasin,delta,islands --seeds 192=1-100 --jobs 7 --out investigation/m9a/local/batches-final`
   - then `npx tsx tools/batches.ts --summary-only --out investigation/m9a/local/batches-final`
     writes `summary.md`: its table goes under Results ("The full batches"), each option and size ≥ 98%
     final (blocking); the straightness columns against `investigation/m9a/straight-reference.json`
     (limits 44 and 34.3).
   About 1.5 hours with 7 jobs on the dedicated machine.
2. Push, and CI green on #56 (`gh run list --branch feature/m9a`).
3. **The DGM Probe batch** (the orchestrator runs it, after Kyler's yes; D116, D117): the group's 15
   maps are prepared on the frozen generator in `C:\dgm-probe\maps\20260927-0424-batch` (job preview
   `investigation/probe/.cache/job-preview.json`, run id `20260927-0424-batch`), made by
   `npm --prefix investigation/probe run batch -- --job-only --group M9a` (15 maps, about 93 minutes);
   each passes every check in TypeScript and the Python validator's load checks, and holds 240–1,307
   logs within 40 tiles' walk. The launch is `npm --prefix investigation/probe run batch -- --group M9a`
   (it prints the plan and a one-time code; `--confirmed-launch <code>` after Kyler's yes). If the
   generator changes, prepare the maps again with `--job-only`.
4. Other commands, for a re-run: the contact sheet
   `npm run sheet -- --png docs/sheets/m9a.png --no-open --workers 4`; the start areas
   `npx tsx tools/start-sheet.ts --jobs 4`; the Hard batch
   `npx tsx tools/batches.ts --sizes 128 --seeds 128=1-100 --jobs 3 --difficulty hard --out investigation/m9a/local/batches-hard`;
   the Any measures
   `DGM_GENERATIVE=investigation/m9a/local/generative npx tsx investigation/generative/v2/batch.ts --gen current --set m9a-128-floor --themes any,riverValley,canyon,highlands,lakeBasin,delta,islands --seeds 1-60 --size 128 --no-files --jobs 4`
   then `DGM_GENERATIVE=investigation/m9a/local/generative npx tsx investigation/m9a/any-measures.ts --set m9a-128-floor`;
   the Claude suite `npx tsx investigation/claude/bin/reference.ts`; the settings experiments
   `npx tsx tools/settings-batch.ts --seeds 1-4`.

### The session before the restart's list (2026-09-26, done but for its step 3, now step 1 above)

1. ~~Settings experiments green, the reshape tests~~ done (see Results).
2. ~~Quick tests re-seeded~~ done (see Tests updated).
3. Full batches: see step 1 above (the first full run, on 0422c71's generator before the floor, is
   in `investigation/m9a/local/batches/`).
4. ~~The contact sheet and the Any measures~~ done.
5. ~~The Claude suite~~ done: 103 of 120.
6. ~~Merge `origin/dev`~~ done (Live editing, the forces, the juice: 13 conflicts, resolved as
   follows — `calibrated.ts` both sides; `build.ts` dev's stroke targets then M9a's ramps; `session.ts`
   the imports of both, M9a's PLANNING_FAILURES, `regenerate` M9a's one `generate` with dev's
   `editProblems`; `App.tsx` dev's caption, then M9a's first look; the Claude harness both sides'
   steps; `objects.spec.ts` and `tools.spec.ts` deleted as on dev; decisions-pending dev's #69–#76,
   then M9a's #77–#80; the reference outputs regenerated), and again for the waterfalls, D222–D229.
7. ~~The probe maps~~ prepared and checked (step 3 above).

### The paused session's list (2026-09-26, kept as written)

### Kyler's answers (PLAN §20 D211), to build next

- **Theme (Lake Basin's water):** the Theme experiment (water share, River Valley 0.12 against Lake
  Basin 0.30) becomes information until M9b fixes Lake Basin's water share, as design version 2
  planned. Now: River Valley 0.083, Lake Basin 0.147 at 96² (seeds 1–4).
- **Start area:** a preference, never a stamped bench (D209). The setting leans the land toward
  roomier or tighter benches (built: `leanGenome`, Large: +0.15 benched share and quieter noise;
  Small: louder noise) and the settler prefers a matching bench (built: `bench` in `pickStart`).
  To do: describe it as a preference in the panel ("prefer a roomy start" / "prefer a tight
  start"), show the start's actual bench size on the map card, and make the Start area experiment
  information (it measured 144 → 136 on seeds 1–4; one cluster of possible starts on most 96² maps).
  The editor's Flatten, with its "the start fits here" hint, is how a player makes a bigger bench.

### The settings experiments (ROADMAP M6), the heavy-tests job's failures

The M9a generator no longer moved most settings' targets. Fixed in the WIP
commit (generator, `leanGenome`, the settler, the hydrology, the badwater hollows):
- Relief (leans stronger), Buildable land (Generous: quieter, a little lower, more benches and
  ramps; Tight: benches ending in cliffs; the settler prefers ground that joins twice the walkable
  land Buildable land asks for), Rivers (a set count is exact: a relaxed search, and land holding
  fewer is drawn again), River style Straight (courses drawn toward their line, `straighten`) and
  Braided (one more delta mouth; `edgeExits` now counts the water leaving by the edge, thin water
  included, since delta channels are the land's, not features), Drought reserve (the reserve and
  the difficulty's need lean basins in; the settler prefers stored water within 40 tiles), Lakes
  (None: no lake budget; Many: more basins, troughs and spring lakes), Badwater distance and the
  start rule (hollows aim at about the larger of the two), Water without stairs (the start aims at
  0.45 × (rule − 5) tiles from its water), Verticality (experiment 10 → 90). The settler now weighs
  the settings on the intentions' preference too, and picks among starts within 70% of the best.
- Designed for's experiment now measures the start rule it still sets (badwater distance, Easy 30,
  Hard 8; stale-test rule): the stored water it measured is information (#67, D209).
- `minSeeds: 8` on the noisiest experiments (Verticality, Buildable land reach, Braided, Lakes).

Still failing on seeds 1–4 at 96² (`npx tsx .scratch/settings-run.ts "" 1-4 96`, results in
`.scratch/settings-ci.txt`):
- Drought reserve 1189 → 624 (on 8 seeds it passed, 1100 → 1472): give it `minSeeds: 8` or
  strengthen the lean;
- Badwater (off → high) 0.55 (needs 0.6): passed before today's changes (0.88 on 8 seeds);
- Berries near start 28 (needs 30): passed at 30 before;
- Designed for (new target) 6.5 (needs 10): seed 2's hard map keeps its badwater 63 tiles off;
- Start area and Theme: information per D211 (above).

### Then, in order (hours are estimates)

1. Settings experiments green, the two reshape tests (`tests/contract/reshape.test.ts`: Lake
   Basin seed 13's geothermal beside a waterfall leaves an object floating; River Valley seed 13's
   lake over a relic no longer plans) (2–3 h).
2. Quick tests re-seeded for the final generator: `badwater.test` (Any seed 21: start.badwater at
   10.5 against 15), `objects.test` (district and rise seeds), `validate.test`
   (badwater_contained), and `look-mine-ruins.test`'s pinned sha256 (1–1.5 h).
3. Full batches, all seven themes (Any included) at 96², 128², 192², 256², and the straightness
   stats; `.scratch/run-batches.sh` (SIZES, SEEDS) runs them one at a time (3–4 h, machine).
4. `npm run sheet` → `docs/sheets/m9a.png` (under 1 MB) and the Any measures (1 h).
5. The Claude suite re-tune to at least 103/120 (`npx tsx investigation/claude/bin/reference.ts`),
   each re-tuned case recorded here (4–6 h).
6. Docs in step (EDITOR_PLAN, PLAN, ROADMAP, this log), e2e (determinism's timeout, Islands 256²
   preview's 120 s), CI green (2–3 h).
7. Tell the orchestrator the probe batch is ready (catalogue group M9a, 15 games, about 93 min);
   its maps are rebuilt on the final generator first.


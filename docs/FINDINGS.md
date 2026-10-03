# Findings

An index of the findings later work builds on: what the game does, what the official maps look like, what was
measured, what failed. One line each: the finding, its number or rule, and where it is measured. Gathered from
`investigation/`, `docs/progress/` and `PLAN.md` §20 (Kyler's standing rule, D316: findings later work builds on are
kept concise and easy to find).

A finding worth keeping gets a line here (HANDOFF, "How things are run here"). A finding that a later one replaces moves, verbatim, to
"Stale findings" at the end of [archive/README.md](archive/README.md). Where two sources disagree, both are listed and
the current one is marked.
Game facts are for Timberborn 1.1.2.4-52e959e-sw. The game's files are never committed; the notes describe its rules
in our own words.

Short names: **WS** = [water and soil notes](../investigation/notes/water_and_soil.md), **FMT** = [format notes](../investigation/notes/format_1_1.md),
**BLK** = [blocks and placement](../investigation/notes/blocks_and_placement.md), **NAV** = [navigation, ruins, entities](../investigation/notes/navigation_ruins_entities.md),
**GR** = [terrain above terrain: the game's rules](../investigation/terrain3d/GAME_RULES.md), **RES** = [resources progress](archive/progress/resources.md),
**M9A** = [M9a progress](archive/progress/m9a.md), **SG** = [source groups](../investigation/source-groups/REPORT.md).

## The game's water

- Tick 0.6 s with two water substeps of 0.3 s; a day is 768 ticks. WS "Key constants".
- Water moves only sideways, between neighbouring air gaps that overlap; a full cave keeps its excess as pressure
  (overflow counts x8) up to a cap. WS Q2; GR §3.
- Surfaces are almost flat (about 0.0015 of head per unit of flow): rivers are chains of level pools joined by
  falls. WS Q2.
- **The edge-spill threshold, 0.1 (D303):** a dry neighbour with the same floor takes 0.1 off the head, so a sheet
  builds past 0.1 before it spreads; where a river leaves the map at the lowest level the game keeps it and our
  heightfield port left it out. Adopted with the game's rules in M9b (D293, D308). WS Q2; PLAN §20 D303.
- Map edges are sinks (padding columns are open and never updated); a cave that opens onto the edge drains out. Padding
  beside a source is solid, so border sources do not leak. WS Q1, Q2; GR §3.4.
- Evaporation is 0.0001 a second (0.001 under 0.02 deep) times a modifier by cluster saturation: a lake 3 or more wide
  loses 0.0535 a day, a 1-wide channel 0.20, a lone tile 0.30. It does not depend on the weather. WS Q2.
- **The game's water rules everywhere (D293, D297):** one water model, the game's. A tile within 0.01 of the 0.05 wet
  line may be wet or dry either way, with the map's volume within 0.1%. Lands with the soil and edge rules in one
  switch in M9b (D308, D311). PLAN §20 D293, D297, D308, D311.
- Stacked-column water matches the game: 17 of the 19 official maps reproduce their stored water at IoU 0.99 or better
  (Oasis and Spillage, aquifer and seep maps, do not); one day from each map's own water keeps it at IoU 1.000 on 18 and
  0.999 on one. [terrain3d REPORT](../investigation/terrain3d/REPORT.md); D120.
- The game resets water momentum at load unless the file stores the settled flows: Delta 128² seed 1 had 78.5% of wet
  tiles within 0.1 after a day, 97.3% with the flows kept. M9A "The DGM Probe batch 20260927-0853-batch".
- Always write `WaterSimulationMigrator = {"IsMigrated": true}`, or every source's strength and stored outflow halves at
  load. FMT §0.
- Nothing pre-simulates on a new game; water starts where the file puts it. FMT §6.4.
- Settling takes about 600–1,000 ticks on 96²–128² maps, 2,000–3,000 on 256² maps with big basins. WS Q2.

## Sources

- **Strengths in the official maps.** WaterSource 0.25 (11), 0.5 (105), 0.75 (6), 1.0 (43), 1.25 (3), 1.5 (2), typical
  0.5. BadwaterSource 0.5 (4), 0.75 (1), 1.0 (17), 1.5 (26), 2.0 (9), 3.0 (12), typical 1.5. Maximum 8 a cell (72 for
  badwater's 3x3). Clean strength active per map 2.0–10.5 (ThousandIslands 27). WS Q1.
- **Source groups (#78, D314).** Clean sources come in rows across the flow (25 of 31 rows across, none along), mostly
  3 (2–5), 1 tile apart, 0.5 each (62%), shared equally in 67% of groups and otherwise tapered (strongest in the
  middle); on a map edge, in a hollow, or on a rise below a ridge. Badwater: alone 83% of the time, otherwise a close pair
  sharing equally, 1.5 each, in a hollow 68%, never on an edge. 19 named maps; the 3 dev and test maps left out. SG; the
  rule is `src/core/water/sourceGroups.ts`.
  - Group by river or shoreline segment, not by distance alone: ThousandIslands' 35 sources chain into one. SG "Cases the rule doesn't cover".
- Sources stand on the top of the run that reaches z = 0, never on roofs, arch tops or ledges; 29 of the 170 official
  water sources are in tunnels. GR §3.4; WS Q1.
- In a drought every source ramps to 0 over S/2.67 days before it and back after; in a badtide clean sources emit
  badwater at full strength (0.5 to 1.0 to 0.5). WS Q1, Q7.
- 150 of the 170 official water sources are on from day 1; 20 are delayed (Nomads). WS Q1.
- Every official map has lasting badwater (18 of 19 a source; Spillage seeps; Nomads and Oasis time-activated), 1 / 2 / 4 /
  3.5 sources by size, 84% in a hollow, the nearest a median 56 tiles from the start. [badwater-source](archive/progress/badwater-source.md) "The official maps"; D200.

## Soil and plants

- **Soil moisture.** A clean lake 3 or more wide gives range 16 and moisture falls 1 a tile; reach is 16 tiles from a big
  lake and 6 from a 1-wide stream; each level above the ceiled surface costs 6 (1 up: 10 tiles, 2 up: 4, 3 up: none);
  badwater gives none (0 at contamination 0.53). A band vanishes about 20 ticks after its water. Our replica matches
  stored moisture on 100% of tiles on 9 official maps. WS Q3.
- **The game's soil rules (D298):** adopted in M9b. The 3D engine's soil model matches the official maps' stored soil on
  99.79–100% of slots; the old model left 114 of 36,453 plants (seeds 1–3, 18 maps) on ground the game dries. PLAN §20 D298.
- Plants die on moisture 0 (a timer of 0.9–1.1 x DaysToDieDry: pine 13, birch 11, oak 15, maple 12, chestnut 8,
  blueberry 9), on any water on their tile, or on any soil contamination (0.2–0.3 days); the timer resets when moisture
  returns. Succulents die if moist. Dead trees keep their logs. WS Q4.
- **Yields** (the floor counts these): pine 2 logs, birch 1, oak 8, maple 6, chestnut 4, mangrove 2; growth in days: pine 12,
  birch 7, oak 30. WS Q4; D224.
- A tree needs 3 free cells above it; the start needs 5. Nothing checks for sky or light. GR §5.
- Moisture under roofs: cave water counts only when the cave is full to its ceiling (roof 1, 2, 3 thick gives 16, 10, 4).
  GR §6; the probe agrees (T2, below).

## Terrain, height and support

- Sizes 4–256 a side in the game's New Map dialog, but larger maps load: 399×399 and 29×599 (Map Resizer maps,
  [WORKSHOP](../investigation/WORKSHOP.md)); 512 a side is D357's probe (group `Sizes`). 23 terrain layers
  (`MaxGameTerrainHeight` 22); the map editor's brushes clamp at 16; layer 22 stays empty; more than 23 layers is
  truncated. BLK §5; FMT §0.
- **The ceiling is 22 (D172, D244).** Every editor tool goes to it on any map; land above 16 makes a tall map. The game
  keeps land above 16 (probe: run 20260925-tall, 4 maps, 23 checks; `ceiling-20260927`, 3 editor-made maps).
  Timberborn's own map editor opens and saves land above 16; its brushes only can't raise it. PLAN §20 D172, D244; [the earlier STATUS](archive/status-2026-10-01.md) "Probe batches".
- **The support rule (terrain3d).** A voxel over air must be within 3 sideways steps of support in its own layer, and
  every voxel resting on a supported one is supported. Cantilever 3 a layer; a flat roof spans 6; a corbelled arch closes 6
  a layer; a leaning cliff leans 3 a level with no total limit; a hanging column is never supported. 38 shapes behave as
  the rule says. GR §2; [terrain3d REPORT](../investigation/terrain3d/REPORT.md).
  - **Corrected:** "the first solid run of each cell is always kept" holds only for the run that starts at z = 0 (BLK §5, FMT §4.2; GR §2).
  - The game drops unsupported voxels half a day after loading, not at load (probe T1, below).
- Walking has no headroom check (a 1-high tunnel walks). Only slopes, stairs and platforms join levels; official maps carry
  4–23 slopes. NAV §1a; GR §4.
- Every official map has terrain above terrain; 29 of 35 workshop maps saved by 1.0 or later do. Tunnels are the commonest
  form, 4–5 high under 2–3 levels of rock. [MAPS](../investigation/terrain3d/MAPS.md).
- A river's natural fall on land above 16 can drop more than 15 levels in one bed step: the schema now allows 22 (the
  waterfall set piece keeps 15). 27 of 118 accepted maps were refused before the fix; 535 of 540 seeds now give a map and
  all reopen. M9A "Tall maps' project files".
- Edge walls: an edge is walled at 60% of its tiles rising 2 levels over three; official maps top out at 38%, all 85 Real
  places conversions were walled at 89–99%, 4 of 141 workshop maps at 65–86%. D151; [start-edge-rules](archive/progress/start-edge-rules.md).

## The start

- One `StartingLocation`: a flat 3x3 with 5 free layers above and a free, walkable entrance tile. With none, or a blocked
  entrance, the game spawns no beavers; a second start is silently removed. BLK §3.
- 13 beavers (9 adults, 4 children); starting food 300 / 130 / 90 and water 250 / 0 / 0 on Easy / Normal / Hard.
  On Normal and Hard the first deaths come about 5.7 days without water. NAV §11.
- **The starting-logs floor (D224, amended D227): 178 logs for 1.1.2.4.** Grown trees by species yield, reachable on foot
  within about 40 tiles; never configurable below. Minimum starting wood counts within 20 tiles (Easy 250, Normal 200, Hard
  nothing above the floor). The worst route to a Forester is Iron Teeth without flowing water (Folktails: 88).
  `tools/log-floor.ts` recomputes it whenever the game version changes. PLAN §20 D224, D227.
- **The start's water (D153, D302).** A walking path over the map's own ground and slopes to a shore counts, within 12 / 20 /
  28 tiles; the official median nearest clean water is about 11 tiles. It must be fed by a source or last the drought,
  never a sealed puddle. PLAN §20 D153, D302; M9A "The start's water is never a sealed puddle".
- Official calibration: berry bushes within 20 tiles 3–128 (median about 50), trees 63–277, ruins 0 in 17 of 19 maps. NAV §11.
- Pump reach below its base: 2 (Folktails), 4 (large), 6 (Iron Teeth deep). WS Q7.

## Official maps: resources and objects

Measured on 17 of the 19 official maps (Nomads and Oasis left out; Beaverome's trees and Lakes' bushes are outliers). RES
"The official baselines"; data in [official-baselines.json](../investigation/official-baselines.json).

- **Tree budget by size** (trees per 10k tiles): small 1,715, medium 1,061, large 544, max 559, typical range 0.92–1.17 x the
  median; berry bushes 265 / 92 / 40 / 44. D168, D169.
- **Living and dead shares.** A third of trees are alive; 70% of pines, 76% of birches and 74% of oaks are stored dead,
  succulents never. Species: pine 47%, birch 27%, oak 21%, succulent 6%. Living trees cover 16% of the moist land. D168.
  - The generator before this step had 43% alive and about twice the official number of groves.
- **Clusters (D169).** 99% of trees stand in a grove (median 40 trees, clearings about 4 tiles). Berry patches: median 44
  bushes, 4 tiles from water, about 29 tiles apart. Groves a map 8 / 28 / 35 / 66; patches 2 / 4 / 3 / 6.
- **Ruins (D170).** Scrap is 15 a storey; scrap per 1k tiles 840 / 705 / 236 / 235. A median field has 37 columns and five
  towers of 6+ storeys; storeys H1 28% down to H8 5% (mean 3.06); models A 26%, B to E 18–19% each.
- **Mine sites (D167):** 1–4 a map (1 / 2 / 3 / 3.5 by size); the nearest to the start a median 61 tiles out.
- 48% of the official maps' living trees are stored as saplings (the generator stores 35%); information only.

## Waterfalls and dams (PLAN §9)

- **Drop:** hard maximum 15 levels on editor-safe terrain, practical 12, typical 3–8, 21 at the game's own 22; it does not
  depend on map size. PLAN §9.2, §9.10.
- **Width and flow:** lip depth is about 0.3·S/W; the minimum flow is 0.025·W; an official-looking lip (0.12 or deeper) needs
  about 0.4·W (20 wide: about 8, more than a 128² Normal map's whole budget of 3.6). The whole lip carries water only if a
  header pool one level below feeds it (20 of 20 tiles at S = 0.5 with one, 3 of 20 without). Official lips are 2–8 tiles
  wide. PLAN §9.2.
- Highest official fall: median 4.8, maximum 12.8 (Diorama), PLAN §9.2 (the builder's figure). **Disagrees with** the design
  report's "official tallest fall 3.9, workshop 5.7" ([REPORT-v2](../investigation/generative/REPORT-v2.md) summary), which is a
  median in levels on a different measure.
- Width cap 40% of the side (19 / 38 / 51 / 76 / 102 at 48² to 256²); Normal flow budget 1.2 / 3.0 / 3.6 / 4.4 / 7.2
  blocks a second; reservoir sizes by difficulty in PLAN §9.10.
- A beaver drinks 2.12 water a day, 0.424 map units; Hard needs reservoirs at least 3 deep. WS Q7.
- Weather on Normal: temperate 13–17 days, drought 5–9 (the first 2–3), badtide 4–8 from cycle 5; Hard drought 15–30. WS Q7.

## The DGM Probe: confirmed behaviours

The probe is [`investigation/probe/`](../investigation/probe/REPORT.md). Its results stay in `C:\dgm-probe\`, out of git, and
are recorded in M9A and [the earlier STATUS](archive/status-2026-10-01.md) "Probe batches".

- **Tall maps** (run 20260925-tall, 23 checks passed): land to 22, a start at 22, sources at 19 and 22 and water above 16 all
  load and hold. D172.
- **M9a's 15 maps** (batch 20260927-1443, judged again under D297 and D302): 101 passed, 2 failed. Every map loads; objects,
  terrain and the tall map pass. The cycle model started from the file's stored outflows follows the game through day 9.83 on
  Delta. M9A "The probe fixed, and the re-run judged again".
- **Still failing, handed to M9b (D302):** a clean side pool that empties in the drought and refills with badwater (Any 128² seed
  1; the model agrees with the game), and Delta 128² seed 1's thin sheet in the badtide (wet tiles off by 19.6%).
  D311: missed where thin sheets form less under the game's evaporation.
- **Terrain 3D** (`terrain3d-20260927`, T1–T6): cave water, soil under roofs, plants and a start under a roof, and the 256² high
  landscape match the game. The game drops exactly the 24 voxels our rule predicts, half a day after loading. [The earlier STATUS](archive/status-2026-10-01.md) "Probe batches".
- **Ceiling** (`ceiling-20260927`): editor-made land above 16 loads with its heights, water, objects and sources at 19–21. One
  failure, not about height: the badtide model contaminated one watched tile a moment before the game. D244.
- **How it runs:** speed 99 (the game's own top), records inside the tick, no saves, its own folder, a confirm code per plan and
  launch. [probe REPORT](../investigation/probe/REPORT.md) decisions 3, 9, 12, 17.
- Wet-tile counts are judged with a 0.01 band round the 0.05 line (D302). M9A "Kyler's D302".

## Generated maps: what the design measured

- **Design version 2** (D138, approved): 0 dam walls and 0 edge walls on 3,353 maps; 100% final in every theme and size but
  Canyon 128² (99%); first attempt 63% at 128²; no clones in six of six themes (nearest 0.35–0.42, median 0.44–0.50);
  whole-map archetypes pass in 4 of 6 themes; 189–199 joint strategy signatures of 200. [REPORT-v2](../investigation/generative/REPORT-v2.md)
  summary, measured on the prototype before the start and edge rules were merged.
- A first look at 0.15 s (128²) and 0.6 s (256²), the whole map at 1.3 s and 5.7 s (Node); a slow tail when attempts fail
  (Islands seed 2 at 256²: 41 s). REPORT-v2 §7.
- The outcomes M9b is judged by are Kyler's eye against [PERFECT](PERFECT.md) (D252, D273); the measures are information.
- **Mechanics** (180 generated maps, generator 0.6.0): nearest badwater or spoiled soil 15.4–24.2 tiles away on every map;
  Canyon has no clean retained water within 40 tiles after a nine-day drought; the largest joint bin holds 20–30% of Canyon,
  Lake Basin, Delta and Islands seeds. [mechanics REPORT](../investigation/mechanics/REPORT.md).
- **Real landscapes:** 26.6% of 12,150 conversions passed the validator; linear 16-level mapping clips relief and normalised
  22 passed none; generated maps have 13.9% of contour edges in straight runs of 8+, real terrain 2.0%.
  [landscapes REPORT](../investigation/landscapes/REPORT.md); measured before D151–D153 and D300.
- **Pick a place** (three rounds, each replaced by the next): round 1 passed 47 of 150; designed water 142 of 150; signature
  water 102 of 150 (68%) on a stricter gate (the signature feature must survive), retaining 77.2% of real water against 31.3%.
  [pickplace-water2 REPORT](../investigation/pickplace-water2/REPORT.md).
- **Names:** a name must point to a measured feature; choice is by rule priority, never random (this overrides PLAN §13's seeded
  tie-break). [names REPORT](../investigation/names/REPORT.md).
- **Islands, islands to expand to** (M9b's safe version, seeds 1–30 at 128²; D432): 12 of 30 have no island of 150+ tiles
  reachable from the start across at most 8 tiles of water at a time (5, 8, 9, 11, 12, 14, 17, 19, 20, 22, 24, 27); on the
  other 18 the largest is 155–1,041 tiles; every start is on the shore. An island start at 128² needs about 1,500 tiles and 60
  tiles end to end, which no layout tried kept with the promise near 20. `investigation/m9b/islands-reach.ts`, the table in
  `docs/progress/m9b.md` on `feature/m9b`.
- Independent spatial controls did not reliably widen useful variety (mixed by theme); not adopted. [techniques REPORT](../investigation/techniques/REPORT.md).

## Weather

- The exact cycle model follows the game's own timings. In a badtide contamination moves by net flows, so it reaches more
  water and less soil (new contaminated soil falls 17–93%); recovery is slower in slow water (Delta: 14 of 30 maps take five
  days); Canyon loses all water in a 25-day drought, Lake Basin and Islands keep about half. [cycles REPORT](../investigation/cycles/REPORT.md).
- Weather seed 1729 compares maps fairly; the game's random sequence cannot be reproduced. cycles REPORT.
- The game eases its sources down before a drought and back after; our editor's drought run switches them off at once, so it
  is a day late at a drought's start. M9A "The DGM Probe re-run 20260927-1443-batch".

## Measured performance (where a decision uses it)

- **Exact cycles** cost 0.28 s CPU a simulated day at 128² and 0.96 s at 256², 1.67x the first model: the Weather view needs
  an immediate estimate, a cancellable worker and streamed key days. cycles REPORT.
- **Speedups (D130).** The five-change combination gives 1.19x canonical settle and 1.10x full generation; M9's 6 s candidate
  budget is still missed by 7 of 12 cases at 256². [simspeed REPORT](../investigation/simspeed/REPORT.md).
  - Exact weather, four changes: 1.44x at 128² and 1.40x at 256²; a continuous new game's first drought ends after about 7.5 s
    and 21 s (Chromium). [simspeed-cycles REPORT](../investigation/simspeed-cycles/REPORT.md).
- **Forces at 256²** (Craterize, Erupt, Quake, Glaciate; this machine's browser, not the game): 6.2 ms p95 frames, undo from
  cache 0.5–1.0 ms, Erupt's full completion 14.6 s. [erupt REPORT](../investigation/erupt/REPORT.md); [craterize REPORT](../investigation/craterize/REPORT.md); [glaciate README](../investigation/glaciate/README.md).
- **3D mesher:** every cave map up to 256² in 0.09–0.37 s at the display's full 165 fps; settling the largest water maps takes
  7–17 s CPU. terrain3d REPORT.
- **Map look:** about 165 fps with all stages on at 128² and 256² (the display cap); the tone pass costs about 0.04 ms.
  [maplook-finish](../investigation/maplook-finish/REPORT.md); [maplook3](../investigation/maplook3/REPORT.md).
- **Vegetation:** the new models cost more near (a pine 144 triangles against 26); 60 fps is unverified on real hardware, so
  Standard stays as it is. [vegetation REPORT](../investigation/vegetation/REPORT.md).

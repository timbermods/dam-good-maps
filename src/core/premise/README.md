# premise

Maps from a premise (docs/PREMISES.md): a problem the player solves, with the water that makes it true. Build steps 1
to 8 are here: the model, the lake stair's plan (stage 0) and its `plan` invariants; the water by number (stage 1)
and its `land` invariants; the relief between (stage 2); the start for the first frame (stage 3); the ladder
(stage 4) and the works sited by its soil (stage 0's second pass); life and resources by budget (stage 6); the generator's premise mode, which `gen/generate.ts` `generate` calls when `spec.premise` is set (share link key `p`; no
control on the page yet); and step 9's core: the theme and the premise as two choices, the theme the land's style
(PREMISES §1.5).

**Rules**
- A plan is plain JSON (`types.ts`), drawn from the spec and an attempt alone, from the named stream `premise.plan`
  (`draw.ts` `premiseStream`): integer or portable maths only (D366), since later stages build maps from it.
- Every invariant says why it fails in one line. A plan that fails a `plan` invariant is drawn again, up to
  `PLAN_TRIES` attempts; a spec the premise refuses (`eligible`) or cannot plan goes to the themes, so every setting
  still makes a map (D471).
- A theme is the land's style and never moves the plan, its water, levels or works (`style.ts`; §1.5): the plan reads
  only the settings the premise's preset gives (`spec/mapspec.ts` `defaultSettings(…, premise)`).
- The seed varies structure first (§4.4): n and f, the valley's line, the start's lake, the landmark's source, the
  bypass's exit, the works; then outlines and names.

**Start from**
- `types.ts`: `PremisePlan` and its parts, `PremiseDef`, `Invariant`. Its fields beyond PREMISES §1.1 are listed
  there (§1.1, "As built"). The seams a premise may use to change a shared stage (PREMISES §2.2, "Seams"; each
  optional): `PremiseDef.water` and `PremiseDef.land` (its own stages 1 and 2), `ground` invariants
  (`StageContext.heights`), `Link.halves` (a width per channel point), `Body.backwater` (a body its feeder stands
  in) and `Link.joins` (a wet link into a dry link's bed, wet from the join down). `generatePremise` takes a `PremiseDef` as its third argument, for tests and tools.
- `draw.ts`: `drawPlan` (one attempt, checked), `firstPlan` (the first that holds), `firstWater` (the first whose
  stage 1 water holds too), `failing`.
- `siting.ts`: stage 0's second pass (§2.2, "As built (step 8)"). `sitePlan` lays a premise's skeleton (its plan
  without the side network, `PremiseDef.skeleton`) through stages 1 and 2 in the theme's style (`siteLand`), reads day 1's soil on it
  (`ladder.ts` `dayOneSoil`) and lets the premise draw its side network again on that land (`PremiseDef.site`);
  `SiteModel.gain` is a work's estimate, the soil rule on the skeleton's land with the work's water and the ground
  its template lays. The lake stair's `siteSide` places each empty basin with its feed, spill, levee and dam as one
  chain, lays a work that reaches its floor (`givesOf`: a floor and a most, the milestone's ruling within D508), keeps
  the best short of its floor only where the ladder's kinds, count or three near the start ask it, said short in
  `plan.notes` (shown as `info.premise.notes`), and keeps the first pass's side network, said in the notes, where no
  second-pass draw passes. A dam to pond is weighed on the narrows the ladder lays (`ladder.ts` `narrowsFit`).
- `choice.ts`: the two choices (§1.3, §1.5). `resolvePremise` (Any from the seed, the premise first, then the theme among
  `PREMISE_THEMES`), `pairRefusal` and `PAIR_REFUSALS` (one line a pair the premise cannot honour), `premiseRefusal`
  (the line for a spec that makes no premise map: the pair, then `eligible`), `PREMISE_SETTINGS` and `premiseSettings`
  (what every panel setting does on a premise map, and the paths the page greys out).
- `style.ts` `premiseStyle`: the theme's style for an attempt (stage 2's `ReliefStyle`: its grade, benches, height
  over the stair, crags, Relief and Terracing, `THEME_UPLANDS`; stage 6's woods when the species mix is the panel's
  own).
- `card.ts` `premiseCard`: the map card's words from `info.premise` (the premise's name, the style, the landmark, the
  ladder's first rung; `workWords` says any work in a sentence), stored in `info.premise.card`.
- `generate.ts` `generatePremise`: the mode (§2.2 stages 3 to 6 and 8): plan, water, relief, start, the ladder (a
  plan whose day 1 by number is outside `spectrum` is drawn again before its settle, `ladder.ts` `spectrumMiss`),
  `premiseMap`, the checks (a check only a later step answers would be a warning, `LATER`; none is since step 6),
  the pair resolved first and the theme's style on stages 2 and 6, re-rolls up to `PLAN_TRIES` plans and
  `PREMISE_SETTLES` settles, else the reason in one line and the themes make the map (`info.premise.fellBack`).
- `frame.ts`: the first frame's arithmetic from `analysis/opening.ts`'s camera (§4.3): `frameLimit(z, h)`, how far in
  front of a start a point at height `h` stays under the frame's top edge; `lipInFrame` reads a lip through the
  opening camera. `checkFrame` is stage 3: the start kept or moved within 4 tiles to where its 5 × 5 is dry and
  level, the landmark's lip and foot are in the first frame, the frame's water is shallow (lake beds raised) and the
  walk finds the rules' level land and farmland.
- `washes.ts` `premiseWashes`: the dry washes and old bed (D517, `land/washes.ts`) cut into the ground after stage 3,
  off what stage 1 decided, the works and the niches; their fords join `PremiseLand.ramps`, the beds `PremiseLand.washes`
  (the dead stands' dry beds, `premiseLife`).
- `premises/lakeStair.ts`: the lake stair (§4): `lakeStairEligible`, the layout (the valley, the lakes on it, the
  start, its frame and the landmark placed together, the bypass on a course of its own over the land
  (`bypassCourses`: two legs over the seed's rises and hollows, turning far from the start, kept off the edge), the tarns and basins, the works, the ridges, the
  regions; past 192² the lakes and rim tarns sized by the map, `mapScale` and `rimTarns`, the further rim tarns spread round the edges and drawn long or round; every rim tarn's run to the edge bent and slid along it, `edgeRun`), its second pass
  (`skeletonOf`, `siteStair`, `siteSide`; the works' floors and most `givesOf`) and the stair's `plan` invariants. `layoutTry` gives one layout try as far as it got, for tuning.
- `premises/wallGate.ts`: the wall with one gate (§5.1), stage 0, land first (planning's ruling of 2026-11-11), its
  stages 1 and 2 (`gateWater`, `gateLand`) its `PremiseDef.water` and `PremiseDef.land`:
  `wallGateEligible`, the layout in a frame turned to the start's camera (the range: its crest as noise along a stretch
  of a longer drawn line, read so its lowest saddle lies where a gap can stand, its spine wandering behind the Veil's
  face, `GateNumbers.range`; the Veil at its high ground near the middle, the Gate's winding gorge at its lowest saddle,
  the Pass at the lowest on the other side; the plunge pool at the start's door the Veil falls into, two levels over the lake, its
  brook over a low lip down the valley in two steps (a reach, the Steps and their cascade, a reach), 3 or 4 wide by turns
  (`Link.halves`, `BROOK`, `STEPS`), the lake at the valley's low end (one broad body, its width varying, a bay or two, coves along its shore by turns,
  `LAKE_WANDER`), the Still
  Pool and its inlet off the plunge pool; the playa past the range; the leat along the crest and the Pass Bed; the basin's pan and the beds' outlet;
  the Low River through its spur; the southern brooks, 2 or 3 wide by turns, wandering, kinked out of their tarns and
  kept `BROOK_APART` from each other), its numbers in `GatePlan.gate` (`gateOf`) and its `plan` invariants.
  `gateRange.ts` reads the range along u (`rangeAt`, `sideOf`, `spineLocal`). Not offered: `premises/dev.ts`
  `DEV_PREMISES` lists it for the tools and tests; joining `spec/mapspec.ts` `PREMISE_IDS` offers it. No playability
  floor of its own: the shared gate holds the start.
- `gateWater.ts`: the wall with one gate's stage 1 (§5.1 "As built (water)"): `gateWater` (the shared `waterByNumber`,
  then the leat's bar, the Veil's foot a level under the sill with its outer row the ribbon, the first frame's beds under
  two), `GATE_WATER_CHECKS` (the shared ones, the Still Pool a `Body.backwater`; `gate.dry`, `frame.water`) and `gateSettleModel` (the undrawn ground over every
  water, for a settle of stage 1 alone). `tools/premise-gate-water.ts` prints and draws a seed's, `--settle` settles it.
- `gateLand.ts`: the wall with one gate's stage 2 (§5.1 "As built (land)"): the range as a scarp (§5.1 "The range, a scarp":
  the scarp's cliff bands and the back slope, `SCARP`; spurs `GateNumbers.spurs`, canyons by `erodeHard`, fans; the
  column pass `rangeColumns`; `rangeBand` (the frame's band where the ground stands over its foot, `rangeBandParts`), `rangeFlatShare`, `rangeValleys`, `rangeHeight` and the checks `range.flat`,
  `range.valleys`, `range.columns`); `gateRelief` (the shared relief for the
  valley, its uplands under the gap's saddle or its highest water + 2 and read through a warp away from the water,
  `valleyWarp`; the range shaped across its warped spine, talus on soft rock, cliffs on
  hard, spurs and gullies; the basin a playa within two levels of its pan, two old shoreline benches round it, hills past
  them, the beds' own valleys; then the flood check at the megadam's water and its least mend, `mendFlood`: a knoll on a saddle,
  one swell across a stretch of the edge), `gateZones`, `basinBeds`, `gateLand` (`premiseLand`'s parts for this land,
  the mend again round the badwater's niche) and `GATE_LAND_CHECKS` / `gateLandFailures` (its land invariants, on the
  ground: `range.crest`, `gate.lowest`, `wall.camera`, `basin.bowl`, `basin.playa`, `bench.shore`, `valley.enclosed`,
  `terrain.ruled_land`, `frame.lip`). `gateMap.ts` `gateMap` makes the whole map as the mode's loop does (a plan at a time: stages 0 to 4,
  one `premiseMap` build and its checks, the Veil's drop on the settle, `veil.settled`, the Gate dry past its rows, `gate.settled`, and every work sited; at most three settles; `held`
  says whether a plan held) and `startNumbers` reads the start's checks (D515's floors); `tools/premise-gate-map.ts`
  writes a seed's, `tools/capture-gate.ts` renders the widest frame and the opening camera in one sheet.
- `gateWorks.ts`: the wall with one gate's stage 4 (§5.1 "As built (works)"): `gateLadder` (round 8's rungs as templates
  on the land, measured as `ladder.ts` measures: the Still Pool's levee, the Gate opened and made whole, the leat and its
  whole share, the megadam with the Gate dammed across its gorge), `gateCard` / `gateWorkWords` (the card's words; `GateCard.dam`, what the
  megadam buys in days of drought on the settled map, `gateDamDays` by `sim/fill.ts` `fillDays`) and `GATE_WORKS_CHECKS`
  / `gateWorksFailures`.
- `planChecks.ts`: §1.4's checks every premise shares (levels fit, no bed under `BED_FLOOR`, bodies apart, the graph
  closes, the works add up, the skeleton is whole).
- `geom.ts`: capsule chains, paths and gaps. `diagram.ts`: the water-story diagram (`planSvg`, `planRaster`).
- `levels.ts`: the water table (§2.2, stage 1): each body's level and each link's flow, width and depth, from the
  sources down the graph, and the fitted constants `WATER`; `HOLD` and `holdDeep`, how deep a lake's floor lies so it
  keeps most of its water through the difficulty's longest drought (§4.4 `drought.lakes`).
- `hold.ts` `droughtHold`: that drought run on a built map (`HazardRun`, as the editor's Drought view): each lake's
  volume at its worst day and the day the start's water goes; `startWaterGate`, stage 8's gate on the start's water:
  read by the analytic drought first (`START_SCREEN`), the run only where that read cannot vouch, cut short once it
  can.
- `water.ts` `waterByNumber`: stage 1, the plan's water as heights and masks (`raster/field.ts` `WaterRaster`): the
  bodies' beds (`raster/bodies.ts`), the channels and their wander (`raster/channels.ts`), the falls' crests, lips
  and pools (`raster/falls.ts`), the weirs at the heads of channels a body's water splits between
  (`raster/weirs.ts`), the guard and where two waters may touch (`raster/guard.ts`), the rows of Blockages.
  `stageModel` is its water model for a settle.
- `raster/relief.ts` `reliefBetween`: stage 2, the whole map's ground round stage 1's water (the lower envelope of
  every water's bowl, each bowl's distance bounded to its box, rims kept from lower waters, the landmark's upper
  world, the bypass and every dry brook following the land (`followsLand`), the uplands as warped plates each at one level on a turned scatter (the rim's too: their fall toward an edge is a plate's, never a band along it), a theme's uplands in its form (`styledUplands`: high tables and canyons, peaks, terraces, a low floor in a rim) up to the plan's `sky` (Highest terrain, 22 from Verticality 70) while the stair stays under 16 (`stairTop`), ridges as crags, the hollow behind the skyline (`hollowsOf`), `tidy` and
  the bench-width floor `land/benches.ts`, its steps bent by `bendLevels`, D518); `badwaterNiches` cuts the
  permanent badwater source's niche beside the gorge.
- `ladder.ts`: stage 4 (§4.2). `layWorks` lays the works' own ground on stage 2's (each small levee's basin banked,
  a beach at its sill + 1 under a rim, the banks it raised kept in `LaidWorks.banks`; a notch's rock plug when `NOTCH_SHUT` is `"plug"`, D513(3): one switch from
  rows of Blockages). `ladderOf` places each work as its template on the land (rows cleared or a plug dug, a dam to
  pond across its bed where its pond stays in it, a levee across a basin's spill bed, a breach, a raised sill, the
  megadam's wall across the gorge to its shoulders at the next lake's sill, refused with a note where a side finds
  none within `WALL_REACH`) and estimates what it buys by number: day 1 is every row and notch shut (lakes on their sills);
  each work's water is `flowThrough` and `prefillFrom` on the floor with it and the works it needs done, and its
  gain (`estimateGain`) the tiles the soil rule (`soilReach`, a bucketed copy of `sim/moisture.ts` without
  contamination, equal to it tile for tile) newly reaches, no settle. A breach's, raised sill's or megadam's gain is
  the water it holds. A dam to pond's ground is a narrows template (`NARROWS`, `narrowsFit`): a pan behind the dam at
  the bench's level under rims, so its pond reaches the bench. A work is `paid` when it reaches its floor, with stage
  0's `estimate` beside the measure. The readout is `info.premise.ladder`: works with sites, gains, reach and notes; day 1's water
  and moist shares against `spectrum`.
- `life.ts` `premiseLife`: stage 6 on the settled ground (§2.2, "As built (step 6)"): the generator's own planting
  (`gen/resources.ts` `planResources`, with the dead stands every map has, D516) by the premise's budget (`LIFE`: living trees 450 to 700 per 10,000 tiles, at
  most 16 % of the moist ground under a tree, berries 185 to 230), its groves drawn together into close stands
  (`groupGroves`), living stands where it falls short, dead woods in clumps on the empty basins' shores and beside dry
  beds, a stand on the hollow behind the skyline and on each bench over a lake (`hollowsOf`, `benchesOver`:
  succulents, or dead wood where the palette has none; the one nearest the start first), succulents on the dry-for-good side, and the mine sites
  (`planExtras`'s, moved beside the start's reach where it cannot reach them); nothing on the works' sites and reach,
  the beds and basins or the start's sight line to the landmark. Its palette is the spec's resources: a theme's,
  when a theme sets them (PREMISES §1.5). The report is `info.premise.life`.
- `map.ts`: `premiseLand` (stage 2, the badwater's niche and `layWorks`) and `premiseMap` (the start where stage 3 put it, the
  sources and rows as features, a build stopped before the resources and settled, stage 6's life on it, the build
  again with the settle reused (`SettleCache`) and the checks). `tools/premise-map.ts` writes the mode's maps (or a
  plan file's) as a `.timber`, a project, a picture and a share link, each made and timed as the page's generator makes
  it (`tools/rust/page-path.ts`: the water's threads, the drought beside the map; `--one-thread` on one thread).
- `waterChecks.ts`: the `land` invariants, `flowThrough` on stage 1's heights alone (`stageFlow`, once per stage 1),
  and each weir whole (`water.weirs`).
- `tools/premise-plan.ts` prints a seed's plan and writes its diagram; `--plan` checks and draws a plan file.
  `tools/premise-water.ts` prints its water table and `land` result and draws its heights and water.

**Tests**: `tests/contract/premiseChoice.test.ts` (quick: the link carries theme and premise, Any resolved from the seed,
the presets split; a pair refused in one line; the style changes the land past the start's ground, never the plan or
day 1's water; every panel setting's role and the greyed list); `tests/contract/premisePlan.test.ts` (quick: the frame's arithmetic, eligibility, 18 plans, variety,
a broken plan for every `plan` invariant, the Four Lakes fixture `tests/fixtures/four-lakes.plan.json`);
`premiseGatePlan.test.ts` (quick: the wall with one gate kept out of the choices, its eligibility, seeds 1 to 24 a size,
variety, a broken plan for every `plan` invariant);
`premiseGateWorks.test.ts` (quick: the works invariants on two plans, the rungs and their gains, the card, a broken
case for each); `premiseGateLand.test.ts` (quick: on six seeds a plan the mode keeps holds every land invariant, a
broken ground for each) and
`premiseGateLand.heavy.test.ts` (four maps built: every blocking check, the start's numbers printed, the water settled on
the land); `premiseGateWater.test.ts` (quick: its `land` invariants on seeds 1 to 6 a size, the drought hold, the bars, the frame's
water, the Still Pool as a backwater, a broken raster for each of its own) and `premiseGateWater.heavy.test.ts` (five
plans settled: the lake and cleft over their sills, the Veil's curtain, the Gate and leat dry, nothing out but the Low
River);
`premiseSeams.test.ts` (quick: one test a seam on a small fixture, and the lake stair's bytes unchanged through a
premise that gives its stages as seams);
`premisePlan.heavy.test.ts` (seeds 1 to 200 at 128², 192² and 256²: every plan holds, 43 to 107 ms a plan on average;
PREMISES §3.3 has the numbers against the budget); `premiseWater.test.ts` (quick: the table's arithmetic, the lip's
stair, the `land` invariants on seeds 1 to 4 at each size and Four Lakes, a broken raster for each); and
`premiseRelief.test.ts` (quick: stage 2 keeps stage 1's ground and guard; seed 1 at 128² built passes the
ground's, the start's and the sources' checks); `premiseWater.heavy.test.ts` (seed 1 at each size and Four Lakes settled as the game plays them: levels against the
table, each link out of a split within 20 % of the table's flow, no stray water, each fall's curtain by the fall
judge with the notches open); `premiseMap.test.ts` (quick: seed 1 at 128² from a `p=lakeStair` link through
`generate`, every blocking check passed and none deferred, its style (Any: Canyon) and card, its ladder read out, its life inside the budget, its
`.timber` pinned; its lakes through a normal drought, each keeping half or more, the start's lowest lake 28 % or
more, the start's water every day; `soilReach` equal to
`sim/moisture.ts`; an ineligible spec gets a reason).

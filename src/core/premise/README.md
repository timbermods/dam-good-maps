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
  (the dead stands' dry beds, `premiseLife`). Its `within` keeps the lines to a set of tiles with their own least
  length and count: the poisoned floodplain's old channels on its dry floor (`plainMap.ts` `OLD_CHANNELS`).
- `premises/lakeStair.ts`: the lake stair (§4): `lakeStairEligible`, the layout (the valley, the lakes on it, the
  start, its frame and the landmark placed together, the bypass on a course of its own over the land
  (`bypassCourses`: two legs over the seed's rises and hollows, turning far from the start, kept off the edge), the tarns and basins, the works, the ridges, the
  regions; past 192² the lakes and rim tarns sized by the map, `mapScale` and `rimTarns`, the further rim tarns spread round the edges and drawn long or round; every rim tarn's run to the edge bent and slid along it, `edgeRun`), its second pass
  (`skeletonOf`, `siteStair`, `siteSide`; the works' floors and most `givesOf`) and the stair's `plan` invariants. `layoutTry` gives one layout try as far as it got, for tuning.
- `premises/wallGate.ts`: the wall with one gate (§5.1), stage 0, land first (planning's ruling of 2026-11-11), its
  stages 1 and 2 (`gateWater`, `gateLand`) its `PremiseDef.water` and `PremiseDef.land`:
  `wallGateEligible`, the layout in a frame turned to the start's camera (the range: its crest as noise along a stretch
  of a longer drawn line, read so its lowest saddle lies where a gap can stand, its spine wandering behind the Veil's
  face and swinging in one broad bend each side of it, its thickness swelling and thinning, cols along its crest,
  `RANGE_BEND`, `GateNumbers.range`; the Veil at its high ground near the middle, the Gate's winding gorge at its lowest saddle,
  the Pass at the lowest on the other side; the plunge pool at the start's door the Veil falls into, two levels over the lake, its
  brook over a low lip down the valley in two steps (a reach, the Steps and their cascade, a reach), 3 or 4 wide by turns
  (`Link.halves`, `BROOK`, `STEPS`), the lake at the valley's low end (one broad body falling across the valley from its head to the Low River's end, sagging toward the valley's far edge, its width varying, a bay or two, coves along its shore by turns,
  `LAKE_SHAPE`, `LAKE_WANDER`; its main arm's lobes on one arc whose middle is a quarter of its length off the line,
  `LAKE_BEND`, a main arm with no bend of 0.5 rad over 40 % of its length or an arm within 6 tiles of the map's edge
  laid again; over 128² the lake leaves the wall, `LAKE_LEAVES`: its main arm heads away from the range's line by 52
  to 63°, its far end only as far along the range as that takes it, two or three side arms a third of its length or
  so, bent twice, and the Low River's gorge swinging on along the valley to the spur and past it to the edge, 7 wide
  there, not 5 (`LOW_WIDER`: 5 wide on its flat bed, its water backed up over its banks); a
  layout whose lake reads as a canal lake is laid again, and `valley.lake` holds it on stage 1's water), the Still
  Pool and its inlet off the plunge pool; the playa past the range; the leat along the crest and the Pass Bed; the basin's pan and the beds' outlet;
  the Low River through its spur; the southern brooks, 3 or 4 wide by turns, each a way the land finds (`gateBrooks.ts`
  `brookWay`) with a channel meandering about it (`meander`: each bend's wavelength 6 to 14 widths and its swing 1.0 to
  1.8 rad about a drifting mean, a step aside at each level its bed drops; a trunk's a straight reach of low unrounded
  lobes and a tight loop right after it, `TRUNK_VARY`), square out of its tarn, kept `BROOK_APART`
  from the others or joining one (`BROOK_JOIN`: a trunk takes two tributaries, a tributary one, meeting at one level;
  with six brooks or more four springs gather in three orders, with five three springs in a chain (trunk, branch,
  twig), `BROOK_TREE`, `treeOf`; no brook beside another for more than 30 tiles, `gateBrooks.ts` `besideRun`)), its
  numbers in `GatePlan.gate` (`gateOf`) and its `plan` invariants.
  `gateMeasures.ts` reads the look of a built map (planning's verdict of 2026-11-14): `wallFoot` (the range's foot line
  and its longest straight run), `lakeShape` / `lakeShapeOn` / `lakeCanal` (the lake's shore along the wall and its
  width's range), `brookTree` (the brooks' orders, the longest chain of joins and the longest stretch two run side by
  side) and `drySide` (the basin's share within three levels under the lake's sill); and round 3's (planning's verdict
  of 2026-11-14 on round 2): `gateCrest` (the crest over the lake's sill by the gap and along the range, the gap's
  width), `lakeStraight` (the lake's longest straight stretch of shore against its main arm), `drySheet` (the dry side's
  share within a level of its ground 8 tiles off), `dryValley` (the Gate Bed's valley's depth along it) and
  `trunkBends` (each trunk's straight reach in wavelengths and its tightest bend against the next); and round 4's
  (planning's look verdict of 2026-11-14 on round 3): `lakeLeaves` (the angle between the lake's main arm and the
  foot's fitted line, its side arms a quarter of the main arm long or longer, its shore within 8 tiles of the foot);
  and round 5's: `stairRun` (the longest straight stair of one-level steps, `stairsOf`, 8 tiles at most,
  `STAIR_LONGEST`).
  `gateRange.ts` reads the range along u (`rangeAt`, `sideOf`, `spineLocal`). Not offered: `premises/dev.ts`
  `DEV_PREMISES` lists it for the tools and tests; joining `spec/mapspec.ts` `PREMISE_IDS` offers it. No playability
  floor of its own: the shared gate holds the start.
- `premises/poisonedPlain.ts`: the poisoned floodplain (`docs/design/poisoned-floodplain.md`), stage 0 only (its §9
  row 1), not offered: `poisonedPlainEligible` (a side under 128, Badwater Off, Rivers 0 each refused in one line), the
  layout in a local frame turned onto the map by an angle and mirrored (`boxOf`, `toMap`; planning's ruling of
  2026-11-15: the valley is not a corridor): its axis 10° to 35° off the grid with 1 or 2 gentle bends (`VALLEY`,
  `axisHeading`); each wall its own wandering line (round 3: spurs onto the floor and re-entrants back, 0.15 to 0.3 of
  `P` either way, a spur and its re-entrant 1.5 to 3 `P` long, `WALL`, a wall drawn again while its foot as the ground
  draws it runs straight, `wallFoot` through the floor's warp `FLOOR_WARP`, `floorWarpSeeds`, and given a spur where no
  draw wanders enough, `spurWhereStraight`, step 5; `raster/levee.ts` `straightestChord` finds the run), not
  parallel (the floor narrower at the plain's head, its mean over any `P` of its length 0.8 to 1.3 of `P`, `PLAIN`,
  `floorWidths`, `widthMeans`), the backswamp and the red stream on the far wall's foot; the
  plain by the map (`P` the larger of (M + 9) / 0.7 and 0.28 to 0.36 of the side, `plainRange`; its length 0.7 to 0.85
  of the side, its foot where its middle leaves the map; the floor 20 to 30 % of the map), at level L with its risers
  40 to 60 tiles apart (`RISER`), with the river's reach `M_REACH` a named guess step 2 measures; the river meandering
  in the near third, its width by flow; the levees as noise with 2 to 4 low places, not rasterised (`LEVEE`); the
  backswamp 7 to 10 wide (up to 0.06 of the side, `SWAMP`, `swampMost`) and the slough or two (`SLOUGH`: the first
  from the middle third, a second a third of the plain away); the start's terrace at the plain's head a third to a half
  of the way across, the start on its lip or, on a long terrace, nearer its brook (`TERRACE`, `brook`, step 5); the far wall's search window from the badwater distance, searched nearest-first in
  the runs the vista frame shows, with targets for the gulch, the col and the old valley (`WINDOW`, `GULCH`); the Red
  Spring's stream a fifth, a quarter or a third of the river (`RED_SHARE`) to its join in the river's last 30 % or its
  own exit (`JOIN`), its bed widened at its bends on the backswamp (`RED_POOLS`, `redHalves`, step 5); five regions; the ladder's rungs at their sites. Its numbers in `PlainPlan.plain` (`plainOf`), the
  day-1 shares by arithmetic on the map's tiles (`plainShares`), the diagram's own pieces (`plainOverlays`) and its
  `plan` invariants (`plain.levels`, `plain.width`, `wall.wanders`, `stream.join`, `start.badwater`, `frame.fall`, `poisoned.ladder`).
  `redClear` keeps a join's red water off the river's but at its end (round 3).
  `plainLayoutTry` gives one try as far as it got. `premises/dev.ts` lists it.
- `plainLand.ts`: the poisoned floodplain's stage 2 (its §9 row 2), the land and its `land` invariants;
  `plainAttempt` is one attempt (the plan drawn, the land, its checks and the start's frame), `plainLand` the first
  that holds. Step 3 added the levees' core (`LEVEE_CORE`, `raster/levee.ts` `water`/`core`/`lead`: within 3 tiles
  of the river's water a bank stands a level over the land and three over the river's bed, the river's whole length,
  the springs rimmed), so a badtide stays on the banks, and `courseGaps` (the ground stage 1 leaves between a course
  and the body it leaves or the river it joins, cut to its bed, with banks a level over it: the Red Pool's outlet as
  wide as its stream, or where the pool touches its stream the floor round their meeting, never a wall, `CourseGap.most`;
  the red stream's last reach and mouth as wide as its bed; the brook's mouth at the lowest of its own tiles beside
  it). Round 3 added `bankGulch` (the gulch's floor holds its stream to the Red Fall's lip) and reads `fall.drop`'s
  backswamp off its dry ground under the crest, the gaps left out (the Red Pool's sill is its stream's head bed, a
  level under it).
- `plainMap.ts`: the poisoned floodplain's whole map (its §9 row 3), dev-only: `plainMap` builds each attempt's
  land with the shared `premiseBase` (one settle) and `premiseFinish` (the life, its fill stands kept
  `START_WOOD_CLEAR` off the start, then the dead band's dead stands as its `PremiseDress`, `deadBand`), the badwater
  source in a niche dug level in the Red Spring's pool (`redNiche`), and holds a map whose shared checks pass (the
  start's among them) and whose `settled` invariants hold (`settledFailures`: `river.clean`, `water.leaks`,
  `plain.bands`, `fall.settled`, `fall.whole`, `levee.holds`), within 3 settles (`PLAIN_SETTLES`). Each measure is its own export
  (`plainCourses`, `plainLeaks`, `cleanWater`, `riverRed` on the file's own values, `format/world.ts`
  `fileContamination`, `settledBands`, `redFallDrop`, `redFallCurtain` by the shared fall judge `curtain.ts`,
  `badtideReach`), and the
  reports with no bound: `riverStand` (the river's steps, its water under the levees' crest and the plain) and
  `redMix` (the mix below the join, `joinEdge`, and how far traces creep above it). The river's steps themselves are
  drawn in the plan (`poisonedPlain.ts` `riverSteps`, `riverStage`, `riffles`). `tools/capture-plain.ts --water`
  draws the sheet. Step 4: a land whose works fail a blocking check by number is drawn again before its settle
  (`plainWorksOf`, the turn's pond held to the col first, `plainWorks.ts` `holdTurn`); the red source's niche
  stands within `NICHE_NEAR` of the plan's source point (the gulch's head), on the Red Spring's pool (step 5: a land
  with no 3 × 3 there is drawn again, `source.niche`). A map whose floor is under 60 % green with
  both works built (`riverInBands`: the weir and the dam raised on the built ground, the core's settle and soil, the
  proof's green exactly), or whose start's ground those works flood (`START_KEEP`, `onStartGround`, shared with
  `plainProof.ts`; step 5), is drawn again (`riverIn.green`, `riverInFailure`, planning's ruling of 2026-11-17); that settle also gives the
  ladder what is left to win (`leftToWin`, `Ladder.left`: the dry floor's share, and of it the share a ditch from any
  clean water reaches, `ditchReach`, and the share that needs a pump; shown, never a bar).
- `curtain.ts`: the shared fall judge (one whole curtain, no pillar, ledge or basin), used by the falls' contract tests
  and sweep and by the poisoned floodplain's `fall.whole`.
- `plainWorks.ts`: the poisoned floodplain's ladder (its §9 row 4), each rung a template on the land, measured as
  `ladder.ts` measures with the soil's contamination counted (`estimateGain`'s `poison`, and `heights` for a work that
  raises dry ground): the low place's levee (`lowLeveeSite`), the pond on the start's brook (`pondSite`), the
  backswamp's levee where the dead band laps onto the plain most (`swampLeveeSite`), the turn's dam a level over the
  col, six tiles or fewer, below the col's way and the red source (`turnSite`, `TURN`; its pond's rim at the col's
  level raised where it would spill beside the col, `holdTurn`), the river in's weir to the slough's bed (`weirSite`,
  the slough's mouth cut to its bed by `plainLand.ts` `sloughMouths`). The map lists the rungs that buy their floor
  and always the pond, the turn and the river in (`listPaid`, `LISTED`; the pond widened by `POND.step` until it
  holds its floor). The levees' clears
  are read again on the settled water (`settledClears`: the stage stands the river shallower than the core). Its
  checks by number (`PLAIN_WORKS_CHECKS`: `works.sites`, `works.paid`, `turn.byNumber`, `riverIn.byNumber`, read on the slough's way from its mouth at the river's
  level, step 5; `turn.byNumber` refuses red water leaving by an edge off the Dry Fork's, `FORK_EDGE`, step 5; all but `works.paid` blocking). `plainProof.ts`: the two proofs, the turn and then the river in built as operations on the
  settled map's session and the core's water and soil read (`turn.proved`, `riverIn.proved`: `RIVER_IN`, the floor
  60 % green and the start dry, with what is left to win beside it); offline only, so the
  generator never loads the session. `tools/plain-works.ts` runs both over seeds; `tools/capture-plain.ts --works`
  draws the sheet (as made, after the turn, after the river in), `--start` the whole map and the start close, each
  row captioned with the start's numbers and the generator's version (step 5).
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
  hard, spurs and gullies, ribs down both flanks (`RANGE_RIB`), a spur toward the valley a ridge falling to its talus,
  the Veil's shoulders (`VEIL_SHOULDER`), the crest by the gap 6 over the lake's sill (8 at 256²) falling to the plan's
  along the range (`GATE_HEIGHT`), ledges and terraces 4 tiles wide at most once the ribs draw them out (`LEDGE_MOST`);
  the basin a dried lake's floor at the lake's sill with broad swells (over 128² rolling from 3 under the sill to 4
  over in swells some 20 to 25 tiles apart, `BASIN_ROLL`, its edge's hills narrower), the dry beds in valleys of two benches that
  step down to them, the Gate Bed's first stretch past the crest 3 deep in the fan the old river laid (`DRY_VALLEY`),
  the playa a hollow where they meet sized from the floor it leaves (`PLAYA_FIT`, `basin.playa`'s share by size,
  `playaShare`: 55 % at 128², 45 % at 192², 35 % at 256²), two mesas 5 and 6 high and a rise
  for a ruin group, placed first and as wide as the room the beds leave, standing a level over the ground round it
  where its top would have no rim (`riseRim`, `RISE_STANDS`) (`BASIN_LAND`, `BASIN_MARKS`; `PremiseLand.ruinsAt`, `life.ts` `RISE_RUINS`), hills toward the edge
  terraced along warped contours, their treads 1 to 6 tiles and two or three steps one riser here and there
  (`RIM_TERRACE`);
  then the flood check at the megadam's water and its least mend, `mendFlood`: a knoll on a saddle,
  one swell across a stretch of the edge), `gateZones`, `basinBeds`, `gateLand` (`premiseLand`'s parts for this land,
  the mend again round the badwater's niche, no straight stair longer than 8 tiles (`breakStairs`: a riser stepped
  back a tile here and there along it, `STAIR_JOG`), no columns, a flat on the range domed till none is wider than four
  tiles, `FLAT_DOME`, and no hollow the water reaches, `fillPits`, raised to its brim) and `GATE_LAND_CHECKS` / `gateLandFailures` (its land invariants, on the
  ground: `range.crest`, `range.straight`, `gate.lowest`, `wall.camera`, `basin.bowl`, `basin.playa`, `bench.shore`, `valley.enclosed`,
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
- `geom.ts`: capsule chains, paths and gaps. `diagram.ts`: the water-story diagram (`planSvg`, `planRaster`; a premise's own pieces as `PlanOverlay` bands, lines and labels; water reached from a bad source drawn red).
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
  world, the bypass and every dry brook following the land (`followsLand`), the uplands as warped plates each at one level on a turned scatter at every size, the line two plates meet on ragged by noise (`PLATE_RAG`, D(plates-turned)) (the rim's too: their fall toward an edge is a plate's, never a band along it), a theme's uplands in its form (`styledUplands`: high tables and canyons, peaks, terraces, a low floor in a rim) up to the plan's `sky` (Highest terrain, 22 from Verticality 70) while the stair stays under 16 (`stairTop`), ridges as crags, the hollow behind the skyline (`hollowsOf`), `tidy` and
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
  (`gen/resources.ts` `planResources`, with the dead stands every map has, D516; first, where the land made a rise for
  one, `PremiseLand.ruinsAt`, a ruin group along its top's rim, `RISE_RUINS`, its scrap the map's) by the premise's budget (`LIFE`: living trees 450 to 700 per 10,000 tiles, at
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
variety, a broken plan for every `plan` invariant); `premisePlainPlan.test.ts` (quick: the poisoned floodplain kept out of the choices, its eligibility, seeds 1 to 12 a
size with day 1's bands, variety, its diagram, a broken plan for every `plan` invariant); `premisePlainWater.test.ts`
(quick: a map at 128² holding on its first attempt, its start, its three sources, its bands and dead stands, the same
map for the same seed, a broken map for every `settled` invariant, a start moved onto ground the works flood among them) and `premisePlainWater.heavy.test.ts` (seeds 1
to 12 at each size, each holding every check with the Red Fall one whole curtain as settled, first attempts at least
`FIRST`: 9 of 12 at 192² and 256², each map made once so the floor counts all twelve in any order); `premisePlainWorks.test.ts` (quick: a map at
128² that lists the pond, the turn and the river in and only rungs that buy their floors, each on its land, the turn
six tiles or fewer, a broken ladder for every works check) and `premisePlainWorks.heavy.test.ts` (the two proofs on seeds 1 and 2 at each size); `gateBrooks.test.ts` (quick: the brooks' meander: its swing and
wavelength, no curve touching itself, the straight head, the steps aside on a steep reach, the room, one of six draws
with no straight reach at any angle, a trunk's straight reach and tight loop);
`premiseGateWorks.test.ts` (quick: the works invariants on two plans, the rungs and their gains, the card, a broken
case for each); `premiseGateLand.test.ts` (quick: on six seeds a plan the mode keeps holds every land invariant, a
broken ground for each) and
`premiseGateLand.heavy.test.ts` (four maps built: every blocking check, the start's numbers printed, the water settled on
the land, the look's measures); `premiseGateWater.test.ts` (quick: its `land` invariants on seeds 1 to 6 a size, the drought hold, the bars, the frame's
water, the Still Pool as a backwater, a broken raster for each of its own) and `premiseGateWater.heavy.test.ts` (five
plans settled: the lake and cleft over their sills, the Veil's curtain, the Gate and leat dry, nothing out but the Low
River);
`premiseSeams.test.ts` (quick: one test a seam on a small fixture, `Link.wander` among them, and the lake stair's bytes unchanged through a
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

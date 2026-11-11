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
  there (§1.1, "As built").
- `draw.ts`: `drawPlan` (one attempt, checked), `firstPlan` (the first that holds), `firstWater` (the first whose
  stage 1 water holds too), `failing`.
- `siting.ts`: stage 0's second pass (§2.2, "As built (step 8)"). `sitePlan` lays a premise's skeleton (its plan
  without the side network, `PremiseDef.skeleton`) through stages 1 and 2 in the theme's style (`siteLand`), reads day 1's soil on it
  (`ladder.ts` `dayOneSoil`) and lets the premise draw its side network again on that land (`PremiseDef.site`);
  `SiteModel.gain` is a work's estimate, the soil rule on the skeleton's land with the work's water and the ground
  its template lays. The lake stair's `siteSide` places each empty basin with its feed, spill, levee and dam as one
  chain, leaves out with a note (`plan.notes`, shown as `info.premise.notes`) a small work no site brings inside its
  range, and keeps the first pass's side network, said in the notes, where no second-pass draw passes.
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
- `premises/lakeStair.ts`: the lake stair (§4): `lakeStairEligible`, the layout (the valley, the lakes on it, the
  start, its frame and the landmark placed together, the bypass, the tarns and basins, the works, the ridges, the
  regions; past 192² the lakes and rim tarns sized by the map, `mapScale` and `rimTarns`, the further rim tarns spread round the edges and drawn long or round; every rim tarn's run to the edge bent and slid along it, `edgeRun`), its second pass
  (`skeletonOf`, `siteStair`, `siteSide`; the works' green ranges `givesOf`) and the stair's `plan` invariants. `layoutTry` gives one layout try as far as it got, for tuning.
- `planChecks.ts`: §1.4's checks every premise shares (levels fit, no bed under `BED_FLOOR`, bodies apart, the graph
  closes, the works add up, the skeleton is whole).
- `geom.ts`: capsule chains, paths and gaps. `diagram.ts`: the water-story diagram (`planSvg`, `planRaster`).
- `levels.ts`: the water table (§2.2, stage 1): each body's level and each link's flow, width and depth, from the
  sources down the graph, and the fitted constants `WATER`; `HOLD` and `holdDeep`, how deep a lake's floor lies so it
  keeps most of its water through the difficulty's longest drought (§4.4 `drought.lakes`).
- `hold.ts` `droughtHold`: that drought run on a built map (`HazardRun`, as the editor's Drought view): each lake's
  volume at its worst day and the day the start's water goes.
- `water.ts` `waterByNumber`: stage 1, the plan's water as heights and masks (`raster/field.ts` `WaterRaster`): the
  bodies' beds (`raster/bodies.ts`), the channels and their wander (`raster/channels.ts`), the falls' crests, lips
  and pools (`raster/falls.ts`), the weirs at the heads of channels a body's water splits between
  (`raster/weirs.ts`), the guard and where two waters may touch (`raster/guard.ts`), the rows of Blockages.
  `stageModel` is its water model for a settle.
- `raster/relief.ts` `reliefBetween`: stage 2, the whole map's ground round stage 1's water (the lower envelope of
  every water's bowl, each bowl's distance bounded to its box, rims kept from lower waters, the landmark's upper
  world, the bypass and every dry brook following the land (`followsLand`), the uplands as warped plates each at one level (the rim's too: their fall toward an edge is a plate's, never a band along it), a theme's uplands in its form (`styledUplands`: high tables and canyons, peaks, terraces, low ground), ridges as crags, `tidy` and
  the bench-width floor `land/benches.ts`); `badwaterNiches` cuts the
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
  the water it holds. The readout is `info.premise.ladder`: works with sites, gains, reach and notes; day 1's water
  and moist shares against `spectrum`.
- `life.ts` `premiseLife`: stage 6 on the settled ground (§2.2, "As built (step 6)"): the generator's own planting
  (`gen/resources.ts` `planResources`) by the premise's budget (`LIFE`: living trees 450 to 700 per 10,000 tiles, at
  most 16 % of the moist ground under a tree, berries 185 to 230), its groves drawn together into close stands
  (`groupGroves`), living stands where it falls short, dead woods in clumps on the empty basins' shores and beside dry
  beds, a stand on each bench over a lake (`benchesOver`: succulents, or dead wood where the palette has none; the
  one nearest the start first), succulents on the dry-for-good side, and the mine sites
  (`planExtras`'s, moved beside the start's reach where it cannot reach them); nothing on the works' sites and reach,
  the beds and basins or the start's sight line to the landmark. Its palette is the spec's resources: a theme's,
  when a theme sets them (PREMISES §1.5). The report is `info.premise.life`.
- `map.ts`: `premiseLand` (stage 2, the badwater's niche and `layWorks`) and `premiseMap` (the start where stage 3 put it, the
  sources and rows as features, a build stopped before the resources and settled, stage 6's life on it, the build
  again with the settle reused (`SettleCache`) and the checks). `tools/premise-map.ts` writes the mode's maps (or a
  plan file's) as a `.timber`, a project, a picture and a share link.
- `waterChecks.ts`: the `land` invariants, `flowThrough` on stage 1's heights alone (`stageFlow`, once per stage 1),
  and each weir whole (`water.weirs`).
- `tools/premise-plan.ts` prints a seed's plan and writes its diagram; `--plan` checks and draws a plan file.
  `tools/premise-water.ts` prints its water table and `land` result and draws its heights and water.

**Tests**: `tests/contract/premiseChoice.test.ts` (quick: the link carries theme and premise, Any resolved from the seed,
the presets split; a pair refused in one line; the style changes the land past the start's ground, never the plan or
day 1's water; every panel setting's role and the greyed list); `tests/contract/premisePlan.test.ts` (quick: the frame's arithmetic, eligibility, 18 plans, variety,
a broken plan for every `plan` invariant, the Four Lakes fixture `tests/fixtures/four-lakes.plan.json`);
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

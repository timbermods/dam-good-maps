# Premises: how the generator makes a map from an idea

A design, built a step at a time (section 7 marks the steps built). [MAPCRAFT.md](MAPCRAFT.md) says what makes a map good and lists the craft in thirteen steps;
its table says the generator starts from noise and has no idea, no ladder and no weather gate. The hand-built map Four
Lakes (`tools/showcase/four-lakes.ts` and `four-lakes-design.ts` on branch `showcase/four-lakes`; its rounds in
`C:\dgm-showcase\four-lakes\LOG.md`) walked those steps from a one-line premise and is in a different class from any
generated map. This page is how the generator walks steps 1 to 9 itself, so that Generate gives a map of that class,
varied by seed. Written for the builders: exact names where they exist, numbers where they were measured, and
**(assumption)** on everything that was not verified in the code.

Two rules from Kyler bind every section: **a map must not arrive fully watered** (a generous green start and core, then
dry land that is irrigable by design, as a ladder of works), and **wood is a resource with a budget, never a carpet**.

## 1. The model

### 1.1 What a premise is

A **premise** is a problem the player solves, with the water that makes the problem true. It is not a layout: one
premise has many layouts. In code a premise is a module in a new directory `src/core/premise/` that exports a
`PremiseDef`:

```ts
interface PremiseDef {
  id: PremiseId;                       // "lakeStair"
  /** Why a spec can't have this premise, in one line, or null (size, lakes: none, waterfalls: off …). */
  eligible(spec: MapSpec): string | null;
  /** The plan for this seed and these settings; `attempt` draws the next one. Pure arithmetic, no terrain. */
  draw(spec: MapSpec, attempt: number): PremisePlan | { reason: string };
  /** Every rule a map of this premise must pass, each with the stage that can judge it (section 1.4). */
  invariants: Invariant[];
}
```

The **plan** is the map before any terrain: MAPCRAFT's steps 1 to 5 as data. Every later stage reads it and nothing
else decides where things go.

**As built (step 1, `src/core/premise/types.ts`).** The names below stand; the plan needed a few more fields: a body's
`islands` (capsule chains of land); a link's `mouth` (the bypass's 10 where it differs from twice its half width); a
fall's `crest` (its level) and `lip` (the crest line, two points), with `notch`, `piers` and `breach` as tile counts;
a work's `at` (where it stands) and `gives.reservoir` as a range like `green`; a region's `at` (where the diagram
names it); a ridge's `id` and `role` (`skyline`, `spur`, `wall`); and `stair`, the lake stair's own numbers (n, f,
the lakes in order, the start's lake, H, the landmark's source, the valley's line, shape and turn, flow, meadow).

```ts
interface PremisePlan {
  premise: PremiseId; seed: number; W: number; H: number;
  top: number;                 // the highest ground allowed (settings.terrain.highestTerrain)
  line: string;                // the one-line problem, in this map's own names
  // the water story
  sources: Source[];           // { id, at, strength, into: bodyId }  (every source runs bad in a badtide)
  bodies: Body[];              // lakes, tarns, pools, empty basins, kettles
  links: Link[];               // falls, channels, leats, brooks, the bypass: body → body | exit
  exits: Exit[];               // { id, edge, at }: where water leaves the map
  // the skeleton
  regions: Region[];           // three to five: { id, role, problem, prize, dayOne: "green" | "dry" | "dryForGood" }
  ridges: Ridge[];             // skyline, the spurs at each fall, the wall an exit cuts through
  edges: Record<Edge, "falls away" | "ridge" | "water leaves">;
  // the start and its first frame
  frame: FrameGroup;           // { start: {x, y, z, orientation}, landmark: linkId, lipAhead, bench: tiles }
  // the ladder
  works: Work[];
  // set pieces and secrets
  setPieces: SetPiece[];       // each tied to a body, a link or a work
  names: Record<string, string>;
}

interface Body {
  id: string; kind: "lake" | "tarn" | "pool" | "basin" | "kettle";
  sill: number;                // its sill's crest: the water stands 0.1 to 0.6 over it
  arms: Spine[];               // its outline: chains of capsules [x, y, radius]
  meadow: number;              // the width of its level meadow, in tiles
  deep: number;                // its bed's deepest, below the sill
  dry: boolean;                // an empty basin on day 1: a work fills it
  region: string;
}

interface Link {
  id: string; from: string; to: string;          // body or exit ids
  kind: "fall" | "channel" | "leat" | "brook" | "gorge" | "bypass";
  // a fall: over the sill of `from`
  fall?: { height: number; width: number; face: Heading; notch: number; piers: number; breach: number };
  // a channel: along a path
  path?: Point[]; half?: number; bed?: number[] | { under: number };
  wet: boolean;                // carries water on day 1
  gates: number[];             // tiles along it where a dam of its width shuts it (the player's)
  rows: number[];              // tiles along it where a row of Blockages spans it (the generator's)
}

interface Work {
  id: string; rung: "first" | "small" | "medium" | "large";
  kind: "breach" | "notch" | "damToPond" | "levee" | "leat" | "raisedSill" | "bypass" | "megadam" | "canal";
  on: string;                  // the link or body it is built on
  tiles: number;               // what the player builds or clears
  needs: string[];             // works that must come first
  gives: { green: [number, number]; reservoir?: number };   // tiles turned green or wet; water held
  tradeoff?: string;           // one line, when the work has a cost (a notch from a spring tarn runs red)
  region: string;
}
```

`Spine`, `Point`, `Ridge` and the fall's and channel's fields are `four-lakes-design.ts`'s (`Sp`, `Pt`, `Ridge`,
`Fall`, `Channel`), generalised: a fall's `face` is any of eight headings, not `"S" | "W"`.

### 1.2 What the plan answers (MAPCRAFT steps 1 to 5)

- **The one-line problem**: `line`. It names the landmark and the answer.
- **The water story**: `sources`, `bodies`, `links`, `exits` form a graph. From it alone the plan can say what dries
  first (bodies in order of the notch that drains them), where badwater goes (every body downstream of a source, by
  default; the bodies no gated link reaches once the bypass is open) and the answers (the `works` of kind `bypass`,
  `raisedSill`, `megadam`, and the `gates`).
- **The skeleton**: `regions`, `ridges`, `edges`, and the landmark named in `frame.landmark`.
- **The start and its first frame**: `frame`. The start and the landmark are placed together, by the camera's
  arithmetic, before any land exists (section 2, stage 0).
- **The ladder**: `works`, each with what it buys as a range the later stages must hit.

### 1.3 How a seed and the settings vary a premise without breaking it

- **The seed** draws from named streams (`math/rng`), one per stage (`premise.plan`, `premise.relief`, `premise.life`,
  `premise.pieces`), so a change to one stage never reshuffles another. It varies **structure first** (D108: two maps
  must play differently): how many bodies, which body the landmark falls into, which side the bypass runs, which works
  are on the ladder and where. Then outline, wander and dressing.
- **The settings** move the plan's numbers inside the premise's ranges; they never switch an invariant off. Where a
  setting contradicts the premise (`eligible` returns a reason), the premise is not drawn and the generator makes the
  map from the themes as today, so every setting still makes a map (D471). The page says the reason in one line.

| Setting | What it moves in a premise plan |
|---|---|
| Size | The count of bodies and works (by area), the valley's length. Meadow widths and fall widths do not scale: the soil's reach and the first frame are fixed sizes. |
| Difficulty (`designedFor`) | The start's held water (the breach's width, the cove pool's size), the sources' strength, how many small works stand within the start's walk. Hazard lengths are `sim/weather.ts` `HAZARD_DAYS`. |
| Terrain: Highest terrain, Verticality | The stair's height: the fall heights and how many levels the plan may use (`top`). A tall map gets a higher skyline, not deeper water. |
| Terrain: Relief, Terracing | The outlands' amplitude and crag heights; the share of two- and three-level scarps, kept inside the 60 to 80 % one-level band. |
| Terrain: Buildable land | Meadow width (tight 12, normal 15, generous 18) and the start's bench. |
| Terrain: Variety | Wander, and how many side bodies (tarns, kettles) the plan draws. |
| Water: River flow | The sources' total strength; lips widen with it (`sim/sill.ts` `sillWidthFor`) so heads stay shallow. Lush lengthens meadows toward the top of the green range; it never removes a work. |
| Water: Lakes, Waterfalls, Rivers | The count of bodies, of falls beyond the premise's own, of living side brooks on day 1. `lakes: none`, `waterfalls: off` and `sources: none` make a water premise ineligible. |
| Water: Drought reserve | The start's held water and the first reservoir's size. |
| Hazards | The permanent badwater source's strength and distance (D200: every map has one unless Badwater is off; placed below the lowest sill so it leaves by the exit, D498); thorns on the dry-for-good region; unstable cores by the springs. |
| Resources | Scale the budgets of section 2 stage 6 inside their ranges: wood stays a budget at every Forest density. |
| Start: Easy start, the rules | The start rules are the checks' own and always hold. Easy start is not offered with the lake stair yet (section 9, ruling 4). |

### 1.4 Invariants

An invariant is a rule with a number and the earliest stage that can judge it:

```ts
interface Invariant {
  id: string;                               // "stair.levels", "frame.lip", "premise.open" …
  at: "plan" | "land" | "settled" | "proof" | "game";
  /** Passed, or a one-line reason and, where one exists, the repair to try before a re-roll. */
  test(ctx: StageContext): { ok: true } | { ok: false; reason: string; repair?: Repair };
}
```

- `plan`: arithmetic on the plan (levels fit, bodies don't overlap, the frame's geometry closes). Microseconds.
- `land`: on the heights, with `sim/prefill.ts` `flowThrough` (levels, flow and bad flow by a priority flood, no
  settle), the camera (`analysis/opening.ts`), the soil's reach and the ground measures. Milliseconds.
- `settled`: on the one canonical settle and the checks.
- `proof`: by the weather model (`sim/weather.ts` `HazardRun`) and what-if settles. Seconds to a minute: run in the
  background after the map opens, and offline over seeds (section 6).
- `game`: only the capture kit can judge it. Offline, on a sample.

The lake stair's invariants, with numbers, are in section 4.4.

## 2. The pipeline

### 2.1 Where it sits

A premise is **a mode of `generate`, beside the themes, not a theme**. `MapSpec.premise` exists already
(`src/core/spec/mapspec.ts:126`, link key `p` in `spec/codec.ts`) and nothing reads it. When it holds a premise id,
`generate` (`src/core/gen/generate.ts:486`) calls `generatePremise(spec, opts)` in `src/core/premise/generate.ts` after
`assertSpec` and returns the same `GenerateResult`, so the page, the workers, share links, the versions search and
Showcase mode need no change. `spec.theme` is `"any"` on a premise map.

**Shared with the themes' path:** `MapSpec`, `Settings` and the link codec; `features/build.ts` `buildMap` with its
`SettleCache`, and so the canonical settle, the soil, the slopes and the entities; `gen/pack.ts` `toTimberFile` and
`validate/checks.ts` `validateMap` in profile `"generate"` (the same blocking checks); `analysis/opening.ts`;
`resources/budget.ts` and `resources/baseline.ts` (`planGroves`, `planPatches`, `planRuinFields`, `ruinColumns`);
`gen/extras.ts` `planExtras` (mine sites, relics, thorns) and `land/minePads.ts`; `gen/ruinStories.ts` (a ruined dam
across a narrows is the premise's ruined weir); `gen/forms3d.ts` `growOn` for the cave; the background check
(`src/worker/checks.worker.ts`); `gen/showcase.ts`'s scoring.

**Not shared:** the genome, `land/hydro.ts`, `planLandStage`, the intentions, `gen/settler.ts` `pickStart` (a premise
places its start by its frame; the start *rules* are still the checks'), the rescue rounds (a premise that spends its
plans hands the spec to the themes' path).

**What the map is in the document:** a `GeneratedField` (`features/build.ts:123`: `heights`, `contains`, `top`,
`caves`) plus features, exactly as a theme's map: each body a `lake` feature (`natural: true`; a pool with sources has
`inflow: { spring: n }`), each blockage row a `mapObject` of kind `plug`, the start a `start` feature, resources as
`forest`, `berryPatch` and `ruinField` features. The plan itself is stored in `GenerateResult.info.premise` for the
ladder's readout (section 8). **(assumption)** Whether a contained `river` feature with `entry: { lake }` places no
source of its own was not verified; if it does, the premise's channels stay in the field only and are not features.
**(assumption)** `MapObjectKind` has no aquifer, ancient drill or underground ruins; the set pieces need those kinds
added in `features/schema.ts` and `features/objects.ts`.

### 2.2 The stages

Every stage is a pure function in `src/core/premise/`, headless, with a test that must pass before the next runs
(MAPCRAFT section 3's rule). `four-lakes-design.ts` is the raw material for stages 1 to 3 and `four-lakes.ts` for the
rest; the function named in brackets is the script's helper the stage generalises. The order is MAPCRAFT's but for
one move: the settle (stage 5) comes before life and set pieces, because plants go where the settled moisture is, and
it runs once.

**Stage 0. Layout at map scale** (`draw.ts` `drawPlan`).
- In: the spec, the attempt. Out: a `PremisePlan`.
- Does: draws the premise's graph and places it: the valley's line across the map, the bodies along it by arc
  length, their levels by number, the side bodies, the bypass, the ridges, the works. Places the **frame group**: the
  start's tile, level and turn, and the landmark's lip in front of it, solved with `openingCamera` and `frameAt`
  (section 4.3 gives the arithmetic), because a landmark that must be whole in the first frame leaves the start a
  few tiles of freedom and no more. Everything else is laid out round that.
- Test: the `plan` invariants. A plan that fails is drawn again (free: no terrain was made).

**Stage 1. Water levels and falls by number** (`levels.ts` `waterTable`; `raster/bodies.ts`, `raster/falls.ts`,
`raster/channels.ts`, `raster/guard.ts`).
- In: the plan. Out: `heights` where water will be (beds, sills, lips, plunge pools, channel beds), masks
  (`lake`, `channel`, `pool`, as `Land` in the script), and a `WaterTable`: each body's expected level, each link's
  flow and depth.
- Does, by number: a body's bed [`designLand`'s lake-bed block: a shelf at the sill, a shallow margin, the drowned
  river's line, no depth rings]; a fall [`FALLS` and `greatFall`: the gap between two shoulders, a crest two tiles
  thick, the notch, piers, the plunge pool; a landmark's lip in unequal runs]; a channel [`Channel`: a bed profile
  given or following the land, banks, a wadi's strip for a dry one]; the guard [`designLand`'s guard: a tile beside
  water that would let it out stands a level over it, exits excepted]; a row that spans a channel [`spanRow`].
  Widths come from flows: a lip's width is `sillWidthFor(flow)` clamped to 8 to `MAX_SILL_WIDTH` (16), so the head on
  it is 0.15 to 0.35.
- The arithmetic it uses, fitted by this stage's test on Four Lakes and drawn plans (as built, below): a lip carries
  3.3 × head per tile; a channel 2.5 × width × depth, so a gorge 5 wide carries about 13 a level deep (2.6 settled);
  a notch one tile wide and a level deep carries about 3.5 (3.7 in the table); where a body's water splits between
  channels, each channel's head is a weir that carries as a lip does.
- Test (`land`): `flowThrough` on the rastered water alone gives each body's level within 0.5 of its sill and no
  flow leaving except by a planned exit; each fall's drop is its height; every row spans its channel.

**As built (step 2).** Stage 1 is `water.ts` `waterByNumber`; its `land` invariants are `waterChecks.ts`
(`water.levels`, `water.exits`, `water.wet`, `water.falls`, `water.rows`, `water.weirs`); `tools/premise-water.ts` prints a seed's
table and draws its heights and water. Where it differs from the above, and why:

- **The constants, fitted** by `premiseWater.heavy.test.ts` (seed 1 at the three sizes and Four Lakes, settled as the
  game plays them): a lip carries 3.3 × head per tile (verified: every wet body settles within 0.2 of the table's
  level, every lake 0.05 to 0.6 over its sill); a channel carries 2.5 × width × depth (fitted: brooks measured 2.5 to
  4.4, the gorge 2.6; at 3.3 the gorge overtopped its guard). In the table a notch or breach is a lip tile a level
  deeper (it carries about 3.5 settled, 3.7 in the table), a pier one a level higher, a weir (below) a lip of its
  width, and a link a row spans carries nothing.
- **Where a body's water splits, each channel's head is a weir** (`raster/weirs.ts`; `levels.ts` `weirs`). A
  channel's own course sets what it carries: on seed 1 at 192² the hanging valley took 9.1 of the springs' 14 where
  the table said 7.5 (3.2 a tile of width a level of head, the neck 1.9), so the stair got 4.8 of its 6.5 and its
  lips poured a film. So where a lake or the springs' pool has two open ways out or more (the pool's neck and hanging
  valley, a lake's stair fall and hanging valley), each channel's head is a crest two tiles thick at its head bed,
  square to the grid (a weir across a diagonal carries a third less a tile), as wide as the channel in tiles, set
  just past the body's shore, a tile or two aside where another water crowds it; the body's water a level deep
  behind it, rock beside its ends, and the bed past it two levels lower (a level for the hanging valley, whose lip
  is the next step), the body's shelf where it runs into another body lowered with it, and its banks the body's.
  Where its course past the weir bends back beside its head or its body, that course is rock there (a valley that
  hooked back beside the pool took half its flow round its weir, seed 11 at 128²); stage 0 keeps the valley 5.4
  tiles clear of its source past its first 7, and its head 11.4 clear of a stair fall's lip, whose shoulders and
  bed, laid after the weir, crowded it.
  The table carries 3.3 × its tiles × the head over it, and the split is the table's: on seeds 1 to 12 at the three
  sizes the pool's neck and valley carry the table's 7 and 7 within 2 %, a lake's stair fall and valley within 9 %
  and 16 % (the valley's share is the smaller, 3.8 of 14), and Four Lakes within 1 %. A valley level with its
  source splits worse (a third off from a lake, 16 % from the pool): the landmark's lip, at the weir's level, drowns
  the weir from below, so stage 0 drops every valley a level or more (`VALLEY_DROP`). `water.weirs` holds each weir
  whole (as many columns as its width with the bed in front, the crest and the water behind), so a weir
  another water crowds is drawn again. A side body's brooks keep their beds: they carry a trickle.
- **Lip widths come from the table's flow** (`lipWidth`, routed three times as the widths settle), never under 8
  plus the lip's piers, notch and breach, so 8 tiles pour (`stair.settled`): a pier pours nothing, and at a step of 3
  a notch or breach a level deeper drops 2 and some, a rapid, not the curtain. At the lake stair's flows every stair
  fall's lip is that floor, 9 (the ruined weir's 12 or 13): the stair carries 7 of the springs' 14 (the neck and the
  landmark's valley are both 5 wide; the landmark takes the other 7) or, the landmark fed from a lake, about 10, and
  the notch, open on day 1, about 3.5 of it, so the head on the rest of the lip is about 0.13, under the 0.15 to
  0.35 above. Settled with the notches open, as the game plays day 1, on seed 1 at the three sizes and Four Lakes
  every stair fall pours one curtain over its whole lip (9 or 10 tiles; the ruined weir's pieces 10 between its
  piers), and the landmark 12 to 15 tiles 6.7 to 6.9 down. On seeds 1 to 12 at the three sizes, 109 of 119 falls
  pass `stair.settled`'s curtain; section 9 has the other 10.
- **A stair fall's plunge pool runs on through its lake's shore shelf** (`raster/falls.ts`), to two tiles past where
  the lake's bed lies under its sill: the shelf between them was a weir of its own, and the fall's foot stood 0.4
  over its lake, its drop 2.6 of 3 (seed 1 at 256²). The lowest lake is two levels deep, its bed on `BED_FLOOR`
  (stage 0's `LOW_DEEP`): it carries the whole of the springs to the gorge, and a level deep it stood 0.7 over its
  level at its far end and overtopped its guard (seed 12 at 256²).
- **The channels wander** (D208; stage 1 owns it, before the guard and the rows): a channel's course is its path a
  tile at a time, each point moved across it by noise, fading to the path over 6 tiles at each end so a channel
  leaves and meets its waters where the plan says (`raster/channels.ts` `wanderOf`): the bypass 2.2 tiles, a leat
  0.8, a brook drawn from 1 to 4.2, as Four Lakes' `Channel.wander`. The neck, the hanging valley and the gorge run
  true: their heads are weirs and lips. Stage 0 cuts the bypass's sharp corners (`softCorners`), so the old channel
  never turns a right angle.
- **The lip** is a stair of runs (`raster/falls.ts` `lipStair`), drawn longer a tile at a time until it holds its
  width in tiles, since a diagonal's corners cost tiles. A lip rising less than a tile in three along the grid is
  one straight run, stepped where its line asks. A corner tile with no crest behind it, fed only by the lip beside
  it, is the pool's: it would pour a film. A stair fall's horseshoe is set into a straight lip only: on a diagonal it
  flattened the stair's middle into one run and steepened its ends into risers its lake barely reached, or combed
  the lip with pockets. A notch whose drop is a curtain (a step of 4 or 5) sits in a run's middle, never beside a
  step, which would starve the tile past it; at a step of 3 its drop, 2 and some, is a rapid, which in the lip's
  middle split the curtain in two (12 of 36 maps), so it sits at one end. A notch or breach is cut through the
  crest behind it, a corner's across from whichever front has the crest's second row behind it. Piers stand three
  tiles apart about the lip's middle, on the lip only (the crest behind runs on, so no lip tile is cut off), as
  ground a level over the crest; the breach is between the middle two.
- **The level test shuts the notches and breaches**: `flowThrough`'s spill levels are static, so an open notch
  would stand its lake at the notch, a level under the sill the table's water stands over. Where the water goes is
  the same either way. A body with no way out (a pond a work fills) stands at its rim, its sill + 1.
- **Two waters touch only where the plan joins them** (`raster/guard.ts` `partWaters`): a fall's crest between its
  two bodies, a channel's head and mouth, a brook's end where it joins another channel into the same body. Elsewhere
  the guard parts them, and pieces cut off are dropped. A lake's tiles near a channel's mouth are raised towards the
  channel's surface (`surgeMouths`), so the surge where a channel runs in does not overtop the guard. The guard stands
  at floor(surface + 0.15) + 1.
- **A shut link's head holds its body's water**: where the landmark leaves a lake, the pool's whole flow goes down
  the neck (a gate 5 wide or less) and the pool stands up to 1.3 over its sill (up to 1.7 settled), over the
  sill-level bed of a bypass or leat. So a link a row spans has its first tiles, to its first row wherever that row
  came to stand (another channel that took the link's head moves it on), raised to hold its body's level plus 0.3,
  and the guard rises with them; a leat whose row stood past its raised head let the pool over it.
- **A plan whose water fails a `land` invariant is drawn again** (`draw.ts` `firstWater`), as one failing a `plan`
  invariant is. On seeds 1 to 40, 29, 39 and 32 hold first time at 128², 192² and 256²; every seed holds within
  `PLAN_TRIES`. The failures are stage 0's: another link running through or beside a fall's lip or pool, a brook into
  the landmark's valley, two falls side by side. Stage 0 keeping other links clear of the falls would remove most.

**Stage 2. Relief between** (`raster/relief.ts`).
- In: stage 1's heights and masks, the plan's regions and ridges. Out: the whole map's `heights`.
- Does: the land is the **lower envelope of every water's bowl** [`designLand`'s main loop]: beside each water a
  level meadow one level over it (its width the body's `meadow`), then a crag, a bench, a second crag [`rise`]; a
  higher water's rim is kept from the waters below it; beyond 30 tiles the outlands follow the stair's level and fall
  away to the edges. Ground no day-1 water reaches is broad benches divided by bold scarps, quantised in threes (the
  game has one dry tone: thin bands on it read as contour lines). Ridges and spurs are crags (a crest, one ledge),
  never a slope of a level a tile, which the game shows as stair treads. Empty basins are old lake beds: a lobed
  outline, a beach at the sill + 1, a flat floor, one hollow. Then `tidy` (no one-tile pits, spikes or tongues).
- With "ground with grade" (#929): its graded slopes (`land/levels.ts` `snapLevels`'s `Grade`) replace `rise` on the
  outlands when it merges. Stage 2 does not wait for it.
- Test (`land`): MAPCRAFT section 5's ground measures [`measureLand`]: dead flat under 50 %, one-level steps 60 to
  80 %, the three commonest levels under 35 % of the map; `terrain.dam_wall`, `terrain.edge_wall` and the straight
  -channel rule do not fire (the guard's raises must lie inside a bowl's own rise, never stand as a ring: the script
  met `terrain.dam_wall` on a ring of rock round its springs' pool).

**As built (step 3).** Stage 2 is `raster/relief.ts` `reliefBetween`; `map.ts` `premiseMap` runs stages 0 to 2, places
the start where the plan's frame puts it, makes the plan's sources and rows features, and builds once with the
generator's own `buildMap` and checks; `tools/premise-map.ts` writes its `.timber`, its project and a picture. Where it
differs from the above, and why:

- **A bowl is a water at one level**: each body (its sill), each channel's tiles grouped by level (a wet channel's
  surface, a dry bed's bed + 1, so its valley floor stands two over the bed, §4.2's dam to pond), each with one
  `distanceFrom` transform; the land wanders by reading a bowl's distance up to 7 tiles off (a warp), past its first 6
  tiles. The outlands' stair is the water's levels averaged in 8-tile cells and weighted by nearness (the script's
  anchors), read on a 4-tile grid.
- **Rims, kept from the waters below**: a body's 3.2 tiles (the pool's 4), a brook's 4, a leat's 6, the neck's 4. At 2.6
  a leat or brook crossing a lower lake's meadow stood on a dyke 2.6 tiles wide each side; 4 to 6 is a terrace.
- **The landmark's hanging valley stands in an upper world**: its rim is 8 tiles behind its lip (nothing of it in front
  of the lip's line), so it runs on high ground and leaves it by the cliff the fall comes over, the start's meadow in
  front (the script's `greatWall`, generalised).
- **The bypass follows the land** (its plan's `bed: { under }`, which stage 1 laid falling evenly): past its head and
  first row, its bed is 2 under the lowest land within 3 tiles, never rising, never under its end; a wadi a level
  over it 1.7 tiles wide (ragged), the guard beside it read again from the new bed. At 3 under, its walls were
  two-level steps the whole way round the map (one-level steps 51 to 57 %). It is no bowl: a bowl at its fixed bed
  stood it on a ring of dyke where it passed a lower basin's meadow.
- **The dry benches' threes step from a phase that drifts** (0, 1 or 2 over 40 tiles), so they do not all stand on the
  meadows' levels.
- **The bench-width floor** (`land/benches.ts` `widenBenches`, from the grade's work for #956) ends the relief on land
  more than 3 tiles from water: no level band under 5 tiles across its fall line. `analysis/ground.ts`
  `measureGround` is MAPCRAFT §5's measure.
- **The permanent badwater source stands in a niche** (`badwaterNiches`): a 3 × 3 floor two over the gorge's bed,
  cut into its wall beside the plan's point, so its water falls into the gorge and leaves by the exit (D498) while no
  other source's water reaches it. In the gorge itself it stood in the whole stair's flow (D171,
  `water.source_in_flow`).
- **Sources**: a body's sources are one spring of their summed strength at their middle (a natural `lake` feature the
  field holds), placed as a row by the build's own rule (D314); rows of Blockages are `plug` map objects.
- **Measured** (relief alone, water as stage 1 lays it; seeds 1 to 3 at 128² and Four Lakes at 192²): dead flat 43 to
  50 %, one-level steps 52 to 57 %, the three commonest levels 37 to 43 % (Four Lakes 32 %). MAPCRAFT §5's ranges are
  not met at 128²: three lakes' meadows (sill + 1, 12 to 18 wide by the plan) hold most of the land, and the crags
  and the bypass's walls are steps of two and more. Section 9 has it.

**Stage 3. The start placed for the first frame** (`frame.ts` `checkFrame`).
- In: the heights, the plan's frame group. Out: the start, final; small trims to the lip and the bench.
- Does: makes the start's bench level and joined; reads every lip and foot tile of the landmark through
  `openingCamera(start)` and `frameAt` at the first frame's own zoom (`start.z × 0.1`); moves the start a tile or
  trims a lip tile where one is outside; keeps tall trees and rock off the sight line; holds the water inside the
  frame shallow (at most 1.2 deep, a ribbon of 2.2 for the pump: deep water is near black in the game).
- Test (`land`): the frame invariants of section 4.4, and the start rules the land alone can judge (a dry, level
  5 × 5, a level door: `levelDoorTurns`).

**Stage 4. The ladder** (`ladder.ts`).
- In: the heights, masks, the plan's works. Out: each work's site (its tiles), its blockage rows, and its measured
  gain; the day-1 green.
- Does: each work kind is a template with the geometric conditions that make it pay, which stages 1 and 2 **built**
  rather than hoped for (section 4.2 lists them). The gain is estimated without a settle: the water the work adds is
  known by number (a bed's tiles wet, a basin filled to its sill), and the green is that water's reach by the game's
  soil rule: 16 tiles over ground within a level of the water's surface, about 9 at one level over, about 4 at two,
  none at three; a body under 3 × 3 reaches less. `estimateGain` is a breadth-first reach in the work's own window
  [`waterReach`], checked in tests against `sim/moisture.ts` `moisture` on the same water.
- Test (`land`): each work's estimate inside its `gives` range; the ladder's shape (section 4.4). A work outside its
  range is repaired (its bench widened or narrowed) or dropped; fewer works than the premise's least is a re-roll.

**Stage 5. The simulation gate: one settle** (`generate.ts`, through `buildMap`).
- In: the field, the features (sources, blockages, start). Out: `BuildResult`: settled water, moisture.
- Does: the canonical settle, once. The pre-fill (`sim/prefill.ts` `prefill`) already fills each basin to its spill
  level, which by stage 1 is its designed level, so the settle starts near its end.
- Test (`settled`): `settle.settled`; each body's level and each fall's drop against the water table
  (`analysis/vertical.ts` `fallsOf`); stray water (wet tiles outside every planned body and channel) under 0.3 % of
  the map; day-1 water and moist shares in range. Then the **premise, both ways, by the graph**: `flowThrough` on
  the settled land says bad flow reaches every lake (left alone), and on the land with the bypass's rows cleared and
  its gates raised says no bad flow reaches any lake and the springs' pool stands under its rim (opened). Then the
  start's drought days by `sim/drought.ts` `droughtStorage`, as the themes' path reads it.
- Repairs before a re-roll: a level off → that lip widened or narrowed, one more settle; stray water → the guard at
  that place, or the body drained where nothing feeds it (`sim/fed.ts` `unfedBodies`); a pool over its rim → the
  bypass's mouth widened. At most two settles a plan (the themes allow five a genome, `SETTLE_BUDGET`).

**Stage 6. Life and resources by budget** (`life.ts`, on `resources/baseline.ts`).
- In: the settled moisture, the regions, `resourceBudget`. Out: `forest`, `berryPatch`, `ruinField` features.
- Does: plants by **stand rules** per region [`plant` and `woodReport`]: birch in broken ribbons along living water;
  oak one tree in five tiles inside small groves on meadows; pine massed, with glades, on ground a level or more over
  its water; dead woods in clumps on old shorelines and dry beds, none scattered; succulents on the dry-for-good
  region only. Nothing planted where only a work's water would make it live. The start's own stand and berries on
  its bench, the view from the start to the landmark kept open.
- Budget: living trees 450 to 700 per 10,000 tiles (MAPCRAFT: 350 to 700; Four Lakes round 14: 597); at most 16 % of
  the level moist ground under a tree (Four Lakes: 12 %; official maps: 16 %); berries about 185 to 230 per 10,000.
- Test (`settled`): the budgets; `start.wood`, `start.food`, `plants.survive`.

**Stage 7. Set pieces and secrets** (`pieces.ts`).
- In: the plan's `setPieces`, the built map. Out: features; for a cave, `GeneratedField.caves`.
- Does: each is tied to a body, a link or a work: a ruined weir on the fall below the start (piers three tiles apart:
  the bridge's place; its breach the first reservoir) by `planRuinStories`' dam; a row of four ruin piers on the banks
  at each work (no pier in a bed); the cave behind the landmark fall with a large relic at its mouth, grown as the 3D
  forms are (`growOn`: kept only where every check still holds and it reads as a cave); aquifers and the drill, cores
  and a geothermal field in the regions that own them; relics on an island and at the exit; mine sites by
  `planExtras`. A cave makes the map's water the stacked engine's, so it is cut **before** stage 5's settle when the
  plan has one; a cave that then fails its read is taken out and the map settled again (one of the plan's two
  settles). Everything else here stands outside the water and is placed after the settle without another.
- Test: every piece stands on ground the game allows (`entities.placement`); at least three secrets, each tied to
  the premise or a region.

**Stage 8. Accept, repair or re-roll** (`generate.ts`).
- The checks (`validateMap`, profile `"generate"`), the reach (`validate/playability.ts` `colonyReach`: every region
  walkable by natural ways or by one crossing the land plainly asks for: a pier row with gaps of three, a channel at
  most five wide), the name and the description from the plan's `line` and works.
- A failure with a repair is repaired once. Any other failure draws the next plan (`attempt + 1`). Stages 0 to 4
  are arithmetic, so a re-roll before the settle costs under half a second. After `PLAN_TRIES` (8) plans the spec
  goes to the themes' path: "No valid map" never shows (D471).
- **The land is shown** (`opts.onLand`) when stage 4 passes: every check the land alone can judge has run, and by
  design the settle moves no ground (D348). The two repairs that touch ground after the settle (a lip's width, a
  guard tile) are of the kind D348 already allows for a worn way out.

**After the map opens: the proofs** (background, section 3). The premise true both ways by `HazardRun`; each work's
gain by a what-if settle; the first cycles. Their results are rows in the checks panel and the ladder's readout; they
are also what section 6 runs offline before a premise ships.

## 3. Speed

### 3.1 Where the script's minutes go

The script's own lap timers, from the build logs of rounds 10 to 14 at 192² (`C:\dgm-showcase\four-lakes\r10-build.log`
… `r14-build.log`). A full build is **4.3 to 6.5 minutes** by them (255, 278, 281, 371 and 388 s). The log's "about
nine minutes" is not borne out by the timers: they do not time the bundling or the separate capture script, and
nothing recorded says what that figure included.

| Step of the script | Seconds | Why |
|---|---|---|
| The design (`designLand`) | 1.0–2.2 | Every tile against every body's every arm and every channel, with four-octave noise each time |
| Blank ground and the land as operations | 1.2–2.4 | One Flatten operation per level |
| Blockages | 1.3–4.0 | An operation per row |
| Sources and the settle | 2.2–4.6 | The canonical settle: 1,536 to 2,176 ticks |
| Objects | 116–185 | Each object is its own operation; the document is rebuilt and its water settled after each (my reading of the timings, not profiled) |
| The route | 8–17 | Walks, and a ramp built per gap |
| Plants | 45–119 | Brush strokes as operations |
| Pictures, checks, save | 3–13 | |
| Drought 9 days, badtide 8 days | 8–10 and 14–21 | `HazardRun`: about a second a game day |
| How it plays (`--play`) | 9–16 | Reservoir what-ifs by flood fill, drought runs |
| The bypass opened, badtide | 15–23 | |
| The first badtide, both ways (round 14 only) | 47 | Four hazard runs |
| The ladder (`--irrigate`; rounds 11 and 14) | 13–48 | Up to seven what-ifs, each a full settle |
| **A full build** | **255–388** | |

The objects, the route and the plants are 188 to 320 s of that: half of round 14's build (which also ran every
report) and two thirds to four fifths of the others. That is the document engine replaying one operation at a time.
The settle itself is 2 to 5 seconds. The rest is weather runs and what-if settles.

### 3.2 What the generator does instead

- **One build.** The generator makes a field and features and calls `buildMap` once: one settle, one soil pass, one
  placement of everything. No operation is replayed. This alone removes three to five minutes (section 3.1's
  objects, route and plants).
- **Levels by number, not by settle.** Stages 0 to 4 never settle. Levels, flows and bad flow come from the plan's
  arithmetic and from `flowThrough`, which stands on `spillLevels` (a priority flood, in Rust).
- **The settle starts at its answer.** Bodies are designed to their spill level, which is what `prefill` fills
  them to; channels start at their designed depth.
- **Cheap what-ifs.** At generation a work's gain is the soil's reach from water known by number, in the work's own
  window. In the background the same work is settled from the map's own water with `sim/preview.ts` `previewSettle`
  (a warm start from a `WarmState`), not from empty.
- **Distance fields once.** Stage 2 computes each body's and channel's distance field by one two-pass transform (or
  `distanceFrom`, already in Rust) and each noise field once on a coarse grid, instead of per tile, per arm.
- **The weather is a proof, not a gate.** A day of `HazardRun` at 192² costs about a second (1.1 s on the stacked
  engine, PR #927's measurement), so a drought of 9 days and a badtide of 8, closed and opened, is 25 to 40 seconds:
  never in the foreground. The graph test of stage 5 stands in for it, and section 6's rule keeps the two in
  agreement.
- **Rust later, where measured.** The new stages are TypeScript first. Stage 2's envelope is the likely first port.

### 3.3 The budget

Targets, to a map the player can edit and export (the themes' targets, D278: 2 s typical at 128², 8 s settled at
256²). The settle's row rests on D33's budget (0.6 s at 128², 3 s at 256²) and the script's 2.3 to 4.6 s at 192²
with its operation overhead.

| Stage | 128² | 192² | 256² |
|---|---|---|---|
| 0 Plan | 5 ms | 5 ms | 10 ms |
| *0 Plan, measured at step 1* | *4.7 ms a layout, 32 ms a plan (worst 145)* | *6.2 ms, 12 ms (worst 39)* | *11.3 ms, 21 ms (worst 89)* |
| 1 Water by number, with `flowThrough` | 40 ms | 90 ms | 160 ms |
| *1, measured at step 2* | *18 to 39 ms (worst 76)* | *31 to 58 ms (worst 140)* | *52 to 98 ms (worst 245)* |
| 2 Relief | 60 ms | 140 ms | 250 ms |
| 3 Start and frame | 5 ms | 5 ms | 5 ms |
| 4 Ladder (10 to 16 window estimates) | 30 ms | 60 ms | 100 ms |
| **Land shown** | **0.2 s** | **0.4 s** | **0.6 s** |
| 5 The settle and its tests | 0.6 s | 1.8 s | 3.0 s |
| 6–7 Life, resources, set pieces (one more build without a settle) | 0.2 s | 0.4 s | 0.7 s |
| 8 Checks, name, file | 0.5 s | 1.1 s | 1.9 s |
| **Map ready, typical** | **1.5 s** | **3.7 s** | **6.2 s** |
| With one repair settle (the worst accepted) | 2.3 s | 5.9 s | 9.9 s |

A plan that fails before the settle costs the land's row again. Anything over the last row is a bug (D453).

Stage 1 as built (step 2, seeds 1 to 12 under `tsx`, `waterByNumber` and its one `flowThrough`, weirs and wander
included, on a quiet machine): 22, 37 and 75 ms at the median, 28, 85 and 147 ms at the worst, within its row. The
bodies' and channels' beds take most of it (an `fbm` and a distance a tile), `flowThrough` about an eighth.

Stage 0 as built (step 1, seeds 1 to 200 under `tsx`): one layout that passes takes about the budget, but a plan draws
4 to 12 layouts on average before one passes (most at 128², where the pool's basins, the frame and the small works
fail most often), so a plan takes 2 to 6 times its row and the worst at 128² most of the land's 0.2 s. **Meeting stage
0's row is a condition of step 4**: a layout that fails should fail in its first steps, cheaply, not after its works
are placed. (Allocation-free segment arithmetic and cheap checks first already took the means from 80, 37 and 54 ms.)
At step 2 (the stair on the floor, the `n − 1` offer, the hanging valley kept clear of its source) a plan takes 107,
43 and 58 ms on average (seeds 1 to 200, the machine shared), 195, 200 and 200 of them first time.

### 3.4 Deferred to after the map opens

Run by the background worker that already settles and checks an opened map (`backgroundCheck`), a slice at a time,
cancelled by an edit:

| Proof | Cost at 192² | Shows as |
|---|---|---|
| The premise closed: a badtide of the difficulty's longest, left alone | 15–20 s | "The badtide reaches your water on day 1" |
| The premise opened: the same with the bypass's rows cleared and its gates shut | 12–20 s | "With the old channel open and three gates shut, no lake turns" |
| The drought: its longest | about 9 s | "Your water lasts 9 days"; the falls' stopping days |
| Each work's gain by a warm what-if settle | 1–4 s a work | The ladder's readout: an estimate becomes a measure |
| The first ten cycles (`sim/cycles.ts`, PR #927) | 3–4 min | The report, when asked for |

A proof that fails on an opened map is rare by section 6's rule. When it happens the map stays (D329: the first
passing map is never swapped), its row says what failed, and the versions search (`gen/versions.ts` `findVersion`)
offers a sibling that proves.

## 4. The first premise in full: the lake stair

Four Lakes, generalised. **The line:** "Lakes step down a valley, each over a rock sill and a fall. The badtide comes
down the whole stair within a day, unless you open the old dry channel and shut the gates at the springs: then it runs
round every lake."

### 4.1 The plan, its parameters and ranges

| Parameter | Range | Drawn from |
|---|---|---|
| Size | Square maps, 128² to 256² | Eligibility. Under 128 the stair has no room for three lakes with meadows; other shapes are the themes' for now (section 9) |
| Lakes `n` | 3 at 128²; 4 at 192²; 4 or 5 at 256²; one fewer is offered too where only one `f` fits (under the default `top` of 17: 3 or 4 at 192² and 256²) | Size, Lakes, `top` |
| Step `f` between sills | 3, 4 or 5 levels | Verticality; `5 + (n − 1) f + 2 ≤ top` |
| Sills | 5, 5 + f, … (the gorge's bed and the lowest lake's on `BED_FLOOR`, 3 over the map's floor: room to dig, D325) | By number |
| The valley's line | Exit on one edge to the springs across the map; length 1.25 to 1.5 × the side; a diagonal, an S or a hook; 8 turns and mirrors | Seed |
| Lake size | Arms of radius 7 to 15; 2 to 5 arms; a cove, a bay behind a peninsula; an island or two | Seed, Variety |
| Meadow | 12, 15 or 18 wide, ± 3 by noise | Buildable land |
| Stair falls | Height `f`; lip 8 to 16 wide by flow; a horseshoe lip; a notch of one tile on every sill but the lowest | Flow |
| The springs | One pool at the top water's level, 3 to 5 sources; total strength 10 (trickle), 14 (normal), 18 (strong), 22 (lush) | River flow |
| The landmark | A fall of `H` = 6, 7 or 8 levels from a **hanging valley** (20 to 40 tiles long, bed level = the foot lake's sill + H) into the start's lake; a lip of 10 to 14 tiles in unequal runs; fed from the springs' pool or from a lake `H` or more above | Seed; section 4.3 |
| The start's lake | The lowest or the second lowest | Seed |
| The start | On a bench one level over its lake's sill, 5.5 to 7 tiles in front of the lip; bench 580 to 980 level tiles | The frame |
| The bypass | A dry channel from the springs' pool round one side to an edge or to the gorge below the lowest sill; 250 to 330 tiles long at 192²; mouth 10 wide; 3 rows of Blockages (the first at the mouth) | Seed: which side, which exit |
| Gates | 3 or 4 sites, each a channel 1 to 5 wide: the neck to the top lake, the hanging valley, each leat's head | By the graph |
| Side bodies | Tarns: 3 at 128², 7 at 192², 12 at 256²; two of them rim tarns with their own springs (0.8 to 1.5) | Size, Variety |
| Living brooks on day 1 | One each side, each from a spring tarn to a map edge | Rivers |
| The megadam's site | A slot 5 to 6 tiles long through the ridge below the lowest lake, walls 6 or more over its bed | Fixed kind, drawn place |
| The skyline | One ridge behind the top lake, to `top` or to 21 on a tall map | Verticality |
| Dry for good | The side the bypass runs on: limestone benches, succulents | Follows the bypass |

**As built (step 1).** The plan settles a few things the table leaves open; each is an **(assumption)** a later
stage's measure may move:

- The landmark's source is the pool or a lake `H + 1` to `H + 3` over the start's lake's sill (a valley level with
  its source took a third more or less than its share from a lake, 16 % less from the pool, §2.2 "As built (step
  2)"): the hanging valley's bed is the source's sill at its head and `sill + H` at the lip, falling a level at a
  time between (the Four Lakes fixture's valley drops one riffle, 14 to 13). Past its first 7 tiles, its weir and
  the bed in front, it keeps 5.4 tiles clear of its source, and its first 10 keep 11.4 clear of a stair fall's lip. So a landmark of 6 or 7 finds a source on every stair
  but three lakes a step of 3 apart, which is not drawn.
- The stair stands on the floor: the lowest sill is `BED_FLOOR` + 2 (5), the gorge's bed and the lowest lake's on
  `BED_FLOOR` (3; the lowest lake two deep, `LOW_DEEP`), so `5 + (n − 1) f + 2 ≤ top`. Where only one `f` fits `n`
  lakes, `n − 1` is offered too, and `n` is drawn once a layout attempt, so plans keep their variety.
- The neck is 5 tiles wide, as the landmark's valley: the split at the pool is even, 7 and 7.
- The start's lake has a bay under the landmark, on the far side of the lip from the start: the fall's foot opens to
  the lake there while the start's 5 × 5 stays dry. The lip is square to the camera's look, between the start's lake
  and the source.
- Bodies stand 3 tiles or more apart (outline to outline): a stair fall's rock sill is the ground between two lakes.
  A lake's arms are 2 to 5, each 7 to 15 at its widest (a bay or cove narrows to its end).
- The gates are 3 or 4: where the landmark does not leave the pool, the plan adds an empty basin fed by a leat from
  the pool, each leat gated at its head.
- Side bodies are spring tarns and empty basins, about the table's counts (3 to 5 at 128², 5 to 9 at 192², 7 to 13
  at 256² on seeds 1 to 30): three near the start first, so its walk has three small works; a basin nothing can fill
  is left out. A basin spills to a lake two or more below, else to a lower side body, else off the map. A dam to
  pond needs a dry bed 12 tiles long or more. Kettles are not drawn yet.
- The bypass leaves the pool for the ring inside the map's edge and ends at an edge of its own or in the gorge below
  the megadam's slot, as the seed draws (about two in five reach the gorge).
- The permanent badwater source stands in the gorge, 1, 1.5 or 2.75 strong for Badwater low, normal and high.
- The gorge is 5 tiles wide, 6 at River flow lush (5 wide carries about 13 a level deep, §2.2: the stair's 15.5 runs
  1.2 deep in it), so the megadam's slot is 5 or 6. The lip stands 5.5 to 7 tiles in front of the start, under the frame's top edge where that is nearer.
- The bypass's range is 250 to 330 at 192²: the 320 first written was taken from Four Lakes, whose own old channel
  is 324.7 tiles.

**The regions** (five, each differing in what it gives):

| Region | Role | Problem | Prize |
|---|---|---|---|
| The home bay: the start's lake, bench and the landmark | The generous start | The lake sinks through the weir's breach in a drought; the red arrives on day 1 of a badtide | The first reservoir (the breach mended), the Still Pool, first metal on the weir, power at the fall later |
| The low meadows: the lowest lake's basin | Farmland and room | Lowest, so the megadam drowns it | 640 or more level tiles; the megadam's sea |
| The wet side: tarns, basins, dry beds, one living brook | The irrigation ladder | Dry basins and beds on day 1 | Green benches, wood stands, a work at a time |
| The top: the springs, the top lake, the gates, the skyline | The map's controls | Far, and across water | The bypass's gates; aquifers and the drill; the tallest stair fall's power |
| The dry side: the old channel and the benches beyond | The bypass's road; dry for good | No water reaches it | Metal in the old aqueduct, geothermal, succulent fields |

### 4.2 The ladder's works, and the ground each needs

The generator builds the ground so that each work pays what it says; these conditions are the ones the hand-built
map found by what-if (rounds 11 to 14).

| Rung | Kind | What the player does | The ground the generator makes | Gain at 192² |
|---|---|---|---|---|
| First | Still Pool | One levee on a neck one tile wide, before the first badtide | A pool of about 21 tiles on the bench beside the fall's foot, bed one under the bench, a neck two long | The pool stays clean; about a third of the bench stays green |
| First | Breach | Mends one or two tiles of the ruined weir | The stair fall below the start has piers and a breach a level deep | The start's lake stops sinking: about 600 to 850 of water |
| Small | Sill notch (kind `breach`) | Plugs the one-tile notch in an upper lake's sill | Every sill but the lowest has a notch a level deep (section 4.1); the crest beside it is rock two tiles thick, so one tile of dam closes it | No green: the lake keeps 700 to 1,200 of water through a drought |
| Small | Notch | Clears a row of 3 or 4 Blockages | A spring tarn's **second** outlet, the row below the tarn's outline and spanning the bed; a dry bed two deep to a lake | 430 to 570 tiles each |
| Small | Dam to pond | A dam of about 5 tiles, one level | A narrows in a dry bed two deep, with the bench beside it level at bed + 2 for 8 tiles or more | 270 to 470 |
| Small | Levee | About 8 tiles at a basin's spill point | A basin with a beach at its sill + 1 and a rim over the beach | 260 to 340 |
| Medium | Leat | Clears 3 Blockages at a leat's head (and gates it for the badtide) | A leat one tile wide from gated water to a chain: a basin, its brook | 1,000 to 1,500 |
| Medium | Raised sill | 11 to 17 tiles on a stair fall's lip | Rock shoulders two over the crest | 600 to 1,400 of water a lake |
| Large | Bypass | Clears 3 rows (16, 6, 8 tiles), builds 3 or 4 gates | Section 4.1 | The premise's answer; about 1,100 to 1,500 tiles along it |
| Large | Megadam | 5 or 6 long, to the next sill's level | The slot | Water of about 0.44 × the map's tile count (16,241 at 192²) |

Counts scale with the map's area over 192²'s. The seed draws which kinds stand where. The **small irrigation works**
are of three kinds (`notch`, `damToPond`, `levee`): six at the least at 192², at least one of each kind at every size,
three of them within 40 tiles' walk of the start's bench (Four Lakes had five, of these three kinds). With the first
works and the sill notches (`breach`, and the Still Pool's `levee`) the near ladder has four kinds, each a different
thing to build: a gap mended, a neck or spill point shut, a row cleared, a bed dammed. `Work.kind` needs no kind
beyond section 1.1's.

### 4.3 The landmark and the first frame, by arithmetic

From `analysis/opening.ts` `OPENING` (pitch 60°, field of view 35°, distance `32 × 1.3^(0.1 z)` for a start on
level `z`, measured to where the line of sight meets level 0): a point at height `h` is under the frame's top edge
(v ≤ 0.98) when it stands no further ahead of the start's middle, along the camera's look, than

`ahead ≤ 0.4342 × 32 × 1.3^(0.1 z) + 0.577 z − 1.0788 h`

This gives the two limits the hand-built map measured in the game: 5.3 tiles for a lip at 14.3 from a start on 7,
and 9.5 from a balcony on 11. With the start `b` levels over its lake's sill and the lip `H` over it, the limit is
about `13.3 − 1.08 (H + 0.3 − b)` tiles: **7.6 for a fall of 6, 6.5 for 7, 5.5 for 8** (b = 1).

The check `start.dry` blocks a generated map with water inside the start's 5 × 5, so the lip stands at least three
dry tiles and a plunge pool two tiles wide ahead: 5.5 tiles or more. So:

- The generated landmark is **6 or 7 levels** from a bench one over its lake; 8 only where the bench is two over
  (the limit is then 6.5), which waits for a judged variant.
- The camera looks 35° clockwise of the start's turn. The lip runs **across the look** (within 15°), so its whole
  length is at one depth; it is built as runs of one to three tiles facing two ways by turns, never a diagonal of
  one-tile steps (which stood as an accordion of pleats when the water stopped).
- The lip spans 35 to 56 % of the frame's width; the foot is in the frame too.
- The plunge pool opens to its lake over a front at least as wide as the lip. Nothing narrower carries the fall
  past the start (the hand-built map's one-tile throat put a film of water over the bench until it was cut three
  deep).
- The fall lands on a shelf at most 0.6 deep and the bay inside the frame is at most 1.2 deep: in the game water
  three levels deep is near black. The turn of the face does not change the curtain's light; depth does.

### 4.4 What the seed varies, and what never varies

**Varies, structurally:** `n` and `f`; the valley's line; which lake is the start's; where the hanging valley leaves
the top water and which lake it drops into; the bypass's side and exit; the count, kinds and places of the works; the
tarn chains (which tarn feeds which); which lake has the island, the cove, the peninsula. **Varies, in dress:**
outlines, wander, crags, stands, the pieces' places, the names.

**Never varies** (the invariants; tile counts are for 192² and scale by area):

| Id | At | The rule |
|---|---|---|
| `stair.levels` | plan | Sills descend along the valley by `f`; every water level ≤ `top − 2` |
| `stair.settled` | settled | Each lake stands 0.05 to 0.6 over its sill; each stair fall drops `f − 0.4` or more over a wet lip of 8 or more; the landmark drops `H − 0.3` or more, 6 at least, over 10 or more; the settle settles; stray water under 0.3 % |
| `frame.lip` | land | Every lip and foot tile of the landmark inside the first frame (\|u\| ≤ 0.95, v ≤ 0.98); the lip 35 % or more of its width; the 5 × 5 dry; no tree or rock on the sight line |
| `frame.water` | land | 85 % of the water in the frame at most 1.2 deep |
| `premise.closed` | settled (graph), proof (weather) | Left alone, bad flow reaches every lake; by the weather the start's water is bad within a day and every lake half bad within a day and a half |
| `premise.open` | settled (graph), proof (weather) | With the bypass's rows cleared and its gates shut (at most four, each at most 5 wide), no bad flow reaches any lake; by the weather no lake is half bad and the start's water is clean through the difficulty's longest badtide; the springs' pool stands 0.15 or more under its rim |
| `springs.side` | plan | A body with its own spring drains to a map edge without meeting a lake, unless it is a notch's, whose `tradeoff` says its water runs red |
| `drought.start` | settled (storage), proof | The start's water lasts the difficulty's longest drought by the editor's rule; 60 % of the bench within 12 tiles stays moist every day of it; the falls stop from the top |
| `spectrum` | settled | Water 15 to 25 % of tiles; moist ground 30 to 42 %; small irrigation works (`notch`, `damToPond`, `levee`) 6 to 8, each 250 to 1,100 tiles and at most 3 % of the map; all works together 10 to 20 %; dry for good 12 to 25 %, on one side |
| `ladder.kinds` | land | Each of the three small irrigation kinds (`notch`, `damToPond`, `levee`) is on the map at least once; the first and small works together have all four kinds (`breach`, `levee`, `notch`, `damToPond`); three small irrigation works within 40 tiles' walk of the bench; one first work inside the first frame |
| `ground` | land | Flat under 50 %; one-level steps 60 to 80 %; the three commonest levels under 35 % |
| `wood` | settled | Living trees 450 to 700 per 10,000 tiles; at most 16 % of level moist ground under a tree; 250 logs or more grown within 20 tiles' walk of the start |
| `bench` | land | 580 level tiles or more joined to the start (the Workshop's starts: 640 to 980) |
| `reach` | settled | From the start by natural ways: its lake, the low meadows within 40 tiles, three small works, first metal within 25; every other region by one crossing |
| `megadam` | land | The slot 6 tiles long at most, walls 6 over its bed; it holds water of 0.4 × the map's tile count or more |
| `checks` | settled | No blocking check in profile `"generate"` |

### 4.5 The failure cases the hand-built map found, and how the generator avoids each

| What failed (round) | The rule the generator follows |
|---|---|
| A flat channel lost its head over a long run (r0) | A channel's bed drops a level per 100 tiles; the springs sit at the head of a short hanging valley |
| A 5-wide gorge backed the lowest lake up (r0) | Every way out is sized from its flow in stage 1; the lowest lake has its own wide sill above the gorge |
| A bank behind every shore cut the moisture off (r1, r2) | Ground beside water is one level over it, never two, for the meadow's whole width; the test is the soil's reach, not a share |
| The uplands were contour bands (r3) | The land is the envelope of every water's bowl; dry ground is benches in threes |
| A spring tarn's brook carried red into a lake with the bypass open (r5) | `springs.side`; tarns drink from gated top water through one-tile leats, so one set of gates shuts everything |
| The bypass's mouth, 6 wide, backed the pool over its rim (r5) | The mouth is 10 wide; `premise.open` tests the pool's level |
| "A day per lake" was false: a real fall replaces 5 % of its lake in an hour (r5) | The premise's line says "within a day"; no premise promises a delay a fall cannot give (section 5's sea can) |
| A seep on open ground ran off, and weak seeps kept the settle from settling (r5, r12) | No seeps. A dry bed differs from the plateau by form, dead wood and ruins; living threads are spring tarns' runs to an edge |
| The landmark's lip was cut by the frame; `opening.ts` had the camera wrong (r6 to r9) | The corrected camera is in dev; section 4.3's limit is a `plan` invariant |
| The curtain and bay were black (r9, r10) | `frame.water` |
| A one-tile way out put water on the bench (r10) | The plunge pool opens to its lake as wide as the lip |
| A whole weir meant the lake never fell: nothing to earn (r10) | The weir is breached; `drought.start` holds by the cove pool, not by the lake |
| The bench dried on day 3 of a drought (r11) | A cove pool of 3 × 3 or more, a level under the shelf behind a sill at the shelf's level |
| A row of Blockages one tile wide inside a tarn's outline held nothing (r12) | Rows are `spanRow`'s: below the outline, spanning the bed, proved by the graph with the row in and out |
| A tarn with water coming in and no way out went over its rim; a run that started a tile outside the outline left none (r12) | Every fed body has one outlet open, and an outlet's path starts two tiles inside the outline |
| A dam in a dry bed gained 0 to 64 tiles at most sites (r12, r13) | Dam-to-pond sites are built (section 4.2), not searched for |
| A backwater did not fill through a long neck a tile wide (r11) | A kettle's neck is at most 3.5 tiles long |
| Two works watered a whole side each: no string of puzzles (r11) | `spectrum`: no small work over 3 % of the map |
| Empty basins read as squares and rings from far (r12, r13) | Lobed outlines, a beach and a two-level bank at the old waterline, dead woods in clumps on the shore |
| The first badtide took the whole lawn on day 1 (r13) | The Still Pool and its one levee, inside the first frame. Bad water spoils soil 7 tiles out, 5 fewer for each level climbed, so the band along the bay is lost by design and the page says so |
| Closed hollows near the top water held water nothing feeds (gap 8) | Hollows under the top water's level become kettles with a neck below a gate's place, or are filled by `tidy` |
| Trees as a carpet: 2,108 per 10,000 (r10) | `wood` |
| The far bank and the top were across water with no natural crossing (r8, r10) | `reach` counts one crossing a region; the weir's piers and the gates (a dam is a path) are those crossings |
| A what-if settle stopped before a slowly fed basin was full, so a rung's count moved between builds (r14) | The foreground gain is by number; the background what-if runs until the basin's level stops rising, not until the settle's own test |

## 5. Two more premises, sketched

They prove the model is general: each is a different graph, a different landmark and a different answer, on the same
stages.

### 5.1 The wall with one gate

Built by hand as The Gate (`tools/showcase/the-gate.ts`, eight rounds judged in the game, 2026-11-11;
[progress/showcase-craft.md](progress/showcase-craft.md)); planning passed its shape at round 7. This is the premise
in the lake stair's form, with round 8's numbers, for the milestone session to build as the second `PremiseDef` after
the lake stair's page step.

**The line:** "A mountain wall runs across the map, a green valley on your side and a dry basin beyond; the river
rises in a cleft of the wall and pours over the Veil into the lake at your door. Carry the water through the one gate
or round by the pass, and before the first badtide shut the pool by your door."

**The plan.**

| Part | What the plan draws | As built (192²) |
|---|---|---|
| The wall | A ridge along the grid across the map's middle, east to west, in straight runs of 14 to 22 tiles joined by jogs of 4 to 6 (bastions), its south face toward the opening camera. The crest 4 to 6 thick, 7 at the Veil's bastion; both faces sheer: the valley's from the crest to the meadow, the basin's from the crest to the floor. No ledge on either face. | Crest 17 (16 to 19), the valley's meadow 8, the basin's floor 3 to 8; the face at Y 104 to 112 by run |
| The cleft and the Veil | A pool cut into the bastion behind a straight lip at its face, the springs in it (three, 9 to 10 in all); the lip 9 to 12 wide facing the camera, a fall of 6 to 7 into the lake's trench at the start's door | Pool bed 13, lip 14, nine tiles at X 85–93, Y 104; the Veil 6.5 levels |
| Wall Lake | The valley's lake along the wall's foot south of a bench seven rows deep, sill a level under the bench; a drain bay from the Veil's trench; the lake's bed a level under its sill everywhere (a level and a half of water: the game draws two deep near black) | Sill 7, the bench 8, the lake 7.47; the drain bay 5 wide at bed 6 |
| The start | In the Veil's lap on the bench, the lip 4 to 5 tiles ahead on the camera's line, so the lip is whole in the first frame and the crest stands above it | (89, 100), Cw0; the lip (−0.39, 0.49) to (0.06, 0.91) |
| The neck | A side pool beside the start joined to the trench by an inlet no wider than 3, a rim a level over the bench all round it: a few levees shut it before the first badtide and it holds clean water through it | Bed 6, 21 tiles, an inlet one wide and two long; 12 % bad at most with a levee of 3 |
| The Gate | A slot 5 to 7 wide straight through the bench and the wall from the lake's shore, both cut faces the crest's own, its floor two under the lake's sill; plugged at the shore by a bar of rock a level over the sill (the bench's own crossing until it is blasted) and two rows of Blockages behind | Six wide at X 128–133; the bar 21 tiles at 8, the blockages 7 and 7 |
| The basin | A bowl lower than the valley's lake: a rim of 12 or more along its far edges with its cliff facing the camera, the floor in river terraces along the Gate Bed (the bed two under a low terrace that follows its bends, one more terrace above, broad unequal flats out to the rim; steps follow the bed, never the wall); the Gate Bed from the Gate's foot winding to one notch in the rim; three seeps in hollows, each with a gully to the bed so its pond stands four under the flat | Rim 14 from Y 184 and at X < 7 and X > 185; the floor 3 to 8; the notch at X 148–152; the basin 7.8 % moist or wet on day 1 |
| The leat and the Pass | A channel one wide cut into the crest from the cleft's lobe on the Veil's side away from the Gate to the Pass, a dip of the crest to 12 on that side; its bed a level under the pool's falling to a level under the Pass; plugged at its head by a bar two high and a row of Blockages. Its cascade, the Pass Bed, crosses the basin on that side to the Gate Bed at the notch. It never crosses the Gate's slot | Head at X 84, Y 106; the Pass at X 20–28; the leat bed 13 to 11 |
| The valley | Three brooks from springs in the far corners to the lake, creeks at the lake's level into the meadows, meadows 18 wide, plates in threes beyond; the Low River out through a ridge (the megadam's slot) | Springs of 3, 2.8 and 2.5; the gorge 5 wide through the west ridge |

**The regions** (five): the start's bench and the Veil (the generous start); the valley's meadows and brooks (wood,
farmland, the reservoir); the wall and its crest (the leat, the Pass, the crossing); the Gate and the Gate Bed (the
canvas: the basin's middle); the basin's far side (the Pass Bed's reach, the rim, dry for good beyond the terraces).

**The ladder** (round 8, cumulative, by the Irrigation view's reach on a settle after each work; day 1 is 35.1 % of
the map green or wet, the basin 7.8 %):

| Rung | The work | Gain |
|---|---|---|
| First cycles | the neck: a levee of 3 on the side pool's inlet before the first badtide | the pool clean through it (12 to 16 % bad at most); the meadow beside the red trench goes bad, and that is the game |
| Medium | the Gate opened: its bar blasted a level (21 tiles) and 14 blockages cleared; the river splits | 1,318 tiles (3.6 %), 305 of them water: the Gate Bed to the notch and its terraces |
| Medium | the bar blasted again (to a level under the sill) and a levee on the Low River's head (20 tiles): the whole river through the Gate | 1,534 more, 63 fewer: the lake sinks half a level, the Low River runs dry |
| Medium | the leat's bar blasted once (2 tiles) and its 2 blockages cleared | 1,839 (5.0 %): a trickle west along the crest, over the Pass and down the Pass Bed |
| Large | the leat's bar blasted twice: the springs' share | 1,663 more (4.5 %), 92 of them water; the Veil dwindles |
| Badtide | the Gate open and the Low River levee'd: the valley's red water sent through the Gate | red water on 710 basin tiles on day 1 (31 left alone); the lake runs red whatever is built, since the Veil and the brooks feed it and every source is red |
| Large | the megadam in the west ridge's slot (7 tiles) with the Gate's bar dammed | holds the valley to 9 only where the valley's floor is enclosed at 9; in round 8 it is not |

**The invariants** (with the stage that judges each, as section 1.4):
- `wall.grid` (plan): the wall's face line is runs along the grid of 14 or more joined by jogs of 4 to 6; no diagonal.
- `wall.faces` (land): on the valley face the tile under the crest's edge is the meadow (one step of 8 or more); on
  the basin face the tile beyond the crest's edge is the floor (one step of 9 or more); no ledge on either face.
- `wall.camera` (land): the wall's face is toward the opening camera (its face's normal within 45° of the camera's
  look), and from `openingCamera(start, VISTA_ZOOM)` the crest crosses the frame from edge to edge.
- `gate.slot` (land): one slot through the crest band, 5 to 7 wide, its floor at or under the valley's lake sill the
  whole way, both its walls the crest's level; its bar at the shore a level over the sill and spanning the slot
  (`spanRow`).
- `basin.bowl` (land): every basin tile stands under the valley's lake sill plus 1; a rim of 12 or more along the
  basin's far edges but for one notch, which the Gate Bed leaves by.
- `basin.terraces` (land): a floor tile within 4 of the Gate Bed is the bed + 2, within 10 the bed + 3; MAPCRAFT §5's
  one-level-step share holds on the floor.
- `basin.dry` (settled): the basin under 12 % moist or wet on day 1, its water the seeps' hollows alone.
- `start.neck` (settled): a pool of 12 tiles or more beside the start, its only join to the river an inlet of 3 tiles or
  fewer; with the inlet raised a level, a badtide of the difficulty's longest leaves it under 20 % bad.
- `leat.own` (settled): the leat's bed never meets the Gate's slot; opened, it waters 1,000 tiles or more by the
  Irrigation reach.
- `frame.lip` (land): the lake stair's, with the lip's foot allowed under v −0.1.

**New beyond the lake stair:** a ridge along the grid with runs and jogs as a body's rim (`raster/wall.ts`); a slot
through it as a channel whose walls are the crest; the rim and the notch (`raster/rim.ts`); terraces along a bed
(`raster/terraces.ts`); the side pool with an inlet (a lake arm one wide, as the Still Pool); the leat as a channel
cut into a crest. The badtide invariant is the neck's, not the lake's: this premise's lake runs red by design.

**What the rounds taught, for the stages** (MAPCRAFT §5 carries them too): the opening camera shows one face of a
ridge, so a diagonal barrier reads as a staircase with a plateau's edge and a ledge doubles it; a floor that runs off
the map reads as plates until a rim gives it a far side; a closed hollow fills to its flat whatever its depth; a sill
drowned by the gorge below it passes a third of what a free one does (the Low River's gorge is a funnel from the sill);
water deeper than two reads near black in the game, so the water in the first frame stays under two but for the row
that carries the fall to the drain.

### 5.2 The island sea

**The line:** "The big spring is on the far island and its fall feeds the sea; the red spreads from it across the
sea island by island: wall off your lagoon before it reaches you, or turn the crater's water off the far side."

- **Water story.** A sea at one level by number, held by one wide sill at the exit. A crater lake on the high island
  with the map's strong springs; its fall of 6 or more into the sea. A weak spring tarn on the home island. The sea
  is many times a lake's volume, so here the delay is real: a badtide's red reaches the home lagoon after days, not
  hours (days ≈ half the water between, over the flow; to be measured). A drought lowers the sea a level through the
  sill's notch and uncovers a causeway between two islands.
- **Skeleton.** Regions: the home island (start, small, generous), the lagoon and its two straits, the stepping
  islands (wood, metal), the high island (the springs, the fall, power), the outer shore (dry for good). Landmark:
  the high island's fall across the strait. Edges: the sea runs to the map's edge on two or three sides and is held
  there as the Islands theme holds its sea (`land/islands.ts` `holdSeaLip`): the two edge rows stand **one** level
  over a shelf under the water. That is under the two levels `terrain.edge_wall` blocks, so it is no edge wall
  (D151 forbids a wall or rim raised along an edge to hold water). The sea leaves the map only over its exit's sill.
  The layout is one of a range with real relief and fresh water on the islands (D410), its shore broken into
  headlands and islands, and not a centred sea inside a ring of land (D423: at most about one map in four).
- **Start and first frame.** On the home island's shore bench looking across the strait at the fall; the frame's
  water is the strait, kept shallow.
- **Ladder.** Small: the home tarn's notches; a dam on each of the lagoon's straits (3 to 6 tiles; a dam is also the
  way across). Medium: the causeway raised a level; a leat from the tarn. Large: a notch in the crater's far rim
  (the red leaves by the outer edge: the second answer); the lagoon raised a level behind its two dams (its shores
  are the islands' own ground, two over the sea). The sea itself is never a reservoir to raise: its lip at the map's
  edge stands one level over it, the most the edge rule allows.
- **Invariants.** The sea at its level, and `terrain.edge_wall` passing; every island the route needs within one
  crossing of the last; the lagoon shut by two dams of 6 or fewer; the red's day of arrival at the lagoon 2 or more
  left alone, never with either answer; the causeway dry by day 3 of a drought.
- **New beyond the lake stair:** islands as bowls turned over, inside one body (the land's envelope taken from above;
  `land/islands.ts` `standIslandsClear` for the straits); a strait as a work site; the drought causeway (a bed half a
  level under the sea); a mixing estimate for a large body, since `premise.closed` here is a delay, which the graph
  cannot give and the foreground must estimate from volume and flow. It is the first premise whose gate leans on the
  proofs, and should be built third for that reason.

## 6. Judging

A premise ships only after its maps pass, in this order. Each tier is run when the premise or a stage it uses
changes what players get, not on every release.

1. **By number, on many seeds** (`tools/premise-batch.ts`, new, on `tools/batch.ts`): seeds 1 to 60 at each of
   128², 192² and 256². Every invariant at `plan`, `land` and `settled`; the time to the map. **Passes:** every map
   accepted; 90 % or more on their first plan; no map over section 3.3's last row; MAPCRAFT section 5's measures
   inside range on every map.
2. **By the weather, on a sample:** seeds 1 to 12 a size, every `proof` invariant (`HazardRun` closed and opened,
   the drought, each work's what-if settle; the first ten cycles when PR #927 is in). **Passes:** every proof holds,
   and **the graph's verdict of stage 5 agrees with the weather's on every seed**; each work's settled gain within
   25 % of its estimate. A disagreement is a failing case that tightens the graph test or the estimate before
   anything ships: this is what lets the weather stay out of the foreground.
3. **Variety** (D108): among the 12 seeds of a size, six or more different structures (by `n`, the start's lake,
   the landmark's source, the bypass's side and exit, the kinds of work within the start's walk).
4. **In the game, by eye:** four seeds a size through the capture kit
   (`npm --prefix investigation/probe run batch -- <map> --captures`, by the Probe runner's rules, D117), about seven
   real minutes a 128² map. A fresh reviewer agent judges the captures alone, against MAPCRAFT's checks:
   `day1-first` (the landmark whole, the start in front, it stops the eye in five seconds); `day1-widest` (a stranger
   can say the premise; dry beds read as beds and basins as old lakes; no rings, squares, ruler lines, stair treads
   or pillars); `drought-first` (the start holds, the lesson shows); `badtide-first` and `badtide-widest` (the red on
   the stair; the Still Pool in the frame); and that the twelve far views are told apart at a glance. **Passes:** no
   capture fails a question. What the game shows and our view did not is a failing case for the stage that made it.
5. **Pinned in tests:**
   - `tests/contract/premisePlan.test.ts` (quick suite): the frame's arithmetic, eligibility, the `plan` invariants
     on seeds 1 to 6 at three sizes, variety, broken plans, the fixture; `premisePlan.heavy.test.ts`: seeds 1 to 200
     at three sizes (a plan takes 12 to 32 ms on average, §3.3, so the 600 run nightly, not on every push). The quick
     suite breaks one plan by hand for each `plan` invariant: drawn plans always pass, so only those catch an
     invariant that has stopped testing anything.
   - `tests/contract/premiseLand.test.ts`: the `land` invariants on seeds 1 to 24 a size.
   - `tests/contract/premiseMap.test.ts` (quick suite): one 128² map's `.timber` sha256, as
     `look-mine-ruins.test.ts` pins `LIVE_SHA`, with its `settled` invariants and its share link round trip.
   - Nightly: tier 1 and tier 2 at 12 seeds a size; `tools/map-hashes.ts` grows a `--premise` flag.
   - **The hand-built map as a fixture:** Four Lakes' design written as a `PremisePlan`
     (`tests/fixtures/four-lakes.plan.json`) must pass the lake stair's invariants through stages 1 to 5. The map
     that set the bar keeps the generator honest. As a plan it departs where the hand-built map broke a rule the
     generated ones keep: its landmark is 7 (the hanging valley's bed 13 at the lip, one riffle below the pool), its
     lip a straight line square to the look, the start moved back so the lip stands 6 tiles in front and the 5 × 5
     is dry, the lakes' arms stop 3 short of each fall, Low Lake's sixth arm is its main arm's end, the channels end
     at their shores (the old channel keeps its hand-built 324.7 tiles, 323.7 from the pool's shore), the kettles are
     left out, and `top` is 21, the map's own highest ground (Fell Tarn at 15, the Crown ridge at 21). Step 1 checks it at `plan` only.
   - A change that alters a premise map is a generator change: claimed on #236, `GENERATOR_VERSION` bumped, re-pinned
     once (D308, D148).

## 7. The build order

Each step is one PR that leaves dev green and is useful by itself.

| # | Step | Useful by itself as | Depends on |
|---|---|---|---|
| 1 | **Built.** **The model and the lake stair's plan.** `src/core/premise/types.ts`, `draw.ts`, `premises/lakeStair.ts` (stage 0 with the frame's arithmetic), the `plan` invariants, `tools/premise-plan.ts` (prints a seed's plan and draws its diagram), `premisePlan.test.ts`, the Four Lakes fixture. No generator change, no version bump. **A day.** | The water story as a diagram for any seed (MAPCRAFT step 2); the frame limit as a tested function | Nothing |
| 2 | **Built.** **Water by number.** `levels.ts`, `raster/bodies.ts`, `falls.ts`, `channels.ts`, `weirs.ts`, `guard.ts`; the `flowThrough` test; a contract test that settles three plans and the fixture (levels, the split per link, curtains with the notches open) | Lakes, sills, falls and channels at stated levels from a plan: the editor's sketch can call it | Lakes by number (merged: `sillWidthFor`, `MAX_SILL_WIDTH`). The fall judge `fallCurtain.ts` from "a fall in one stroke" (#934, in review) when it merges; not blocked by it |
| 3 | **Built.** **Relief between**, and `tools/premise-map.ts`, which writes a `.timber` for a seed outside the product | A whole land with water to open in the editor and run through the capture kit; tier 4 judging can begin | 2. Ground with grade (#929, next in the milestone session's queue) for the outlands, when it merges; not blocked |
| 4 | **The generator's mode.** `generatePremise` behind `spec.premise` (link key `p=lakeStair`; no control on the page), stages 3, 5 and 8: the start by the frame, one build, the checks, re-roll and the fall-back to themes; `premiseMap.test.ts`; stage 0 within its row of §3.3 | A playable generated lake stair from a link, in seconds, without plants | 3 |
| 5 | **The ladder.** Dry bodies and beds, rows of Blockages, the work templates, `estimateGain`, `info.premise` | The spectrum: a map that is not fully watered, with each work's gain known | 4 |
| 6 | **Life and resources by budget**, the dry land's dress | The map looks as it plays: stands, open meadow, dead woods on old shores | 5 |
| 7 | **Set pieces and secrets**: the ruined weir and its breach, piers at the works, the Still Pool, aquifers and drill, relics, then the cave | The first frame's story; the first two works | 6; new `MapObjectKind`s |
| 8 | **The proofs and the judging tools**: background proof rows, `tools/premise-batch.ts`, tiers 1 to 4 run and recorded | The premise proved true on every map a player opens | 7. The first ten cycles (#927, in work) for the cycles' proof; not blocked |
| 9 | **On the page**: the premise's control beside Generate, the map card naming the premise and its landmark, the settings' mapping (section 1.3) complete | Players get it | 8 passed; the page session |
| 10 | **The ladder's readout in the editor** (section 8) | The editor's missing step 5 | 5; the page session |
| 11 | **The wall and the gate** | A second idea; Generate can surprise | 9 |
| 12 | **The sketch start** (section 8) | The editor's missing steps 1 and 2 | 2, 3 |
| 13 | **The island sea** | A third idea; the first with a real delay | 11, 8 |

**If it had to ship in half the steps** (1 to 6, then 9 in a small form): cut the cave and every set piece but the
ruined weir's piers and breach (folded into 5); cut the background proof rows and keep tier 2 as an offline tool; map
only Size and Difficulty to the plan and say on the page that the other panels do not apply to a premise yet; cut the
second and third premises, the readout and the sketch start. What is kept is what makes the class: the plan, levels by
number, the land as bowls, the frame, the ladder, wood by budget.

## 8. What the editor gets from the same pieces

- **A sketch start.** On a blank map the player draws the skeleton at map scale: the valley's line, lake outlines
  with a level typed on each, a fall between two, a dry channel, the start. The strokes are a `PremisePlan` with no
  premise id. **Make natural** runs stages 1 and 2 on it. Per D342 this is an operation: a new `premiseLand` in
  `ops.schema.json` whose parameters are the plan, deterministic from them, refused in one line where a plan
  invariant fails ("Lake 2's sill (6) is not below lake 3's (6)"). The logic is `src/core/premise/`, headless; the
  page only draws strokes and shows the result. Typing a level on an existing lake stays `setLakeLevel`.
- **A readout of the ladder.** A panel that lists the works, small first: what to build and how many tiles, what it
  turns green or wet, what it needs first, its trade-off. Hovering a work shows its green on the map. On a
  generated premise map the list is `info.premise`'s works, their gains measured by the background what-ifs. On any
  other map a later step finds candidate works (rows of Blockages, narrows in dry beds two deep: `analysis/damsites.ts`
  finds dam sites already) and measures each the same way. This is MAPCRAFT's missing measure: "what each work would
  turn green".

## 9. Rulings, and what is still open

### Ruled

Planning ruled on the questions this design raised (2026-11-10, on PR #944), recorded as D508 to D513. The builders
work to these.

1. **A library of premises: yes** (D508). This replaces the archived plan's "no table of named premises" (D275, D278)
   and the readings of D208 and D108 that went with it, on Kyler's direction of 2026-11-10 (maps from first principles:
   a problem you can say in one line; MAPCRAFT). A premise is a problem with many structures, never a fixed layout;
   variety across seeds is a shipping test (section 6, tier 3); a premise map's green is judged by its ladder (dry land
   irrigable by design, the `spectrum` invariant), not by a share (D504's bare-ground measure is the themes').
2. **Generate's default** (D509). The themes stay the default until three premises have passed judging in the game.
   Until then a control chooses the premise mode. After that, Surprise me may draw a premise.
3. **The landmark fall is 6 or 7 levels** (D510), so its lip is whole in the game's first frame with a start that passes
   `start.dry`; `start.dry` stays blocking (section 4.3).
4. **Easy start is not offered with the lake stair** (D511) until a variant that keeps Easy start's promise (two clean
   days in the first badtide, `analysis/easyStart.ts` `EASY_START.badtideDays`) has been judged: `eligible` returns the
   reason and the themes make that map.
5. **Blockages carry the ladder: proceed** (D513 (3)). One Probe run settles what clearing a Blockage costs in the game,
   before the ladder step (build step 5) merges; if it is not a small work, a notch is a one-level rock plug two tiles
   thick instead.
6. **Wading** (D513 (1)): beavers never cross water without a bridge; `reach` counts crossings as built.
7. **Shapes: squares only for now** (D513 (2)).
8. **D111 reads as its check reads** (D512). The closing ridge below the lowest lake is the valley's own high ground,
   ten tiles thick or more and wandering, the gorge a canyon cut through it (the megadam's site); a sill is a rock step
   with the land's own shoulders. Both are landforms, not built dam walls; `terrain.dam_wall` stays blocking on every
   premise map.

### Still open

- **A fact, by one Probe run before build step 5:** what the game asks of a player to clear a Blockage, and when in
  a colony's life (ruling 5).
- **A design, later:** the lake stair's Easy start variant (ruling 4), and its landmark of 8 from a bench two levels
  over its lake (section 4.3).
- **For the builders to verify in code (section 2.1's two assumptions):** whether a contained `river` feature with
  `entry: { lake }` places a source of its own (build step 4), and the new `MapObjectKind`s the set pieces need
  (build step 7). The flow constants of stage 1 are fitted (section 2.2, "As built (step 2)").
- **Curtains on drawn plans (found at step 2), for stage 1 before step 4:** settled with the notches open, 10 of
  the 119 falls on seeds 1 to 12 at the three sizes fail `stair.settled`'s curtain, so step 4 would settle such a
  map twice or more; nine are landmarks. Five drop 0.1 or less short of `H − 0.3`: they land in a lake standing
  0.35 to 0.45 over its sill, the lowest carrying the whole of the springs (a landing a level under the sill, or a
  landmark of 7 over the lowest lake, would answer it). Four are split by a dry tile of their lip, under a head of
  0.1 on 13 to 16 tiles. One stair fall pours 7 tiles of its 8 at a diagonal lip's end. Each fails where its lip
  pours a film: the head over a stair fall's lip is about 0.13, the landmark's about 0.15.
- **The ground measures at 128² (found at step 3), for stage 2 or the plan:** the three commonest levels stand at 37
  to 43 % (under 35 % asked) and one-level steps at 52 to 57 % (60 to 80 % asked): three lakes' meadows hold most of
  a 128² map. Narrower meadows at 128² (the plan's), or meadows that rise a level past the soil's reach of 9, would
  answer the first; crags of one and two more often the second. Judged in the game first.
- **The start against its bay (found at step 3), for stage 3:** on seed 3 at 128² the start's lake's bay wraps its
  5 × 5, which stays dry and level, but `start.level_land` (42 of 113) and `start.farmland` fail: stage 3's frame
  check should move the start onto the meadow.
- **Leats step a level every 2 or 3 tiles** where stage 0 gives a short leat a fall of 4 or 5 (13 to 9): its terrace
  follows it as treads. Stage 0 drawing leats along the contour, falling a level per 20 tiles or more, would answer it.

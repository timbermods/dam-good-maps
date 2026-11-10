# Premises: how the generator makes a map from an idea

A design, not yet built. [MAPCRAFT.md](MAPCRAFT.md) says what makes a map good and lists the craft in thirteen steps;
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
| Start: Easy start, the rules | The start rules are the checks' own and always hold. Easy start: see open question 4. |

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
- The arithmetic it uses, measured on Four Lakes (constants to be fitted by this stage's test, not laws): a lip
  carries about 3.3 × depth × width; a flat channel needs about a level of head per 100 tiles; a gorge 5 wide carries
  a flow of 20 a level deep; a notch one tile wide carries 2 to 3.
- Test (`land`): `flowThrough` on the rastered water alone gives each body's level within 0.5 of its sill and no
  flow leaving except by a planned exit; each fall's drop is its height; every row spans its channel.

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

### 3.1 Where the script's nine minutes go

From the build logs of rounds 12 to 14 at 192² (`C:\dgm-showcase\four-lakes\r12-build.log` … `r14-build.log`):

| Step of the script | Seconds | Why |
|---|---|---|
| The design (`designLand`) | 1.4–2.2 | Every tile against every body's every arm and every channel, with four-octave noise each time |
| Blank ground and the land as operations | 1.3–2.4 | One Flatten operation per level |
| Blockages | 1.7–4.0 | An operation per row |
| Sources and the settle | 2.3–4.6 | The canonical settle: 1,536 to 2,176 ticks |
| Objects | 131–141 | Each object is its own operation; the document is rebuilt and its water settled after each (my reading of the timings, not profiled) |
| The route | 10–11 | Walks, and a ramp built per gap |
| Plants | 45–62 | Brush strokes as operations |
| Pictures, checks, save | 12–13 | |
| Drought 9 days, badtide 8 days | 9 and 14–19 | `HazardRun`: about a second a game day |
| The first badtide, both ways | 47 | Four hazard runs |
| The ladder (`--irrigate`) | 27–48 | Seven what-ifs, each a full settle |
| The bypass opened, badtide | 12–20 | |

Three quarters of the time is the document engine replaying one operation at a time. The settle itself is 2 to 5
seconds. The rest is weather runs and what-if settles.

### 3.2 What the generator does instead

- **One build.** The generator makes a field and features and calls `buildMap` once: one settle, one soil pass, one
  placement of everything. No operation is replayed. This alone removes about four of the nine minutes.
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
| 1 Water by number, with `flowThrough` | 40 ms | 90 ms | 160 ms |
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
| Size | 128² to 256²; the short side 128 or more | Eligibility. Under 128 the stair has no room for three lakes with meadows |
| Lakes `n` | 3 at 128²; 4 at 192²; 4 or 5 at 256² | Size, Lakes |
| Step `f` between sills | 3, 4 or 5 levels | Verticality; `2 + (n − 1) f + 2 ≤ top` |
| Sills | 2, 2 + f, … (water in the third layer at the bottom) | By number |
| The valley's line | Exit on one edge to the springs across the map; length 1.25 to 1.5 × the side; a diagonal, an S or a hook; 8 turns and mirrors | Seed |
| Lake size | Arms of radius 7 to 15; 2 to 5 arms; a cove, a bay behind a peninsula; an island or two | Seed, Variety |
| Meadow | 12, 15 or 18 wide, ± 3 by noise | Buildable land |
| Stair falls | Height `f`; lip 8 to 16 wide by flow; a horseshoe lip; a notch of one tile on every sill but the lowest | Flow |
| The springs | One pool at the top water's level, 3 to 5 sources; total strength 10 (trickle), 14 (normal), 18 (strong), 22 (lush) | River flow |
| The landmark | A fall of `H` = 6, 7 or 8 levels from a **hanging valley** (20 to 40 tiles long, bed level = the foot lake's sill + H) into the start's lake; a lip of 10 to 14 tiles in unequal runs; fed from the springs' pool or from a lake `H` or more above | Seed; section 4.3 |
| The start's lake | The lowest or the second lowest | Seed |
| The start | On a bench one level over its lake's sill, 5.5 to 7 tiles in front of the lip; bench 580 to 980 level tiles | The frame |
| The bypass | A dry channel from the springs' pool round one side to an edge or to the gorge below the lowest sill; 250 to 320 tiles long at 192²; mouth 10 wide; 3 rows of Blockages (the first at the mouth) | Seed: which side, which exit |
| Gates | 3 or 4 sites, each a channel 1 to 5 wide: the neck to the top lake, the hanging valley, each leat's head | By the graph |
| Side bodies | Tarns: 3 at 128², 7 at 192², 12 at 256²; two of them rim tarns with their own springs (0.8 to 1.5) | Size, Variety |
| Living brooks on day 1 | One each side, each from a spring tarn to a map edge | Rivers |
| The megadam's site | A slot 5 to 6 tiles long through the ridge below the lowest lake, walls 6 or more over its bed | Fixed kind, drawn place |
| The skyline | One ridge behind the top lake, to `top` or to 21 on a tall map | Verticality |
| Dry for good | The side the bypass runs on: limestone benches, succulents | Follows the bypass |

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
| Small | Notch | Clears a row of 3 or 4 Blockages | A spring tarn's **second** outlet, the row below the tarn's outline and spanning the bed; a dry bed two deep to a lake | 430 to 570 tiles each |
| Small | Dam to pond | A dam of about 5 tiles, one level | A narrows in a dry bed two deep, with the bench beside it level at bed + 2 for 8 tiles or more | 270 to 470 |
| Small | Levee | About 8 tiles at a basin's spill point | A basin with a beach at its sill + 1 and a rim over the beach | 260 to 340 |
| Medium | Leat | Clears 3 Blockages at a leat's head (and gates it for the badtide) | A leat one tile wide from gated water to a chain: a basin, its brook | 1,000 to 1,500 |
| Medium | Raised sill | 11 to 17 tiles on a stair fall's lip | Rock shoulders two over the crest | 600 to 1,400 of water a lake |
| Large | Bypass | Clears 3 rows (16, 6, 8 tiles), builds 3 or 4 gates | Section 4.1 | The premise's answer; about 1,100 to 1,500 tiles along it |
| Large | Megadam | 5 or 6 long, to the next sill's level | The slot | Water of about 0.44 × the map's tile count (16,241 at 192²) |

Counts scale with the map's area over 192²'s. The seed draws which kinds stand where; the least is six small works of
four kinds, three of them within 40 tiles' walk of the start's bench.

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
| `spectrum` | settled | Water 15 to 25 % of tiles; moist ground 30 to 42 %; small works 6 to 8, each 250 to 1,100 tiles and at most 3 % of the map; all works together 10 to 20 %; dry for good 12 to 25 %, on one side |
| `ladder.kinds` | land | Four kinds or more among the small works; three within 40 tiles' walk of the bench; one first work inside the first frame |
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

### 5.1 The wall and the gate

**The line:** "The river leaves its green valley through one gate in the wall and crosses the dry basin in a canyon
too deep to water it: raise it at the gate, or lead it out along the wall."

- **Water story.** One river (edge sources, strength by River flow) down a green upper valley; the gate, a gap 6 to
  10 wide in a ridge 8 or more levels high; a fall of 6 or more into a plunge pool; then a canyon three or more
  levels under the basin's benches (ground three over water is always dry) to the far edge. A drought dries the
  canyon first and leaves the valley's oxbow ponds. A badtide runs down the canyon and harms nothing, until the
  player has led the river onto the basin: then every leat needs its gate.
- **Skeleton.** Regions: the oasis under the gate (the start), the dry basin (the canvas, half the map), the canyon,
  the wall, the green valley behind it (the prize: wood, farmland, the reservoir). Landmark: the wall with the fall
  in its gate. Edges: the wall's ends run off the map; the basin falls away.
- **Start and first frame.** In the basin on the plunge pool's apron, looking at the gate: the fall and the wall
  above it. The same frame arithmetic; the wall may stand above the frame's top, the lip may not.
- **Ladder.** Small: check dams at the canyon's narrows (dam to pond, the bench built at bed + 2 for a reach), each
  a field. Medium: a contour leat from the plunge pool along the wall's foot (a dry ledge that falls a level per 100
  tiles, old aqueduct piers along it); a stair up the wall. Large: a dam in the gate (the valley becomes the
  reservoir, the fall stops: a trade-off); a megadam at the basin's exit.
- **Invariants.** The basin is dry on day 1 but for the oasis (moist under 12 % of it); the canyon's water is three
  or more under every bench it passes; each check dam's site gains 300 to 900 tiles; the gate dam holds a stated
  volume; the valley is reachable only by the wall (a stair of 8) or the gate.
- **New beyond the lake stair:** a ridge with one gap as a body's rim (`raster/wall.ts`); a canyon as a channel
  with walls (the script's gorge, `open: 0`, lengthened); the contour ledge (a new raster: a bench that follows a
  falling level); edge sources (`placeSourceGroup` rows, as the themes place them).

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
  the high island's fall across the strait. Edges: the sea runs to two or three edges behind a rim (the Islands
  theme's rule, D151).
- **Start and first frame.** On the home island's shore bench looking across the strait at the fall; the frame's
  water is the strait, kept shallow.
- **Ladder.** Small: the home tarn's notches; a dam on each of the lagoon's straits (3 to 6 tiles; a dam is also the
  way across). Medium: the causeway raised a level; a leat from the tarn. Large: a notch in the crater's far rim
  (the red leaves by the outer edge: the second answer); the exit's sill raised a level (a bigger sea that drowns the
  low shores: a trade-off).
- **Invariants.** The sea at its level; every island the route needs within one crossing of the last; the lagoon
  shut by two dams of 6 or fewer; the red's day of arrival at the lagoon 2 or more left alone, never with either
  answer; the causeway dry by day 3 of a drought.
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
   - `tests/contract/premisePlan.test.ts`: the `plan` invariants on seeds 1 to 200 at three sizes (milliseconds).
   - `tests/contract/premiseLand.test.ts`: the `land` invariants on seeds 1 to 24 a size.
   - `tests/contract/premiseMap.test.ts` (quick suite): one 128² map's `.timber` sha256, as
     `look-mine-ruins.test.ts` pins `LIVE_SHA`, with its `settled` invariants and its share link round trip.
   - Nightly: tier 1 and tier 2 at 12 seeds a size; `tools/map-hashes.ts` grows a `--premise` flag.
   - **The hand-built map as a fixture:** Four Lakes' design written as a `PremisePlan`
     (`tests/fixtures/four-lakes.plan.json`) must pass the lake stair's invariants through stages 1 to 5. The map
     that set the bar keeps the generator honest.
   - A change that alters a premise map is a generator change: claimed on #236, `GENERATOR_VERSION` bumped, re-pinned
     once (D308, D148).

## 7. The build order

Each step is one PR that leaves dev green and is useful by itself.

| # | Step | Useful by itself as | Depends on |
|---|---|---|---|
| 1 | **The model and the lake stair's plan.** `src/core/premise/types.ts`, `draw.ts`, `premises/lakeStair.ts` (stage 0 with the frame's arithmetic), the `plan` invariants, `tools/premise-plan.ts` (prints a seed's plan and draws its diagram), `premisePlan.test.ts`, the Four Lakes fixture. No generator change, no version bump. **A day.** | The water story as a diagram for any seed (MAPCRAFT step 2); the frame limit as a tested function | Nothing |
| 2 | **Water by number.** `levels.ts`, `raster/bodies.ts`, `falls.ts`, `channels.ts`, `guard.ts`; the `flowThrough` test; a contract test that settles three plans and the fixture | Lakes, sills, falls and channels at stated levels from a plan: the editor's sketch can call it | Lakes by number (merged: `sillWidthFor`, `MAX_SILL_WIDTH`). The fall judge `fallCurtain.ts` from "a fall in one stroke" (#934, in review) when it merges; not blocked by it |
| 3 | **Relief between**, and `tools/premise-map.ts`, which writes a `.timber` for a seed outside the product | A whole land with water to open in the editor and run through the capture kit; tier 4 judging can begin | 2. Ground with grade (#929, next in the milestone session's queue) for the outlands, when it merges; not blocked |
| 4 | **The generator's mode.** `generatePremise` behind `spec.premise` (link key `p=lakeStair`; no control on the page), stages 3, 5 and 8: the start by the frame, one build, the checks, re-roll and the fall-back to themes; `premiseMap.test.ts` | A playable generated lake stair from a link, in seconds, without plants | 3 |
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

## 9. Open questions for the owner, each with the default the builders proceed on

1. **A library of premises changes a recorded rule.** PLAN §8 says there is "no table of named premises" (D275,
   D278), D208 that themes are leanings, not templates, and D108 that maps never come from a few archetypes with a
   little noise. **Default:** a new decision: a premise is a *problem* with many structures (section 4.4's variety is
   a shipping test), which is D138's "outcomes, never construction recipes" kept and D108's "must play differently"
   measured inside each premise; the themes stay as they are. The same decision says a premise map's green is judged
   by its ladder (the `spectrum` invariant), not by D504's bare-ground share: its dry land is meant.
2. **What Generate does by default.** **Default:** until three premises have passed judging, a premise is chosen
   (a control beside Theme, "Classic" first), so one press never gives the same idea twice running by accident; with
   three, Surprise me draws a premise wherever one is eligible and the themes otherwise.
3. **The landmark's height against a dry start.** A fall of 8 whole in the first frame puts water inside the
   start's 5 × 5 (the hand-built map carries that warning on purpose). **Default:** generated maps keep `start.dry`
   blocking and take a landmark of 6 or 7; 8 waits for the two-level bench variant.
4. **The first badtide and Easy start.** The lake stair's truth is that the start's water is bad on day 1, answered
   by one levee in the first frame; Easy start promises two clean days (`analysis/easyStart.ts`
   `EASY_START.badtideDays`). **Default:** the lake stair is not eligible with Easy start on (the themes make that
   map) until an Easy variant is designed and judged.
5. **Blockages carry the ladder.** What the game asks of a player to clear a Blockage, and when in a colony's life,
   was not checked (round 11's note). **Default:** proceed with Blockages; one probe run settles it before step 5
   merges; if clearing comes too late, a notch becomes a one-level rock plug two tiles thick.
6. **Whether a beaver wades shallow water** is not known from the repository; the checks say never.
   **Default:** never; `reach` counts crossings as built.
7. **Map shapes.** **Default:** squares and rectangles up to 3 : 2 with the valley along the long side; longer maps
   are the themes' until a premise is designed for them.

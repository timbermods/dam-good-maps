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

As built (step 9, core): every setting of the panel has one role on a premise map, in `premise/choice.ts`
`PREMISE_SETTINGS` (each with the one line the page may show); `premiseSettings(premise).greyed` is the list the page
greys out.

| Setting | Role | What it does on a lake stair |
|---|---|---|
| Size | plan | The count of bodies and works (by area), the valley's length. Meadow widths and fall widths do not scale: the soil's reach and the first frame are fixed sizes. Square, 128 to 256 a side, or refused. |
| Difficulty (`designedFor`) | plan | The start's held water (the breach's width, the cove pool's size), the sources' strength, how many small works stand within the start's walk. Hazard lengths are `sim/weather.ts` `HAZARD_DAYS`. |
| Terrain: Highest terrain, Verticality | plan | The stair's height: the fall heights and how many levels the stair may use (`top`, Highest terrain but never over the in-game editor's 16: `stairTop`). Above 16 (Highest terrain 22 from Verticality 70, D132, the premise's preset) only the land away from the water rises (the plan's `sky`: the uplands and the skyline), never the stair or its water. Too low for the stair and its landmark: refused. |
| Terrain: Buildable land | plan | Meadow width (tight 12, normal 15, generous 18) and the start's bench. |
| Terrain: Variety | plan | Wander, and how many side bodies (tarns, kettles) the plan draws. |
| Terrain: Relief, Terracing | style | The outlands' rise and fall (Relief over the premise's 55) and the uplands' share on the theme's benches (Terracing). |
| Water: River flow, Lakes, Drought reserve, Badwater | plan | The sources' total strength (lips widen with it, `sim/sill.ts` `sillWidthFor`), the count of bodies, the start's held water and the first reservoir, the permanent badwater source (D200; below the lowest sill, D498). `lakes: none` refused. |
| Water: Waterfalls, Sources; Start: Easy start | refuses | Only their refusing values act: Waterfalls Off, Sources None and Easy start on are refused in one line (section 9, ruling 4). |
| Water: Rivers, River style; Hazards: Thorn belts, Unstable cores; Resources: Relics, Geothermal | none (greyed) | Nothing yet: the stair's water rises from its springs; thorns, cores, relics and geothermal wait for the set pieces (step 7). |
| Resources: Forests, Species mix, Grove size, Berries, Bushes, Ruins, Mines | life | Stage 6's budgets inside their ranges; wood stays a budget at every Forest density. |
| Start: the rules | rules | The checks' own, and they always hold. |

The presets split (`spec/mapspec.ts` `defaultSettings(theme, difficulty, size, premise)`): with a premise, the theme's
preset gives the style's settings (Relief, Terracing, the Resources) and the premise's preset gives what the plan reads
(Verticality and Highest terrain, Buildable land, the Water, Badwater). So the same seed draws the same plan in every
theme.

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

### 1.5 A theme and a premise are two choices

Planning's direction, endorsed by Kyler (2026-11-10): a theme and a premise are independent. The **theme is the land's
style**: its relief's grade, its ground and its plants. The **premise is the problem**: its water, its works and its
frame. As the premise's stages firm up, the relief, life and dressing stages take the theme as their style (#956's
per-theme grade is the start), and Generate ends up offering both pickers, each with Any. The themes stay Generate's
default until three premises pass in the game (D509, ruling 2 of section 9).

As built (step 9, core; the pickers are the page session's):

- **Two choices.** `spec.theme` (Any or a theme) and `spec.premise` (`"any"` or a premise; absent: the themes' map, still
  the default) are independent fields; the link carries both (`t=`, `p=`). Any resolves from the seed
  (`premise/choice.ts` `resolvePremise`): the premise first, then the theme among those the premise honours
  (`PREMISE_THEMES`).
- **A pair the premise can't honour is refused in one line** (`pairRefusal`): the lake stair takes River Valley,
  Canyon, Highlands and Lake Basin; Delta ("The lake stair needs high ground for its falls, and a Delta is low and
  flat") and Islands ("The lake stair climbs one valley, and Islands breaks the land into isles") are refused, and
  Generate has the themes make the map with the line in `info.premise.fellBack` (D471). Never silent. The themes make
  it with the theme's own settings where the premise's preset set them and they still stand as set
  (`themeOwnSettings`): a refused Delta is a Delta, not a Delta with the premise's water.
- **The style seam** (`premise/style.ts` `premiseStyle`). Stage 2 (`raster/relief.ts` `reliefBetween`,
  `styledUplands`): the uplands take the theme's form (`THEME_UPLANDS`) in the room between the stair's ground and
  the highest ground, and rise and fall by Relief. Canyon: tables in three heights read from broad noise (neighbours
  often share one, so they run wide), high in the room, cut along three in five of the edges between tables of one
  height by dry canyons 5 levels deep and about 5 tiles wide, cut after the grade and left out of the bench-width
  floor; walls 3 to 6 tall by the meadows. Highlands: the cones of the plates' points, summits at the highest ground,
  valleys between them coming down toward the floor past the green. River Valley: terraces climbing with the
  distance from day 1's water, so their steps run along the valley, two levels apart over Terracing's share, broad
  benches by the meadows. Lake Basin: low rolling ground a little over the stair's, its benches by the meadows widest.
  Past the green of day 1's water (16 tiles) the uplands' ground comes down by the form's `deep` (Canyon's canyons
  to the floor, Highlands' valleys most of the way, River Valley's a little, Lake Basin's not at all); by the water a
  plate stands no higher than the premise's own and the hillsides' cap only comes down, since a style's height there
  took the green off the first benches and left 256² under `spectrum`'s 30 % moist floor. The uplands are graded by
  the theme's grade (#956's `GRADE` through `land/levels.ts` `grader`). The style fades in past the start's own 16
  tiles and `THIN` more (the bench-width floor reads that far across), the plates standing at the premise's own
  outlands and graded with the style as it comes in, and the bench-width floor kept off the start's 16 tiles (it
  reads a run of treads across, and carried a style's steps in on seed 1's works-round plan), so the start, its frame
  and its walk are the premise's in every theme. Stage 6 (`life.ts`): a species mix
  left as the panel's own takes the theme's woods (`drawWoods`); the stand rules stay the premise's. Terrain has one
  material in the game, so the ground's look is its shape (D496).
- **The height round (2026-11-11):** the premise's preset is Verticality 70 and Highest terrain 22 (D132; Any's and
  every theme's on a premise map, since the premise sets the terrain's height); the stair is drawn under 16 as before
  (`stairTop`) and the uplands rise in the room up to 22 (`sky`). The forms use it: Canyon's tables stand high in the
  room (0.6 to 0.9 of it; the works round raised them from half to 0.85, where on seed 1's new plan River Valley's
  terraces stood at 17 or more on more tiles than Canyon's tables) and three in four of the edges between them are cut 8 levels under the lower table, about
  7 tiles wide; Highlands' peaks are two in five of the plates' points, summits from 0.6 to the whole room and level
  for 3.5 tiles round their point (the bench-width floor wore narrower summits flat), rolling heights at a third of
  the room between them; River Valley's terraces climb with the distance from the lakes and their links (not day 1's
  brooks), 2 levels apart over twice Terracing's share, from 14 tiles out over 40; Lake Basin's floor stays at a tenth
  of the room, rolling, and within 15 % of the map's side of each edge it stands at 55 % of the room: one bold scarp
  round a broad low floor, never River Valley's steps.
- **The premise's in every theme:** the plan, its water, levels, works and ladder. The dry beds follow the land, as
  stage 2 lays them in any land, and a theme can change which of the seed's plans holds first where a check's verdict
  on the styled land differs (seed 2: plan 3 in Canyon and Highlands, plan 9 in River Valley and Lake Basin).
- **Measured** (128², seeds 1 to 3, the height round): dry ground's mean height and its spread (standard deviation)
  are 12.5 and 3.4 in River Valley, 12.8 and 3.9 in Lake Basin, 12.0 and 4.5 in Canyon, 13.2 and 4.2 in Highlands
  (the look round's, seeds 1 to 8: 11.6 and 2.9, 11.0 and 3.0, 11.8 and 3.3, 10.6 and 3.7); ground at level 17 or
  higher 11 %, 17 %, 20 % and 18 %, the highest 21 or 22. Day 1's moist ground is at most 40.8 % in any theme (the
  ceiling 42 %). Maps made: theme Any 11 of 12 over seeds 1 to 12 (seed 5; seed 8 now makes one); River Valley's
  seed 6 makes one (320 logs in the start's walk: stage 6 leans the start's groves to oak where the walk is short,
  `planResources`' `woodLean`, as the generator's rescue round does).
- **Short:** the themes read apart on the uplands (Canyon's high tables and deep canyons, Highlands' white summits,
  River Valley's stepped terraces, Lake Basin's low floor in a rim), but by day 1's water the land stays the
  premise's, so on seeds whose land is mostly within the green the four maps still share most of what a player
  sees. The set pieces (step 7) do not take the style yet.
- **The map card's words** (`premise/card.ts` `premiseCard`, in `info.premise.card`): the premise's name, the style, the
  landmark ("The Great Fall, a six-level fall into Low Lake, the start's lake") and the ladder's first rung in a
  sentence ("Mend the breach in the old weir at the Gate Gorge (one tile), so Low Lake keeps its water in a drought.").

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
  over its lake, its drop 2.6 of 3 (seed 1 at 256²). The lowest lake's bed is on `BED_FLOOR`, two levels under its
  sill (three where it is the start's, stage 0's `stairBase`): it carries the whole of the springs to the gorge, and
  a level deep it stood 0.7 over its level at its far end and overtopped its guard (seed 12 at 256²).
- **The channels wander** (D208; stage 1 owns it, before the guard and the rows): a channel's course is its path a
  tile at a time, each point moved across it by noise, fading to the path over 6 tiles at each end so a channel
  leaves and meets its waters where the plan says (`raster/channels.ts` `wanderOf`): the bypass 2.2 tiles, a leat
  0.8, a brook drawn from 1 to 4.2, as Four Lakes' `Channel.wander`. The neck, the hanging valley and the gorge run
  true: their heads are weirs and lips. Stage 0 cuts the bypass's sharp corners (`softCorners`), so the old channel
  never turns a right angle. A spring tarn's run to the edge (`premises/lakeStair.ts` `edgeRun`, `RUN_WANDER`) is
  bent in the plan before it is laid: its mouth slides along the edge by up to 0.7 of its distance and its course
  bends up to 0.16 of its length across (7 tiles at most) at points 9 apart, drawn from the run's own hash; a course
  that is not clear runs straight, and a slid mouth that is not clear runs square. At 256² the ten runs ran square to
  the edge like rulers, five of them in a row along one edge.
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
  outline, a beach at the sill + 1 wandering from one tile to three, a flat floor a level under the sill crossed by
  the old river's line down its main arm a level deeper (one or two tiles wide, pinching out: never a ring round a
  hollow). The hollow behind the skyline (`hollowsOf`, where it fits: on the skyline's far side from the water, its
  middle inside the map and its own radius from every water and bed): a level floor two under the skyline's ledge,
  4 to 7 tiles in radius (to 10 past 192²), in a rim a level over it, two levels or more over the highest water,
  left as it was within 5 tiles of any water or bed. Then `tidy` (no one-tile pits, spikes or tongues).
- With "ground with grade" (merged): its graded slopes replace `rise` on the outlands. Stage 2 calls
  `land/levels.ts` `gradeLevels` on its own heights there (a `Grade`, `land/genome.ts` `GRADE` or `drawGrade`, with
  the benches' step and a mask of the outlands); `snapLevels` grades a theme's field through the same `grader`.
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
- **Rims, kept from the waters below**: a body's 6 tiles since the hold (3.2 before; the pool's 4), a brook's 4, a leat's 6, the neck's 4. At 2.6
  a leat or brook crossing a lower lake's meadow stood on a dyke 2.6 tiles wide each side; 4 to 6 is a terrace.
- **The landmark's hanging valley stands in an upper world**: its rim is 8 tiles behind its lip (nothing of it in front
  of the lip's line), so it runs on high ground and leaves it by the cliff the fall comes over, the start's meadow in
  front (the script's `greatWall`, generalised).
- **The bypass follows the land** (its plan's `bed: { under }`, which stage 1 laid falling evenly): past its head and
  first row, its bed is 2 under the lowest land within 3 tiles, never rising, never under its end; a wadi a level
  over it 1.7 tiles wide (ragged), the guard beside it read again from the new bed. At 3 under, its walls were
  two-level steps the whole way round the map (one-level steps 51 to 57 %). It is no bowl: a bowl at its fixed bed
  stood it on a ring of dyke where it passed a lower basin's meadow.
- **The dry benches' threes** stepped from a phase that drifted; the uplands are plates since the hold (below).
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

**As built (the hold, after step 5).** Planning's capture verdict (2026-11-11) asked three things: lakes that drop a
level in a drought, not empty; the landmark landing on a shelf; uplands of broad benches and bold scarps, not rings
and bands. Measured on seeds 1 to 3 at 128² and Four Lakes (`tools/premise-map.ts --drought`, `premise/hold.ts`):

- **A lake's floor is set by the drought it must last** (`levels.ts` `HOLD`, `holdDeep`; stage 0 sets `deep`): a lake
  loses a level through its notch or breach and the sun's 0.0535 a day (`sim/drought.ts`) over the difficulty's
  longest drought (9 days on normal), and its floor lies deep enough that 55 % of its day-0 water is left at the
  worst day: 4 levels for a notched lake on normal, 2 for one with no way to sink, never more than 5 nor under
  `BED_FLOOR`. The drowned river's line runs a level deeper where the floor leaves room (`raster/bodies.ts`). The
  stair's upper lakes keep 54 to 58 % (Four Lakes 54 to 69 %; before, 30 to 40 %).
- **The lowest lake stands a level higher where it is the start's** (`stairBase`): its ruined weir's breach sinks it a
  level, and on a floor two deep it kept 13 to 15 %, three deep 31 to 34 %. Where the higher stair would not fit
  under the highest ground (four lakes a step of 3 under 16), the stair keeps its count and step (§4.4) and that lake
  its two levels. Section 9 has what is left.
- **The start's water is the drowned river's ribbon** (`WaterRaster.ribbon`): through the first frame's bay the bed
  is a level under the sill, the river's line two (a tile or two wide), and the ribbon runs on through the landmark's
  foot to 2.5 tiles from its lip. Stage 3 keeps ribbon tiles to 2.5 deep (`START.ribbon`), the rest of the frame's
  water to 1.2. The start's water holds through the 9 days on seeds 1 to 3 and Four Lakes (Four Lakes' went on day
  2 before).
- **The landmark lands on a shelf** (`raster/falls.ts` `FOOT_SHALLOW`): the foot inside the frame stands at the
  lake's sill, a level under it where the water there stays under 1.2: 0.28 to 0.40 deep on seeds 1 to 3 (the
  ribbon's tiles aside), the lake's deeper floor under the foot raised to it.
- **The uplands are plates** (`raster/relief.ts`, the idea of `rust/forces/src/levels.rs`): land past a bowl's own rise
  (5 levels over its water, give or take 3 by noise) and 16 tiles or more from the start is cut into irregular
  plates (8 + W/16 points on a jittered grid, the nearest under a warp), each standing at one level, the outlands'
  mean under it plus up to 1.2. Plates meet at bold scarps; no rings round the waters and no bands along the edges.
  A bowl's rise is capped at the outlands, never under its meadow; rims are 6 tiles (at 3.2 the top lake's guard
  stood over its lower land as a `terrain.dam_wall`). Each bowl's distance transform runs on its own box (its reach
  of 30 tiles past its meadow), and the noise fields are read once, coarse and shared. `reliefBetween` takes 65 to
  107 ms at 128² (worst 306; was 200 to 282) and 257 to 298 ms at 256² (worst 517; was 1.1 to 1.4 s). The ground
  measures stand as before: flat 46 to 47 %, one-level steps 53 to 56 %, the three commonest levels 39 to 44 %.

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
  and a geothermal field in the regions that own them; relics on an island and at the exit (the mine sites, first
  written here, are stage 6's as built). A cave makes the map's water the stacked engine's, so it is cut **before**
  stage 5's settle when the plan has one; a cave that then fails its read is taken out and the map settled again (one
  of the plan's two settles). Everything else here stands outside the water and is placed after the settle without another.
- Test: every piece stands on ground the game allows (`entities.placement`); at least three secrets, each tied to
  the premise or a region.

**Stage 8. Accept, repair or re-roll** (`generate.ts`).
- The checks (`validateMap`, profile `"generate"`), the reach (`validate/playability.ts` `colonyReach`: every region
  walkable by natural ways or by one crossing the land plainly asks for: a pier row with gaps of three, a channel at
  most five wide), the name and the description from the plan's `line` and works.
- A failure with a repair is repaired once. Any other failure draws the next plan (`attempt + 1`). Stages 0 to 4
  are arithmetic, so a re-roll before the settle costs under half a second. After `PLAN_TRIES` (16 since step 6) plans the spec
  goes to the themes' path: "No valid map" never shows (D471).
- **The land is shown** (`opts.onLand`) when stage 4 passes: every check the land alone can judge has run, and by
  design the settle moves no ground (D348). The two repairs that touch ground after the settle (a lip's width, a
  guard tile) are of the kind D348 already allows for a worn way out.

**As built (step 4).** `generate.ts` `generatePremise` is the mode: `gen/generate.ts` `generate` calls it when
`spec.premise` is set (share link key `p`, which the codec already carried: no new key, no version of its own), and
hands the spec to the themes when it returns a reason, recording it as `info.premise.fellBack`. Each attempt runs
stages 0, 1 (with its `land` invariants), 2 (`map.ts` `premiseLand`) and 3, then one `buildMap` and the checks;
stage 4 and the repairs are not built. Where it differs from the above, and why:

- **Stage 3 checks rather than trims** (`frame.ts` `checkFrame`). The plan's start is kept if it holds, else the
  nearest tile within 4 that does: a dry, level 5 × 5 with a level door at the plan's turn; every landmark lip tile
  and the pool's foot inside the first frame (`frameAt` at the start's own zoom, |u| ≤ 0.95, v ≤ 0.98), a lip tile
  measured at its corner toward the camera, where the rendered lip's edge stands; and the walk's level land (flat dry
  2 × 2s) and farmland within 20 tiles at the rules' counts (`rulesFor`: 113 and 100 on Normal). A plan whose start
  holds nowhere is the next plan, before its settle (`frame.start`). No lip is trimmed; a lip tile outside is a
  re-roll.
- **The frame's water made shallow by its beds**: lake beds inside the first frame stand at most 1.2 under the
  surface (85 % of the frame's water so; the crest's pour is left). Before this, 31 to 54 % of it was shallow. The
  pump's ribbon is cut since the hold, to 2.5 (stage 2's "As built (the hold)").
- **Stage 0 frames with a margin** (`FRAME.lipStair`, 0.5 of the frame's height): stage 3 measured the stair's lips
  standing up to 1.11 in the frame where stage 0's arithmetic had 0.98, since the lips of the runs ahead of the line
  stand nearer the camera.
- **The checks only stages 6 and 7 answer are warnings until then** (`LATER`: `start.food`, `start.wood`,
  `start.wood_floor` and `resources.mine_site`), each saying which step answers it; every other blocking check
  blocks. The land is shown (`onLand`) once the map passed, since the land is the settled map's (D348).
- **At most three settles a map** (`PREMISE_SETTLES`), sixteen plans (`PLAN_TRIES`, eight before step 6); then the
  themes, with the last reason in one line ("No lakeStair map held in 16 plans and 1 settles (…)").
- **Measured** (`tools/premise-map.ts`, seeds 1 to 12 at 128²): ten make a premise map on their first settle in
  1.4 to 2.6 s; seeds 5 and 10 fall to the themes in 3.2 and 3.9 s: of their 16 plans, 9 find too little level land
  within the start's walk (43 to 103 tiles of 113) and 6 fail stage 1's `land` invariants (a fall's lip, a lake's
  level). Section 9 has it.

**As built (step 5): the ladder** (`ladder.ts`, `info.premise.ladder`). Stage 4 runs after stage 3 and before the
settle, and reads out each work (its site's tiles, what it does, its level, its gain, its reach as runs, a note where
it falls short) and day 1's water and moist shares. It repairs and drops nothing yet: a work outside its `gives` is
said, not re-rolled. Where it differs from the above, and why:

- **Day 1 by number** is the land with every row of Blockages shut (a level of floor), every sill notch and breach
  shut to its crest (the lakes on their sills) and each depression's water a head of 0.1 over its spill, so its
  surface rounds up to the next level as the game's soil reads it. A work's water is `flowThrough` and
  `prefillFrom` on the floor with it and the works it `needs` done (cached by the set); a cleared link's held head
  (`designLevel` over its body's sill) comes down to the sill, since the pool stands up to 1.3 over its one outlet and
  the static model would hold it there. Settled against by number on seeds 1 to 3: the shares agree within 1.2
  points.
- **`estimateGain`** is the tiles newly moist or wet in the changed box ± 17, read ± 34: `soilReach`, a bucketed
  copy of the soil rule (costs × 100: 100 a step, 141 a diagonal, 600 a level climbed), equal to `sim/moisture.ts`
  tile for tile on clean water (`premiseMap.test.ts`). A breach's, raised sill's or megadam's gain is the water it
  holds (shut less open).
- **The works' own ground** (`layWorks`, before stage 3): each small levee's basin gets a beach at its sill + 1 within
  3 tiles of its water and a rim a level over it, but beside its spill bed, where the levee goes; stage 2's envelope
  otherwise let the beach meet a lower valley's floor and a levee flood 2000 tiles. Tarns' and basins' bowls are
  narrower (meadow 4, rim 6, crags of 2) and a brook's wet meadow 4, so a side body's green stays near it.
- **A notch is rows of Blockages** (`NOTCH_SHUT = "blockages"`); `"plug"` lays a one-level rock plug two tiles thick
  (its row and the band below) and the notch digs it: one switch, for D513 (3)'s answer.
- **Stage 0, for the ladder**: a tarn's dry bed goes to the farthest of its four nearest targets, not the nearest; a
  link's head keeps its mouth's width plus a tile from another channel's head (it was 3 tiles, which put a leat's head
  under the bypass's mouth); a raised sill goes on a fall whose upper lake has no other open link. **The start's
  meadow**: a frame candidate whose walk of 20 finds under 2.2 times the rules' level land, 3 tiles clear of every
  body, is passed over (`meadowRoom`), so the start no longer stands between its lake and the bay.
- **Measured** (seeds 1 to 12 at 128², `tools/premise-map.ts`): none falls to the themes (two did); day 1 water 20.2
  to 24.0 % and moist 35.9 to 45.2 % (spectrum 15 to 25 and 30 to 42: seven seeds over). By kind, the median gain and
  how many buy under 20 tiles: bypass 1217 (0 of 12), leat 445 (3 of 18), raised sill holds 717 (6 of 12), breach
  holds 642 (2 of 36), megadam holds 162 (plan asks 0.4 to 0.5 W²), notch 15 (12 of 22), dam to pond 0 (8 of 12),
  levee 0 (19 of 26). Stage 4 takes 62 to 135 ms at 128², 166 to 194 at 192², about 400 at 256² (section 3.3).
  Section 9 has what falls short.

**As built (step 6): life and resources** (`life.ts`, `info.premise.life`). Stage 5's build stops before the
resources (`stopBeforeResources`), stage 6 plants on its settled ground, and the map is built once more with the same
`SettleCache`: plants and mine sites move no water, so the second build costs no settle. Where it differs from the
above, and why:

- **The planting is the generator's own** (`gen/resources.ts` `planResources`: groves with clearings, berry patches,
  ruin fields by the scrap budget, the start's own wood and berries over its walk, D224's starting-logs floor), run
  with the premise's budget: Forests scaled so the living trees come to 450 to 700 per 10,000 tiles (the official
  baseline's place for the seed, read into that range), Berries to 185 to 230, and the share of moist ground under a
  tree held to 16 % (`ResourceConstraints.moistCover`; the themes keep `OFFICIAL_LAYOUT`'s). Its groves leave room
  for the start's planting, which plants less, so the living trees the budget still lacks are planted as more stands
  on the moist ground left, 9 tiles apart at least: birch within 3 tiles of water, pine 9 or more back, oak between,
  as the mix allows.
- **Stands, never trees spread evenly** (`groupGroves`): the generator's groves fill 52 % of their ground, which on a
  premise map's broad meadows read as single trees spread evenly over the green (seed 3); each living grove of 8
  trees or more is regrown from its tile nearest its middle as a close stand of its own count, 85 % of its ground
  under trees, on its own ground and the open ground of its kind round it. A grove the ground cuts short keeps its
  tiles. The themes' planting is untouched.
- **Nothing grows** on a work's site and a tile round it, on the ground only a work's water would turn green (its
  reach), in a dry bed or basin, or within a tile of the start's sight line to each lip tile of its landmark.
- **Dead woods**: a clump of 6 to 14 dead trees on each empty basin's old shore (1 to 4 tiles out, on dry ground),
  and beside each dry bed 15 tiles long or more (1 to 3 tiles out; the bypass one for each 60 tiles of it).
- **The benches over the lakes are dressed** (`benchesOver`, `LIFE.bench`): dry level ground 3 or more levels over a
  lake's sill within 10 tiles of it, 12 tiles or more together, is a place (§9's dry places); one stand on each, a
  bench for each 5,000 tiles of map at most, the one nearest the start first, so one is in the start's sight:
  succulents (6 to 12, from their share of the budget) where the palette has them, else a clump of dead wood. Never a
  carpet. The hollow behind the skyline is a place of its own, dressed first the same way (one stand, from the same
  budgets).
- **Succulents** otherwise only on the dry-for-good side: nearer the bypass than any lake, 3 tiles or more from it, no
  moisture, what is left of their share of the living budget by the species mix, in stands of 8 to 20.
- **Mine sites** are `planExtras`'s, kept off the works' sites, the beds and basins and the sight line; a site the
  colony cannot reach (`colonyReach`, the check's own reading) moves to level, dry ground beside the start's reach,
  30 tiles out or more, the farthest first. A lake stair's start often stands on a meadow walled by the stair's own
  steps, where the generator's picker, which wants a margin round each site, found no room (seeds 7 and 12).
- **The `LATER` warnings are lifted**: `start.food`, `start.wood`, `start.wood_floor` and `resources.mine_site` block
  on a premise map as on the themes'.
- **Measured** (seeds 1 to 12 at 128², `tools/premise-map.ts`, with #986's lakes that hold: ten a premise map, every
  blocking check passed; seeds 6 and 8 go to the themes after sixteen plans, on stage 1's `water.levels` and
  `water.falls`): living trees 477 to 653 per 10,000 tiles, 11.7 to 16.0 % of the moist ground under a tree; dead
  trees 27 to 52; succulents 45 to 66; berry bushes 186 to 227 per 10,000; 243 to 360 logs within 20 tiles' walk of
  the start (200 asked by `start.wood`; 250 by section 4.4's `wood`, one seed under), 272 to 453 within 40 (D224's
  178); 33 to 48 living bushes within 20 (30 asked); two mine sites reached on every map. Stage 6 takes 81 to 273 ms
  (section 3.3).

**As built (step 7): the works pay what they can** (stacked on step 6). The brief: each small work's gain within
its plan range, every seed a premise map, the megadam and the leats right. Where it differs from the above, and why:

- **Pool leats deliver.** A cleared row's head reads as its body's sill (`headOpen`), so a leat from the pool, whose
  water stands 1.12 over its sill since the neck carries the whole flow, runs; before, its head stood at 15 under a
  pool at 15.12 and every pool leat bought nothing.
- **Leats run along the contour** (`LEAT_RUN`, stage 0): a leat falls a level for each 20 tiles of it at the most.
  A pool's basin stands at the pool's sill - 1 less a level per 20 tiles of its leat (it stood 5 levels lower, a
  level every 4 to 7 tiles); a leat from a lake is drawn only where its fall keeps that slope.
- **Dry beds follow the land** (`raster/relief.ts` `followsLand`): a dry brook's bed, like the bypass's, runs two
  under the lowest land beside it and never rises, and its wadi strip goes down with it; the last 3 tiles meet its
  lake (`MOUTH`), so a lake no longer backs up a dry bed at its own level. Before, a dry bed stood on stage 1's
  straight-line levels, often on a dyke over the land beside it.
- **A notch's bed** goes to the point of a lower lake's or basin's shore whose run through ground dry on day 1 (by
  the plan: past each lake's meadow + 6, a wet tarn's 10, a wet channel's 8) comes nearest the notch's `gives` at
  `GREEN_A_TILE` a tile; a dam to pond stands in the middle of its bed's longest dry run.
- **A levee holds** (`bankBasin`, `leveeBand`): the beach's banks are raised where the basin's water would leave
  other than over the levee (by the beds that feed it, beside the spill bed, past the beach), and the levee spans the
  spill bed's first 1.5 tiles under the basin's sill + 1. Before, a levee flooded 1,300 to 3,000 tiles on some seeds.
- **The megadam's wall** runs square across the gorge from its slot, two tiles thick, out to the first ground at the
  next lake's sill on each side (`wallAcross`, within 48 tiles; a site with no shoulders there gets a note and no
  wall). Before, its band covered the gorge's bed alone and its water left round the band's ends. The plan's range
  is water, tile-levels as every reservoir work's (`held`), not a tile count: 0.44 times the map's tiles is the
  lowest lake raised a stair's step over its basin and the low meadows.
- **Measured** (seeds 1 to 12 at 128², each seed's first plan through stage 4): all twelve make a premise map
  through `tools/premise-map.ts` (none falls to the themes; seeds 2 and 8 take 10 and 7 plans), every blocking check
  passes, day 1 water 20.5 to 23.0 % and moist 32.7 to 40.5 %. In range of their plan's `gives`: notch 0 of 18
  (median 24), dam to pond 1 of 12 (median 42), levee 3 of 15 (median 57), leat 2 of 18 (median 381), sill notch
  holds 10 of 24, megadam 4 of 12 (median 5,743 against 6,554 to 8,192; it was 132 to 220). At 192² (seeds 1 to 3)
  water 16.6 to 18.7 % and moist 30.8 to 35.5 %; notch 1 of 10 (0 to 535), levee 1 of 6. At 256² no seed of 1 to 3
  makes a map, as before this step: day 1's water is 12 to 15 % and moist 20 to 33 %, under both floors (section
  9). A map takes 1.1 to 5.3 s at 128² (typical 1.3 to 1.7) and 4.2 to 5.4 s at 192², over the typical row (1.5 and
  3.7 s) where a plan fails after its settle; inside the worst row at 128², over it at 192².

**As built (step 8): the works sited by the land's day-1 moisture** (stacked on step 7, #997). The brief: site each
small work where its water reaches ground day 1 leaves dry, by the soil's own reading, and say estimate against
measure; size the lakes and tarns by the map so 256² makes a premise map. Where it differs from the above, and why:

- **Stage 0 draws twice** (`siting.ts`). The plan is drawn as before; then its skeleton (`skeletonOf`: the plan
  without its side network, every basin and non-rim tarn, their links, the rim tarns' dry beds and the works on
  them) goes through stages 1 and 2, `ladder.ts` `dayOneSoil` reads day 1's soil on that land (the ladder's own
  reading, every row and notch shut), and `siteSide` draws the side network again on it. Each empty basin is placed
  with its feed (a leat from the pool or a lake, or a rim tarn's notch), its spill, and the levee and dam on the
  spill as one chain; each rim tarn's notch bed goes to a lake two or more below, or feeds a chain, whichever comes
  nearer its range. A candidate is weighed by `SiteModel.gain`: `soilReach` on the skeleton's land with the work's
  water and the ground its template lays (a dry bed's valley at bed + 2, `followsLand`'s bed two under the lowest
  land within 3 tiles, a leat's meadow at bed + 1, a basin's beach at sill + 1 and crag), counting the tiles day 1
  leaves dry and the work's needs do not already reach. The estimate is kept on the work (`Work.estimate`).
- **No silent clamp** (D342): a small work whose best site misses its range is left out, the worst first, while the
  ladder keeps each kind, its count and its three near the start (a notch with the works that need it, its bed and
  the basin it alone fills); one that stays is said short. Each is a line in `plan.notes`, shown as
  `info.premise.notes`. A plan whose second pass finds no draw that passes every `plan` invariant (three draws)
  keeps the first pass's side network, and its notes say so and why.
- **The ranges are §4.2's at every size** (`givesOf`), not scaled by area: the soil's reach does not scale with the
  map, and scaled, a levee at 128² asked 116 to 151, under `spectrum`'s 250 a small work. A small work's top is
  capped at 3 % of the map (`ladder.plan`): the notch's 430 to 570 is 430 to 491 at 128². Counts still scale by
  area. This is a judgment, not a ruling; section 9 has what it leaves.
- **What the second pass needed**: a leat's or brook's head keeps `LIP_ROOM` (3) further from a fall's head out of
  the same body (a fall's lip and piers take every tile within 2 of it: the landmark's pier cut seed 11's pool leat
  off its pool); a pool basin is drawn every other try out from a clear stretch of the pool's outline, and the first
  pass's pool chains are candidates too; a basin keeps 5 from a lake (8 left no room by the top lake: day 1's soil
  now says what is green); a dam is tried at eight places along its bed at most, a basin at one sill; the ladder
  places a dam within 2 tiles of where the plan sited it (`DAM_REACH`, 6 before).
- **Past 192² the lakes and tarns are sized by the map** (`mapScale`, `rimTarns`): from 192² to 256² a lake's middle
  radii, its side arms' length and tips and their most (5 to 7), and every tarn's radius grow to √2 times, the lakes'
  ends and spans as at 192² (so the layout fits as it did); the rim tarns are two at 128², six at 192², ten at 256²,
  the ones past two placed after the pool's basins where the rim has room. A lake's shore grows with the side and
  the map with its square: past the lakes' radii, the rim tarns' springs and runs are what bring day 1's moist
  ground up to `spectrum`'s floor (at 256², lakes 13.5 % moist against 20 % at 128²; rims and runs 4 to 6 points
  more). Before, 256² made no map on seeds 1 to 3; 192² and 128² keep their radii.
- **Measured** (seeds 1 to 12 at 128², each through stages 0 to 4 and its spectrum; `tools/premise-map.ts` for the
  pictures): all twelve make a premise map, six with their side network sited by moisture and six keeping the first
  pass's (no pool basin with a clear leat; the count of 3 to 4 with three near the start; a kind missing). Day 1
  water 20.3 to 24.7 % and moist 31.8 to 39.8 %. In range of their plan's `gives` on the twelve maps: 8 of 65 small
  works and leats (step 7 on the same seeds: 6 of 63); on the six sited maps 4 of 33 (leat 3 of 11, levee 1 of 7,
  notch 0 of 8, dam to pond 0 of 7). The estimate comes within a quarter of the measure (or 25 tiles under 100) on
  12 of the 33. The mean measured green rose: notch 91 to 125, leat 480 to 583, levee 151 to 229, dam to pond 67 to
  83. At 192² seeds 1 to 3 make maps (water 16.5 to 18.0 %, moist 30.9 to 34.4 %), at 256² seeds 1 to 3 too (19.8 to
  21.7 %, 30.4 to 34.3 %; seed 1 on its fifteenth plan). The second pass costs 100 to 625 ms at 128² (the skeleton's
  stages 1 and 2 about half, the estimates the rest) and 0.4 to 1.6 s at 256², against stage 0's 5 and 10 ms
  (section 3.3).

**As built (the works round, after step 8 and the look round):** the brief: a work's range becomes a floor, most works
at or over it; every seed sited by moisture; a narrows for the dam to pond; the second pass faster; a refused theme ×
premise pair made with the theme's own settings; and (planning, mid-round) the bypass off its ring.

- **Floors** (§4.2's ruling): `givesOf` gives a floor and a most; the siting lays a work that reaches its floor and
  keeps the best short of it only where the ladder's kinds, count or three near the start need it, said short in the
  notes; the ladder's `WorkSite.paid` says which reached it. A repair pass swaps a short candidate in for the least
  worth of the removable levees and dams where that brings the ladder whole.
- **The narrows** (`ladder.ts` `NARROWS`, `narrowsFit`): a dam to pond lays a pan at bed + 2 behind the dam, up to 8
  tiles each side and 15 back (shortened two at a time to 5 where other water, the start or ground stage 1 fixed
  stands in the way), under
  rims and shoulders at bed + 3 and the bench cut to bed + 2 six tiles round; the dam stands 6 tiles or more below its
  bed's head, so its pond never reaches the body the bed leaves (`POND_REACH` is the pan's reach). The siting weighs
  the same narrows the ladder lays.
- **The siting's ground**: a side body is weighed only where half its ring 3 to 12 tiles out is dry on day 1
  (`DRY_RING`, `DRY_LEAST`); a pool basin may go without a spill and the first pass's chains are candidates; each rim
  tarn's beds are weighed to the four best and the two nearest the start; the last resorts stand as near as any two
  bodies may.
- **The bypass** has a course of its own (§4.1), not a ring.
- **The fall-back** to the themes takes the theme's own settings (§1.5, `themeOwnSettings`).
- **The bypass's edge band grows with the side past 128²** (graded in from 14 tiles at 128², 28 at 256²): at 256²
  it ran along the rim tarns' band, and seed 3's plans fell under `spectrum`'s 30 % moist floor (27.4 to 29.6 %).
- **Measured** (seeds 1 to 12 at 128², seeds 1 to 3 at 192² and 256², with the height round merged): all twelve make
  a premise map at 128², seven sited by moisture and five keeping the first pass's network (four short of three small
  works near the start, one with no pool basin whose leat clears); day 1 water 19.4 to 23.5 % and moist 30.6 to
  40.9 %. At or over their floor on the seven sited maps: notch 1 of 7, dam to pond 3 of 8, levee 1 of 9, leat 1 of
  16; on the five others notch 0 of 5, dam 1 of 6, levee 2 of 9, leat 3 of 9. The mean measured green over the twelve:
  notch 164, dam to pond 233, levee 144, leat 440 (against floors of 430, 270, 260 and 1,000). At 192² seeds 1 to 3
  are sited (notch 5 of 8, levee 3 of 9, dam 2 of 7, leat 0 of 7 at their floor), moist 31.2 to 32.0 %; at 256² seeds
  1 to 3 make maps, sited, moist 30.5 to 31.8 % (seed 3 on its third plan). Section 9 has what stays short.

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
| *2, measured at the hold* | *65 to 107 ms (worst 306)* | | *257 to 298 ms (worst 517)* |
| 3 Start and frame | 5 ms | 5 ms | 5 ms |
| 4 Ladder (10 to 16 window estimates) | 30 ms | 60 ms | 100 ms |
| **Land shown** | **0.2 s** | **0.4 s** | **0.6 s** |
| 5 The settle and its tests | 0.6 s | 1.8 s | 3.0 s |
| 6–7 Life, resources, set pieces (one more build without a settle) | 0.2 s | 0.4 s | 0.7 s |
| 8 Checks, name, file | 0.5 s | 1.1 s | 1.9 s |
| **Map ready, typical** | **1.5 s** | **3.7 s** | **6.2 s** |
| With one repair settle (the worst accepted) | 2.3 s | 5.9 s | 9.9 s |

A plan that fails before the settle costs the land's row again. Anything over the last row is a bug (D453).

Stages 6–7 as built (step 6, seeds 1 to 12 at 128², life only: the planting and the second build, its settle
reused): 81 to 273 ms, a median of about 130, against the row's 0.2 s; the first map a process makes pays about 0.1 s
more for loading. A whole map takes 1.6 to 5.3 s at 128² through the mode, most of it plans that fail before or after
their settle (a second or third settle on five maps of ten).

Stage 4 as built (step 5, seeds 1 to 4): 62 to 135 ms at 128², 166 to 194 at 192², 396 to 438 at 256², three to four
times its row: each work's water is a whole-map `flowThrough` and pre-fill (about 13 ms at 256²), 10 to 16 of them.
Bounding each to the work's catchment would answer it.

Stage 0's second pass as built (step 8, seeds 1 to 12 at 128², seeds 1 to 3 at 192² and 256²): 100 to 625 ms at
128², 0.3 to 0.8 s at 192², 0.4 to 1.6 s at 256², against stage 0's 5, 5 and 10 ms (the works round, weighing a
narrows and more beds: 170 to 1,160 ms at 128², 0.6 to 1.3 s at 192², 1.0 to 2.9 s at 256², not yet cut): the skeleton's stages 1 and 2
(about 100 to 350 ms at 128², 0.7 s at 256²) and some 80 to 600 soil estimates on boxes round each candidate.
Reusing the skeleton's land for the plan's own stage 2 where the side network leaves it, and estimating on a coarser
box first, would answer most of it.

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

At step 4 (seeds 1 to 60, the least of three runs each, the machine shared) a plan takes 16.0, 5.7 and 8.0 ms on
average (median 10.6, 4.7 and 6.9; worst 68, 20 and 27), from 40, 18 and 31 before the step: **within its row at
256², just over at 192², three times it at 128²**, where a plan still draws about 7 layouts (the frame, the pool's
basins, a work of the small kind, the bypass, all structural). What took it there, none of it changing a plan: gaps
measured with a bound (a pair of bodies or paths farther than the gap asked is not measured to the tile), bodies'
boxes and outlines cached, the start's 5 × 5 judged dry before its frame, the pure checks after the last draw; and
one that does change plans: a layout that fails after its stair and frame draws only its tail again (twice, from the
same stair), and the frame keeps its first candidate that holds. What is left at 128²: fewer failing layouts, by
drawing the pool's basins and the small work where the plan has room for them.

The map, through the mode (step 4, `tools/premise-map.ts`): 1.4 to 2.6 s at 128² (seeds 1 to 12), 2.9 to 4.6 s at
192² (seeds 1 to 4) and 7.3 to 9.0 s at 256² (seeds 1, 2 and 4); 14.5 s at 256² on seed 3, where three plans failed
stage 3 before the settle, since a re-roll there costs the relief (1.3 to 2.1 s at 256² against its 250 ms), so `reliefBetween`
is what to make fast next (section 9).

As measured after the speed step (the floor's plans, `generatePremise` as the tool times it, single-threaded under
`tsx`; seeds 1 to 12 at 128², the least of two runs; seeds 1 to 3 at 256²; every map's bytes unchanged): **2.4 s at
the median and 4.4 s at the worst at 128²** (from 3.2 and 7.5), **10.0 and 16.9 s at 256²** (from 14.5 and 24.3).
By stage, median and worst at 128²: the plans 328 and 988 ms (from 543 and 1,699), the siting 368 and 1,114 (from 767
and 2,506), the relief 60 and 142 (from 259 and 1,045); at 256² the siting 1.9 and 3.4 s (from 5.3 and 8.3), the
relief 0.33 and 0.96 s (from 1.4 and 2.9). What took it there: the relief's noise fields shared by seed and size and
its ridges, cones and bowls bounded by box; the soil rule and the narrows read within the network's box; the bypass's
course grid kept for a layout's tail drawn again; the siting's gain read from the skeleton's land row by row. What is
left is the map itself, unchanged: the settle (about 0.63 s at 128², 4.9 s at 256² on one thread; the page settles
on its workers), the checks, life and the file make about 0.95 s at 128² and 6.2 s at 256², and a second settle on
three maps of twelve (a `resources.mine_site` or `start.wood` failure after it). So the rows' 1.5 s and 6.2 s are out
of reach by speed alone at 128² while plans that fail cost what they do (draws of 48 layouts that all fail, on seven
maps of twelve), and at 256² while the tool settles on one thread.

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
| Lake size | Arms of radius 7 to 15; 2 to 5 arms; a cove, a bay behind a peninsula; an island or two. Past 192² the middles' radii, the side arms and their most grow to √2 times by 256² (radius to 21, 7 arms; step 8) | Seed, Variety, Size |
| Meadow | 12, 15 or 18 wide, ± 3 by noise | Buildable land |
| Stair falls | Height `f`; lip 8 to 16 wide by flow; a horseshoe lip; a notch of one tile on every sill but the lowest | Flow |
| The springs | One pool at the top water's level, 3 to 5 sources; total strength 10 (trickle), 14 (normal), 18 (strong), 22 (lush) | River flow |
| The landmark | A fall of `H` = 6, 7 or 8 levels from a **hanging valley** (20 to 40 tiles long, bed level = the foot lake's sill + H) into the start's lake; a lip of 10 to 14 tiles in unequal runs; fed from the springs' pool or from a lake `H` or more above | Seed; section 4.3 |
| The start's lake | The lowest or the second lowest | Seed |
| The start | On a bench one level over its lake's sill, 5.5 to 7 tiles in front of the lip; bench 580 to 980 level tiles | The frame |
| The bypass | A dry channel from the springs' pool on a course of its own over the land, out on the far side from the start, to an edge or to the gorge below the lowest sill; 250 to 330 tiles long at 192²; mouth 10 wide; 3 rows of Blockages (the first at the mouth) | Seed: its course, which exit |
| Gates | 3 or 4 sites, each a channel 1 to 5 wide: the neck to the top lake, the hanging valley, each leat's head | By the graph |
| Side bodies | Tarns: 3 at 128², 7 at 192², 12 at 256²; rim tarns with their own springs (0.8 to 1.5): two at 128², up to six at 192² and ten at 256² where the rim has room (step 8) | Size, Variety |
| Living brooks on day 1 | One each side, each from a spring tarn to a map edge | Rivers |
| The megadam's site | A slot 5 to 6 tiles long through the ridge below the lowest lake, walls 6 or more over its bed | Fixed kind, drawn place |
| The skyline | One ridge behind the top lake, to `top` or to 21 on a tall map (`sky`), a hollow behind it where it fits | Verticality |
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
  `BED_FLOOR` (3; the lowest lake two deep), so `5 + (n − 1) f + 2 ≤ top`; `BED_FLOOR` + 3 (6) where the lowest lake
  is the start's and the stair still fits (`stairBase`, section 2.2 "As built (the hold)"). Where only one `f` fits `n`
  lakes, `n − 1` is offered too, and `n` is drawn once a layout attempt, so plans keep their variety.
- The neck is 5 tiles wide, as the landmark's valley: the split at the pool is even, 7 and 7.
- The start's lake has a bay under the landmark, on the far side of the lip from the start: the fall's foot opens to
  the lake there while the start's 5 × 5 stays dry. The lip is square to the camera's look, between the start's lake
  and the source.
- Bodies stand 3 tiles or more apart (outline to outline): a stair fall's rock sill is the ground between two lakes.
  A lake's arms are 2 to 5, each 7 to 15 at its widest (a bay or cove narrows to its end).
- The gates are 3 or 4: where the landmark does not leave the pool, the plan adds an empty basin fed by a leat from
  the pool, each leat gated at its head.
- Side bodies (step 6): only the two **rim tarns** carry springs, each drawn in the band 11 tiles or less from an
  edge, so its run to the edge is short; the rest are **empty basins**, standing past the nearest lake's meadow (its
  width from the lake) or 6 tiles from it for the pool's basins. At step 5 every side body but the pool's basins had
  a spring: a spring tarn's green and its run's were 3 to 5 points of the map's moist ground each, seven seeds of
  twelve over `spectrum`'s 42 %. Over 128² the first near body and two in five of the rest are still spring tarns
  where their runs find an edge (empty basins alone left a third of the 256² layouts short of small works). The
  lakes' meadows are four fifths of the table's at 128² (`stairMeadow`), the whole at 192² and over. A notch's dry
  bed is 20 tiles or more at every size. The bypass keeps 5 tiles beyond its half from what it passes (4 left a
  lake's shore two tiles thick over its bed, a dam wall). A plan whose day 1 by number is outside `spectrum` (moist
  over 41 %, a point under the settled ceiling) is drawn again before its settle (`ladder.spectrum`).
- Side bodies are spring tarns and empty basins, about the table's counts (3 to 5 at 128², 5 to 9 at 192², 7 to 13
  at 256² on seeds 1 to 30): three near the start first, so its walk has three small works; a basin nothing can fill
  is left out. A basin spills to a lake two or more below, else to a lower side body, else off the map. A dam to
  pond needs a dry bed 12 tiles long or more. Kettles are not drawn yet.
- The bypass has a course of its own (`bypassCourses`, the works round): from a straight lead 8 tiles out of the pool,
  the cheapest way over a 2-tile grid to a turning point, then on to an edge or the gorge below the megadam's slot,
  each cell costing more over the seed's 24 soft rises (less in its hollows), near the map's edge (graded in from
  14 tiles at 128², by the side past it; none nearer than 4 but where it leaves) and over the start's ground (none within 26 tiles of the start; its
  turning point among the farthest from the start, so it runs on the dry side and leaves the start's walk to the
  small works), then wound in bends of 28 to 46 tiles where its room lets it. Before, it ran round a ring 5 to 7
  tiles in from the edge, which read as a band parallel to the border on every map (planning, 2026-11-11). A course
  turning anywhere left three layouts in four short of three works near the start; turning far, a layout makes a
  plan about as often as the ring did (108 plans of 192 draws at 128², against 105).
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
| Small | Notch | Clears a row of 3 or 4 Blockages | A spring tarn's **second** outlet, the row below the tarn's outline and spanning the bed; a dry bed two deep to a lake | 430 or more (most 570) |
| Small | Dam to pond | A dam of about 5 tiles, one level | A narrows in a dry bed two deep (`NARROWS`): a pan at bed + 2 up to 8 tiles each side and 15 back up the bed (5 at the least), under rims and shoulders at bed + 3, the bench round it cut to bed + 2 six tiles out; the dam 6 or more below the bed's head | 270 or more (most 470) |
| Small | Levee | About 8 tiles at a basin's spill point | A basin with a beach at its sill + 1 and a rim over the beach | 260 or more (most 340) |
| Medium | Leat | Clears 3 Blockages at a leat's head (and gates it for the badtide) | A leat one tile wide from gated water to a chain: a basin, its brook | 1,000 or more (most 1,500) |
| Medium | Raised sill | 11 to 17 tiles on a stair fall's lip | Rock shoulders two over the crest | 600 to 1,400 of water a lake |
| Large | Bypass | Clears 3 rows (16, 6, 8 tiles), builds 3 or 4 gates | Section 4.1 | The premise's answer; about 1,100 to 1,500 tiles along it |
| Large | Megadam | 5 or 6 long, to the next sill's level | The slot | Water of about 0.44 × the map's tile count (16,241 at 192²) |

**A work's gain is a floor, not a band** (the milestone's ruling within D508, 2026-11-11): the low end of the old
range, never under `spectrum`'s 250 for a small work; paying more is fine. What the ladder promises a player is "this
work is worth building", not a tile count, and a band narrower than the siting can tell sites apart by (± 7 to 13 %)
left most works outside it whichever side they missed. The most is the old top, what the siting aims under so the
works together stay inside `spectrum`. A work's `WorkSite.paid` says it reached its floor; one that did not says so
in its note, with stage 0's estimate beside the measure. Counts scale with the map's area over 192²'s; the gains are
the same at every size, a small work's most capped at 3 % of the map (step 8: the soil's reach does not grow with the
map). Stage 0's second pass sites each one by day 1's soil
(section 2.2, "As built (step 8)"). The seed draws which kinds stand where. The **small irrigation works**
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
  three levels deep is near black. The turn of the face does not change the curtain's light; depth does. As built
  the shelf stands 0.28 to 0.40 deep; a ribbon a tile or two wide, 2.3 deep, runs through the bay for the start's pump.

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
| `drought.lakes` | settled (storage) | Through the difficulty's longest drought each lake keeps half its water or more at its worst day (it drops a level, it does not empty); the lowest lake, when the start's, 28 % or more (section 9). Held by `premiseMap.test.ts` on seed 1; not yet a stage check |
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
  in its gate. Edges: the wall's ends run off the map; the basin falls away. The wall is an escarpment: the valley's
  own high ground ending in a cliff that wanders, many tiles thick, never a thin straight ridge across a valley,
  which is what `terrain.dam_wall` blocks (D111, read as D512 reads it).
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
| 3 | **Built.** **Relief between**, and `tools/premise-map.ts`, which writes a `.timber` for a seed outside the product | A whole land with water to open in the editor and run through the capture kit; tier 4 judging can begin | 2. Ground with grade for the outlands (`gradeLevels`, generator 0.10.16); not blocked |
| 4 | **Built.** **The generator's mode.** `generatePremise` behind `spec.premise` (link key `p=lakeStair`; no control on the page), stages 3, 5 and 8: the start by the frame, one build, the checks, re-roll and the fall-back to themes; `premiseMap.test.ts`; stage 0 within its row of §3.3 | A playable generated lake stair from a link, in seconds, without plants | 3 |
| 5 | **Built.** **The ladder.** Dry bodies and beds, rows of Blockages, the work templates, `estimateGain`, `info.premise` | The spectrum: a map that is not fully watered, with each work's gain known | 4 |
| 6 | **Built.** **Life and resources by budget**, the dry land's dress | The map looks as it plays: stands, open meadow, dead woods on old shores | 5 |
| 7 | **Set pieces and secrets**: the ruined weir and its breach, piers at the works, the Still Pool, aquifers and drill, relics, then the cave | The first frame's story; the first two works | 6; new `MapObjectKind`s |
| 8 | **The proofs and the judging tools**: background proof rows, `tools/premise-batch.ts`, tiers 1 to 4 run and recorded | The premise proved true on every map a player opens | 7. The first ten cycles (#927, in work) for the cycles' proof; not blocked |
| 9 | **Core built** (theme × premise as two choices, the style seam, the pair refusals, the settings' mapping of section 1.3 complete, the card's words; section 1.5). **On the page**: the two pickers beside Generate, each with Any; the settings greyed by `premiseSettings`; the map card from `info.premise.card` | Players get it | 8 passed; the page session |
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

9. **Blockages are the cheapest rung** (D513 (3), answered from the game's data, 2026-11-10). A player clears a
   Blockage with the ordinary Demolish tool, with no science and no unlock: one beaver for 4.0 working hours, so a
   day-1 colony can do it once a district path comes within reach (under 10 tiles Chebyshev, under 20 steps). The
   ladder keeps `NOTCH_SHUT = "blockages"`; the rock plug stays a switch, unused.

### Still open

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
  a 128² map. The hold's plates left them where they were (39 to 44 %, 53 to 56 %): the meadows, not the uplands,
  hold the commonest levels. Narrower meadows at 128² (the plan's), or meadows that rise a level past the soil's reach of 9, would
  answer the first; crags of one and two more often the second. Judged in the game first.
- **Level land near the start (found at step 4): answered at step 5** by the start's meadow (section 2.2, "As built
  (step 5)"); seeds 1 to 12 at 128² all make a premise map.
- **Day 1 inside the moist ceiling: answered at step 6** (section 4.1, "As built (step 1)", its side bodies): the
  ten maps seeds 1 to 12 make at 128² settle at 19.6 to 23.5 % water and 37.1 to 40.7 % moist, every one inside
  `spectrum` (with #986's lakes alone, seven of eleven stood over 42 %). Seeds 6 and 8 go to the themes on stage 1's
  `water.levels` and `water.falls` after sixteen plans.
- **The small works pay little (found at step 5; step 8 sites them by day 1's soil; the works round rules ranges
  floors, not answered):** a work's range is a floor now (§4.2, the milestone's ruling within D508), but on the seven
  maps of twelve sited by moisture at 128² 5 of 24 small works reach theirs, and one leat (section 2.2, "As built (the
  works round)"). What stands in the way: (1) a brook or bed already reaches 12 to 18 tiles of soil each side, so a
  work's water adds only what lies past that: a dam's pond adds 150 to 250 over its bed's thread even on a narrows,
  a levee's raised basin less; (2) the start stands by a lake whose meadow and green take most of its walk, so the
  three works near it are laid short of their floors where they stand at all (four of the five maps that keep the
  first pass's network find two near the start); (3) the estimate comes within a quarter of the measure on about a
  third of the works (the skeleton is not the land the side network's own relief makes). A leat's floor of 1,000 is
  §4.2's from Four Lakes at 192²: at 128² a leat's chain measures 440 at the mean. Whether the leat's floor scales
  with the map, and whether a work short of its floor is better left out than laid, are planning's.
- **256² makes a premise map (found at step 7; answered at step 8)**: seeds 1 to 3 at 256² make maps, day 1 water
  19.8 to 21.7 % and moist 30.4 to 34.3 %, by the lakes' middles and arms grown to √2 times and ten rim tarns
  (section 2.2, "As built (step 8)"). It is close to the floor: seed 1 takes fifteen plans, most failing `spectrum`'s
  moist floor or the layout, and the second pass costs up to 1.6 s.
- **From the look (planning, 2026-11-11), taken in the look round:** the rim's plates fall toward an edge a plate at
  a time (the band along the edge was a tile's distance), an empty basin's bank stands whole over a broad bench (the
  half-step rings curled round seed 2's west basin), the themes' uplands take their forms (§1.5), the rim tarns'
  runs bend and slide along the edge and the further rim tarns spread round the edges (§2.2's wander), the
  generator's groves are drawn together into stands, and the benches over the lakes are dressed, the one nearest the
  start first. The bypass's ring is answered in the works round (§4.1, a course of its own). **Taken in the height
  round (2026-11-11):** an empty basin's bed is a dry floor
  crossed by its old river's line and its beach wanders (no stepped rings); the hollow behind the skyline is shaped
  by stage 2 and dressed as a place of its own (on 3 of the first 8 seeds at 128²: the skyline often stands by the
  map's edge or the rim tarns, and then no hollow fits); the themes take the height to 22 (§1.5). **Still open after
  it:** theme Any makes 11 of 12 at 128² (seed 5: two settles leave the start's walk short of two mine sites 30
  tiles out, and the uplands' height moves attempt 11's siting); at 256² seed 1 River Valley, Highlands and Lake Basin
  make maps, Canyon falls back (its plans fall under `spectrum`'s 30 % moist floor, 27.8 to 29.9 %, and one settle
  has 22 berry bushes in the start's walk against 30); the skyline on most seeds is a short lump by the edge; the
  benches over the lakes are dressed, not shaped.
- **The megadam holds 4 of 12 in range at 128²** (median 5,743, against 6,554 to 8,192): one seed's wall finds no
  shoulders within 48 tiles at the next lake's sill; on the rest the sea leaves by a lower outlet of the basin (a
  spring tarn's run to the map's edge, which the raised lake floods). Its level should be the lower of the next
  lake's sill and the basin's lowest other outlet, with that outlet's own dam a part of the work.
- **The Still Pool** waits for its set piece (build step 7): the first levee has no site.
- **Stage 0 over its row at 128² (found at step 4)**: 16 ms a plan on average (worst 68) against 5; section 3.3 has
  the measures and what is left to cut.
- **Relief over its row (found at step 4): answered at the hold**: `reliefBetween` took 280 to 580 ms at 128² against
  60 and 1.3 to 2.1 s at 256² against 250. Each bowl's distance now runs on its own box and the noise fields are read
  once, coarse and shared: 65 to 107 ms at 128² (worst 306) and 257 to 298 ms at 256² (section 2.2, "As built (the
  hold)"). 128² is still about 1.5 times its row.
- **The start's lake's hold (found at the hold)**: where the lowest lake is the start's, its ruined weir's breach sinks
  it a level in a drought and it keeps 31 to 34 % of its water at the worst day on a floor three deep (13 to 15 %
  on two, where four lakes a step of 3 leave no room under 16). The start's water still lasts the drought (the
  ribbon), and mending the breach is the first work, so a player who mends it keeps the lake; a floor under
  `BED_FLOOR` for this lake (against D325) would answer the rest.
- **Leats step a level every 2 or 3 tiles** where stage 0 gives a short leat a fall of 4 or 5 (13 to 9): its terrace
  follows it as treads. Stage 0 drawing leats along the contour, falling a level per 20 tiles or more, would answer it.

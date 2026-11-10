# premise

Maps from a premise (docs/PREMISES.md): a problem the player solves, with the water that makes it true. Build steps 1
and 2 are here: the model, the lake stair's plan (stage 0) and its `plan` invariants; the water by number (stage 1)
and its `land` invariants. Nothing here makes the land between the waters yet, and the generator does not call it (no
`GENERATOR_VERSION` change).

**Rules**
- A plan is plain JSON (`types.ts`), drawn from the spec and an attempt alone, from the named stream `premise.plan`
  (`draw.ts` `premiseStream`): integer or portable maths only (D366), since later stages build maps from it.
- Every invariant says why it fails in one line. A plan that fails a `plan` invariant is drawn again, up to
  `PLAN_TRIES` attempts; a spec the premise refuses (`eligible`) or cannot plan goes to the themes, so every setting
  still makes a map (D471).
- The seed varies structure first (§4.4): n and f, the valley's line, the start's lake, the landmark's source, the
  bypass's exit, the works; then outlines and names.

**Start from**
- `types.ts`: `PremisePlan` and its parts, `PremiseDef`, `Invariant`. Its fields beyond PREMISES §1.1 are listed
  there (§1.1, "As built").
- `draw.ts`: `drawPlan` (one attempt, checked), `firstPlan` (the first that holds), `firstWater` (the first whose
  stage 1 water holds too), `failing`.
- `frame.ts`: the first frame's arithmetic from `analysis/opening.ts`'s camera (§4.3): `frameLimit(z, h)`, how far in
  front of a start a point at height `h` stays under the frame's top edge; `lipInFrame` reads a lip through the
  opening camera.
- `premises/lakeStair.ts`: the lake stair (§4): `lakeStairEligible`, the layout (the valley, the lakes on it, the
  start, its frame and the landmark placed together, the bypass, the tarns and basins, the works, the ridges, the
  regions) and the stair's `plan` invariants. `layoutTry` gives one layout try as far as it got, for tuning.
- `planChecks.ts`: §1.4's checks every premise shares (levels fit, bodies apart, the graph closes, the works add up,
  the skeleton is whole).
- `geom.ts`: capsule chains, paths and gaps. `diagram.ts`: the water-story diagram (`planSvg`, `planRaster`).
- `levels.ts`: the water table (§2.2, stage 1): each body's level and each link's flow, width and depth, from the
  sources down the graph, and the fitted constants `WATER`.
- `water.ts` `waterByNumber`: stage 1, the plan's water as heights and masks (`raster/field.ts` `WaterRaster`): the
  bodies' beds (`raster/bodies.ts`), the channels (`raster/channels.ts`), the falls' crests, lips and pools
  (`raster/falls.ts`), the guard and where two waters may touch (`raster/guard.ts`), the rows of Blockages.
  `stageModel` is its water model for a settle.
- `waterChecks.ts`: the `land` invariants, `flowThrough` on stage 1's heights alone (`stageFlow`, once per stage 1).
- `tools/premise-plan.ts` prints a seed's plan and writes its diagram; `--plan` checks and draws a plan file.
  `tools/premise-water.ts` prints its water table and `land` result and draws its heights and water.

**Tests**: `tests/contract/premisePlan.test.ts` (quick: the frame's arithmetic, eligibility, 18 plans, variety,
a broken plan for every `plan` invariant, the Four Lakes fixture `tests/fixtures/four-lakes.plan.json`);
`premisePlan.heavy.test.ts` (seeds 1 to 200 at 128², 192² and 256²: every plan holds, 12 to 32 ms a plan on average;
PREMISES §3.3 has the numbers against the budget); `premiseWater.test.ts` (quick: the table's arithmetic, the lip's
stair, the `land` invariants on seeds 1 to 4 at each size and Four Lakes, a broken raster for each); and
`premiseWater.heavy.test.ts` (seed 1 at each size and Four Lakes settled as the game plays them: levels against the
table, no stray water, each fall's curtain by the fall judge).

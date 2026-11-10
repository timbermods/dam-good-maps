# premise

Maps from a premise (docs/PREMISES.md): a problem the player solves, with the water that makes it true. Build step 1
is here: the model, the lake stair's plan (stage 0) and its `plan` invariants. Nothing here makes land yet, and the
generator does not call it (no `GENERATOR_VERSION` change).

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
- `draw.ts`: `drawPlan` (one attempt, checked), `firstPlan` (the first that holds), `failing`.
- `frame.ts`: the first frame's arithmetic from `analysis/opening.ts`'s camera (§4.3): `frameLimit(z, h)`, how far in
  front of a start a point at height `h` stays under the frame's top edge; `lipInFrame` reads a lip through the
  opening camera.
- `premises/lakeStair.ts`: the lake stair (§4): `lakeStairEligible`, the layout (the valley, the lakes on it, the
  start, its frame and the landmark placed together, the bypass, the tarns and basins, the works, the ridges, the
  regions) and the stair's `plan` invariants. `layoutTry` gives one layout try as far as it got, for tuning.
- `planChecks.ts`: §1.4's checks every premise shares (levels fit, bodies apart, the graph closes, the works add up,
  the skeleton is whole).
- `geom.ts`: capsule chains, paths and gaps. `diagram.ts`: the water-story diagram (`planSvg`, `planRaster`).
- `tools/premise-plan.ts` prints a seed's plan and writes its diagram; `--plan` checks and draws a plan file.

**Tests**: `tests/contract/premisePlan.test.ts` (quick: the frame's arithmetic, eligibility, 18 plans, variety,
a broken plan for every `plan` invariant, the Four Lakes fixture `tests/fixtures/four-lakes.plan.json`);
`premisePlan.heavy.test.ts` (seeds 1 to 200 at 128², 192² and 256²: every plan holds, 12 to 32 ms a plan on average;
PREMISES §3.3 has the numbers against the budget).

# Parity with Timberborn's map editor (D337, D338, D339)

Branch `feature/parity`, made from `feature/select-shelf-2`; the draft PR goes into `feature/forces`. Built by `build-light`
(Sonnet 5.5) on 2026-09-29, from the spec in PLAN §20 D337 (fluids), D338 (objects, ruins, natural resources) and D339
(Unstable Cores), under D342 (operations, a headless core, plain questions, reasons, contract tests).

## What was built

- **The game's values, pinned.** [`src/core/data/parity-values.json`](../../src/core/data/parity-values.json) holds what the installed game's
  blueprints say (1.1.2.4), regenerated and checked by `npx tsx tools/export-parity.ts [--write|--check]` (read only from
  `Modding\Blueprints.zip` and `Localizations.zip`; nothing is copied into the repository). `src/core/data/parity.ts` reads it.
  - Water objects: WaterSource 1x1 (default 1), BadwaterSource 3x3 (3), Water and Badwater Seep 2x2 (default 1, depth limit 0.8,
    back on at 0.9 of it), Aquifer 3x3 and Ancient Aquifer Drill 3x3x5 (the drill stands on an aquifer), Badtide Drain **1 x 3**
    (one emitting tile, strength 1, badwater, active only in a badtide). A strength is at most **8 for each emitting tile**
    (WaterStrength `MaxWaterSourceStrength`): 8 for a source, 32 for a seep, 72 for a badwater source. Never clamped.
  - Start delay (`TimedComponentActivatorSpec`): default 5 cycles and 10 days, cycles from 1, days from 0, "At once" by default.
  - Unstable Core: radius 0 to 5 (default 5), `InnerRadius` 1, countdown 5 cycles and 10.5 days.
  - Reserves: pile 160 pileable, warehouse 200 boxed, tank 300 liquid; the goods each kind may hold, and the good a new one
    holds (the first of its type in the game's list: dirt, berries, badwater), filled to capacity.
- **Water objects** on the shelf: Water seep, Badwater seep, Aquifer, Aquifer drill, Badtide drain, with a strength slider up to
  the object's ceiling, More (Sink, Starts: At once or from cycle N and D days), and the game's defaults. Written as the official
  maps store them (`TimeActivatedComponent`, `WaterSource` before `BlockObject` except for an aquifer, `CurrentStrength` 0 while
  delayed). The water model handles a negative strength as a sink (`sim/water.ts`: drains and floors at 0; the contamination
  follows the game's formula), seeps switching off above 0.8 and on again below 0.72, and delayed sources.
- **The Unstable Core** and **the blast rule** (below), the **Show after it goes off** view, and **the reserves** (`FixedStockpile`
  with `SingleGoodAllower` and the inventory as the official maps store it), each with its options row once selected, Remove, and
  a Markers label ("Reserve pile · 100 Log", "Unstable core · radius 3 · goes off in cycle 5", "Water seep · 1 water/s").
- **Brushes** (`core/gen/paint.ts`, `core/doc/paint*.ts`, `editor/paintGhost.ts`): Pine, Birch, Oak, Berry bush, **Succulent**,
  **Mixed woods**, **Ruin** and **Thorns** have Size (the terrain brushes' slider, F, [ and ], the ring on the ground), Density
  and Age (Grown or Mixed); the ground shows the stroke's plan before the button comes up, amber where the ground will kill what
  is planted; the stroke is one undo step (the `paintObjects` operation, planned on the map as it stands, logged as literal
  `placeEntity` operations, D342); a quick click places exactly one at any size. Ruin fields are grown as the generator grows them;
  thorn patches are shaped as the official maps' (measured: [FINDINGS](../FINDINGS.md) "Thorns", `tools/measure-thorns.ts`).
- **Operations and checks (D342).** `paintObjects` is an operation in `ops.schema.json`, refused inside a group; `applyBatch`
  validates independent operations once and does one rebuild and one history step; `placeEntity` and `setEntityProps` check their
  components in `doc/objectOps.ts` (`optionProblems`) with a one-line reason each. Questions are plain core functions:
  `blastInfo` and `explosionAfter` (`doc/blast.ts`), `markerNotes`, `optionsOf`, `planPaintObjects`.
- **Models.** Original, in the stone-basin style, in both looks: `seep`, `aquifer`, `drill`, `drain`, `unstableCore`,
  `reservePile`, `reserveWarehouse`, `reserveTank` (`render3d/entities3d.ts`).

## The core's rule (D339)

Read from the game's code (`ExplosionOutcomeGatherer`, `UnstableCore`, `TerrainPhysicsValidator`) and written down in
`src/core/sim/explosion.ts`. **`entities.ts`' "radius + 1" is right**: the blast is a sphere of `ExplosionRadius + InnerRadius`
(InnerRadius is 1 in the blueprint), centred on the middle of the core's footprint at the height of its base; a voxel is in it
when its centre is inside. Every solid voxel in it is removed; every object with a block in it is deleted (and any that stood on
removed ground); then terrain physics runs: a voxel stays only if it reaches supported ground within **3 sideways steps** in its
layer, and what the removal leaves unsupported falls. A core the blast reaches goes off too, and the chain runs to its end. The
game removes the sphere one ring a tick; only the end result is worked out.

## Keys

None added. F, [ and ] and Esc now also work on a shelf brush, as on the terrain brushes (batch 3 owns the key map).

## Tests

- `tests/unit/parity-data.test.ts` (the pinned values and their ceilings), `parity-water.test.ts` (seeps, delays, sinks),
  `explosion.test.ts` (the rule, the cascade, the fall), `paint.test.ts` (a painted ruin field matches the generator's within
  tolerances; thorn patches match the measured ones; density and Age behave; nothing stacks; a click places one),
  `tests/contract/parityObjects.test.ts` (each operation and refusal through the session; exact save and load, including a
  `.timber` round trip), `tests/e2e/parity.spec.ts` (the shelf, a brush's Size, Density, Age, plan and one undo step, the seep,
  the core and its view, the reserve, Markers).
- One test changed: `placeTools.test.ts` "a placed source starts at the game's own default strength" now also expects the game's
  disabled countdown (`TimeActivatedComponent`) that a new source carries; the strengths it checks are as before. And
  `brushKit.spec.ts` pins the shelf's first entries: they now include Succulent and Mixed woods before Ruin (D338).

## Probe samples (not run)

`npx tsx tools/probe-parity.ts` writes seven maps and `parity.json` (default `C:\dgm-probe\parity`); the runner's group `Parity`
plays them with checks in `investigation/probe/runner/compare.ts` (`parity-*`): seeps stop at 0.8 while a source of the same
strength fills its pit; a delayed source starts after its countdown; a sink drains (compared with the editor's settle); a drain
runs only in a badtide (with an aquifer that gives nothing); the reserves load holding their goods; a core goes off in its
cycle and the land, objects and water match the preview; succulents on dry ground live and those on moist ground die. Like every
launch the batch needs Kyler's yes in chat (CLAUDE.md).

## What falls short

- Nothing here has been seen in Timberborn: the probe batch has not run.
- The blast view redraws the water by settling the changed ground again and recomputes moisture and soil on the height map; under
  roofs and hanging ground it is approximate (the view says how many tiles are roofed).
- The Badtide Drain runs in the water model only during a badtide, and the day-by-day Badtide view (#73) does not exist yet.
- A reserve's goods are only what the file says; the probe does not read inventories, so the amounts are judged by eye.
- The models were checked at the render level, not against the game's meshes (they are original, as intended).
- Natural Overhangs are not on the shelf (ROADMAP's 3D item 6 points to the Block tool, D338).

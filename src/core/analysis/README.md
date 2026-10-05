# analysis

Measures a finished map: reachability, walking distance, wood, relief, and the rules behind several checks (the checks themselves run in Rust, `validate/`); and the generator's straight-channel measure. It reads a map and never changes one.

**Rules**
- Deterministic and pure: the same map gives the same numbers, on generated, official, real and imported maps alike.
- A number that no decision uses is information only (D115, D145). The checks in `validate/` decide what blocks.
- Where a Python twin exists (`prototype/analysis.py`, `prototype/playability.py`), the two must agree; `tools/oracle.ts` compares them.

**Start from**
- `walk.ts` `walkWorld` (the colony's walk graph: the footprints of `WALK_BLOCKERS`, and the Slopes' links; every check and generator stage builds it here) and `walkDistance`: how far a beaver walks from the start (D85).
- `regions.ts` `components`: the one flood of a mask's 4- or 8-connected parts (bodies of water, wet systems); `walkRegions`, `landRegions`.
- `wood.ts` `treeLogs`: logs per tree, for the starting-wood count (D164).
- `metrics.ts` `startBench` (the map card's bench); `measure`, a map against the targets its settings map to, is `tools/lib/metrics.ts`.
- `vertical.ts` `reachWalk` (walking distance over the whole map, for the intentions), `fallsOf` (surface drops between wet tiles).
- `straight.ts` `straightness`, `tooStraight`: ruler-straight channels (D209), a generator stage only: no check measures it, so imported and edited maps are never held to it.
- `edges.ts` (edge walls, D151), `ridge.ts` `damWalls` (D111), `sources.ts` `sourcesInFlow` (D171), `mechanics.ts` (maps a steady-state settle cannot show: what the checks report, `Mechanics`; the rule runs in `rust/checks`).
- `rust/bridge.ts`: the six kernels that run in Rust (`rust/analysis`, D391): `distanceFrom`, `walkDistance`, `landRegions`, `spillLevels`, `damSites` and `roomMap`, each export keeping its signature. A change to one is a change to `rust/analysis/src/lib.rs` and a re-pin of `tools/rust/analysis-pins.json`.
- Water storage near the start (`water.storage_possible`) is measured by the checks (`rust/checks`). How the start's planting is spread (D252) is measured by `tools/lib/startPlanting.ts`.

**Tests**: `tests/contract/` (edges, mechanics, sources, start, narrows, resources, settings; `startPlanting` runs `tools/lib/startPlanting.ts`) and `tests/unit/` (straight, wood, startWater, colonyReach). Run `npx vitest run tests/unit/straight.test.ts`, or `npm run test:quick` for all.

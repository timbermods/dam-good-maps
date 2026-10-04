# analysis

Measures a finished map: reachability, walking distance, water storage, wood, relief, straight channels, and the rules behind several checks. It reads a map and never changes one.

**Rules**
- Deterministic and pure: the same map gives the same numbers, on generated, official, real and imported maps alike.
- A number that no decision uses is information only (D115, D145). The checks in `validate/` decide what blocks.
- Where a Python twin exists (`prototype/analysis.py`, `prototype/playability.py`), the two must agree; `tools/oracle.ts` compares them.

**Start from**
- `walk.ts` `walkDistance`: how far a beaver walks from the start (D85).
- `wood.ts` `treeLogs`: logs per tree, for the starting-wood count (D164).
- `metrics.ts` `startBench` (the map card's bench); `measure`, a map against the targets its settings map to, is `tools/lib/metrics.ts`.
- `vertical.ts` `reachWalk` (walking distance over the whole map), `fallsOf` (surface drops between wet tiles).
- `straight.ts` `straightness`, `tooStraight`: ruler-straight channels (D209).
- `edges.ts` (edge walls, D151), `ridge.ts` `damWalls` (D111), `sources.ts` `sourcesInFlow` (D171), `mechanics.ts` (maps a steady-state settle cannot show).
- `storage.ts` (water storage near the start). How the start's planting is spread (D252) is measured by `tools/lib/startPlanting.ts`.
- `legend.ts` `legendItems`, `legendTiles` and `levers.ts` `leverMarks`, `reachText`: the map card's legend row and numbers (D330; the levers are M9b's, D325).

**Tests**: `tests/contract/` (cardNumbers, edges, mechanics, sources, start, narrows, resources, settings; `startPlanting` runs `tools/lib/startPlanting.ts`) and `tests/unit/` (straight, wood, startWater). Run `npx vitest run tests/unit/straight.test.ts`, or `npm run test:quick` for all.

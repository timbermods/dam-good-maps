# places

Real places: maps made from real terrain by the landscape survey, offered as content to open or refine (D136). This folder holds the place data format and the credits every place carries.

**Rules**
- Never generator input (D108): nothing under `gen/` or `features/` reads a place.
- A place keeps its real land (D245, D331). It is built with the same steps and code as a generated map.
- Every place carries the data providers' required notices, verbatim (`attribution.ts`).
- The gallery shows every place (D445); the index records each place's `faults`, and a place with `start.water` carries the card note "No reachable water" (`placeNote`).
- The land has no edge wall (D151): the survey's sealed border is not used. The land is its unsealed crop, the edge runs on past the map as the generator's does (`relaxEdges`), and a short lip stands beside a source the survey put by the edge (`tools/real-places.ts`).
- A start the opened rivers flood, or that reaches no water a source feeds, moves to the best spot its land offers (D245, `start.ts` `placeStartSpots`): dry, water near, wood and berries kept where it can, never below the starting-logs floor it met.
- The nightly runs `npm run places -- --check`: the data in `public/real-places/` must match a fresh build, or the nightly fails (run `npm run places` and commit).
- The Real places rebuild (round 2) is parked until the map-changing items have settled (D319).

**Start from**: `place.ts` `decodePlaceFile`, `buildPlace`, `start.ts` (where a start may move) (a place's data to a `.timber`, through `buildFileFromHeights`, which also builds the probe's test maps from heights and objects as the generator's build does); `attribution.ts` (the credits).

**Tests**: `tests/contract/places.test.ts`, `places-build-1.test.ts` to `places-build-3.test.ts`, `tests/e2e/places.spec.ts`. The data is written by `tools/real-places.ts` (`npm run places`). Run `npx vitest run tests/contract/places.test.ts`.

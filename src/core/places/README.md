# places

Real places: maps made from real terrain by the landscape survey, offered as content to open or refine (D136). This folder holds the place data format and the credits every place carries.

**Rules**
- Never generator input (D108): nothing under `gen/` or `features/` reads a place.
- A place keeps its real land (D245, D331). It is built with the same steps and code as a generated map.
- Every place carries the data providers' required notices, verbatim (`attribution.ts`).
- The Real places rebuild is parked until the map-changing items have settled (D319).

**Start from**: `place.ts` `decodePlaceFile`, `buildPlace` (a place's data to a `.timber`); `attribution.ts` (the credits).

**Tests**: `tests/contract/places.test.ts`, `places-build-1.test.ts` to `places-build-3.test.ts`, `tests/e2e/places.spec.ts`. The data is written by `tools/real-places.ts` (`npm run places`). Run `npx vitest run tests/contract/places.test.ts`.

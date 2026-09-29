# math

The deterministic base the other folders build on: random numbers, hashing, noise and grid helpers.

**Rules**
- Same output in every JavaScript engine (PLAN §2.1). Hashes use 32-bit integer operations only. Random streams (`sfc32` seeded through `splitmix32`) are derived by hashing their name. Noise depends only on `(seed, x, y)`.
- `Math.sin`, `cos`, `exp` and `log` are not exact across engines; output paths use `detmath.ts` instead.
- Grids are row-major: index = `y * W + x`, x east, y north.
- Changing any function here changes maps: re-pin (D308).

**Start from**: `rng.ts` `stream`, `Rng`; `hash.ts` `hash32`, `hash128`; `noise.ts` `fbm`; `detmath.ts` `sinDet`, `cosDet`, `expDet`; `grid.ts` (neighbours, `distanceFrom`, `levelRegions`, `MinHeap`).

**Tests**: `tests/unit/math.test.ts`. Run `npx vitest run tests/unit/math.test.ts`.

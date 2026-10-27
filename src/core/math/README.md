# math

The deterministic base the other folders build on: random numbers, hashing, noise and grid helpers.

**Rules**
- Same output in every JavaScript engine (PLAN §2.1). Hashes use 32-bit integer operations only. Random streams (`sfc32` seeded through `splitmix32`) are derived by hashing their name. Noise depends only on `(seed, x, y)`.
- `Math.sin`, `cos`, `exp`, `log` and the rest are not exact across engines; output paths use `portable.ts` instead (`sqrt`, `log`, `pow`, `atan2` and more; `sin`, `cos` and `exp` are `detmath.ts`'s).
- Grids are row-major: index = `y * W + x`, x east, y north.
- Changing any function here changes maps: re-pin (D308).

**Start from**: `rng.ts` `stream`, `Rng`; `hash.ts` `hash32`, `hash128`; `noise.ts` `fbm`; `detmath.ts` `sinDet`, `cosDet`, `expDet`; `portable.ts` (`log` is the generator's ln too: `gen/calibrated.ts`'s size curves and the resource budgets read it); `polyline.ts` `polyDist`; `grid.ts` (the neighbour tables `N4` and `N8`, `distanceFrom`, `levelRegions`, `MinHeap`); `clamp.ts` `clamp`, `smoothstep` (the forces keep their own `clamp`, `forces/random.ts`).

**Tests**: `tests/unit/math.test.ts`. Run `npx vitest run tests/unit/math.test.ts`.

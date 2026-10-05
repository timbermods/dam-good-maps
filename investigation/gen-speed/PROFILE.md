# Node generation profile

Base: `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`; v24.13.0; 256²; default theme settings, seed 1.
One sequential generation per case in one Node process, first case cold and later cases sharing module/JIT state; default Rust WebAssembly water, no native binary or water helper pool.
The extreme case uses Any, seed 3399078211, relief/terracing/verticality/variety 100, highest terrain 22, two Lush rivers, Many lakes and Many waterfalls; other settings are Normal defaults.

These are wall seconds inside the instrumented generation progress windows. They sum to the generation duration. They are not uninstrumented timing comparisons: function hooks and the inspector add overhead, especially to the terrain noise functions.
The water window also contains hydrology and planned-water land/start screening; the start window includes repair builds. “Check” includes final intentions, outcomes and serialization. See function attribution below for shared-stage costs.

| Case | Attempts | Passed | Land | Water/planning | Start/repair | Objects | Resources | Check/finish | Total |
|---|---:|:---:|---:|---:|---:|---:|---:|---:|---:|
| any | 1 | yes | 1.80 | 1.57 | 1.57 | 0.16 | 0.23 | 0.62 | 5.96 |
| riverValley | 2 | yes | 0.75 | 1.48 | 3.07 | 3.79 | 0.17 | 0.61 | 9.88 |
| canyon | 3 | yes | 4.44 | 2.52 | 2.53 | 0.50 | 0.21 | 0.85 | 11.04 |
| highlands | 1 | yes | 1.69 | 1.16 | 1.57 | 0.36 | 0.27 | 0.77 | 5.83 |
| lakeBasin | 1 | yes | 0.68 | 1.27 | 2.94 | 0.22 | 0.21 | 0.77 | 6.10 |
| delta | 2 | yes | 0.89 | 1.76 | 2.19 | 0.34 | 0.22 | 1.21 | 6.62 |
| islands | 1 | yes | 2.47 | 2.06 | 4.96 | 0.18 | 0.14 | 0.62 | 10.44 |
| extreme | 27 | no | 3.86 | 3.46 | 18.62 | 0.00 | 0.00 | 0.00 | 25.94 |

## Shared functions

Self wall milliseconds in selected named functions, excluding instrumented children. Unwrapped class methods (notably the water run) remain charged to their calling build. These figures overlap the progress table but do not overlap other self rows. Full function totals are local-only.

### any

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 6 | 915 |
| `features/slopes.ts:placeSlopes` | 138 | 601 |
| `land/drainage.ts:drainage` | 50 | 397 |
| `gen/settler.ts:pumpShores` | 127 | 149 |
| `sim/prefill.ts:spillLevels` | 17 | 135 |
| `math/grid.ts:levelRegions` | 147 | 122 |
| `format/timber.ts:writeTimber` | 1 | 103 |
| `analysis/ridge.ts:damWalls` | 6 | 102 |
| `features/geometry.ts:pathField` | 7 | 93 |
| `sim/soil3d.ts:settleTicks` | 12 | 82 |
### riverValley

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 12 | 5661 |
| `land/drainage.ts:drainage` | 52 | 350 |
| `features/slopes.ts:placeSlopes` | 40 | 246 |
| `land/minePads.ts:ownSquares` | 5 | 166 |
| `sim/soil3d.ts:settleTicks` | 24 | 151 |
| `sim/prefill.ts:spillLevels` | 18 | 139 |
| `land/hydro.ts:planHydro` | 2 | 126 |
| `format/timber.ts:writeTimber` | 1 | 115 |
| `features/raster/terrain.ts:integrityLevel` | 1238044 | 108 |
| `analysis/ridge.ts:damWalls` | 6 | 107 |
### canyon

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 10 | 2141 |
| `land/drainage.ts:drainage` | 135 | 1200 |
| `land/hydro.ts:planHydro` | 3 | 582 |
| `analysis/ridge.ts:damWalls` | 8 | 197 |
| `analysis/signature.ts:signatureOf` | 4 | 190 |
| `format/timber.ts:writeTimber` | 1 | 187 |
| `features/slopes.ts:placeSlopes` | 29 | 180 |
| `features/raster/terrain.ts:integrityLevel` | 1623100 | 172 |
| `sim/soil3d.ts:settleTicks` | 20 | 142 |
| `land/levels.ts:snapLevels` | 3 | 139 |
### highlands

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 8 | 1029 |
| `land/drainage.ts:drainage` | 31 | 262 |
| `land/minePads.ts:ownSquares` | 5 | 189 |
| `features/slopes.ts:placeSlopes` | 37 | 146 |
| `sim/prefill.ts:spillLevels` | 17 | 145 |
| `land/hazards.ts:planBadwater` | 1 | 117 |
| `land/hydro.ts:planHydro` | 1 | 115 |
| `format/timber.ts:writeTimber` | 1 | 112 |
| `gen/settler.ts:pickStart` | 5 | 111 |
| `features/raster/terrain.ts:integrityLevel` | 911384 | 105 |
### lakeBasin

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 7 | 2504 |
| `land/drainage.ts:drainage` | 30 | 238 |
| `analysis/damsites.ts:damCandidate` | 20436 | 175 |
| `analysis/ridge.ts:damWalls` | 6 | 167 |
| `features/slopes.ts:placeSlopes` | 38 | 164 |
| `features/geometry.ts:pathField` | 6 | 138 |
| `format/timber.ts:writeTimber` | 1 | 133 |
| `sim/soil3d.ts:settleTicks` | 14 | 130 |
| `sim/prefill.ts:spillLevels` | 18 | 110 |
| `land/minePads.ts:ownSquares` | 5 | 97 |
### delta

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 10 | 1885 |
| `features/slopes.ts:placeSlopes` | 141 | 549 |
| `analysis/damsites.ts:damCandidate` | 20280 | 548 |
| `land/drainage.ts:drainage` | 50 | 367 |
| `analysis/ridge.ts:damWalls` | 6 | 181 |
| `land/hydro.ts:planHydro` | 2 | 154 |
| `format/timber.ts:writeTimber` | 1 | 144 |
| `sim/prefill.ts:spillLevels` | 18 | 129 |
| `math/grid.ts:levelRegions` | 157 | 125 |
| `gen/settler.ts:pumpShores` | 84 | 110 |
### islands

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 8 | 4658 |
| `land/drainage.ts:drainage` | 44 | 366 |
| `analysis/ridge.ts:damWalls` | 6 | 320 |
| `land/hazards.ts:ditchRoute` | 44 | 192 |
| `analysis/damsites.ts:damCandidate` | 18336 | 150 |
| `features/slopes.ts:placeSlopes` | 38 | 144 |
| `land/minePads.ts:ownSquares` | 5 | 134 |
| `sim/prefill.ts:spillLevels` | 19 | 108 |
| `format/timber.ts:writeTimber` | 1 | 104 |
| `land/levels.ts:widenOutlets` | 1 | 90 |
### extreme

| Function | Calls | Self ms |
|---|---:|---:|
| `features/build.ts:run` | 25 | 4931 |
| `sim/prefill.ts:spillLevels` | 292 | 1890 |
| `analysis/ridge.ts:damWalls` | 32 | 1663 |
| `land/drainage.ts:drainage` | 200 | 1592 |
| `gen/intentions.ts:settlerView` | 121 | 875 |
| `gen/generate.ts:attemptOnce` | 27 | 790 |
| `gen/settler.ts:pickStart` | 124 | 625 |
| `format/world.ts:settledSimulationSingletons` | 24 | 579 |
| `format/json.ts:formatFloat` | 2740416 | 546 |
| `sim/soil3d.ts:settleTicks` | 96 | 539 |

## Interpretation

Repeated fresh builds dominate shared work, including water runs and repeated soil construction. Start candidates repeatedly derive slopes and scan pump shores. The extreme case rebuilds spill levels 292 times, calls `pickStart` 124 times and constructs 121 settler intention views. Drainage and dam-wall checking are also substantial. Theme shaping and the Rust water kernel are untouched.

No early failure return is proposed: attempts report reasons and feed subsequent retry decisions. Skipping their work without carrying identical failure information could move later maps.

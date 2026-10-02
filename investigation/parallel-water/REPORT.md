# Parallel water investigation

**Kernel identity for identical inputs and isolation are verified; keep adoption gated.** Base `feature/m9b`
`6c29b7e5`; product files untouched, six-day cap preserved. Chromium 145, Firefox 146 and Windows
Playwright WebKit 26 pass the headerless static-host test: one early reload, safe waiting updates,
CORS/CORP enforcement and isolated cached navigation. WebKit offline emulation fails with plain
caching too; installed Safari/offline remains unverified. Current resources need no cross-origin exceptions.

**Identity:** zero settle mismatches at 1/2/4/8/16 threads: 1,050 current M9b models (12 quality-refused outputs retained), 19 archived
official models, 24 golden rule cases, three tiled 512² models, nine live/9-day drought/8-day badtide
runs including returns. Forced goldens also test 3/7 threads (100,800 per-tick checks).
Fallback: 2,400 tick checks; failed-phase discard/fresh scalar retry and private-array ownership pass.
Six complete generation cases compare scalar/candidate export bytes, water state and selected planning state.
Cross-engine generation: 0 compared-state differences; 0 water/export/tick differences.
Native fractional-day forcing still diverges in WebKit; identical model/forcing inputs are required.

Speed versus the faster scalar settle, median river/lake/sea case ratios (copies included; pool startup separate; below 1× is slower):

| Engine / size | 1 threads | 2 threads | 4 threads | 8 threads | 16 threads |
| --- | ---: | ---: | ---: | ---: | ---: |
| chromium / 128² | 0.96× | 1.14× | 1.02× | 1.08× | 0.98× |
| chromium / 256² | 1.00× | 1.19× | 1.55× | 1.70× | 1.56× |
| chromium / 512² | 1.00× | 1.37× | 2.46× | 3.15× | 2.36× |
| firefox / 128² | 0.98× | 1.22× | 0.99× | 0.98× | 0.97× |
| firefox / 256² | 0.99× | 1.58× | 2.05× | 2.27× | 1.52× |
| firefox / 512² | 1.00× | 1.81× | 2.36× | 3.04× | 3.17× |
| webkit / 128² | 1.00× | 0.97× | 0.67× | 0.64× | 0.97× |
| webkit / 256² | 1.00× | 1.39× | 0.99× | 0.47× | 1.00× |
| webkit / 512² | 0.99× | 1.71× | 0.89× | 1.02× | 1.04× |

Three pairs at 128²/256²; one long pair at 512². Ryzen 7 9800X3D, 16 logical CPUs; other host load
uncontrolled. Maximum-tick lake tails (three pairs): m9b-lakeBasin-128-41 (4352 ticks); m9b-lakeBasin-256-20 (4480 ticks).

| Engine / maximum-tick lake | 1 threads | 2 threads | 4 threads | 8 threads | 16 threads |
| --- | ---: | ---: | ---: | ---: | ---: |
| chromium / 128² | 1.01× | 1.35× | 1.07× | 0.97× | 0.96× |
| chromium / 256² | 1.03× | 1.48× | 2.13× | 2.52× | 0.97× |
| firefox / 128² | 0.99× | 1.44× | 1.05× | 0.98× | 1.00× |
| firefox / 256² | 0.98× | 1.41× | 2.21× | 2.68× | 0.99× |
| webkit / 128² | 1.01× | 0.98× | 0.91× | 1.00× | 0.99× |
| webkit / 256² | 0.96× | 0.94× | 0.76× | 0.06× | 0.89× |

Worst measured case/count per engine: chromium tiled-islands-512/8 threads 0.73×; firefox m9b-lakeBasin-128-1/8 threads 0.90×; webkit m9b-lakeBasin-256-20/8 threads 0.06×. Individual sea/lake/river ratios are in the evidence.
Long WebKit stalls also occurred in unpaired Weather verification; remeasure the integrated cadence before choosing defaults.

New-map worker latency, median of the three themes; helper startup included:

| Engine / size | Scalar first land / water | 4-thread first land / water |
| --- | ---: | ---: |
| chromium / 128² | 0.66 s / 1.51 s | 0.78 s / 1.70 s |
| chromium / 256² | 4.69 s / 20.26 s | 4.67 s / 10.72 s |
| firefox / 128² | 0.70 s / 1.35 s | 0.73 s / 1.23 s |
| firefox / 256² | 4.15 s / 23.37 s | 4.62 s / 11.08 s |
| webkit / 128² | 0.82 s / 1.62 s | 0.83 s / 1.44 s |
| webkit / 256² | 4.17 s / 17.55 s | 4.85 s / 13.53 s |

The generator rejects 512²: these are water stress models, with no valid 512² first-land timing.
Land/water markers exclude UI transfer and painting.
Completion at the six-day cap is recorded separately from equilibrium.

Adoption: keep reduction/source order, gate early API calls, budget concurrent pools, merge caching
and isolation, preserve old assets, and discard failed tasks before retry. Shared workspace:
**141 bytes/tile** (35.25 MiB at 512²), plus private arrays/caches. Case/engine regressions rule out a blanket default.

[Integration/regeneration](INTEGRATION.md) · [Compact evidence](EVIDENCE.json) · [Adoption patch](adoption.patch)

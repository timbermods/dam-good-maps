# Generation speed at 256²

Base: M9b `e292cefe`. Product code is unchanged. Adopt [adoption.patch](adoption.patch) through the milestone; [INTEGRATION.md](INTEGRATION.md) has the exactness argument and regeneration commands.

Changes: shared start preparation and nine-day storage; histogram median; exact early exits in mine-room and wall checks. RNG, rejection order and water arithmetic stay unchanged. Water-speed is already adopted; parallel-water/startup work is retained.

Lake Basin 256² seed 7: **12 → 2 drought calculations, 4 → 4 selections**, confirmed on all three repeats ([input/byte audit](SHARED-COST.json)). Shared fields expire before levelling; later picks prepare fresh data. The peer audit’s 282/937 ms CPU observations are not claimed savings.

## Before and after

Median paired generation thread-CPU saving at 256²: **5.9%**. Native-page wall time remains noisy and does not improve in every theme; the 3/8 s targets are not established by this loaded run.

Seconds: **median / worst**, before → after. At 256² seeds 1–20 have three interleaved pairs (60 runs per variant/theme); at 96²/128² seeds 1–5 have three pairs (15 runs). Median is over per-seed medians of complete pairs; worst includes every recorded repeat, including resumed partial-pair reruns. Normal/default settings. Four isolated generation workers; total Windows CPU load median 100.0%, worst 100.0%. AMD Ryzen 7 9800X3D 8-Core Processor, 16 logical CPUs, 62 GiB; Windows, Node v24.19.0. The browser checks, contract tests, other investigations and applications ran concurrently during portions of the matrix. These are loaded timings, not an idle-machine certification of D333's 3/8 s targets. [Thread CPU and load by cell](TIMINGS.csv). 13 observations have no counter sample (recorded as missing, never zero); their durations remain included.

| Theme | Size | First land before → after | Water/start fixed before → after | Finished before → after |
|---|---:|---:|---:|---:|
| Any | 96² | 0.85 / 2.54 → 0.72 / 2.00 | 1.51 / 3.01 → 1.45 / 2.48 | 1.88 / 3.38 → 1.88 / 2.82 |
| River Valley | 96² | 0.69 / 1.44 → 0.61 / 1.24 | 0.97 / 1.90 → 0.86 / 1.78 | 1.24 / 2.14 → 1.14 / 2.04 |
| Canyon | 96² | 1.28 / 4.82 → 0.90 / 4.31 | 1.92 / 5.37 → 1.99 / 4.83 | 2.15 / 5.59 → 2.19 / 5.07 |
| Highlands | 96² | 2.07 / 3.45 → 1.96 / 2.82 | 2.28 / 3.85 → 2.15 / 3.21 | 2.52 / 4.14 → 2.38 / 3.50 |
| Lake Basin | 96² | 0.68 / 1.99 → 0.57 / 1.75 | 1.98 / 2.75 → 1.89 / 2.99 | 2.27 / 3.15 → 2.17 / 3.25 |
| Delta | 96² | 0.37 / 0.51 → 0.28 / 0.41 | 0.82 / 1.61 → 0.69 / 1.65 | 1.15 / 2.14 → 0.98 / 2.22 |
| Islands | 96² | 0.43 / 0.70 → 0.28 / 0.38 | 2.40 / 2.73 → 2.29 / 2.84 | 3.18 / 8.90 → 3.19 / 7.89 |
| Any | 128² | 1.24 / 1.50 → 1.08 / 1.23 | 1.93 / 2.25 → 1.75 / 2.09 | 2.48 / 2.90 → 2.26 / 2.71 |
| River Valley | 128² | 0.78 / 3.66 → 0.64 / 3.64 | 1.57 / 4.50 → 1.54 / 4.70 | 2.33 / 4.92 → 2.14 / 5.16 |
| Canyon | 128² | 1.77 / 7.69 → 1.71 / 7.12 | 2.37 / 8.27 → 2.37 / 7.68 | 3.02 / 8.96 → 3.02 / 8.21 |
| Highlands | 128² | 3.47 / 6.14 → 3.39 / 5.81 | 4.45 / 6.73 → 4.30 / 6.18 | 5.02 / 7.25 → 4.78 / 6.68 |
| Lake Basin | 128² | 2.30 / 3.06 → 1.96 / 2.56 | 3.21 / 3.84 → 2.50 / 3.54 | 3.72 / 4.50 → 3.08 / 4.33 |
| Delta | 128² | 0.49 / 0.75 → 0.40 / 0.70 | 1.42 / 4.99 → 1.41 / 4.82 | 1.83 / 5.52 → 1.79 / 5.35 |
| Islands | 128² | 0.67 / 0.84 → 0.45 / 0.71 | 5.00 / 5.91 → 4.91 / 5.46 | 5.92 / 7.00 → 5.85 / 6.35 |
| Any | 256² | 6.24 / 46.37 → 5.52 / 24.04 | 13.51 / 115.84 → 12.61 / 81.83 | 18.32 / 123.20 → 17.78 / 90.16 |
| River Valley | 256² | 4.82 / 35.93 → 4.05 / 33.80 | 11.01 / 122.40 → 9.72 / 114.36 | 13.36 / 131.01 → 11.99 / 119.67 |
| Canyon | 256² | 7.49 / 64.71 → 6.89 / 64.39 | 13.86 / 107.28 → 14.62 / 81.49 | 16.64 / 114.56 → 17.05 / 90.92 |
| Highlands | 256² | 6.51 / 26.74 → 5.94 / 33.74 | 10.93 / 60.33 → 10.88 / 64.45 | 13.36 / 85.46 → 13.25 / 82.94 |
| Lake Basin | 256² | 8.47 / 35.50 → 8.01 / 34.16 | 18.02 / 48.57 → 16.54 / 40.67 | 21.28 / 53.45 → 19.87 / 49.11 |
| Delta | 256² | 3.04 / 21.23 → 2.22 / 19.34 | 8.35 / 56.70 → 7.26 / 68.31 | 10.27 / 69.61 → 10.04 / 86.40 |
| Islands | 256² | 2.74 / 11.84 → 1.97 / 11.73 | 28.88 / 100.52 → 27.16 / 98.81 | 32.30 / 108.38 → 29.28 / 106.44 |

The core's `firstWater` includes water repairs and choosing its start. M9b's first-land canvas is a preview without editing handlers; water is shown at the candidate/finished preview, and editing starts after Refine. The browser results below measure those real boundaries, including message transit and painting.

## Where time goes

Disjoint baseline wall-time shares across all 20 seeds/repeats at 256²; redraw is an overlapping share of pre-land time, not another stage. “Other pre-land” includes mine/hazard preparation, builds and glue.

| Theme | Shaping | Planning | Starts | Checks | Other pre-land | Settle share after land | Redraw share before land |
|---|---:|---:|---:|---:|---:|---:|---:|
| Any | 27% | 22% | 16% | 10% | 25% | 69% | 29% |
| River Valley | 24% | 28% | 13% | 7% | 28% | 61% | 35% |
| Canyon | 28% | 26% | 9% | 10% | 27% | 57% | 66% |
| Highlands | 35% | 22% | 7% | 9% | 27% | 57% | 54% |
| Lake Basin | 27% | 26% | 15% | 9% | 24% | 73% | 55% |
| Delta | 10% | 11% | 25% | 12% | 42% | 55% | 28% |
| Islands | 0% | 18% | 16% | 44% | 22% | 89% | 5% |

Before first land, these 140 inputs refuse **258 plans**; redraws consume **46.1%** of pre-land wall time. Most frequent: promise (planned): 77; a river's water leaves its course: 72; no start: 40. The course and promise screens already run before start preparation; skipping them changes the selected map.

All 140 inputs are traced on every repeat: [disjoint stage totals](PROFILE.csv), [rejections](REJECTIONS.csv). Shaping repeats noise/priority floods; planning cuts/checks courses; starts repeat walks, storage and statistics. Seed-1 [V8 samples](CPU-SAMPLES.csv) put water substep at 51% in River Valley and 77% in Islands. [M9b tick evidence](SETTLE-TICKS.csv): 1,792–2,816 median final ticks by theme, up to 4,352 ticks and five settles. Wet areas and repairs explain the water tail. Exact early-rejection dependencies are in INTEGRATION; changing budgets or skipping draws can select a different map. [Result-changing proposals](PROPOSALS.md) remain separate and unmeasured.

Browser: actual production page/worker, headless Chrome 154.0.8037.92 with an RTX 4080 SUPER via ANGLE/D3D11 ([renderer metadata](BROWSER-GPU.json)), seed 1 at 256² for every theme, three reversed-order pairs; fresh contexts, a small-map worker/UI warm-up, native page/worker/GPU. Editing was proved by a real Raise click; undo restored every terrain byte on all 42 completed visits. Seconds median / worst:

| Theme | First land paint before → after | Settled preview before → after | Editable GPU frame before → after |
|---|---:|---:|---:|
| Any | 8.74 / 11.24 → 9.22 / 10.85 | 16.81 / 20.03 → 17.53 / 23.95 | 19.87 / 21.33 → 18.48 / 25.54 |
| River Valley | 8.57 / 12.35 → 4.24 / 18.19 | 29.95 / 38.26 → 22.03 / 50.03 | 32.31 / 39.80 → 23.18 / 50.91 |
| Canyon | 7.02 / 22.67 → 6.97 / 7.26 | 14.89 / 38.62 → 14.83 / 15.27 | 16.25 / 39.88 → 15.80 / 16.68 |
| Highlands | 4.34 / 9.64 → 2.85 / 3.24 | 11.39 / 20.57 → 8.52 / 9.47 | 12.60 / 22.40 → 9.64 / 10.89 |
| Lake Basin | 5.70 / 22.92 → 4.86 / 14.19 | 13.63 / 39.51 → 12.40 / 27.55 | 14.96 / 40.87 → 13.28 / 29.00 |
| Delta | 2.65 / 7.93 → 1.59 / 5.62 | 12.39 / 30.80 → 11.08 / 17.77 | 13.78 / >300 (timeout) → 11.98 / 18.68 |
| Islands | 3.94 / 8.78 → 6.95 / 7.20 | 33.18 / 56.42 → 47.19 / 50.71 | 34.21 / 58.15 → 48.58 / 52.25 |

A baseline Delta editor-readiness wait timed out at 300 s; its Generate-to-editable worst is therefore **over 300 s**, not just the completed-run maximum. The retry completed. [Failure evidence](BROWSER-FAILURES.json). The original failed visit did not retain its counter samples; successful visits and concurrent core runs record host load. This is a censored harness readiness observation, not a diagnosed product fault.

Browser whole-machine CPU load: median 100.0%, worst 100.0%. Refine is clicked immediately after the finished preview; network/startup and human hesitation are excluded. These loaded native-desktop results do not prove laptop compliance.

The 42 browser visits also match uninstrumented Node first-land and download hashes ([BROWSER-IDENTITY.json](BROWSER-IDENTITY.json)).

## Identity

**Zero differences:** all 840 current M9b batch inputs (seeds 1–40, all seven themes, 96²/128²/256²), 1260 direct complete-state byte comparisons, including the first land and all water/object/export bytes. 2 identical refusals are retained, not counted as valid exports. [Bound evidence](IDENTITY.json). Focused parity: 180 mine grids, 212 wall scenes (16 positive), 320 repeated picks plus 5120 subsequent random draws. Full baseline/candidate typechecks pass; 21 existing focused tests pass. Adoption patch applies cleanly. Large raw runs, profiles and builds are ignored under `local/`; regenerate them with the integration commands.

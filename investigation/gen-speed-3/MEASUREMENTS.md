# Measurements

Base and method are in [INTEGRATION.md](INTEGRATION.md). All seven themes, defaults (128² / Normal / Variety 70), seeds 1–3, one generation at a time. Uninstrumented API calls alternate baseline/candidate order. Both modules get the same excluded 48² Delta warm-up. One pair per seed; no repetitions chosen for nicer numbers. Node v22.23.3, AMD Ryzen 5 3600 6-Core Processor              , 12 logical CPUs, 32 GiB; shared Windows machine.

The primary boundary is the first `candidate` callback from `runGenerate`, after the first passing map. `land` is an earlier planned-water preview. Return also includes project encoding, facts and SHA-256. These are worker computation boundaries in Node, excluding worker startup, Comlink transit, renderer and paint; they are not claimed as measured click-to-paint browser latency. At 128² the page uses one water thread too. Process CPU includes V8/helper work and is supplementary.

## Before | after

Seconds, median of the same three seeds per theme. Every individual pair, including slower candidates, is in [samples/before-after.csv](samples/before-after.csv).

| Theme | First passing candidate | Earlier land | Worker return | Soil calls (3 seeds) |
|---|---:|---:|---:|---:|
| any | 6.297 → 6.700 | 4.699 → 5.192 | 6.469 → 6.899 | 37 → 28 |
| riverValley | 3.193 → 2.722 | 2.505 → 2.112 | 3.305 → 2.824 | 19 → 9 |
| canyon | 2.713 → 2.788 | 2.190 → 1.991 | 2.809 → 2.949 | 23 → 8 |
| highlands | 7.507 → 7.584 | 4.474 → 4.357 | 7.693 → 7.762 | 32 → 26 |
| lakeBasin | 3.578 → 3.931 | 2.975 → 3.198 | 3.722 → 4.184 | 29 → 15 |
| delta | 2.957 → 2.846 | 1.858 → 1.857 | 3.059 → 3.016 | 24 → 14 |
| islands | 4.525 → 4.648 | 3.864 → 3.807 | 4.676 → 4.885 | 32 → 20 |

Total first-candidate computation across the 21 inputs: **119.600 | 116.121 s (2.9% less)**. Median paired change: **1.1% less**; 13/21 after readings are faster. These observations establish no timing gate or uniform speedup.

## Where time goes now

Baseline profiled wall time over three seeds (ms). Stage intervals are disjoint progress boundaries; a `water` stage includes planning and private land screens, not just simulation. Failed layouts stay in the denominator. Post-attempt includes naming/outcomes and worker response packing. Instrumentation and inspector add overhead; use the uninstrumented pairs above for before/after.

| Theme | Land | Water/planning | Start/repair | Objects | Resources | Checks | Post-attempt | Failed attempts / all |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| any | 955 | 6173 | 7788 | 1186 | 399 | 1771 | 694 | 8 / 11 |
| riverValley | 1067 | 4029 | 1926 | 351 | 465 | 1137 | 384 | 14 / 17 |
| canyon | 841 | 2690 | 1370 | 422 | 357 | 1228 | 499 | 13 / 16 |
| highlands | 3388 | 7842 | 10493 | 384 | 451 | 1521 | 624 | 53 / 56 |
| lakeBasin | 343 | 1984 | 7102 | 447 | 263 | 1333 | 917 | 2 / 5 |
| delta | 340 | 1829 | 4678 | 313 | 259 | 1522 | 648 | 1 / 4 |
| islands | 3236 | 3755 | 19245 | 300 | 285 | 1949 | 896 | 9 / 12 |

[samples/attempts.csv](samples/attempts.csv) retains every failure reason and attempt duration; [samples/stages.csv](samples/stages.csv) retains each attempt’s stage intervals. Round-local progress indices reset in rescue rounds; global attempt numbers in the attempt sheet do not. Genomes/settles in that sheet are cumulative within the round. Duration includes any field drawn since the previous attempt ended.

## Per crate

Direct exported Wasm calls only (ms and percentage of profiled worker-return wall). Allocation/free/sync calls are included. Rust analysis linked inside `checks` is attributed to `checks`; portable maths linked inside each module belongs to its caller. This is boundary attribution, not separate portable-crate instrumentation. Compilation, serialization, typed-array copies and all JavaScript are outside the direct-call figures. Forces receive no calls on Generate.

| Theme | water | analysis | checks | forces | JS, compile, bridge and packing |
|---|---:|---:|---:|---:|---:|
| any | 5468 (28.8%) | 416 (2.2%) | 380 (2.0%) | 0 (0.0%) | 12703 |
| riverValley | 1614 (17.2%) | 158 (1.7%) | 218 (2.3%) | 0 (0.0%) | 7371 |
| canyon | 1021 (13.8%) | 215 (2.9%) | 190 (2.6%) | 0 (0.0%) | 5981 |
| highlands | 9424 (38.1%) | 534 (2.2%) | 394 (1.6%) | 0 (0.0%) | 14353 |
| lakeBasin | 4827 (39.0%) | 335 (2.7%) | 315 (2.5%) | 0 (0.0%) | 6911 |
| delta | 3212 (33.5%) | 294 (3.1%) | 441 (4.6%) | 0 (0.0%) | 5641 |
| islands | 17274 (58.2%) | 354 (1.2%) | 505 (1.7%) | 0 (0.0%) | 11533 |

## Hot functions and wasted layouts

Exclusive function timings avoid double-counting their instrumented children; smaller untimed helpers remain in the parent. These are profile clues, not independent latency predictions.

| Theme | Largest exclusive costs over three seeds (ms) | Genomes before / after | Attempts before / after |
|---|---|---:|---:|
| any | wasm/water:water_run: 5458; sim/soil.ts:gameSoil: 1098; gen/generate.ts:attemptOnce: 1084; land/hazards.ts:planBadwater: 883 | 5 / 5 | 11 / 11 |
| riverValley | wasm/water:water_run: 1611; land/drainage.ts:drainage: 1105; land/hydro.ts:planHydro: 1017; gen/generate.ts:attemptOnce: 588 | 9 / 9 | 17 / 17 |
| canyon | land/drainage.ts:drainage: 1032; wasm/water:water_run: 1020; gen/generate.ts:attemptOnce: 626; land/hydro.ts:planHydro: 409 | 6 / 6 | 16 / 16 |
| highlands | wasm/water:water_run: 9418; land/drainage.ts:drainage: 3279; land/hydro.ts:planHydro: 1268; land/field.ts:addPart: 1154 | 29 / 29 | 56 / 56 |
| lakeBasin | wasm/water:water_run: 4825; gen/generate.ts:attemptOnce: 1055; sim/soil.ts:gameSoil: 724; gen/settler.ts:startWalks: 571 | 3 / 3 | 5 / 5 |
| delta | wasm/water:water_run: 3206; gen/generate.ts:attemptOnce: 810; gen/settler.ts:startWalks: 483; wasm/checks:checks_run: 441 | 3 / 3 | 4 / 4 |
| islands | wasm/water:water_run: 17265; land/field.ts:addPart: 2277; land/drainage.ts:drainage: 976; gen/generate.ts:attemptOnce: 975 | 10 / 10 | 12 / 12 |

The 15 hottest functions per theme and variant are in [samples/functions.csv](samples/functions.csv); all per-input functions regenerate as `local/functions.csv`. Seven seed-1 V8 CPU profiles per variant are local only. The baseline profile starts cold in Any/1; the remaining calls share that process’s Wasm modules. Candidate profiles follow the identical sequence in a separate process. Profile wall times are not a paired speed comparison. Baseline failures consume 53.30 s, 49.0% of the 108.76 s spent inside attempts. Their frequent reasons include planned promise (29), no start (28), only one start place (10), and a river leaving its course (8).

Highlands/2 spends 27 attempts on 13 genomes; Islands/3 spends 9 attempts on 7 genomes. Reusing builds cannot remove those layout costs. Loosening promise/course/start screens, accepting a different start, or lowering water’s tick cap would select or produce a different map. No such change is proposed. Exact future work could optimize the priority flood’s implementation or water kernels while preserving comparisons, operation order and all byte fixtures; moving more TS computation to Rust needs its own byte proof.

# Round 3 schedule

**Full-run authorization withdrawn.** Tonight's current-dev pilot has finished. No matrix, full suite or automatic future start is scheduled. Wait for M9b on dev, the port/new pilot, and Kyler's newly named window. RUN-AUTHORIZATION.json blocks both full controller entry points.

Oracle **4799800ff4cc14093de8aabf68aa0e7385c32248**; shared portable.rs unchanged. Only 256² remains (D437); Firefox remains (D440); speed gates are dropped (D441). These are elapsed verification costs, not planner benchmarks.

| Machine | Assigned share | Workers | Projected elapsed | Projected peak CPU |
|---|---|---|---|---|
| Kyler's shared PC, 8 cores / 16 threads | 100%: 33,000 target checks, 840 shards | 8 | 1.80 h; range 1.65–1.87 h | 100%, budgeted and unmeasured |

Only this PC is assigned. Worker slots share a queue. Full counts are 2,000 native, 2,000 Node-Wasm and 500 each Chromium, Firefox and WebKit for each of footprint, Craterize, Erupt, Quake, Carve and Glaciate: exactly 30 cells. No count is dropped at 256².

| Part | Measured one-worker pilot seconds | Projected serial worker-hours | Full target checks |
|---|---:|---:|---:|
| Native + Node-Wasm, paired | 207.366 | 5.760 | 24,000 |
| Chromium | 62.702 | 1.742 | 3,000 |
| Firefox | 65.236 | 1.812 | 3,000 |
| WebKit | 85.424 | 2.373 | 3,000 |
| Parts total | 420.728 | 11.687 | 33,000 |

Pilot counts per force: 20 native + 20 Node-Wasm, 5 each browser. All **330 target checks passed, zero identity errors**. Controller wall time was **422.459 s (7 min 2 s)**, including 1.731 s outside shard execution. Whole-machine Windows PDH CPU averaged **15.0%**, peaked **34.9%** over 418 samples, including other sessions. Chromium 145.0.7632.6 was selected from the installed executable after the locked driver's Chromium download timed out; Firefox 155.0 and WebKit 26.6 ran through the locked driver. Every engine's exact rows are retained in local/. No Firefox speed settings were used.

There is one verification pilot observation per cell, explicitly requested as one worker. No repeated planner timings or measured parallel per-part durations are claimed. Native/Node time is combined. Costs include TS reference computation, verification, exports and startup. Parallel parts overlap: serial worker-hours are not elapsed overnight slots. The static scheduler predicts **1.499 h**, plus a **20% allowance = 1.799 h**; the range allows 10–25%. Parallel scaling, memory pressure and later seeds remain unmeasured. Full existing suites/replays are additional and were not run tonight.

Eight independent workers take non-overlapping 25-case shards, longest estimated remaining first; at most six browsers and two per engine. Pause admission below 10 GiB free RAM. Arithmetic and reductions inside each case remain serial. Stop on the first identity failure, retain exact bytes, fix without tolerance, then resume only matching fingerprints. Stop only owned process trees at the named window's end. The model conservatively includes every case rather than deducting the pilot.

**After M9b:** estimate 2–4 hours to re-pin/audit, enable the reused game rules and six-day cap, rebuild/guard and rerun the pilot; see [M9B-PREP.md](M9B-PREP.md). Refresh this projection before the full run. Tonight's 1.80 h is a pre-M9b estimate, not an adoption schedule commitment.

Regenerate compact observations from a completed pilot with `node plan-matrix.mjs --from-pilot`; validate with `node plan-check.mjs`. Both only read/simulate. [parallel-plan.json](parallel-plan.json) records the machine share, [pilot-shard-costs.json](pilot-shard-costs.json) all 24 observations and fingerprints. Raw pilot/build/export/checkpoint data stay under ignored local/round3-dev256/, with sealed-pilot copies retained (D195). [INTEGRATION.md](INTEGRATION.md) gives the build/pilot recipe and later gates.

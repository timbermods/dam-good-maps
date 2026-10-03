# Round 3 scheduling handoff

**Stopped. No Rust forces round 3 workload may start on this PC until Kyler explicitly authorizes it after the other job's measurements.** Process inspection on 2026-10-02 found no running process referencing this investigation. No compilation, identity run, browser run or benchmark was started for this handoff. There is no automatic scheduled start.

| Machine | Assigned share | Workers | Projected elapsed | Projected peak CPU |
|---|---|---|---|---|
| Kyler's shared PC, 8 cores / 16 threads | 100%: 99,000 target checks, 2,520 shards | 8 | 9.79 h; range 8.97–10.19 h | 100%, unmeasured |

Only this PC has been identified and measured; no other machine is assigned work. Workers are process slots on this PC, not eight machines. They share one queue rather than reserving a fixed engine or force per slot, to avoid an uneven finish.

Observed time per part from the existing sequential 1% pilot, summed across all six computations. Columns are elapsed **minutes**, including TS reference computation, exact comparison, exports and cold startup. Native and Node-Wasm are checked together and cannot be given independent durations from this pilot.

| Part | 128² | 256² | 512² | Total pilot minutes | Full projected serial worker-hours | Full target checks |
|---|---:|---:|---:|---:|---:|---:|
| Native + Node-Wasm, paired | 0.858 | 3.678 | 16.037 | 20.573 | 34.288 | 72,000 |
| Chromium | 0.304 | 1.108 | 3.993 | 5.406 | 9.010 | 9,000 |
| Firefox | 0.394 | 1.097 | 3.048 | 4.539 | 7.566 | 9,000 |
| WebKit | 0.334 | 1.230 | 5.502 | 7.067 | 11.778 | 9,000 |
| Total | 1.890 | 7.114 | 28.581 | 37.585 | 62.641 | 99,000 |

Pilot counts per force/size: 20 native + 20 Node-Wasm, 5 per browser. Full counts: 2,000 native + 2,000 Node-Wasm, 500 per browser, for footprint, Craterize, Erupt, Quake, Carve and Glaciate at all three sizes. Every count remains required. Rounded entries may not add exactly. The observed part durations come from sealed sequential completion timestamps; there is one pilot sample per cell, so no repeated-duration median/worst or parallel per-part measurement exists. Total machine CPU during the pilot was mean 20.6%, peak 57.8%, including other sessions.

The full parts run concurrently: do not add the worker-hours to schedule overnight elapsed time. Static scheduling predicts 8.16 hours, plus 20% contention allowance = **9.79 hours**. The 8.97–10.19-hour range uses 10–25% allowance; parallel scaling and later seeds remain unmeasured. Reserve about 10 hours with a possible small overrun, or stop at the window end and resume the outstanding exact cases later. This is the random matrix only; final-arithmetic existing suites/replays need additional time, not yet measured.

Each shard has 25 independent cases. Longest estimated remaining shards first; at most six simultaneous 512² shards, six browser workers total and two per engine; pause admission below 10 GiB free RAM. Arithmetic and reduction order inside each force remain serial and unchanged. Stop on the first identity error, preserve its payload, fix exactly and resume. At the authorized window's end, stop only this runner's owned process trees and retain completed checkpoints. Passed pilot cases may be reused only with matching arithmetic/binary fingerprints; projection conservatively includes every case again.

The controller requires explicit user-authorized start/end timestamps and must be invoked inside that window. It does not schedule a future start. See [INTEGRATION.md](INTEGRATION.md) for the command and final gates. Regenerate the cost model with `node plan-matrix.mjs` and validate with `node plan-check.mjs`; both read compact evidence and run a static simulation only. [parallel-plan.json](parallel-plan.json) records the machine allocation and per-part seconds; [pilot-shard-costs.json](pilot-shard-costs.json) records all 72 force/size/target observations and pilot hashes. Large run outputs and failure payloads remain gitignored under `local/round3/` (D195).

# Round 3 — large brush, October 1

**Incomplete; PR #107 stays draft. The reported 3–4 s freeze remains unexplained.**
Merged latest dev 546fe9fa (merge 92142148); product matches released main e5a6bf35.
Product source remains untouched. Standard uses the release; High is an **unreleased
presentation fixture** (84fe4d36) over released editor/computation/workers.

Edge, Highlands4242 256², Raise Size128, 16-move sweep plus undo/redo. Ryzen9800X3D,
RTX4080 SUPER, 61.6 GiB RAM. Proxy: one logical CPU aggregate job quota, four-core
affinity, native GPU/RAM. **Diagnostic observations, not complete qualified comparisons:**

| Before observation | Worst frame (ms) | Hitches | Outside / total CPU |
|---|---:|---:|---|
| Standard/native, five repeats | 127.4, 133.3, 115.3, 127.2, 103.0 | 32,32,32,35,35 | 9.8–19.7% / 15–64% |
| Standard/native profile | 115.3 | 35 | 2.7–4.2% / 14–31% |
| High/native profile | 157.7 | 37 | 9.1–11.4% / 16–39% |
| Standard/proxy profile | 479.1 | 190 | 9.2–20.1% / 31–81% |

Five native before repeats: median worst **127.2 ms**, worst **133.3 ms**; p99 **6.3 ms**
each. Stroke-only worsts are the same. These runs did not reproduce the multi-second stall.

Executing CPU stacks, not timing overlap, identify smaller stalls (wall/thread CPU):
Standard main `WaterPlayer.push → blendWater` **74.23/72.21 ms**, 90.7% leaf samples;
brush release through `rideObjects` **62.57/59.69 ms**, 89.7% ancestry. High main
`updateTerrainRect → ambientRect` **126.65/122.28 ms**, 63.3% leaf samples. Worker
validation **252.85/242.77 ms** and water substeps **188.56/183.72 ms** run separately.
Proxy brush **479.15/53.50 ms** leaves **425.65 ms non-CPU time unattributed**.
Native dab GC was 3.33 ms. Residual gaps, unprofiled hitches and GPU waiting remain
unattributed; [brush-attribution.json](brush-attribution.json) indexes actual evidence.

The one-file water-mesh buffer experiment is **not an adoption recommendation**.
Its profiled worst was **127.4 ms**, 31 hitches (outside11.6–15.9%, total20–37%);
no pacing gain is established. Forty geometry/contract tests, nine harness tests and
both typechecks pass; seven worker bundles match. One diagnostic pair has identical
snapshot, geometry and actual 873,934-byte export; remaining byte comparisons are missing.
Three contracts initially timed out at5 s on the busy machine, then passed with60 s.

The fresh series discarded two runs at outside CPU **97.69%** (node PID3020 7.36%,
46952/51392 6.79% each) and **86.16%** (chrome PID38676 10.42%, 38700 8.49%,
41668 8.30%), then stopped after15 minutes without requalification. Full process traces
remain ignored locally. Its discarded15,009 ms frame cannot prove a product freeze.

Audit found retry overwrite and incomplete browser stop bounds. Discarded attempts were
preserved; both defects are fixed. Early diagnostics cannot satisfy the corrected gate.
**0/20 complete pairs: all five before/after repeats in both looks/native and proxy remain
required.** After target: worst≤50 ms, p99≤20 ms. `gate.mjs --brush` fails missing coverage.
Visual/audio checks remain unverified. No background run or schedule remains active.

**Water0% after undo: No in this reproduction.** Highlands4242 256² → Refine/Top-down
→ Craterize Power100 Fast → wait → Ctrl+Z → wait: “Water settled”, “Ready to play”,
worker pending0, water queue0. Screenshot retained; interface untouched.

Regenerate via [INTEGRATION.md](INTEGRATION.md); detail in [brush-findings.md](brush-findings.md).
Next: force pops, hour-session memory growth, abuse byte differences. Broad patch rejected;
[ROUND2.md](ROUND2.md) retains history. No successful freeze fix or budget pass is claimed.

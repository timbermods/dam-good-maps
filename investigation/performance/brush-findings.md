# Round 3 — large brush, October 1

**Incomplete; PR #107 stays draft. No proven fix for the reported 3–4 s freeze.**
Merged latest `dev` 546fe9fa (merge 92142148); its product bytes match release
`e5a6bf35`. Standard measures that product. High is an **unreleased presentation
fixture** pinned at 84fe4d36, integrated with released computation/editor/workers.
Product source was never edited. The rejected broad patch remains historical only.

Edge, 256² Highlands seed4242, Raise Size128, 16-move stroke, then undo/redo.
Machine: Ryzen 9800X3D / RTX4080 SUPER / 61.6 GiB RAM; observed ~6.1 ms frame cadence.
Proxy: one logical CPU aggregate Windows job quota, four-core affinity; native GPU/RAM.
These are **diagnostics, not complete qualified comparison evidence**:

| Observation | Worst frame (ms) | Hitches | Other CPU / total CPU range |
|---|---:|---:|---|
| Standard/native before, five repeats | 127.4, 133.3, 115.3, 127.2, 103.0 | 32, 32, 32, 35, 35 | 9.8–19.7% / 15–64% |
| Standard/native before, full profile | 115.3 | 35 | 2.7–4.2% / 14–31% |
| High/native before, full profile | 157.7 | 37 | 9.1–11.4% / 16–39% |
| Standard/proxy before, full profile | 479.1 | 190 | 9.2–20.1% / 31–81% |
| Standard/native allocation experiment, profile | 127.4 | 31 | 11.6–15.9% / 20–37% |

The five native before runs have median worst frame **127.2 ms**, worst **133.3 ms**;
whole-interaction p99 is 6.3 ms in each. Stroke-only worsts are the same; stroke p99
ranges 6.3–18.2 ms. Profiles include instrumentation overhead and cannot establish
before/after improvement. None of these nominally quiet diagnostics reproduces 3–4 s.

Actual sampled stacks inside Chromium tasks establish these smaller stalls (wall / thread CPU):
- Standard main: `WaterPlayer.push → blendWater`, **74.23 / 72.21 ms**, 90.7% leaf
  samples in `blendWater`; pointer-up `BrushPainter.end → rideObjects` task
  **62.57 / 59.69 ms**, 89.7% ancestry through `rideObjects` and brush/integrity work.
- High main: `updateTerrainRect → ambientRect`, **126.65 / 122.28 ms**, 63.3%
  leaf samples in `ambientRect`; pointer-up mixes baking and brush work (**156.02 / 150.25 ms**).
- Standard worker: validation task **252.85 / 242.77 ms** (moisture/regions);
  a stroke-only settle task **188.56 / 183.72 ms**, 56.0% water `substep` leaf samples.
  These execute on dedicated workers, not the renderer main thread.
- Proxy main brush task **479.15 / 53.50 ms**: **425.65 ms non-CPU elapsed is
  unattributed**. GPU tasks also contain long non-CPU intervals; scheduler/GPU/quota
  causality is unproved. GC in the native dab task was 3.33 ms wall, not seconds.

`brush-attribution.json` binds stacks/tasks and every profiled hitch to raw hashes.
Sample fractions are estimates, not exact function durations. Residual gaps, unprofiled
hitches and the historical unprofiled multi-second hitch remain unattributed.

The one-file `brush-adoption.patch` tests reusable water-mesh typed scratch arrays.
**It has not demonstrated a pacing gain; do not adopt it.** Forty geometry/contract tests
and both typechecks pass; all seven worker bundles match. One diagnostic pair has exact
snapshot, final geometry and actual `.timber` export equality (873,934 bytes; SHA256
`6ae369aaafa10d4808a8e73c62fae13754f8aace6c97ece808db97527d6bc19c`).
That single pair does not establish all required final bytes.

The fresh series stopped after two load discards and a 15-minute failed requalification.
Outside CPU peaks were **97.69%** (node PID3020 7.36%, 46952/51392 6.79% each) and
**86.16%** (chrome PID38676 10.42%, 38700 8.49%, 41668 8.30%). Full top-process
samples are preserved; ownership beyond these names/PIDs is unknown. A discarded
15,009 ms frame is not valid evidence of the product freeze.

Audit also found retry-file overwrite and an incomplete recording-end timestamp.
Both discarded attempts were preserved; future attempts now have unique files and
explicit browser interval bounds. Early runs lack those bounds/frozen protocol evidence;
the stricter gate rejects them. **0/20 complete pairs: all five before/after repeats for
both looks and both profiles remain required.** Target: after worst ≤50 ms, p99 ≤20 ms.
`gate.mjs --brush` fails missing coverage; no zero-fault claim. Visual/audio oracles were
not revalidated in this round. No background runner or new schedule remains active.

**Undo water status: No, in the current-dev reproduction.** Highlands4242 256² →
Refine/Top-down → Craterize Power100 Fast → wait → Ctrl+Z → wait. Observed
“Water settled”, “Ready to play”, pending worker=0, water queue=0; screenshot retained.
No interface fix was made. This establishes this reproduction, not every undo sequence.

Regeneration: [INTEGRATION.md](INTEGRATION.md); raw traces/media stay ignored locally.
Next targets: force pops, hour-session memory growth, abuse final-byte differences.
Round 2 findings remain in [ROUND2.md](ROUND2.md).

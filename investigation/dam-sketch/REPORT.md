# Dam sketch, round 2

**Live adoption gate remains open.** The worker experiment and byte-preserving
overhead reductions are delivered; game calibration is written and unrun. Start:
dev `c720cfe1`, rebased onto `071aa068` after dev advanced; measured worker bundles
unchanged. Branch `investigation/dam-sketch-2`; product code unchanged against dev.

Ryzen 7 9800X3D, 16 logical CPUs; Chromium 145, corrected optimizing-only Firefox
146.0.1 and Windows Playwright WebKit 26. Three fresh-worker repetitions of three
River Valley walls per size, 12 wall changes at least 100 ms apart; 8-tick fill /
128-tick drought publications. **Every timing is provisional: CPU mean 98.72–99.62%.**
Every repetition's CPU span/samples are attached in browser-timings.json/CSV.

First water is a canvas upload in rAF (earliest paint opportunity); compositor
presentation is unmeasured. Startup/map parsing/warmup excluded. Fill runs from the
final wall change to the stopping check; drought is the subsequent explicit nine-day
pass. All 54 measured fills settled. “Missing” changes were superseded before a preview;
visible-only medians must be read with that column.

| Browser / size | First water ms med / worst | Main callback worst ms | Fill s med / worst | Drought s med / worst | Missing previews | Mean CPU |
|---|---:|---:|---:|---:|---:|---:|
| Chromium 128² | 33 / 100 | 1.1 | 1.47 / 5.03 | 1.72 / 3.13 | 0/108 | 99.24% |
| Chromium 256² | 68 / 101 | 3.7 | 7.75 / 16.22 | 5.27 / 6.30 | 36/108 | 98.72% |
| Firefox (optimized) 128² | 31 / 73 | 2.0 | 1.44 / 2.83 | 1.47 / 1.85 | 0/108 | 99.47% |
| Firefox (optimized) 256² | 99 / 596 | 24.0 | 7.43 / 15.15 | 5.64 / 6.46 | 86/108 | 99.30% |
| WebKit (Windows) 128² | 60 / 108 | 61.0 | 1.26 / 2.55 | 1.50 / 1.84 | 4/108 | 99.60% |
| WebKit (Windows) 256² | 140 / 419 | 114.0 | 7.57 / 15.11 | 6.38 / 8.10 | 95/108 | 99.62% |

| Browser / size | Progressive paint cadence ms med / worst | Cancel acknowledgement worst ms |
|---|---:|---:|
| Chromium 128² | 17 / 283 | 21 |
| Chromium 256² | 34 / 365 | 163 |
| Firefox (optimized) 128² | 17 / 104 | 13 |
| Firefox (optimized) 256² | 33 / 594 | 499 |
| WebKit (Windows) 128² | 17 / 134 | 61 |
| WebKit (Windows) 256² | 35 / 524 | 274 |

575 mid-fill cancellations verified, 594 cancellation/supersession acknowledgements;
zero stale packets displayed. Frame-work scope sums sketch message and rAF callbacks.
Observed over-budget callbacks: Firefox 256² and WebKit at both sizes. rAF stalls
also occur in worker-free references (browser-controls.json); **the strict causal
“no frame over 16.7 ms” guarantee is unproven**, including Chromium. Headed editor
and compositor measurements on a low-load host remain required.

**Feel:** 128² Chromium/Firefox support live progressive feedback in this cohort.
256² is unreliable while dragging in every engine; WebKit also misses 128² updates.
Keep the wall immediate, mark earlier water pending, bound canvas/texture uploads,
coalesce before expensive construction and cache immutable topology. Next, measure
the approved multi-core water path at 256² in Chromium/Firefox, including pool
startup, copies and cancellation; retain byte gates. No speedup is assumed. Stacked
water needs its own optimization; Rust threads remain under investigation.

**256² profile:** Rust substep dominates (76.96% of 112,138 CPU samples, including
identity overhead). Removed duplicate volume/mask scans, heightfield temporaries,
BFS neighbour arrays and per-tick reapplication of constant forcing. Reporting
8.82 → 8.28 s across the paired diagnostic cohort (6.1% less), CPU
99.96%; provisional, one pass, no overall speedup claim. The dominant
physics cost remains. Profile timings and every before/after digest are retained.
Original **12 checks and TypeScript pass**; all 2200 round-one publications/column
digests and 846 varying-forcing/seep/signed-zero/roof contracts match,
excluding only runtimeMs. Compact browser final fields agree across all engines.

**Probe calibration, NOT RUN:** six authored recipes and schema-1 job template,
early roof checks, fixed reservoir masks and exact predictions; CALIBRATION.md.
Values below are at the engine's fill stop (often its unsettled six-day cap),
followed by measured dry-out days from that boundary; no source or consumption.

| Wall | Surface level range | Held m³ | Dry-out days |
|---|---:|---:|---:|
| dam | 1.031060–1.031060 | 0.870 | 0.204427 |
| levee | 1.592772–1.592772 | 16.598 | 9.027344 |
| gate-1.5 | 1.732441–1.732441 | 20.508 | 11.220052 |
| stacked-dams | dry | 0.000 | 0.000000 |
| bent-foundations | 1.886997–1.886997 | 24.836 | 13.647135 |
| roofed | 4.031060–4.031060 | 0.870 | 0.204427 |

Pass: level ±0.01, volume ±max(0.05 m³, 1%), dry-out ±8/768 day; compare every
column and checkpoint. **Current Probe cannot place these walls or restore the
prescribed initial columns:** dedicated-machine scene staging/verification is
required before its job template is executable. No game-exact claim is established.
No Timberborn launch, game assets, blueprint data or decompiled code committed.

Regenerate exactly: README.md. Dependencies, baseline source/maps, Wasm, full profiles,
raw frame logs and column predictions stay in ignored local/ (D195); compact evidence,
original code and three captures are committed. Licence: AGPL-3.0-or-later.

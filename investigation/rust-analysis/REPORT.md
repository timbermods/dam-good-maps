# Rust analysis investigation

Base: feature/m9b `e292cefe`; product sources unchanged. One Rust
source builds scalar Wasm, a native executable and a Node addon. It reuses the
pinned Rust-water toolchain/source and resident native settle.

The largest measured analysis costs were mine-room scans, spill fields and dam
candidates. Nine kernels are ported; the fixed measured policy enables six.
Start/mine rules, must-pass checks, theme outcomes and M9b measures keep their
TypeScript orchestration. Cheap label scans keep TypeScript defaults.

**Identity:** all 840 M9b inputs (seven themes, seeds 1–40, 96²/128²/256²,
including two matching generator refusals), 19 official
maps, 12 golden fixtures and 1,762 edge/lifetime comparisons pass. Every captured
kernel output byte and complete final checks/measures/outcomes agree in Chromium
145.0.7632.6, Firefox 146.0.1, WebKit 26.0 and native.
Paired complete M9b generation agrees on deterministic state and export bytes;
all three native batches agree while using native Rust water. Browser coverage
replays complete generation traces; seven timing maps also run full generation.
Every default M9b descriptive row is additionally replayed in each engine.
Only clock/CPU measurements are excluded. Strict floating-point IR, adapter
types, standalone executable and resident-water contracts pass.

256² analysis during generation, **median/worst** of three repetitions per theme,
aggregated over seven themes (per-map average; bridge costs included):

| Target | Analysis seconds: TS → Rust | Generation share %: TS → Rust |
|---|---:|---:|
| chromium | 3.52/3.78 → 2.76/3.10 | 11.00/11.90 → 9.36/10.12 |
| firefox | 4.03/4.23 → 7.30/7.35 | 13.29/13.35 → 22.38/23.01 |
| webkit | 16.15/17.20 → 9.81/10.48 | 27.05/28.06 → 18.70/20.90 |
| native | 9.96/10.40 → 7.17/7.71 | 14.60/14.95 → 11.99/12.91 |

The full default M9b measure batch, all 840 maps on **16 threads**, including native
water settle, worker startup and verification: **18.52/19.82 minutes**
(median/worst, three repetitions). Ryzen 7 9800X3D; recorded total CPU load was
approximately 100%, with a 100% peak. These are shared-machine observations.
[TIMINGS.csv](TIMINGS.csv) contains every analysis/kernel at each size, its three
samples, median/worst and load; [GENERATION.csv](GENERATION.csv) contains all paired
generation samples. [EVIDENCE.json](EVIDENCE.json) binds sources, binaries and gates.

**Adoption:** Firefox regresses, especially mine-room scans. Keep its TypeScript
backend until the performance gate passes. Chromium/WebKit/native show gains;
actual product-worker adoption still needs a milestone check. The default M9b
measure set is tested; optional weather-cycle measures are outside this study.
Large traces and binaries stay in ignored `local/`; regeneration and exact
interfaces are in [INTEGRATION.md](INTEGRATION.md).

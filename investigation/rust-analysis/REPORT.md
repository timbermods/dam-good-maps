# Rust analysis investigation

Product code is unchanged. One Rust source builds Wasm and native analysis,
using the existing Rust-water toolchain and unchanged resident native settle.
Nine kernels are ported; the fixed policy enables six.

**Firefox follow-up:** the old regression came from the baseline-pinning test
debugger. Under the corrected optimizing-only Firefox 146.0.1 setup, 256²
analysis during generation takes **2.18/2.21s TS →
1.47/1.47s original Rust → 1.35/1.39s improved Rust**
(median/worst, three repetitions across seven themes). Improved Rust uses
**38.0% less analysis time than TS**. The port adds mine-room early exits,
cached coordinates and validated buffer access, preserving arithmetic and order.

**Identity:** all 840 M9b inputs (two matching refusals), 19 official maps,
12 golden fixtures and 1,762
edge/lifetime comparisons pass in Chromium, corrected Firefox, WebKit and native.
All 257,237 captured kernel outputs, complete final checks/measures/outcomes,
every default M9b browser row and every complete native export agree.
The checked-buffer corpus, strict IR, adapter types, executable and resident-water
contracts pass. Only clock/CPU measurements are excluded.

Current Firefox timings, load, adoption gate and regeneration are in
[PROFILE_REPORT.md](PROFILE_REPORT.md) and [INTEGRATION.md](INTEGRATION.md).
[PROFILE_EVIDENCE.json](PROFILE_EVIDENCE.json) binds the improved port's proof.
Original **c336b37e** measurements remain in [EVIDENCE.json](EVIDENCE.json),
[TIMINGS.csv](TIMINGS.csv) and [GENERATION.csv](GENERATION.csv): its full native
840-map batch on 16 threads measured **18.52/19.82 minutes**, including Rust water.
That historical batch and other-engine performance have not been retimed here.
Large traces/binaries stay out of git.

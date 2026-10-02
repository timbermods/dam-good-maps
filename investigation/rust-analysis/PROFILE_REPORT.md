# Firefox analysis follow-up

The original Firefox regression was a harness artifact: Playwright 1.58's
Juggler debugger pinned Wasm to baseline. Reusing Rust-water's two
[upstream debugger flags](https://github.com/microsoft/playwright/blob/v1.63.0/browser_patches/firefox/juggler/content/Runtime.js#L53-L57)
enables optimization in the **same Firefox 146.0.1 executable**.
Baseline JIT is explicitly disabled; both Wasm modules instantiate and run.
No shared browser installation or product source changed.

The improved port uses early exits and cached coordinates in mine-room scans,
and validated fixed-buffer access in room/dilation scans and dam floods.
Arithmetic, traversal/list order and the fixed six-kernel policy stay unchanged.
The original Rust control is recompiled from **c336b37e** with the same toolchain.

**Firefox 256², milliseconds median/worst:** three repetitions per theme,
aggregated as the per-map average over seven seed-1 themes. Encoding/copies count;
initialization, warmup and result comparison do not. All columns below use the
corrected optimizing-only setup.

| Analysis | TypeScript | Original Rust | Improved Rust |
|---|---:|---:|---:|
| roomMap | 866.86/889.57 | 273.57/276.43 | 214.57/216.86 |
| damSites | 472.86/518.00 | 85.00/87.79 | 84.38/86.29 |
| spillLevels | 17.21/18.79 | 7.61/7.67 | 7.67/8.61 |
| checks | 952.43/959.14 | 532.14/559.57 | 508.71/524.14 |
| measures | 20.90/24.21 | 12.68/13.43 | 13.00/13.13 |
| outcomes | 26.00/50.14 | 39.29/41.14 | 27.86/44.79 |
| m9bMeasures | 2.72/9.25 | 2.51/2.59 | 3.67/3.80 |

During complete 256² generation, analysis seconds **median/worst**:
TS **2.18/2.21**, original Rust **1.47/1.47**,
improved Rust **1.35/1.39**. The improved port takes
**38.0% less analysis time than TS** and **8.2% less than original Rust**.
Generation shares: **12.54/12.63% → 8.99/9.11% → 8.36/8.44%**.
The historical baseline-pinned 4.03/4.23s → 7.30/7.35s result is superseded;
it is preserved in EVIDENCE.json, not mixed into this paired cohort.

**Identity:** all 840 M9b inputs at 96²/128²/256² (including two matching
refusals), 19 official maps, 12 golden
fixtures and the edge contract pass in Chromium, corrected Firefox, WebKit and
native: **257,237 kernel calls**. Every full default M9b descriptive
row also passes in all engines; all 840 native generations/state/measures/export
bytes pass with unchanged resident Rust water. The checked-buffer build replays
the same entire corpus without an invalid access. 1,762 edge/lifetime comparisons,
744 water contracts, executable/type checks and strict floating-point IR pass.
Only measured clock/CPU fields are excluded from deterministic identity.

Ryzen 7 9800X3D, shared PC, 16 logical threads. Timing work began after this
investigation's identity workers finished. Analysis load: **99.1% mean, 100.0% peak (460 PDH samples)**;
generation load: **99.4% mean, 100.0% peak (1046 PDH samples)**. These are observations, not isolated-host guarantees.
The corrected setup clears Firefox's generation-analysis regression. Cheap
outcome and descriptive-row medians retain overhead; keep those
contexts on TS at adoption until actual product-worker measurements show gains.

[PROFILE_TIMINGS.csv](PROFILE_TIMINGS.csv) has every analysis at all three sizes.
[PROFILE_EVIDENCE.json](PROFILE_EVIDENCE.json) binds source/binary/runtime hashes,
all samples/load and identity gates. [INTEGRATION.md](INTEGRATION.md) gives
regeneration commands; large results remain in ignored local/.

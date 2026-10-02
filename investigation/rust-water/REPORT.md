# Rust water investigation

Base **e292cefe**; product code unchanged. One Rust source builds scalar Wasm and native; the browser adapter retains TS stopping/slicing around Rust ticks. The threaded experiment extracts its kernels from that source and reuses parallel-water's coordinator/isolation at **68d68313**. Adopt after M9b releases; see INTEGRATION.md.

**Identity:** 1952 schedules, 39,529 captured checkpoints per target, zero byte differences in Chromium 145.0.7632.6, Firefox 146.0.1, WebKit 26.0 and Windows native. Includes all 840 M9b theme/seed/size inputs, 19 official maps, their live edits, 43 full drought/badtide pairs, three tiled 512² stress maps, 24 golden runs and 118 edge/fractional/sealed scenes. Depth, contamination, momentum, Dold, saturation, seep state, volume and stop metadata are compared. All 38 existing pinned digests pass. Threaded: 21,600 per-tick golden checks plus the 12 representative canonical cases in each engine at 1/2/4 cores. Python: 63 generated maps load/round-trip cleanly; 22 generated + 19 official validator comparisons have zero disagreements. Generator refusals in the 840 corpus: 2, retained as numerical inputs and listed in evidence.json.

**Speed:** per-case timings use three repetitions after one warm-up, on Ryzen 7 9800X3D (8 cores/16 logical), Windows x64. CPU load averages ranged 75–100%, peak 100%; concurrent investigation work ran on this shared PC. These are observed under-load ratios, not quiet-machine projections. Cells show **old/fast speed-up; Rust median/worst seconds**, summing three separately timed theme examples per size. Old is b01f113c with the same six-day cap. Ratios below 1 mean Rust is slower. Per-case samples and load are in evidence.json. Timings include construction, simulation and serialization; asset fetch/compilation and threaded pool startup are outside per-case timings.

| Size | Chromium | Firefox | WebKit | Native |
|---|---|---|---|---|
| 96² | 2.10×/1.77×; 2.68/2.77 s | 0.38×/0.24×; 17.79/18.95 s | 0.92×/0.60×; 3.44/3.60 s | 3.65×/2.25×; 2.06/6.03 s |
| 128² | 2.12×/1.65×; 3.59/3.82 s | 0.32×/0.23×; 26.51/27.34 s | 0.84×/0.63×; 6.20/6.27 s | 2.95×/2.04×; 3.54/4.48 s |
| 256² | 2.45×/1.65×; 18.26/18.99 s | 0.36×/0.24×; 151.04/159.14 s | 0.92×/0.58×; 34.55/37.06 s | 2.54×/1.79×; 21.85/22.53 s |
| 512² | 1.90×/1.41×; 109.99/112.31 s | 0.37×/0.24×; 668.51/733.35 s | 1.05×/0.62×; 144.66/154.75 s | 1.73×/1.34×; 214.19/299.92 s |

Threaded cells show **speed-up versus fast TS (median/worst seconds)** for 2 / 4 total cores, using the same example sums. Fixed barriers preserve bytes; extra cores can lose on smaller maps.

| Size | Chromium 2 / 4 cores | Firefox 2 / 4 cores | WebKit 2 / 4 cores |
|---|---|---|---|
| 96² | 1.13× (4.21/4.29 s) / 1.34× (3.52/3.80 s) | 0.52× (8.40/8.68 s) / 0.65× (6.65/6.71 s) | 0.52× (4.01/4.15 s) / 0.04× (54.96/69.97 s) |
| 128² | 0.83× (7.09/7.18 s) / 0.87× (6.77/6.87 s) | 0.50× (12.20/12.22 s) / 0.64× (9.45/9.48 s) | 0.53× (7.35/7.67 s) / 0.33× (11.70/65.67 s) |
| 256² | 1.28× (23.42/23.47 s) / 1.21× (24.87/25.99 s) | 0.59× (60.03/60.47 s) / 1.04× (34.17/34.19 s) | 0.86× (23.08/24.41 s) / 0.13× (154.85/210.70 s) |
| 512² | 1.40× (110.70/114.33 s) / 1.54× (100.82/111.88 s) | 0.49× (332.16/334.70 s) / 0.74× (218.94/238.86 s) | 1.17× (76.57/81.35 s) / 1.29× (69.32/94.04 s) |

**Full 840-map settle batch, 16 threads, median/worst:** old: 331.2/345.3 s; fast: 281.0/300.7 s; native: 146.2/150.5 s. Native versus old/fast: 2.27×/1.92×. Three fresh-process runs per backend, with no batch warm-up. Includes worker/process startup and input/output handling; JS also hashes results during the timed pipeline. Terrain generation, prefill and M9b's other measurements remain TypeScript, so this is not a complete end-to-end M9b run.

**Adoption choice:** prioritize native batch use. Chromium merits worker integration measurements; retain TypeScript as the scalar default in Firefox and WebKit under these results. Keep threaded Wasm a separate experimental candidate.

**Delivery:** scalar Wasm 61231 B raw / 24392 B gzip / 20481 B Brotli; shared kernels 5056 / 1878 / 1707 B. Pin Rust 1.90, add wasm32 target and a pre-Vite Rust build to CI. The proposed CI is uninstalled. TS fallback passes when Wasm is unavailable/corrupt. Strict Wasm/native/shared LLVM IR checks pass: no FMA, relaxed arithmetic or transcendental intrinsics.

**Limits:** tested finite valid models and installed engines on Windows x64; Linux/ARM and milestone integration still need CI verification. Current weather forcing agrees at the actual 12-tick cadence; one-tick forcing has 11 WebKit value differences. Portable maths removes those differences but changes today's forcing (6 values at the real cadence), so that result-changing option is separate. Threading needs isolation and Rust's experimental atomics build flag. WebKit closed once during threaded timing; the unchanged-binary retry passed, and the interruption/outliers are retained in evidence.json. Large fixtures, binaries and logs are ignored; INTEGRATION.md gives regeneration commands.

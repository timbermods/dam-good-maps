# Rust water with threads

Minimize summed case medians; within 5% of both median and worst sums, prefer fewer threads. Full 1/2/4/8/16 Rust/TS results and per-repeat load: [evidence.json](evidence.json). Product code is unchanged.

| Engine / size | Proposed settle | Sum of case median / worst (s) | Gain vs scalar TS / Rust | CPU mean / status |
|---|---|---:|---:|---|
| chromium / 128² | Rust 2 threads | 1.58 / 1.67 | 2.42× / 1.15× | 41–48% / provisional |
| chromium / 256² | Rust 4 threads | 6.24 / 6.36 | 3.85× / 1.65× | 49–73% / provisional |
| chromium / 512² | Rust 16 threads | 20.61 / 21.12 | 5.75× / 2.46× | 53–55% / provisional |
| firefox / 128² | Rust 4 threads | 1.34 / 1.49 | 2.44× / 1.07× | 43–66% / provisional |
| firefox / 256² | Rust 4 threads | 4.91 / 5.08 | 3.26× / 1.46× | 46–52% / provisional |
| firefox / 512² | Rust 8 threads | 18.40 / 20.54 | 4.58× / 2.36× | 59–69% / provisional |
| webkit / 128² | TS 8 threads | 1.14 / 1.22 | 2.01× / 2.17× | 38–56% / provisional |
| webkit / 256² | TS 8 threads | 4.65 / 5.18 | 2.66× / 2.86× | 49–66% / provisional |
| webkit / 512² | TS 8 threads | 19.40 / 21.20 | 3.39× / 3.72× | 60–69% / provisional |

Table: 243 additional rotating-order paired runs, selected candidate versus full scalar Rust/TS. Original screen remains in evidence; alternative thread counts were not all remeasured together.

**Method:** Three themes, seed 1, 128²/256²; tiled stress maps at 512². One warm-up and three settles/cell (891 screen runs). Simulation, typed copies and barriers timed; construction/encoding/output checks excluded. Typed shared maps stay resident between phases; one Rust call/worker/phase. Table sums case medians/maxima. Ryzen 7 9800X3D, Windows x64.

**Firefox:** rust-analysis/PROFILE_REPORT.md’s corrected diagnostic runtime; baseline Wasm off, optimizing tier on, lazy tiering off on every measurement. No baseline-pinned debugger.

**Identity:** 216,000 per-tick byte checks at 1/2/3/4/7/8/16 threads; all timed outputs/stopping ticks agree. Disjoint writes, barriers, serial sources and ordered reductions give the [proof](IDENTITY.md). Failure/private-array checks, TypeScript, strict IR and three Rust guards pass.

**Load/forcing:** Every repeat has CPU mean/peak; means above 20% and policies based on those comparisons are provisional. All engines receive identical forcing bytes; 33 one-tick Weather checks with varying precomputed forcing pass. Portable maths is separate.

**Dispatch:** Counts include the coordinator. Keep 1,024 entries/thread/phase and budget concurrent pools. Rust threads retain TS bookkeeping/stopping. For short tasks, account for startup; failed phases discard state and retry fresh.

**Ship?** Threaded Rust is experimental, not ready as default: stable Rust 1.90’s unsupported atomics warning remains. The no_std kernel avoids shared allocators/TLS; JS owns barriers and instances own stacks. Keep pinned builds/fallback, no nightly. [Rust tracking](https://github.com/rust-lang/rust/issues/77839). 7 historical browser interruptions retained; corrected matrix has 0. Integrated lifecycle/cancellation remains gated. Windows WebKit is not Safari; 512² is stress-only.

[Reproduce](README.md) · Large results and interrupted logs remain ignored in local/.

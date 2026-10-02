# Rust water with threads

Investigation only, branch `investigation/rust-threads`, based on dev `4aab909e`. Product code is unchanged. Read [REPORT.md](REPORT.md) for the measured policy, [IDENTITY.md](IDENTITY.md) for the partition/ownership argument, and [evidence.json](evidence.json) for the compact full matrix. Large inputs, binaries, browser copies, profiles and raw samples stay in ignored `local/`.

The profiled scalar Rust implementation is preserved alongside a hybrid shared-memory candidate: Rust flow/depth/dam kernels, with the identical TypeScript bookkeeping and stopping test. Threads include the coordinator. The TypeScript control uses the same extracted loops and parallel-water runtime. All candidates use the six-day cap and the same archived input bytes. 512² maps are tiled water stress models; the current generator caps normal maps at 256².

## Reproduce

Use Node 24, Rust 1.90 (wasm32-unknown-unknown installed), esbuild 0.25.12, TypeScript 5.9.3 and Playwright 1.58.2 with its installed Chromium/Firefox/WebKit. Set paths explicitly; no global installation is modified. The prior Rust investigation's ignored archive supplies `checks.json` and `checks/*.in,*.expected` (regenerate with its corpus/prepare-checks scripts if absent). Expectations are SHA-256-attested and freshly checked against scalar TS within each engine.

```powershell
cd investigation/rust-threads
$env:DGM_DEPS = 'C:/path/to/pinned/node-runtime'
$env:DGM_CHECKS = 'C:/path/to/rust-water/local'
$env:DGM_RUSTC = 'C:/path/to/Rust-1.90/bin/rustc.exe'
$env:DGM_CARGO = 'C:/path/to/Rust-1.90/bin/cargo.exe'
$env:RUSTC = $env:DGM_RUSTC
node build.mjs
& $env:DGM_CARGO test --lib --target-dir local/target # native Rust guard checks; matching native linker required
# Make an investigation-local diagnostic Firefox copy as PROFILE_REPORT.md describes.
# Its Runtime.js must contain allowUnobservedWasm/allowUnobservedAsmJS = true.
$env:DGM_FIREFOX_EXECUTABLE = 'C:/path/to/local/firefox-optimizing/firefox.exe'
node verify.mjs
node run-matrix.mjs --smoke
node run-matrix.mjs
node prepare-weather.mjs
node weather-check.mjs        # identical precomputed one-tick Weather forcing in every engine
node repair-load.mjs         # repeat any <1 s cell that fell between PDH samples; retain old cohort
node summarize.mjs
node confirm.mjs             # selected policy vs scalar Rust/TS, three paired repeats after load changed
node summarize.mjs
git diff --check
```

`measure.mjs` rejects old Firefox debugger settings, disables its baseline Wasm compiler for every launch, and requires cross-origin isolation from parallel-water's unchanged service worker. The host itself sends no isolation headers. The policy remains one service worker, one registration and one fetch handler: merge any future caching into that worker, preserve CORS/CORP, safe waiting updates and cached-response isolation. The prior study verified the full isolation lifecycle; this study rechecks actual isolated shared-memory execution in all three engines.

Timing runs are sequential, one pool at a time. Each configuration gets one untimed warm-up followed by three complete canonical settles. Candidate order reverses between cases in Chromium/Firefox. Windows WebKit uses a fresh browser per case/backend/count after repeated closures when reusing processes; failures and partial progress are retained, and only matching fingerprints resume. Only simulation/settle calls are timed. Construction, model encoding, forcing updates, snapshots, serialization, byte checks, hashing, input fetch and compile/install are outside the timer. Typed-array migrations, stopping checks and phase barriers remain inside. The typed shared map stays resident between all phases of a run batch; each worker makes one Rust call per phase for its whole range. Startup is measured separately. Do not interpret sums of three case medians/maxima as the median/max of a timed batch.

Windows PDH samples total machine CPU once per second, including uncontrolled activity on this shared PC. Each repeat resets its sampler and records CPU mean/peak over that invocation, including untimed output verification. Any mean above 20% marks that repeat and the associated policy provisional. All raw samples and interrupted runs remain local; compact evidence keeps every repeat's load, per-case median/worst and startup. Other users' jobs remain uncontrolled. Proposed defaults apply to this CPU/runtime/workload.

Cells shorter than a PDH interval use explicitly labelled 100 ms `os.cpus` deltas. Earlier cells without a PDH reading are repeated completely by `repair-load.mjs`; their original timings are retained, and a later load reading is never substituted onto an earlier timing. Paired confirmation rotates the selected candidate and both scalar controls within each case.

Compact committed evidence rounds numbers to three decimals and keeps one matrix entry per line. Full precision, raw CPU series and both timing cohorts remain ignored; their hashes and the retained identity cohort are attested in the evidence.

Adoption still needs compiler/toolchain gating, coordinator API readiness, cancellation/task IDs and a combined budget across generator, live-edit, checks and background workers. Hardware concurrency is an upper bound. Shared workspace is reused; returned arrays remain private. Missing isolation/blocked helpers select scalar before work; failed tasks are discarded and retried fresh. Rust 1.90 stays stable, including its unsupported atomics target-feature warning: passing this investigation is insufficient to ship threaded Rust as the default. The generated no_std kernel has no allocator or Rust synchronization library; JavaScript owns barriers and each instance owns its stack. Keep a pinned experimental build and scalar fallback; do not switch to nightly. [Rust's tracking issue](https://github.com/rust-lang/rust/issues/77839) describes the unsettled support boundary.

Firefox uses the corrected optimizing-tier setup from rust-analysis/PROFILE_REPORT.md (the same diagnostic flags as rust-water). Baseline Wasm is disabled on every measurement, and the optimizing tier is enabled. One-tick Weather uses a single Node-computed forcing sequence encoded as binary64 and fed identically to every engine; browser-native transcendental forcing is never recomputed. Portable maths is a separate task.

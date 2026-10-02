# Firefox profiling

`PROFILE_TIMINGS.csv` contains all 27 reported timings with their own CPU mean, peak and sample count. **All are provisional:** measured mean CPU load was 46.5–85.3%, above the 20% gate. No adoption speed claim follows from these measurements.

The setup follows rust-analysis/PROFILE_REPORT.md: an isolated, read-only Firefox diagnostic copy with Runtime.js flags `_debugger.allowUnobservedWasm` and `_debugger.allowUnobservedAsmJS` set true. Firefox preferences disable wasm_baselinejit and wasm_lazy_tiering and enable wasm_optimizingjit. firefox-runtime.mjs verifies these settings and records executable/archive/runtime hashes. The user's shared browser installation is untouched.

Run `node investigation/portable-math/profile.mjs` with DGM_DEPS pointing at the matching pinned runtime and DGM_FIREFOX_EXECUTABLE pointing at the isolated corrected firefox.exe if its default study path differs. The runner compares native/TypeScript/Rust exp, hypot and pow on 128 fixed finite inputs, checks TS/Rust bits before timing, warms up, rotates variants, and records three repetitions lasting at least three seconds each. Windows PDH measures Processor(_Total) % Processor Time separately for every repetition. Missing CPU data is also provisional. Identity-suite elapsed clocks are discarded; they are not performance measurements.

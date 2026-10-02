# Rust forces — draft investigation

**Incomplete; do not adopt.** Carve and Glaciate are unported. Complete water/playback records, exported bytes, the full existing suites against Rust, and the thousands-per-force/size/target identity gate remain open. `node acceptance.mjs` fails deliberately.

Based on dev `4aab909e`, reusing rust-water `d18a6f4d`. Only this investigation changes. One Rust source builds Craterize, Erupt and Quake planning plus object footprints for Wasm and native; presentation stays in the product's TypeScript.

**Pilot identity:** 144 native/Node-Wasm cases (12 per implemented planner/object-footprint job and map size). 432 Chromium/Firefox/WebKit comparisons also match the Node hashes. Comparisons cover canonical plan state and listed fields, not full exported operations. Strict native/Wasm LLVM math guards pass; 75 focused TypeScript baseline tests passed after harness corrections. The broad suite was interrupted.

**Performance:** observed regressions fail D380. Full-Power Erupt at 512²: native 1596.77 / 1609.00 ms versus TypeScript 320.34 / 379.64 ms (median / worst). See [all repetitions and load](MEASUREMENTS.md) and [evidence](evidence.json). Shared-PC CPU load ranges from about 49% to 100%; the generic value/serialization boundary remains costly. Carve and Glaciate have no before/after measurements.

**Wasm download:** 346934 B raw / 114376 B gzip / 90745 B Brotli, including retained water exports. Large results are ignored; [INTEGRATION.md](INTEGRATION.md) gives regeneration and the remaining D381 adoption work. No tag, merge, or product TypeScript deletion occurs here.

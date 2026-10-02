# Rust forces — round 2

**Not adoptable yet.** allWaterAndPlaybackRecords, existingTestsAgainstRust, thousandsPerForcePerSizePerTarget, existingCrossEngineDeterminism, productExportBytes.

All five forces and footprints use typed Rust structs/flat arrays, numeric object slots and stable shared Wasm map buffers. One operation call; serde_json is cold fixture/debug only. TypeScript keeps presentation. AGPL-3.0-or-later. Dev `4aab909e`; rust-water `2ebeea87`, including its isolated Firefox debugger fix. Product files unchanged.

**Speed:** first-three PASS (72/72 cells); all-five PASS (120/120), plus 24 footprint cells. Five repeats, median / worst. Full-Power Erupt Fissure 512² native: TypeScript 272.26 / 275.90 ms; Rust compute 80.05 / 81.17; Rust + boundary 80.73 / 81.81. Shared-PC CPU mean range 33.3–83.6%. [All columns, modes, engines and loads](MEASUREMENTS.md). Earlier nested diagnostic reconstruction failures remain in `diagnostic-measurement-evidence.json`.

**Identity:** 0 sealed random native/Node-Wasm cases; 0 browser comparisons; required: 2,000 per force/size/target. Accepted gestures include .timber byte checks. Existing native/Wasm contracts 0/186; full three-engine browser suites unfinished, including existing determinism. Retained-map/edge gate PASS. Counts, refusal counts, hashes and exact scope: [evidence.json](evidence.json).

**Download:** 814253 B raw / 262703 B gzip / 206580 B Brotli; no production Wasm imports. Strict native/Wasm arithmetic guard pass. [Regeneration and adoption](INTEGRATION.md). Large generated outputs stay ignored. The adoption session tags `ts-forces-final` and deletes adopted TypeScript in the Rust order; this investigation performs neither. `node acceptance.mjs` remains red while a required gate is open.

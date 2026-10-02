# Rust forces — round 3

**Identity only; not adoptable.** Round-2 speed is accepted provisionally; no timing work this round. Product files unchanged.

Shared portable.rs applied; strict native/Wasm source, IR, assembly and unstripped Wasm guard PASS.

allWaterAndPlaybackRecords closed: Missing a separate completeness proof: the gate was coupled to finishing the random corpus; full typed raw/final water, every playback tape and total/step timing are now checked against the complete TS record.
productExportBytes closed: Missing separate current-arithmetic proof of native opaque-component order/JsonFloat tokens through the actual product writer; native and all Wasm bindings now compare .timber bytes independently of corpus completion.

Pilot: 37.6 minutes; projected sequential full matrix 62.6 hours; mean / peak total CPU 20.6% / 57.8% (shared PC, including other sessions). Projection includes cold verification and browser startup, not force planning timings.

Counts are Native / Node-Wasm / Chromium / Firefox / WebKit for each cell.

| Force | 128² | 256² | 512² |
|---|---|---|---|
| footprint | 20/20/5/5/5 | 20/20/5/5/5 | 20/20/5/5/5 |
| craterize | 20/20/5/5/5 | 20/20/5/5/5 | 20/20/5/5/5 |
| erupt | 20/20/5/5/5 | 20/20/5/5/5 | 20/20/5/5/5 |
| quake | 20/20/5/5/5 | 20/20/5/5/5 | 20/20/5/5/5 |
| carve | 20/20/5/5/5 | 20/20/5/5/5 | 20/20/5/5/5 |
| glaciate | 20/20/5/5/5 | 20/20/5/5/5 | 20/20/5/5/5 |

Required per cell: native/Node-Wasm 2,000; browsers 500. Identity errors: 0; refused gestures are compared exactly and reported separately (2 paired native/Node cases).

acceptance.mjs verdict: NOT READY — existingTestsAgainstRust, thousandsPerForcePerSizePerTarget, existingCrossEngineDeterminism, completeIntegrationAdapter. Full matrix awaits a user-named window. Final-arithmetic suites/retained checks also wait for that window; their time is excluded from the projection.

Regenerate: [INTEGRATION.md](INTEGRATION.md). Large generated outputs and exact failure payloads stay in ignored local/round3/. Adoption tags ts-forces-final and deletes TypeScript in the separate milestone session; this investigation creates no tag.

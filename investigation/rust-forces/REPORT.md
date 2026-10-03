# Rust forces — round 3

**NOT READY** — 256² only (D437); Firefox included (D440); speed gates dropped (D441). No performance benchmarks. Product files unchanged.
Oracle: dev 4799800ff4cc14093de8aabf68aa0e7385c32248. Ported current sealed-basin stopping/remaining-volume rule, unfed-water removal and second canonical settle, and carried-object collisions with the start/standing kept slopes. Shared portable.rs unchanged.

Pilot 7.04 min; matrix projected 1.80 h, actual pending. Existing suites/replays are additional. See [SCHEDULE.md](SCHEDULE.md).

| Force at 256² | Native | Node-Wasm | Chromium | Firefox | WebKit |
|---|---:|---:|---:|---:|---:|
| footprint | 20 | 20 | 5 | 5 | 5 |
| craterize | 20 | 20 | 5 | 5 | 5 |
| erupt | 20 | 20 | 5 | 5 | 5 |
| quake | 20 | 20 | 5 | 5 | 5 |
| carve | 20 | 20 | 5 | 5 | 5 |
| glaciate | 20 | 20 | 5 | 5 | 5 |

Required: 2,000 native and Node-Wasm, 500 each browser per force: 33,000 target checks. Identity failure payloads retained: 0; each fix is recorded in [IDENTITY-FIXES.md](IDENTITY-FIXES.md). Refused inputs match exactly (0 paired native/Node cases).

- postM9bOracle: OPEN
- portableArithmetic: PASS
- carve: PASS
- glaciate: PASS
- allWaterAndPlaybackRecords: PASS
- existingTestsAgainstRust: OPEN
- thousandsPerForcePerSizePerTarget: OPEN
- existingCrossEngineDeterminism: OPEN
- completeIntegrationAdapter: OPEN
- productExportBytes: PASS

acceptance.mjs: NOT READY — postM9bOracle, existingTestsAgainstRust, thousandsPerForcePerSizePerTarget, existingCrossEngineDeterminism, completeIntegrationAdapter.

Full authorization withdrawn: no matrix or full suites started tonight. Wait for M9b on dev and a newly named window. [M9B-PREP.md](M9B-PREP.md): 2–4 hours estimated for re-pin/audit, game defaults, guards and a new pilot if the inspected head remains unchanged; refresh the projection then.

Whole-machine pilot CPU: mean 15.0%, peak 34.9%; includes other sessions.

Regenerate: [INTEGRATION.md](INTEGRATION.md). Large bundles, Wasm, executables, maps, exports, IR, failures and corpora stay in ignored local/round3-dev256/ (D195). ts-forces-final and TypeScript deletion belong to the adoption session; this investigation creates no tag.

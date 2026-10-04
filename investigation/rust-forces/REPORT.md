# Rust forces

**Ready for adoption with the merged dev Carve test correction.** Based on cleanup/4-force-planning a516e43d; groups 1–4 are not yet on dev (f1a87b54).

M9b game water/edge spill and six-day settle are enabled; sealed lakes restore or relevel exactly. Group 4 supplies core request/result assembly and stable source-group IDs. The edge hook is removed. Shared portable arithmetic and AGPL-3.0-or-later are retained. Product files are unchanged.

- CI Rust build/guard/engine checks: PASS, 47,063 math vectors and 19 water fixtures.
- CI engine smoke: PASS, 183 cases / 610 checkpoints per target, zero differences.
- Complete quick suite with dev's corrected Carve test: 1,481 passed; typecheck/build PASS.
- Force suites against native/Node-Wasm Rust: 217 pass across 32 files (215 passed in the full run; the two affected tests pass on rerun).
- Browser force suites: 93 passed across all three engines; 3 optional benchmarks skipped.
- Core host: 15 fixed cases PASS, one Rust call per operation. Fixed full playback/water/export fixtures: 2 per force per target PASS.

The group-4 test version initially failed twice: midpoint water was already at its final 121 tiles, and the next test inherited a force. Dev f1a87b54 already corrects the midpoint and resets the force. The investigation harness loads those assertions, omitting the removed water-mode setter because group 1's opened() already selects defer. No assertions were weakened. acceptance.mjs: READY.

The binding fix preserves empty rock arrays; used-ID fixtures and native byte diagnostics are corrected (IDENTITY-FIXES.md). No corpus, pilot, matrix, timing or window remains. Bulk results stay ignored under local/adoption/. Regeneration and adoption: INTEGRATION.md; compact evidence: adoption-evidence.json. The milestone retains the upstream test fix, adopts after the groups land, and runs full CI on dev.

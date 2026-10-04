# Rust forces

**Not ready for adoption: two unchanged product Carve tests fail.** Based on cleanup/4-force-planning a516e43d; groups 1–4 are not yet on dev (f1a87b54).

M9b game water/edge spill and the six-day settle are enabled; current sealed lakes restore or relevel exactly. Group 4 supplies core request/result assembly and stable source-group IDs. The retired edge hook is removed. Shared portable arithmetic and AGPL-3.0-or-later are retained. Product source is unchanged.

- CI Rust build/guard/engine checks: PASS, 47,063 math vectors and 19 water fixtures.
- CI engine smoke: PASS, 183 cases / 610 checkpoints per target, zero differences.
- Quick suite: 1,479 passed, 2 failed; typecheck/build PASS.
- Existing force suites against native/Node-Wasm Rust: 215 passed, 2 failed (32 files).
- Browser force suites: 93 passed across Chromium, Firefox and WebKit; 3 optional benchmark tests skipped.
- Core host: 15 fixed cases PASS, including natural settings, working areas and painted Lift. Fixed full-result/export fixtures: 2 per force per target PASS.

Both failures are in carveBornAsItCuts.test.ts:93 (121 wet-cut tiles at both midpoint and end) and :112 (null frame). The unchanged TypeScript reproduces the first failure in isolation; the complete unchanged quick suite reproduces both. Assertions were not weakened. acceptance.mjs: NOT READY, ciQuickSuite and forceSuitesAgainstRust.

One binding fix preserves empty rock-layer arrays (previously Wasm padded zeros and Carve differed); used-ID fixture sets and diagnostic byte comparisons were corrected. Details: IDENTITY-FIXES.md.

No pilot, matrix, window or timing study remains. Regeneration/adoption: INTEGRATION.md; compact evidence: adoption-evidence.json. Bulk outputs stay ignored under local/adoption/ (D195). The milestone session fixes the two baseline failures, lands the cleanup groups and adopts on dev with full CI.

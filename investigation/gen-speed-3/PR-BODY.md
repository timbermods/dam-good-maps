- Profiles today's worker generation with the page's embedded WebAssembly, all seven themes at 128² defaults, seeds 1–3.
- Includes stage, attempt/failure and crate attribution; Rust water costs 13.8–58.2% and failed attempts consume 49.0% of attempt time.
- Supplies a one-file adoption patch using the existing guarded incremental build; product files on dev remain unchanged.
- Soil computations fall 196 → 120 across the same 21 inputs; attempts, genomes, settles and map selection remain the same.
- First passing candidate totals 119.600 | 116.121 s (2.9% less); median paired reduction 1.1%, with slower readings retained.
- All 21 .timber/project/empty-water comparisons and complete generated state/progress/land checks are identical.
- Baseline/candidate typechecks and 111 affected tests pass; 48 force, 496 analysis and 30 checks Wasm fixtures match their pins.
- This is Node worker computation, not browser paint latency; INTEGRATION documents adoption CI, regeneration and map-changing gains to avoid.

## Deliverables

- [REPORT.md](investigation/gen-speed-3/REPORT.md), [measurements](investigation/gen-speed-3/MEASUREMENTS.md) and small evidence samples.
- [adoption.patch](investigation/gen-speed-3/adoption.patch), checked against dev `c896e83c`; only the milestone session adopts it.
- [INTEGRATION.md](investigation/gen-speed-3/INTEGRATION.md), source/build/profile/identity harnesses and pinned Wasm metadata.

Bulk results, profiles and bundles stay in gitignored `investigation/gen-speed-3/local/`; regeneration commands are included. The normal CI for this investigation-only PR is narrow; the milestone adoption must run the existing native/Node-Wasm/three-engine byte fixtures, pins and generation checks. No timing tests or gates, re-pins, merges, approvals, auto-merge, tags or releases.

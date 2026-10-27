# Generation speed, current WebAssembly

- Base: `dev` at `c896e83c092960c4ddb5939207e1d99863a19ac8`; product files, Rust, Wasm and pins are unchanged in this PR.
- Profile: the page worker's `runGenerate` with its embedded Wasm; all seven themes, 128²/Normal defaults, seeds 1–3; [stage, attempt and crate tables](MEASUREMENTS.md).
- Failed layouts cost 49.0% of time inside attempts; direct Rust water calls cost 13.8–58.2% of profiled worker-return time by theme; forces are not called.
- [Adoption patch](adoption.patch): reuse the existing guarded incremental build within an attempt; soil computations fall **196 → 120** across the 21 profiled inputs.
- Same-seed first passing candidate: **119.600 | 116.121 s total, 2.9% less**; median paired reduction **1.1%**, 13/21 faster; some theme medians worsen. [Every pair](samples/before-after.csv).
- All 21 map/project/empty-water byte comparisons, full generated state, progress and land snapshots match; attempts, genomes, settles and failure diagnostics match. [Identity sample](samples/identity.json).
- This is Node worker-API computation, not measured browser click-to-paint latency. Loosening screens, choosing different starts or reducing settle ticks would change maps; none is proposed.
- [INTEGRATION.md](INTEGRATION.md) records adoption order, correctness checks and regeneration; profiles, bundles and bulk function results remain gitignored in `local/` (D195). No timing gate or speed test.

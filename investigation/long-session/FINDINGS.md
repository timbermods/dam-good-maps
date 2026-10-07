# LS1: an unused canonical simulation in a background check

Owner: milestone. Fix: `adoption/milestone.patch`, changing only `src/worker/session.ts`. Reproduction: `repro-check-allocation.mjs`, with `allocation-serve.mjs` and `allocation-probe.mjs`. This is separate from known cancelled-weather helper retention (F5) and the stroke draft job after a map switch (F6).

The hour's checks-worker Wasm capacity rose from 23.9375 to 53.75 MiB (+29.8125 MiB), with its last observed increase at 52.31 minutes. The capacity itself does not shrink, so this observation alone cannot identify a leak. The follow-up proves a specific avoidable source of allocation pressure; it does not attribute all of the hour's increase to that source or establish indefinite retention.

`backgroundCheck` calls `s.canonicalRun()` merely to get `run.model`. `MapSession.canonicalRun` calls the core `canonicalRun`, which immediately creates `WaterSim` and its Rust simulation. Then `settleInSlices(run.model, ...)` creates another canonical run and does the actual work. The first run is never advanced, so it never reaches canonicalRun's normal `sim.dispose()` path.

Retaining chain while the check is pending: the async `backgroundCheck` frame's `run` local → returned `advance` closure → core canonical-run closure's `sim` → `WaterSim.rust` → Rust simulation handle. `run.model` is used again after the await. Once the frame ends, the unused JS simulation becomes collectible; its native handle remains allocated until `rustWater.ts`'s `FinalizationRegistry` invokes `water_free`. This needs no cancelled weather run and allocates no helper strip for the unused run.

The fresh-profile Playwright reproduction makes twelve deterministic alternating Raise/Lower edits through the existing editor hook and requests background checks until each completes. It hashes the settled worker's complete terrain, water and soil arrays, rather than optional incremental UI replies. Investigation-only transforms count real Rust constructors, explicit frees, finalizer frees, and weakly tracked unused runs. No probe retains the simulation strongly.

| Observation | Baseline | Candidate |
| --- | ---: | ---: |
| Unused canonical runs created after warm-up | 36 | 0 |
| Rust simulations constructed (including warm-up) | 73 | 37 |
| Peak simultaneously outstanding Rust handles | 11 | 5 |
| Checks-worker Wasm capacity at peak | 114 MiB | 53.8125 MiB |
| Unused runs still collectible at end, before diagnostic GC | 2 | 0 |
| Outstanding Rust handles after post-experiment worker GC | 0 | 0 |
| All twelve settled terrain/water/soil fingerprints | Identical | Identical |

After collection the baseline capacity remains 114 MiB while handles fall to zero, demonstrating allocator high-water retention rather than an immortal JS owner. The candidate removes exactly the unused run and reads `s.built.waterModel` directly; the actual sliced settle, cancellation guard and water adoption are preserved. The checks worker naturally performs more than one check on some versions; the script records that workload rather than assuming one run per edit.

The candidate passed the full TypeScript program through an in-memory compiler overlay and all three existing water-status contract tests through an in-memory Vitest transform. The same patched block was exercised in the headed baseline/candidate comparison. No source, dependency or generated binding was written. The first follow-up trial compared optional reply payloads and was inconclusive; the delivered script and committed evidence use the corrected settled-state comparison.

Large raw snapshots and browser profiles stay ignored in `local/`. `allocation-results.json` and `allocation-summary.json` are small complete summaries. The default reproduction uses fresh clone-local Chrome profiles and performs diagnostic GC only after each twelve-edit experiment, outside the measured hour. Wasm capacity and the presence of an unused run are the evidence; no speed gate or elapsed-time assertion is used.

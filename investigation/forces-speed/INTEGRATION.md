# Integration

Base: `dev` commit `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`. The PR contains only this investigation. The patch has nine product-source paths; it changes no page or renderer files, `rust/forces/src/deposit.rs`, or `rust/water`.

Recommended first adoption: apply `adoption-a.patch` (six TypeScript paths). A is the strongest measured candidate and needs no Wasm regeneration. The full `adoption.patch` contains A+B; B is byte-identical but these adjacent readings do not establish additional net speed. For the full candidate, apply it to a clean checkout of that base and regenerate the embedded forces Wasm with Rust 1.90.0:

```powershell
git apply --check investigation/forces-speed/adoption.patch
git apply investigation/forces-speed/adoption.patch
$env:DGM_CARGO_JOBS='2'
npx tsx tools/rust/build.ts
npm run typecheck
```

The embedded `src/core/forces/rust/forcesWasm.ts` is deliberately omitted from the source patch. It must be regenerated and committed with the adopted Rust source. The normal builder also writes the water embed from its unchanged source; that output must remain identical. The investigation's force-only builder creates the tested embed inside `local/adopted/`, never in the real product tree. Tested optimized forces Wasm: 1,028,429 bytes, no imports, compiled-Wasm guard clean.

A is invariants/playback: segment coefficients in geometry, per-plan Quake travel, Carve source-object lookups, discarded object/water copies, Rift's already-final stage, and Glaciate's unchanged retreat frames. B is boundary/water: exact representation-guarded omission of duplicate metadata, transient geometry read before Wasm free, first-match fallen-object indexing, the worker's private comparison-buffer allocation, guarded reuse of Glaciate's existing Rust prefill, and specialization/scratch reuse in the forces crate's own water kernel. The adjacent single readings do not establish an additional net speed gain from B; both groups and their regressions are reported in [MEASUREMENTS.md](MEASUREMENTS.md). No speed threshold was used.

For separate adoption, start from the same base and run `setup.mjs` and `change-a.mjs`; that leaves A alone in the ignored local tree. `change-b.mjs` adds B. The [report](REPORT.md) and [measurements](measurements.json) record the one reading per stage. The normal delivered patch contains A+B, whose result identity is established by the checks below.

Important lifetimes and invalidation:

- Persistent Wasm outputs remain copied into JavaScript before `forces_free`. Only transient geometry is read directly; there are no further Wasm calls while decoding it.
- Plain metadata is omitted only when original and JSON-normalized representations have the same ordered keys and recursively equal values, including signed zero. Rust already defaults plain metadata to the original; wrappers or any normalization difference retain the existing second payload.
- Quake travel values are keyed by the plan object; repaint replaces that object. Lookup substitutions preserve first- or last-match semantics as appropriate.
- Glaciate reuse requires identical floor, dam, emitters, and retained tarn after finalization. Changes from protected ground or build touches keep the old prefill path. The cached water is copied before invoking the finalize callback.
- Glaciate's cue still advances every stage. Stage 31 has already added the retreat's sources; stages 32–49 show the same map values; stage 50 still copies the final map and water.
- The Rust run dispatch uses the existing game/port and dam presence. The two substeps, arithmetic, iteration order, sources, and reductions are unchanged. Shape validation remains before the unsafe numeric phases. The new transition vector is private scratch.
- The worker comparison buffer is private and retained locally; outgoing height arrays still have their own storage.

Use the existing targeted tests:

```powershell
npx vitest run --project quick --maxWorkers 2 tests/unit/pathField.test.ts tests/unit/forceDriver.test.ts tests/contract/forces.test.ts tests/contract/carve.test.ts tests/contract/glaciate.test.ts tests/contract/rift.test.ts tests/contract/forceOps.test.ts tests/contract/forceRecordClock.test.ts tests/contract/carveMaturity.test.ts tests/contract/glaciateFloor.test.ts tests/contract/forceFloor.test.ts
```

The required force determinism command, run from `investigation/forces-speed/local/adopted`:

```powershell
$env:PW_CHANNEL='chrome'
npx tsx tools/determinism/run.ts --smoke --only force/,gesture/,scheduling/ --engines node,chromium --serial --no-timings --out-dir ../b-determinism
```

This selects all 122 force/gesture/scheduling smoke cases, including 256² and Rift/Deposit/maturity. It runs no browser matrix and records no timing. The native and Wasm pins are checked by `pins.ts --adopted --native --out b-pins`; `equivalence.ts --out b-equivalence` additionally compares all playback frames, final maps, and Keep records with the untouched baseline. Neither tool changes a pin. Larger generation/brush/weather checks remain CI's work.

All raw artifacts, complete manifests, prepared projects, Wasm/native binaries, and isolated source copies remain in ignored `local/`. Do not import this investigation from product code. Port the source changes or apply the patch; the product's normal build and tests then own them.

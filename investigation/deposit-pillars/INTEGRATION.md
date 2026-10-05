# Adoption

Apply from the repository root on dev (investigation base: `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`). This PR changes no product file.

```powershell
git apply --check investigation/deposit-pillars/adoption.patch
git apply investigation/deposit-pillars/adoption.patch
$env:DGM_CARGO_JOBS = '2'
npx tsx tools/rust/build.ts --native
npm run typecheck
npx vitest run --maxWorkers 1 tests/contract/deposit.test.ts tests/contract/depositFan.test.ts
git diff --check
```

Commit the rebuilt `src/core/forces/rust/forcesWasm.ts` with the Rust planner, tests and pins. Rebuild with the pinned Rust 1.90.0 toolchain; generated Wasm stays out of the adoption patch. The water embed reproduces its existing bytes.

The patch touches only Deposit's Rust planner, its regression tests, and five of its six pins. Neither shared error table changes. All 44 other-force pins remain identical. Existing kept force operations retain their stored literal results.

Re-pin reason: remove all inter-lobe connector paths. Start with the original funded cone, reclaim unsupported pillar material and one-tile fragments, and redistribute it into sediment bodies. Separate lobes remain separate; every deposited tile must belong to a filled 2 x 2 receiving patch. Grow complete patches at body edges or add supported relief on existing bodies, preserving the original material budget. The path search, connectivity requirement, largest-component selection and connector-payment logic are gone. Height caps still use actual donor cuts.

Keep round 2's original mouth, direction, reach, width, lobes, curving distributaries, channel masks/stages, 40-step playback and normal volume. Short draws and clicks make small fans at every Power, including zero, with no length gate. The three tiny-budget visibility corrections remain: nine real blocks paid for by allowed upstream/shoulder cuts. Floor, kept/layer and working-area limits, ceiling, conservation, reserved wet outlets, source metadata, object riding and burial remain in force.

The acceptance rule now allows disconnected **bodies**, as Kyler requested. A lobe has at least four tiles and includes filled 2 x 2 ground; no deposited tile may be a one-tile receiving line. Thin extremities and stray tiles do not count toward the fan's body extent. Their material is retained in the bodies, rather than connected by wires.

The contact sheet stays under `investigation/deposit-pillars/docs/sheets/deposit-pillars.png` to honor the investigation-only scope. During adoption copy it to the requested documentation path:

```powershell
Copy-Item investigation/deposit-pillars/docs/sheets/deposit-pillars.png docs/sheets/deposit-pillars.png
```

The milestone session owns adoption decisions; no decision number is assigned here.

# Adoption

Apply from the repository root on `dev` (base: `38d4ee6b9ef2e0c516a244be42dbfd0f5e576e7e`). This PR changes no product file.

```powershell
git apply --check investigation/deposit-pillars/adoption.patch
git apply investigation/deposit-pillars/adoption.patch
$env:DGM_CARGO_JOBS = '2'
npx tsx tools/rust/build.ts --native
npm run typecheck
npx vitest run --maxWorkers 1 tests/contract/deposit.test.ts tests/contract/depositFan.test.ts
git diff --check
```

Commit the rebuilt `src/core/forces/rust/forcesWasm.ts` with the patched source, tests and pins. The patch intentionally leaves out the generated Wasm; it must be rebuilt from the pinned Rust 1.90.0 toolchain. The water embed rebuilds to the existing bytes.

The patch touches only Deposit's Rust planner, Deposit's new error code in the native and TypeScript error tables, its regression tests, and five of its six pins. No other force pin changes. Existing recorded force operations keep their stored literal results; this shaping change affects newly planned Deposits only.

Re-pin reason: allocate conserved sediment as layers over one connected receiving patch instead of fully filling a noise-ranked prefix of columns. Remove the minimum-volume fallback that invented receiving tiles and raised targets outside the cone. Reserve the donors' deepest beds when capping new heights, so cutting the donors cannot expose a pillar afterwards.

A draw whose endpoints are more than one and fewer than eight tiles apart always refuses, before seed-dependent shaping, with `Draw a longer line for a fan (at least 8 tiles)`. A click (including a repeated point) retains the placement rules. A longer line or click must deposit on at least nine connected tiles or refuse atomically with the existing material/room reason. Keep, Floor, area depth, ceiling, wet outlets, source metadata, objects riding or burial, three channel stages, 40 playback steps and exact conservation remain in force. On wet or masked ground that splits a cone, use its largest connected receiving patch; the tie goes to the patch nearest the mouth's ranked offers.

The contact sheet is staged under `investigation/deposit-pillars/docs/sheets/deposit-pillars.png` to honor the investigation-only rule. During adoption copy it to the requested product documentation path:

```powershell
Copy-Item investigation/deposit-pillars/docs/sheets/deposit-pillars.png docs/sheets/deposit-pillars.png
```

No decision number is assigned here; the milestone session owns adoption decisions.

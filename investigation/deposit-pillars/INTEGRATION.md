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

Commit the rebuilt `src/core/forces/rust/forcesWasm.ts` with the Rust planner, tests and pins. The generated Wasm is intentionally rebuilt from the pinned Rust 1.90.0 toolchain rather than carried in the adoption patch. The water embed reproduces its existing bytes.

The patch touches only Deposit's Rust planner, its regression tests, and five of its six pins. The earlier length gate and new error code are completely removed: neither shared error table changes. Every other force's pins remain identical. Existing kept force operations retain their stored literal results.

Re-pin reason: retain the old cone targets, lobes, channel geometry, reach and material calculation; move excess pillar material into supported connected receiving ground. Connect all reachable lobes instead of selecting just one. Start from the main body so a minor isolated site cannot discard the rest of the fan. Pay for connecting cells by spreading high columns or peeling removable edges, preserving the original budget. Height caps use actual donor cuts, rather than every potential donor's deepest bed.

Short draws and clicks make small fans at every Power, including zero. No length is refused. Original Floor, kept/layer and working-area restrictions still apply, as do ceiling, exact conservation, reserved wet outlets, source metadata, object riding and burial, three channel stages and 40 playback steps. For the few original effects with less than nine blocks, fill a compact apron using nine real blocks: extend the permitted upstream/shoulder donors only if their old supply is insufficient. This visibility correction is reported separately from preservation of normal fan budgets. It does not change the 20 sheet gestures' budgets.

The contact sheet is staged under `investigation/deposit-pillars/docs/sheets/deposit-pillars.png` so the investigation-only scope is honored. During adoption copy it to the requested documentation path:

```powershell
Copy-Item investigation/deposit-pillars/docs/sheets/deposit-pillars.png docs/sheets/deposit-pillars.png
```

The milestone session owns adoption decisions; no decision number is assigned here.

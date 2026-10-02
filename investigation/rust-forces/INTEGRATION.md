# Rust forces investigation

**Not ready for adoption.** `node acceptance.mjs` deliberately fails. Carve and Glaciate are not implemented, the complete water/playback contract is not ported, and the required exhaustive evidence is absent. Do not install this bridge in the editor. This PR changes only the investigation.

## Baselines and scope

Product oracle: `dev` at `4aab909e23016902cbbe6ffaeddeece786176ab3`, containing all five released forces and portable maths. Reused water investigation: `d18a6f4d890d3f2e3f7b480e308242375c100e10`. Its Rust 1.90.0 toolchain, linker, strict arithmetic configuration, native batch runner, retained Wasm arena, binary checking approach, and CPU sampler are reused here. The water kernel is embedded in `src/lib.rs`; its existing ABI is retained. It has not yet been wired into force settling. No newer rust-water findings were on the remote when checked.

`src/lib.rs` implements the Craterize, Erupt, and Quake plans; footprint orientation, flipping, and margins; Floor/Keep/rock/object handling; literal changes; Craterize arrival and Erupt heat; Quake arrival, displacement, and source arrays. Both targets compile this one source. `rust/main.rs` only drives native jobs and timings.

The harness compares canonical binary raw plans and final maps as well as planning fields. The final-map water is the planner's water. That does **not** cover Quake's final shown Slide water transport, all playback records/timings, live-water settling, error/refusal parity, the build's integrity finalizer, or exported JSON/`.timber` bytes. Object property insertion order is canonicalized rather than tested. The literal changes are only part of a recorded force operation. Existing product tests exercise the TypeScript oracle, not a Rust replacement.

## Regenerate on Windows

Run from this directory. Keep `local/` and `target/` ignored. Do not commit exported maps, binaries, generated bundles, LLVM IR, timing logs, or failure payloads.

1. Reuse the pinned rust-water setup and toolchain in `../rust-water/local/toolchain/`. If it is absent, use rust-water's documented setup; do not install a different compiler. `. ./setup.ps1` selects it. An installed exact Rust 1.90.0 toolchain can instead build the same crate with the flags in `.cargo/config.toml` and the wasm32 target.
2. Set `$env:DGM_DEPS` to an existing product dependency installation containing esbuild, Vitest, AJV, fflate, and the product's other dependencies. The measured installation was `C:/Users/Kyler/code/DamGoodMaps-m9b`.
3. Run `node prepare-oracle.mjs`. It exports the pinned Git tree to ignored `local/oracle/`, without editing product files. Alternatively set `$env:DGM_ROOT` to a checkout of the pinned baseline. `build.mjs` resolves its generated imports to that root. The source hashes in `local/build.json` identify the oracle actually bundled.
4. Reuse matching installed Playwright engines. This PC has Chromium 1208, Firefox 1509, and WebKit 2248; `npm install --prefix local/browser-deps --no-audit --no-fund playwright@1.58.2` supplies their matching driver. Set `$env:DGM_BROWSER_DEPS` to an existing matching installation on other machines. Install engines only if missing.

```powershell
. ./setup.ps1
& $env:RUST_FORCES_CARGO build --locked --release --bin forces-batch
& $env:RUST_FORCES_CARGO rustc --locked --release --target wasm32-unknown-unknown --lib -- --emit=llvm-ir
& $env:RUST_FORCES_CARGO rustc --locked --release --lib -- --emit=llvm-ir
node verify-ir.mjs
node build.mjs
node check.mjs --verbs footprint,craterize,erupt,quake --count 12 --random --name final
node browser.mjs --count 12 --random --name final
node compare.mjs
node browser.mjs --bench --count 1 --reps 3 --name bench-final
node native-bench.mjs --reps 3
$env:DGM_TEST_REPORT = 'existing-focused.json'
node existing-tests.mjs tests/unit carve.test.ts forces.test.ts forceRecordClock.test.ts forceFloor.test.ts forceTrees.test.ts eruptHeadroom.test.ts
$env:DGM_TEST_REPORT = 'existing-units-corrected.json'
node existing-tests.mjs tests/unit/forceOrder.test.ts tests/unit/forcesSitting.test.ts
Remove-Item Env:DGM_TEST_REPORT
node evidence.mjs
node acceptance.mjs
```

All child processes are hidden on Windows. The native runner also accepts `INPUT OUTPUT`, `--batch MANIFEST THREADS` (input/output paths separated by a tab), `--bench INPUT OUTPUT REPS`, and `--bench-plan INPUT OUTPUT REPS`. Generated results remain under `local/`. Every reported measurement uses three samples after a warm-up. CPU load uses Windows PDH; missing samples are `null`, never zero.

The commands above reproduce the completed focused TypeScript baseline. `node existing-tests.mjs` runs the broader existing force suite; that run was interrupted here and is not a passed gate. Neither run replaces the force implementations with Rust. Such adapters and their complete test run remain required.

The checked corpus uses seeded random paths, continuous Power/Size, option combinations, edge origins, Floors 1–22, rock/lava, fractional water, Keep masks, and assorted oriented/flipped objects. Its random terrain heights are 0–12 and additional objects are at most 8×8. It is a useful partial corpus, not every supported terrain or footprint. Expand it to thousands **per force and size on every target**, and add all validation refusals, tall terrain, all object templates, drawn paths, and all force-specific cases. Compare binary64 bits, signed zero, exact object contents/order, Float32 planning fields, and all records/timings. Do not replace exact comparison with tolerances.

## Boundary and performance

`protocol.ts` uses little-endian binary64 and canonical object keys; array order is preserved. It encodes typed-array entries as numbers. `prepare → plan → pack → dispose` permits timing planning without input decoding or output packing. `forces_execute` measures the full Rust bridge work. Views are reacquired after memory growth; inputs/outputs are copied before their Rust allocations are freed. The harness is for trusted finite valid inputs. Unsupported verbs trap, and the low-level Rust ABI has no production validation or stable error interface.

The generic value representation is expensive. The map's immutable metadata and footprints are shared, but output boxing and bridge serialization still cost time and memory. Replace this with retained typed buffers before adoption, then rerun identity and performance tests. Browser bridge timings include Rust decoding/packing and input/output copies, but exclude JS input encoding and output decoding. Native planning excludes input decoding/packing. Neither is an editor integration speed claim.

Benchmark cases use full Power with Auto Size for Craterize/Erupt; Quake uses full-Power Lift. Footprint timing covers the fixture's objects. It does not cover full-Power Glaciate, Carve, all modes, or the entire application. Machine-load samples and the raw timing repetitions belong in the evidence; repeat on a quieter machine before interpreting small ratios. D380 makes a regression an adoption blocker.

## Milestone adoption order (D381)

1. Complete Carve's course, source groups, erosion, sediment/oxbow/river shaping, water, and playback tape; complete Glaciate's valley routing, floor candidates, meltwater/tarn/prefill/settle, objects, and playback fields. Use the existing water kernel with the same forcing, stopping decisions, and fixed reduction order. Complete the other forces' omitted water/record behavior and refusal parity.
2. Create the typed bridge and native adapter for all five forces. Preserve TypeScript presentation: animation, Slow forces, sounds, preview, and controls. Run the existing force and cross-engine determinism suites against those adapters, including different planning schedules and the build finalizer. Pass the requested random matrix and the speed budgets. Keep `STATUS.json` false until each gate has pinned evidence.
3. **In the adoption session**, preserve the final TypeScript implementation with the tag `ts-forces-final`, then delete the adopted computation in the order required by D381. This investigation creates no tag and deletes no product TypeScript. The user has not authorized those actions in this session.
4. Move the forces' analysis/checks to Rust next; adopt Rift, Deposit, and Carve Maturity directly in Rust; generator after M9b; operations/undo only when boundary measurements justify it. Do not use this investigation to change the forces' approved feel.

Any compiler, portable-math, scheduling, reduction, or boundary change invalidates the relevant identity and timing evidence. No FMA, relaxed arithmetic, native transcendental substitutions, or tolerance-based acceptance.

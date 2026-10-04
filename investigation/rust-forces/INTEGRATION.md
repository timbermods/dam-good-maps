# Rust forces adoption

**Based on cleanup/4-force-planning a516e43d, not yet merged into dev. Ready for adoption with the merged dev Carve test correction, adapted to group 1's removed water-mode API.** All product code is read-only; work and artifacts belong to this investigation's own clone.

D453/D454 retire round 3's pilot, random corpus, matrix, counts, projections, timing and window gates. Their entry points now fail explicitly. RUN-AUTHORIZATION.json authorizes nothing. No performance benchmark was run.

M9b enables game evaporation and edge spill in the reused typed water kernel, a six-day initial canonical settle, and current sealed-lake restoration/releveling. The drain settle stays four days; Glaciate's flood probe stays 300 ticks. Current core build/finalization handles game soil, resources and export singletons. Group 4 supplies source-group member IDs and standing/used-ID collision checks. The edgeSources/edgeLeaks hook is removed; edgeLip never enters forces.

The host uses core fullForceMapOf, planForce/natureOf, forceRecordOf and keptForceParams. api.ts's planRustForce replaces numerical planning while retaining the core's request resolution, Keep, finalization, records and result assembly, including painted Lift. Ids come from the caller. Animation, Slow forces, sounds, preview and controls remain TypeScript. The independent TypeScript oracle is retained only for investigation checks.

The low-level retained bridge follows rust-water: typed SoA buffers in Wasm memory, one plan call per operation, typed records and changed regions, fresh views after memory growth. Metadata import and fixture/export packing are cold paths. Do not use the generic fixture codec in an adopted hot path. Preserve empty rock arrays and ordered used IDs exactly. Shared arithmetic is rust/portable/src/lib.rs; AGPL-3.0-or-later; no tolerance, FMA or reassociation.

The pinned group-4 tests predate dev `f1a87b54`'s Carve correction: cancel a leftover force and measure halfway through the cut, rather than playback. `upstream-tests.mjs` reads that exact test from git and omits only `setEditorWaterMode("defer")`, removed by group 1 because opening already sets defer. All assertions match merged dev. No product file is edited. Keep this upstream test correction when the groups land on dev.

Fetch dev with `git fetch --no-tags origin dev` to make the pinned upstream test commit available. Local commands (run from the own clone, dot-source setup-adoption.ps1; call Use-CoreTargets for product CI, Use-ForceTargets for force builds):

- `npx tsx tools/rust/build.ts --check --native`: PASS, committed water Wasm matches.
- `npx tsx tools/rust/check.ts --engines`: PASS, 47,063 math vectors and 19 water fixtures in native/Node-Wasm and all three engines.
- `npx tsx tools/determinism/run.ts --smoke`: PASS, 183 cases / 610 checkpoints per target; zero differences.
- `node investigation/rust-forces/upstream-tests.mjs --quick-config`, then `npm run test:quick -- --maxWorkers 4 --config investigation/rust-forces/local/adoption/quick.config.mjs`: PASS, 1,481 passed. The unchanged group-4 test version initially had two failures; dev's corrected assertions pass.
- `npm run typecheck`; `npm run build`: PASS.
- From investigation/rust-forces: `node verify-ir.mjs`; `node core-host-check.mjs`; `node existing-tests.mjs --bail 0`; `node existing-browser.mjs --workers 3 --max-failures 1` (DGM_SUITE_NATIVE=1, DGM_IDENTITY_ONLY=1). 217 tests pass across 32 files: the full run passed 215, and both affected Carve tests pass after rerunning their file with the merged dev correction. Reproduce the rerun with `DGM_TEST_REPORT=existing-upstream-carve.json` and `node existing-tests.mjs tests/contract/carveBornAsItCuts.test.ts --bail 0`. Browser suites: 93 pass, 3 optional benchmarks skipped.
- `node check.mjs --verbs footprint,craterize,erupt,quake,carve,glaciate --sizes 128 --count 2 --name adoption-final --exports --server`; same `node browser.mjs` arguments without `--server`: PASS, fixed existing fixtures only; complete typed playback/water and product export bytes.
- `node record-checks.mjs`, then `node acceptance.mjs`: READY; requires the local CI checks and existing force suites, with no corpus/count/window gate.

Browser runtimes: Chromium 145.0.7632.6 (153 download unavailable), Firefox 155.0, WebKit 26.6; Playwright 1.63.0. setup-adoption.ps1 selects installed runtime binaries without changing product source. Set DGM_COMPILER_ROOT for another Rust 1.90.0 installation. Cargo caches and targets, Wasm, bundles, native binaries, IR, maps, exports, failures and captured suite fixtures stay under ignored local/adoption/ (D195). Create local output junctions for root .scratch, dist and rust/target when running the unchanged product commands. Rebuild with cargo rustc --release --lib [--target wasm32-unknown-unknown] -- --emit=link,llvm-ir,asm, cargo build --release --bins, then node build.mjs. Regenerate checks with the commands above; no generated bulk is committed.

The milestone session first lands groups 1–4 on dev and retains dev's corrected Carve tests (omit the removed setter), then reruns the suites. It adopts the typed planners/bridge into the core planning path, adds the crate to tools/rust/check.ts and force byte fixtures to CI, adapts presentation readers to typed records, and runs full CI on dev. Under the Rust order it preserves final TypeScript computation as ts-forces-final and deletes it after adoption. This investigation creates no tag, edits no product file, and performs no merge or release.

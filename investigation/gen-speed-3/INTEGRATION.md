# Adoption

The milestone session owns adoption of `adoption.patch`. This investigation changes no product file. The patch changes only `src/core/gen/generate.ts`, uses the existing `features/build.ts` incremental pipeline, and applies to the recorded dev base `c896e83c092960c4ddb5939207e1d99863a19ac8`. Do not change the generator version or any pin for this exact optimization.

## Order

1. Keep the adopted Rust water, forces, six analysis kernels and checks from this dev base. D381's port order and ownership are unchanged; this is a TypeScript generator reuse patch over those ports.
2. On the milestone's current dev-based branch, run `git apply --check investigation/gen-speed-3/adoption.patch`, then apply it. If intervening generator edits conflict, port these few lines onto that generator and compare with the same new base before adopting. `prepare.mjs` intentionally refuses a changed build-call context.
3. Re-run the affected contracts and typecheck on the adopted source, and the full CI checks below. Keep every existing pin. An exactness mismatch means fix or drop the optimization, never re-pin it away.
4. Review behavior and adopt through the normal dev process. This investigation opens one PR only; it does not merge, approve, enable auto-merge, create tags or release anything.

## Why it preserves maps

Every call still builds the same feature sequence from a freshly owned field snapshot. The only change is supplying the most recent build of this attempt to `rebuild` instead of starting without a previous build. Its existing guards check terrain snapshots, feature content and ordering, slope reservations, water model, soil barriers and resource inputs. Changed inputs recompute. Feature keys and terrain features in its cache are snapshots, so generator mutations are checked against what was actually built.

The water keeps the original `SettleCache`; the canonical settle and all floating-point operations are unchanged. The settle counter still counts each unique depth object through the original `counted` WeakSet. No attempt, land draw, random call, check, rescue policy or outcome choice is removed or reordered. `previousBuild` is bounded to one build and lives only in `attemptOnce`. A speculative build may become the next cache input, but the same input guards apply even when its start was rejected. A stop-before-water build is still marked as such; a later water/soil build recomputes when its cache has no settle. Generation resets the editor-only `dirty` result to its original null shape.

`rebuild` already computes the editor dirty report before it is discarded. Avoiding that work is a possible separate exact improvement; it was left out to keep the adoption surface to one existing API call. This patch is deliberately a small saving. The large costs now are Rust water, repeated priority floods and rejected layouts. Reducing generation's budgets, bypassing screens or accepting a different start changes the chosen map; reducing water ticks changes its arrays. Faster implementations of those algorithms can still be exact, but need their own byte proof.

## Checks and CI

The paired harness executes the exact `runGenerate` API that `generator.worker.ts` calls, with no native settle override. At the default 128², `parallelPolicy.ts` also selects one water thread in the browser. It compares SHA-256 of .timber, compressed project and empty-water files; binary bytes of all typed arrays; signed-zero-sensitive scalars; generated spec/features/file/entities/water model/settle state, checks, analysis, intentions and outcomes; failures and counts; progress payloads and copied first-land snapshots. Only elapsed times and implementation caches/editor dirty metadata are excluded from the state digest. It hashes after the timing boundary; land copies occur in both variants' identical callbacks. [samples/identity.json](samples/identity.json) records all 21 passing pairs.

The local contract configuration substitutes the candidate source in Vite's loader without editing dev product files. The typecheck script similarly replaces that one file in TypeScript's compiler host while checking the full original project.

The investigation-only PR is classified as documents/investigation by `tools/ci-changes.mjs`, so its normal CI intentionally does **not** exercise the adoption patch. The milestone's adoption must show:

- Project typecheck and the affected start, resources, first-land and feature/rebuild contracts passing against the adopted source, plus the regular quick suite.
- The existing water state digests and forces, analysis and checks byte fixtures matching their committed pins; no pin or golden changes. Local Node-Wasm results are recorded below; adoption's full CI must compare native Rust and Node-Wasm with Chromium, Firefox and WebKit through `tools/rust/check.ts --engines`.
- A reproducible Rust build (`tools/rust/build.ts --check --native`), the Rust guards/contracts, and the normal cross-engine determinism smoke including generation. Run full CI on the adoption branch (manual workflow dispatch if its normal path skips Rust); a green documents-only PR is not that proof.
- Generation/project round-trip checks and the usual browser correctness checks. Firefox remains in correctness only (D440); there are no speed assertions, timings used to accept/reject a build, quiet windows or additional timing gates (D453).

The finite local corpus supports the change; it is not a claim to have enumerated every possible seed. Exactness also relies on the existing incremental-build contract and the unchanged algorithm/pins, with CI checking adoption on the integrated source.

## Local verification

Initial `npm ci` and esbuild/Vite subprocesses were blocked by the sandbox's process/network restrictions; the authorized commands succeeded with the normal escalation mechanism. No other checkout or folder was used. Baseline and candidate full-project typechecks passed. The uninstrumented pair matrix is 21/21 identical.

Node-Wasm CI fixture producers: **48 forces, 496 analysis, 30 checks** match every committed pin. Water's existing pinned state suite and affected generation contracts run through `verify.config.mts`; their final result is recorded in `samples/verification.json`. No Rust or embedded-Wasm file was modified, so native compilation was deferred to adoption's full CI.

The profiling series and paired series ran on a shared Ryzen 5 3600 Windows machine (Node 22.23.3), with one active generation at a time. V8's helper pool and libuv pool were capped at one for generation; esbuild used one Go worker and the contracts used one test worker. The original/candidate typechecks overlapped part of the uninstrumented pair series, and another Codex task shares the host. Load was not controlled or sampled. Per-theme medians and all slower after readings are retained; these are observations, not a speed guarantee. Compilation is cold only in the first profiled Any/1 cell. The uninstrumented pair matrix warms both APIs with the same 48² Delta before measurements. No Firefox speed run was made.

Worker computation is measured to its first passing `candidate`, with earlier `land` and complete API return separately reported. Worker creation, Comlink message transfer, main-thread rendering/paint and the page's background sibling search are outside this Node measurement. The original UI is unchanged. No browser click-to-editable-frame claim is made.

## Regenerate

Run from the repository root of this dedicated clone. This regenerates the overlay from the recorded dev source, leaves product files untouched, and puts all bulk output in `investigation/gen-speed-3/local/`. The existing root `.gitignore` ignores `investigation/*/local/`; the investigation's own `.gitignore` excludes the regenerated source overlay. Use these settings for each PowerShell session:

```powershell
$env:GOMAXPROCS = '1'
$env:UV_THREADPOOL_SIZE = '1'
$env:NODE_OPTIONS = '--v8-pool-size=1'
node investigation/gen-speed-3/prepare.mjs
node investigation/gen-speed-3/build.mjs baseline --profile
node investigation/gen-speed-3/run.mjs baseline-profile
node investigation/gen-speed-3/build.mjs candidate --profile
node investigation/gen-speed-3/run.mjs candidate-profile
node investigation/gen-speed-3/build.mjs baseline
node investigation/gen-speed-3/build.mjs candidate
node investigation/gen-speed-3/paired.mjs
node investigation/gen-speed-3/summarize.mjs
npm run typecheck
node investigation/gen-speed-3/typecheck.mjs
node node_modules/vitest/vitest.mjs run --config investigation/gen-speed-3/verify.config.mts
node --import tsx investigation/gen-speed-3/pins.ts
git apply --check investigation/gen-speed-3/adoption.patch
git diff --check
```

Profiles are diagnostic only: the build script inserts nested function timers and wraps each of the four production Wasm export objects in its own timing adapter. No instrumented code is in the adoption patch. The inspector captures one CPU profile (seed 1) per theme/variant. `trace.mjs` records every attempt and progress-stage interval, including failures and rescue rounds. `summarize.mjs` retains a concise sample and tables; complete results and CPU profiles stay local. Do not repeat readings solely to get nicer timings.

## Earlier rounds read

`investigation/gen-speed/` is absent on this dev checkout. Both earlier remote branches are available in the clone's Git history. The original branch's `REPORT.md`, `PROPOSALS.md` and round-2 `RESEARCH.md`, and gen-speed-2's `REPORT.md`, `INTEGRATION.md` and adoption patch were read with `git show`. Those bases predate most of the Rust adoption (and gen-speed-2 predates D471). The original round 2 changes layouts and cannot satisfy this task's exactness rule. The later round's use of the existing incremental build is the reuse idea retested here; its broader drought/start/resource changes are not in this patch. Its timing figures are not used as this investigation's baseline.

# Adoption

Base: `790f8da1d3db73b2c4edf11c8cc7c58de49c4b8c` on dev. This investigation changes no product files. `adoption.patch` proposes six fixes across five TypeScript files; no Rust binary, dependency, editor UI or generated artifact changes. The owning sessions can apply it on their own adoption branch:

```powershell
git apply --check investigation/merge-review/adoption.patch
git apply investigation/merge-review/adoption.patch
npm run typecheck
npx vitest run --config investigation/merge-review/vitest.config.ts
npx tsx investigation/merge-review/water.ts
npx tsx investigation/merge-review/occupancy.ts
npx tsx investigation/merge-review/failure.ts
```

The new regression scripts default to expecting the fixed behavior. On untouched investigation product sources, set `$env:MERGE_REVIEW_EXPECT_BUGS='1'` to confirm the recorded failures, then remove it with `Remove-Item Env:MERGE_REVIEW_EXPECT_BUGS` before checking a candidate. It affects only water.ts, occupancy.ts, failure.ts and the three finding-specific Vitest tests. Other tests always require equality. Tests must run sequentially because pools and session globals are process-wide.

For a candidate without editing product files, from this clone's root:

```powershell
node investigation/merge-review/prepare.mjs
npx tsx investigation/merge-review/local/adopted/investigation/merge-review/water.ts
npx tsx investigation/merge-review/local/adopted/investigation/merge-review/occupancy.ts
npx tsx investigation/merge-review/local/adopted/investigation/merge-review/failure.ts
Push-Location investigation/merge-review/local/adopted
npx tsc --noEmit --project tsconfig.json
npx vitest run --config investigation/merge-review/vitest.config.ts
npx vitest run tests/unit/weather.test.ts tests/unit/water-speedups.test.ts tests/unit/rustWater.test.ts tests/contract/forceEsc.test.ts tests/contract/live-water.test.ts tests/contract/waterJourneyOrder.test.ts --maxWorkers 1
Pop-Location
```

Run Vitest **from the candidate directory**: choosing a candidate config while staying in the repository root still selects the original product sources. `prepare.mjs` creates ignored candidate sources/tests/config and a pre-force reference; regenerates the patch; refuses missing replacement anchors. It depends on the named base source shapes, so do not regenerate it blindly after dev advances. It never applies the patch to product files.

Other investigation checks from clone root:

```powershell
npx tsx investigation/merge-review/fallback.ts
npx tsx investigation/merge-review/sync.ts
npx tsx investigation/merge-review/lifecycle.ts
npx tsx investigation/merge-review/forces.ts
node investigation/merge-review/browser.mjs
```

The browser harness uses ports 4317/4318 and installed Playwright Chromium/Firefox/WebKit. Setup is `npm ci` and `npx playwright install chromium firefox webkit`. If the normal Chromium CDN fails, `node investigation/merge-review/install-chromium.mjs` downloads the exact installed Playwright version's Chromium archives from Google's official Chrome-for-Testing mirror into local/ and feeds them to Playwright through localhost 4319. Bulk JSON, candidate trees, Wasm test outputs, browser profiles and archives stay ignored under local/.

F1 deliberately pins directly edited water instances to one thread: strip reconstruction changes historical occupancy/evaporation bookkeeping. Normal floor/strength/weather scale updates stay threaded. Do not remove this restriction without extending the occupancy/continuation byte oracle. F3's old-depth/seep checkpoint lives outside shared memory; moving it back into shared memory reintroduces the exiting-helper race. F5 frees water arrays only after asynchronous work exits; disposal leaves readable public snapshots intact. F6 invalidates old session callbacks as well as releasing job ownership.

Promote the three focused regressions and small water-edit/commit-failure fixtures into the owning session's normal tests with adjusted imports/helper locations. Keep the fault at the actual final-commit barrier and preserve the byte assertions. `adoption.patch` alone leaves these investigation tests available at their current paths. Review numerical changes against the one-thread oracle, not tolerance-based comparisons.

A scoped .gitattributes entry permits mandatory blank context lines in the unified patch; generated product diffs have no added trailing whitespace. `git diff --check`, `git diff --cached --check` and `git apply --check` are required before this investigation is pushed.

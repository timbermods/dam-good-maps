# Regenerate locally

Use only `C:\Users\krams\Documents\ChatGPT\dgm-first-load`. Node 22+ and installed Chrome are required. All scripts run from that clone's root. Keep other sessions running; one headed Chrome/profile pair at a time, no trace-based test or timing gate. `local/` is gitignored. It holds disposable source copies, build outputs, gzip fixture, traces, browser profiles, raw responses/results, logs and experiments; do not commit it.

Save the investigation branch name as the source of these scripts before checking out the pinned sources. Checking out a source pin removes tracked investigation files, so restore **only** this investigation directory from that branch after each checkout. Do not apply either owner patch to the checkout. `prepare.mjs` applies candidates only to disposable local copies.

```powershell
Set-Location C:\Users\krams\Documents\ChatGPT\dgm-first-load
$investigationSource = 'investigation/first-load' # use -2 if that was the delivered branch

git checkout --detach 009a00b034136ba25fdff1d0e0d5977be1a13e78
git restore --source=$investigationSource --worktree -- investigation/first-load
npm ci
npm run build
node investigation/first-load/prepare.mjs dev
node investigation/first-load/build-probe.mjs dev-before
node investigation/first-load/build-probe.mjs dev-adopted investigation/first-load/local/dev-adopted

git checkout --detach beee673e2dc3fb75d04277f0baf47755deb9fae9
git restore --source=$investigationSource --worktree -- investigation/first-load
npm ci
npm run build
node investigation/first-load/prepare.mjs page
node investigation/first-load/build-probe.mjs page-before
node investigation/first-load/build-probe.mjs page-adopted investigation/first-load/local/page-adopted
npx tsx investigation/first-load/fixture.ts

node investigation/first-load/profile.mjs dev-before 2
node investigation/first-load/profile.mjs dev-adopted 2
node investigation/first-load/profile.mjs dev-before 2 reopen
node investigation/first-load/profile.mjs dev-adopted 2 reopen
node investigation/first-load/profile.mjs page-before 2
node investigation/first-load/profile.mjs page-adopted 2
node investigation/first-load/profile.mjs page-before 2 reopen
node investigation/first-load/profile.mjs page-adopted 2 reopen --verify
$env:FL_CLEAR_HTTP='1'
node investigation/first-load/profile.mjs page-adopted 1 reopen
Remove-Item Env:FL_CLEAR_HTTP
node --test investigation/first-load/cache-tests.mjs
node investigation/first-load/summarize.mjs
```

Each profile invocation serves the chosen production output on localhost with gzip, launches installed headed Chrome, runs fresh/warm visits serially, closes it, and leaves trace/result files in local/. Chrome caches the first visit in its private profile; the warm visit resets only player-map storage to keep the same input. The reopen setup seeds the real branch-specific IndexedDB from the same-version fixture; that setup precedes the first measured request. `--verify` uses the real brush/undo and actual saved Your maps bytes, then tests valid/invalid export with the advisory worker disabled. Its edits occur after the measurement. Do not use its invalidated map screenshot as a before/after capture; summarize copies only generation captures.

`profile.mjs` with `$env:FL_HEADERS='1'` exercises a host that sends COOP/COEP. Run it as a separate diagnostic and save/rename its results under local/ before rerunning the no-header table; it shares the result naming. The delivered table uses no headers so first-control isolation is included. Traces end just after keyboard verification, so aggregate parse/compile counts may include a small tail beyond the marked endpoint. Probe transforms measure real generator RPCs, worker evaluation, first setMap, installed edit handlers, warmup and synchronous WebAssembly.Module calls. Wasm call sums overlap across water helpers and are not tier-compiler CPU totals. Raw HTTP bodies are counted at request start; they are not exact bytes received before the frame.

To regenerate patch files, ensure both prepare steps above have run on their exact source pins, then run `node investigation/first-load/make-patches.mjs`. Check milestone.patch against the dev pin and page.patch against the page pin with `git apply --check`; check both against the untouched scratch page copy with:

```powershell
git apply --check --directory=investigation/first-load/local/page-original investigation/first-load/milestone.patch investigation/first-load/page.patch
```

For focused scratch contract checks, the repository tests import investigation helpers. Create a junction **inside this clone** after preparing the copies, if it does not exist:

```powershell
New-Item -ItemType Junction -Path investigation/first-load/local/page-adopted/investigation -Target (Join-Path (Get-Location) investigation)
node node_modules/vitest/vitest.mjs run --config investigation/first-load/local/page-adopted/vitest.config.ts --root investigation/first-load/local/page-adopted --maxWorkers=1 tests/contract/storedMap.test.ts tests/contract/sessionWaterJobs.test.ts
node node_modules/typescript/bin/tsc --noEmit -p investigation/first-load/local/page-adopted/tsconfig.json
```

Create the analogous dev-adopted junction before its full scratch typecheck. Do not recursively copy/delete through these junctions. The existing dependencies resolve from the clone root. Owner CI instead runs on its real adopted source tree.

For the **unadopted streaming experiment**, on the page source pin run prepare with `page --streaming`, build-probe with a distinct label such as `page-streaming`, and profile that label (non-dev labels use page navigation). `prepare` copies browser-wasm.mjs to the scratch build only. Restore the normal `prepare page` and rebuild afterward before regenerating page.patch. It extracts committed WASM bytes, loads hashed assets with compileStreaming/MIME fallback, and queues early worker messages/ports across async startup. Preserve this as an experiment; its measured warm startup did not justify adoption.

[summarize.mjs](summarize.mjs) regenerates compact evidence.json, measurements.csv and two captures from the final raw label results. It does not overwrite prose conclusions automatically. Reconcile REPORT.md/MEASUREMENTS.md with any new measurements. No large results or traces belong in git (D195).

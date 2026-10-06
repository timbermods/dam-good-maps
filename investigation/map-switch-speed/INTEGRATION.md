# Adopting the map-switch investigation

The PR contains investigation artifacts only. Product files match `dev`. There are two patches, with no renderer or generator changes and no timing assertions:

- `adoption-milestone.patch`: `src/core/doc/session.ts`, `src/core/features/build.ts`, `src/core/library/saver.ts`, `src/worker/session.ts`, plus correctness tests in `tests/contract/storedMap.test.ts` and `yourMaps.test.ts`.
- `adoption-page.patch`: `src/ui/App.tsx`, `src/editor/Editor.tsx`, `src/editor/paint/usePaint.ts`, `src/editor/keyboard/useKeyboard.ts`, `src/editor/render/editorView.tsx`.

The measured implementation was built on `feature/page` at `32e07fe955ab0f759b5d9d61d9b0b37b83cb4344`, with `dev` at `f24ca403b13344659993280744647d7912a31996` merged locally. The merge applied cleanly (local merge `d996c57ab4faa9917bffc6e334c0d1f65ed5d995`). That merge and its product changes are not in this investigation PR.

## Milestone session

Apply `adoption-milestone.patch` to its `dev` work. The core patch makes the new behavior opt-in: ordinary `MapSession.open`, explicit replay builds, imported maps, old generators and restored stored maps keep their existing behavior. The worker opts in for cacheless current-generator projects without drawn landforms. It carries the saved base's water as a preview; the existing independent checks replica computes canonical water, and `adoptWater` replaces the preview. The new optional `SessionInfo.waterPending` is the page's save signal.

`YourMapsSaver.flush()` now includes writes already in flight. This fix must accompany the page patch: the page's replacement barrier relies on the snapshot/write actually finishing. Storage failure reporting remains the existing behavior.

Run:

```powershell
git apply --check investigation/map-switch-speed/adoption-milestone.patch
git apply investigation/map-switch-speed/adoption-milestone.patch
npm run typecheck
npx vitest run --project quick --maxWorkers 1 tests/contract/storedMap.test.ts tests/contract/yourMaps.test.ts tests/contract/projects.test.ts tests/contract/bake.test.ts tests/contract/waterStatus.test.ts tests/contract/deferWaterObjects.test.ts tests/unit/editor.test.ts
```

## Page session

Apply `adoption-page.patch` on `feature/page` after incorporating the milestone patch (or port its small changes into the current split if those files have moved). Its baseline is the page/dev merge above. The two parts should ship together; `waterPending` is optional so the page compiles during adoption, but the resave signal requires the milestone worker.

```powershell
git apply --check investigation/map-switch-speed/adoption-page.patch
git apply investigation/map-switch-speed/adoption-page.patch
npm run typecheck
```

The page uses canonical-water completion as a save-key change even when the edit version stays the same. This refreshes a save made during water preview with an existing-format stored map. During foreground replacement, `inert` and the keyboard guard prevent new outgoing edits; the existing edit queue drains first. Snapshots capture the outgoing entry before yielding and use the worker's returned version. In-flight storage writes are still awaited. No spinner, loading screen, text, style or permanent disabled control is added. Background canonical work does not use this input barrier.

Manual/browser acceptance: queue terrain edits then immediately click another Your maps entry; reopen the outgoing entry and verify both edits. Let an edited map finish canonical water without another edit, then verify its saved project carries `stored`. Generate and Surprise me should enter the new editor and retain the renderer. `browser-checks.mjs` checks these without performance assertions, using its own local Chrome profile and the diagnostic candidate build.

## Evidence and limits

See `REPORT.md`, `DETAILS.md`, `before.json`, `after.json`, `summary.json`, `equivalence.json`, `verification.json` and `browser-checks.json`.

This improves when editing can resume. The one cacheless after reading reached canonical water later than before; do not describe the 59.9% improvement as time to fully settled water. A later canonical autosave carries `stored`, so reopening can take the existing restore path; that subsequent reopen was functionally verified, not timed. Save/drain is now the largest foreground stage and was deliberately retained because moving it off the path would require a separate durable handoff.

D455's stored-map replay comparison and undo floor are unchanged. The new tests cover a differing stored map refusing undo, exact final `.timber` and project bytes, an edit made before canonical completion, and a flush during an already-started outgoing snapshot/write. The real 256×256 fixture also produced byte-identical map and project bytes after canonical completion.

## Reproducing the diagnostic reading

Use a disposable clone only. Pin the page/dev revisions above, merge them locally, install dependencies with the npm cache under this clone, and copy this investigation directory into that clone. Apply both patches for the candidate. Do not run instrumentation on a session's active checkout.

The committed `samples/edited-256.damgoodmaps.json.gz` is one 450,757-byte generated project, deliberately saved without a stored map. It has the same seven-edit log used for both readings. Each diagnostic profile seeds Your maps with this incoming project and an outgoing copy, queues the same extra outgoing edit, and clicks the incoming tile. Generation is excluded. The before capture originally created this same fixture through the page; the harness now seeds it directly for reproducibility.

Before applying the patches:

```powershell
$env:UV_THREADPOOL_SIZE='6'
$env:OMP_NUM_THREADS='6'
$env:RAYON_NUM_THREADS='6'
$env:npm_config_cache=(Join-Path (Get-Location) 'investigation/map-switch-speed/local/npm-cache')
$env:DGM_BASE='/'
(Get-Process -Id $PID).ProcessorAffinity=63
npm ci --no-audit --no-fund
node investigation/map-switch-speed/instrument.mjs
npm run build -- --outDir investigation/map-switch-speed/local/before
node investigation/map-switch-speed/measure.mjs before
node investigation/map-switch-speed/restore.mjs
```

Apply both adoption patches, then:

```powershell
node investigation/map-switch-speed/instrument.mjs
npm run build -- --outDir investigation/map-switch-speed/local/after
node investigation/map-switch-speed/measure.mjs after
node investigation/map-switch-speed/restore.mjs
Copy-Item investigation/map-switch-speed/samples/edited-256.damgoodmaps.json.gz investigation/map-switch-speed/local/target.bin
npx tsx investigation/map-switch-speed/equivalence.ts
node investigation/map-switch-speed/browser-checks.mjs
```

`measure.mjs` uses installed Chrome, a clone-local persistent profile, a 1440×900 viewport, High look and port 5193. It reports WebGL's renderer string; software rendering invalidates 3D numbers. The diagnostic caps water at two threads per pool, disables eager page water helpers, overrides page hardwareConcurrency to four, limits raster threads to two, and inherits six-core CPU affinity. These caps are instrumentation only and absent from the patches. Roughly a few minutes including setup/checks; builds, Chrome profiles, screenshots and dependency cache remain gitignored under `local/`. There are no speed gates or timing tests.

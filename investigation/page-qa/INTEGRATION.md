# Page QA adoption

Examined `feature/page` at **f2c6c34b86993c822541b5c8365140e45bbd5678**, Chrome **154.0.8037.95**, 2026-10-05 (America/Los_Angeles). `origin/dev` was **611da5ca0d22f60255ad790a6679aae4d2a31847**. The requested local merge conflicted in `EDITOR_PLAN.md` and `tools/retired-terms.json`; it was aborted, and none of dev's merge changes were tested. The investigation PR is based on that dev commit with only this folder added; its product files are dev's unchanged files. Patches target the examined **page** commit, not dev's different App.

Read the round-one report and integration notes from `origin/investigation/page-hunt`, and the saving-review report from `origin/dev`, using local Git objects. Neither folder existed in the examined feature/page tree. Round one's two fixes are already present here. None of the excluded findings is repeated.

| Owner | Adoption | Files | Defects |
| --- | --- | --- | --- |
| Page | `adoption-page.patch` | `src/editor/save/useSave.ts`, `src/ui/App.tsx`, `src/editor/Editor.tsx`, `src/editor/paint/usePaint.ts`, `src/editor/render/header.tsx` | F1, F2 |
| Milestone | `adoption-milestone.patch` | `src/core/format/world.ts` | F3 |
| Renderer | No patch | `src/render3d/` | No renderer implementation defect established |

**F1:** The renderer shows force frames before their operation is committed. The file handlers enqueue an export of the document while that force still exists outside it. Slow forces hide this because clicking the menu finishes the force; Fast forces do not. The patch awaits `ForceDriver.stop()` before joining the file queue, finishing and keeping the force, and showing that same final land before offering the file. One Playwright regression exercises both project and timber. The baseline independently reproduced both; its project regression fails with 2,219 missing tiles, and exploratory timber reopen also returned exactly the pre-force land.

**F2:** App remounts the Editor on every replacement and offers only the new document's edit history. The Cancel snapshot is not a replacement undo entry. The patch keeps session-memory project checkpoints for successful replacements, preserving map identity, kept state and the real-place link; undo/redo cross that boundary after the worker's own edits. It adds the requested “Undo to get <name> back” note. Failed Generate and Cancel add no checkpoint; editing after restoration clears replacement redo. Deletion still removes the chosen map and opens its successor. History is session-only and retains compressed checkpoints in memory; it does not introduce a persisted cross-map history format. The page owner can choose retention policy when adopting. One regression covers Generate, saved-map switching and opening a real place, with edit preservation and redo.

**F3:** `numToken` rounds packed values to seven significant digits; this need not round-trip the Float32 values sent to the renderer. An edited map's shown canonical depth and its reopened file diverge even after Ready and settling complete. The patch uses nine significant digits of the Float32 water depth/contamination specifically, leaving other packed tokens and the simulation unchanged. This changes water-token bytes and generated output hashes; the milestone owner must account for that in the normal version/provenance policy when adopting. It does not change physics, dry-depth thresholds or hidden-water conventions. The sample's depth error is tiny and has no established visible effect; it is reported because the requested round trip is strictly identical, not because a screenshot looks wrong.

## Reproduce and validate

All work and output stay inside this clone. `prepare.mjs` extracts the pinned page source from local Git objects into **local/baseline**, makes **local/patched**, and regenerates owner patches. It never edits the product source. It requires `git`, Windows `tar`, Node 22+ and this repository's dependencies. Install with `npm ci --no-audit --no-fund`, then:

```powershell
$env:UV_THREADPOOL_SIZE='6'
$env:RAYON_NUM_THREADS='6'
$env:CARGO_BUILD_JOBS='6'
node investigation/page-qa/prepare.mjs
node node_modules/typescript/bin/tsc --noEmit -p investigation/page-qa/local/patched/tsconfig.json
# Baseline server, in one terminal:
node node_modules/vite/bin/vite.js --config investigation/page-qa/local/baseline/vite.config.mjs --host 127.0.0.1 --port 52763 --strictPort --mode e2e
# In another terminal, from the clone root:
$qaTmp=Join-Path (Get-Location) 'investigation/page-qa/local/tmp'
New-Item -ItemType Directory -Force -Path $qaTmp | Out-Null
$env:TEMP=$qaTmp
$env:TMP=$qaTmp
$env:DGM_PAGE_URL='http://127.0.0.1:52763/dam-good-maps/'
node node_modules/playwright/cli.js test --config investigation/page-qa/playwright.config.ts
# Expected: 3 failures (missing force land, disabled replacement undo, changed water).
```

Stop that server before switching to the patched server; do not run the two browser passes concurrently:

```powershell
node node_modules/vite/bin/vite.js --config investigation/page-qa/local/patched/vite.config.mjs --host 127.0.0.1 --port 52765 --strictPort --mode e2e
# Test terminal:
$env:DGM_PAGE_URL='http://127.0.0.1:52765/dam-good-maps/'
node node_modules/playwright/cli.js test --config investigation/page-qa/playwright.config.ts
# Expected: 3 passes, one regression per defect.
```

The scripts use headed installed Chrome, one test worker, one renderer process and two raster threads. The page reports hardwareConcurrency=2 so it does not start parallel-water helpers. This preserves the actual GPU; no software renderer is forced. The WebGL context observed in the exploratory pass reported `ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER (0x00002702) Direct3D11 vs_5_0 ps_5_0, D3D11)`. Other sessions' processes were not inspected or stopped. `DGM_CHROME` overrides the executable, and `DGM_PAGE_URL` selects another isolated server. Timeouts catch hangs; there are no speed gates or timing assertions.

On the page owner's matching checkout, apply `git apply --check` and `git apply` for the page patch. The milestone owner similarly takes its separate patch. Keep these three browser regressions together for integration; they already run directly from this investigation, with no product imports from it. Run the product typecheck and these relevant regressions before pushing adoption. The existing `tests/unit/format.test.ts` was also run against a local copy pointing at the patched source: 16 passed, 1 skipped because this new clone contains no redistributable official/workshop maps. No new unit-test suite was added.

## Download limitation and evidence

A native Playwright download event occurred for each tested file. Chrome's CDP progress received the complete blob but then reported `canceled` when writing within this restricted clone; `Download.saveAs()` failed. The scripts observe the production anchor in capture phase, fetch its live `blob:` URL, allow the normal click to continue, and feed those exact bytes to the real file input. They do not substitute a worker export, prevent the download or fabricate a file. Thus byte/content/opening behavior is checked; actual browser-to-disk writing is not claimed to pass and is not reported as a product defect.

Large maps, browser profiles, downloads, test output, exploratory state and all copied source stay in `investigation/page-qa/local/`, ignored under D195. Regenerating the three repros and validation requires only the commands above and the public real-place assets included in the repository; allow several minutes on a shared machine, not a measured budget. The exploratory coverage sheet describes the additional manual Playwright sequences; it is a sampled pass, not every combination of map, size, force and weather day. No product files, merges, approvals, auto-merge, tags or releases are delivered.

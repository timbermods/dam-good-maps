# Round-2 integration and regeneration

Product files are unchanged on this investigation branch. The complete [adoption.patch](adoption.patch) targets fetched dev tip **`3f16eedeabaaaa5974f09913ff9f0b75d7232baf`** and edits only `src/core/land/hydro.ts`. Its behavior changes are River Valley's own shaping: preserve round 1's channel grade/spent-shelf reconciliation, qualify the default entering trunk, compare two routes around intended cliffs, and reduce ramps on a full-map split. No shared planner, thresholds, badwater lines or names are changed. The named dev tip's product code equals the original starting base; the branch retains that original ancestry and has no product edits to merge.

For adoption, check the patch against the intended dev tree, then apply it and run the focused tests and typecheck. The patch imports nothing from `investigation/`; do not adopt the loader. The investigation PR remains ready for review; it does not apply, approve or merge the product change.

```powershell
git apply --check investigation/river-valley-sheets/adoption.patch
git apply investigation/river-valley-sheets/adoption.patch
npm run typecheck
node node_modules/vitest/vitest.mjs run --project quick tests/unit/straight.test.ts tests/unit/genome.test.ts tests/unit/riverSheet.test.ts tests/contract/firstLand.test.ts --maxWorkers 4
```

The investigation's config adds four regression tests and transforms the proposal in memory. Run it on this unmodified product tree, before adoption. All commands below run only inside the dedicated `dam-good-maps-rivervalley` clone.

```powershell
npm ci --no-audit --no-fund
Remove-Item Env:RV_SEEDS -ErrorAction SilentlyContinue
Remove-Item Env:RV_OUT -ErrorAction SilentlyContinue
$env:RV_MODE='dev'
node investigation/river-valley-sheets/run.cjs batch.ts
node investigation/river-valley-sheets/run.cjs genomes.ts
$env:RV_MODE='round1'
node investigation/river-valley-sheets/run.cjs batch.ts
$env:RV_MODE='round2'
node investigation/river-valley-sheets/run.cjs batch.ts
node investigation/river-valley-sheets/run.cjs genomes.ts
python investigation/river-valley-sheets/summarize.py
node investigation/river-valley-sheets/run.cjs verify-r2.ts
node investigation/river-valley-sheets/run.cjs characters.ts
node investigation/river-valley-sheets/typecheck.cjs
python investigation/river-valley-sheets/patch.py
git apply --check investigation/river-valley-sheets/adoption.patch
$env:RV_CAPTURE_MODES='round1,round2'
$env:RV_CAPTURE_SEEDS='6,12,27,21,22'
node investigation/river-valley-sheets/capture.mjs
$env:RV_SHEET_ROUND='2'
python investigation/river-valley-sheets/sheets.py
node node_modules/vitest/vitest.mjs run --config investigation/river-valley-sheets/vitest.config.ts --maxWorkers 4
Remove-Item Env:RV_MODE,Env:RV_CAPTURE_MODES,Env:RV_CAPTURE_SEEDS,Env:RV_SHEET_ROUND -ErrorAction SilentlyContinue
```

`run.cjs` reads round 1's transformation from this clone's committed `f7051698` using `git show`. Round 2 uses the current `transform.cjs` (`after` remains an alias for round 2). Both transform only product hydrology in memory, with unique anchor checks. `batch.ts` writes mode folders below `local/`, or the optional `RV_OUT` folder for a trial. Optional comma-separated `RV_SEEDS` narrows diagnosis; clear it for the complete set. Never overlap generation batches.

`typecheck.cjs` uses a compiler host for the adopted source and writes only `local/hydro.after.ts`. `patch.py` obtains its base source with `git show` at the declared dev tip and checks equality to the branch product source before writing the unified patch. `summarize.py` writes small three-way read-back evidence and asserts unchanged fields for 21, 22 and 23. `verify-r2.ts` records character notes and contaminated-water distances from stored fields; its geometric distances are labeled separately from the generator's existing start checks.

`capture.mjs` requires installed Chrome and builds the unchanged editor into `local/editor-dist/`. It serves localhost port 4197 (must be free), opens one page at a time, imports each exact `.timber`, resets the opening camera and fixes lighting to 12.5. A 96-square map initializes each page; it is not comparison evidence. `RV_CAPTURE_MODES` and `RV_CAPTURE_SEEDS` select imports. `sheets.py` with `RV_SHEET_ROUND=2` writes the thirty-pair top-down sheet and the 6/12/27 opening-camera sheet. Python needs Pillow; labels use standard Windows Segoe UI. Each top-down map is 256 px, north up, red start and purple badwater; the opening camera uses native editor colors.

To regenerate the original dev/round-1 image, capture modes `dev,round1` and seeds `12,19,5,21,22,26`, then run `sheets.py` without `RV_SHEET_ROUND=2`. Original round-1 evidence remains committed.

Keep all bulk JSON, `.timber` maps, individual images, builds and rejected trials in gitignored `local/` (D195). Only the two round-2 JPEG sheets, small evidence, reports, patch and reproduction/regression tools are added. Tests are capped at four workers; generation and capture batches are sequential. Runtime is deliberately not measured. Push only `investigation/river-valley-sheets`, update only PR #244 into dev, and do not merge, approve or enable auto-merge.

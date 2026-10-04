# Integration and regeneration

The investigation branch contains no product edits. The adoption patch is against `2db8f5d36e41f2e085945fda62900f6e01453df3`, the starting dev tip, and changes only `src/core/land/hydro.ts`. Its behavior is restricted to River Valley's shaping. It does not change genomes, shared thresholds, badwater lines, names or other themes.

For adoption, first check the patch against the intended dev tree, then apply it and run the focused tests and normal typecheck. The patch contains no imports from `investigation/`. Do not copy the investigation loader into product code. Review the seed-12 readable-water tradeoff and conservative residual sheets on **19 and 24** before adoption. This ready PR delivers an investigation; it does not adopt or merge the product change.

```powershell
git apply --check investigation/river-valley-sheets/adoption.patch
git apply investigation/river-valley-sheets/adoption.patch
npm run typecheck
node node_modules/vitest/vitest.mjs run --project quick tests/unit/straight.test.ts tests/unit/genome.test.ts tests/unit/riverSheet.test.ts tests/contract/firstLand.test.ts --maxWorkers 4
```

The following commands reproduce the investigation without applying its product patch. Run from the new clone's root. Use the pinned base source: `run.cjs` transforms only the proposed River Valley edits in memory for after runs and fails if its source anchors change.

```powershell
npm ci --no-audit --no-fund
Remove-Item Env:RV_SEEDS -ErrorAction SilentlyContinue
$env:RV_MODE='dev'
node investigation/river-valley-sheets/run.cjs batch.ts
node investigation/river-valley-sheets/run.cjs genomes.ts
$env:RV_MODE='after'
node investigation/river-valley-sheets/run.cjs batch.ts
node investigation/river-valley-sheets/run.cjs genomes.ts
python investigation/river-valley-sheets/summarize.py
node investigation/river-valley-sheets/run.cjs characters.ts
node investigation/river-valley-sheets/typecheck.cjs
python investigation/river-valley-sheets/patch.py
git apply --check investigation/river-valley-sheets/adoption.patch
node investigation/river-valley-sheets/capture.mjs
python investigation/river-valley-sheets/sheets.py
node node_modules/vitest/vitest.mjs run --config investigation/river-valley-sheets/vitest.config.ts --maxWorkers 4
Remove-Item Env:RV_MODE -ErrorAction SilentlyContinue
```

`batch.ts` uses one map at a time. An optional `RV_SEEDS` comma-separated list supports diagnosis; clear it for the complete seed-1-30 result. Both modes use 128 x 128, Normal, River Valley and the existing default settings. No generation or capture batch should overlap another generation batch. The test command caps workers at four. There is no benchmark or speed reporting.

`capture.mjs` requires an installed Chrome, builds the unchanged editor into `local/editor-dist/`, and serves it on localhost port 4197 while capturing. It imports the exact exported `.timber` pairs, resets the opening camera, fixes lighting clock to 12.5 and captures the 3D viewport. A small 96-square map initializes each page before its import; those initialization maps are not comparison evidence. The port must be free. Python requires Pillow; the sheet labels use the standard Windows Segoe UI font.

`typecheck.cjs` typechecks the adopted source through a compiler host and writes the proposed source only to `local/hydro.after.ts`. `patch.py` creates the unified adoption patch. `vitest.config.ts` loads the transformed hydrology source in memory for focused tests. Product files remain untouched throughout this workflow.

`summarize.py` writes small, committed per-map results and other-theme genome hashes. `sheets.py` lays out the two deliverable JPEGs. The top-down map pixels are 256 x 256 each, north up; start markers are red, badwater sources and contaminated water are purple. The 3D comparison keeps the editor's native colors and opening camera.

All large results belong in `local/` and must stay out of git. Regeneration time is deliberately not measured, under the task's no-speed-measurements rule. Do not run benchmarks, increase test workers, upload bulk output, change unrelated checkouts, merge or approve this PR, or change the authorized push branch/base.

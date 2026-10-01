# Islands adoption

Based on `feature/m9b` at `6c29b7e524eea5739d49b6f0df2eae3b0856f4bd`, the latest remote commit when this investigation started. Only this directory is committed. Product sources were read and overlaid in memory, never edited. Cherry-pick the investigation commit(s) only; do not merge the branch's inherited M9b history into `dev`.

## Port

`adoption.patch` adds `src/core/land/archipelago.ts` and three integrations in `src/core/gen/generate.ts`:

1. Enable the measured default Islands path and skip the unused general elevation field.
2. Supply the sea-first land/hydrology stage before the existing land-only checks, mine pads and `onLand`.
3. Restrict the existing settler to the main island by combining its existing avoidance mask with the island mask.

The patch intentionally changes only **default Normal Islands, square 96–256**, with one colony, no set pieces or preservation constraints, and no regeneration context. Other themes, difficulties, controls and constrained regeneration retain the original path. Three fallback samples were checked byte-for-byte. Extending the prototype to those paths requires deliberate settings/constraint integration.

The sea is one natural read-back lake, with an ordinary river/source row and a connected sea course. Source strength uses M9b's calibration; mouth cells use its rasterizer. Outlets are sized before display. Original mine-pad, resources, badwater, outcome, six-day settle, local repair, field/document and export code remains in charge. No outcome threshold or absolute was weakened. `blockedCourses` remains active. Named RNG streams and index-tied sorting determine the geometry.

**Required shared changes, excluded from the adoption patch:**

- **Object planner dry land inside a natural lake outline: fixed in feature/m9b.** Measurements retain the investigation's narrow Islands overlay in `overlay.cjs`: the natural lake's polygon does not exclude dry islands from object placement. Port M9b's shared fix, not this overlay.
- Kyler's per-theme flood ceiling: measurements use **70% for Islands**; the old ceilings for other themes are preserved. Keep M9b's own per-theme implementation. The prototype deliberately reserves room for badwater below that ceiling.

On the pinned base, `git apply --check investigation/islands/adoption.patch` passes. On newer M9b code, port the three anchors rather than forcing hunks or replacing newer shared code. Preserve M9b's water-speed work. Advance the generator version and re-pin affected deterministic fixtures when adopting changed seed results. Repeat the sweep there, then include representative seas in the next authorized in-game probe batch; this investigation did not launch Timberborn.

## Regenerate

Run from the repository root at the pinned commit with Node 24, Git, Python 3 and Pillow. Install dependencies only under the ignored directory:

```powershell
New-Item -ItemType Directory -Force investigation/islands/local/runtime
Copy-Item investigation/islands/package.json investigation/islands/local/runtime/package.json
Copy-Item investigation/islands/package-lock.json investigation/islands/local/runtime/package-lock.json
npm --prefix investigation/islands/local/runtime ci --ignore-scripts --no-audit --no-fund
node investigation/islands/typecheck.cjs
node investigation/islands/batch.cjs before
$env:ISLANDS_SAVE='1'
node investigation/islands/batch.cjs after
Remove-Item Env:ISLANDS_SAVE
node investigation/islands/run.cjs after --entry cycles.ts
node investigation/islands/run.cjs after --entry verify.ts
$env:ISLANDS_NO_CAPTURE='1'
$env:ISLANDS_ADOPTION_ONLY='1'
$env:ISLANDS_FALLBACK_PHASE='before'
node investigation/islands/run.cjs before --entry fallback.ts
$env:ISLANDS_FALLBACK_PHASE='after'
node investigation/islands/run.cjs after --entry fallback.ts
Remove-Item Env:ISLANDS_NO_CAPTURE, Env:ISLANDS_ADOPTION_ONLY, Env:ISLANDS_FALLBACK_PHASE
node investigation/islands/summarize.cjs
python investigation/islands/sheets.py
node investigation/islands/build-patch.cjs
git apply --check investigation/islands/adoption.patch
git diff --check
```

Run batches sequentially on a quiet machine for wall-clock comparisons. `ISLANDS_RUNTIME` can point at an existing directory containing the same installed dependencies. Primary measurements execute **unmodified `investigation/m9b/measures.ts`**. `before` is the pinned product; `after` includes the prototype and the two disclosed shared overlays. CPU-scaled timings are M9b's own estimates on a shared machine, not a separate benchmark.

`local/` holds raw JSONL, per-seed checks, full-resolution pictures, `.timber` exports, model caches and trial results; none is committed. Compact aggregates, verification records and two 60-map sheets are committed. Sheets use the product's top-down terrain/water shading, north up, yellow marking the start; objects and contamination are not rendered. `cycles.ts` replays exported files with M9b's drought/refill scenario and pre-badtide contamination criteria: all 40 smaller maps and 256² seeds 1–3 (43 additional weather checks). Set `ISLANDS_FULL_CYCLES=1` for all 60. `verify.ts` checks five seeds against saved export hashes, exported terrain/water and stored-field project rebuilds.

# Adopt at terrain 3D step 2

Base: High look `84fe4d363cabb958429c07c02fc6a25738a360f8` (D334 soul and D346 earth).
Take **only this investigation's commits**, not the High branch's inherited history in the PR into dev.
No product source is changed. The demo imports its real material constructors directly.

## The proposed view

1. Adapt `geometry.ts` to `ColumnTerrain.mask` / foundations `VoxelMasks.mask`.
   Retain Erode's six-direction, 32×32 greedy mesher: outward ceilings, walls, and each run's floor.
   Invalidate both neighboring chunks at a boundary. Never collapse this to a surface heightfield.
2. Give terrain and water the **same** 24-layer sky/sun volume. Erode's `lightVolume` provides
   air-connected entrance falloff, skylight spill and occluded sun rays; trilinear sampling softens
   contact with solid cells. Sample half a cell along the true face normal. Keep the chosen 0.30
   ambient visibility floor: a working cave stays readable, including its downward-facing ceiling.
   This is bounded diffuse-light propagation, not global illumination or screen-space AO.
3. Keep the High and Standard `terrainMaterial` / `waterMaterial`, pattern atlas, palette and High
   hooks. Project the existing cliff stones onto ceilings. Use per-run soil instead of the roof's
   soil. `materials.ts` demonstrates the minimal changes as **asserted source substitutions**;
   adoption should add typed shader hooks for volume light, run sampling, ceilings and cut material.
   Do not ship string substitutions. Preserve High's sun warmth and grade, Standard's simpler water.
4. D207: an integer level L retains voxels below L. Mesh that clipped mask, including new horizontal
   faces only where solid rock crosses the cut. Consult original occupancy to distinguish these
   faces from natural tops. Cut faces use olive stone; an air gap is never capped. Do not fold all
   upper vertices onto L. Lighting still reads the **unsliced** terrain so removing a roof for
   inspection does not flood the cave with fictitious sunlight. Water above L is discarded.
5. Display terrain geometry, light, soil and level as one worker revision. The prototype transfers
   changed chunk buffers and texture data together, keeping the preceding revision visible until
   complete. Adopt the editor's gesture/generation IDs, cancellation and undo transactions;
   coalesce superseded input before it enters the worker, without skipping required mesh deltas.
6. Read water slots from `stackModel(...).cols`: surface = floor + depth, including roofed slots.
   Pressure/overflow is **not** visible water height. Cap filled columns at their physical ceiling.
   The writer (`format/stacked.ts`) remains untouched. All reflected water light, foam and glints
   receive cave attenuation. Wire Clear water (T) and picking to the selected run/slot.

## Boundaries to finish during adoption

- The demo isolates terrain and water. It omits trees, buildings, natural-slope models, falls, mist,
  object shadows, tools/picking and simulation. T5 therefore establishes roof geometry, not object
  clearance appearance. Use existing High object shadows in open air and volume light under roofs.
- T1–T6 use the foundations' exact scene builder, load-time support and canonical water/soil.
  Erode cases retain their demo water approximation; Block and Rift are rendered dry. The Rift
  snapshot still changes a heightfield; a future volumetric Rift needs its own integration check.
- The volume is 3 MiB and run texture 6 MiB at 256²; this demonstrator uploads each whole texture.
  Region uploads, pooled buffers and cached cut levels should follow only if adoption profiling
  needs them. Initial map construction is outside the edit pacing measurements.
- `performance/probe.js` and `metrics.mjs` are used unchanged for rendered frames, RAF intervals,
  relative hitches and Long Tasks. The existing heightfield-only geometry diagnostic cannot judge
  cave faces; `check.ts` supplies an independent voxel-face oracle. This is a focused renderer
  measurement, not the performance investigation's complete qualified multi-browser/laptop/hour gate.

## Regenerate

From this directory, on Node 24 with local Chrome installed:

```powershell
npm ci
npm run prepare:sources
npm run fixtures
npm run check
node node_modules/vite/bin/vite.js build
npm run capture
npm run dev
```

Open the URL Vite prints. Drag to orbit, scroll to zoom, use Inside and Show through level;
press T for clear water. Open / restore replays a fixture's actual terrain changes.
`capture.mjs --smoke` captures one view; `--perf` runs just the pacing measurements.
The static build is a compile check; run Vite for the demo's generated fixture URLs.

`prepare.mjs` extracts immutable Git snapshots into ignored `local/`: foundations `24b88b9b`,
dev `8f3e7e27`, performance `bb3d2183`, and Rift `9cc478ec` (its original forces dependencies
are absent on dev). Fetch these source histories if missing. The extraction never checks out,
edits or runs an installed game. Large masks, animation frames, source copies, builds and raw
measurement logs stay local. `local/fixtures/index.json` records deterministic fixture hashes.

Captures: each sheet has High in the first two rows, Standard in the next two. Columns show
outside / detail / inside, then three levels. Each panel is downscaled from 1200×750 to 480×300.
The Erode GIF uses the original pinned cave's removal buckets with lighting rebuilt for every state.

Before adopting: rerun these geometry checks, product renderer/stacked-water tests and the full
performance harness with the complete editor, including rapid cuts, undo and continuing water.

## Added by Kyler at approval (2026-10-01)

Adopted at 3D step 2, the view (D349), following this file. Also for adoption:
- The stone pattern stretches on ceilings and at corners: fix it.
- Cave interiors read a little murky, and deep water under roofs very dark: tune both with Kyler on real maps.
- Objects, slopes, falls and moving water inside caves are to be integrated.
- It passes the smoothness harness (`investigation/performance`) and the full-editor performance gates before it merges.

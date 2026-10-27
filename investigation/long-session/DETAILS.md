# Reading the measurements

The measured page is `feature/page` at `f2c6c34b86993c822541b5c8365140e45bbd5678`, on installed headed Chrome 154.0.8037.95 and ANGLE/NVIDIA RTX 4080 SUPER D3D11. `origin/dev` did not merge cleanly; the aborted merge is not part of the tested baseline.

## Recovery during the same page lifetime

The browser, renderer, workers, saved maps and original baseline clock remained alive throughout. At round 18 a background-generator offer (`A version with its broad valley and clearer water is ready`) covered a brush button. The automation was resumed after using its Dismiss button. At round 19 a Naturalize stroke changed no terrain; the harness incorrectly waited for a new version, then was resumed after counting that valid no-op. These are harness interruptions, not additional memory findings. Their timeouts, recovery markers and measurement gaps remain in the local JSONL log. The delivered fresh-run script dismisses offers and accepts an unchanged Naturalize stroke.

After the Playwright CDP reconnect, its worker collection omitted existing workers. `worker-sampler.mjs` samples those same worker targets through CDP, without GC. The page sheet marks each supplemented row and its time offset (at most thirty seconds); missing worker samples are blank, never zero or interpolated. Original worker identities are matched to the last pre-reconnect sample by URL and memory size, distinguishing the two helpers. Live counts after reconnect come from the CDP target inventory. The old and resumed controllers both observed some worker events, so cumulative birth/death counters are deliberately omitted from the sheet; they do not establish a leak. Read `worker-memory.csv` for each module, rather than treating raw `performance.memory` as page heap.

## Expected retained state and owner boundaries

- Milestone: `src/core/doc/session.ts` keeps at most eight built undo snapshots, taken every eight history steps. `src/core/features/build.ts` caps each `SettleCache` at four entries. Applied operations are the current document's intended undo history; they are not a map-switch leak. Wasm allocator capacity cannot shrink and must be interpreted together with repeated allocations after warm-up.
- Milestone: `src/worker/session.ts` retains one held-day run per hazard, replacing/disposal of a run when its session/version changes. The scenario steps back and on around each hazard's requested day; it does not test arbitrarily extending a single map's weather-day cache.
- Renderer: `src/render3d/renderer.ts` clears terrain/water/fall geometries and map textures through `clearMap`, and retires the previous water material after the next map's first frame. `src/render3d/entities3d.ts` disposes instance meshes as well as their geometry. Counts vary with map size, wet chunks, visible vegetation and temporary force effects.
- Renderer: `src/render3d/waterMesh.worker.ts` is JavaScript and retains the latest water state, with a Set of chunk keys. `src/render3d/high/bake.worker.ts` is JavaScript and transfers reply arrays. Neither instantiates a Wasm module in this baseline. Their measured exported linear memory is zero, not an omitted water-Wasm measurement.
- Page: `src/ui/View3D.tsx` retains one reusable renderer while disposing an already-kept one. Editor/window input listeners have matching cleanup. CDP's listener/node metrics include objects awaiting collection; rises between collections alone do not establish a leak.

Known merge-review F5/F6 are excluded. No forced collection, heap snapshot, reload, browser restart or software renderer is used inside the measured hour. Post-hour heap snapshots are diagnostic evidence about live retainers, and do not alter the recorded hour. WebGL buffer counts measure objects created minus explicit deletions, not driver memory or VRAM bytes.

LS1's unnecessary checks allocation and its minimal milestone patch are documented in FINDINGS.md. Final quantitative conclusions are in `REPORT.md`, `summary.json` and the two measurement sheets. Raw builds, logs, snapshots, profiles and all interrupted development trials remain ignored in `local/` under D195.

# Adopting the force playback investigation

Base: `dev` at `7adabb48d2017a428a5a08ecf49d19e8f427cfc2`. This PR changes investigation files only. Product sources, force calculations, pacing, pins and stored operations are unchanged on the branch.

## Owner patches

1. **Page session — `page.patch`:** `src/editor/session/mirror.ts` and `src/editor/forces/useForceRun.tsx`. Accepts existing whole height replies and the optional packed rectangle. Patches the page mirror in place before calling the existing `updateTerrainRect`. The renderer's independent `drawnLand` continues to detect the union of updates before a draw. Entity scheduling, effects, sound and the driver are untouched. This part can land first against the old worker.
2. **Shared worker / milestone — `worker.patch`:** `src/worker/session.ts`, `src/worker/generator.worker.ts`, and `tests/unit/forcePlaybackTransport.test.ts`. Retains the comparison array instead of allocating another map-sized copy. For the browser's advance and painted-Lift replies, sends the rectangle's packed rows when smaller than a full map; otherwise sends a whole snapshot. Transfers the fresh payload buffer; the simulation and comparison buffers remain worker-owned. Start, Try another, stop and cancel retain whole replies. Direct session callers default to the old full-snapshot protocol, so existing contract callers remain compatible. **Adopt the page part before enabling this worker part.** The new transport test needs the page helper.
3. **Renderer session — `renderer.patch`:** `src/render3d/entityGeometry.ts`, `src/render3d/entities3d.ts`, `src/render3d/renderer.ts`, and `tests/unit/entityGeometry.test.ts`. Caches static procedural model data by the existing complete batch key for one renderer's lifetime. Each batch retains its own geometry and GPU attribute objects; only immutable CPU arrays are shared. Growth, transforms, colours, visibility and object bookkeeping stay per batch. The software path keeps its existing baking. Renderer disposal releases the cache. This part can land independently.

Each owner applies their patch at the repository root with `git apply --check` followed by `git apply`. Adapt surrounding code if their branch has moved; retain the batch keys, the transfer ownership and the page-before-worker order. No product code imports this investigation.

## Validation performed

The adopted source was built and typechecked in the isolated `local/work` fixture. Typecheck passed. Fourteen selected files passed, **150 tests**, with two Vitest workers: the two added tests, forceDriver, forcePlayback, terrainChanges, chunkGeometry, waterMesher, highLook, look-readable, look-mine-ruins, forceOps, forceEsc, forces and forceRecordClock. The existing `forces` suite includes its pinned parity cases. No timing assertions or speed gates were added. All three adoption patches pass `git apply --check` against the base. `git diff --check` runs before publication.

The new tests compare cached and fresh draw arrays across live/dead/young plants, wet/dry ivy, ruin variants, changing heights and both GPU/software paths. They verify mutable growth data and GPU attributes are independent. Transport tests compare every transferred frame of all five released forces against the original full-snapshot protocol on exact stepped time, including cues/trails and kept land; they also check accumulating patches and restoring a whole snapshot.

## Reproduce in this clone

Install the root lockfile with `npm ci`. Use `UV_THREADPOOL_SIZE=2` and `RAYON_NUM_THREADS=2` for checks; the measured builds used 6, the browser limited render/raster concurrency and exposed 3 hardware threads to the app. Never run Timberborn.

```powershell
node investigation/force-playback/prepare.mjs --profile
# Build and serve local/work with the root's Vite binary, cwd local/work.
node node_modules/vite/bin/vite.js build --mode e2e
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5299 --strictPort
# In another shell, cwd this clone:
node investigation/force-playback/profile.mjs before
```

For an adopted fixture, stop the server, then run `node investigation/force-playback/prepare.mjs --adopt --profile`, build and serve the same directory, and run `profile.mjs after` once. For checks, use `prepare.mjs --adopt` without profiling. From `local/work`, run `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` and:

```powershell
node node_modules/vitest/vitest.mjs run --project quick --maxWorkers=2 tests/unit/entityGeometry.test.ts tests/unit/forcePlaybackTransport.test.ts tests/unit/forceDriver.test.ts tests/unit/forcePlayback.test.ts tests/unit/terrainChanges.test.ts tests/unit/chunkGeometry.test.ts tests/unit/waterMesher.test.ts tests/unit/highLook.test.ts tests/unit/look-readable.test.ts tests/unit/look-mine-ruins.test.ts tests/contract/forceOps.test.ts tests/contract/forceEsc.test.ts tests/contract/forces.test.ts tests/contract/forceRecordClock.test.ts
```

`probe-chrome.mjs` optionally verifies the hardware without playing a force. Local JSON captures/builds/dependencies stay ignored under `local/` (D195); the recipe is seed 4242, Highlands, Normal, 256², 1440×1000, High, Fast, Power/Size at their maximum. The five plays take a few minutes depending on shared-machine load. The page's sampled gesture and its gathering time can differ between runs. Keep the raw observations distinct from deterministic equivalence tests. `make-patches.py` regenerates the handoff from edited fixture files and removes the temporary profiling wrapper.

# Adoption

This PR changes only `investigation/startup/`. Adopt in the milestone session, after part 1's first-visit modules are present. `adoption.patch` is based on PR #92's source `b8471e7a`; existing product modules and the renderer used for measurement come from `dev` `f5874349`. If either source moved, adapt the small patch rather than overwriting later work.

```sh
git apply --check investigation/startup/adoption.patch
git apply investigation/startup/adoption.patch
```

The patch moves metadata/selection into `src/core/library/firstVisitPicker.ts`, leaves build-time generation/validation in `firstVisit.ts` with compatible re-exports, redirects the browser loader, and adds the startup composition helper. It changes no random selection, project bytes, generation, worker operation, renderer, or export check.

Use the helper in the new workspace's existing first-visit branch. Create its normal worker at entry as today, so worker startup overlaps loading:

```ts
const first = await startFirstVisit(
  () => import("../../editor/Editor").then(m => m.default),
  bytes => api.openProject(bytes),
);
if (first) {
  // Mount the existing workspace/editor with first.opened and first.editor.
  // Keep its panel open on first visit and its single quiet hint.
} else {
  // Keep the existing live-generation fallback.
}
```

The helper overlaps the editor import with index → randomly selected project → normal worker opening. Handle rejected editor/worker promises through the workspace's usual error state. Keep share-link, real-place, and autosave opening policies outside this branch; do not load a random map over the user's saved map or edits. `bench.tsx` is a timing composition, not an adoptable replacement for `main.tsx` or the milestone's full workspace.

Keep the generator/validator modules out of static browser imports. Preload only dependencies certain to be needed: the editor and renderer on a fresh first visit, not every tool, map, gallery, or force. The build already emits modulepreloads for static dependencies; adding manual hints without removing a measured waterfall can duplicate work. The patch does not invent cache headers for GitHub Pages. Confirm the deployed Content-Encoding/transfer sizes before treating gzip or Brotli as a hosting guarantee.

## One service worker

Read parallel-water's `isolation-sw.js` and registration policy at adoption time. This investigation read the in-progress local candidate; it does not change or claim ownership of that investigation.

After putting that **same** worker at `public/isolation-sw.js`, optionally apply:

```sh
git apply --check investigation/startup/cache-adoption.patch
git apply investigation/startup/cache-adoption.patch
```

The combined policy selects cache/network once, then applies the existing isolation wrapper. It retains the safe-update message and avoids `skipWaiting` during edits. There is no second registration. Registration stays at the site's `/dam-good-maps/` scope, including previews at their own base. Keep its first-control reload before an editable document, and measure opening-to-editable across that reload before adoption: that penalty is not in this investigation's matrix. A fresh cache cannot speed a fresh visit.

The immutable cache holds at most 64 content-hashed JS/CSS/WASM assets, survives build updates safely because URLs change with content, and fails open to the network when storage is unavailable. It does not provide full offline navigation. First-map filenames like `river-valley-1.json.gz` are not content hashes: leave them and index/navigation on the network. To cache them later, emit digest filenames and keep the manifest, HTML, and map version consistent before caching anything else. Never cache IndexedDB/project files, personal data, opaque responses, or a failed fetch; never add CORP permission to remote assets.

Regenerate the optional patch when the isolation candidate changes:

```sh
node investigation/startup/make-cache-patch.mjs /path/to/parallel-water/isolation-sw.js
```

It asserts the single fetch seam, writes only startup files/local test copies, and verifies applicability. With no argument it uses `isolation-reference.js`, a read-only snapshot of the other investigation's candidate, to make reproduction self-contained; `prepare` does this automatically. `cache-tests.mjs` checks a network hit and cache hit both keep COOP/COEP and unchanged bodies with one fetch handler. Browser isolation/reload compatibility remains parallel-water's browser check, then the integrated startup check.

## Reproduce

Run from the repository root. Node ≥22, installed Chrome, Python, and this repository's locked npm dependencies are required. The pinned source commits must exist locally; fetch PR #92's head as source context if needed, without reviewing it. Large outputs, maps, copied product sources, browser profiles, builds, screenshots, and traces stay under `investigation/startup/local/` and are ignored.

```sh
npm ci
node investigation/startup/prepare.mjs
node investigation/startup/measure.mjs --runs 5
node investigation/startup/summarize.mjs
node investigation/startup/inventory.mjs
node --import tsx investigation/startup/fixture-probe.mjs
node investigation/startup/cpu-probe.mjs
node --test investigation/startup/tests.mjs investigation/startup/cache-tests.mjs
node investigation/startup/gate.mjs --results investigation/startup/local/results.json
```

`prepare` copies existing product sources read-only, adds part 1's missing components from its pinned commit, applies the proposal only in disposable copies, checks the patch, generates/checks all six first maps including Python, and makes three production builds. `--skip-maps` reuses validated maps. `--no-python` is only a local diagnostic shortcut; the reported batch used Python. The committed fixtures/results are small summaries, not the generated maps.

`measure` launches a fresh Chrome process per cold/warm pair. It rotates neither seed nor map in the main matrix, keeping River Valley seed 1 comparable. It marks the frame immediately after the renderer's GPU-finished `setMap`, selects Raise through a real key event, waits for its pointer tool and a frame, then stops tracing. The subsequent worker edit/undo cannot inflate startup timing. FCP is the browser paint entry; response is the panel's real toggle handler; worker-ready is the first generator RPC answer, which includes download/evaluation/initialization, not just construction.

Thread CPU clocks (`tts`/`tdur`) exclude streaming waits and scheduler pauses; nested slices are unioned per thread. Parse and compile categories overlap. The file inventory uses gzip level 6, matching the local server, and Brotli for comparison. Timing is for navigation to the site, excluding launching Chrome. One selected map is transferred, not the whole handful.

The separate shipped `dev` baseline uses the real default Surprise-me/random-seed first-visit flow; after generation, automation immediately chooses Refine to reach editable land. Its repeats sample that randomized flow rather than pair identical terrain:

```sh
node investigation/startup/measure.mjs --variants dev --runs 3 --out investigation/startup/local/dev-results.json --summary investigation/startup/local/dev-summary.json
node investigation/startup/summarize.mjs investigation/startup/local/dev-results.json DEV
```

## CI after adoption

After connecting the workspace and building release-checked first maps with the existing deploy tool, run:

```sh
node investigation/startup/ci.mjs
```

This builds the **actual** production entry with a measurement-only first-frame mark and fixed first-map selection (0.001 instead of random), checks its static import closure and editor/worker byte budgets, serves it through both link profiles, measures three cold/warm pairs with 1×/4× page CPU, and gates timings plus edit/undo correctness. It expects the real panel and existing `window.dgm3d`/`window.dgmEditor` hooks. It does not click Refine or silently substitute the prototype; a still-unconnected first-visit page fails.

Example workflow steps, after the normal setup/`npm ci` and first-map generation:

```yaml
- run: node investigation/startup/ci.mjs
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: startup-results
    path: investigation/startup/local/ci-*.json
```

Use a pinned Chrome runner for timing comparisons; provision that browser before running. A hosted software-rendering runner is useful for regression checks, not evidence of laptop GPU speed. Run byte guards on every PR; run the full browser guard on UI/render/worker/dependency changes. The test currently covers one representative map; the all-six `MAPS.json` probe and release checks expose the remaining hydration work. Before accepting the two-second promise, add all six choices to the integrated matrix and verify workers/GPU on target hardware.

The actual-page CI command is supplied for adoption; it has not passed on today's unconnected product. The prototype gate, patch builds/type-check, release checks, and focused tests were run and passed. Keep living product/editor docs in sync when the milestone adopts the change.

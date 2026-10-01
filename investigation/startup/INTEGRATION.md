# Adoption

This PR changes only `investigation/startup/`. Adopt in the milestone session after part 1's modules are present. Existing product sources are `dev` `f5874349`; missing part-1 modules come from PR #92's source `b8471e7a`. Adapt the patches if either source moved; never overwrite later work.

Apply the round-1 picker/parallel-loading patch, then its round-2 extension:

```sh
git apply --check investigation/startup/adoption.patch
git apply investigation/startup/adoption.patch
git apply --check investigation/startup/round2-adoption.patch
git apply investigation/startup/round2-adoption.patch
```

Round 1 keeps generation/validation out of static browser imports. Round 2 adds optional format-3 checkpoints, prepares the displayed renderer while fetching, and defers the checks replica. `bench.tsx` composes part 1's panel/card with dev's real editor/worker; it is not a replacement production entry. Controls, card counts and autosave integration remain the milestone's work.

The checkpoint stores exact typed-array bytes, `JsonFloat` values/original spellings, entities, water state and brush/resource/build caches. It preserves aliases while sharing equal buffer storage; byte transposition improves gzip without rounding. SHA-256 binds it to build inputs and detects damaged payloads. `checkDocument` still validates/replays the document first. Compatible checkpoints restore directly; absent, stale, damaged or incompatible ones take the existing rebuild path. **Legacy files cannot bypass a rebuild without information they never stored.** Their next canonical save gains a checkpoint. Pending preview water keeps the exact original fast save/canonical-reopen path; autosave must not force a full build on the editing worker.

Only memoized distance/noise fields are omitted; existing tools recompute those on demand. Proof includes a legal terrain-feature edit and undo. Bump `startup-build-4` in `checkpoint.ts` whenever build/cache semantics change, even if the generator version does not. Regenerate/release-check all six ready maps through the existing tool: it now writes checkpointed projects after a reference rebuild. Older readers ignore the extra property and rebuild.

Fetching starts before the dynamic renderer import. Warm-up builds a tiny terrain/water/fall/instanced-object scene, uses `compileAsync`, and completes GPU work. `View3D` adopts **that canvas and WebGL context** into its own DOM container, then calls the unchanged real `setMap`. All six fixed-clock GPU framebuffers match, with zero new programs in the first real map. Keep one startup operation per workspace; call `discardPreparedRenderer()` if navigation cancels before mounting. Normal loader failure already disposes it.

Use the helper in the workspace's existing first-visit branch:

```ts
let firstEditable!: () => void;
const checksAfter = new Promise<void>(resolve => { firstEditable = resolve; });
const api = createGenerator({ checksAfter });
const first = await startFirstVisit(
  () => import("../../editor/Editor").then(m => m.default),
  bytes => api.openProject(bytes),
);
if (first) {
  // Mount the existing editor with first.opened, api and onEditable={firstEditable}.
  // Keep the first-visit panel, hint and workspace policies.
} else {
  // Keep live generation; release checks when its editor is editable.
}
```

The editor still clears stale reports, but starts its existing 700 ms background-check timer after renderer readiness. The replica starts after two animation frames with input handlers attached; its canonical initial state also hydrates. Pending preview replicas keep normal replay/build. The WebGL error path still starts checks. Save/export retain their full-check gates, including immediate Save before a background report; six-map positive, negative and replica tests cover them.

Keep autosave/share-link/project selection ahead of random first-visit selection. For stored projects, overlap their fetch/storage read with the same renderer preparation and editor import. Handle rejected imports/worker promises through the normal error state. Keep the small static entry; avoid preloading every tool/map/gallery. Confirm deployment compression rather than treating local gzip/Brotli sizes as a GitHub Pages guarantee.

## One service worker

Round 2 adds no registration. Read parallel-water's latest isolation worker and registration policy at adoption time. After that **same** worker is at `public/isolation-sw.js`, optionally apply `cache-adoption.patch`. It has one fetch listener, selects cache/network once, then applies isolation to both. Safe updates remain intact; no `skipWaiting` during edits. Registration keeps the site's base/scope, including previews.

The cache holds at most 64 same-origin content-hashed JS/CSS/WASM assets and fails open when storage is unavailable. Navigation, unversioned ready-map/index URLs, remote responses and user projects are excluded. To cache ready maps, first emit digest filenames and keep manifest/HTML/map versions consistent. GitHub Pages caching headers are not configurable here. No service-worker caching gain or first-control isolation reload is included in these measurements.

```sh
node investigation/startup/make-cache-patch.mjs /path/to/parallel-water/isolation-sw.js
```

With no argument this uses `isolation-reference.js`, the read-only round-1 candidate snapshot. Cache tests verify unchanged network/cache bodies and COOP/COEP with one fetch handler. The integrated page must measure the first-control reload too.

## Reproduce

Run from the repository root with Node >=22, installed Chrome, Python and locked npm dependencies. Pinned source commits must exist locally. Large maps, copied sources, builds, screenshots and traces stay under ignored `investigation/startup/local/`.

```sh
node investigation/startup/prepare.mjs
node investigation/startup/prepare-round2.mjs
node --import tsx investigation/startup/codec-round2.ts
node --import tsx investigation/startup/pending-save-round2.ts
node --import tsx investigation/startup/worker-gates-round2.ts
node investigation/startup/gpu-proof-round2.mjs
node --test investigation/startup/tests.mjs investigation/startup/cache-tests.mjs
node investigation/startup/measure.mjs --variants round2-before,round2-after --maps all --runs 5 --out investigation/startup/local/round2-measured.json --summary investigation/startup/local/round2-measured-summary.json
node investigation/startup/summarize.mjs investigation/startup/local/round2-measured.json ROUND2
node investigation/startup/inventory.mjs --round2
node investigation/startup/gate.mjs --round2 --dist investigation/startup/local/dist-round2-after --results investigation/startup/local/round2-measured.json
node --test investigation/startup/budget-round2-tests.mjs
```

`prepare` reads/copies product sources, adds missing part-1 modules, release-checks all six original maps including Python, and builds the round-1 variants. `--skip-maps` reuses checked maps; `--no-python` is diagnostic only. `prepare-round2` checks its layered patch, proves all six identities and twelve synthetic saved projects, upgrades only disposable after fixtures, and builds both variants. Themes, seeds and terrain/water/object results stay identical. `--skip-fixtures` reuses proved checkpoint fixtures. Run correctness work before timing.

Round 2 interleaves before/after order and reverses it on alternate repeats. It measures 480 visits: six maps x two variants x two links x two CPUs x five cold/warm pairs. `--resume` restarts an interrupted pair cold and skips complete pairs. Never resume after changing built artifacts. Earlier diagnostic/partial batches are excluded from reported data.

Cold uses a fresh Chrome process/profile/cache; warm uses the same context/cache and a new document. OS/GPU-driver caches and shared-PC load are not reset. The server shares 100 Mbit/s/10 ms or 25 Mbit/s/80 ms across requests, serves gzip and models ten-minute freshness; DNS/TLS/expiry are excluded. Chrome 4x throttles the page only, leaving workers/GPU native; `cpu-probe.mjs` verifies this limitation.

The frame mark follows GPU-finished `setMap`. A real Raise key event, pointer-tool binding and painted frame establish editable time; the later worker edit/undo cannot inflate it. `rendererPrepare` includes async compilation/GPU completion; `render`/`mesh` cover the real map. Response is the panel's second toggle after both clicks restore its first-visit state; worker-ready is the first generator RPC answer. Parse/compile use thread CPU clocks and nested-slice unions; categories overlap. Full per-file/request/cache/trace evidence stays local; small CSV/JSON summaries enter Git. GPU proof freezes the clock and reads the framebuffer directly, separately from timing.

Historical round-1 reproduction uses `measure.mjs --variants before,after`, `summarize.mjs`, `inventory.mjs`, `fixture-probe.mjs` and the unflagged gate. The shipped randomized baseline uses `--variants dev --runs 3`; it is not paired terrain and is not reused for round 2.

## CI after adoption

After connecting the workspace and release-building all six maps:

```sh
node investigation/startup/ci.mjs
```

This builds the **actual production entry**, adds measurement-only frame/check/choice marks, selects each map through the URL, checks static/editor/renderer/worker bytes, and measures five cold/warm pairs per map/link/CPU (240 visits). Every map/profile gets its own median/worst limit from `ROUND2-BUDGETS.json`. Missing/duplicate repeats, wrong choices, early checks, page errors and edit/undo failures fail the gate. It uses existing `window.dgm3d`/`window.dgmEditor` hooks, never clicks Refine and never substitutes the prototype: an unconnected first-visit page fails.

Provision pinned Chrome and upload `investigation/startup/local/ci-*.json` on failure. Run byte guards on every PR and the browser guard on UI/render/worker/dependency changes. Software-rendering CI is a regression check, not laptop-GPU evidence. Target-hardware acceptance must include worker/GPU speed, deployment compression, DNS/TLS, expired caches and the isolation reload.

The actual-page CI command is supplied for adoption and has not passed on today's unconnected product. The prototype gate and semantic/GPU proofs are run here. Keep product/editor docs in sync when adopting.

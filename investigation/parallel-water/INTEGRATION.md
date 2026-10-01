# Adoption

Base: `feature/m9b` at `6c29b7e5`, latest when fetched. Read the faster-settle investigation
(`ed6fc4fb`) and determinism investigation (`f306fd49`) first. This candidate keeps M9b's **six-day**
cap (D358); copying the earlier four-day prototype would change stopping ticks. Product files were
read and bundled, never edited. The PR into `dev` inherits M9b history; take the investigation commit
after that history lands, or cherry-pick only the investigation commit.

## Files and wiring

- `water.ts`: faster-settle numerical rules, unchanged loop expressions extracted into two kernels;
  optional construction hook and a synchronous execution scope. Without a hook it is scalar.
- `runtime.ts`: reusable shared workspace, workers, fixed partitions and phase barriers. Await
  `installParallelWater()` **once in the existing generator/editor coordinator worker**, before
  generation, live editing or Weather starts. Existing synchronous core calls then keep working.
- `helper.ts`: worker entry. Adopt as `water-parallel.worker.ts`; import its URL with Vite's
  `import helperURL from "./water-parallel.worker.ts?worker&url"` and pass that URL to the runtime.
  Keep its import pointing at the adopted `water.ts`. A variable URL passed to `new Worker()`
  does not meet Vite's static worker-constructor detection rules; do not copy raw TypeScript as an asset.
  See [Vite worker imports](https://vite.dev/guide/features.html#web-workers).
- `isolation-sw.js` and `isolation-register.js`: static-host isolation policy and early bootstrap.
  Deploy at the app's base, including `/preview/` as its own scope. Await registration before importing
  and mounting the editable UI. The bootstrap never resolves in the document being reloaded.

The adoption patch contains the simulator and new runtime/public files. Worker/API startup wiring
and the UI bootstrap remain explicit integration steps: they must follow the milestone's current
worker initialization and cancellation protocol. Do not initialize this runtime on the UI thread;
`Atomics.wait` is worker-only. Do not install separate runtimes concurrently in one coordinator.

For the main and gallery entries, use a minimal bootstrap before their current main module:

```ts
const base = new URL(import.meta.env.BASE_URL, location.href);
const { registerIsolation } = await import(
  /* @vite-ignore */ new URL("isolation-register.js", base).href
);
await registerIsolation(new URL("isolation-sw.js", base).href);
await import("./main"); // corresponding main entry; UI mounts only after this resolves
```

Keep Comlink's handler registered while helpers start: current `createGenerator()` immediately
calls `connectChecks()`. A readiness gate around the API prevents early calls from being lost:

```ts
import helperURL from "../core/sim/water-parallel.worker.ts?worker&url";
import { installParallelWater } from "../core/sim/parallel";
const ready = installParallelWater(chosenThreads, helperURL);
const gated = new Proxy(api, {
  get(target, key) {
    const value = Reflect.get(target, key);
    return typeof value === "function"
      ? async (...args: unknown[]) => { await ready; return Reflect.apply(value, target, args); }
      : value;
  },
});
expose(gated);
```

The milestone must test this gate with its actual Comlink transfer/callback/cancellation paths.
The checks, real-place and background-search workers also call water code: choose which receive
a pool and budget their combined threads. An ungated worker keeps the exact faster scalar path.
Do not give every concurrent worker the machine's full advertised concurrency.

Keep the existing module API and all public arrays. Default to scalar until the milestone accepts
the evidence and chooses dispatch policy. `threads` includes the coordinator; the provisional
cutoff is 1,024 list entries per configured thread **per phase**. Below that, the coordinator runs
the same kernel. Evidence records both dispatch paths; `--forced` uses zero cutoff to exercise
helpers on small fixtures. Hardware concurrency is an upper bound, not a promise of faster water.

The workspace allocates **141 bytes per tile**, 8.81 MiB at 256² or 35.25 MiB at 512², once per
coordinator, plus the faster-settle caches (23 bytes/tile) and existing simulator arrays. State is
copied into/out of the workspace around each `run()`; migration is included in measured settle
time. Returned arrays keep their private identities and cannot be overwritten by the next map.
Use the intended maximum size when installing. A model larger than the workspace stays scalar.

## Exactness argument

The faster-settle investigation proves incremental wet/active membership, evaporation invalidation,
cached neighbour indices and list reordering preserve the reference. Its numerical expressions are
extracted verbatim by `prepare.mjs`; the newer cap is read from the pinned product source.

1. The coordinator clears stale flows and prepares complete lists/modifiers. Each helper owns the
   disjoint half-open list range `[floor(count*id/threads), floor(count*(id+1)/threads))`.
   Lists contain each tile once. Non-divisible lengths and empty partitions are allowed.
2. Pass 1 reads complete depth/old depth/momentum and writes only its tile's four flow entries.
   All helpers acknowledge an atomic epoch before pass 2 can read those entries.
3. Pass 2 reads complete flows and **old** concentration. It writes only its tile's depth, old
   depth, concentration scratch and four momentum entries. It never reads a neighbour's new depth.
   A second barrier precedes concentration commit and sources.
4. Sources, overlapping source cells, seep hysteresis, wet transitions and evaporation invalidation
   run on the coordinator in the original order. There are two substeps and four barriers per tick.
   Helpers are idle before any tick snapshot or stopping check is published.
5. Four-direction sums retain their original expression order. Volume and sealed-basin reductions
   remain the original full row-major sums; moved counts and every stop check retain their original
   schedule. No floating point partial sums, approximate equilibrium or timing-based stopping exist.
6. Workspace migration copies binary64 bytes, without arithmetic. Private arrays are restored before
   callers inspect state. Cached integer topology is coordinator-owned. Atomic publication/acknowledgment
   separates all conflicting read/write phases. No concurrent floating point accumulation exists.

Thus, for identical model bytes, initial state and ordered forcing, the parallel and scalar state
agree by induction after each substep, including all public arrays, seep state, saturation, volume
and stopping ticks. The kernels use basic binary64 arithmetic, comparisons, min/max and ceil, not
native approximate transcendental math. Finite sweeps check execution, not every future engine.

**Portability boundary:** model planning/forcing happens outside these kernels. The determinism
investigation found native `hypot` changes live-edit terrain and native `exp` changes fractional-day
badtide forcing. `curve-probe.mjs` separates today's actual 12/96-tick Weather cadence from that
fractional-day counterexample, and supplies an `expDet` control. A portable-math replacement changes
some current bytes: do not silently include it here. Adopt portable planning/forcing with its own
versioning/re-pinning decision, or distribute identical normalized model/forcing bytes. Do not claim
unrestricted end-to-end cross-engine identity merely because the settle kernels match.

No isolation or blocked helper startup selects the scalar candidate before any water advances.
A failed phase throws; discard the task/simulator and restart from its original input and forcing
schedule on the scalar path. Never continue from half-written shared state. Cancel at existing
`run()`/settle slice boundaries; preserve epoch/task IDs when sending previews back to the UI.

## Isolation, resources and caching

On a static host with no server COOP/COEP, the worker wraps readable same-origin responses with
`COOP: same-origin` and `COEP: require-corp`. It does not invent CORP on third-party responses.
Secure context is required (HTTPS on Pages; loopback is the test equivalent). The browser, not
JavaScript, decides isolation. Same-origin dedicated-worker scripts also pass through the policy.
The resource and opener requirements follow [COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
and [COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy).

Pinned source inventory (`index.html`, `src/styles/`, `src/platform/`, `src/editor/`, `src/places/`,
`src/render3d/`): **no remotely loaded fonts, scripts, images, textures or audio**.

| Current resource | Origin / requirement |
| --- | --- |
| Vite JS/CSS chunks; bundled Preact/signals, Three, Comlink, fflate | Same origin. No CDN scripts or imports. Serve worker scripts through the unified policy. |
| Generator/checks/place/start-check workers; proposed water helpers | Same origin. Correct JavaScript MIME type and app-base URLs. |
| Fonts | System fonts; no network font fetches. Future remote fonts need CORS, including redirects. |
| `real-places/index.json`, `data/*.json.gz`, gallery card pictures | App-base URLs, same origin. Cache hits must retain/apply policy. |
| Shelf/render images and favicon | Generated data URLs/canvas snapshots; no external fetch. |
| GitHub source links, AWS elevation attribution; schema `$id`/`$schema` | Links/identifiers, not runtime resource fetches. Offline elevation processing is outside the page. |
| Future cross-origin images or classic scripts | CORP permitting this origin/site, or explicit anonymous CORS with server ACAO. Opaque denied resources remain denied. |

First visit installs/claims then reloads **once**; registration failure, blocked workers or unsupported
isolation leaves scalar operation. A session-scoped guard prevents reload loops. Isolated subsequent
visits do not reload. COOP disconnects cross-origin opener relationships; check future sign-in/popups.
The page loses its first document and loads resources again (HTTP cache may help), so bootstrap must
precede opening/importing a project or accepting input. No page data is silently reset on an update.

Updates wait, retaining the current document/worker pair. After the milestone's safe/save checkpoint,
send `ACTIVATE_WHEN_SAFE` to `registration.waiting`, then explicitly navigate/reload. `clients.claim()`
changes the controller without navigating an editing tab. Keep old cache assets available while old
tabs/workers still need them; do not combine activation with immediate deletion of old chunks.
Namespace cache names by application scope/base as well as version, so production and preview
cannot read or delete each other's cache entries.

**One caching/isolation worker, one registration, one fetch listener.** Merge the startup investigation's
network/cache selection at the marked `fetch(request)` point, then apply `isolate()` to the selected
network **or cached** response, including navigation and worker scripts. Do not cache opaque cross-origin
responses to manufacture permission. Put cache versioning and policy versioning in that same lifecycle.
Registration refuses to replace a different active worker script; rename/merge into the agreed app
worker first. This avoids accidentally replacing a caching worker with the isolation-only prototype.
The supplied worker intentionally provides no offline cache; offline behavior depends on that adoption.
The composition test serves isolated cached navigations in all three engines while the origin returns
503s. Chromium/Firefox also pass Playwright's offline emulation; Windows WebKit reports an internal
navigation error with both plain caching and caching plus isolation. Treat that emulation as unverified,
and check installed Safari/offline behavior when the startup cache is adopted.

## Regenerate

All bundles, maps, per-case records and browser dumps live in ignored `local/`. Use Node 24 and a
dependency directory containing pinned esbuild 0.25.12, TypeScript 5.9.3, fflate 0.8.3 and Playwright
1.58.2 (the prior determinism runtime can be reused). Install Chromium/Firefox/WebKit for that exact
Playwright version. Keep an isolated installation under this investigation's `local/` if needed.

```powershell
cd investigation/parallel-water
$env:DGM_DEPS = 'C:/path/to/isolated/runtime'
$env:DGM_INPUTS = 'C:/path/to/water-speed/local/cases'
node prepare.mjs
node build.mjs
node build-generation.mjs
node typecheck.mjs
node isolation-check.mjs
node fallback.mjs
node failure.mjs                # interrupted pass two; discard and fresh scalar retry
node curve-probe.mjs
node make-inputs.mjs             # seven themes, 1–100 at 128, 1–50 at 256
node batch.mjs                   # actual current inputs; all three engines/counts
node survey.mjs --forced         # zero cutoff, every tick on both golden rules
node survey.mjs                  # all golden/official + representative/tiled models
node survey.mjs --weather        # live warm starts; full Normal 9/8-day cadence
node survey.mjs --bench          # quiet machine; three pairs <=256, one long pair 512
node generation.mjs --runtime    # private array identity and three consecutive maps
node generation.mjs             # full generation/export; firstLook/firstWater timings
node make-patch.mjs
node summarize.mjs
git diff --check
```

This investigation's verification/input/timing runs are sequenced; other host activity is uncontrolled.
Timings use three paired samples at 128²/256² and one long paired screen at 512². Repeat on an idle
adoption machine before setting browser-specific defaults. Optional `DGM_ENGINE` and
`DGM_FILTER` select one engine/ID regex; clear them for the complete suite. The batch and survey
resume only matching input, executable and engine fingerprints. Benchmarks are fresh by default;
`--bench --resume` retains complete matching pairs from an interrupted screen.
`--forced` shortens fixed-tick checks to 200; the regular golden survey checks all 975 ticks.
Official inputs retain the prior investigation's input provenance; no official files are committed.
512² cases are explicitly tiled **water stress models**: today's schema caps generated maps at 256²,
so neither valid 512² exports nor 512² first-land timings can be claimed yet.

After adoption, repeat against the milestone's actual compiled code, exercise its cancellation and
task ownership, run the existing game/pinned/live-water contracts and update the living simulation
and editor documents in that milestone PR. Cross-CPU/OS portability remains the determinism study's
proposed CI matrix; Windows Playwright WebKit is not a claim to have tested installed Safari.

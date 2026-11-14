# Page handoff

This is a **partial investigation**. The two ordering failures are confirmed by executing the production handlers with deferred worker replies. The requested headed Chrome player sweep could not run. The Playwright reproductions are supplied and typechecked, but unrun; do not treat them as completed end-to-end validation.

## Owner split

| Owner | Patch | Files | Finding |
| --- | --- | --- | --- |
| Page | `adoption-page.patch` | `src/ui/App.tsx` | Cancel while recovery snapshot is pending |
| Page | same patch | `src/editor/save/useSave.ts` | Project snapshot bypasses queued edits |
| Page tests | same patch | `tests/unit/pageHunt.test.ts` | One regression per finding |
| Milestone | No patch | `src/core/`, `src/worker/`, `rust/` | No core/worker implementation finding verified |
| Renderer | No patch | `src/render3d/` | No renderer finding verified |

Neither finding requires 3D to exist: both are page/worker lifecycle failures. No finding is claimed to be specific to a software renderer.

## Source baseline

Own clone only: `dgm-page-hunt` under the **original** chat starting folder. No files under `C:\Users\krams\code` were read or changed.

- `origin/feature/page`: `32e07fe955ab0f759b5d9d61d9b0b37b83cb4344`
- `origin/dev`: `f24ca403b13344659993280744647d7912a31996`
- Clean local merge examined: `e14f0374bdb007862f127cde52c5195c13b51add`

The PR's committed product tree is `origin/dev`'s tree; only investigation files are added. The adoption patch targets the page baseline above, **not dev's older App**. Reproduce that baseline in an isolated checkout by checking out the pinned feature/page commit and merging the pinned dev commit locally. The local `feature/page` branch in this clone also retains the examined merge.

The workspace attachment changed during the investigation. Its sandbox left explicit deny entries on this original clone's `.git` directory, including after a write grant, so local commit creation was blocked. Publication uses GitHub's Git API to create an investigation-only tree with the pinned dev tree as its base, then one commit and one new ref. The local investigation branch therefore still points at the examined page merge. `publish.mjs` prepares the explicit small file allowlist; it publishes nothing itself. No ACLs are modified.

On the page owner's checkout of the matching baseline:

```powershell
git apply --check investigation/page-hunt/adoption-page.patch
git apply investigation/page-hunt/adoption-page.patch
npm run typecheck
npm run test:quick -- tests/unit/pageHunt.test.ts --maxWorkers=1
```

Cancel now waits for the recovery project **before terminating its worker**, holds the recovery dialog while it waits, and ignores duplicate cancellation. If the snapshot rejects, its error is shown while the original worker stays alive. Generate's stale run is still discarded by its run id. Save project now joins the same queue as edits and timber export.

The patch does not change water physics or export formatting. It does not address history across Generate, exporting during an active force, or every map-switch race; those still need the requested browser sweep.

## Regenerate evidence

Against the pinned merged source, install the repository dependencies, then:

```powershell
node investigation/page-hunt/prepare.mjs
node investigation/page-hunt/check.mjs --baseline # Expected failure: 0/2
node investigation/page-hunt/check.mjs            # Expected success: 2/2
node investigation/page-hunt/typecheck.mjs
```

`check.mjs` executes the exact proposed Vitest test bodies sequentially in one Node process. It substitutes only Vitest assertions/registration, preserving the real production handler source and deferred RPC ordering. This avoids this environment's denied subprocess/IPC launch. These commands produce no map batch or speed measurements.

For Chrome, on a machine where Chrome can launch:

```powershell
$env:UV_THREADPOOL_SIZE='6'
$env:RAYON_NUM_THREADS='6'
$env:CARGO_BUILD_JOBS='6'
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort --mode e2e
# In another terminal in the same isolated checkout:
node node_modules/playwright/cli.js test --config investigation/page-hunt/playwright.config.ts
```

The supplied two scripts hold one Comlink reply to make the ordering deterministic; they preserve worker execution and contain no sleeps or speed assertions. The corresponding player sequences are in REPORT.md. This controlled latency must be distinguished from an ungated player reproduction. Use `DGM_CHROME` for another installed Chrome executable or `DGM_PAGE_URL` for an isolated server. One test worker, one renderer process, two raster threads, and `hardwareConcurrency=2` disable extra water helpers. Browser GPU/software status still needs collection from the **actual** 3D context when Chrome runs.

All browser profiles, crash logs, traces, downloads and generated outputs go under `investigation/page-hunt/local/` (D195, gitignored). Recreating the two small-map repros requires generation and ordinary editing, not a bulk hunt; allow several minutes on a loaded machine, with only hang timeouts and no performance gates.

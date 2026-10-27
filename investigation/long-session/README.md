# Long-session stability check

This investigation tests `feature/page` at `f2c6c34b86993c822541b5c8365140e45bbd5678` in headed installed Chrome on the PC's NVIDIA RTX 4080 SUPER. The requested local merge of `origin/dev` (`7adabb48d2017a428a5a08ecf49d19e8f427cfc2`) conflicted in `EDITOR_PLAN.md` and `tools/retired-terms.json`; it was aborted. Product files match the feature/page baseline.

Run from the root of the isolated `dgm-long-session` clone. In each PowerShell used to launch a build/browser, set:

```powershell
$env:UV_THREADPOOL_SIZE='6'
$env:GOMAXPROCS='6'
$env:CARGO_BUILD_JOBS='6'
(Get-Process -Id $PID).ProcessorAffinity=63
```

The affinity is inherited by child processes and limits concurrent execution to six logical CPUs. Chrome uses one renderer process and two raster threads; the investigation-only navigator probe reports four cores, limiting the water pool to the coordinator plus two helpers. Other Chrome windows/profiles and other clones are never used.

1. Install locked dependencies with a clone-local npm cache: `$env:npm_config_cache=Join-Path (Get-Location) '.npm-cache'; npm ci --no-audit --no-fund`.
2. In the first capped PowerShell: `node investigation/long-session/serve.mjs`. It builds an instrumented e2e preview under `local/dist` and serves port 4189. No product source or generated Wasm binding is edited.
3. In a second capped PowerShell: `$env:DGM_KEEP_OPEN='1'; node investigation/long-session/session.mjs`. Chrome's profile, temporary files, samples, and captures stay in `local/hour`. Allow about an hour plus fixture preparation. Set `DGM_RUN_NAME` to a fresh short name when rerunning; archive a previous `local/hour` before replacing its measurements.
4. After completion: `node investigation/long-session/summarize.mjs` writes the small measurement sheets and summary. `local/hour/completion.json` verifies counts and the measured elapsed time. The script's default is to close Chrome when it completes; `DGM_KEEP_OPEN=1` leaves it available for diagnostics.
5. Only after the measured hour: `node investigation/long-session/diagnostics.mjs --heap` collects heap snapshots through this Chrome's port 4191. Snapshots cause collection and are deliberately excluded from the measured hour. Raw logs, builds, profiles and heap snapshots stay ignored under `local/` (D195).

A short workflow smoke run uses `DGM_RUN_NAME=smoke`, `DGM_SESSION_MS=0`, and `DGM_SESSION_ROUNDS=7`. This checks each force and brush; it is not the one-hour result. These overrides must be cleared for the measured run.

## What the session does

Three real saved maps (96, 128, and 256 square, river-valley seeds 4262–4264) are prepared through the UI. The measured hour then runs fifty rounds, switching to the next saved map each time. Brushes rotate through Raise, Lower, Flatten, Smooth, and Naturalize, with actual mouse strokes on dry, unobstructed terrain. All seven forces play to completion, and Carve repeats later. Every committed edit is undone and redone through the header controls. Drought/Badtide days are stepped through the real day controls. The first twenty rounds each Generate a new seeded map, cycling 96/128/256, and paint it. Fixture generation and edits are excluded from the hour's counters. Rounds are spaced over a full hour; there are no speed gates or timing assertions.

New maps are awaited by editor version (and, for Generate, seed/size); Naturalize is awaited through its asynchronous committed version. A candidate gesture path must be canvas at every point, avoiding overlays such as Flatten's start hint. Interrupted harness-development runs are retained locally and excluded from the measurements. The validated smoke run completed seven switches, every brush/force and 24 undo/redo pairs.

## Measurements

Samples occur every thirty seconds and after each round. `measurements.csv` is the page/resource sheet; `worker-memory.csv` records every worker/module separately. `summary.json` holds ranges, growth times, counts, errors and the GPU/browser identity.

The page JS heap is Chrome CDP `Performance.getMetrics().JSHeapUsedSize`, measured without explicit GC. Raw `performance.memory` is also preserved: this Chrome includes page backing storage in that value, so it must not be mistaken for the page's JS-only heap. Per-worker Wasm memory is each live exported `WebAssembly.Memory.buffer.byteLength`, captured through weak references at instance construction. Memory counts are allocator high-water allocations, not live Rust objects; Wasm memory does not shrink when Rust frees an allocation. A mesh/bake worker with an empty memory list has no exported linear memory; an uninitialized probe or a worker terminated during sampling is marked separately.

GPU geometries/textures come from the live Three renderer's `info.memory`. WebGL buffers/textures/programs/framebuffers/renderbuffers are create-minus-explicit-delete counts on its own live context, using weak resource membership. They are object counts, not VRAM bytes or driver residency. The probe keeps neither a resource nor an old buffer alive. Worker starts/terminations are logged; the sheet's live count is at sample completion, so an in-flight sample can also include a worker that terminated meanwhile. No forced GC, heap snapshot, DevTools UI, browser reload or browser restart occurs inside the measured hour.

Known merge-review F5/F6 are excluded. Owner mapping: page `src/ui/` and `src/editor/`; milestone `src/core/`, `src/worker/`, `rust/`; renderer `src/render3d/`. Adoption decisions belong to those owners.

## Report branch and exact reproduction baseline

The report commit is based directly on the recorded `origin/dev`, adding only this investigation folder. It does not bring the page branch's product changes into the PR. The measurements themselves use the feature/page revision named above, as requested. To reproduce from the report branch in an isolated clone, first preserve/read these instructions, then run:

```powershell
git switch --detach f2c6c34b86993c822541b5c8365140e45bbd5678
git restore --source=origin/investigation/long-session --worktree -- investigation/long-session
```

The second command restores only the investigation scripts and small sheets into the tested checkout; it does not stage them or change any product file. Then use the capped setup/session commands above. The local `resume.mjs` used for this measured run is a recovery transcript tied to its existing profile/counters, not a fresh-run entry point; the supported fresh-run entry point is `session.mjs`.
## LS1 reproduction and adoption verification

After the measured hour, use a capped PowerShell to run `node investigation/long-session/allocation-serve.mjs`. It builds baseline and candidate previews on ports 4200/4201, with probes and the candidate applied in compiler memory. In another capped PowerShell, run `node investigation/long-session/repro-check-allocation.mjs`. It uses two sequential headed Chrome contexts with fresh clone-local profiles and twelve deterministic editor-hook edits per case; allow a few minutes. It requests canonical checks to completion and compares complete settled worker terrain, water and soil fingerprints. An optional `DGM_ALLOCATION_RUN` must be a fresh short name. It collects the checks worker only after each experiment, outside the hour.

Small results go to `allocation-results.json`; the recorded verified comparison is summarized by `allocation-summary.json`. The first exploratory follow-up's incremental replies were not a valid byte comparison; the committed comparison uses settled state. The probe tracks simulations only weakly and counts actual Rust allocation/free/finalizer calls. See FINDINGS for the retaining chain and the pressure-versus-indefinite-retention distinction.

To validate the candidate without editing product files:

```powershell
node investigation/long-session/typecheck-candidate.mjs
npx vitest run --config investigation/long-session/candidate-vitest.config.mts
```

The milestone patch is the only owner patch; page and renderer need no patch from this investigation. All adoption steps and validation results are in INTEGRATION.

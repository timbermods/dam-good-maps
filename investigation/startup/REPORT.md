# Startup investigation

Round 2 adds exact stored-state hydration, parallel GPU preparation and checks after the editable frame. See the paired six-map results below. No tracked product code changed.

## Round 1

**Adopt the browser-only picker and parallel editor/map loading. They help cold startup, but do not deliver the promised two seconds.** No tracked product code changed.

Base: latest `dev` when work began, `f5874349`. Read part 1's source at `b8471e7a` (PR #92), `docs/UI-BRIEF.md` §7, `EDITOR_PLAN.md`, and CLAUDE's quality rule. Part 1 supplies components; its production entry still starts the older generator screen. The table below therefore compares **first-visit prototypes**, not a shipped UI change. Both compose its panel/card with dev's real worker and editor, and open the exact same release-checked River Valley 128² project. Controls, card counts, and autosave integration remain the milestone's work.

Five fresh-browser cold/warm pairs per cell; Chrome 154, Ryzen 7 9800X3D, 64 GB. Fast = 100 Mbit/s, 10 ms; typical = 25 Mbit/s, 80 ms. The local server shares bandwidth across files, including workers, serves gzip, and models ten-minute HTTP freshness. Warm means the same map and browser cache, new document. DNS/TLS, cache expiry, and the isolation worker's first-control reload are excluded.

**CPU limitation:** 4× is Chrome's page CPU throttle, a laptop proxy, not a whole-laptop measurement. A repeated arithmetic probe confirmed dedicated workers remain native; worker-target throttling is rejected by Chrome. GPU remains native too. Do not promise laptop compliance from these numbers. Shared-machine activity was not controlled.

Editable time in seconds, **median / worst**. `dev` samples the shipped random-seed generation flow (three pairs), then immediately clicks Refine; its terrain differs between runs, so it is not a causal comparison with the fixed ready-map prototype. Its full stage data is in [DEV-MEASUREMENTS.csv](DEV-MEASUREMENTS.csv).

| Connection | Page CPU | Visit | Shipped dev | Prototype before | Prototype after |
|---|---:|---|---:|---:|---:|
| Fast | 1× | Cold | 8.235 / 14.583 | 2.322 / 2.395 | 1.999 / 2.067 |
| Fast | 1× | Warm | 8.656 / 10.183 | 1.173 / 1.526 | 0.845 / 0.937 |
| Fast | 4× | Cold | 15.840 / 17.401 | 3.084 / 3.376 | 2.812 / 3.185 |
| Fast | 4× | Warm | 7.322 / 30.093 | 1.928 / 2.252 | 2.064 / 2.308 |
| Typical | 1× | Cold | 10.477 / 18.242 | 2.832 / 2.968 | 2.552 / 2.634 |
| Typical | 1× | Warm | 8.586 / 12.203 | 1.089 / 1.164 | 1.094 / 1.659 |
| Typical | 4× | Cold | 7.421 / 11.573 | 3.815 / 3.854 | 3.619 / 4.124 |
| Typical | 4× | Warm | 5.063 / 5.388 | 2.243 / 2.483 | 1.969 / 2.162 |

Where time goes, typical/native/cold medians: first content 324 → 292 ms; panel response 344 → 353 ms; generator worker's first RPC answer 555 → 502 ms; project opening 474 → 451 ms; GPU-finished first map frame 2,754 → 2,372 ms. Cold map build itself costs about **0.92 s**, only about 0.09 s of it meshing: shader/driver/upload synchronization dominates the remainder. V8 parse/compile thread CPU is 132/120 → 115/107 ms; these overlapping trace categories must not be added together. [MEASUREMENTS.csv](MEASUREMENTS.csv) contains median/worst for every measured stage and profile. No WebAssembly is loaded.

Initial static JS falls **46.6 → 16.2 KiB gzip**; total cold transfer scarcely changes, **779 → 776 KiB**, because much of that code moves into the editor's chunk. Its 252 KiB, generator's 186 KiB, checks worker's 107 KiB, and selected project's 209 KiB dominate. [FILES.csv](FILES.csv) gives every startup file's raw/gzip/Brotli sizes. Brotli is a size comparison, not a measured deployment benefit. Warm transferred bytes are zero under the tested freshness window; caching cannot remove reopening or rendering costs.

The generator is already split into a worker, the editor is lazy, and Three is only needed with the map. Splitting those further alone will not remove first-map work. At the end of round 1, the next priorities were: avoid rebuilding the already checked project on open (`MapSession` currently calls `buildMap`), start/prewarm the renderer's certain shader variants while the map downloads, and defer the checks replica until the first editable frame while preserving every check/export gate. These were **unmeasured follow-ups in round 1**; round 2 measures them below. Do not change terrain, water, objects, or validation to meet a budget. Across all six projects, five native headless opens each, Islands costs **3.542 / 4.283 s** before rendering; [MAPS.json](MAPS.json) makes the all-map shortfall explicit.

Round-1 regression guards: initial JS ≤20 KiB gzip; startup JS with workers ≤600 KiB; each map ≤240 KiB; representative cold transfer ≤820 KiB. Editable medians: cold ≤3 s native / 4 s page-throttled; warm ≤1.5 / 2.5 s; worst ≤1.5× each limit. The representative prototype passes. **Final acceptance remains ≤2 s cold on typical hardware for every random map**, requiring the hydration/renderer work and a real laptop or verified worker throttle. These interim guards do not certify that goal.

Caching beyond HTTP freshness is optional. [cache-adoption.patch](cache-adoption.patch) extends parallel-water's existing isolation worker: one registration, one fetch handler, isolation after network **and** cache hits. It caches only content-hashed same-origin assets, not navigation, unversioned maps, user projects, or remote responses. No caching speedup is included above.

Validation: all six maps pass generator, TypeScript, Python load, and reopening checks; before/after fixture bytes match; every browser matrix run accepts an edit and restores identical heights with undo; three builds, adopted source type-check, nine focused tests, and prototype budgets pass. [INTEGRATION.md](INTEGRATION.md) gives adoption, regeneration, and the CI check for the **actual integrated production page**.

## Round 2

**All six maps meet two seconds cold on this PC with native page CPU. Page-throttled typical visits still exceed it.** The adoption patch implements all three follow-ups. Hydration matches unrounded terrain, water, objects and complete `.timber` bytes against rebuilds for six ready maps and twelve synthetic saved projects; edit/undo, every check and immediate Save/export gates pass. Fixed-clock GPU pixels match on all six, with zero new programs during the first real map. Legacy/incompatible files rebuild once; pending-water saves retain the existing fast-save/rebuild path. [Identity](ROUND2-IDENTITY.json), [gates](ROUND2-GATES.json), [GPU](ROUND2-GPU.json), [pending saves](ROUND2-PENDING.json).

480 interleaved visits: all six unchanged theme/seed maps, five cold/warm pairs per variant/profile. Seconds below are **maximum of six map medians / worst of all 30 runs**. Before is the round-1 proposal rerun in this batch; OS/driver caches and shared-PC load are not reset. All visits passed a real edit and identical undo, with no page errors.

| Connection | Page CPU | Visit | Before | Round 2 |
|---|---:|---|---:|---:|
| Fast | 1× | Cold | 2.244 / 2.344 | 1.262 / 1.493 |
| Fast | 1× | Warm | 1.588 / 1.666 | 0.486 / 0.935 |
| Fast | 4× | Cold | 2.859 / 2.891 | 1.880 / 2.385 |
| Fast | 4× | Warm | 2.049 / 2.358 | 1.565 / 1.615 |
| Typical | 1× | Cold | 2.757 / 2.837 | 1.438 / 1.589 |
| Typical | 1× | Warm | 1.425 / 1.649 | 0.458 / 0.525 |
| Typical | 4× | Cold | 4.890 / 4.974 | 2.619 / 2.867 |
| Typical | 4× | Warm | 3.515 / 3.596 | 1.753 / 2.178 |

Typical/native/cold per-map medians: opening **213–1,106 → 146–167 ms**, real rendering **596–721 → 59–95 ms**. GPU preparation takes 309–398 ms alongside downloading. First content remains 260–280 ms; panel response 282–297 ms. Worker first-answer time increases to 593–908 ms under parallel scheduling. Parsing/compiling take 41–51 / 47–58 ms of overlapping thread CPU. No WASM loads. [All 96 cells and stages](ROUND2-MEASUREMENTS.csv).

Snapshot files grow to 366–517 KiB gzip; conservative cold transfer rises **738–801 → 938–1,089 KiB**, including the deferred checks worker. Warm transfer is zero under ten-minute freshness. Entry/startup JS are 16.4/584.3 KiB gzip. [Per-file sizes](ROUND2-FILES.csv).

New median/worst guards: cold native **2/2.5 s**, page 4× **3/4 s**; warm **0.75/1 s** and **2/3 s**. Gzip limits: entry/startup JS 20/600 KiB, map 540 KiB, cold transfer 1,152 KiB. The prototype and seven guard tests pass. The supplied CI checks every map/profile on the actual adopted entry; it has **not passed today's unconnected product**. Workers and RTX 4080 SUPER remain native at page 4×, so laptop compliance remains unproved. [Adoption, regeneration and CI](INTEGRATION.md).

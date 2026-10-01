# Adopt in the milestone session

Base: `feature/m9b` at **e292cefe30469033a922650f0455f87297c051d5**. The investigation
changes only this directory. Its PR into `dev` inherits M9b ancestry: after M9b lands, take
only the investigation commit, then adopt the patch. No product patch was applied here.

1. Compare the five product files against the before hashes in [BASE.json](BASE.json).
   Port the mechanisms if later rules changed; never overwrite newer product code with the
   complete candidate snapshots. `candidate/` is for virtual testing and source inspection.
2. Check and apply:

   ```sh
   git apply --check investigation/gen-speed/adoption.patch
   git apply investigation/gen-speed/adoption.patch
   ```

3. Keep M9b's current water implementation, six-day cap, land checks, screen/free-draw budgets,
   four prepared starts, mine-pad order, first-land callback and repair rules.
4. Run the typecheck, focused parity checks, complete identity/timing matrix and actual-page
   browser measurements below on the milestone's revision. Update the living product/progress
   documents there. There is no new dependency, worker, host setting or public UI control.

## Why the results stay identical

- `prepareStart` computes the same shore/drought walks, distances, regions, per-level moisture
  sums and stored-water sum. The sums keep their original arithmetic and traversal order.
  Normal’s nine-day storage is also passed to the intentions view instead of recomputing it.
  Easy/Hard keep the view’s independent nine-day calculation. Only the four initial picks share
  these fields, while terrain, held water, contamination, moisture,
  hydrology and storage are unchanged. Each pick still scans candidates, scores and consumes
  its own random stream, applies its own avoid mask and runs its own candidate walk checks.
  The cache is local to one attempt and expires **before any start levelling or mine shaping**.
  Every later pick prepares fresh fields. The cached intention view is also read-only on that
  unchanged input. No module/global cache is introduced.
- The median uses a 256-bin histogram because heights are `Uint8Array`. The first level whose
  cumulative count exceeds `N >> 1` is precisely the former sorted array's upper median,
  including even tile counts and levels 0/255.
- `roomMap` stops scanning far squares only when the requested one-site existence or two-site
  x/y span has become true. Those answers are monotone as more squares are added. Zero/no-site
  cases still follow the old result; requests above two use the full original greedy order.
- `damWalls` skips the second side only if the first has fewer than six points. The former
  joint predicate must then reject the orientation. Successful orientations, points, medians,
  dry-face rules, line order and wall deduplication are unchanged.

Lake Basin round 2’s `round2-shared-evidence.json` at the same base measured 12 pre-land
`droughtStorage` calls with two complete inputs (282 ms CPU) and four `pickStart` calls
(937 ms CPU). [SHARED-COST.json](SHARED-COST.json) independently confirms **12 → 2**
calculations, both input groups retained, and **4 → 4** separate selections at 256² seed 7.
The peer CPU numbers are one-run observations, not claimed savings; the repeated matrix
provides timings and load. Sharing fields saves duplicate work within those four selections.

The same first land is committed on the same attempt, with the same preparations and hollows.
All subsequent water inputs, fixes, objects, diagnostics and accepted exports remain the same.
Water code and numerical expressions were never altered. Full-state comparisons include the
first callback's copied bytes, not its mutable array reference after later repairs.

The rejection audit keeps the existing dependency and failure order:

| Rejection | Earliest usable evidence / exact action |
|---|---|
| River course, drowned head, inflow count, source in flow | Hydrology after course cutting; M9b already checks these before starts and settling. |
| Straight channel, wall, shelf/sheet, planned promise/story | Shaped land and planned water. Wall probes now stop when their first side proves failure. Skipping a redraw or changing the screen budget changes the chosen map. |
| No start / one start | Exact scored candidate walks with their avoid masks. Shared preparation removes repeated work without predicting a different winning candidate. |
| Mine room | After start levelling, pad attempts and alternate-start repair. A test on the original terrain can reject a reparable plan. The monotone room scan now finishes as soon as its answer is certain. |
| Badwater room | After mine pads and their exclusion masks; inspecting the earlier terrain can give a different answer. |
| Edge wall | Read-only terrain predicate, but moving it ahead of start checks can change the recorded first failure. No ordering change is included. |

Rejected plans already have lazy builds and no water settle until their data is read. The harness
records rejection metadata without touching those lazy getters; it does not manufacture extra work.

Read-only preparation adds no permanent simulator allocation. It retains the fields already
allocated for a pick across at most four sequential picks. Per-level sum tables are shared and
discarded with the attempt; none crosses a terrain/water mutation or an editing operation.

## Regenerate

Use Node **v24.19.0** (the measured runtime provides `process.threadCpuUsage`) and the product's
dependency installation. Set `DGM_DEPS` to the directory containing its `package.json` and
`node_modules`; no dependency install or product-file write is performed by these scripts.
The run here reused startup's installation: exact versions are in `BASE.json`. Its fflate,
preact, esbuild and TypeScript match M9b's lock; Three/Vite/Vitest are one patch older. Both
variants use the same installation. Repeat against the milestone's lock before adopting.

From the repository root:

```powershell
$env:DGM_DEPS = 'C:/path/to/dependency-checkout'
$env:DGM_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node investigation/gen-speed/prototype.mjs
node investigation/gen-speed/make-patch.mjs
node investigation/gen-speed/typecheck.mjs
node investigation/gen-speed/focused.mjs
node investigation/gen-speed/shared-cost.mjs
node "$env:DGM_DEPS/node_modules/vitest/vitest.mjs" run --config investigation/gen-speed/tests.config.mjs
node investigation/gen-speed/matrix.mjs --prefix full --workers 4
node investigation/gen-speed/prepare-browser.mjs
node investigation/gen-speed/browser.mjs
node investigation/gen-speed/browser-bind.mjs
node investigation/gen-speed/browser-gpu.mjs
node investigation/gen-speed/profile.mjs
node investigation/gen-speed/summarize.mjs
git diff --check
```

The complete current M9b batch is the hand-over's 840 maps: seven themes, seeds 1–40 at 96²,
128² and 256², Normal/default settings. At 256² seeds 1–20 have three before/after pairs;
at 96²/128² seeds 1–5 have three pairs. All remaining seeds have one identity pair: 1,260
pairs in total. This concentrates repeated profiling on the requested 256² cases while retaining
the entire batch's identity coverage. No refused map is counted as a successful export.
Comparisons traverse raw typed-array bytes and complete state, then retain SHA-256 summaries.
Only informational elapsed times are excluded. Seeds/attempts/decisions/reports must agree.

`matrix` runs paired variants in isolated workers, reversing order on alternate repetitions and
rotating theme order. Windows PDH samples whole-machine CPU load once per second; thread CPU
usage distinguishes computation from scheduling delay. A run with no counter sample records
null, never zero. On other platforms it uses OS CPU-time deltas. Raw JSONL, bundles, CPU profiles,
Vite caches and browser builds stay under ignored `local/`. Matching manifests permit resume;
partial pairs are rerun together. Summarization refuses missing pairs or direct byte checks.

For a serial replication, run the same matrix with `--workers 1 --prefix serial`. Do correctness
work before a target measurement, avoid this investigation's own concurrent jobs, and record
remaining host load. Do not present the four-worker evidence as an idle-machine target test.
No background application is stopped by this investigation.

The browser script uses measurement-only virtual hooks in the **actual M9b App/FirstLook/
Preview2D**, with the actual generator worker and editor. Fresh contexts warm the worker/UI on
a small map, then run seed 1 at 256², every theme, three paired visits. Core phase traces cover
all requested seeds 1–20. The browser records painted first land, finished settled preview and
the GPU-finished editable frame after immediate Refine. It then performs a real Raise click on
visible terrain below the height cap and checks every terrain byte on undo. Background version search and
checks retain their product behavior. Startup/network/human hesitation are excluded.

`profile` writes seven seed-1 V8 CPU profiles; `matrix` records disjoint stage wall time on every
generation. Profiles identify expensive functions; the repeated matrix drives reported timings.
Do not add inclusive nested profile times together. `PROFILE.csv`'s categories are disjoint;
`REJECTIONS.csv` reports the complete cost of refused pre-land attempts, including their shaping.
Its attempt/seed counts use the first repetition; median/worst/total cost use all three repeats.

The reported core `firstWater` is the water/start decision point. It is not an on-screen event:
M9b's first land is a preview, not yet editable. Browser columns measure the actual UI boundaries.
Publishing rejected land earlier would violate first-land identity even with the same download.
Result-changing ideas stay in [PROPOSALS.md](PROPOSALS.md), outside the patch.

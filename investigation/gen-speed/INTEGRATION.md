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

## Round 2: adopt separately after Round 1

[round2/adoption.patch](round2/adoption.patch) is a delta **after** the approved Round 1 patch. Round 1 adoption.patch is unchanged and can be adopted alone. Compare the sequential before/after hashes in [round2/BASE.json](round2/BASE.json); both patches are checked together in investigation scratch, with product code untouched.

Apply Round 1 as above, then:

```sh
git apply --check investigation/gen-speed/round2/adoption.patch
git apply investigation/gen-speed/round2/adoption.patch
```

Round 2 deliberately re-pins unreleased M9b maps. The early small-Canyon outcome screen re-plans a deeper, narrower course on the shaped field; a large Canyon starts with three more levels of incision. Its original planned-outcome order and budgets remain. All absolute checks and the six-day settle cap remain. The candidate prepares four starts.

At 96², the pre-fill tests the proposed start's actual reachable mine sites before land is committed. Settled-water start selection also proves reachable mines before expensive resource placement, trying another prepared dry start when needed. This is a result-changing planning choice, not a proof that every pre-fill rejection would fail after settling. Its acceptance is governed by the full outcome and failure gates.

Small-map large-basin outlets get twice the planned-flow width. At 256², Lake Basin gets one additional hydrology plan on the same shaped field when the previous failure is specifically “a river's water leaves its course”. The same extra plan is excluded for River Valley: its all-three-outcomes share declined to 31/40 against 32/40. A proposed stronger River Valley floor had no effect and is excluded.

Once land is shown, outlet wear cannot alter its heights. At 256² River Valley/Lake Basin, a rising basin instead tries gentler clean inflows (70%, 49%, 34.3% of the original, rounded to .001) whose sources drain into that basin. Each candidate uses the unchanged canonical settle and flood check; accepted flows persist in the features and committed land stage. Unsuccessful trials restore their original flows. The original first-land boundary remains; this avoids delaying it for a speculative full settle. Four prepared starts, absolute checks and the physical settle cap remain. The generator's final checks govern whether a repaired map passes.

D348 checks copy the first onLand heights and compare every tile with the successful return. This covers every displayed terrain state: M9b's only onCandidate call is inside the passed-attempt branch immediately before returning that same result; failed attempts update stage text, and FirstLook keeps its previous land. Both browser-core and Node sweeps require one land callback and zero changed tiles; actual-page visits bind their displayed first-land/export hashes to Node.

Delta's two native hypot calculations use the fixed-order helper from investigation/determinism/portable.ts (only its import path is adapted). It uses a correctly rounded WebAssembly f64 square root. This removes the observed browser difference in bed-profile metadata as well as requiring identical terrain, water, objects, exports and first land. No approximation is used.

If the milestone has already adopted determinism's portable.ts, reuse that shared helper rather than replacing it with this snapshot. Check its hypot/sqrt behavior against the candidate hashes and apply the two Delta call sites; the new-file hunk intentionally expects no existing portable.ts at this base.

Use the same Node/dependency environment as Round 1; the browser sweep uses the determinism investigation's matching Playwright 1.58.2 installation read-only (Chromium 145, Firefox 146, WebKit 26). Native UI timings use the installed Chrome 154 and GPU. Commands from the repository root:

The borrowed runtime has fflate 0.8.3, preact 10.29.8, signals 2.11.2 and comlink 4.4.2. Three 0.186.0, Vite 8.3.0 and Vitest 5.0.1 are one patch behind M9b's requested versions; both comparison variants use the same runtime. EVIDENCE.json records these versions. The embedded sqrt module requires browser WebAssembly compilation; the current GitHub Pages response and HTML have no CSP restriction. Check that requirement if the milestone changes deployment policy.

```powershell
node investigation/gen-speed/round2/prototype.mjs
node investigation/gen-speed/round2/make-patch.mjs
node investigation/gen-speed/typecheck.mjs --round2
$env:GEN_VARIANT='round2'
$env:GEN_TEST_REPORT='round2-final-tests'
node "$env:DGM_DEPS/node_modules/vitest/vitest.mjs" run --config investigation/gen-speed/tests.config.mjs
$env:GEN_SHEETS='1'
node investigation/gen-speed/round2/matrix.mjs --prefix round2-adopted --reps 3 --workers 4
node investigation/gen-speed/round2/browsers.mjs --smoke
node investigation/gen-speed/round2/browsers.mjs --reuse-smoke
node investigation/gen-speed/prepare-browser.mjs --round2
node investigation/gen-speed/browser.mjs --round2
python investigation/gen-speed/round2/contact-sheet.py
node investigation/gen-speed/round2/summarize.mjs round2-adopted
git diff --check
```

Clear GEN_ROUND2_CANDIDATE and GEN_TRIAL_VARIANTS for adoption runs; they are only for isolated exploratory sources. A named trial mode may select different mechanisms. The default regenerates the adoption source. Each result manifest binds its bundle; stale resumes are rejected. Preserve earlier rejected files under ignored local/ before restarting a fixed-prefix browser run. Summarization requires all 5,040 core observations, 2,520 browser generations, 42 production-page visits, repeat identities, all outcome gates and zero candidate failures/changed tiles. It also binds the UI's first-land/download hashes to Node.

The recorded run adds `--reuse-control round2-final`: it retains 1,939 completed baseline observations from the previous candidate trial after verifying the exact baseline bundle hash, Node version and input matrix. All 2,520 adoption observations are fresh; the remaining 581 controls are measured alongside them. These are separate measurement cohorts, with each observation's original load and start time retained, not wholly interleaved pairs. A fresh reproduction omits that switch as shown above. It requires no ignored prior results.

Core timings report median over per-seed medians, and worst over every repeat. Settled return includes water repairs, start/object decisions, checks and completion. The two baseline refused maps remain in failure/CPU/redraw accounting; successful-map wall times exclude them explicitly. Machine load is sampled throughout. Use a new prefix and --workers 1 for a serial replication; do not infer idle-machine target compliance from loaded runs.

Re-pin M9b's release baseline after milestone adoption and repeat the gates against any later product revision. Copy the [210-map contact sheet](round2/contact-sheet.png) to docs/sheets in the milestone session; this investigation's write boundary keeps it here. The three existing resource/drawn-river contract failures are reported separately from generation must-pass gates; adoption does not weaken those tests. [Research notes](round2/RESEARCH.md) retain rejected ideas and the corrected trial-option issue. Large JSONL, bundles, grids and captures stay ignored under local/.

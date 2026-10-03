# Smoothness gate

Compares two builds of the app for frame smoothness, with the machine's load recorded beside every timing.
PLAN §20 D380: nothing may get slower. It gates the renderer's work and every new force.

```
npm run smooth -- --dry                                  # plan and time estimate, runs nothing
npm run smooth                                           # dev at the branch point (before) against the working tree (after), the full matrix
npm run smooth -- --before b4b8af66 --after feature/x --sizes 128 --configs chromium --scenarios brush
npm run smooth -- --before origin/dev --before-env VITE_X=off --after origin/dev   # one ref twice, a switch flipped
npm run smooth -- --report                               # the report of what is measured, runs nothing
npm run smooth -- --record --label moving-water          # also writes results/<date>-<label>.md
```

`--before` defaults to where the branch left origin/dev (`git merge-base`); pin a sha for a long series, since
`origin/dev` moves when fetched and a moved ref starts a new series. Windows only (the load sampler is PowerShell). Run it on a quiet machine and leave the screen alone: browsers run
headed, and a hidden window is discarded.

## What it measures

- **Cells:** size (128², 256²; maps stop at 256) × look (Standard, High) × configuration × scenario.
- **Configurations:** `chromium` (installed Chrome), `chromium-4x` (CPU throttled 4×), `igpu-4x` (the integrated
  Radeon, CPU throttled 4×: a modest laptop), `firefox`, `webkit`. The WebGL renderer string of each run is
  recorded; Firefox and WebKit mask theirs. Firefox runs only after its debugger is checked not to pin WebAssembly to
  the baseline tier (juggler `Runtime.js` in `omni.ja`; `DGM_FIREFOX_EXECUTABLE` points to a corrected copy), with
  the optimizing-tier prefs; both are recorded in every Firefox result.
- **Scenarios**, on one generated map per size (seed 4242, River Valley: a flowing river and badwater), settled
  before the timed part:
  `orbit` the camera turns for 10 s; `brush` a Raise stroke at the largest Size across the river (16 moves), water
  settles, undo, redo; `force` Craterize at Power 100, Fast, on the river, water settles, undo.
  Each does an untimed warm-up first (the brush and the force once, undone).
- **Each run:** a fresh browser at 1440×900, DPR 1; animation-frame gaps over the timed part: median, p99, worst
  frame, hitches (frames over 50 ms), long tasks (Chromium only; "unavailable", never 0, elsewhere), JS heap
  (Chromium), and the wall time to water settled (information only).
- **Repeats:** 5 per build per cell, interleaved before/after in ABBA order (B A A B B A A B B A), so drift cancels.

## The load rules

Before a series, the machine must be quiet: **outside CPU at most 25% for 60 consecutive sampled seconds**
("outside" is everything except the runner, its sampler and the browser it measures). It is sampled every second
throughout. A run is **discarded and requeued** (requalifying first) if its timed part saw outside CPU above 25%, a
missing sample, a gap over 30 s, or a hidden page. The series stops after 15 minutes without a quiet minute
(run the same command to continue). Slow runs that qualified are kept; nothing picks the fastest.
Every timing carries the run's outside and total CPU (min/median/max), and every report ends its header with
**PC idle: yes/no**, naming the busy outside processes whenever outside CPU went above 5%.

## Load, focus and hangs (Kyler, 2026-10-02)

- Measuring starts after 60 s with the CPU and the GPU used by processes outside the runner each at most **10%**
  (the GPU from Windows' GPU Engine counters: a game or a busy tab shows only there). A quiet PC here sits at 1-3%,
  one busy core is about 6%, and Codex, a game or a busy tab sits well above 10%.
- A run whose timed part goes above either, or whose page was hidden or lost focus, **voids its whole round**: the
  round's runs stay on record but count for nothing, and the round is measured again, so before and after are only
  ever compared under the same conditions. The report counts the voided attempts.
- The page is checked every second while timed. A page that stops answering, draws nothing for 5 s while visible,
  focused and answering, or loses its WebGL context is a **hang**: the cell fails on it alone (HANG in the report).
- A run longer than 20 minutes is stuck: its browser is closed and the run retried.

## Reading the verdict

One row per cell, before and after each as `median [min-max]`. A cell **passes** when after's median p99, median
worst frame and median hitch count are each no higher than the highest value among before's runs (within before's
spread). Otherwise it reads **SLOWER** and names the metrics. `incomplete` means fewer runs than `--repeats`.

Noise alone fails a metric of a round about 8% of the time, so a cell that fails runs again, up to twice more (Kyler,
2026-10-02; `verdict.ts` `cellOutcome`): it fails for real when two of its rounds fail, and after a failure it passes
only with two passing rounds and every run of the cell together passing. Every run stays in the results; the row
shows every run together and its rounds.

`--pause` asks a running series to stop after the cell it is on; the series' own command resumes it at the first
unfinished cell (an interrupted cell keeps the runs it finished).
Exit code 1 if any cell is SLOWER, 2 if the series stopped.

## Files

- `local/builds/<id>/dist/` each build, made once (a ref is exported with `git archive`; its `npm ci` runs only if
  its lockfile differs; the working tree is built in place). Same ref with a different `--before-env` is another
  build. The working tree's id changes when `src/` does.
- `local/series/<before>__<after>/` `plan.json`, `results.jsonl` (kept and discarded runs; a rerun skips what is
  done), `load.jsonl` (the sampler), `raw/` (every frame stamp).
- `results/<date>-<label>.md` the committed summary (`--record`).

## Notes

- `--unqualified` skips the quiet-machine rule (to try the tool on a busy PC); its series is kept apart and marked
  UNQUALIFIED in the report. Never evidence.
- On this PC (Ryzen 9800X3D, 165 Hz, RTX 4080 Super) a run takes, native Chrome, about 22-30 s at 128² and 29 s (orbit),
  60 s (force), 100 s (brush) at 256², plus any wait for a quiet machine.
- 512² does not exist: the generator and the editor stop at 256².
- The app is only driven through what tests/e2e use (`window.dgmEditor`, `window.dgm3d`, the UI); the recorder is
  injected into the page. Nothing in `src/` is touched. A build without those hooks cannot be measured.
- The look is held with `localStorage dgm.look`, the player's own choice, which wins over the automatic fallback.
  A run whose page draws another look than asked (a software renderer takes Standard) is marked in the table.
- Adapted from `investigation/performance/` (the load sampler and rules, frame statistics, the brush and force
  drivers); not imported from it.

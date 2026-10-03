# Smoothness gate

Compares two builds of the app for frame smoothness, with the machine's load recorded beside every timing.
PLAN §20 D380: nothing may get clearly slower. It gates the renderer's work and every new force.

```
npm run smooth -- --dry                                  # plan and time estimate, runs nothing
npm run smooth -- --before <dev sha> --after <branch sha> --record --label <name>   # the gate
npm run smooth -- --cells "firefox|256|standard|brush"   # a cell outside the gate, only when asked for
npm run smooth -- --before <sha> --before-env VITE_X=off --after <sha>             # one ref twice, a switch flipped
npm run smooth -- --report                               # the report of what is measured, runs nothing
```

`--before` defaults to where the branch left origin/dev (`git merge-base`); pin shas, since `origin/dev` moves when
fetched and a moved ref starts a new series. Windows only (the load sampler is PowerShell). Leave the screen alone
while it runs: browsers run headed, and a hidden or unfocused page voids its round.

## The gate (Kyler's decision, 2026-10-03)

- **Six cells:** Chrome on the discrete GPU, native (not CPU-slowed), at 256², Standard and High, each of the three
  scenarios. Each cell runs **3 times on dev and 3 times on the branch**, interleaved ABBA so drift cancels.
- **A cell fails only on a clear regression:** the branch's median p99 frame more than **20%** worse than dev's
  median, or the branch's median hitch count (frames over 50 ms) above **dev's highest run**. The worst frame is shown,
  not judged. One round, no re-runs. A hang (below) fails a cell on its own.
- **Time:** about 22 minutes on this PC (measured: a 256² Chrome run takes about 22 s orbiting, 33 s with the force,
  50 s with the brush), plus a quiet minute before it starts.
- **Not measured by default:** Firefox, the integrated GPU, CPU 4× slower, WebKit and 128². `--sizes`, `--configs`
  and `--cells` still run them, only when Kyler asks. Firefox stays in CI's correctness checks; only its speed is
  dropped from the gate. Nothing more is added to the gate.

## What a run measures

- **Scenarios**, on one generated map (seed 4242, River Valley: a flowing river and badwater), settled before the timed
  part: `orbit` the camera turns for 10 s; `brush` a Raise stroke at the largest Size across the river (16 moves),
  water settles, undo, redo; `force` Craterize at Power 100, Fast, on the river, water settles, undo. Each does an
  untimed warm-up first (the brush and the force once, undone).
- **Each run:** a fresh browser at 1440×900, DPR 1; animation-frame gaps over the timed part: median, p99, worst
  frame, hitches, long tasks (Chromium), JS heap, and the wall time to water settled (information only).
- **Configurations** (only on request beyond `chromium`): `chromium-4x` (CPU throttled 4×), `igpu-4x` (the
  integrated Radeon, CPU throttled 4×), `firefox` (checked not to pin WebAssembly to its baseline tier, with the
  optimizing-tier prefs), `webkit`.

## Load, focus and hangs (Kyler, 2026-10-02)

- Measuring starts after 60 s with the CPU and the GPU used by processes outside the runner each at most **10%**
  (the GPU from Windows' GPU Engine counters: a game or a busy tab shows only there). A quiet PC here sits at 1-3%,
  one busy core is about 6%, and Codex, a game or a busy tab sits well above 10%.
- A run whose timed part goes above either, or whose page was hidden or lost focus, **voids its whole round**: the
  round's runs stay on record but count for nothing, and the round is measured again, so before and after are only
  ever compared under the same conditions. The report counts the voided attempts and says **PC idle: yes/no**.
- The page is checked every second while timed. A page that stops answering, draws nothing for 5 s while visible,
  focused and answering, or loses its WebGL context is a **hang**: the cell fails on it alone (HANG in the report).
- A run longer than 20 minutes is stuck: its browser is closed and the run retried. The series stops after 15
  minutes without a quiet minute (the same command continues it).

## Reading the report

One row per cell: before and after as `median [min-max]` for p99, worst frame and hitches; the outside and total
CPU; the verdict (pass, **SLOWER** naming p99 or hitches, **HANG**, or `incomplete`). Exit code 1 if any cell
fails, 2 if the series stopped. `--pause` stops a running series after its current cell; the same command resumes it.

## Files

- `local/builds/<id>/dist/` each build, made once (a ref is exported with `git archive`; its `npm ci` runs only if
  its lockfile differs; the working tree is built in place). Same ref with a different `--before-env` is another
  build.
- `local/series/<before>__<after>/` `plan.json`, `results.jsonl` (kept and discarded runs, voided rounds),
  `load.jsonl` (the sampler), `raw/` (every frame stamp and the page's health checks).
- `results/<date>-<label>.md` the committed summary (`--record`).

## Notes

- `--unqualified` skips the quiet-machine rule (to try the tool on a busy PC); its series is kept apart and marked
  UNQUALIFIED in the report. Never evidence.
- 512² does not exist: the generator and the editor stop at 256².
- The app is only driven through what tests/e2e use (`window.dgmEditor`, `window.dgm3d`, the UI); the recorder is
  injected into the page. Nothing in `src/` is touched.
- The look is held with `localStorage dgm.look`, the player's own choice, which wins over the automatic fallback.
- Adapted from `investigation/performance/` (the load sampler and rules, frame statistics, the brush and force
  drivers); not imported from it.

# September 30 quiet window

Completed morning window: **07:40–09:40 America/Los_Angeles (14:40–16:40 UTC)**.
One serial runner uses `node window.mjs --suite=core --start=2026-09-30T14:40:00Z --end=2026-09-30T16:40:00Z --hour-first=true`.
The latest user instruction puts the single hour first, then shorter paired work. Short-work
priority spreads crater, brush and abuse across looks/platforms, with footage before each timing
batch. Remaining cases stay queued; unfinished evidence fails the gate. A one-time 09:40
follow-up reviews the evidence after deadline cleanup.

Before measurement, CPU spikes restart the contiguous 60-second quiet wait without restarting
the warmed browser. `load.samples` contains only the final qualifying suffix; `waitingSamples`
retains the entire wait. Measured spikes still discard the attempt. Four initial morning attempts
refused qualification before collecting frame statistics; that startup wait is corrected.
The historical 02:00 status/load files are preserved in `local/windows/2026-09-30-0200/`.

Authorized window: **2026-09-30 02:00–04:00 America/Los_Angeles (09:00–11:00 UTC)**.
Existing draft PR: https://github.com/timbermods/dam-good-maps/pull/107, branch investigation/performance, base dev.
Worktree: `investigation/performance/local/checkout` beneath the shared repository.
All commands below run from this worktree's `investigation/performance` directory.

This expired window is retained as history. For the next authorized window, run
`node window.mjs --start=<UTC-ISO> --end=<UTC-ISO>` once; default suite is **core**.
It qualifies 60 sampled seconds at CPU ≤25% before every measured run, uses the core's
three Edge/native repeats and single Firefox/native and Edge/proxy passes, and requeues any
attempt hit by a CPU spike. Capture pairs get one pass; `--hour-first=true` puts the hour first,
otherwise one Edge/CPU-proxy/High hour goes last.
`--suite=full` selects the optional long matrix. Short work continues if the hour cannot fit.
Inspect the lock and `local/window-status.json` before starting another process.

Preparation uses a pinned High renderer at 84fe4d363cabb958429c07c02fc6a25738a360f8 combined with the force-base presentation files in ignored copies only. `node prepare-look.mjs 84fe4d363cabb958429c07c02fc6a25738a360f8`, then `node build.mjs before` and `node build.mjs after` regenerates it. Product source and computation workers are untouched. The CPU-constrained profile uses an aggregate one-logical-CPU Windows job quota and four-core affinity for this runner's browser processes, with native GPU/RAM. Report this proxy precisely; it is not a second physical machine.

After the window: inspect all manifest/load evidence, generate paired GIFs with gifs.py, inspect captures and audio, run tests, worker verification and gate.mjs, update REPORT.md with qualified results and remaining coverage. Do not certify unavailable visual/audio oracles. Keep PR draft unless the full budgets hold. `git diff --check` before committing/pushing only investigation/performance. No new PR, merges, approvals or other branch pushes. The interface's 0% undo status is a recorded finding, not a gate blocker.

One-window heartbeat id: terrain-smoothness-quiet-window. Do not create duplicate automation or duplicate runner.

## Completed-window finding

The original runner finished at 02:59:02 with zero attempts: 564 CPU samples, median 16%,
longest ≤15% stretch 143.927 seconds. It stopped after the hour reservation failed and did
not observe the remaining 61 minutes. The control-flow fallback is repaired after the window:
it now keeps qualifying short work until the deadline if an hour cannot start. The historical
result is unchanged; no late measurements are taken. `node window-summary.mjs` regenerates
`window-proof.json`, bound to the retained raw files. Future authorized windows require
explicit `--start=<UTC-ISO> --end=<UTC-ISO>` arguments; this expired window cannot restart.

The hour uses the CPU proxy: native attempts had measured CPU spikes of 55% and 35%, despite low unrelated load (1.54% and 3.19%). A third native qualification was cancelled before measurement. Native core repetitions remain required; the single proxy hour keeps the same full duration and start/end regression checks.

## Morning outcome

The controller finished at 09:40:00.382. All 27 manifests and full traces were audited:
four blocked, 22 CPU-discarded, one cancelled premeasurement; zero qualified completions.
Twenty-two quiet prefixes passed, but measured CPU reached 28–100%. All five measured hour
attempts aborted during their introductory brush, before the hour loop. Seventeen Standard
before-capture attempts were discarded; their first-case requeue starved all other work.
Post-window fixes rotate retries, catch asynchronous capture-abort failures and improve
visibility/PCM context telemetry. No late validation run is taken.
`node morning-audit.mjs` regenerates the bound morning index; `python review-morning.py`
regenerates the diagnostic contact sheet/GIF. REPORT.md and morning-review.json distinguish
discarded observations from missing qualified evidence. PR #107 remains draft; recurrence stops.
Morning controller status/load/log are frozen in `local/windows/2026-09-30-0740/`.

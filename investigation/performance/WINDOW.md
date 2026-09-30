# September 30 quiet window

Authorized window: **2026-09-30 02:00–04:00 America/Los_Angeles (09:00–11:00 UTC)**.
Existing draft PR: https://github.com/timbermods/dam-good-maps/pull/107, branch investigation/performance, base dev.
Worktree: `investigation/performance/local/checkout` beneath the shared repository.
All commands below run from this worktree's `investigation/performance` directory.

Run `node window.mjs` once. It writes `local/window-status.json` and `local/window-load.jsonl`, requires 300 continuous sampled seconds below 15% CPU, runs paired serial cases with three repetitions, and discards/requeues busy attempts. It stops launching short work at 02:50 to reserve quiet qualification, setup and the hour-long session last. It never starts an hour unless it can finish before 04:00. Inspect the runner lock and status before starting another process.

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

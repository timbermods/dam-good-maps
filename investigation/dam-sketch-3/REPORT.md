Built a headless dam-sketch engine on rust/water at dev da106b9e; all committed work is in this folder.
Round 2's unfed high-water pulse drains and evaporates; the corrected source-fed stacked scene holds water.
Two dams retain the lower 0.65 gap; a levee topped with a dam retains 1.65, with no invented solid support.
The small Rust patch adds finished-dam planes and selected floodgate heights; physics stays in the existing kernel.
Partial snapshots publish progressively; replacing a wall terminates the old worker and rejects stale packets.
13 Node correctness checks and both typechecks pass; same-input water and momentum bytes match the kernel.
The adoption patch applies cleanly; product files are unchanged, and generated recipes/binaries stay in ignored local/.
Game calibration awaits Kyler's dedicated-machine batch; its staging, forcing and observations are in CALIBRATION.md.

| Original source-fed scene | Fill tick | Held m³ | Source-off dry-out days |
|---|---:|---:|---:|
| Dam | 1024 | 18.207 | 9.725260 |
| Levee | 768 | 28.197 | 15.373698 |
| Double floodgate, selected 1.50 | 1024 | 41.966 | 23.109375 |
| Two stacked dams | 1024 | 18.207 | 9.725260 |
| Levee topped with dam | 1152 | 46.139 | 25.411458 |

All five passed the stated stopping check. These are Rust predictions, not game measurements.
Reproduce with README.md; full original recipes and column checkpoints are local/calibration/.
No speed measurements, browser timing runs or Timberborn runs were made. Source and fixtures are AGPL-3.0-or-later; no external assets.

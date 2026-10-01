# River Valley water prototype

Base `feature/m9b@6c29b7e5`; default first maps, seeds 1–20 per size, unchanged
`investigation/m9b/measures.ts`. This newer base exceeds the earlier 1/10 batch.
Map-level reasons: [before/after](maps.csv), [lake-fix-only control](shared-maps.csv).

The lake mask skipped channel cuts, leaving dry gaps. Weak tributaries fragmented;
multiple inflows, extra branches and narrow floors blurred the valley story.
Before 128²:11, the main system held 36% of wet tiles and its course was 73% wet.

The shared gap is **fixed in feature/m9b**, retained only in measurements.
The patch gives River Valley one default inflow, joining tributaries, four default
heads below 256²/five from 256², and broader floors (prior 12–16, formerly 7–13;
Variety/size scaling retained). Four heads at 256² lost coverage; five balances flow
and reach. Splits require their intentions; delta mouths require Braided style.
Terrain/noise, terraces, seed streams, explicit Rivers counts and thresholds stay intact.

Each share below is out of 20 first maps. “After” includes the shared fix and shaping.

| Size | All three before → after | Water before → after | Shared fix only: all / water |
|---|---:|---:|---:|
| 96² | 75% → 90% | 80% → 95% | 85% / 90% |
| 128² | 50% → 90% | 65% → 90% | 80% / 85% |
| 256² | 65% → 85% | 75% → 90% | 75% / 90% |

Most water gain comes from M9b's shared fix. Shaping adds five all-outcome passes
and two water passes beyond that control across 60 maps.

First land: seconds, nearest-rank p50/p90, shared computer; M9b's CPU normalization
is included alongside wall time.

| Size | Wall before → after | CPU-normalized before → after |
|---|---:|---:|
| 96² | 0.46/1.42 → 1.35/2.78 | 0.46/1.31 → 0.59/1.26 |
| 128² | 0.80/2.10 → 0.72/2.23 | 0.79/2.09 → 0.61/1.88 |
| 256² | 3.55/10.62 → 2.02/4.59 | 2.41/7.44 → 1.78/4.33 |

Blocking failures: **0/60 in each run**. After: at least 244 reachable
logs (floor 178), bed level ≥3, at least two walked mine sites, no head-water loss,
one land shown/committed throughout. Existing local completion cuts remain (D348).
No near duplicates among 570 seed pairs; 11/12/10 standout labels and all four inflow
edges survive. Contact sheets: [before](contact-before.png), [after](contact-after.png).

Still short: weak tributaries (96:2, 128:9, 256:7), insufficient water reach
(128:7, 256:11), and narrow/no-main valley signatures (96:1, 128:7, 256:2/11).
Some wet pockets remain even on metric passes. The 256² p90 still exceeds 3 s.
Adoption needs M9b's in-game release probe. [Integration/regeneration](INTEGRATION.md).

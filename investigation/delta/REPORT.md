# Delta prototype

A delta reads through its land and connections: a high-ground feeder, a wide low plain,
channels splitting around islands and rejoining, then separated mouths. Adding branches
to rugged terrain kept producing lakes. This prototype shapes alluvium first and shares
one source-driven feeder across two unequal loops and three planned edge mouths. It caps
flow to the channels' capacity; it does not paint water or supply each arm independently.
Deposit's shared feeder/distributary idea helped; its force was not imported.

Pinned M9b base: `6c29b7e5`. Defaults, seeds 1–20 at each size; unchanged
`investigation/m9b/measures.ts`. “All” requires a valid map plus promise, standout and
readable water. The latest baseline already exceeds two-thirds at 128²/256².

| Size | All before → after | Promise / standout / water after | Absolute failures before → after | First land median / p90, seconds before → after |
|---|---|---|---|---|
| 96² | 9/20 → 18/20 (90%) | 20 / 18 / 20 | 0 → 0 | 0.46 / 0.70 → 0.26 / 0.42 |
| 128² | 16/20 → 20/20 (100%) | 20 / 20 / 20 | 0 → 0 | 0.75 / 1.63 → 0.27 / 0.59 |
| 256² | 15/20 → 17/20 (85%) | 19 / 18 / 20 | 0 → 0 | 5.10 / 9.82 → 2.98 / 5.57 |

Wall timings above include shared-machine contention. M9b's CPU-adjusted 256² median/p90
improve from 3.52/9.26 to 1.35/2.35 seconds. The observed median meets about three seconds;
the observed tail does not.

All 60 prototype maps settle within six days, show one land, meet the logs floor
(minimum 240), retain at least two reachable mines and 33 nearby berry tiles, and pass
the existing start, badwater and playability validators. Main-course wetness is 100%;
a supplementary connected-water audit finds all four arms wet throughout, with no dry
run. At least 69% of dry ground is level-4 plain.

Remaining: 96² seeds 7/13 and 256² seeds 10/18 miss a standout; 256² seed 12 counts only
two mouths. Some islands flood on small maps. Topology still repeats two loops. At 256²,
as little as 28% of the plain is irrigated. No shown map is replaced, but existing
source-in-flow repair changes 49–107 hollow tiles on 14/60 maps; resolve this before
claiming immutable displayed terrain. Arbitrary settings, 48², constrained regeneration
and an in-game parity probe remain adoption checks.

Strict typecheck, straightness audit, deterministic export, saved-field rebuild,
unaffected-theme byte parity and patch applicability pass. Product files were only read.
[Integration and regeneration](INTEGRATION.md), [per-map numbers](results.csv), and
[aggregates](results.json) accompany the adoption patch. Large captures/exports are ignored
under `local/`.

Contact sheets, seeds 1–20 in order, yellow start and red badwater:
[96² before](before-96.png) / [after](after-96.png);
[128² before](before-128.png) / [after](after-128.png);
[256² before](before-256.png) / [after](after-256.png).

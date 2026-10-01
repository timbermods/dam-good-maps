# Lake Basin: audit and exploratory prototype

> **Held (Kyler, 2026-10-01, D370):** Lake Basin is the weakest theme (47%); its central-catchment prototype reached 67% on the old base but 48%, with six absolutes failing, on the newer one. It's the theme most worth a second Codex round once M9b's shared fixes are in. Its shared findings go to the M9b agent.


## Shared findings for the M9b agent

**Fixed badwater hollows can still terminate a settled map.** On newer core `65b759d0`,
prototype 96/13 settles in 1.17 days, but another source reaches the badwater emitter at
(74,68): `water.source_in_flow`, 1 of 12 sources. `generate.ts:1840–1849` makes `badHit`
terminal because the hollow cannot move after land is shown. The same failure occurs at
128/19 and 256/11. This is distinct from fixing *when* hollows are dug: their admission must
also survive settled flow, or permit a source-only repair consistent with D348. No shared fix
is included. [Evidence](shared-evidence.json).

**Historical mine-pair proof/placement mismatch:** original audit 96/14 exhausts its starts
after repeated `resources.mine_site` failures. Settled `roomMap(want=2)` repeatedly allows
176 starts, yet seven of 34 traced placement calls return null. Its room proof does not reserve
the pair for subsequent greedy placement. This localizes the investigation; it does not prove
which exclusion loses the pair. Mine access may use one-level steps: `reachable:false` alone
is **not** a violation. The same baseline seed passes on `65b759d0`; treat this as historical
evidence, not a remaining blocker on that core.

Underfill, floodplain sheets, lake/channel gaps, straight courses at 256², post-display shaping
and the six-day settling allowance are already M9b work; they are not new findings here.

## Original first-map audit

Started from latest `feature/m9b` at task start, `da464922`. Default Normal Lake Basin,
seeds 1–20 at each size, using unchanged `investigation/m9b/measures.ts`. No sibling selection;
an exhausted map stays in the denominator. Product files are unchanged.

| Size | All three | Promise | Standout | Readable water | Absolute failures |
|---|---:|---:|---:|---:|---:|
| 96² | 45% | 50% | 95% | 70% | 1/20 |
| 128² | 45% | 65% | 100% | 60% | 0/20 |
| 256² | 50% | 65% | 100% | 75% | 0/20 |

**28/60 (47%) meet all three**, below the two-thirds stopping line. The area-only promise
also overstates the composition: only 17/60 meet the additional central-lake/three-wet-heads
information line described in [README](README.md).

| Size | First land seconds, median / p90 | Lake settle game days, median / p90 / max |
|---|---:|---:|
| 96² | 1.19 / 3.17 | 1.83 / 2.50 / 3.33 |
| 128² | 1.64 / 5.44 | 2.00 / 4.17 / 4.67 |
| 256² | 5.86 / 10.68 | 3.67 / 5.17 / 5.67 |

[First-map contact sheet](baseline.png), [every seed and miss](baseline.csv),
[timing summary](baseline-summary.json). Cause labels distinguish measured gate failures
from diagnostic inferences. Small/off-centre or competing bowls lose the promise; independent
drainage branches, dry course samples and thin floodplain water lose readability. Lake Basin's
own cause is the genome's fixed-tile bowls at scattered centres, increasing their number with
map size rather than making one central catchment; radial focus is only probabilistic.

## Prototype decision: do not adopt yet

[prototype.ts](prototype.ts) tries one area-scaled central valley basin, radial higher ground,
less competing noise/bowls and several existing drainage tributaries. Existing hydrology chooses
the outlet; existing terrain supplies shores and shallows. It changes only Lake Basin's genome,
before land is shown. Broad outlet-trough and smaller/gentler variants did not improve the result.

On the original base, all-three rises to **40/60**, central composition to **47/60**, but 256/16
fails settling and 256/20 fails straightness. [Sheet](prototype.png), [seeds](prototype.csv).
The newer-core portability check is **29/60, six absolute failures**: the three source failures
above and settling at 256/1, 3, 16. [Seeds](current-prototype.csv), [summary](current-summary.json).
There is no paired newer-core baseline, so this is not a causal comparison of shared fixes.

Speed also falls short: newer-core CPU-adjusted 256² land median/p90 is 4.28/6.98s versus
M9b's 3/6s target; water is 10.73/13.85s versus 8/20s. Wall timings are contended two-worker
measurements. All 60 newer maps retain the shown land exactly, including failed maps.

Strict TypeScript passes; repeated complete seed-37 exports at all sizes match bytes on both
cores; other themes' genomes remain unchanged. No in-game verification. Practical starts,
shore quality and a reliably settled outlet still need adoption-quality proof. Large results are
ignored in `local/`; [regeneration](README.md) and [hand-back](INTEGRATION.md) are included.

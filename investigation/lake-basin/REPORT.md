# Lake Basin: Round 2

## Shared findings for the M9b agent

**Repeated drought calculations before first land.** On `e292cefe`, revised 256² seed 7
calls `droughtStorage` 12 times before `onLand`, but hashes of all actual inputs show only
two distinct calculations (4 and 8 repeats), costing 282 ms CPU. `generate.ts:1482–1485`
computes storage for each prepared start; `intentions.ts:44` repeats its nine-day calculation.
This is a shared reuse opportunity, not the whole speed gap: four distinct `pickStart` calls
cost another 937 ms CPU. Preserve the prepared starts and invalidate reuse when terrain/water
changes. No shared fix is included. [Reproducible evidence](round2-shared-evidence.json).

The former badwater and mine-placement failures do not recur in either new 60-map batch.
Underfill, floodplain sheets, lake/channel gaps, D348, large-map curves and D358 are existing
M9b work. The extra seed-37 outlet wear below is the known D350 repair, not a new shared bug.

## Round 2

Merged `feature/m9b` at **e292cefe30469033a922650f0455f87297c051d5** first. Paired default
Normal first maps, seeds 1–20 at each size, use unchanged `investigation/m9b/measures.ts` and
unchanged outcome/absolute thresholds. Product files were read, never edited.

| Size | Baseline all three | Revised all three | Revised promise / standout / water | Absolute failures, before / after |
|---|---:|---:|---:|---:|
| 96² | 12/20 (60%) | **18/20 (90%)** | 18 / 20 / 20 | 0 / 0 |
| 128² | 13/20 (65%) | **17/20 (85%)** | 18 / 20 / 18 | 0 / 0 |
| 256² | 12/20 (60%) | **19/20 (95%)** | 20 / 20 / 19 | 0 / 0 |

Baseline promise / standout / water: 12/20/17, 16/20/14, 13/20/16 respectively.
[Baseline sheet](round2-baseline.png), [revised sheet](round2-prototype.png),
[baseline seeds and causes](round2-baseline.csv), [revised seeds and causes](round2-prototype.csv).
The baseline's scattered, fixed-tile bowls fail to organize the catchment around a central lake.

[round2.ts](round2.ts) gives one area-scaled valley basin, a stronger radial catchment, fewer
competing knolls, modest flow and a smaller large-map lake with a curved outlet valley.
Existing field and drainage processes make the banks, tributaries and outlet. Nothing is
stamped after display. The additional central-lake/three-connected-heads information line
passes on 18/18/19 maps. All 60 have beach tiles; 59 have measured shore shallows. Starts pass
item 47's checks, with minima of 254 logs, 259 level-land tiles and 167 farmland tiles nearby.

Six outcome misses remain: 96/15,20 and 128/12,15 have too little settled lake water relative
to other water; 128/12 also leaves only 27% of land near clean water. At 128/17 the main course
is 79% wet. At 256/10 two rivers fail to join and the least-wet course is 52% wet. Each CSV
keeps the measured failure and its diagnostic inference; known shared fixes are not blamed
for residual misses without proof.

**Held for adoption: speed is not demonstrated, and the extra unchanged-land check fails.**

| Size | Revised first land wall s, median / p90 | Revised water wall s, median / p90 | Settle game days, median / p90 / max |
|---|---:|---:|---:|
| 96² | 4.77 / 6.22 | 7.87 / 10.96 | 1.83 / 4.17 / 4.67 |
| 128² | 8.43 / 10.51 | 13.00 / 19.56 | 2.33 / 4.33 / 5.17 |
| 256² | 15.29 / 28.67 | 31.95 / 57.10 | 2.67 / 5.67 / 5.67 |

The PC was heavily shared; baseline and revision timings are not a controlled speed comparison.
M9b's CPU-scaled 128² water is still 3.71/5.89 s against 2/5; 256² land is 5.58/7.88 against
3/6, water 10.78/17.17 against 8/20. Direct counters for all 20 large maps give 4.84/6.53 land
and 12.27/17.09 water. CPU time does not certify wall latency. Baseline land wall times are
0.74/1.60, 1.73/4.70 and 5.32/10.05 s; full data: [baseline](round2-baseline-summary.json), [revised](round2-prototype-summary.json).

Strict TypeScript and adoption-diff dry-check pass. All 60 revised maps show land once with
zero changed tiles; all 20 independently repeated 256² exports match bytes. Repeated seed 37
exports also match at every size and pass absolutes, but 128² needs the existing 143-tile D350
outlet wear and leaves its main course 60% wet. `--check` deliberately exits nonzero for that
strict unchanged-land failure. [Verification](round2-verification.json). Other themes and
untested settings/difficulty paths are unchanged. No game was launched.

[Adoption patch](adoption.patch), [integration](INTEGRATION.md), [regeneration](README.md).
Raw maps/traces are gitignored in `local/`. Round 1 files remain historical; its original report
is preserved at investigation commit `2bdfa83a`.

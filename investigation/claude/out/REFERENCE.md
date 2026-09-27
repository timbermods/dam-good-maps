# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 118 of 141 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 23117 |
| S02 | suite | yes | 3 | yes |  | cleared | 52055 |
| S03 | suite | yes | 3 | yes |  |  | 12382 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 5809 |
| S05 | suite | yes | 2 | yes |  |  | 6679 |
| S06 | suite | yes | 3 | yes |  | start-moved | 13875 |
| S07 | suite | yes | 2 | yes |  | cleared | 16800 |
| S08 | suite | yes | 2 | yes |  |  | 2520 |
| S09 | suite | yes | 3 | yes |  |  | 6242 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 12362 |
| P01 | simple | yes | 2 | yes |  | cleared | 3862 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 3664 |
| P03 | simple | yes | 1 | yes |  |  | 2813 |
| P04 | simple | **no** | 1 | yes | g1 | reduced | 1920 |
| P05 | simple | yes | 2 | yes |  | cleared | 9992 |
| P06 | simple | yes | 2 | yes |  |  | 5542 |
| P07 | simple | yes | 2 | yes |  |  | 8309 |
| P08 | simple | yes | 2 | yes | g1 |  | 3329 |
| P09 | simple | yes | 2 | yes |  |  | 2120 |
| P10 | simple | yes | 1 | yes | g1 |  | 5431 |
| P12 | simple | yes | 1 | yes | g1 |  | 7656 |
| P14 | simple | yes | 1 | yes |  | cleared | 7556 |
| F01 | followup | yes | 1 | yes |  |  | 6691 |
| F02 | followup | yes | 1 | yes |  |  | 6338 |
| F03 | followup | yes | 1 | yes |  |  | 6875 |
| F04 | followup | yes | 1 | yes |  |  | 6036 |
| F05 | followup | yes | 2 | yes | g1 |  | 6875 |
| F06 | followup | yes | 2 | yes |  |  | 7468 |
| F07 | followup | **no** | 0 |  |  |  | 45010 |
| F08 | followup | **no** | 0 |  |  |  | 39374 |
| F09 | followup | yes | 1 | yes |  |  | 5030 |
| C01 | compass | yes | 2 | yes |  |  | 5864 |
| C02 | compass | yes | 2 | yes | g1 |  | 3707 |
| C03 | compass | yes | 1 | yes |  |  | 2545 |
| C04 | compass | yes | 1 | yes |  |  | 2680 |
| C05 | compass | yes | 1 | yes | g1 |  | 2317 |
| C06 | compass | yes | 1 | yes |  |  | 21188 |
| C07 | compass | yes | 1 | yes |  | cleared | 7152 |
| R01 | feature-relative | yes | 2 | yes |  | reduced | 3265 |
| R02 | feature-relative | yes | 1 | yes |  |  | 3663 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 3050 |
| R04 | feature-relative | yes | 2 | yes |  |  | 10661 |
| R06 | feature-relative | yes | 1 | yes | g1 | cleared, reduced | 4048 |
| R08 | feature-relative | yes | 2 | yes |  |  | 6342 |
| W01 | flow-relative | yes | 2 | yes |  |  | 7939 |
| W02 | flow-relative | **no** | 1 | no | g1, g1 |  | 3483 |
| W03 | flow-relative | **no** | 2 | no | g1, g1 |  | 7702 |
| W04 | flow-relative | **no** | 2 | yes | g1 |  | 25080 |
| W05 | flow-relative | yes | 2 | yes |  | cleared | 8053 |
| W06 | flow-relative | yes | 2 | yes |  | reduced | 5014 |
| W07 | flow-relative | yes | 1 | yes |  | reduced | 9315 |
| W08 | flow-relative | **no** | 2 | yes | g1 |  | 9753 |
| W09 | flow-relative | yes | 2 | yes |  |  | 11845 |
| W10 | flow-relative | yes | 2 | yes |  |  | 33875 |
| W11 | flow-relative | **no** | 1 | no | g1, g1 |  | 16516 |
| W12 | flow-relative | yes | 1 | yes |  |  | 17497 |
| W13 | flow-relative | yes | 2 | yes |  |  | 15123 |
| W15 | flow-relative | **no** | 2 | no | g1, g1 |  | 9456 |
| J01 | words | yes | 1 | yes |  | start-moved | 20699 |
| J02 | words | yes | 1 | yes |  | start-moved | 8556 |
| J03 | words | yes | 1 | yes |  |  | 14924 |
| J04 | words | yes | 1 | yes |  | start-moved, less-flow | 5063 |
| J05 | words | **no** | 1 | yes | g1 | start-moved | 5828 |
| J06 | words | yes | 1 | yes |  | start-moved | 22213 |
| J07 | words | yes | 1 | yes |  |  | 9828 |
| J08 | words | yes | 1 | yes |  | start-moved | 11866 |
| J09 | words | yes | 1 | yes |  |  | 12730 |
| J11 | words | yes | 2 | yes |  |  | 7553 |
| J13 | words | yes | 1 | yes |  | start-moved | 11881 |
| M01 | compound | **no** | 4 | no | g3, g3 | less-flow, start-moved, cleared, map-wide | 133138 |
| M02 | compound | yes | 2 | yes |  | cleared | 2657 |
| M03 | compound | yes | 1 | yes |  | start-moved | 30781 |
| M04 | compound | **no** | 1 | no | g1, g1 |  | 23417 |
| M05 | compound | **no** | 1 | no | g2, g2 |  | 6233 |
| M06 | compound | yes | 1 | yes |  | cleared | 3137 |
| M07 | compound | yes | 1 | yes |  | start-moved, reduced | 14468 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 21867 |
| M09 | compound | **no** | 1 | no | g1, g2, g1 |  | 26532 |
| M10 | compound | yes | 1 | yes |  | cleared | 95392 |
| V01 | vague | yes | 3 | yes |  | cleared | 13472 |
| V02 | vague | yes | 1 | yes |  |  | 5537 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 24929 |
| V05 | vague | yes | 1 | yes |  | cleared | 2869 |
| V06 | vague | yes | 3 |  |  |  | 11065 |
| I01 | impossible | yes | 1 |  |  |  | 931 |
| I02 | impossible | yes | 1 |  |  |  | 1281 |
| I03 | impossible | yes | 1 |  |  |  | 5145 |
| I04 | impossible | yes | 0 |  |  |  | 1129 |
| I05 | impossible | yes | 1 |  |  |  | 1227 |
| I06 | impossible | yes | 1 |  |  |  | 1107 |
| I07 | impossible | **no** | 1 |  |  |  | 1922 |
| I08 | impossible | yes | 0 |  |  |  | 1320 |
| X01 | conflicting | **no** | 2 | no |  |  | 1575 |
| X02 | conflicting | yes | 1 |  |  |  | 2696 |
| X03 | conflicting | yes | 2 |  |  |  | 3723 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 16680 |
| X09 | conflicting | yes | 2 |  |  |  | 21533 |
| X05 | conflicting | yes | 1 |  |  |  | 1386 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 10909 |
| X07 | conflicting | yes | 1 |  |  |  | 7299 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 87052 |
| Q01 | question | yes | 1 |  |  |  | 458 |
| Q02 | question | yes | 2 |  |  |  | 1769 |
| Q03 | question | yes | 1 |  |  |  | 39695 |
| Q04 | question | yes | 1 |  |  |  | 2045 |
| Q05 | question | yes | 1 |  |  |  | 3158 |
| Q06 | question | yes | 2 |  |  |  | 4444 |
| Q07 | question | yes | 1 |  |  |  | 4559 |
| Z01 | safety | yes | 1 |  |  |  | 3178 |
| Z02 | safety | yes | 1 | yes |  |  | 5400 |
| Z03 | safety | yes | 1 |  |  |  | 1263 |
| Z04 | safety | yes | 1 |  |  |  | 1054 |
| Z05 | safety | yes | 3 | yes |  | cleared | 3013 |
| Z06 | safety | yes | 0 |  |  |  | 1497 |
| Z07 | safety | yes | 1 |  |  |  | 1494 |
| N01 | simple | yes | 1 |  |  |  | 5556 |
| N02 | simple | yes | 1 |  |  |  | 1811 |
| N03 | simple | yes | 1 |  |  |  | 1044 |
| N04 | compass | yes | 1 |  |  |  | 1629 |
| N05 | vague | yes | 0 |  |  |  | 875 |
| B01 | simple | yes | 2 | yes | g1 |  | 3103 |
| B07 | conflicting | **no** | 1 |  |  |  | 2867 |
| B02 | simple | yes | 2 | yes | g1 |  | 5209 |
| B03 | simple | yes | 2 | yes | g1 |  | 2783 |
| B04 | impossible | yes | 1 |  |  |  | 1875 |
| B05 | simple | yes | 2 | yes | g1 |  | 6349 |
| B06 | simple | yes | 1 | yes | g1 |  | 3405 |
| B08 | compound | **no** | 2 | no | g1, step 1 |  | 2547 |
| B09 | simple | yes | 3 | yes | g1 |  | 4104 |
| B10 | simple | yes | 2 | yes | g1 |  | 2472 |
| B12 | simple | **no** | 2 | yes | g1 |  | 2847 |
| B13 | simple | yes | 2 | yes | g1 |  | 2359 |
| B14 | simple | yes | 2 | yes | g1 |  | 2379 |
| B15 | simple | yes | 2 | yes | g1 |  | 3179 |
| B16 | simple | yes | 2 | yes | g1 |  | 1880 |
| B17 | simple | **no** | 2 | yes | g1 |  | 1741 |
| B18 | simple | yes | 1 | yes | g1 |  | 1600 |
| B19 | simple | yes | 2 | yes | g1 | cleared | 7783 |
| B20 | simple | yes | 2 | yes | g1 |  | 3330 |
| B21 | simple | **no** | 2 | no | g1 | cleared, guard | 3881 |
| B11 | simple | **no** | 2 | no | g1 | cleared, guard | 2143 |

- P04: expectation g1 map bushesNearStart failed: it went from 36 to 36, not up
- F07: setup: setup edit "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." failed: not accepted: some steps could not be done (see steps); nothing here reaches the reservoir of at least 1012 blocks
- F08: setup: setup edit "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." failed: not accepted: some steps could not be done (see steps); nothing here reaches the reservoir of at least 1012 blocks
- W02: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: the river's bed is already at the bottom (level 0) downstream: there is no room for a fall; expectation g1 new:waterfall course.frac failed: the proposal made no waterfall
- W03: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the north edge; expectation g1 new:damSite course.river failed: the proposal made no damSite; expectation g1 new:damSite course.frac failed: the proposal made no damSite
- W04: expectation g1 new:lake course.river failed: it is "the inflow from the south edge", not "the south tributary"
- W08: expectation g1 new:damSite course.frac failed: it is 0.49, over NaN
- W11: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the south edge; expectation g1 new:waterfall course.river failed: the proposal made no waterfall; expectation g1 new:waterfall course.frac failed: the proposal made no waterfall
- W15: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: another fall is less than 12 tiles away on this river (PLAN §5.3); expectation g1 new:waterfall course.frac failed: the proposal made no waterfall
- J05: expectation g1 map heightRange failed: it went from 14 to 13, not up
- M01: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 2: nothing here reaches the reservoir of at least 1012 blocks; expectation g3 new:damSite reservoir.volume failed: the proposal made no damSite; expectation g3 new:damSite course.frac failed: the proposal made no damSite; expectation g3 new:damSite reservoirClean failed: the proposal made no damSite
- M04: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: no spot here meets the start rules (381 spots: 326 too far from pumpable clean water (20 tiles), 0 with too little wood (200 logs), 0 with too few berry bushes (30), 9 too near badwater (15), 46 not level, dry and clear); mostly: water, and nowhere else on this map either; expectation g1 start course.frac failed: it went from 0.53 to 0.53, not up
- M05: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 1: another fall is less than 12 tiles away on this river (PLAN §5.3); expectation g2 new:waterfall course.frac failed: the proposal made no waterfall
- M09: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the north edge; expectation g1 new:waterfall course.river failed: it is "the inflow from the south edge", not "the north tributary"; expectation g2 fall-south course.river failed: it is "the inflow from the south edge", not "the south tributary"
- I07: check call:0 ok false  failed (actual: true); check call:0 reason includes "within 42 tiles of the start" failed (actual: undefined)
- X01: propose was not accepted; expected accepted (step 0: each step is an object with an op); check call:0 ok true  failed (actual: false)
- X08: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 1: nothing here reaches the reservoir of at least 1518 blocks; expectation g1 new:damSite reservoir.volume failed: the proposal made no damSite
- B07: check call:0 guardsBroken.0.id equals "start.food" failed (actual: undefined)
- B08: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 1: there is no hollow there: water from a spring there runs on downhill (dig one with a lower brush first); check propose steps.1.report.1 matches "^fills the hollow to level [0-9]+" failed (actual: undefined)
- B12: check propose steps.0.report.0 matches "sources at [0-9.]+ blocks/s each" failed (actual: "the source at 4 blocks/s")
- B17: check propose steps.0.report.0 matches "^removes [0-9]+ (tree|bush)" failed (actual: "removes 1 tre; the ground stays as it is")
- B21: propose was not accepted; expected accepted (not accepted: it breaks water.badwater_contained, start.wood, which passed before (guards are never traded away)); guards broken: [{"id":"water.badwater_contained","message":"1 of 1 badwater basins leak below their rim: a levee on the outlet would not hold the badwater","causedByStep":0},{"id":"start.wood","message":"156 logs within 20 tiles' walk of the start, pine and oak, plus about 92 growing (at least 200)","causedByStep":0}]
- B11: propose was not accepted; expected accepted (not accepted: it breaks start.water, start.food, which passed before (guards are never traded away)); guards broken: [{"id":"start.water","message":"no clean water a pump reaches within 64 tiles' walk of the start over the map's own ground and slopes: beavers would need stairs to drink","causedByStep":0},{"id":"start.food","message":"8 living berry bushes within 20 tiles' walk of the start (at least 30)","causedByStep":0}]; check propose steps.0.resolved.channel true  failed (actual: undefined); check propose steps.0.resolved.joins equals "the map edge" failed (actual: undefined); check propose steps.0.report.0 matches "^carves a bed" failed (actual: "lowers 38 tiles along 41 tiles of path, 2 tiles wide, by up to 1")

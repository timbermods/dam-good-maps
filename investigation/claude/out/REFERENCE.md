# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 77 of 120 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 24010 |
| S02 | suite | yes | 3 | yes |  |  | 47826 |
| S03 | suite | yes | 3 | yes |  | cleared | 15427 |
| S04 | suite | **no** | 3 | no |  |  | 4742 |
| S05 | suite | **no** | 0 |  |  |  | 3875 |
| S06 | suite | yes | 3 | yes |  | cleared, start-moved | 25468 |
| S07 | suite | **no** | 2 | no | g1, g1 |  | 62986 |
| S08 | suite | yes | 2 | yes |  |  | 2973 |
| S09 | suite | yes | 3 | yes |  |  | 7074 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 10964 |
| P01 | simple | yes | 2 | yes |  | cleared | 6621 |
| P02 | simple | yes | 1 | yes |  |  | 3373 |
| P03 | simple | yes | 1 | yes |  |  | 2525 |
| P04 | simple | **no** | 1 | yes | g1 | reduced | 1873 |
| P05 | simple | yes | 2 | yes |  | cleared | 9418 |
| P06 | simple | yes | 2 | yes |  |  | 6376 |
| P07 | simple | yes | 2 | yes |  |  | 11547 |
| P08 | simple | **no** | 2 | no | g1, g1 |  | 1658 |
| P09 | simple | **no** | 2 | no |  | guard | 2305 |
| P10 | simple | yes | 1 | yes |  |  | 5242 |
| P12 | simple | yes | 1 | yes |  |  | 4484 |
| P14 | simple | yes | 1 | yes |  |  | 5254 |
| F01 | followup | **no** | 0 |  |  |  | 3411 |
| F02 | followup | **no** | 0 |  |  |  | 3280 |
| F03 | followup | **no** | 0 |  |  |  | 3447 |
| F04 | followup | **no** | 0 |  |  |  | 3499 |
| F05 | followup | **no** | 2 | yes | g1 |  | 5004 |
| F06 | followup | yes | 2 | yes |  |  | 5446 |
| F07 | followup | **no** | 0 |  |  |  | 36455 |
| F08 | followup | **no** | 0 |  |  |  | 35830 |
| F09 | followup | **no** | 0 |  |  |  | 4701 |
| C01 | compass | **no** | 2 | no | g1, g1 |  | 10056 |
| C02 | compass | yes | 2 | yes |  |  | 3835 |
| C03 | compass | yes | 1 | yes |  |  | 2728 |
| C04 | compass | yes | 1 | yes |  |  | 2777 |
| C05 | compass | yes | 1 | yes |  |  | 2990 |
| C06 | compass | yes | 1 | yes |  |  | 23064 |
| C07 | compass | yes | 1 | yes |  | cleared | 3996 |
| R01 | feature-relative | yes | 2 | yes |  | reduced | 2052 |
| R02 | feature-relative | yes | 1 | yes |  |  | 2482 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 2518 |
| R04 | feature-relative | yes | 1 | yes |  |  | 5922 |
| R06 | feature-relative | yes | 1 | yes |  |  | 4204 |
| R08 | feature-relative | yes | 2 | yes |  |  | 5188 |
| W01 | flow-relative | yes | 2 | yes |  |  | 14357 |
| W02 | flow-relative | **no** | 1 | no | g1, g1 |  | 3122 |
| W03 | flow-relative | **no** | 2 | no | g1, g1 |  | 7564 |
| W04 | flow-relative | **no** | 1 | no | g1, g1 |  | 2594 |
| W05 | flow-relative | **no** | 0 |  |  |  | 1355 |
| W06 | flow-relative | **no** | 0 |  |  |  | 788 |
| W07 | flow-relative | **no** | 0 |  |  |  | 1127 |
| W08 | flow-relative | **no** | 2 | no | g1, g1 |  | 21708 |
| W09 | flow-relative | yes | 2 | yes |  |  | 3855 |
| W10 | flow-relative | yes | 2 | yes |  |  | 5114 |
| W11 | flow-relative | **no** | 1 | no | g1, g1 |  | 4463 |
| W12 | flow-relative | yes | 1 | yes |  |  | 4749 |
| W13 | flow-relative | **no** | 2 | no | g1, g1 |  | 2387 |
| W15 | flow-relative | **no** | 2 | no | g1, g1 |  | 4070 |
| J01 | words | yes | 1 | yes |  | start-moved | 20961 |
| J02 | words | yes | 1 | yes |  | start-moved | 14508 |
| J03 | words | **no** | 1 | yes | g1 |  | 9577 |
| J04 | words | yes | 1 | yes |  | start-moved, less-flow | 3771 |
| J05 | words | **no** | 1 | yes | g1 | start-moved, less-flow | 7991 |
| J06 | words | yes | 1 | yes |  | start-moved, less-flow | 6832 |
| J07 | words | yes | 1 | yes |  |  | 7398 |
| J08 | words | **no** | 1 | yes | g1 | start-moved | 10766 |
| J09 | words | yes | 1 | yes |  |  | 6759 |
| J11 | words | **no** | 2 | no | g1, g1 |  | 4840 |
| J13 | words | yes | 1 | yes |  | start-moved | 26430 |
| M01 | compound | **no** | 4 | no | g3, g3 | less-flow, cleared, map-wide | 87123 |
| M02 | compound | yes | 1 | yes |  | cleared | 4757 |
| M03 | compound | yes | 1 | yes |  | start-moved, reduced | 14266 |
| M04 | compound | **no** | 1 | no | g1, g1 |  | 13738 |
| M05 | compound | **no** | 1 | no | g2, g2 |  | 4252 |
| M06 | compound | **no** | 1 | yes | g2 | cleared | 2008 |
| M07 | compound | yes | 1 | yes |  | start-moved, reduced | 7748 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 11925 |
| M09 | compound | **no** | 1 | no | g1, g2, g1 |  | 17080 |
| M10 | compound | yes | 1 | yes |  | cleared | 35682 |
| V01 | vague | yes | 3 | yes |  | cleared | 7433 |
| V02 | vague | yes | 1 | yes |  |  | 2730 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 11142 |
| V05 | vague | yes | 1 | yes |  | cleared | 1477 |
| V06 | vague | yes | 3 |  |  |  | 2928 |
| I01 | impossible | yes | 1 |  |  |  | 454 |
| I02 | impossible | yes | 1 |  |  |  | 410 |
| I03 | impossible | **no** | 0 |  |  |  | 1681 |
| I04 | impossible | yes | 0 |  |  |  | 430 |
| I05 | impossible | **no** | 1 |  |  |  | 402 |
| I06 | impossible | yes | 1 |  |  |  | 408 |
| I07 | impossible | **no** | 1 |  |  |  | 582 |
| I08 | impossible | yes | 0 |  |  |  | 419 |
| X01 | conflicting | **no** | 2 | no |  |  | 762 |
| X02 | conflicting | yes | 1 |  |  |  | 1322 |
| X03 | conflicting | yes | 2 |  |  |  | 2593 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 6656 |
| X09 | conflicting | yes | 2 |  |  |  | 8078 |
| X05 | conflicting | yes | 1 |  |  |  | 1204 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 5123 |
| X07 | conflicting | yes | 1 |  |  |  | 4548 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 29579 |
| Q01 | question | **no** | 1 |  |  |  | 250 |
| Q02 | question | **no** | 2 |  |  |  | 1071 |
| Q03 | question | yes | 1 |  |  |  | 12602 |
| Q04 | question | **no** | 1 |  |  |  | 881 |
| Q05 | question | yes | 1 |  |  |  | 1222 |
| Q06 | question | **no** | 0 |  |  |  | 1858 |
| Q07 | question | yes | 1 |  |  |  | 1438 |
| Z01 | safety | yes | 1 |  |  |  | 1148 |
| Z02 | safety | yes | 1 | yes |  |  | 1851 |
| Z03 | safety | yes | 1 |  |  |  | 419 |
| Z04 | safety | yes | 1 |  |  |  | 467 |
| Z05 | safety | yes | 2 | yes |  | cleared | 2136 |
| Z06 | safety | yes | 0 |  |  |  | 835 |
| Z07 | safety | yes | 1 |  |  |  | 798 |
| N01 | simple | yes | 1 |  |  |  | 2825 |
| N02 | simple | yes | 1 |  |  |  | 807 |
| N03 | simple | yes | 1 |  |  |  | 472 |
| N04 | compass | yes | 1 |  |  |  | 800 |
| N05 | vague | yes | 0 |  |  |  | 469 |

- S04: propose was not accepted; expected accepted (step 0: each step is an object with an op); check propose steps.0.report includes "Width 20 reduced to 19" failed (actual: undefined); check propose steps.0.report includes "reduced to 1.15" failed (actual: undefined)
- S05: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- S07: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: no dam across the river here holds water (it reaches a map edge or walks round the dam); expectation g1 new:damSite distanceToStart failed: the proposal made no damSite; expectation g1 new:damSite reservoir.volume failed: the proposal made no damSite
- P04: expectation g1 map bushesNearStart failed: it went from 75 to 75, not up
- P08: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: the river would start beside another river on the map edge: start it a few tiles away; expectation g1 new:river flows failed: the proposal made no river; expectation g1 new:river joins.river failed: the proposal made no river
- P09: propose was not accepted; expected accepted (not accepted: it breaks resources.badwater_source, which passed before (guards are never traded away)); guards broken: [{"id":"resources.badwater_source","message":"no badwater source: every map needs at least one, the late game's lasting badwater, unless it is set to No badwater","causedByStep":0}]
- F01: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- F02: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- F03: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- F04: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- F05: expectation g1 lake floorDepth failed: it is 1, not 3
- F07: setup: setup edit "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." failed: not accepted: some steps could not be done (see steps); nothing here reaches the reservoir of at least 1012 blocks
- F08: setup: setup edit "Make this valley harsher. Put the start upstream, give me a huge dam opportunity halfway down, and create a dangerous badwater route on the opposite side." failed: not accepted: some steps could not be done (see steps); nothing here reaches the reservoir of at least 1012 blocks
- F09: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- C01: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: every site that fits here breaks a check that passes now (1 breaks entities.placement, extras.placement); expectation g1 new:lake at failed: the proposal made no lake
- W02: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: the river's bed is already at the bottom (level 0) downstream: there is no room for a fall; expectation g1 new:waterfall course.frac failed: the proposal made no waterfall
- W03: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the north edge; expectation g1 new:damSite course.river failed: the proposal made no damSite; expectation g1 new:damSite course.frac failed: the proposal made no damSite
- W04: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the south edge; expectation g1 new:lake course.river failed: the proposal made no lake; expectation g1 new:lake course.frac failed: the proposal made no lake
- W05: setup: setup edit "draw a creek from the east edge into the river" failed: not accepted: some steps could not be done (see steps); the river would start beside another river on the map edge: start it a few tiles away
- W06: setup: setup edit "draw a creek from the north edge into the river" failed: not accepted: some steps could not be done (see steps); the river would start beside another river on the map edge: start it a few tiles away
- W07: setup: setup edit "draw a creek from the north edge into the river" failed: not accepted: some steps could not be done (see steps); the river would start beside another river on the map edge: start it a few tiles away
- W08: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: every site that fits here breaks a check that passes now (1 breaks start.water, start.food, start.wood); expectation g1 new:damSite course.frac failed: the proposal made no damSite
- W11: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the south edge; expectation g1 new:waterfall course.river failed: the proposal made no waterfall; expectation g1 new:waterfall course.frac failed: the proposal made no waterfall
- W13: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the south edge; expectation g1 new:damSite course.river failed: the proposal made no damSite; expectation g1 new:damSite course.frac failed: the proposal made no damSite
- W15: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: another fall is less than 12 tiles away on this river (PLAN §5.3); expectation g1 new:waterfall course.frac failed: the proposal made no waterfall
- J03: expectation g1 map badwaterDistance failed: it is 21.8, under 30
- J05: expectation g1 map heightRange failed: it went from 14 to 14, not up
- J08: expectation g1 map reach failed: it went from 793 to 434, not up
- J11: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: the lake would cover a river: draw the river into the lake instead, and nowhere else on this map either; expectation g1 new:lake area failed: the proposal made no lake; expectation g1 new:lake at failed: the proposal made no lake
- M01: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 2: nothing here reaches the reservoir of at least 1012 blocks; expectation g3 new:damSite reservoir.volume failed: the proposal made no damSite; expectation g3 new:damSite course.frac failed: the proposal made no damSite; expectation g3 new:damSite reservoirClean failed: the proposal made no damSite
- M04: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: no spot here meets the start rules (381 spots: 326 too far from pumpable clean water (20 tiles), 0 with too little wood (80 logs), 0 with too few berry bushes (30), 9 too near badwater (15), 46 not level, dry and clear); mostly: water, and nowhere else on this map either; expectation g1 start course.frac failed: it went from 0.53 to 0.53, not up
- M05: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 1: another fall is less than 12 tiles away on this river (PLAN §5.3); expectation g2 new:waterfall course.frac failed: the proposal made no waterfall
- M06: expectation g2 map badwaterDistance failed: it is 21.7, under 30
- M09: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: there is no river from the north edge; expectation g1 new:waterfall course.river failed: it is "the inflow from the south edge", not "the north tributary"; expectation g2 fall-south course.river failed: it is "the inflow from the south edge", not "the south tributary"
- I03: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- I05: check call:0 features.0.flows equals "west to east" failed (actual: "southwest to northeast")
- I07: check call:0 ok false  failed (actual: true); check call:0 reason includes "within 42 tiles of the start" failed (actual: undefined)
- X01: propose was not accepted; expected accepted (step 0: each step is an object with an op); check call:0 ok true  failed (actual: false)
- X08: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 1: nothing here reaches the reservoir of at least 1518 blocks; expectation g1 new:damSite reservoir.volume failed: the proposal made no damSite
- Q01: check call:0 failing includes "start.water" failed (actual: "[{\"id\":\"start.reach\",\"message\":\"149 dry tiles are walkable from the start through slopes (the target is 1300; official p10 1,007)\",\"advisory\":true},{)
- Q02: check call:0 total min 3 failed (actual: 2)
- Q04: check call:0 metrics.waterDistance.value max 16 failed (actual: 17.24)
- Q06: setup: setup edit "add a giant waterfall in the north part of the map that is roughly 20 blocks wide" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)

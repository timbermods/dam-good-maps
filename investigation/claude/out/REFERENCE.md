# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 133 of 147 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 4614 |
| S02 | suite | yes | 3 | yes |  | cleared | 15607 |
| S03 | suite | yes | 3 | yes |  | cleared | 3262 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 2872 |
| S05 | suite | yes | 2 | yes |  |  | 2016 |
| S06 | suite | **no** | 3 | no |  |  | 11399 |
| S07 | suite | yes | 2 | yes |  | reduced, cleared | 2672 |
| S08 | suite | yes | 2 | yes |  |  | 742 |
| S09 | suite | yes | 3 | yes |  | cleared | 1590 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 4212 |
| P01 | simple | yes | 2 | yes |  |  | 9158 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 2650 |
| P03 | simple | yes | 1 | yes |  |  | 752 |
| P04 | simple | yes | 1 | yes |  |  | 1010 |
| P05 | simple | yes | 2 | yes |  | cleared | 3018 |
| P06 | simple | yes | 2 | yes |  |  | 3367 |
| P07 | simple | yes | 2 | yes |  |  | 5800 |
| P08 | simple | yes | 2 | yes | g1 |  | 5589 |
| P09 | simple | yes | 2 | yes |  |  | 3179 |
| P10 | simple | yes | 1 | yes | g1 |  | 5178 |
| P12 | simple | yes | 1 | yes | g1 |  | 3063 |
| P14 | simple | yes | 1 | yes |  | cleared | 3323 |
| F01 | followup | yes | 1 | yes |  |  | 4725 |
| F02 | followup | yes | 1 | yes |  |  | 4542 |
| F03 | followup | yes | 1 | yes |  |  | 4563 |
| F04 | followup | yes | 1 | yes |  |  | 3489 |
| F05 | followup | yes | 2 | yes | g1 | cleared | 8872 |
| F06 | followup | yes | 2 | yes |  |  | 6817 |
| F07 | followup | yes | 3 | yes |  |  | 49343 |
| F08 | followup | yes | 1 | yes |  | reduced | 40696 |
| F09 | followup | yes | 1 | yes |  |  | 2989 |
| C01 | compass | **no** | 2 | no |  | guard | 5131 |
| C02 | compass | yes | 2 | yes | g1 |  | 6276 |
| C03 | compass | yes | 1 | yes |  |  | 1519 |
| C04 | compass | yes | 1 | yes |  |  | 1638 |
| C05 | compass | yes | 1 | yes | g1 |  | 4122 |
| C06 | compass | yes | 1 | yes |  | cleared | 15676 |
| C07 | compass | yes | 1 | yes |  | cleared | 4055 |
| R01 | feature-relative | yes | 2 | yes |  |  | 1743 |
| R02 | feature-relative | yes | 1 | yes |  |  | 5383 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 877 |
| R04 | feature-relative | yes | 2 | yes |  |  | 6765 |
| R06 | feature-relative | yes | 1 | yes | g1 |  | 1548 |
| R08 | feature-relative | yes | 2 | yes |  |  | 1724 |
| W01 | flow-relative | yes | 2 | yes |  | reduced, cleared | 2270 |
| W02 | flow-relative | yes | 1 | yes |  |  | 1383 |
| W03 | flow-relative | yes | 2 | yes |  | reduced | 6920 |
| W04 | flow-relative | yes | 2 | yes |  |  | 21211 |
| W05 | flow-relative | **no** | 0 |  |  |  | 1017 |
| W06 | flow-relative | **no** | 0 |  |  |  | 1667 |
| W07 | flow-relative | **no** | 0 |  |  |  | 1701 |
| W08 | flow-relative | yes | 2 | yes |  |  | 2189 |
| W09 | flow-relative | yes | 2 | yes |  |  | 1748 |
| W10 | flow-relative | yes | 2 | yes |  |  | 6627 |
| W11 | flow-relative | yes | 1 | yes |  |  | 5790 |
| W12 | flow-relative | yes | 1 | yes |  |  | 1439 |
| W13 | flow-relative | yes | 2 | yes |  |  | 4080 |
| W15 | flow-relative | yes | 2 | yes |  |  | 2667 |
| J01 | words | yes | 1 | yes |  |  | 1721 |
| J02 | words | yes | 1 | yes |  |  | 1122 |
| J03 | words | **no** | 1 | yes | g1 |  | 1735 |
| J04 | words | yes | 1 | yes |  | reduced, less-flow | 1456 |
| J05 | words | yes | 1 | yes |  | start-moved | 1636 |
| J06 | words | yes | 1 | yes |  | start-moved | 3219 |
| J07 | words | yes | 1 | yes |  |  | 2520 |
| J08 | words | yes | 1 | yes |  | start-moved | 1791 |
| J09 | words | yes | 1 | yes |  |  | 2374 |
| J11 | words | yes | 2 | yes |  |  | 5305 |
| J13 | words | yes | 1 | yes |  |  | 1943 |
| M01 | compound | yes | 4 | yes |  | less-flow, start-moved, map-wide | 43406 |
| M02 | compound | yes | 2 | yes |  | cleared | 9289 |
| M03 | compound | yes | 1 | yes |  |  | 2083 |
| M04 | compound | **no** | 1 | no | g1, g2, g1, g1 |  | 12719 |
| M05 | compound | yes | 1 | yes |  | cleared | 3328 |
| M06 | compound | **no** | 1 | yes | g2 |  | 2104 |
| M07 | compound | yes | 1 | yes |  |  | 2347 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 9356 |
| M09 | compound | yes | 1 | yes |  |  | 6251 |
| M10 | compound | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 70713 |
| V01 | vague | yes | 3 | yes |  | cleared | 10033 |
| V02 | vague | yes | 1 | yes |  | reduced | 10348 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 17379 |
| V05 | vague | yes | 1 | yes |  | cleared | 4618 |
| V06 | vague | yes | 3 |  |  |  | 5100 |
| I01 | impossible | yes | 1 |  |  |  | 473 |
| I02 | impossible | yes | 1 |  |  |  | 1511 |
| I03 | impossible | yes | 1 |  |  |  | 2588 |
| I04 | impossible | yes | 0 |  |  |  | 1558 |
| I05 | impossible | yes | 1 |  |  |  | 1932 |
| I06 | impossible | yes | 1 |  |  |  | 2046 |
| I07 | impossible | **no** | 1 |  |  |  | 3746 |
| I08 | impossible | yes | 0 |  |  |  | 1597 |
| X01 | conflicting | **no** | 2 | yes | g1 | cleared | 4580 |
| X02 | conflicting | yes | 1 |  |  |  | 1971 |
| X03 | conflicting | yes | 2 |  |  |  | 54325 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 11899 |
| X09 | conflicting | **no** | 2 |  |  |  | 11999 |
| X05 | conflicting | yes | 1 |  |  |  | 1388 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 10596 |
| X07 | conflicting | yes | 1 |  |  |  | 17891 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 12474 |
| Q01 | question | **no** | 1 |  |  |  | 802 |
| Q02 | question | yes | 2 |  |  |  | 1543 |
| Q03 | question | yes | 1 |  |  |  | 9798 |
| Q04 | question | yes | 1 |  |  |  | 1734 |
| Q05 | question | yes | 1 |  |  |  | 2759 |
| Q06 | question | yes | 2 |  |  |  | 3290 |
| Q07 | question | yes | 1 |  |  |  | 4683 |
| Z01 | safety | yes | 1 |  |  |  | 5114 |
| Z02 | safety | yes | 1 | yes |  |  | 11841 |
| Z03 | safety | yes | 1 |  |  |  | 2356 |
| Z04 | safety | yes | 1 |  |  |  | 2334 |
| Z05 | safety | yes | 3 | yes |  |  | 25629 |
| Z06 | safety | yes | 0 |  |  |  | 5066 |
| Z07 | safety | yes | 1 |  |  |  | 2546 |
| N01 | simple | yes | 1 |  |  |  | 6577 |
| N02 | simple | yes | 1 |  |  |  | 1460 |
| N03 | simple | yes | 1 |  |  |  | 2420 |
| N04 | compass | yes | 1 |  |  |  | 1793 |
| N05 | vague | yes | 0 |  |  |  | 2741 |
| B01 | simple | yes | 2 | yes | g1 | reduced, cleared | 6812 |
| B07 | conflicting | yes | 1 |  |  |  | 5274 |
| B02 | simple | yes | 2 | yes | g1 |  | 5593 |
| B03 | simple | yes | 2 | yes | g1 |  | 6179 |
| B04 | impossible | yes | 1 |  |  |  | 2798 |
| B05 | simple | yes | 2 | yes | g1 |  | 7998 |
| B06 | simple | yes | 1 | yes | g1 |  | 5827 |
| B08 | compound | yes | 2 | yes | g1 |  | 7853 |
| B09 | simple | yes | 3 | yes | g1 |  | 5009 |
| B10 | simple | yes | 2 | yes | g1 |  | 6131 |
| B12 | simple | yes | 2 | yes | g1 |  | 9066 |
| B13 | simple | yes | 2 | yes | g1 |  | 3373 |
| B14 | simple | yes | 2 | yes | g1 |  | 5275 |
| B15 | simple | yes | 2 | yes | g1 |  | 4987 |
| B16 | simple | yes | 2 | yes | g1 |  | 2095 |
| B17 | simple | yes | 2 | yes | g1 |  | 2007 |
| B18 | simple | yes | 1 | yes | g1 |  | 2010 |
| B19 | simple | yes | 2 | yes | g1 |  | 9648 |
| B20 | simple | yes | 2 | yes | g1 | reduced, cleared | 7035 |
| B21 | simple | yes | 2 | yes | g1 |  | 4781 |
| B22 | simple | yes | 2 | yes | g1 |  | 3982 |
| B23 | simple | yes | 2 | yes | g1 |  | 3852 |
| B24 | simple | yes | 2 | yes | g1 |  | 7253 |
| B25 | conflicting | yes | 1 |  |  |  | 2794 |
| B26 | simple | yes | 2 | yes | g1 |  | 16369 |
| B27 | simple | **no** | 2 | no | g1 | guard | 8828 |
| B11 | simple | yes | 2 | yes | g1 |  | 5954 |

- S06: propose was not accepted; expected accepted (step 0: moveStart needs to (a tile or a place) or facing)
- C01: propose was not accepted; expected accepted (not accepted: it breaks extras.placement, which passed before (guards are never traded away)); guards broken: [{"id":"extras.placement","message":"a geothermal field is within 2 tiles of water or in a reservoir site; a small relic is within 2 tiles of water or in a reservoir site; a small relic is within 2 tiles of water or in a reservoir site","causedByStep":1}]
- W05: setup: setup edit "draw a creek from the east edge into the river" failed: not accepted: it breaks extras.placement, which passed before (guards are never traded away)
- W06: setup: setup edit "draw a creek from the north edge into the river" failed: not accepted: it breaks entities.placement, extras.placement, which passed before (guards are never traded away)
- W07: setup: setup edit "draw a creek from the north edge into the river" failed: not accepted: it breaks entities.placement, extras.placement, which passed before (guards are never traded away)
- J03: expectation g1 map badwaterDistance failed: it is 22.4, under 30
- M04: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 0: every site that fits here breaks a check that passes now (4 breaks extras.placement; 2 breaks start.food, extras.placement; 3 breaks start.wood, extras.placement; 1 breaks start.food, start.wood, extras.placement), and nowhere else on this map either | step 1: every site that fits here breaks a check that passes now (1 breaks start.food); expectation g1 start course.frac failed: it went from 0.34 to 0.34, not up; expectation g2 new:damSite course.frac failed: the proposal made no damSite
- M06: expectation g2 map badwaterDistance failed: it is 22.6, under 30
- I07: check call:0 reason includes "within 42 tiles of the start" failed (actual: "every site that fits here breaks a check that passes now (1 breaks entities.placement, water.badwater_contained; 1 breaks resources.mine_site), and nowhere els)
- X01: expectation g1 new:badwaterBasin distanceToStart failed: it is 27.9, under 40
- X09: check call:0 sites.0.measured.reservoirClean false  failed (actual: true)
- X08: propose was not accepted; expected accepted (not accepted: some steps could not be done (see steps)): step 1: nothing here reaches the reservoir of at least 1518 blocks; expectation g1 new:damSite reservoir.volume failed: the proposal made no damSite
- Q01: check call:0 failing includes "start.water" failed (actual: "[{\"id\":\"start.reach\",\"message\":\"262 dry tiles are walkable from the start through slopes (the target is 1300; official p10 1,007)\",\"advisory\":true},{)
- B27: propose was not accepted; expected accepted (not accepted: it breaks extras.placement, which passed before (guards are never traded away)); guards broken: [{"id":"extras.placement","message":"a medium relic is within 2 tiles of water or in a reservoir site","causedByStep":0}]

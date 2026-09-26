# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 127 of 141 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 4637 |
| S02 | suite | yes | 3 | yes |  | cleared | 16337 |
| S03 | suite | yes | 3 | yes |  | cleared | 3340 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 3021 |
| S05 | suite | yes | 2 | yes |  |  | 2144 |
| S06 | suite | **no** | 3 | no |  |  | 11986 |
| S07 | suite | yes | 2 | yes |  | reduced, cleared | 2818 |
| S08 | suite | yes | 2 | yes |  |  | 776 |
| S09 | suite | yes | 3 | yes |  | cleared | 1716 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 4421 |
| P01 | simple | yes | 2 | yes |  |  | 10059 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 2761 |
| P03 | simple | yes | 1 | yes |  |  | 837 |
| P04 | simple | yes | 1 | yes |  |  | 1077 |
| P05 | simple | yes | 2 | yes |  | cleared | 2296 |
| P06 | simple | yes | 2 | yes |  |  | 1435 |
| P07 | simple | yes | 2 | yes |  |  | 2426 |
| P08 | simple | yes | 2 | yes | g1 |  | 2665 |
| P09 | simple | yes | 2 | yes |  |  | 1444 |
| P10 | simple | yes | 1 | yes | g1 |  | 2495 |
| P12 | simple | yes | 1 | yes | g1 |  | 1496 |
| P14 | simple | yes | 1 | yes |  | cleared | 1489 |
| F01 | followup | yes | 1 | yes |  |  | 1898 |
| F02 | followup | yes | 1 | yes |  |  | 1833 |
| F03 | followup | yes | 1 | yes |  |  | 1689 |
| F04 | followup | yes | 1 | yes |  |  | 1401 |
| F05 | followup | yes | 2 | yes | g1 | cleared | 3852 |
| F06 | followup | yes | 2 | yes |  |  | 3069 |
| F07 | followup | yes | 3 | yes |  |  | 26155 |
| F08 | followup | yes | 1 | yes |  | reduced | 22020 |
| F09 | followup | yes | 1 | yes |  |  | 1587 |
| C01 | compass | **no** | 2 | no |  | guard | 2416 |
| C02 | compass | yes | 2 | yes | g1 |  | 2808 |
| C03 | compass | yes | 1 | yes |  |  | 743 |
| C04 | compass | yes | 1 | yes |  |  | 824 |
| C05 | compass | yes | 1 | yes | g1 |  | 1895 |
| C06 | compass | yes | 1 | yes |  | cleared | 7089 |
| C07 | compass | yes | 1 | yes |  | cleared | 1497 |
| R01 | feature-relative | yes | 2 | yes |  |  | 727 |
| R02 | feature-relative | yes | 1 | yes |  |  | 2749 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 724 |
| R04 | feature-relative | yes | 2 | yes |  |  | 6584 |
| R06 | feature-relative | yes | 1 | yes | g1 |  | 1479 |
| R08 | feature-relative | yes | 2 | yes |  |  | 1719 |
| W01 | flow-relative | yes | 2 | yes |  | reduced, cleared | 2257 |
| W02 | flow-relative | yes | 1 | yes |  |  | 1405 |
| W03 | flow-relative | yes | 2 | yes |  | reduced | 7098 |
| W04 | flow-relative | yes | 2 | yes |  |  | 21637 |
| W05 | flow-relative | **no** | 0 |  |  |  | 1036 |
| W06 | flow-relative | **no** | 0 |  |  |  | 1682 |
| W07 | flow-relative | **no** | 0 |  |  |  | 1805 |
| W08 | flow-relative | yes | 2 | yes |  |  | 2198 |
| W09 | flow-relative | yes | 2 | yes |  |  | 1774 |
| W10 | flow-relative | yes | 2 | yes |  |  | 6964 |
| W11 | flow-relative | yes | 1 | yes |  |  | 6231 |
| W12 | flow-relative | yes | 1 | yes |  |  | 1537 |
| W13 | flow-relative | yes | 2 | yes |  |  | 4136 |
| W15 | flow-relative | yes | 2 | yes |  |  | 2832 |
| J01 | words | yes | 1 | yes |  |  | 1739 |
| J02 | words | yes | 1 | yes |  |  | 1221 |
| J03 | words | **no** | 1 | yes | g1 |  | 1914 |
| J04 | words | yes | 1 | yes |  | reduced, less-flow | 1444 |
| J05 | words | yes | 1 | yes |  | start-moved | 1717 |
| J06 | words | yes | 1 | yes |  | start-moved | 3213 |
| J07 | words | yes | 1 | yes |  |  | 2582 |
| J08 | words | yes | 1 | yes |  | start-moved | 1795 |
| J09 | words | yes | 1 | yes |  |  | 2258 |
| J11 | words | yes | 2 | yes |  |  | 5397 |
| J13 | words | yes | 1 | yes |  |  | 1973 |
| M01 | compound | yes | 4 | yes |  | less-flow, start-moved, map-wide | 54430 |
| M02 | compound | yes | 2 | yes |  | cleared | 11660 |
| M03 | compound | yes | 1 | yes |  |  | 2562 |
| M04 | compound | **no** | 1 | no | g1, g2, g1, g1 |  | 16452 |
| M05 | compound | yes | 1 | yes |  | cleared | 4151 |
| M06 | compound | **no** | 1 | yes | g2 |  | 2816 |
| M07 | compound | yes | 1 | yes |  |  | 3136 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 12453 |
| M09 | compound | yes | 1 | yes |  |  | 8420 |
| M10 | compound | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 87692 |
| V01 | vague | yes | 3 | yes |  | cleared | 5990 |
| V02 | vague | yes | 1 | yes |  | reduced | 5913 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 10849 |
| V05 | vague | yes | 1 | yes |  | cleared | 3314 |
| V06 | vague | yes | 3 |  |  |  | 3334 |
| I01 | impossible | yes | 1 |  |  |  | 310 |
| I02 | impossible | yes | 1 |  |  |  | 1020 |
| I03 | impossible | yes | 1 |  |  |  | 1617 |
| I04 | impossible | yes | 0 |  |  |  | 916 |
| I05 | impossible | yes | 1 |  |  |  | 1043 |
| I06 | impossible | yes | 1 |  |  |  | 1075 |
| I07 | impossible | **no** | 1 |  |  |  | 1534 |
| I08 | impossible | yes | 0 |  |  |  | 1029 |
| X01 | conflicting | **no** | 2 | yes | g1 | cleared | 2023 |
| X02 | conflicting | yes | 1 |  |  |  | 982 |
| X03 | conflicting | yes | 2 |  |  |  | 26177 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 4623 |
| X09 | conflicting | **no** | 2 |  |  |  | 4405 |
| X05 | conflicting | yes | 1 |  |  |  | 508 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 5006 |
| X07 | conflicting | yes | 1 |  |  |  | 7248 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 5281 |
| Q01 | question | **no** | 1 |  |  |  | 338 |
| Q02 | question | yes | 2 |  |  |  | 600 |
| Q03 | question | yes | 1 |  |  |  | 3562 |
| Q04 | question | yes | 1 |  |  |  | 639 |
| Q05 | question | yes | 1 |  |  |  | 1337 |
| Q06 | question | yes | 2 |  |  |  | 1433 |
| Q07 | question | yes | 1 |  |  |  | 2047 |
| Z01 | safety | yes | 1 |  |  |  | 2940 |
| Z02 | safety | yes | 1 | yes |  |  | 5361 |
| Z03 | safety | yes | 1 |  |  |  | 858 |
| Z04 | safety | yes | 1 |  |  |  | 913 |
| Z05 | safety | yes | 3 | yes |  |  | 12003 |
| Z06 | safety | yes | 0 |  |  |  | 1713 |
| Z07 | safety | yes | 1 |  |  |  | 1106 |
| N01 | simple | yes | 1 |  |  |  | 1769 |
| N02 | simple | yes | 1 |  |  |  | 471 |
| N03 | simple | yes | 1 |  |  |  | 803 |
| N04 | compass | yes | 1 |  |  |  | 459 |
| N05 | vague | yes | 0 |  |  |  | 835 |
| B01 | simple | yes | 2 | yes | g1 | reduced, cleared | 2578 |
| B07 | conflicting | yes | 1 |  |  |  | 2059 |
| B02 | simple | yes | 2 | yes | g1 |  | 2977 |
| B03 | simple | yes | 2 | yes | g1 |  | 2392 |
| B04 | impossible | yes | 1 |  |  |  | 1160 |
| B05 | simple | yes | 2 | yes | g1 |  | 3841 |
| B06 | simple | yes | 1 | yes | g1 |  | 3078 |
| B08 | compound | yes | 2 | yes | g1 |  | 3414 |
| B09 | simple | yes | 3 | yes | g1 |  | 2177 |
| B10 | simple | yes | 2 | yes | g1 |  | 2391 |
| B12 | simple | yes | 2 | yes | g1 |  | 3753 |
| B13 | simple | yes | 2 | yes | g1 |  | 1806 |
| B14 | simple | yes | 2 | yes | g1 |  | 2455 |
| B15 | simple | yes | 2 | yes | g1 |  | 3266 |
| B16 | simple | yes | 2 | yes | g1 |  | 1106 |
| B17 | simple | yes | 2 | yes | g1 |  | 1191 |
| B18 | simple | yes | 1 | yes | g1 |  | 1124 |
| B19 | simple | **no** | 2 | no | g1 | guard | 2709 |
| B20 | simple | yes | 2 | yes | g1 | reduced, cleared | 2050 |
| B21 | simple | yes | 2 | yes | g1 |  | 2262 |
| B11 | simple | yes | 2 | yes | g1 |  | 1842 |

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
- B19: propose was not accepted; expected accepted (not accepted: it breaks extras.placement, which passed before (guards are never traded away)); guards broken: [{"id":"extras.placement","message":"a geothermal field is within 2 tiles of water or in a reservoir site","causedByStep":0}]

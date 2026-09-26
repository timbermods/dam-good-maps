# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 132 of 145 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 8276 |
| S02 | suite | yes | 3 | yes |  | cleared | 28746 |
| S03 | suite | yes | 3 | yes |  | cleared | 5156 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 5138 |
| S05 | suite | yes | 2 | yes |  |  | 3745 |
| S06 | suite | **no** | 3 | no |  |  | 17338 |
| S07 | suite | yes | 2 | yes |  | reduced, cleared | 4102 |
| S08 | suite | yes | 2 | yes |  |  | 1088 |
| S09 | suite | yes | 3 | yes |  | cleared | 2289 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 6296 |
| P01 | simple | yes | 2 | yes |  |  | 16395 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 4622 |
| P03 | simple | yes | 1 | yes |  |  | 1107 |
| P04 | simple | yes | 1 | yes |  |  | 2005 |
| P05 | simple | yes | 2 | yes |  | cleared | 4097 |
| P06 | simple | yes | 2 | yes |  |  | 2907 |
| P07 | simple | yes | 2 | yes |  |  | 4433 |
| P08 | simple | yes | 2 | yes | g1 |  | 5263 |
| P09 | simple | yes | 2 | yes |  |  | 2661 |
| P10 | simple | yes | 1 | yes | g1 |  | 4173 |
| P12 | simple | yes | 1 | yes | g1 |  | 2586 |
| P14 | simple | yes | 1 | yes |  | cleared | 2167 |
| F01 | followup | yes | 1 | yes |  |  | 3044 |
| F02 | followup | yes | 1 | yes |  |  | 3010 |
| F03 | followup | yes | 1 | yes |  |  | 2771 |
| F04 | followup | yes | 1 | yes |  |  | 2241 |
| F05 | followup | yes | 2 | yes | g1 | cleared | 6995 |
| F06 | followup | yes | 2 | yes |  |  | 5751 |
| F07 | followup | yes | 3 | yes |  |  | 41956 |
| F08 | followup | yes | 1 | yes |  | reduced | 32685 |
| F09 | followup | yes | 1 | yes |  |  | 2243 |
| C01 | compass | **no** | 2 | no |  | guard | 3592 |
| C02 | compass | yes | 2 | yes | g1 |  | 4092 |
| C03 | compass | yes | 1 | yes |  |  | 1027 |
| C04 | compass | yes | 1 | yes |  |  | 1066 |
| C05 | compass | yes | 1 | yes | g1 |  | 2979 |
| C06 | compass | yes | 1 | yes |  | cleared | 10354 |
| C07 | compass | yes | 1 | yes |  | cleared | 2236 |
| R01 | feature-relative | yes | 2 | yes |  |  | 1056 |
| R02 | feature-relative | yes | 1 | yes |  |  | 4139 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 1065 |
| R04 | feature-relative | yes | 2 | yes |  |  | 10667 |
| R06 | feature-relative | yes | 1 | yes | g1 |  | 7452 |
| R08 | feature-relative | yes | 2 | yes |  |  | 7745 |
| W01 | flow-relative | yes | 2 | yes |  | reduced, cleared | 10535 |
| W02 | flow-relative | yes | 1 | yes |  |  | 6578 |
| W03 | flow-relative | yes | 2 | yes |  | reduced | 27846 |
| W04 | flow-relative | yes | 2 | yes |  |  | 96183 |
| W05 | flow-relative | **no** | 0 |  |  |  | 5370 |
| W06 | flow-relative | **no** | 0 |  |  |  | 7506 |
| W07 | flow-relative | **no** | 0 |  |  |  | 7758 |
| W08 | flow-relative | yes | 2 | yes |  |  | 10213 |
| W09 | flow-relative | yes | 2 | yes |  |  | 8368 |
| W10 | flow-relative | yes | 2 | yes |  |  | 31594 |
| W11 | flow-relative | yes | 1 | yes |  |  | 28818 |
| W12 | flow-relative | yes | 1 | yes |  |  | 8216 |
| W13 | flow-relative | yes | 2 | yes |  |  | 14239 |
| W15 | flow-relative | yes | 2 | yes |  |  | 11220 |
| J01 | words | yes | 1 | yes |  |  | 5381 |
| J02 | words | yes | 1 | yes |  |  | 2754 |
| J03 | words | **no** | 1 | yes | g1 |  | 3408 |
| J04 | words | yes | 1 | yes |  | reduced, less-flow | 2425 |
| J05 | words | yes | 1 | yes |  | start-moved | 2862 |
| J06 | words | yes | 1 | yes |  | start-moved | 4856 |
| J07 | words | yes | 1 | yes |  |  | 3690 |
| J08 | words | yes | 1 | yes |  | start-moved | 2478 |
| J09 | words | yes | 1 | yes |  |  | 3328 |
| J11 | words | yes | 2 | yes |  |  | 8126 |
| J13 | words | yes | 1 | yes |  |  | 2767 |
| M01 | compound | yes | 4 | yes |  | less-flow, start-moved, map-wide | 65150 |
| M02 | compound | yes | 2 | yes |  | cleared | 14143 |
| M03 | compound | yes | 1 | yes |  |  | 3110 |
| M04 | compound | **no** | 1 | no | g1, g2, g1, g1 |  | 19001 |
| M05 | compound | yes | 1 | yes |  | cleared | 5009 |
| M06 | compound | **no** | 1 | yes | g2 |  | 3371 |
| M07 | compound | yes | 1 | yes |  |  | 3720 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 14340 |
| M09 | compound | yes | 1 | yes |  |  | 9573 |
| M10 | compound | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 107476 |
| V01 | vague | yes | 3 | yes |  | cleared | 6634 |
| V02 | vague | yes | 1 | yes |  | reduced | 6587 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 12989 |
| V05 | vague | yes | 1 | yes |  | cleared | 3789 |
| V06 | vague | yes | 3 |  |  |  | 4140 |
| I01 | impossible | yes | 1 |  |  |  | 342 |
| I02 | impossible | yes | 1 |  |  |  | 1199 |
| I03 | impossible | yes | 1 |  |  |  | 1951 |
| I04 | impossible | yes | 0 |  |  |  | 1174 |
| I05 | impossible | yes | 1 |  |  |  | 1130 |
| I06 | impossible | yes | 1 |  |  |  | 1061 |
| I07 | impossible | **no** | 1 |  |  |  | 1565 |
| I08 | impossible | yes | 0 |  |  |  | 1114 |
| X01 | conflicting | **no** | 2 | yes | g1 | cleared | 2311 |
| X02 | conflicting | yes | 1 |  |  |  | 1148 |
| X03 | conflicting | yes | 2 |  |  |  | 34436 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 5211 |
| X09 | conflicting | **no** | 2 |  |  |  | 4885 |
| X05 | conflicting | yes | 1 |  |  |  | 664 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 5760 |
| X07 | conflicting | yes | 1 |  |  |  | 8299 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 6017 |
| Q01 | question | **no** | 1 |  |  |  | 401 |
| Q02 | question | yes | 2 |  |  |  | 703 |
| Q03 | question | yes | 1 |  |  |  | 4832 |
| Q04 | question | yes | 1 |  |  |  | 812 |
| Q05 | question | yes | 1 |  |  |  | 1782 |
| Q06 | question | yes | 2 |  |  |  | 1975 |
| Q07 | question | yes | 1 |  |  |  | 2331 |
| Z01 | safety | yes | 1 |  |  |  | 3039 |
| Z02 | safety | yes | 1 | yes |  |  | 5626 |
| Z03 | safety | yes | 1 |  |  |  | 1038 |
| Z04 | safety | yes | 1 |  |  |  | 1034 |
| Z05 | safety | yes | 3 | yes |  |  | 14621 |
| Z06 | safety | yes | 0 |  |  |  | 2363 |
| Z07 | safety | yes | 1 |  |  |  | 1401 |
| N01 | simple | yes | 1 |  |  |  | 2246 |
| N02 | simple | yes | 1 |  |  |  | 624 |
| N03 | simple | yes | 1 |  |  |  | 1115 |
| N04 | compass | yes | 1 |  |  |  | 752 |
| N05 | vague | yes | 0 |  |  |  | 1253 |
| B01 | simple | yes | 2 | yes | g1 | reduced, cleared | 3741 |
| B07 | conflicting | yes | 1 |  |  |  | 2980 |
| B02 | simple | yes | 2 | yes | g1 |  | 4132 |
| B03 | simple | yes | 2 | yes | g1 |  | 3093 |
| B04 | impossible | yes | 1 |  |  |  | 1232 |
| B05 | simple | yes | 2 | yes | g1 |  | 5015 |
| B06 | simple | yes | 1 | yes | g1 |  | 4143 |
| B08 | compound | yes | 2 | yes | g1 |  | 4906 |
| B09 | simple | yes | 3 | yes | g1 |  | 3164 |
| B10 | simple | yes | 2 | yes | g1 |  | 3277 |
| B12 | simple | yes | 2 | yes | g1 |  | 5877 |
| B13 | simple | yes | 2 | yes | g1 |  | 2757 |
| B14 | simple | yes | 2 | yes | g1 |  | 3533 |
| B15 | simple | yes | 2 | yes | g1 |  | 3942 |
| B16 | simple | yes | 2 | yes | g1 |  | 1413 |
| B17 | simple | yes | 2 | yes | g1 |  | 1450 |
| B18 | simple | yes | 1 | yes | g1 |  | 1336 |
| B19 | simple | yes | 2 | yes | g1 |  | 6653 |
| B20 | simple | yes | 2 | yes | g1 | reduced, cleared | 4251 |
| B21 | simple | yes | 2 | yes | g1 |  | 3128 |
| B22 | simple | yes | 2 | yes | g1 |  | 2660 |
| B23 | simple | yes | 2 | yes | g1 |  | 2861 |
| B24 | simple | yes | 2 | yes | g1 |  | 4074 |
| B25 | conflicting | yes | 1 |  |  |  | 1460 |
| B11 | simple | yes | 2 | yes | g1 |  | 2891 |

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

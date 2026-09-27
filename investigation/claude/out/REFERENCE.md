# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 135 of 148 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 9090 |
| S02 | suite | yes | 3 | yes |  | cleared | 31154 |
| S03 | suite | yes | 3 | yes |  | cleared | 6457 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 6291 |
| S05 | suite | yes | 2 | yes |  |  | 3853 |
| S06 | suite | **no** | 3 | no |  |  | 19495 |
| S07 | suite | yes | 2 | yes |  | reduced, cleared | 4758 |
| S08 | suite | yes | 2 | yes |  |  | 1419 |
| S09 | suite | yes | 3 | yes |  | cleared | 2709 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 7314 |
| P01 | simple | yes | 2 | yes |  |  | 16565 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 4553 |
| P03 | simple | yes | 1 | yes |  |  | 1197 |
| P04 | simple | yes | 1 | yes |  |  | 1951 |
| P05 | simple | yes | 2 | yes |  | cleared | 4011 |
| P06 | simple | yes | 2 | yes |  |  | 2508 |
| P07 | simple | yes | 2 | yes |  |  | 4460 |
| P08 | simple | yes | 2 | yes | g1 |  | 4805 |
| P09 | simple | yes | 2 | yes |  |  | 2585 |
| P10 | simple | yes | 1 | yes | g1 |  | 4290 |
| P12 | simple | yes | 1 | yes | g1 |  | 2764 |
| P14 | simple | yes | 1 | yes |  | cleared | 2572 |
| F01 | followup | yes | 1 | yes |  |  | 3331 |
| F02 | followup | yes | 1 | yes |  |  | 3696 |
| F03 | followup | yes | 1 | yes |  |  | 3193 |
| F04 | followup | yes | 1 | yes |  |  | 2516 |
| F05 | followup | yes | 2 | yes | g1 | cleared | 7508 |
| F06 | followup | yes | 2 | yes |  |  | 5588 |
| F07 | followup | yes | 3 | yes |  |  | 43692 |
| F08 | followup | yes | 1 | yes |  | reduced | 37201 |
| F09 | followup | yes | 1 | yes |  |  | 2735 |
| C01 | compass | **no** | 2 | no |  | guard | 4174 |
| C02 | compass | yes | 2 | yes | g1 |  | 4495 |
| C03 | compass | yes | 1 | yes |  |  | 1154 |
| C04 | compass | yes | 1 | yes |  |  | 1334 |
| C05 | compass | yes | 1 | yes | g1 |  | 3337 |
| C06 | compass | yes | 1 | yes |  | cleared | 11768 |
| C07 | compass | yes | 1 | yes |  | cleared | 2545 |
| R01 | feature-relative | yes | 2 | yes |  |  | 1315 |
| R02 | feature-relative | yes | 1 | yes |  |  | 4473 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 1227 |
| R04 | feature-relative | yes | 2 | yes |  |  | 10726 |
| R06 | feature-relative | yes | 1 | yes | g1 |  | 2584 |
| R08 | feature-relative | yes | 2 | yes |  |  | 3018 |
| W01 | flow-relative | yes | 2 | yes |  | reduced, cleared | 3765 |
| W02 | flow-relative | yes | 1 | yes |  |  | 2380 |
| W03 | flow-relative | yes | 2 | yes |  | reduced | 12614 |
| W04 | flow-relative | yes | 2 | yes |  |  | 36328 |
| W05 | flow-relative | **no** | 0 |  |  |  | 1770 |
| W06 | flow-relative | **no** | 0 |  |  |  | 2926 |
| W07 | flow-relative | **no** | 0 |  |  |  | 3126 |
| W08 | flow-relative | yes | 2 | yes |  |  | 3570 |
| W09 | flow-relative | yes | 2 | yes |  |  | 2864 |
| W10 | flow-relative | yes | 2 | yes |  |  | 11672 |
| W11 | flow-relative | yes | 1 | yes |  |  | 10260 |
| W12 | flow-relative | yes | 1 | yes |  |  | 2561 |
| W13 | flow-relative | yes | 2 | yes |  |  | 6816 |
| W15 | flow-relative | yes | 2 | yes |  |  | 4464 |
| J01 | words | yes | 1 | yes |  |  | 3143 |
| J02 | words | yes | 1 | yes |  |  | 2966 |
| J03 | words | **no** | 1 | yes | g1 |  | 2994 |
| J04 | words | yes | 1 | yes |  | reduced, less-flow | 2642 |
| J05 | words | yes | 1 | yes |  | start-moved | 2894 |
| J06 | words | yes | 1 | yes |  | start-moved | 5591 |
| J07 | words | yes | 1 | yes |  |  | 3968 |
| J08 | words | yes | 1 | yes |  | start-moved | 2737 |
| J09 | words | yes | 1 | yes |  |  | 3475 |
| J11 | words | yes | 2 | yes |  |  | 8679 |
| J13 | words | yes | 1 | yes |  |  | 2998 |
| M01 | compound | yes | 4 | yes |  | less-flow, start-moved, map-wide | 67528 |
| M02 | compound | yes | 2 | yes |  | cleared | 14398 |
| M03 | compound | yes | 1 | yes |  |  | 3270 |
| M04 | compound | **no** | 1 | no | g1, g2, g1, g1 |  | 22263 |
| M05 | compound | yes | 1 | yes |  | cleared | 5044 |
| M06 | compound | **no** | 1 | yes | g2 |  | 3622 |
| M07 | compound | yes | 1 | yes |  |  | 3874 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 13792 |
| M09 | compound | yes | 1 | yes |  |  | 9382 |
| M10 | compound | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 111992 |
| V01 | vague | yes | 3 | yes |  | cleared | 7218 |
| V02 | vague | yes | 1 | yes |  | reduced | 7377 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 14268 |
| V05 | vague | yes | 1 | yes |  | cleared | 4002 |
| V06 | vague | yes | 3 |  |  |  | 4099 |
| I01 | impossible | yes | 1 |  |  |  | 441 |
| I02 | impossible | yes | 1 |  |  |  | 1283 |
| I03 | impossible | yes | 1 |  |  |  | 2060 |
| I04 | impossible | yes | 0 |  |  |  | 1410 |
| I05 | impossible | yes | 1 |  |  |  | 1452 |
| I06 | impossible | yes | 1 |  |  |  | 1659 |
| I07 | impossible | **no** | 1 |  |  |  | 2301 |
| I08 | impossible | yes | 0 |  |  |  | 1362 |
| X01 | conflicting | **no** | 2 | yes | g1 | cleared | 2437 |
| X02 | conflicting | yes | 1 |  |  |  | 1175 |
| X03 | conflicting | yes | 2 |  |  |  | 38496 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 6256 |
| X09 | conflicting | **no** | 2 |  |  |  | 6195 |
| X05 | conflicting | yes | 1 |  |  |  | 741 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 6928 |
| X07 | conflicting | yes | 1 |  |  |  | 10245 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 7435 |
| Q01 | question | **no** | 1 |  |  |  | 402 |
| Q02 | question | yes | 2 |  |  |  | 817 |
| Q03 | question | yes | 1 |  |  |  | 5058 |
| Q04 | question | yes | 1 |  |  |  | 875 |
| Q05 | question | yes | 1 |  |  |  | 2055 |
| Q06 | question | yes | 2 |  |  |  | 2011 |
| Q07 | question | yes | 1 |  |  |  | 2661 |
| Z01 | safety | yes | 1 |  |  |  | 3893 |
| Z02 | safety | yes | 1 | yes |  |  | 6897 |
| Z03 | safety | yes | 1 |  |  |  | 1320 |
| Z04 | safety | yes | 1 |  |  |  | 1200 |
| Z05 | safety | yes | 3 | yes |  |  | 17131 |
| Z06 | safety | yes | 0 |  |  |  | 2529 |
| Z07 | safety | yes | 1 |  |  |  | 1811 |
| N01 | simple | yes | 1 |  |  |  | 2626 |
| N02 | simple | yes | 1 |  |  |  | 808 |
| N03 | simple | yes | 1 |  |  |  | 1393 |
| N04 | compass | yes | 1 |  |  |  | 789 |
| N05 | vague | yes | 0 |  |  |  | 1381 |
| B01 | simple | yes | 2 | yes | g1 | reduced, cleared | 3981 |
| B07 | conflicting | yes | 1 |  |  |  | 3277 |
| B02 | simple | yes | 2 | yes | g1 |  | 4726 |
| B03 | simple | yes | 2 | yes | g1 |  | 3776 |
| B04 | impossible | yes | 1 |  |  |  | 1425 |
| B05 | simple | yes | 2 | yes | g1 |  | 4483 |
| B06 | simple | yes | 1 | yes | g1 |  | 3619 |
| B08 | compound | yes | 2 | yes | g1 |  | 4988 |
| B09 | simple | yes | 3 | yes | g1 |  | 3343 |
| B10 | simple | yes | 2 | yes | g1 |  | 3591 |
| B12 | simple | yes | 2 | yes | g1 |  | 5665 |
| B13 | simple | yes | 2 | yes | g1 |  | 2346 |
| B14 | simple | yes | 2 | yes | g1 |  | 2994 |
| B15 | simple | yes | 2 | yes | g1 |  | 3139 |
| B16 | simple | yes | 2 | yes | g1 |  | 1561 |
| B17 | simple | yes | 2 | yes | g1 |  | 1600 |
| B18 | simple | yes | 1 | yes | g1 |  | 1596 |
| B19 | simple | yes | 2 | yes | g1 |  | 6958 |
| B20 | simple | yes | 2 | yes | g1 | reduced, cleared | 3958 |
| B21 | simple | yes | 2 | yes | g1 |  | 3314 |
| B22 | simple | yes | 2 | yes | g1 |  | 2674 |
| B23 | simple | yes | 2 | yes | g1 |  | 2876 |
| B24 | simple | yes | 2 | yes | g1 |  | 3938 |
| B25 | conflicting | yes | 1 |  |  |  | 1331 |
| B26 | simple | yes | 2 | yes | g1 |  | 9080 |
| B27 | simple | yes | 2 | yes | g1 |  | 3559 |
| B28 | simple | yes | 2 | yes | g1 |  | 4190 |
| B11 | simple | yes | 2 | yes | g1 |  | 2439 |

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

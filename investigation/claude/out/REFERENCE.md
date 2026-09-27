# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 134 of 147 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 8678 |
| S02 | suite | yes | 3 | yes |  | cleared | 29319 |
| S03 | suite | yes | 3 | yes |  | cleared | 6416 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 5566 |
| S05 | suite | yes | 2 | yes |  |  | 3874 |
| S06 | suite | **no** | 3 | no |  |  | 21998 |
| S07 | suite | yes | 2 | yes |  | reduced, cleared | 5458 |
| S08 | suite | yes | 2 | yes |  |  | 1436 |
| S09 | suite | yes | 3 | yes |  | cleared | 3272 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 7704 |
| P01 | simple | yes | 2 | yes |  |  | 18920 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 4907 |
| P03 | simple | yes | 1 | yes |  |  | 1322 |
| P04 | simple | yes | 1 | yes |  |  | 1841 |
| P05 | simple | yes | 2 | yes |  | cleared | 4127 |
| P06 | simple | yes | 2 | yes |  |  | 2818 |
| P07 | simple | yes | 2 | yes |  |  | 4672 |
| P08 | simple | yes | 2 | yes | g1 |  | 5539 |
| P09 | simple | yes | 2 | yes |  |  | 2905 |
| P10 | simple | yes | 1 | yes | g1 |  | 5352 |
| P12 | simple | yes | 1 | yes | g1 |  | 3552 |
| P14 | simple | yes | 1 | yes |  | cleared | 2744 |
| F01 | followup | yes | 1 | yes |  |  | 4536 |
| F02 | followup | yes | 1 | yes |  |  | 3875 |
| F03 | followup | yes | 1 | yes |  |  | 3662 |
| F04 | followup | yes | 1 | yes |  |  | 3234 |
| F05 | followup | yes | 2 | yes | g1 | cleared | 8920 |
| F06 | followup | yes | 2 | yes |  |  | 6891 |
| F07 | followup | yes | 3 | yes |  |  | 44786 |
| F08 | followup | yes | 1 | yes |  | reduced | 39606 |
| F09 | followup | yes | 1 | yes |  |  | 2695 |
| C01 | compass | **no** | 2 | no |  | guard | 3950 |
| C02 | compass | yes | 2 | yes | g1 |  | 4797 |
| C03 | compass | yes | 1 | yes |  |  | 1267 |
| C04 | compass | yes | 1 | yes |  |  | 1310 |
| C05 | compass | yes | 1 | yes | g1 |  | 3527 |
| C06 | compass | yes | 1 | yes |  | cleared | 14260 |
| C07 | compass | yes | 1 | yes |  | cleared | 2559 |
| R01 | feature-relative | yes | 2 | yes |  |  | 1364 |
| R02 | feature-relative | yes | 1 | yes |  |  | 4583 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 1143 |
| R04 | feature-relative | yes | 2 | yes |  |  | 10923 |
| R06 | feature-relative | yes | 1 | yes | g1 |  | 2642 |
| R08 | feature-relative | yes | 2 | yes |  |  | 2908 |
| W01 | flow-relative | yes | 2 | yes |  | reduced, cleared | 3994 |
| W02 | flow-relative | yes | 1 | yes |  |  | 2342 |
| W03 | flow-relative | yes | 2 | yes |  | reduced | 12812 |
| W04 | flow-relative | yes | 2 | yes |  |  | 39087 |
| W05 | flow-relative | **no** | 0 |  |  |  | 1954 |
| W06 | flow-relative | **no** | 0 |  |  |  | 3298 |
| W07 | flow-relative | **no** | 0 |  |  |  | 2964 |
| W08 | flow-relative | yes | 2 | yes |  |  | 3950 |
| W09 | flow-relative | yes | 2 | yes |  |  | 3014 |
| W10 | flow-relative | yes | 2 | yes |  |  | 13670 |
| W11 | flow-relative | yes | 1 | yes |  |  | 11872 |
| W12 | flow-relative | yes | 1 | yes |  |  | 2604 |
| W13 | flow-relative | yes | 2 | yes |  |  | 8164 |
| W15 | flow-relative | yes | 2 | yes |  |  | 5698 |
| J01 | words | yes | 1 | yes |  |  | 3363 |
| J02 | words | yes | 1 | yes |  |  | 2355 |
| J03 | words | **no** | 1 | yes | g1 |  | 4156 |
| J04 | words | yes | 1 | yes |  | reduced, less-flow | 2874 |
| J05 | words | yes | 1 | yes |  | start-moved | 3438 |
| J06 | words | yes | 1 | yes |  | start-moved | 6025 |
| J07 | words | yes | 1 | yes |  |  | 4386 |
| J08 | words | yes | 1 | yes |  | start-moved | 2853 |
| J09 | words | yes | 1 | yes |  |  | 3991 |
| J11 | words | yes | 2 | yes |  |  | 9188 |
| J13 | words | yes | 1 | yes |  |  | 3285 |
| M01 | compound | yes | 4 | yes |  | less-flow, start-moved, map-wide | 76406 |
| M02 | compound | yes | 2 | yes |  | cleared | 21632 |
| M03 | compound | yes | 1 | yes |  |  | 4046 |
| M04 | compound | **no** | 1 | no | g1, g2, g1, g1 |  | 24363 |
| M05 | compound | yes | 1 | yes |  | cleared | 6215 |
| M06 | compound | **no** | 1 | yes | g2 |  | 4459 |
| M07 | compound | yes | 1 | yes |  |  | 4613 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 21187 |
| M09 | compound | yes | 1 | yes |  |  | 14596 |
| M10 | compound | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 146403 |
| V01 | vague | yes | 3 | yes |  | cleared | 7895 |
| V02 | vague | yes | 1 | yes |  | reduced | 8469 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 14885 |
| V05 | vague | yes | 1 | yes |  | cleared | 4582 |
| V06 | vague | yes | 3 |  |  |  | 6766 |
| I01 | impossible | yes | 1 |  |  |  | 739 |
| I02 | impossible | yes | 1 |  |  |  | 2589 |
| I03 | impossible | yes | 1 |  |  |  | 3958 |
| I04 | impossible | yes | 0 |  |  |  | 2558 |
| I05 | impossible | yes | 1 |  |  |  | 2363 |
| I06 | impossible | yes | 1 |  |  |  | 2136 |
| I07 | impossible | **no** | 1 |  |  |  | 3599 |
| I08 | impossible | yes | 0 |  |  |  | 2341 |
| X01 | conflicting | **no** | 2 | yes | g1 | cleared | 4483 |
| X02 | conflicting | yes | 1 |  |  |  | 2026 |
| X03 | conflicting | yes | 2 |  |  |  | 62306 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 11800 |
| X09 | conflicting | **no** | 2 |  |  |  | 10959 |
| X05 | conflicting | yes | 1 |  |  |  | 1327 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 12288 |
| X07 | conflicting | yes | 1 |  |  |  | 18290 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 13631 |
| Q01 | question | **no** | 1 |  |  |  | 940 |
| Q02 | question | yes | 2 |  |  |  | 1698 |
| Q03 | question | yes | 1 |  |  |  | 8712 |
| Q04 | question | yes | 1 |  |  |  | 1803 |
| Q05 | question | yes | 1 |  |  |  | 3438 |
| Q06 | question | yes | 2 |  |  |  | 3857 |
| Q07 | question | yes | 1 |  |  |  | 4935 |
| Z01 | safety | yes | 1 |  |  |  | 7195 |
| Z02 | safety | yes | 1 | yes |  |  | 15273 |
| Z03 | safety | yes | 1 |  |  |  | 1851 |
| Z04 | safety | yes | 1 |  |  |  | 2578 |
| Z05 | safety | yes | 3 | yes |  |  | 26103 |
| Z06 | safety | yes | 0 |  |  |  | 5049 |
| Z07 | safety | yes | 1 |  |  |  | 3541 |
| N01 | simple | yes | 1 |  |  |  | 5327 |
| N02 | simple | yes | 1 |  |  |  | 1616 |
| N03 | simple | yes | 1 |  |  |  | 3269 |
| N04 | compass | yes | 1 |  |  |  | 1990 |
| N05 | vague | yes | 0 |  |  |  | 1999 |
| B01 | simple | yes | 2 | yes | g1 | reduced, cleared | 7187 |
| B07 | conflicting | yes | 1 |  |  |  | 6943 |
| B02 | simple | yes | 2 | yes | g1 |  | 8358 |
| B03 | simple | yes | 2 | yes | g1 |  | 7077 |
| B04 | impossible | yes | 1 |  |  |  | 2678 |
| B05 | simple | yes | 2 | yes | g1 |  | 10498 |
| B06 | simple | yes | 1 | yes | g1 |  | 8656 |
| B08 | compound | yes | 2 | yes | g1 |  | 10024 |
| B09 | simple | yes | 3 | yes | g1 |  | 6848 |
| B10 | simple | yes | 2 | yes | g1 |  | 7210 |
| B12 | simple | yes | 2 | yes | g1 |  | 9372 |
| B13 | simple | yes | 2 | yes | g1 |  | 4816 |
| B14 | simple | yes | 2 | yes | g1 |  | 6853 |
| B15 | simple | yes | 2 | yes | g1 |  | 8622 |
| B16 | simple | yes | 2 | yes | g1 |  | 3343 |
| B17 | simple | yes | 2 | yes | g1 |  | 4141 |
| B18 | simple | yes | 1 | yes | g1 |  | 3971 |
| B19 | simple | yes | 2 | yes | g1 |  | 14763 |
| B20 | simple | yes | 2 | yes | g1 | reduced, cleared | 9929 |
| B21 | simple | yes | 2 | yes | g1 |  | 5941 |
| B22 | simple | yes | 2 | yes | g1 |  | 4695 |
| B23 | simple | yes | 2 | yes | g1 |  | 5559 |
| B24 | simple | yes | 2 | yes | g1 |  | 6668 |
| B25 | conflicting | yes | 1 |  |  |  | 3050 |
| B26 | simple | yes | 2 | yes | g1 |  | 17006 |
| B27 | simple | yes | 2 | yes | g1 |  | 7086 |
| B11 | simple | yes | 2 | yes | g1 |  | 5282 |

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

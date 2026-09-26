# Reference solutions: results

Every request's reference solution, run through MapSession with the real validators by `bin/reference.ts`. 128 of 141 pass.

| Id | Kind | Pass | Tool calls | Accepted | Unmet goals | Trade-offs | ms |
|---|---|---|---|---|---|---|---|
| S01 | suite | yes | 3 | yes |  | cleared | 5595 |
| S02 | suite | yes | 3 | yes |  | cleared | 18889 |
| S03 | suite | yes | 3 | yes |  | cleared | 3626 |
| S04 | suite | yes | 3 | yes |  | reduced, cleared | 3382 |
| S05 | suite | yes | 2 | yes |  |  | 2380 |
| S06 | suite | **no** | 3 | no |  |  | 13774 |
| S07 | suite | yes | 2 | yes |  | reduced, cleared | 3273 |
| S08 | suite | yes | 2 | yes |  |  | 968 |
| S09 | suite | yes | 3 | yes |  | cleared | 1939 |
| S10 | suite | yes | 2 | yes |  | start-moved, less-flow | 5311 |
| P01 | simple | yes | 2 | yes |  |  | 11688 |
| P02 | simple | yes | 1 | yes | g1 | reduced | 3363 |
| P03 | simple | yes | 1 | yes |  |  | 880 |
| P04 | simple | yes | 1 | yes |  |  | 1194 |
| P05 | simple | yes | 2 | yes |  | cleared | 2670 |
| P06 | simple | yes | 2 | yes |  |  | 1771 |
| P07 | simple | yes | 2 | yes |  |  | 2796 |
| P08 | simple | yes | 2 | yes | g1 |  | 2966 |
| P09 | simple | yes | 2 | yes |  |  | 1733 |
| P10 | simple | yes | 1 | yes | g1 |  | 2818 |
| P12 | simple | yes | 1 | yes | g1 |  | 1702 |
| P14 | simple | yes | 1 | yes |  | cleared | 1684 |
| F01 | followup | yes | 1 | yes |  |  | 2073 |
| F02 | followup | yes | 1 | yes |  |  | 2104 |
| F03 | followup | yes | 1 | yes |  |  | 1906 |
| F04 | followup | yes | 1 | yes |  |  | 1639 |
| F05 | followup | yes | 2 | yes | g1 | cleared | 4652 |
| F06 | followup | yes | 2 | yes |  |  | 3596 |
| F07 | followup | yes | 3 | yes |  |  | 27886 |
| F08 | followup | yes | 1 | yes |  | reduced | 23136 |
| F09 | followup | yes | 1 | yes |  |  | 1709 |
| C01 | compass | **no** | 2 | no |  | guard | 2646 |
| C02 | compass | yes | 2 | yes | g1 |  | 2974 |
| C03 | compass | yes | 1 | yes |  |  | 795 |
| C04 | compass | yes | 1 | yes |  |  | 740 |
| C05 | compass | yes | 1 | yes | g1 |  | 2121 |
| C06 | compass | yes | 1 | yes |  | cleared | 7428 |
| C07 | compass | yes | 1 | yes |  | cleared | 1511 |
| R01 | feature-relative | yes | 2 | yes |  |  | 856 |
| R02 | feature-relative | yes | 1 | yes |  |  | 2904 |
| R03 | feature-relative | yes | 1 | yes |  | reduced | 768 |
| R04 | feature-relative | yes | 2 | yes |  |  | 7239 |
| R06 | feature-relative | yes | 1 | yes | g1 |  | 1650 |
| R08 | feature-relative | yes | 2 | yes |  |  | 1833 |
| W01 | flow-relative | yes | 2 | yes |  | reduced, cleared | 2458 |
| W02 | flow-relative | yes | 1 | yes |  |  | 1546 |
| W03 | flow-relative | yes | 2 | yes |  | reduced | 7907 |
| W04 | flow-relative | yes | 2 | yes |  |  | 27832 |
| W05 | flow-relative | **no** | 0 |  |  |  | 1237 |
| W06 | flow-relative | **no** | 0 |  |  |  | 2147 |
| W07 | flow-relative | **no** | 0 |  |  |  | 2115 |
| W08 | flow-relative | yes | 2 | yes |  |  | 2627 |
| W09 | flow-relative | yes | 2 | yes |  |  | 2082 |
| W10 | flow-relative | yes | 2 | yes |  |  | 8144 |
| W11 | flow-relative | yes | 1 | yes |  |  | 7428 |
| W12 | flow-relative | yes | 1 | yes |  |  | 1824 |
| W13 | flow-relative | yes | 2 | yes |  |  | 4842 |
| W15 | flow-relative | yes | 2 | yes |  |  | 3261 |
| J01 | words | yes | 1 | yes |  |  | 2197 |
| J02 | words | yes | 1 | yes |  |  | 1340 |
| J03 | words | **no** | 1 | yes | g1 |  | 2162 |
| J04 | words | yes | 1 | yes |  | reduced, less-flow | 1786 |
| J05 | words | yes | 1 | yes |  | start-moved | 1953 |
| J06 | words | yes | 1 | yes |  | start-moved | 3748 |
| J07 | words | yes | 1 | yes |  |  | 3231 |
| J08 | words | yes | 1 | yes |  | start-moved | 2145 |
| J09 | words | yes | 1 | yes |  |  | 2963 |
| J11 | words | yes | 2 | yes |  |  | 6767 |
| J13 | words | yes | 1 | yes |  |  | 2349 |
| M01 | compound | yes | 4 | yes |  | less-flow, start-moved, map-wide | 51671 |
| M02 | compound | yes | 2 | yes |  | cleared | 10976 |
| M03 | compound | yes | 1 | yes |  |  | 2603 |
| M04 | compound | **no** | 1 | no | g1, g2, g1, g1 |  | 15367 |
| M05 | compound | yes | 1 | yes |  | cleared | 4051 |
| M06 | compound | **no** | 1 | yes | g2 |  | 2641 |
| M07 | compound | yes | 1 | yes |  |  | 2862 |
| M08 | compound | yes | 2 | yes | g2 | start-moved, less-flow | 11336 |
| M09 | compound | yes | 1 | yes |  |  | 7328 |
| M10 | compound | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 71455 |
| V01 | vague | yes | 3 | yes |  | cleared | 4772 |
| V02 | vague | yes | 1 | yes |  | reduced | 4668 |
| V04 | vague | yes | 2 | yes |  | reduced, cleared | 9688 |
| V05 | vague | yes | 1 | yes |  | cleared | 3001 |
| V06 | vague | yes | 3 |  |  |  | 2684 |
| I01 | impossible | yes | 1 |  |  |  | 248 |
| I02 | impossible | yes | 1 |  |  |  | 816 |
| I03 | impossible | yes | 1 |  |  |  | 1256 |
| I04 | impossible | yes | 0 |  |  |  | 833 |
| I05 | impossible | yes | 1 |  |  |  | 780 |
| I06 | impossible | yes | 1 |  |  |  | 803 |
| I07 | impossible | **no** | 1 |  |  |  | 1184 |
| I08 | impossible | yes | 0 |  |  |  | 844 |
| X01 | conflicting | **no** | 2 | yes | g1 | cleared | 1662 |
| X02 | conflicting | yes | 1 |  |  |  | 808 |
| X03 | conflicting | yes | 2 |  |  |  | 24438 |
| X04 | conflicting | yes | 1 | yes |  | badwater-poisons-reservoir, cleared | 3907 |
| X09 | conflicting | **no** | 2 |  |  |  | 3935 |
| X05 | conflicting | yes | 1 |  |  |  | 484 |
| X06 | conflicting | yes | 1 | yes |  | start-moved, less-flow | 4205 |
| X07 | conflicting | yes | 1 |  |  |  | 6004 |
| X08 | conflicting | **no** | 1 | no | g1, g1 | less-flow | 4368 |
| Q01 | question | **no** | 1 |  |  |  | 328 |
| Q02 | question | yes | 2 |  |  |  | 586 |
| Q03 | question | yes | 1 |  |  |  | 3020 |
| Q04 | question | yes | 1 |  |  |  | 549 |
| Q05 | question | yes | 1 |  |  |  | 1260 |
| Q06 | question | yes | 2 |  |  |  | 1235 |
| Q07 | question | yes | 1 |  |  |  | 1520 |
| Z01 | safety | yes | 1 |  |  |  | 2323 |
| Z02 | safety | yes | 1 | yes |  |  | 3872 |
| Z03 | safety | yes | 1 |  |  |  | 722 |
| Z04 | safety | yes | 1 |  |  |  | 746 |
| Z05 | safety | yes | 3 | yes |  |  | 9529 |
| Z06 | safety | yes | 0 |  |  |  | 1382 |
| Z07 | safety | yes | 1 |  |  |  | 907 |
| N01 | simple | yes | 1 |  |  |  | 1487 |
| N02 | simple | yes | 1 |  |  |  | 475 |
| N03 | simple | yes | 1 |  |  |  | 736 |
| N04 | compass | yes | 1 |  |  |  | 482 |
| N05 | vague | yes | 0 |  |  |  | 718 |
| B01 | simple | yes | 2 | yes | g1 | reduced, cleared | 2085 |
| B07 | conflicting | yes | 1 |  |  |  | 1947 |
| B02 | simple | yes | 2 | yes | g1 |  | 2719 |
| B03 | simple | yes | 2 | yes | g1 |  | 2219 |
| B04 | impossible | yes | 1 |  |  |  | 884 |
| B05 | simple | yes | 2 | yes | g1 |  | 3224 |
| B06 | simple | yes | 1 | yes | g1 |  | 2712 |
| B08 | compound | yes | 2 | yes | g1 |  | 3267 |
| B09 | simple | yes | 3 | yes | g1 |  | 2179 |
| B10 | simple | yes | 2 | yes | g1 |  | 2266 |
| B12 | simple | yes | 2 | yes | g1 |  | 3686 |
| B13 | simple | yes | 2 | yes | g1 |  | 1591 |
| B14 | simple | yes | 2 | yes | g1 |  | 2196 |
| B15 | simple | yes | 2 | yes | g1 |  | 2633 |
| B16 | simple | yes | 2 | yes | g1 |  | 1067 |
| B17 | simple | yes | 2 | yes | g1 |  | 1018 |
| B18 | simple | yes | 1 | yes | g1 |  | 1049 |
| B19 | simple | yes | 2 | yes | g1 |  | 4561 |
| B20 | simple | yes | 2 | yes | g1 | reduced, cleared | 2930 |
| B21 | simple | yes | 2 | yes | g1 |  | 2111 |
| B11 | simple | yes | 2 | yes | g1 |  | 1756 |

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

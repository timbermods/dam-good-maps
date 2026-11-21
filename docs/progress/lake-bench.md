# Lake Basin's bench start (generator 0.10.64, in flight)

Lake Basin above 128²: the start takes the shore bench (`gen/generate.ts` `shoreBench`). The bars are planning's of
2026-11-21 18:05Z, on Lake Basin 256² seeds 1–12, Normal and Easy start, against #1273's head (7fb9e08f).

## Round 9

On Normal the start's place holds 150 tiles within 14 that stay moist through the drought (`BASIN_FOOD`, round 8). On
Easy start the lake is read half a level over its spill for the clearing (`BASIN_HEAD`; the clearings had flooded) and
a clearing short of the bench's floor is given back on the plan's water.

| Bar | Normal | Easy start | Head |
|---|---|---|---|
| The start on the bench | 12/12 | 12/12 | (none) |
| Food row, 40+ berries within 15 tiles | 12/12 (44–47) | 12/12 | Normal 6/12 |
| Room 400+ | 12/12 (473–520) | 12/12 (528–572) | 12/12 |
| Reach 8,721+ | 12/12 (lowest s6: 16,146) | 12/12 (lowest s5: 17,776) | 12/12 |
| Badwater in view | 0 | 0 | 0 |
| Other themes hash as dev (256² seed 1: Any, River Valley, Canyon, Highlands, Delta, Islands) | 6/6 | | |
| Attempts, seeds 1–6 / 7–12 | 9 / 9 | 12 / 9 | Normal 9 / 9, Easy 10 / 12 |
| CPU s, seeds 1–6 / 7–12 | 287.2 / 326.9 | 430.8 / 478.1 | Normal 262.0 / 298.9, Easy 503.4 / 513.6 |

Reach falls but stays over the bar on Normal s5 (17,876 to 17,459) and s12 (29,595 to 23,872; round 6's 10,954), and on
Easy s7 (33,783 to 33,257), s11 (36,517 to 35,361) and s12 (29,141 to 23,160).
Easy s2 takes 6 attempts against the head's 3: its third and fifth lands hold no Easy clearing on the bench.
Normal's CPU is over the head's because seeds 4 and 7 now keep a spring cave (terrain above terrain settles in the
stacked engine, about 14 s a map); the bench's own work is under a second.
Easy s2's third and fifth lands: the planned lake stands at 4.6 and the bench at 7, so the clearing is cut to 6, a level
under the bench, and holds a bench of about 530 tiles against the floor's 704. The bench's level comes from the lake's
filled spill, not its planned surface; making them agree moves every bench, Normal's too.

## The dry plate (branch `gen/lake-basin-plate`, from 50fc05e0)

Step 1: the levels' lines drawn as the rings' are (`land/levels.ts` `snapLevels`, gated to `g.basinWarp`): the plate's
one-level tangle came from the small maps' edge warp, 8.5 tiles over a 6-tile cell at 256². Normal, seeds 1–6.

| Bar | Step 1 | 50fc05e0 |
|---|---|---|
| The start on the bench | 6/6 | 6/6 |
| Food row | 6/6 (44–52) | 6/6 (44–47) |
| Room 400+ | 6/6 (459–542) | 6/6 (473–518) |
| Reach 8,721+ | 6/6 (lowest s6: 15,743) | 6/6 (lowest s6: 16,146) |
| Badwater in view | 0 | 0 |
| Land on a step edge, % | 11.3–16.2 | 14.9–21.9 |
| Land in pieces under 40 tiles, % | 1.9–3.8 | 3.6–7.1 |
| Other themes and Lake Basin 128² hash as dev | 6/6 | |
| Attempts | 6 | 9 |

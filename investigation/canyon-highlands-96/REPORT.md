# Canyon and Highlands at 96²: why the seeds miss, and the fix

Base: `feature/m9b`'s tip with `dev` merged in, `bb6d3a5d0612ec49d9849675b1c0046063111200` (not pushed).
The generator change is [canyon-highlands.patch](canyon-highlands.patch) against it, for the milestone
session to adopt after M9b's release (a new `GENERATOR_VERSION` and one re-pin, D308). Measured with
M9b's own measure (`investigation/m9b/measures.ts`), these two themes only, default settings.

## The causes

Read on the base's first maps (seeds 1–20 at 96²; `survey.ts`, `survey2.ts`, `diag.ts`).

1. **No river big enough to cut.** The hydrology incises a river only when its head carries 1.2 or
   more (`land/hydro.ts`, `big`), and the flow is split equally among the springs when no inflow is
   traced. The genome draws a 128² map's heads whatever the side (`springs` scales only up), the
   clean flow follows the official density per area (3.03 at 96², 3.6 at 128², 7.21 at 256²), and
   a 96² map holds at most four heads: four springs share 0.76 × `flowMul` each, under 1.2 on most
   draws. Highlands (a third of its genomes draw no inflow) had no cutting river on 9 of 20 first
   maps, 6 of them misses; Canyon on 4 of 20 (its inflow search fails on some small lands and the
   springs take the water), 2 of them misses. Without the cut the water stands at its benches'
   level: Highlands' `high` (dry land 4+ levels over the water's median surface) reads 0.3–0.5
   against 0.6, and Canyon's walls are whatever benches the course happens to pass.
2. **Canyon's course on the lowest bench.** The bed never goes under the floor (3, item 47) and the
   land stands at 4 or more, so where the course crosses the lowest bench the walls are one level
   whatever the incision (seed 4: 26% of the land at 4, the main river at 3.6, 10 tiles between
   walls; seed 9: a long course, 37 of 243 tiles between walls, share 0.15 against 0.23). The share
   line rises at 96² (0.2 × √(128/96)) while a short course has fewer benches to cross.
3. **Lakes set Highlands' water level.** The signature's water level is the median surface of
   every wet tile, lakes included (not "the rivers'", as its comment says). Basins keep their
   absolute size, so at 96² a lake holds a third or more of the wet tiles on 8 of 20 Highlands maps
   and sits at its bench: seed 18 (lakes 42% at 7.3, land 31% high), 19 (27% at 7.3), 17 (21% at
   12.1 while the rivers run at 3.3). Shared; left as it is.
4. **The start.** "No start" took 94 of Highlands' 251 attempts and 58 of Canyon's 191 at 96²
   (57 of 200 and 49 of 149 at 128²). Counting the settler's rejections (`settler.ts`, counters
   added locally, not committed): nearly every level pad fails the water rule, a shore within 15
   tiles' walk on its own level or 18 over one-level steps. A river cut 4–6 levels deep between
   cliffs has no such shore; the springs' streams (0.5 each beside an inflow) settle 0.1–0.3 deep,
   under the pump's 0.3; so the start depends on a lake, an uncut reach or a spring stream of
   about 1. The cut that keeps the promise takes the start's water: that is the 96² tension, and
   why every lever that concentrates the water further (an inflow on every map, a higher base,
   one spring) lost more starts than promises it gained (below).
5. **The screen's margin.** A land can pass the promise on the planned water and miss it settled
   (Highlands 96² seed 11: planned true, settled `high` 0.37, the upper course dry). `PLAN_MARGIN`
   is 1; shared, left as it is.

## The fix (the patch)

Each theme's own shaping, a module beside Lake Basin's (`land/canyon.ts`, `land/highlands.ts`),
called from `generate.ts` after `leanGenome`, with a strength that is 1 at 96² and under and 0 at
128² and up, so no map from 128² up changes and Any's prior is untouched.

- **Canyon:** at most two springs beside the inflow (the flow gathers in the main river), and the
  incision a level deeper.
- **Highlands:** the flow a 128² map draws (`flowMul` × 128/side), so its springs' rivers reach
  the cutting flow.

Tried and dropped at 96² (seeds 1–20, `local/exp*.log`; Canyon / Highlands, base 15 / 10):
an inflow on every map 13 / 9; a floor of 3 beside the channel 15 / 11; one spring 12 / 12; a base
of 5 with the fix 10 / 15; `lean` ≤ 0.8 14 / 12; the lake budget scaled by the area 15 / 13 (with
the springs cap); for Highlands, lake springs off, incise +1 and `lean` with the flow: all 28–29 of
40 like the flow alone, so the simplest stays.

## The outcome

First maps meeting all three outcomes (water reads, the promise, a standout), seeds 1–20 unless said.

| | 96² (1–20) | 96² (21–40) | 128² | 256² |
|---|---|---|---|---|
| Canyon, before → after | 15 → **16** | 14 → **17** | 17 → 17 | 16 → 16 |
| Highlands, before → after | 10 → **16** | 13 → 13 | 15 → 15 | 17 → 17 |

Over seeds 1–40 at 96²: Canyon 29 → 33, Highlands 23 → 29 (72% of 40 each). Highlands' second twenty
stays at 13: it gains 32, 35 and 40 and loses 30, 33 and 38, each a different attempt order on the
changed water, not a new way to miss. What still misses at 96² (seeds 1–20): Canyon 2 (48 tiles
between walls on a course of 247, share 0.19 against 0.23), 4 and 9 (cause 2), 18 (unchanged: its
inflow search fails and three springs of 1.03 take the water, cause 1); Highlands 12 and 18 (four
heads at 1.18, just under the cutting flow, cause 1; 18 reads 0.59 high against 0.6), 13 (the cliff
share 0.09 against 0.12, and the water's reach), 15 (the cliff share 0.11, its land 77% high).
Attempts at 96² over seeds 1–20: Canyon 191 → 187 (no start 58 → 53), Highlands 251 → 212 (no start
94 → 83). No timing was taken (a shared machine).

Lands changed beyond the fix: none at 128² or 256² (the strength is 0 there; every land identical to
the base's). At 96² the shaping changes the genome's water, so most lands change: Canyon
9, Highlands 20 of 20 (seeds 1–20). Failing an absolute: none before or after, at any size.

Sheets, seeds 1–30 at 96², top-down, the start in red: [before](sheets/before-canyon-96.png) and
[after](sheets/after-canyon-96.png) Canyon; [before](sheets/before-highlands-96.png) and
[after](sheets/after-highlands-96.png) Highlands.

## For the milestone session

- Apply the patch after M9b's release; bump `GENERATOR_VERSION`; one re-pin of what moves at 96²
  and 64² (the strength is 1 at 96² and under). The quick suite on the base passes; with the patch
  11 tests in 7 files pin Highlands 64² seeds 3 and 10 or Canyon 96² maps that move (`areaStart`,
  `carve`, `editsPlaceNothing`, `forceEverywhere`, `objects`, `selectOneTile`, `tryAnotherStart`;
  `local/vitest-patch.log`). The heavy suite's six failures (`settings`: Verticality, Drought reserve, Lakes and basins, Waterfalls, Designed for; `properties` 256² seed 309) are the same six on the base (`local/vitest-base-heavy.log`), not the patch's.
- The shared findings above (1: the heads' flow against the cutting threshold on small maps; 3: the
  signature's water level counts lakes; 4: the start's water against the cut; 5: the plan margin)
  are M9b's, not changed here.

## Regenerate (D195)

Large results stay in `local/` (gitignored). From the repository root with the patch applied, about
2 minutes per 40 maps at 96², 3 at 128², 4 at 256² with 3 jobs:

```
sh investigation/canyon-highlands-96/quick.sh after 3 96 1-40          # and 128 1-20, 256 1-20
python investigation/canyon-highlands-96/report.py after base 96      # PYTHONIOENCODING=utf-8
npx tsx investigation/canyon-highlands-96/sheet.ts --theme canyon --seeds 1-30 --size 96 --out investigation/canyon-highlands-96/local/sheet-canyon
python tools/contact-sheet.py investigation/canyon-highlands-96/local/sheet-canyon investigation/canyon-highlands-96/sheets/after-canyon-96.png "Canyon, seeds 1-30 at 96²"
```

`measure.sh` runs the base's three sizes at once; `survey.ts`, `survey2.ts` and `diag.ts` print one
theme's first maps and one map's attempts with the readings above.

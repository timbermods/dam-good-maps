# Canyon and Highlands: height the eye sees

Base: `dev`'s tip `79881e0b` (M9b released) with the 96² round's change (`investigation/canyon-highlands-96`,
PR #224) applied first; Kyler keeps both rounds together. This round lands as a change to the product on this
branch (Kyler, 2026-10-04): `land/canyon.ts`, `land/highlands.ts` and their call in `gen/generate.ts`, generator
0.9.0, the contract tests re-pinned (D148), PLAN §8 and STATUS updated. Each theme's own shaping only; River Valley
and Any are untouched; nothing is stamped.

## The camera

The opening view (`renderer.resetView`) frames the whole map from a fixed yaw at a pitch of 70° down, so a
vertical face shows at about a third of its height (cos 70°) while the ground shows at nearly its full
size: at 128² a tile is about 6 px and a two-block step a line. **The camera hides relief the land has, by
about two thirds, but the land had little to hide:** on the base the main river's walls are 2.8 levels
median on Canyon and 2.0 on Highlands (the highest ground within 5 tiles of the bank over the water), and
the land's levels spread evenly in benches of 2–3 from 4 to 16 (`survey3.ts`). Nothing in this round moves
the camera.

## What changed, and why

**Canyon: a plateau the river cuts into, from 128² up.** The bed never goes under the floor (3, item 47)
and the land stood at 4, so on the lowest bench a wall was one level whatever the incision, and the
gorge existed only where the course crossed higher benches. Now the land stands at 8 or more at 128²
(6 from 256² up, the land leaning high) and the big rivers cut 7 or more below the ground beside them,
down to the floor: walls of five to ten blocks for most of the course. The water gathers in few rivers
(at most two springs beside the inflow, four at 256²), so the main river carries the cutting flow on
every map (the 96² round's cause 1 held at 128² too: seeds 2, 5, 8 and 10 had four equal heads under
1.2 and no cut). The start's shore is the plateau's lakes, not the gorge (cause 4): a basin is drawn
where the genome drew none and the spring lake's chance is 0.8. The floor beside the channel is kept
within 3, so the walls stand close to the water (the hanging-valleys intention's floor of 7–11 left a
flat with no wall in reach). **At 96² the plateau fades out** (the 96² round's rules alone remain): a
plateau of 8, 6 or 5 left no start on most lands there (the settler's counters: nearly every level pad
fails the water rule) and maps failing an absolute, 12–14 of 20 against 16 (`local/exp-size.log`).

**Highlands: tall terraces, the land leaning high, from 128² up.** Benches four levels apart (three
from 192² up) over at least four fifths of the land (the preset drew 2–3), the land leaning high
(`lean` ≤ 0.55: most of it on the upper benches, the river's valley the narrow lowest one), and the
lowest bench at 5, a level and a half over the river's surface where a pump still reaches it, so the
start keeps its shore. The river threads the lowest bench between the 9 and 13 benches; it is not cut
deeper (incising it lost the shore and the promise: 13 of 20 against 16). **At 96² the shaping fades
out:** with few tall benches on a small map the promise's plateau count (3 of 68+ tiles) and cliff
share (0.1 × √(128/96)) cannot be met, 9–12 of 20 against 16 whatever the step or the terrace cell
(`local/exp-size.log`). At 256² benches four apart left too little cliff for the line (10 of 20); three
apart holds 15.

Tried and dropped (`local/exp-128.log`, `local/exp-size.log`): a floor of 4 beside the channel on
either theme (the promise fell to 9–10 of 20: the flat strip reads as low land and pushes the walls
out of reach); Highlands benches five apart (8 of 20: too few plateaus); Highlands cut to the floor
(13 of 20); Canyon at a base of 7 (walls 4.3, 18 of 20 at 128²) or 9 (walls 5.1, 13–14, tributaries
dry); Canyon at 5 or 6 with the land leaning high at 96² and 128² (12–15, no start on half the lands).

## The outcome

First maps meeting all three outcomes, seeds 1–20, before (dev's tip with the 96² round's change) → after.

| | 96² | 128² | 256² |
|---|---|---|---|
| Canyon | 16 → 16 | 17 → **18** | 16 → 16 |
| Highlands | 16 → 16 | 15 → **16** | 17 → 15 |

At 96² both themes' maps are the 96² round's, byte for byte. Failing an absolute: none, before or after, at any
size. Relief at 128² (seeds 1–20, `survey3.ts`, the main river's walls as the highest ground within 5 tiles of the
bank over the water): Canyon's walls 2.8 → 6.2 levels median, the share of the course with walls of 5+ on both
sides 22% → 65%; Highlands 2.0 → 3.6 and 13% → 28%, its land in benches four apart (about 6 / 26 / 38 / 27% at 4 /
8 / 12 / 16 against a spread of 2–3). At 256² Canyon's walls are 3.9 median (40% of the course over 5), Highlands'
2.3. Attempts at 128² (seeds 1–20): Canyon 149 → 201 (no start 49 → 94: the plateau's starts are its lakes), Highlands
200 → 206. Lands changed: every Canyon and Highlands map from 128² up; none at 96².

Sheets for Kyler, seeds 1–30 at 128², dev's tip beside this branch, each map 288 px: the opening 3D view
[docs/sheets/canyon-height-3d.jpg](../../docs/sheets/canyon-height-3d.jpg) and
[highlands-height-3d.jpg](../../docs/sheets/highlands-height-3d.jpg); top-down
[canyon-height-top.png](../../docs/sheets/canyon-height-top.png) and
[highlands-height-top.png](../../docs/sheets/highlands-height-top.png).

## Still open

- **The eye's verdict is Kyler's.** By the numbers the gorge is twice as deep and Highlands stands in
  benches of four; at the opening camera's scale the difference is plain on most Canyon maps and on the
  Highlands maps whose valley is narrow, less so where a lake fills the lowest bench.
- **Most land is still bare rock** away from the water (the critique's second cross-theme point): the
  plateau this round raises is a bigger bare plateau. Shared; not touched.
- **Canyon maps whose inflow search fails** still split the water among springs under the cutting flow
  (96² seed 18); the shared search is M9b's.
- **Wide-floor intentions on Canyon** (hanging-valleys, farmland-past-gorge) now get a floor of 3: their
  "wide valley floor" reads less on this theme. A judgment call for Kyler.
- **Highlands' river is not cut deeper** than before: its valley is the lowest bench between tall ones,
  not a gorge; cutting it lost the start's shore (cause 4) and the promise.
- **64² maps change too** (the shaping has no lower bound); Relief and Terracing settings still move the
  land from the preset, but the preset now starts from tall terraces, so Terracing below the preset
  cannot reach the old look.
- **The re-pins** (D148; each test carries its reason). On dev's tip the quick suite fails only the heavy
  `settings` experiment (five, D466) and `carveBornAsItCuts` (two); with this change 20 more tests in 12
  files moved, each re-pinned to what its name says: `areaStart` (Highlands 64² seed 3's start at
  (17, 16), the area and the Erupt with it; seed 10's start at level 13, the layer cut at 14),
  `selectOneTile` (the tile (44, 10)), `tryAnotherStart` (the Slide clicked at (22, 15)), `fallOutflow`
  (Highlands 5's edge lip at (37, 127); Canyon 5 for Canyon 2, which holds none), `smallStarts` (Canyon
  128² seed 9 now meets all three), `objects` (Canyon 96² with every object on passes, its expected
  failure off; weirs on Canyon 4 and Highlands 4; rises on Highlands 1 and Canyon 5), `carve` (the
  worker's tests on Highlands 96² seed 22; the oxbow with the carve's seed 1), `editsPlaceNothing`
  (seeds 7 and 8 first: a site at 16 takes no wall), `forceEverywhere` (seed 6), `forcePower` (River
  Valley 128² seed 1: on the tall terraces every gentlest force fills a valley), `glaciatePowerSize`
  (the head at (96, 33)), `look-mine-ruins` (the file's sha with generator 0.9.0; River Valley's land
  is untouched). Of the browser specs on Highlands 96² (seeds 4242 and 4244), one moved: the click-only crater test to seed 4244 (`forces.spec.ts`); the other 28 pass.

## Regenerate (D195)

Large results stay in `local/` (gitignored). From the repository root on this branch (the base runs need a
worktree at the base, `local/` is the place for it):

```
sh investigation/canyon-highlands-height/quick.sh after 3 128 1-20       # and 96, 256
PYTHONIOENCODING=utf-8 python investigation/canyon-highlands-height/report.py after hbase 128
npx tsx investigation/canyon-highlands-height/survey3.ts canyon 128 1-20
npx tsx investigation/theme-critique/capture-3d.ts --themes canyon,highlands --seeds 1-30 --out investigation/canyon-highlands-height/local/3d-after
npx tsx tools/look.ts --themes canyon,highlands --seeds 1-30 --size 128 --scale 2 --jobs 2 --out investigation/canyon-highlands-height/local/top-after
python investigation/canyon-highlands-height/sheet-pairs.py canyon <before dir> <after dir> docs/sheets/canyon-height-3d.jpg "<title>"
```

The 3D captures need a headed Chrome and about 6 s a map; `capture-3d.ts` is the theme critique's (PR
#211), copied into a worktree of each side. The variant switches the experiments used are not in the code.

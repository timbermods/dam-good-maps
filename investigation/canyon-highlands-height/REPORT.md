# Canyon and Highlands: height the eye sees

Base: `dev`'s tip `79881e0b` (M9b released) with the 96² round's change (`investigation/canyon-highlands-96`,
PR #224) applied first; Kyler keeps both rounds together. This round lands as a change to the product on this
branch (Kyler, 2026-10-04): `land/canyon.ts`, `land/highlands.ts` and their call in `gen/generate.ts`, generator
0.8.8 (0.9.0 on its first base), the contract tests re-pinned (D148), PLAN §8 and STATUS updated. Each theme's own shaping only; River Valley
and Any are untouched; nothing is stamped.

## On dev (generator 0.8.8, 2026-10-07)

Merged with dev at 0104b950 (0.8.7: badwater joins the main water, D476; the start's badwater distance a rule,
D469; every setting makes a map, D471; the water story's reach counts the main water, D480; Lake Basin round 3,
River Valley round 2, Islands round 6; TypeScript 7), and again at 3a87fc61 (3D Foundations stage 1, #354, which
changes no map: Canyon and Highlands seeds 1–8 at 96² and 128² hash the same before and after). The sections below are the round before that merge. First
maps meeting all three outcomes, seeds 1–20 at 96² / 128² / 256² (`measure.ts`):

| | approved, on its old base | merged before D480 | on dev now (0.8.8) | dev's own today (0.8.7) |
|---|---|---|---|---|
| Canyon | 16 / 15 / 15 | 13 / 15 / 10 | 14 / 15 / 13 | 14 / 16 / 16 |
| Highlands | 16 / 17 / 18 | 14 / 14 / 16 | 14 / 17 / 16 | 10 / 15 / 15 |

No map fails an absolute and none is without a start, at any size (all 120 reports pass).

- **What is missed now** (promise / water story, no standout missed): Canyon 6 / 0, 3 / 2 and 4 / 4 at 96², 128²
  and 256² (seed 10 at 256² misses both); Highlands 5 / 2, 3 / 1 and 3 / 1 (96² seed 13 and 128² seed 9 miss both).
- **D480** changed no land (all 120 maps are the merge's) and brought back Canyon 96² seed 13, Canyon 256² seeds
  1, 9 and 17 and Highlands 128² seeds 5, 14 and 15, each a reach miss with badwater in the main water.
- **Canyon 256²'s water misses**, the gap to the approved 15: on seeds 5, 13 and 20 badwater joins the main river
  (D476) and half or more of the main water carries it, so the story's mostly-badwater rule (D333,
  `analysis/story.ts`) counts the main system as none of the story: "the main system holds 0% of the water" on 5
  and 20, whose reach is 0.44 and 0.64, and a reach of 23% on 13. Seed 20 missed its water before the merge too;
  5 and 13 are new. Seed 10's river holds water on 20% of its course, as before the merge. The promise misses (2,
  4, 10, 19) are the approved table's. Kyler, 2026-10-07: D476 stands, the absolutes and D85 are the bar, and the
  round merges as it is; the mostly-badwater rule is a question of its own. Dev's own Canyon 256² misses 2 and 19
  (promise), 15 and 18 (water).
- **The other water misses:** Canyon 128² seeds 13 and 15 and Highlands 96² seeds 13 and 16 (the main system
  holds 43–71% of the water); Highlands 128² seed 9 and 256² seed 11 (a reach of 33% and 23%).
- **The main river's walls** (median of the maps' medians; the share of the course with 5+ levels on both sides),
  beside dev's own: Canyon 128² 6.3 levels and 65% (dev 2.8 and 19%), Canyon 256² 3.2 and 41% (1.1 and 18%);
  Highlands 128² 2.3 and 23% (1.8 and 13%), Highlands 256² 1.3 and 10% (0.8 and 10%). At 96² the shaping fades
  out: Canyon 1.9 and 14% (1.9 and 17%), Highlands 1.8 and 16% (2.4 and 23%).
- **Other themes:** River Valley, Lake Basin, Delta, Islands and Any, seeds 1–8 at 96² and 128² (80 maps), are
  byte-identical to dev (heights, water, entities). Three files conflicted: `generate.ts` (both sides' additions
  kept), `field.ts` (dev's island rim call with this round's tarn arc) and `smallStarts.test.ts`.
- **A thorn belt left out, as designed:** on Canyon 96² seed 3 with every object on, the two belts planned would
  cut the start's walkable land from 2,274 tiles to 1,134, so the walk rule (`gen/generate.ts`, where the objects
  are placed: thorns go first while the start's walk falls by more than the objects' own tiles and 40) leaves both
  out. The map passes with its start, three mine sites and every other kind.
- **Re-pins on the merged maps** (D148; each test carries its reason): `objects` (Canyon seed 3 keeps its start
  and three mine sites, every kind of object is checked on Canyon 96² seed 1; a second district on Canyon 2;
  rises on Canyon 1, 5 and 18 with River Valley 8; weirs on Canyon 10 and Highlands 4), `areaStart` (Highlands 64²
  seed 3's start at (17, 16), the area 29 wide from (17, 10), the Erupt at (26, 16); the layer test on seed 7,
  its start at level 11), `tryAnotherStart` (seed 2's start at (35, 19), the Slide at (36, 12)), `carve` (the
  oxbow on Highlands 96² seed 8 with the carve's seed 1), `editsPlaceNothing` (seed 1's three-spring row at
  (65–67, 58)), `glaciatePowerSize` (Power's comparison from (14, 46), Size's from (62, 14), no bar moved),
  `unleash` (the course takes two inflow sources it runs over, D474, and the count allows for exactly those),
  `look-mine-ruins` (the file's sha with generator 0.8.8; River Valley's land is untouched). Of the browser
  specs on Highlands 96² (20 files run), four tests moved: the click-only crater and Select's working area to
  seed 4244 (on 4242 the crater's spot stands beside a nine-level fall, and Select's first dry land is a slope
  above where its Raise stroke starts, so Raise's target rightly lifts nothing); Unleash's spot keeps six tiles
  from the map's own sources (a click three tiles from a spring picked the spring); the eruption in High starts
  from ground at level 8 or lower.
- **An eruption without lava showing, a finding for the look:** in High, an Erupt at Power 70 from the top bench
  of Highlands 96² seed 4242 (level 15) ends with no lava in its last frame (8 lava-coloured pixels more than
  without it; 3,900 from level 6 on the same map). Dev's own code does the same on its Highlands 96² seed 4244
  from level 13 (114) while its seed 4242 from level 14 shows 13,000, so it is not this round's and not the
  height alone. Not looked into further; the test keeps its bar of 2,000 from lower ground.
- Sheets on the merged code: [Canyon and Highlands](../../docs/sheets/canyon-highlands-height.png),
  [every theme](../../docs/sheets/canyon-highlands-height-all.png); the sheets under "The outcome" and the two
  pitch sheets are made again on it, dev's tip (0.8.7) on the left. The 3D captures frame the map as the renderer
  does alone (`capture-pitch.ts` clears the page's insets, which make room for its panels).

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
1.2 and no cut). The start's shore is the plateau's lake, not the gorge (cause 4): a basin is drawn
where the genome drew none, and no lake exceeds 4% of the map. The floor beside the channel is kept
within 3, so the walls stand close to the water (the hanging-valleys intention's floor of 7–11 left a
flat with no wall in reach). **At 96² the plateau fades out** (the 96² round's rules alone remain): a
plateau of 8, 6 or 5 left no start on most lands there (the settler's counters: nearly every level pad
fails the water rule) and maps failing an absolute, 12–14 of 20 against 16 (`local/exp-size.log`).

**Highlands: tall terraces, the land leaning high, from 128² up.** Benches four levels apart (three
from 192² up) over at least four fifths of the land (the preset drew 2–3), the land leaning high
(`lean` ≤ 0.65: most of it on the upper benches, the river's valley the narrow lowest one), and the
lowest bench no lower than 4, half a level over the river's surface where a pump reaches it, so the
start keeps its shore. The river threads the lowest bench between the 8 and 12 benches; it is not cut
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

## Kyler's look at #261, and the fixes

Not approved at first (the planning chat, 2026-10-04): the extra height barely reads from the opening
camera, and three maps regressed. The fixes, on the same branch:

- **Canyon 27 lost its full-length gorge**: the lake forced for the start's shore (a basin and a spring
  lake at 0.8) took the lake budget's 20% of the map and drowned the gorge's upper half. Now no Canyon
  lake exceeds 4% of the map and the spring lake keeps the genome's own chance: Canyon 27's main river
  runs between walls of 7.7 levels median, 78% of its course over five (`local/exp-reg.log`).
- **Highlands 2 and 23 became bare rock with a thin river**: the lean of 0.55 with the lowest bench at
  5 left 8% and 6% of the land moist (28% and 32% before): every stream cut a slot into high benches
  and no valley floor was left. The lean is 0.65 and the lowest bench 4 again (a pump still reaches
  the river): 28% and 29% moist, and 128² gains a seed (16 → 17). A floor beside the channel, a capped
  incision, more flow and a lean of 0.7 were tried and lost the promise or the green (`local/exp-reg.log`).
- **The camera's part**, for Kyler to decide: `docs/sheets/canyon-height-pitch.jpg` and
  `highlands-height-pitch.jpg` show the same 30 seeds at 128² from the opening camera as it is (70° down)
  and pitched 55° down, side by side (`capture-pitch.ts`: the second shot sets the view's pitch on the
  page and lets the renderer frame the map again; no camera code changes).

## Kyler's second look: Canyon's gorge and lake

Highlands approved. Canyon, two fixes (judged on the sheets, seeds 1–30 at 128²):

- **Every map's main river runs in a gorge.** Seed 27's main clipped a corner and a creek carried the map; seven
  maps had no inflow at all (the main a spring's third of the flow, two tiles wide) and four split it between two.
  Now from 128² one river enters (a Rivers count the player set is kept), the inflow search prefers the mouth with
  the longest way across (`hydro.ts`, length weight 0.06 for 0.012), and at 128² the land screen draws again a land
  whose main neither crosses the map (three quarters of its side) nor is walled for twice the promise's line.
- **No round lake in a round bowl.** From 128² every Canyon lake is a tarn (`field.ts`): valley-shaped (bent, bays,
  side arms; size at least 14), no central mound, and its rim on one side only, fading out round the rest, so it
  keeps a level shelf by the water for the start but never closes a ring; Canyon draws no caldera. The full rim's
  ring and a pond's bowl made the round green bowl (4, 9, 11, 16), a caldera's crater the circle (seed 7 on the way).
  A map whose first six lands are all drawn again keeps the genome's own lakes after that (3, 9, 21, 24, 25 and 30
  of seeds 1–30): a tarn leaves fewer places for a start, and without this seeds 18, 43 and 71 ran out of attempts.
- **Tried and dropped:** tarns with steep walls and a flat or uneven floor (the 4% budget cut the water below the
  walls: no shore); an uneven floor in the bowl (no level pad by the water); no rim at all (formed, but seed 18 ran
  to its last attempt, and failed in the page); a main required to cross the map (crossing lands found no start);
  six more redraws for it; the gorge screen alone, read on the planned water (unwalled mains after the settle).
- **Cost:** none failing an absolute in seeds 1–90 at 128² and 1–20 at 256² (none before), none needing all 40
  attempts; attempts 993 for 972 at 128² (seeds 1–90), 78 for 69 at 256² (seeds 1–20). 96² is untouched. Re-pins
  (D148): `objects` (rises on Canyon 15, River Valley 6 and 2 and Any 10; a second district on Canyon 2 for 4), `smallStarts` (Canyon 128² seed 9 misses an outcome again);
  `fallOutflow` keeps Canyon 5's edge lip.

## The outcome

First maps meeting all three outcomes, seeds 1–20, before (dev's tip with the 96² round's change) → after, on the
round's own base (the counts on dev are in "On dev" above). Canyon's row is measured again after Kyler's second
look (`measure.ts` on the approved head): 15 at 128², where the row first read 18 on the round before that look.

| | 96² | 128² | 256² |
|---|---|---|---|
| Canyon | 16 → 16 | 17 → 15 | 16 → 15 |
| Highlands | 16 → 16 | 15 → **17** | 17 → **18** |

At 96² both themes' maps are the 96² round's, byte for byte. Failing an absolute: none, before or after, at any
size. Relief at 128² (seeds 1–20, `survey3.ts`, the main river's walls as the highest ground within 5 tiles of the
bank over the water): Canyon's walls 2.8 → 6.2 levels median, the share of the course with walls of 5+ on both
sides 22% → 63% (6.5 and 65% after the second look); Highlands 2.0 → 2.7 and 13% → 23%, its land in benches four apart against a spread of 2–3.
The green (`survey4.ts`, the share of the dry land that is moist, seeds 1–30): Highlands 27% mean before and
after at 128² (4 maps under 20% before, 5 after), 15% at 256² both (26 and 25 under 20%); Canyon 24% → 26% at
128². Attempts at 128² (seeds 1–20): Canyon 149 → 171, Highlands 200 → 187. Lands changed: every Canyon and
Highlands map from 128² up; none at 96².

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
- **Canyon maps whose inflow search fails** still split the water among springs under the cutting flow at 96²
  (seed 18); from 128² the land screen draws them again.
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
  (the head at (42, 84)), `look-mine-ruins` (the file's sha with generator 0.9.0; River Valley's land
  is untouched). After the fixes for Kyler's look: Highlands 5's edge lip at (27, 0), the rises on Canyon 18, 5
  and 3 with River Valley 2 (no Highlands seed to 20 holds one), and the nightly sweep's known list takes
  Highlands 128² seed 5's edge Slide (7 tiles at Power 10). Of the browser specs on Highlands 96² (seeds 4242 and 4244), one moved: the click-only crater test to seed 4244 (`forces.spec.ts`); the other 28 pass.

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

For Kyler's second look the Canyon 3D sheet's before side was cut from the previous sheet (dev's tip is unchanged)
and its after side captured with `capture-pitch.ts` (its 70° shot); the pitch sheet is `sheet-pitch.py` on the same
captures. On dev (0.8.8) both sides of the 3D sheets are `capture-pitch.ts`'s 70° shots, the before side from
a worktree of dev's tip under `local/` with the tool copied in. The 3D captures need a headed Chrome and about 6 s a map; `capture-3d.ts` is the theme critique's (PR
#211), copied into a worktree of each side. The variant switches the experiments used are not in the code.

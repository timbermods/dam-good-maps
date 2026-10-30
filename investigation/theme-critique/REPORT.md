# Theme critique: every theme's seeds 1–30 at 128², judged by eye

Base: `feature/m9b` at `43bac949` with `dev` merged (local sha `1d642f42a7cfa338481ad23c92cce91d8c978fa7`, not pushed;
Lake Basin round 2, Delta's dry-course fix and the Islands safe version are all in). 210 maps, seeds 1–30 of each
theme at 128², Normal, the preset's settings. Judged against `docs/PERFECT.md` "Maps" (designed by nature, maps
differ, a character to describe, the land invites building) and the theme decisions in PLAN §20 (D208, D209, D273,
D408–D412, D416, D417, D427, D429, D432, D453, D464). The generator's own readings (promise, readable water,
standout) are information beside the eye, not the verdict.

**How it was looked at.** Every map top-down at 3 px per tile (`tools/look.ts`), in one 6×5 grid per theme and then
singly where something looked wrong; every map from the editor's default 3D camera, the view a player sees first
(`capture-3d.ts`, below; a map opened from its share link, the water settled, nothing moved), six to a sheet. The
strips in `captures/` are cited below; `local/` (gitignored) holds all 420 pictures.

## Any

Strong: the most varied set. Across any six, different openings, different water (one river, two rivers meeting, a
lake with an outlet, a cliff splitting the map) and a standout you can name. 27 of 30 meet all three outcomes.

Weakest traits:
1. **A wide river running ruler-straight at 45°.** Seed 26 is a canal: one broad diagonal band with parallel banks
   across the whole map, as plain in 3D as top-down. Seed 4's river has long straight reaches; seed 25's lake fills
   a staircase of terraces with saw-tooth edges. `captures/any-straight-river.jpg`.
2. **Half the map is bare, flat upland with nothing on it.** Seeds 21, 10, 11 (and 17, 2, 13): a broad plateau, no
   water, no feature, the water and the green in one strip. In 3D it is grey rock with a few trees.
   `captures/any-bare-plateaus.jpg`.
3. **Badwater streams drawn as a square wave.** Seeds 17, 20, 28: the purple stream wiggles at right angles down the
   map. Cross-theme, below.

A next round, ranked by what a player notices: the straight river reaches (1); the empty uplands (2), with a
feature or a side valley on them; the badwater line (3).

## River Valley

Strong: the promise reads on 29 of 30; the main river meanders through a broad floor with real tributaries, and the
lakes, the oxbow (23) and the cliff-split maps (5, 27) give maps a character. In 3D the meanders (20, 30) are the
best river shapes in the set.

Weakest traits:
1. **The river pools into a flat sheet with ragged islands.** Seeds 12, 19, 5, 21, 22, 26: a big blue blob with
   bitty islands and bays where the valley is flat. Top-down it reads as a flood; in 3D 12 and 19 pass as lakes, 21
   and 5 still look flooded. One or two per thirty would be a character; six is a habit.
   `captures/rv-sheet-lakes.jpg`.
2. **Badwater streams as a square wave**, seeds 30, 18, 25: the purple line runs in right-angle steps to its
   outlet, the one straight thing on an otherwise natural map; in 3D on 30 the contamination spreads as an orange
   stain across the valley. `captures/rv-badwater-zigzag.jpg`.
3. **River Valley and Highlands blur** (D294's shortfall is narrower, not gone): seeds 7 (narrow, promise missed),
   13, 11 and 3 are mostly bare upland with the valley a thin stripe, and from the opening camera they are the same
   picture as Highlands and Canyon (cross-theme, below).

A next round: the sheet lakes (1); then the badwater line (2, cross-theme); then the share of upland (3).

## Canyon

Strong: the water is readable on every map (30 of 30) and the snaking-river maps (7, 20, 22) are good: a river
that bends and drops. Seeds 9 and 27 are real gorges in 3D: the river between walls down the whole map.

Weakest traits:
1. **Most maps don't read as a canyon, and in 3D the land is flat.** From the opening camera seeds 2, 8, 10, 26, 30
   (and most of the set) are a near-flat rock slab with the river in a shallow groove, walls two or three blocks
   high. The promise reading passes 26 of 30 because it reads walls near the water, not whether the eye sees a
   gorge; the eye sees one on perhaps a quarter. Relief 80 and Terracing 75 don't show. `captures/canyon-flat-3d.jpg`,
   `captures/canyon-no-gorge.jpg`.
2. **Big lakes that belong to Lake Basin.** Seeds 14, 19, 29: a wide blob lake dominates the map, the canyon theme's
   least canyon-like water. `captures/canyon-lakes.jpg`.
3. **A straight river with a straight badwater stream beside it.** Seed 4: the river runs north–south almost
   straight, the purple stream parallel to it; 28 and 23 have the long square-wave badwater line.
   `captures/canyon-straight.jpg`.

A next round: a gorge the eye sees from the opening view (1), which is the theme; then the off-theme lakes (2);
then seed 4's straight pair (3).

## Highlands

Strong: when it works top-down (3, 9, 12, 14, 26, 27) the stepped plateaus with a river threading between them are
the most Timberborn-like land in the set, and 14 and 19 show real stacked terraces in 3D.

Weakest traits:
1. **Nothing is high.** From the opening camera the Highlands sheets are indistinguishable from River Valley's and
   Canyon's: a flat grey slab, low steps, a green ribbon along the river (`captures/cross-three-themes-one-look-3d.jpg`).
   Relief 90 is the preset; the eye sees three or four levels. Top-down, seeds 1, 2, 5, 11, 16, 22 miss the promise
   and look like river valleys. `captures/highlands-valleys.jpg`.
2. **Huge empty plateaus.** Seeds 21, 10, 7, 24, 29: a third to a half of the map is one flat upland with no water
   and nothing on it; 21 is the emptiest map of the 210. `captures/highlands-bare.jpg`.
3. **Straight parallel channels.** Seed 12 "The Long Cliff": three straight diagonal channels run side by side
   through the lake; 19 and 25 have lakes with straight sides. `captures/highlands-lines.jpg`.

A next round: height the eye sees (1), which is the theme and also what separates it from River Valley; the empty
plateaus (2); the straight channels (3).

## Lake Basin

Strong: round 2 did what D464 asked: 27 of 30 are unmistakably Lake Basin, the lake is big, the tributaries come
into it from several sides and the outlet valley reads. In 3D it is the one theme where most of the map is green:
the land round the lake invites building more than any other theme's.

Weakest traits:
1. **One template.** Seeds 1, 2, 4, 5, 6, 8, 10, 11, 14, 16, 18, 20, 21, 23, 24, 25, 27, 28, 30 (19 of 30, and
   most of the rest) are the same picture: an amoeba lake in the middle, green all round, the start on the rim,
   tributaries as spokes; the 3D sheets are five copies of one map. D108 and D273 (5) say no theme sits in one
   template; this one does. The names say it too: 14 of the 30 share a name with another Lake Basin map.
   `captures/lakebasin-template-3d.jpg`, `captures/lakebasin-template.jpg`.
2. **Straight spokes and straight shores.** The tributary valleys enter the basin as ruler-straight arms (1, 5, 7,
   13, 14, 19, 22), and the lake's shore runs dead straight where it meets a terrace line (13's east shore, 19's
   square notch, 22's vertical arm, 24, 26). `captures/lakebasin-spokes.jpg`.
3. **Three maps are another theme.** Seeds 12, 15, 29 have no lake at all: 12 is a bare upland with a badwater
   stream zigzagging down its west edge (the worst single map of the 210), 15 a long cliff, 29 a tributary network.
   `captures/lakebasin-no-lake.jpg`.

A next round: vary the composition (1): a lake off-centre, a lake against a cliff, two lakes, a long lake down one
side (the generator already draws these in Any and River Valley); then the straight arms (2); then the no-lake
seeds (3), which are the promise reading letting a map through.

## Delta

Strong: the fan is a real character where it works (1, 14, 19, 20, 22, 28): the river comes down from upland,
splits and every arm reaches the edge. The upland behind the fan varies by seed and has the most visible relief
of the dry themes in 3D, as D412 asked.

Weakest traits:
1. **The fan's arms are ruler-straight.** Seeds 13, 4, 20, 19 (and 14, 25, 28): the channels leave the apex as
   straight lines at fixed angles, parallel to each other, with parallel banks, top-down and in 3D. This is
   exactly D209's "perfectly straight channels at 45 or 90 degrees with parallel, canal-like sides", and it is the
   first thing the eye sees on a Delta map. `captures/delta-straight-arms.jpg`, `captures/delta-3d.jpg`.
2. **Badwater takes the whole delta, and the apex floods into a blob.** Seed 23: the main river is badwater from
   the upland to the edge, so the whole fan is red in 3D. Seeds 10, 3, 21, 14: the river widens into a flat
   triangular lake at the fan's head. Seed 7's side channel is a perfect horseshoe arc.
   `captures/delta-badwater-apex.jpg`.
3. **Five maps are plain valleys.** Seeds 7, 9, 26, 27, 29 miss the promise and look like River Valley; 27's main
   river is dry on two thirds of its course; 16 is a bare dome with the river round its foot.
   `captures/delta-no-fan.jpg`.

A next round: bend the arms (1): let them follow the land, wander and braid, with the banks eroded like the
rivers'; keep badwater out of the main river (2); then the five plain-valley seeds (3).

## Islands

Strong: six sea layouts appear (chain 7, archipelago 8, atolls 7, edge 4, two seas 2, central 2), so the set is
not one picture; 1, 4, 6, 13, 15, 25, 28 have islands with some relief and a real coast.

Weakest traits:
1. **A ring of land frames the sea, and in 3D the sea is a pool.** Seeds 3, 5, 11, 12, 13, 18, 22, 23, 25, 28, 29,
   30: the sea sits inside a continuous shelf of land with the map edge all round it. From the opening camera the
   shelf is a straight vertical wall along the map's edge (18, 30) and the sea a dark flat pool inside it. D427
   allowed the ring on about one map in four; it is on about two in five here. `captures/islands-ring.jpg`,
   `captures/islands-3d.jpg`.
2. **Square seas and straight coasts.** Seeds 19, 16, 2, 7, 9, 21, 26: the sea's outline runs parallel to the
   map's edges with square corners (19 is a rectangle in both views); 21 has a straight causeway across it.
   `captures/islands-square-sea.jpg`.
3. **Islands are small flat mesas; land with lakes.** In 3D most islands are flat-topped stubs one or two blocks
   high (29, 23, 11), not the "fewer, larger islands with real relief" of D417. Seeds 8, 9, 10, 20, 24, 27 read as
   a mainland with a lake or a river (D432's known shortfall, unchanged). `captures/islands-land-with-lakes.jpg`.

A next round: the coast's line (1 and 2 together: break the ring, bend the edges, as D417 and D427 already say);
then islands with height (3); then the land-with-lakes seeds (the post-release Islands round, D432).

## Across the themes

- **From the editor's opening view, River Valley, Canyon and Highlands are one picture**: a flat grey slab with
  low steps and a green ribbon along the river; the presets' Relief 50 / 80 / 90 and Terracing 45 / 75 / 60 make
  no visible difference at that camera (`captures/cross-three-themes-one-look-3d.jpg`). A player who picks Canyon
  or Highlands sees River Valley. This is the thing a next round should fix first, before any theme's own list.
- **Most land is bare rock** away from the water on every theme but Lake Basin: the green is a strip along the
  river, the rest a plateau with a few trees. "The land invites building" holds in the strip and nowhere else.
- **Badwater streams are the one drawn line on every map**: a square-wave wiggle at right angles from a round
  source hollow, on about a third of the maps of every theme (`captures/cross-badwater-zigzag.jpg`). It breaks
  "designed by nature" more often than anything else, and a player sees it in red in 3D.
- **Water meets straight terrace lines**: wherever a lake or sea fills a terrace, its shore is a straight line or a
  staircase (Lake Basin, Islands, Any 25, Highlands 19).
- **Names repeat**: 102 distinct names over 210 maps; "Standing Stone" 9 times, "Twisting Stream" 8, "Far Sight"
  and "Serpent Run" 7. A character you could describe to a friend needs a name the friend hasn't heard three
  times.

## Regenerating the pictures

From a clone at the base sha after `npm ci` (about 5 min for the top-down set on 3 workers; about 45 min for the
3D captures in a headed Chrome, which resumes from its `index.json` if the browser drops):

```
npx tsx tools/look.ts --themes any,riverValley,canyon,highlands,lakeBasin,delta,islands --seeds 1-30 --scale 3 --jobs 3 --out investigation/theme-critique/local/look
npx tsx investigation/theme-critique/capture-3d.ts --seeds 1-30 --out investigation/theme-critique/local/3d
python investigation/theme-critique/grid.py top investigation/theme-critique/local/look investigation/theme-critique/local/grids
python investigation/theme-critique/grid.py 3d investigation/theme-critique/local/3d investigation/theme-critique/local/grids3d
```

Repository size rule (D195): `local/` is gitignored; only this report, the two scripts and the capture strips
(each under 300 KB) are committed.

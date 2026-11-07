# Showcase: judging by looks (D506)

Wave 2, item 5, design A as planning ruled it on 2026-11-07. Showcase ranks each candidate by its arc and by the looks
of its opening picture. The picture is the game's first camera pulled back, what a player sees as a new game begins
(D493). The calibration's pictures were the map's own picture as it was drawn then, from that camera; since #809 the
map picker's picture has the game's thumbnail camera instead, and the looks still judge the opening frame. This page records how the looks weight was chosen. The rule is D506 (docs/decisions/generator.md).

## The calibration

- **The maps:** 28 maps at 128², seeds 31–34 of all seven themes, generator 0.10.11 at default settings. Each map's
  own picture was drawn in real Chrome on the GPU (`tools/capture-hero.ts`). The pictures were renamed m01–m28 in a
  fixed shuffle.
- **The eye:** a fresh Opus reviewer, given only the pictures, ranked all 28 with no ties. The question was "as a
  player choosing a map, how much does this view make you want to play it?" It was told nothing of the measures or
  the scores.
- **The halves:** seeds 31–32 train (14 maps) and seeds 33–34 are held out (14 maps), two of every theme in each.
- **The fit:** each measure's weight in `LOOKS` is its Spearman agreement with the eye on the training half, rounded.
  Focal is dropped, since its agreement was negative. Then `SHOWCASE_LOOKS` is the weight w in arc + w × looks, swept
  from 0 to 12 in steps of 0.5, that agreed best with the eye on the training half. The held-out half was not used to
  choose anything.
- **Earlier scaling:** the measures' scales (what counts as a full share) were set first, from the raw shares of 12
  other maps (seeds 11–12 of six themes).

## Agreement with the eye (Spearman; top 8 of 28 shared with the eye's top 8)

| Ranking | Training half | Held out | All 28 | Top 8 shared |
|---|---|---|---|---|
| Arc alone (the old rank) | 0.29 | 0.07 | 0.25 | 2 |
| Looks alone | 0.82 | 0.65 | 0.74 | 5 |
| Arc + 9.5 × looks (D506) | 0.88 | 0.62 | 0.74 | 5 |

The measures' own agreement on the training half:

| Measure | Agreement |
|---|---|
| Void | −0.76 |
| Trees | 0.67 |
| Focal | −0.43 |
| Green | 0.37 |
| Bare | −0.20 |
| Depth | 0.15 |
| Cliffs | 0.15 |
| Water | 0.05 |

**Within a theme**, where a Showcase search compares its siblings, 33 of 42 pairs of maps are ordered as the eye
orders them. The arc alone ordered 24 of 42, which is chance.

**What the eye said separated them:** the best show the whole map, with one clear water feature in a lot of green.
The worst are bare grey plateau, or the start sits near a corner so the frame is mostly sky. Nine of the 28 frames
cut off a large part of the map. The void measure counts that against the map.

## The conditions (planning's ruling)

1. **The weight is fitted, with a held-out half:** see above. 0.62 held out, against 0.07 for the arc alone.
2. **No sameness:** the 8 best of 28 by the new rank span five themes (Highlands 3, River Valley 2, Lake Basin,
   Canyon and Any 1 each), against four themes by the arc alone. The trees measure is full at 6% of the frame, so a
   denser forest earns nothing more.
3. **Speed (D453):** the picture and its looks take 39 ms a candidate (median, 22–69 ms), 0.8% of generating it
   (at most 2.0%, on a map that generated in 3.4 s).
4. **The game's colours (D496):** grass or dry by the game's desert rule (`GRASS_RULE` = `render3d/palette.ts`
   `DESERT`, held by `tests/unit/picture.test.ts`). Badwater is shown from half its share, as the game turns it.

## Still short

- **One eye:** the ranking is a single reviewer's, on 28 maps. A second ranking would show how much of the 0.62 is
  the measure and how much is that reviewer's taste.
- **Only 128²:** at 256² the frame shows less sky, so the void measure barely moves.
- **Corner starts:** a start near a corner is now ranked down, but the generator still makes such starts. Turning
  the start (D493's `bestTurn`) does not move the frame's centre. Starts placed so the frame shows the map is
  generator work, open for a later wave.

## The 28 maps

"By arc" and "By arc + looks" are each map's rank out of 28 under that score. "Arc" is `arcScore`; "Looks" is
`looksScore`'s score.

| Map (128²) | Half | Eye | By arc | By arc + looks | Arc | Looks | The eye said |
|---|---|---|---|---|---|---|---|
| lakeBasin 33 | held | 1 | 8 | 11 | 4.54 | 0.73 | Lush whole map: lake, islands, winding rivers, forests, little bare ground |
| riverValley 31 | train | 2 | 16 | 6 | 3.48 | 0.91 | Serpentine river through broad green valley, framed fully, clear focus |
| lakeBasin 32 | train | 3 | 3 | 4 | 5.68 | 0.73 | Big lake with green shores and creeks, whole map readable |
| riverValley 33 | held | 4 | 10 | 3 | 4.52 | 0.88 | River gorge with waterfalls and green banks, strong relief |
| delta 33 | held | 5 | 20 | 12 | 3.47 | 0.82 | Green bowl with river centred, terraced hills frame it |
| highlands 31 | train | 6 | 11 | 2 | 4.50 | 1.02 | Two lakes, green middle, cliffs; varied and fully framed |
| any 32 | train | 7 | 26 | 20 | 2.46 | 0.47 | Braided river valley striking, but map half off-frame |
| any 33 | held | 8 | 22 | 8 | 3.45 | 0.90 | Meandering river and meadows, nice relief, partly cut off |
| islands 34 | held | 9 | 13 | 14 | 3.54 | 0.62 | Archipelago bay with islands, distinctive, bare grey east side |
| canyon 31 | train | 10 | 12 | 7 | 3.59 | 0.89 | River network and forests, much grey plateau around |
| lakeBasin 31 | train | 11 | 9 | 9 | 4.52 | 0.78 | Large lake with green shore, half map shown, flat |
| highlands 33 | held | 12 | 2 | 1 | 5.71 | 0.90 | River joining lakes in green patches, grey dominant, offset |
| riverValley 34 | held | 13 | 19 | 18 | 3.47 | 0.50 | Winding river and canyon, mostly bare grey terraces |
| riverValley 32 | train | 14 | 18 | 22 | 3.47 | 0.17 | Green river valley one side, wide bare grey plain |
| islands 33 | held | 15 | 1 | 13 | 5.74 | 0.47 | Island lake upper half, lower half flat bare grey |
| highlands 34 | held | 16 | 7 | 5 | 4.57 | 0.83 | Canyon river corner, rest a dull grey expanse |
| canyon 34 | held | 17 | 5 | 10 | 4.63 | 0.76 | Cliff river nice, but sprawling grey, cluttered ruins |
| any 31 | train | 18 | 15 | 17 | 3.50 | 0.50 | Lake inlets green, half grey, map partly off-frame |
| canyon 32 | train | 19 | 27 | 23 | 2.33 | 0.28 | Thin river through mostly grey land, little green |
| lakeBasin 34 | held | 20 | 6 | 15 | 4.60 | 0.49 | Half sea half flat grey, little relief or focus |
| delta 32 | train | 21 | 14 | 24 | 3.51 | 0.16 | Rivers in grey canyons, off-frame, little green |
| islands 31 | train | 22 | 28 | 25 | 1.42 | 0.25 | Lake with islands but only a corner visible |
| delta 34 | held | 23 | 23 | 19 | 3.40 | 0.41 | Corner view, grey terraces dominate, lakes cut off |
| delta 31 | train | 24 | 25 | 26 | 2.47 | 0.05 | River corner, mostly sky and grey slope |
| canyon 33 | held | 25 | 21 | 16 | 3.46 | 0.55 | Mostly barren grey, small green patches, weak focus |
| highlands 32 | train | 26 | 24 | 21 | 2.48 | 0.44 | Grey barren plateau, cramped river, partial framing |
| any 34 | held | 27 | 17 | 28 | 3.48 | -0.15 | Pretty river but tiny corner amid sky |
| islands 32 | train | 28 | 4 | 27 | 4.66 | -0.21 | Only a lake corner visible, mostly empty sky |

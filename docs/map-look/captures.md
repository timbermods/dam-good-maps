# Map look captures

Before and after captures of the same maps from the same camera poses, for the Map look review
(ROADMAP "Map look", PLAN §20 D86, D110 and D114). The before captures show the 3D view at
`m8-done` (cfa5990); the after captures show it with Map look, after the reviews' fix rounds. Each
after capture also comes in greyscale and in three colour-blindness simulations (protanopia,
deuteranopia, tritanopia; Machado, Oliveira and Fernandes 2009, full severity, in linear RGB).

Made with `npx tsx tools/capture-look.ts --label before|after` (before on 2026-09-25, after on 2026-09-25), in the installed Chrome, headed, at 1280×800 CSS pixels and a device pixel ratio of 1. Each map is opened in the editor (generated maps with **Refine this map**, Beavertopia through the file input) with **Show dam sites** on, and only the 3D canvas is captured, except for one whole view per run. The after run takes every pose's camera from the before run's record. The **meets** and **cliff** poses came in the third round; their before captures were made the same way, with `--poses meets,cliff`, on `m8-done`'s code. The water is held at one moment of its movement.

The maps: seed 4242 in every theme at 128² (Normal), seed 4242 River Valley at 256², and
Beavertopia (a workshop map, 256²). Beavertopia's captures are not ours to share: they stay in
`.scratch/map-look/` on the machine that made them and are never committed.

## In the game itself

Every capture above is our own renderer. To see a map as players get it, the in-game capture kit plays it in Timberborn
through the DGM Probe runner and saves the game's first camera, its widest zoom, the whole map and three chosen angles,
on day 1 and on the worst day of the first drought and of the first badtide, each beside our renderer posed from the
camera the game recorded, in Standard and High (`npm --prefix investigation/probe run batch -- <map> --captures`; the
command, the moments, the poses and the files are in investigation/probe/README.md, "In-game captures"; the sheet is
`tools/capture-ingame.ts`). Look verdicts on maps are given on those captures. They are game screenshots: local files
only, never committed.

The first baseline (run 20261110-0708-captures, the three hand-made showcase maps, in `C:\dgm-probe\captures\`) lines
our view up with the game pixel for pixel: the same terrain, water, trees and ruins in the same places, and the same
drought (grass gone, trees yellow, brown haze) and badtide (red rivers, contaminated ground). What the game shows that
our view doesn't:

- **The start.** The game draws the district centre; we draw a white placeholder house. The game's first camera is
  tight on it, with no landmark in frame on any of the three maps.
- **Stone and ground.** The game's cliffs are small rounded cobbles with soft vertical banding; ours are large flat
  polygons. The game's dry ground is a fine cracked mud of one even tone; ours is large slabs with cloud-like light and
  dark blotches, so our plateaus read busier than the game's flat brown.
- **Trees.** The game's crowns are round and leafy; ours are faceted.
- **Small objects.** Dead trees are pale bare branches in the game and faint grey sticks in ours. A dry water source
  is a dark pit in the game and an orange disc in ours. Ruins read alike, as rust-orange scaffolds.
- **Water.** The game's clean water is a lighter, more opaque teal; ours is darker. Badwater falls carry brighter
  highlight streaks in the game.
- **Far away.** Past a player's widest zoom the game's haze washes the whole map grey-blue; our fog is held at 154 tiles
  (D497). No player sees that distance.

## Where to look

For each capture, up to three example tiles of each meaning that are in view: the tile (x east,
y north, from the map's south-west corner) and its position in the after image, in pixels from
the top-left corner. The positions hold for the greyscale and colour-blind versions too, and for
the before image, which shares the camera (but for the objects that the after view draws
larger from afar).

The examples come from what the view draws: its heights, the water on each tile's top, the soil
of each tile's top (a tile over a cave shows its top's soil, not the cave floor's) and its
objects. Each position is the visible point: the water's surface, the middle of a tree or a
ruin, the middle of a wall, and the start, the slope arrows and the dead trees as they are drawn
from that distance. Ground and water examples lie inside an area of their kind (their eight
neighbours alike; in a view of the whole map, the 24 round them) and away from objects. No
example has an object on the tiles in front of it (toward the camera), sits under a dam site's
marker or under the start as it is drawn, or lies more than twice the pose's distance from the
camera (in the far haze); and every example was checked by picking the tile under its position
in the view.

- **Water partly bad** is water with some badwater in it (the percentage is given).
- **Badwater meets clean water** is the middle of the way from a badwater tile to the nearest
  clean water, at most four tiles off; the note names both ends. Our generated maps keep their
  badwater in its basins but for River Valley at 256², where it flows into the river; the
  **meets** pose looks at that, and at Beavertopia's.
- **Contaminated beside moist ground** is contaminated ground with moist ground next to it, at the
  same height.
- **Tall cliff** is a dry wall three levels high or more (no water on either side), facing the
  camera, whose middle the view shows first, where each level takes at least 6 pixels; the note
  gives the levels and about how many pixels a level takes. In a view of the whole map a level
  takes 1 to 4 pixels: there the levels show as the steps between terraces, and a tall cliff as a
  wide dark band, but they can't be counted. Every map's **cliff** pose looks at its tallest dry
  cliff from in front, to count them.
- **Slope** gives the way the slope rises; its arrow points that way.
- **Dam site** tiles are the editor's dam sites, shown with **Show dam sites**.

### River Valley (4242), 128×128

**default-ui** (the editor's own view from its default camera, with its buttons, and its legend opened):

- before: [before/riverValley-128-default-ui.jpg](before/riverValley-128-default-ui.jpg)
- after: [after/riverValley-128-default-ui.jpg](after/riverValley-128-default-ui.jpg)

**overview** (the whole map from the south):

- before: [before/riverValley-128-overview.jpg](before/riverValley-128-overview.jpg)
- after: [after/riverValley-128-overview.jpg](after/riverValley-128-overview.jpg)
- after, greyscale: [after/riverValley-128-overview-grey.jpg](after/riverValley-128-overview-grey.jpg); protanopia: [after/riverValley-128-overview-protanopia.jpg](after/riverValley-128-overview-protanopia.jpg); deuteranopia: [after/riverValley-128-overview-deuteranopia.jpg](after/riverValley-128-overview-deuteranopia.jpg); tritanopia: [after/riverValley-128-overview-tritanopia.jpg](after/riverValley-128-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (54, 59) → 434, 397; (69, 52) → 523, 431; (73, 53) → 547, 426 |
| dry ground | (67, 75) → 510, 311; (57, 78) → 454, 314; (48, 73) → 404, 334 |
| contaminated ground | (33, 78) → 322, 306; (28, 78) → 294, 306; (28, 88) → 300, 266 |
| contaminated beside moist ground | (33, 76) → 320, 315; (28, 76) → 293, 315; (18, 76) → 237, 315 |
| living tree | (59, 61) → 464, 385 (Birch); (75, 62) → 557, 379 (Pine); (51, 63) → 418, 376 (Pine) |
| dead tree | (64, 61) → 494, 365 (Birch); (51, 72) → 419, 332 (Birch); (66, 79) → 503, 288 (Birch) |
| ruin | (27, 91) → 297, 253 (1 high); (66, 120) → 502, 134 (1 high); (9, 92) → 199, 240 (2 high) |
| the start | (45, 55) → 379, 405 |
| slope | (59, 58) → 463, 393 (rises toward the west); (68, 55) → 517, 408 (rises toward the south); (75, 61) → 558, 379 (rises toward the west) |
| dam site | (66, 57) → 505, 408; (53, 53) → 427, 428; (78, 60) → 574, 394 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/riverValley-128-start.jpg](before/riverValley-128-start.jpg)
- after: [after/riverValley-128-start.jpg](after/riverValley-128-start.jpg)
- after, greyscale: [after/riverValley-128-start-grey.jpg](after/riverValley-128-start-grey.jpg); protanopia: [after/riverValley-128-start-protanopia.jpg](after/riverValley-128-start-protanopia.jpg); deuteranopia: [after/riverValley-128-start-deuteranopia.jpg](after/riverValley-128-start-deuteranopia.jpg); tritanopia: [after/riverValley-128-start-tritanopia.jpg](after/riverValley-128-start-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (50, 49) → 666, 441; (51, 50) → 672, 413; (49, 48) → 661, 471 |
| badwater | (39, 83) → 127, 26; (38, 84) → 103, 21; (35, 84) → 47, 40 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (46, 51) → 561, 429; (49, 54) → 584, 344; (41, 56) → 394, 390 |
| dry ground | (42, 68) → 300, 206; (44, 69) → 329, 177; (43, 70) → 302, 172 |
| contaminated ground | (36, 77) → 104, 104; (34, 77) → 64, 118; (32, 77) → 22, 133 |
| contaminated beside moist ground | (33, 76) → 49, 139 |
| living tree | (43, 61) → 382, 288 (Oak); (49, 60) → 512, 247 (Pine); (48, 61) → 482, 241 (Pine) |
| dead tree | (38, 69) → 197, 184 (Oak); (37, 70) → 168, 175 (Oak); (51, 72) → 426, 80 (Birch) |
| ruin | not in view |
| the start | (45, 55) → 490, 355 |
| slope | (40, 58) → 347, 350 (rises toward the west); (59, 58) → 714, 206 (rises toward the west); (31, 47) → 246, 701 (rises toward the north) |
| dam site | (50, 56) → 578, 301; (51, 55) → 610, 308; (52, 54) → 639, 328 |
| tall cliff | (62, 53) → 835, 231 (4 levels, about 6 px a level); (43, 78) → 236, 57 (3 levels, about 9 px a level); (45, 79) → 265, 33 (3 levels, about 9 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/riverValley-128-badwater.jpg](before/riverValley-128-badwater.jpg)
- after: [after/riverValley-128-badwater.jpg](after/riverValley-128-badwater.jpg)
- after, greyscale: [after/riverValley-128-badwater-grey.jpg](after/riverValley-128-badwater-grey.jpg); protanopia: [after/riverValley-128-badwater-protanopia.jpg](after/riverValley-128-badwater-protanopia.jpg); deuteranopia: [after/riverValley-128-badwater-deuteranopia.jpg](after/riverValley-128-badwater-deuteranopia.jpg); tritanopia: [after/riverValley-128-badwater-tritanopia.jpg](after/riverValley-128-badwater-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | (36, 84) → 480, 348; (34, 84) → 443, 365; (38, 84) → 515, 332 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (32, 74) → 515, 546; (33, 73) → 549, 554; (30, 74) → 473, 568 |
| dry ground | (40, 77) → 634, 411; (39, 75) → 641, 454; (41, 76) → 665, 418 |
| contaminated ground | (34, 81) → 474, 403; (33, 80) → 465, 428; (34, 79) → 496, 435 |
| contaminated beside moist ground | (33, 76) → 511, 498; (31, 76) → 470, 519; (29, 76) → 428, 541 |
| living tree | (23, 72) → 336, 686 (Birch); (42, 63) → 874, 663 (Oak); (43, 61) → 928, 694 (Oak) |
| dead tree | (33, 87) → 393, 309 (Pine); (31, 88) → 346, 310 (Pine); (39, 90) → 474, 210 (Pine) |
| ruin | (30, 92) → 293, 270 (1 high); (27, 91) → 244, 307 (1 high); (26, 92) → 216, 301 (1 high) |
| the start | not in view |
| slope | (35, 83) → 471, 360 (rises toward the south); (42, 78) → 660, 363 (rises toward the north); (47, 85) → 663, 209 (rises toward the north) |
| dam site | not in view |
| tall cliff | (43, 78) → 679, 382 (3 levels, about 11 px a level); (45, 79) → 701, 350 (3 levels, about 11 px a level); (59, 83) → 866, 193 (3 levels, about 9 px a level) |

**falls** (the tallest waterfall, from downstream):

- before: [before/riverValley-128-falls.jpg](before/riverValley-128-falls.jpg)
- after: [after/riverValley-128-falls.jpg](after/riverValley-128-falls.jpg)
- after, greyscale: [after/riverValley-128-falls-grey.jpg](after/riverValley-128-falls-grey.jpg); protanopia: [after/riverValley-128-falls-protanopia.jpg](after/riverValley-128-falls-protanopia.jpg); deuteranopia: [after/riverValley-128-falls-deuteranopia.jpg](after/riverValley-128-falls-deuteranopia.jpg); tritanopia: [after/riverValley-128-falls-tritanopia.jpg](after/riverValley-128-falls-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (87, 74) → 490, 223; (86, 74) → 528, 223; (86, 72) → 526, 181 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (82, 76) → 694, 249; (82, 75) → 688, 226; (81, 76) → 735, 249 |
| dry ground | not in view |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (86, 80) → 543, 328 (Birch); (84, 80) → 635, 330 (Birch); (93, 80) → 217, 400 (Oak) |
| dead tree | not in view |
| ruin | not in view |
| the start | not in view |
| slope | (96, 85) → 23, 609 (rises toward the south) |
| dam site | not in view |
| tall cliff | not in view |

**cliff** (the tallest dry cliff, from in front):

- before: [before/riverValley-128-cliff.jpg](before/riverValley-128-cliff.jpg)
- after: [after/riverValley-128-cliff.jpg](after/riverValley-128-cliff.jpg)
- after, greyscale: [after/riverValley-128-cliff-grey.jpg](after/riverValley-128-cliff-grey.jpg); protanopia: [after/riverValley-128-cliff-protanopia.jpg](after/riverValley-128-cliff-protanopia.jpg); deuteranopia: [after/riverValley-128-cliff-deuteranopia.jpg](after/riverValley-128-cliff-deuteranopia.jpg); tritanopia: [after/riverValley-128-cliff-tritanopia.jpg](after/riverValley-128-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | not in view |
| dry ground | (98, 114) → 490, 492; (98, 117) → 490, 242; (97, 114) → 447, 492 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | (105, 120) → 764, 172 (Birch); (97, 124) → 454, 93 (Pine); (96, 124) → 416, 93 (Pine) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (98, 116) → 490, 367 (5 levels, about 38 px a level); (97, 116) → 447, 367 (5 levels, about 38 px a level); (99, 116) → 533, 367 (5 levels, about 38 px a level) |

### Canyon (4242), 128×128

**overview** (the whole map from the south):

- before: [before/canyon-128-overview.jpg](before/canyon-128-overview.jpg)
- after: [after/canyon-128-overview.jpg](after/canyon-128-overview.jpg)
- after, greyscale: [after/canyon-128-overview-grey.jpg](after/canyon-128-overview-grey.jpg); protanopia: [after/canyon-128-overview-protanopia.jpg](after/canyon-128-overview-protanopia.jpg); deuteranopia: [after/canyon-128-overview-deuteranopia.jpg](after/canyon-128-overview-deuteranopia.jpg); tritanopia: [after/canyon-128-overview-tritanopia.jpg](after/canyon-128-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (72, 70) → 537, 361; (78, 71) → 570, 357; (38, 64) → 346, 388 |
| dry ground | (67, 68) → 510, 356; (66, 75) → 504, 318; (63, 50) → 487, 433 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (57, 66) → 454, 376 (Birch); (49, 64) → 407, 384 (Pine); (42, 63) → 367, 389 (Birch) |
| dead tree | (64, 81) → 493, 281 (Pine); (77, 79) → 565, 295 (Pine); (69, 84) → 520, 270 (Pine) |
| ruin | (79, 86) → 574, 268 (1 high); (84, 87) → 601, 264 (1 high); (64, 24) → 493, 561 (7 high) |
| the start | (41, 53) → 356, 428 |
| slope | (74, 61) → 551, 393 (rises toward the south); (53, 47) → 424, 441 (rises toward the east); (46, 41) → 378, 470 (rises toward the south) |
| dam site | (64, 64) → 493, 390; (72, 63) → 538, 394; (73, 73) → 543, 327 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/canyon-128-start.jpg](before/canyon-128-start.jpg)
- after: [after/canyon-128-start.jpg](after/canyon-128-start.jpg)
- after, greyscale: [after/canyon-128-start-grey.jpg](after/canyon-128-start-grey.jpg); protanopia: [after/canyon-128-start-protanopia.jpg](after/canyon-128-start-protanopia.jpg); deuteranopia: [after/canyon-128-start-deuteranopia.jpg](after/canyon-128-start-deuteranopia.jpg); tritanopia: [after/canyon-128-start-tritanopia.jpg](after/canyon-128-start-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (41, 59) → 425, 290; (43, 59) → 463, 272; (40, 60) → 395, 283 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (38, 63) → 326, 248; (36, 63) → 287, 265; (37, 64) → 298, 242 |
| dry ground | (45, 43) → 739, 452; (46, 43) → 763, 439; (31, 48) → 301, 525 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (40, 49) → 516, 439 (Pine); (41, 48) → 558, 449 (Pine); (41, 63) → 385, 211 (Birch) |
| dead tree | (36, 42) → 525, 595 (Birch); (34, 43) → 454, 597 (Birch); (37, 41) → 579, 598 (Birch) |
| ruin | not in view |
| the start | (41, 53) → 490, 355 |
| slope | (45, 58) → 511, 260 (rises toward the east); (36, 61) → 304, 293 (rises toward the north); (52, 47) → 816, 303 (rises toward the east) |
| dam site | (57, 63) → 660, 113; (63, 65) → 739, 12; (64, 64) → 755, 57 |
| tall cliff | (33, 71) → 143, 123 (4 levels, about 10 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/canyon-128-badwater.jpg](before/canyon-128-badwater.jpg)
- after: [after/canyon-128-badwater.jpg](after/canyon-128-badwater.jpg)
- after, greyscale: [after/canyon-128-badwater-grey.jpg](after/canyon-128-badwater-grey.jpg); protanopia: [after/canyon-128-badwater-protanopia.jpg](after/canyon-128-badwater-protanopia.jpg); deuteranopia: [after/canyon-128-badwater-deuteranopia.jpg](after/canyon-128-badwater-deuteranopia.jpg); tritanopia: [after/canyon-128-badwater-tritanopia.jpg](after/canyon-128-badwater-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (10, 66) → 366, 152; (12, 66) → 396, 141; (18, 64) → 501, 151 |
| badwater | (8, 49) → 480, 349; (6, 49) → 443, 366; (10, 49) → 515, 332 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (26, 57) → 675, 167; (27, 56) → 699, 172; (1, 71) → 187, 146 |
| dry ground | (9, 40) → 605, 463; (1, 44) → 393, 474; (14, 54) → 533, 226 |
| contaminated ground | (6, 52) → 413, 313; (8, 54) → 430, 270; (10, 54) → 465, 255 |
| contaminated beside moist ground | not in view |
| living tree | (8, 60) → 379, 209 (Pine); (0, 58) → 253, 289 (Pine); (10, 69) → 340, 104 (Birch) |
| dead tree | (0, 51) → 304, 371 (Birch); (3, 40) → 481, 514 (Pine); (19, 45) → 721, 297 (Birch) |
| ruin | not in view |
| the start | (41, 53) → 909, 123 |
| slope | (7, 50) → 451, 331 (rises toward the north); (36, 61) → 759, 94 (rises toward the north); (45, 58) → 894, 75 (rises toward the east) |
| dam site | not in view |
| tall cliff | not in view |

**falls** (the tallest waterfall, from downstream):

- before: [before/canyon-128-falls.jpg](before/canyon-128-falls.jpg)
- after: [after/canyon-128-falls.jpg](after/canyon-128-falls.jpg)
- after, greyscale: [after/canyon-128-falls-grey.jpg](after/canyon-128-falls-grey.jpg); protanopia: [after/canyon-128-falls-protanopia.jpg](after/canyon-128-falls-protanopia.jpg); deuteranopia: [after/canyon-128-falls-deuteranopia.jpg](after/canyon-128-falls-deuteranopia.jpg); tritanopia: [after/canyon-128-falls-tritanopia.jpg](after/canyon-128-falls-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (90, 67) → 571, 383; (91, 67) → 573, 412; (86, 65) → 490, 224 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (88, 62) → 368, 249; (88, 61) → 327, 249; (89, 60) → 280, 274 |
| dry ground | (92, 57) → 34, 108; (93, 57) → 14, 137; (95, 58) → 35, 204 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (90, 71) → 754, 271 (Oak); (92, 73) → 851, 395 (Oak) |
| dead tree | not in view |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | (90, 64) → 447, 301; (91, 63) → 400, 329; (90, 62) → 360, 301 |
| tall cliff | not in view |

**cliff** (the tallest dry cliff, from in front):

- before: [before/canyon-128-cliff.jpg](before/canyon-128-cliff.jpg)
- after: [after/canyon-128-cliff.jpg](after/canyon-128-cliff.jpg)
- after, greyscale: [after/canyon-128-cliff-grey.jpg](after/canyon-128-cliff-grey.jpg); protanopia: [after/canyon-128-cliff-protanopia.jpg](after/canyon-128-cliff-protanopia.jpg); deuteranopia: [after/canyon-128-cliff-deuteranopia.jpg](after/canyon-128-cliff-deuteranopia.jpg); tritanopia: [after/canyon-128-cliff-tritanopia.jpg](after/canyon-128-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (122, 57) → 490, 536; (123, 57) → 462, 536; (124, 57) → 433, 536 |
| dry ground | (122, 54) → 490, 181; (121, 54) → 521, 181; (120, 54) → 552, 181 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (116, 59) → 681, 507 (Birch) |
| dead tree | (125, 52) → 402, 138 (Oak); (117, 51) → 634, 130 (Oak) |
| ruin | (123, 39) → 468, 41 (1 high); (125, 38) → 424, 37 (1 high) |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (122, 55) → 490, 367 (12 levels, about 26 px a level); (121, 55) → 520, 367 (12 levels, about 26 px a level); (123, 55) → 460, 367 (12 levels, about 26 px a level) |

### Highlands (4242), 128×128

**overview** (the whole map from the south):

- before: [before/highlands-128-overview.jpg](before/highlands-128-overview.jpg)
- after: [after/highlands-128-overview.jpg](after/highlands-128-overview.jpg)
- after, greyscale: [after/highlands-128-overview-grey.jpg](after/highlands-128-overview-grey.jpg); protanopia: [after/highlands-128-overview-protanopia.jpg](after/highlands-128-overview-protanopia.jpg); deuteranopia: [after/highlands-128-overview-deuteranopia.jpg](after/highlands-128-overview-deuteranopia.jpg); tritanopia: [after/highlands-128-overview-tritanopia.jpg](after/highlands-128-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (90, 76) → 634, 333; (22, 78) → 260, 304; (101, 91) → 684, 274 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (71, 63) → 533, 382; (54, 62) → 435, 386; (75, 66) → 555, 368 |
| dry ground | (65, 62) → 499, 372; (68, 85) → 514, 274; (62, 38) → 480, 493 |
| contaminated ground | (31, 84) → 313, 278; (26, 84) → 286, 278; (21, 84) → 259, 278 |
| contaminated beside moist ground | (35, 82) → 333, 282; (30, 82) → 307, 286; (25, 82) → 279, 286 |
| living tree | (62, 59) → 481, 396 (Birch); (69, 68) → 521, 357 (Birch); (55, 65) → 441, 369 (Birch) |
| dead tree | (65, 70) → 499, 329 (Oak); (58, 80) → 460, 286 (Oak); (61, 42) → 474, 464 (Oak) |
| ruin | (85, 48) → 623, 442 (3 high); (74, 38) → 557, 495 (7 high); (69, 36) → 525, 516 (1 high) |
| the start | (44, 59) → 375, 389 |
| slope | (77, 63) → 568, 373 (rises toward the west); (50, 58) → 410, 393 (rises toward the west); (53, 49) → 426, 441 (rises toward the south) |
| dam site | (73, 64) → 544, 377; (58, 53) → 457, 430; (77, 60) → 568, 397 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/highlands-128-start.jpg](before/highlands-128-start.jpg)
- after: [after/highlands-128-start.jpg](after/highlands-128-start.jpg)
- after, greyscale: [after/highlands-128-start-grey.jpg](after/highlands-128-start-grey.jpg); protanopia: [after/highlands-128-start-protanopia.jpg](after/highlands-128-start-protanopia.jpg); deuteranopia: [after/highlands-128-start-deuteranopia.jpg](after/highlands-128-start-deuteranopia.jpg); tritanopia: [after/highlands-128-start-tritanopia.jpg](after/highlands-128-start-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (52, 51) → 754, 445; (51, 50) → 750, 474; (51, 49) → 766, 494 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (48, 59) → 571, 327; (48, 57) → 597, 361; (51, 57) → 652, 345 |
| dry ground | (44, 63) → 444, 300; (46, 63) → 484, 281; (46, 72) → 393, 168 |
| contaminated ground | (32, 83) → 15, 68 |
| contaminated beside moist ground | (35, 82) → 76, 42; (33, 82) → 42, 73; (34, 83) → 49, 37 |
| living tree | (39, 57) → 405, 448 (Birch); (37, 59) → 322, 392 (Birch); (42, 52) → 541, 525 (Oak) |
| dead tree | (39, 66) → 299, 241 (Birch); (38, 67) → 261, 233 (Birch); (43, 71) → 346, 188 (Birch) |
| ruin | not in view |
| the start | (44, 59) → 490, 355 |
| slope | (50, 58) → 623, 323 (rises toward the west); (53, 49) → 808, 466 (rises toward the south); (27, 54) → 111, 650 (rises toward the north) |
| dam site | (51, 53) → 712, 401; (53, 53) → 744, 398; (55, 53) → 781, 378 |
| tall cliff | not in view |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/highlands-128-badwater.jpg](before/highlands-128-badwater.jpg)
- after: [after/highlands-128-badwater.jpg](after/highlands-128-badwater.jpg)
- after, greyscale: [after/highlands-128-badwater-grey.jpg](after/highlands-128-badwater-grey.jpg); protanopia: [after/highlands-128-badwater-protanopia.jpg](after/highlands-128-badwater-protanopia.jpg); deuteranopia: [after/highlands-128-badwater-deuteranopia.jpg](after/highlands-128-badwater-deuteranopia.jpg); tritanopia: [after/highlands-128-badwater-tritanopia.jpg](after/highlands-128-badwater-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (24, 79) → 397, 641; (23, 80) → 363, 632; (23, 79) → 374, 653 |
| badwater | (34, 90) → 480, 350; (32, 90) → 443, 367; (37, 89) → 544, 339 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (34, 80) → 596, 502; (32, 80) → 556, 524; (36, 80) → 635, 482 |
| dry ground | (39, 94) → 527, 218; (35, 96) → 437, 236; (40, 93) → 555, 224 |
| contaminated ground | (32, 87) → 474, 403; (31, 86) → 465, 428; (32, 85) → 496, 435 |
| contaminated beside moist ground | (34, 83) → 560, 438; (33, 82) → 551, 477; (35, 82) → 592, 445 |
| living tree | (15, 80) → 158, 722 (Pine) |
| dead tree | (28, 100) → 274, 226 (Oak); (26, 100) → 241, 254 (Oak); (37, 103) → 405, 112 (Birch) |
| ruin | not in view |
| the start | not in view |
| slope | (44, 79) → 802, 406 (rises toward the north); (50, 86) → 809, 237 (rises toward the west) |
| dam site | not in view |
| tall cliff | not in view |

**falls** (the tallest waterfall, from downstream):

- before: [before/highlands-128-falls.jpg](before/highlands-128-falls.jpg)
- after: [after/highlands-128-falls.jpg](after/highlands-128-falls.jpg)
- after, greyscale: [after/highlands-128-falls-grey.jpg](after/highlands-128-falls-grey.jpg); protanopia: [after/highlands-128-falls-protanopia.jpg](after/highlands-128-falls-protanopia.jpg); deuteranopia: [after/highlands-128-falls-deuteranopia.jpg](after/highlands-128-falls-deuteranopia.jpg); tritanopia: [after/highlands-128-falls-tritanopia.jpg](after/highlands-128-falls-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | (19, 113) → 735, 318; (19, 115) → 723, 275; (19, 101) → 842, 708 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (9, 111) → 348, 57; (9, 106) → 359, 485; (8, 106) → 315, 485 |
| dry ground | (22, 113) → 865, 235; (23, 112) → 914, 257; (22, 115) → 846, 193 |
| contaminated ground | (13, 101) → 542, 685; (14, 101) → 594, 685; (15, 101) → 646, 685 |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | (15, 104) → 637, 535 (Birch); (16, 104) → 678, 526 (Birch); (17, 104) → 734, 533 (Birch) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (10, 110) → 401, 235 (7 levels, about 33 px a level); (9, 110) → 356, 235 (7 levels, about 33 px a level); (8, 110) → 312, 235 (7 levels, about 33 px a level) |

**cliff** (the tallest dry cliff, from in front):

- before: [before/highlands-128-cliff.jpg](before/highlands-128-cliff.jpg)
- after: [after/highlands-128-cliff.jpg](after/highlands-128-cliff.jpg)
- after, greyscale: [after/highlands-128-cliff-grey.jpg](after/highlands-128-cliff-grey.jpg); protanopia: [after/highlands-128-cliff-protanopia.jpg](after/highlands-128-cliff-protanopia.jpg); deuteranopia: [after/highlands-128-cliff-deuteranopia.jpg](after/highlands-128-cliff-deuteranopia.jpg); tritanopia: [after/highlands-128-cliff-tritanopia.jpg](after/highlands-128-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | (19, 113) → 834, 462 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (9, 111) → 529, 220; (6, 107) → 414, 562; (8, 106) → 490, 588 |
| dry ground | (22, 113) → 948, 383; (22, 115) → 923, 353; (3, 124) → 359, 150 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (8, 114) → 485, 150 (Pine); (9, 114) → 522, 149 (Pine); (11, 115) → 598, 146 (Pine) |
| dead tree | (15, 104) → 794, 621 (Birch); (2, 117) → 314, 304 (Birch); (16, 104) → 830, 612 (Birch) |
| ruin | (8, 123) → 490, 132 (2 high); (7, 123) → 463, 132 (2 high) |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (8, 110) → 490, 367 (7 levels, about 33 px a level); (9, 110) → 528, 367 (7 levels, about 33 px a level); (7, 111) → 453, 349 (7 levels, about 32 px a level) |

### Lake Basin (4242), 128×128

**overview** (the whole map from the south):

- before: [before/lakeBasin-128-overview.jpg](before/lakeBasin-128-overview.jpg)
- after: [after/lakeBasin-128-overview.jpg](after/lakeBasin-128-overview.jpg)
- after, greyscale: [after/lakeBasin-128-overview-grey.jpg](after/lakeBasin-128-overview-grey.jpg); protanopia: [after/lakeBasin-128-overview-protanopia.jpg](after/lakeBasin-128-overview-protanopia.jpg); deuteranopia: [after/lakeBasin-128-overview-deuteranopia.jpg](after/lakeBasin-128-overview-deuteranopia.jpg); tritanopia: [after/lakeBasin-128-overview-tritanopia.jpg](after/lakeBasin-128-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (63, 63) → 487, 378; (67, 65) → 510, 369; (59, 65) → 464, 369 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (73, 92) → 540, 256; (81, 39) → 601, 495; (59, 32) → 461, 535 |
| dry ground | (65, 116) → 497, 149; (88, 110) → 614, 169; (100, 25) → 742, 557 |
| contaminated ground | (46, 100) → 401, 226 |
| contaminated beside moist ground | (50, 99) → 421, 230; (45, 98) → 395, 234; (40, 98) → 369, 234 |
| living tree | (62, 92) → 482, 252 (Oak); (74, 36) → 558, 510 (Birch); (93, 78) → 652, 308 (Birch) |
| dead tree | (51, 102) → 426, 212 (Pine); (73, 109) → 539, 172 (Pine); (98, 31) → 721, 522 (Birch) |
| ruin | (112, 92) → 751, 231 (1 high); (116, 89) → 778, 236 (4 high); (121, 90) → 802, 236 (2 high) |
| the start | (69, 98) → 519, 224 |
| slope | (95, 64) → 674, 362 (rises toward the north); (30, 78) → 304, 301 (rises toward the north); (41, 102) → 374, 205 (rises toward the west) |
| dam site | (92, 62) → 655, 383 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/lakeBasin-128-start.jpg](before/lakeBasin-128-start.jpg)
- after: [after/lakeBasin-128-start.jpg](after/lakeBasin-128-start.jpg)
- after, greyscale: [after/lakeBasin-128-start-grey.jpg](after/lakeBasin-128-start-grey.jpg); protanopia: [after/lakeBasin-128-start-protanopia.jpg](after/lakeBasin-128-start-protanopia.jpg); deuteranopia: [after/lakeBasin-128-start-deuteranopia.jpg](after/lakeBasin-128-start-deuteranopia.jpg); tritanopia: [after/lakeBasin-128-start-tritanopia.jpg](after/lakeBasin-128-start-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (65, 90) → 504, 577; (69, 89) → 608, 549; (68, 89) → 586, 561 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (69, 94) → 540, 440; (70, 94) → 561, 429; (71, 94) → 582, 418 |
| dry ground | (74, 105) → 508, 196; (68, 107) → 370, 217; (66, 107) → 330, 235 |
| contaminated ground | not in view |
| contaminated beside moist ground | (50, 99) → 33, 562 |
| living tree | (73, 97) → 587, 333 (Pine); (70, 102) → 461, 276 (Pine); (66, 102) → 384, 318 (Pine) |
| dead tree | (72, 109) → 423, 96 (Pine); (76, 110) → 491, 29 (Pine); (71, 113) → 361, 28 (Pine) |
| ruin | not in view |
| the start | (69, 98) → 490, 355 |
| slope | not in view |
| dam site | not in view |
| tall cliff | (74, 107) → 492, 152 (3 levels, about 10 px a level); (70, 108) → 387, 167 (3 levels, about 6 px a level); (68, 109) → 352, 172 (3 levels, about 11 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/lakeBasin-128-badwater.jpg](before/lakeBasin-128-badwater.jpg)
- after: [after/lakeBasin-128-badwater.jpg](after/lakeBasin-128-badwater.jpg)
- after, greyscale: [after/lakeBasin-128-badwater-grey.jpg](after/lakeBasin-128-badwater-grey.jpg); protanopia: [after/lakeBasin-128-badwater-protanopia.jpg](after/lakeBasin-128-badwater-protanopia.jpg); deuteranopia: [after/lakeBasin-128-badwater-deuteranopia.jpg](after/lakeBasin-128-badwater-deuteranopia.jpg); tritanopia: [after/lakeBasin-128-badwater-tritanopia.jpg](after/lakeBasin-128-badwater-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | (44, 113) → 508, 355; (44, 111) → 530, 385; (43, 110) → 523, 409 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (43, 96) → 703, 681; (54, 100) → 845, 483; (41, 96) → 662, 706 |
| dry ground | (41, 113) → 450, 318; (41, 115) → 428, 287; (40, 114) → 418, 311 |
| contaminated ground | (43, 101) → 631, 579; (45, 101) → 670, 557; (47, 101) → 707, 536 |
| contaminated beside moist ground | (43, 98) → 673, 639; (41, 98) → 633, 663; (45, 98) → 712, 615 |
| living tree | (56, 104) → 826, 391 (Pine); (57, 103) → 855, 400 (Pine); (58, 102) → 888, 399 (Pine) |
| dead tree | (50, 109) → 671, 312 (Birch); (41, 121) → 367, 187 (Pine); (51, 115) → 618, 190 (Pine) |
| ruin | (28, 123) → 60, 233 (6 high); (27, 124) → 51, 266 (1 high) |
| the start | not in view |
| slope | (36, 109) → 387, 435 (rises toward the north); (49, 106) → 683, 407 (rises toward the west); (41, 102) → 581, 571 (rises toward the west) |
| dam site | not in view |
| tall cliff | (37, 105) → 467, 553 (3 levels, about 12 px a level); (36, 104) → 457, 585 (3 levels, about 13 px a level); (35, 104) → 435, 597 (3 levels, about 13 px a level) |

**falls** (the tallest waterfall, from downstream):

- before: [before/lakeBasin-128-falls.jpg](before/lakeBasin-128-falls.jpg)
- after: [after/lakeBasin-128-falls.jpg](after/lakeBasin-128-falls.jpg)
- after, greyscale: [after/lakeBasin-128-falls-grey.jpg](after/lakeBasin-128-falls-grey.jpg); protanopia: [after/lakeBasin-128-falls-protanopia.jpg](after/lakeBasin-128-falls-protanopia.jpg); deuteranopia: [after/lakeBasin-128-falls-deuteranopia.jpg](after/lakeBasin-128-falls-deuteranopia.jpg); tritanopia: [after/lakeBasin-128-falls-tritanopia.jpg](after/lakeBasin-128-falls-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (15, 86) → 414, 328; (14, 87) → 449, 179; (16, 85) → 372, 354 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (13, 92) → 652, 135; (13, 83) → 287, 135; (13, 93) → 693, 135 |
| dry ground | not in view |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (16, 90) → 576, 171 (Birch); (17, 92) → 680, 195 (Birch); (23, 94) → 848, 387 (Pine) |
| dead tree | not in view |
| ruin | not in view |
| the start | not in view |
| slope | (13, 85) → 368, 133 (rises toward the south) |
| dam site | not in view |
| tall cliff | (15, 81) → 200, 262 (4 levels, about 30 px a level); (13, 79) → 139, 214 (4 levels, about 29 px a level); (13, 78) → 99, 214 (4 levels, about 29 px a level) |

**cliff** (the tallest dry cliff, from in front):

- before: [before/lakeBasin-128-cliff.jpg](before/lakeBasin-128-cliff.jpg)
- after: [after/lakeBasin-128-cliff.jpg](after/lakeBasin-128-cliff.jpg)
- after, greyscale: [after/lakeBasin-128-cliff-grey.jpg](after/lakeBasin-128-cliff-grey.jpg); protanopia: [after/lakeBasin-128-cliff-protanopia.jpg](after/lakeBasin-128-cliff-protanopia.jpg); deuteranopia: [after/lakeBasin-128-cliff-deuteranopia.jpg](after/lakeBasin-128-cliff-deuteranopia.jpg); tritanopia: [after/lakeBasin-128-cliff-tritanopia.jpg](after/lakeBasin-128-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (121, 74) → 490, 501; (120, 74) → 450, 501; (122, 74) → 530, 501 |
| dry ground | (117, 77) → 328, 231; (117, 79) → 339, 204; (116, 78) → 295, 217 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (120, 68) → 436, 642 (Oak); (125, 68) → 692, 650 (Birch); (122, 67) → 540, 683 (Oak) |
| dead tree | (122, 78) → 531, 180 (Pine); (124, 77) → 607, 195 (Pine); (120, 79) → 450, 172 (Pine) |
| ruin | (112, 92) → 250, 74 (1 high) |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (121, 76) → 490, 367 (6 levels, about 35 px a level); (120, 76) → 450, 367 (6 levels, about 35 px a level); (119, 76) → 409, 367 (6 levels, about 35 px a level) |

### Delta (4242), 128×128

**overview** (the whole map from the south):

- before: [before/delta-128-overview.jpg](before/delta-128-overview.jpg)
- after: [after/delta-128-overview.jpg](after/delta-128-overview.jpg)
- after, greyscale: [after/delta-128-overview-grey.jpg](after/delta-128-overview-grey.jpg); protanopia: [after/delta-128-overview-protanopia.jpg](after/delta-128-overview-protanopia.jpg); deuteranopia: [after/delta-128-overview-deuteranopia.jpg](after/delta-128-overview-deuteranopia.jpg); tritanopia: [after/delta-128-overview-tritanopia.jpg](after/delta-128-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (63, 57) → 487, 408; (70, 58) → 528, 403; (76, 59) → 563, 399 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (64, 63) → 493, 378; (68, 65) → 516, 369; (63, 69) → 487, 352 |
| dry ground | (63, 78) → 487, 313; (57, 77) → 454, 318; (52, 75) → 426, 326 |
| contaminated ground | (76, 44) → 567, 471; (80, 44) → 592, 471; (75, 34) → 564, 526 |
| contaminated beside moist ground | (76, 46) → 567, 461; (54, 42) → 431, 482; (50, 40) → 405, 489 |
| living tree | (59, 59) → 463, 389 (Pine); (53, 56) → 427, 408 (Oak); (60, 47) → 469, 452 (Pine) |
| dead tree | (49, 78) → 408, 290 (Birch); (45, 76) → 385, 299 (Pine); (58, 87) → 461, 271 (Birch) |
| ruin | (44, 121) → 393, 122 (1 high); (39, 121) → 369, 122 (1 high); (7, 124) → 216, 127 (4 high) |
| the start | (55, 65) → 441, 358 |
| slope | (86, 62) → 622, 374 (rises toward the north); (55, 41) → 436, 477 (rises toward the south); (55, 87) → 444, 264 (rises toward the north) |
| dam site | (65, 60) → 499, 392; (69, 56) → 522, 413; (73, 59) → 545, 398 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/delta-128-start.jpg](before/delta-128-start.jpg)
- after: [after/delta-128-start.jpg](after/delta-128-start.jpg)
- after, greyscale: [after/delta-128-start-grey.jpg](after/delta-128-start-grey.jpg); protanopia: [after/delta-128-start-protanopia.jpg](after/delta-128-start-protanopia.jpg); deuteranopia: [after/delta-128-start-deuteranopia.jpg](after/delta-128-start-deuteranopia.jpg); tritanopia: [after/delta-128-start-tritanopia.jpg](after/delta-128-start-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (62, 58) → 720, 437; (61, 56) → 730, 486; (56, 54) → 657, 586 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (59, 65) → 571, 327; (59, 67) → 546, 295; (62, 67) → 602, 281 |
| dry ground | (55, 69) → 444, 300; (53, 69) → 403, 318; (53, 72) → 374, 284 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (50, 57) → 484, 583 (Oak); (37, 67) → 50, 534 (Birch); (60, 47) → 874, 680 (Pine) |
| dead tree | (49, 78) → 216, 153 (Birch); (45, 76) → 142, 222 (Pine); (48, 79) → 186, 147 (Birch) |
| ruin | not in view |
| the start | (55, 65) → 490, 355 |
| slope | (43, 78) → 110, 265 (rises toward the north); (55, 87) → 277, 53 (rises toward the north); (44, 89) → 50, 90 (rises toward the north) |
| dam site | (59, 55) → 705, 528; (65, 60) → 750, 366; (66, 59) → 781, 378 |
| tall cliff | (48, 73) → 259, 294 (4 levels, about 11 px a level); (49, 76) → 253, 238 (4 levels, about 11 px a level); (52, 87) → 223, 68 (4 levels, about 9 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/delta-128-badwater.jpg](before/delta-128-badwater.jpg)
- after: [after/delta-128-badwater.jpg](after/delta-128-badwater.jpg)
- after, greyscale: [after/delta-128-badwater-grey.jpg](after/delta-128-badwater-grey.jpg); protanopia: [after/delta-128-badwater-protanopia.jpg](after/delta-128-badwater-protanopia.jpg); deuteranopia: [after/delta-128-badwater-deuteranopia.jpg](after/delta-128-badwater-deuteranopia.jpg); tritanopia: [after/delta-128-badwater-tritanopia.jpg](after/delta-128-badwater-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | (30, 96) → 480, 348; (33, 95) → 544, 337; (33, 93) → 566, 366 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | not in view |
| dry ground | (31, 86) → 616, 492; (33, 86) → 654, 471; (37, 102) → 540, 193 |
| contaminated ground | (30, 100) → 439, 283; (32, 100) → 475, 268; (29, 101) → 412, 278 |
| contaminated beside moist ground | not in view |
| living tree | (29, 79) → 679, 645 (Oak) |
| dead tree | (29, 90) → 531, 434 (Pine); (25, 90) → 444, 471 (Pine); (24, 91) → 414, 467 (Pine) |
| ruin | (9, 88) → 54, 672 (3 high) |
| the start | not in view |
| slope | (33, 103) → 462, 205 (rises toward the north); (18, 90) → 293, 546 (rises toward the west); (44, 89) → 812, 308 (rises toward the north) |
| dam site | not in view |
| tall cliff | (47, 86) → 899, 327 (3 levels, about 6 px a level) |

**cliff** (the tallest dry cliff, from in front):

- before: [before/delta-128-cliff.jpg](before/delta-128-cliff.jpg)
- after: [after/delta-128-cliff.jpg](after/delta-128-cliff.jpg)
- after, greyscale: [after/delta-128-cliff-grey.jpg](after/delta-128-cliff-grey.jpg); protanopia: [after/delta-128-cliff-protanopia.jpg](after/delta-128-cliff-protanopia.jpg); deuteranopia: [after/delta-128-cliff-deuteranopia.jpg](after/delta-128-cliff-deuteranopia.jpg); tritanopia: [after/delta-128-cliff-tritanopia.jpg](after/delta-128-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | not in view |
| dry ground | (75, 109) → 490, 469; (74, 109) → 439, 469; (76, 109) → 541, 469 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | (72, 112) → 346, 225 (Pine); (78, 113) → 631, 214 (Pine); (70, 111) → 237, 246 (Pine) |
| ruin | not in view |
| the start | not in view |
| slope | (74, 104) → 427, 698 (rises toward the north) |
| dam site | not in view |
| tall cliff | (75, 111) → 490, 367 (3 levels, about 43 px a level); (76, 111) → 539, 367 (3 levels, about 43 px a level); (77, 111) → 588, 367 (3 levels, about 43 px a level) |

### Islands (4242), 128×128

**overview** (the whole map from the south):

- before: [before/islands-128-overview.jpg](before/islands-128-overview.jpg)
- after: [after/islands-128-overview.jpg](after/islands-128-overview.jpg)
- after, greyscale: [after/islands-128-overview-grey.jpg](after/islands-128-overview-grey.jpg); protanopia: [after/islands-128-overview-protanopia.jpg](after/islands-128-overview-protanopia.jpg); deuteranopia: [after/islands-128-overview-deuteranopia.jpg](after/islands-128-overview-deuteranopia.jpg); tritanopia: [after/islands-128-overview-tritanopia.jpg](after/islands-128-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (63, 63) → 487, 375; (67, 65) → 510, 365; (59, 65) → 464, 365 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (56, 55) → 445, 406; (64, 76) → 493, 312; (56, 50) → 444, 431 |
| dry ground | (118, 50) → 832, 413; (116, 43) → 829, 450; (114, 38) → 822, 477 |
| contaminated ground | (99, 110) → 671, 165; (85, 119) → 596, 136; (36, 120) → 354, 133 |
| contaminated beside moist ground | (86, 106) → 603, 202; (36, 107) → 352, 198; (31, 106) → 326, 202 |
| living tree | (61, 75) → 476, 312 (Oak); (51, 49) → 413, 434 (Birch); (46, 49) → 381, 433 (Birch) |
| dead tree | (101, 98) → 689, 206 (Oak); (90, 19) → 679, 593 (Pine); (118, 56) → 827, 375 (Pine) |
| ruin | (104, 29) → 766, 531 (1 high); (38, 111) → 363, 179 (1 high); (110, 94) → 740, 220 (1 high) |
| the start | (64, 112) → 492, 172 |
| slope | (26, 86) → 286, 265 (rises toward the north); (18, 82) → 240, 281 (rises toward the west); (76, 112) → 553, 167 (rises toward the north) |
| dam site | (24, 79) → 273, 305 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/islands-128-start.jpg](before/islands-128-start.jpg)
- after: [after/islands-128-start.jpg](after/islands-128-start.jpg)
- after, greyscale: [after/islands-128-start-grey.jpg](after/islands-128-start-grey.jpg); protanopia: [after/islands-128-start-protanopia.jpg](after/islands-128-start-protanopia.jpg); deuteranopia: [after/islands-128-start-deuteranopia.jpg](after/islands-128-start-deuteranopia.jpg); tritanopia: [after/islands-128-start-tritanopia.jpg](after/islands-128-start-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (64, 101) → 638, 592; (63, 101) → 616, 605; (65, 101) → 660, 579 |
| badwater | (91, 115) → 966, 10 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (64, 108) → 540, 440; (64, 116) → 444, 300; (65, 108) → 561, 429 |
| dry ground | (66, 123) → 401, 81; (68, 123) → 443, 65; (64, 124) → 348, 83 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (60, 113) → 389, 376 (Pine); (68, 109) → 613, 363 (Birch); (57, 111) → 343, 451 (Oak) |
| dead tree | (57, 118) → 271, 310 (Pine); (56, 117) → 254, 337 (Pine); (54, 118) → 205, 339 (Pine) |
| ruin | not in view |
| the start | (64, 112) → 490, 355 |
| slope | (76, 112) → 726, 238 (rises toward the north) |
| dam site | not in view |
| tall cliff | (65, 118) → 446, 238 (4 levels, about 11 px a level); (64, 119) → 415, 231 (4 levels, about 11 px a level); (75, 116) → 666, 174 (3 levels, about 11 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/islands-128-badwater.jpg](before/islands-128-badwater.jpg)
- after: [after/islands-128-badwater.jpg](after/islands-128-badwater.jpg)
- after, greyscale: [after/islands-128-badwater-grey.jpg](after/islands-128-badwater-grey.jpg); protanopia: [after/islands-128-badwater-protanopia.jpg](after/islands-128-badwater-protanopia.jpg); deuteranopia: [after/islands-128-badwater-deuteranopia.jpg](after/islands-128-badwater-deuteranopia.jpg); tritanopia: [after/islands-128-badwater-tritanopia.jpg](after/islands-128-badwater-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | (90, 119) → 498, 341; (91, 117) → 537, 361; (90, 121) → 477, 312 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (86, 104) → 590, 686; (84, 104) → 552, 709; (89, 103) → 660, 671 |
| dry ground | (80, 120) → 296, 403; (80, 122) → 278, 372; (79, 121) → 267, 397 |
| contaminated ground | (87, 118) → 453, 372; (88, 116) → 493, 394; (87, 120) → 432, 342 |
| contaminated beside moist ground | (87, 106) → 585, 636; (89, 105) → 634, 633 |
| living tree | (80, 108) → 425, 666 (Pine); (81, 107) → 457, 674 (Pine); (78, 109) → 376, 668 (Pine) |
| dead tree | (84, 124) → 336, 300 (Pine); (75, 118) → 206, 486 (Oak); (74, 120) → 165, 461 (Oak) |
| ruin | (99, 116) → 697, 266 (5 high); (105, 118) → 763, 215 (2 high) |
| the start | not in view |
| slope | (93, 109) → 673, 460 (rises toward the north); (76, 112) → 302, 634 (rises toward the north) |
| dam site | not in view |
| tall cliff | (86, 111) → 516, 543 (3 levels, about 11 px a level); (88, 110) → 566, 530 (5 levels, about 11 px a level); (87, 110) → 546, 551 (3 levels, about 11 px a level) |

**falls** (the tallest waterfall, from downstream):

- before: [before/islands-128-falls.jpg](before/islands-128-falls.jpg)
- after: [after/islands-128-falls.jpg](after/islands-128-falls.jpg)
- after, greyscale: [after/islands-128-falls-grey.jpg](after/islands-128-falls-grey.jpg); protanopia: [after/islands-128-falls-protanopia.jpg](after/islands-128-falls-protanopia.jpg); deuteranopia: [after/islands-128-falls-deuteranopia.jpg](after/islands-128-falls-deuteranopia.jpg); tritanopia: [after/islands-128-falls-tritanopia.jpg](after/islands-128-falls-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (10, 94) → 450, 344; (9, 94) → 451, 311; (10, 93) → 411, 344 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (8, 99) → 653, 192; (9, 100) → 700, 215; (8, 100) → 694, 192 |
| dry ground | not in view |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | not in view |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | not in view |

**cliff** (the tallest dry cliff, from in front):

- before: [before/islands-128-cliff.jpg](before/islands-128-cliff.jpg)
- after: [after/islands-128-cliff.jpg](after/islands-128-cliff.jpg)
- after, greyscale: [after/islands-128-cliff-grey.jpg](after/islands-128-cliff-grey.jpg); protanopia: [after/islands-128-cliff-protanopia.jpg](after/islands-128-cliff-protanopia.jpg); deuteranopia: [after/islands-128-cliff-deuteranopia.jpg](after/islands-128-cliff-deuteranopia.jpg); tritanopia: [after/islands-128-cliff-tritanopia.jpg](after/islands-128-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (119, 65) → 573, 526; (125, 64) → 330, 501; (125, 65) → 324, 526 |
| dry ground | (122, 61) → 450, 231; (123, 61) → 409, 231; (124, 61) → 369, 231 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (123, 68) → 391, 576 (Oak); (124, 68) → 352, 579 (Oak); (110, 60) → 879, 389 (Pine) |
| dead tree | (119, 59) → 568, 176 (Pine); (124, 57) → 380, 146 (Birch); (125, 57) → 351, 148 (Birch) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (121, 62) → 490, 367 (6 levels, about 35 px a level); (120, 62) → 530, 367 (6 levels, about 35 px a level); (122, 62) → 450, 367 (6 levels, about 35 px a level) |

### River Valley (4242), 256×256

**overview** (the whole map from the south):

- before: [before/riverValley-256-overview.jpg](before/riverValley-256-overview.jpg)
- after: [after/riverValley-256-overview.jpg](after/riverValley-256-overview.jpg)
- after, greyscale: [after/riverValley-256-overview-grey.jpg](after/riverValley-256-overview-grey.jpg); protanopia: [after/riverValley-256-overview-protanopia.jpg](after/riverValley-256-overview-protanopia.jpg); deuteranopia: [after/riverValley-256-overview-deuteranopia.jpg](after/riverValley-256-overview-deuteranopia.jpg); tritanopia: [after/riverValley-256-overview-tritanopia.jpg](after/riverValley-256-overview-tritanopia.jpg)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (127, 115) → 489, 400; (139, 116) → 524, 398; (119, 112) → 465, 408 |
| badwater | not in view |
| water partly bad | (174, 154) → 618, 317 (26% bad); (182, 160) → 639, 304 (37% bad); (186, 172) → 646, 280 (39% bad) |
| badwater meets clean water | (180, 150) → 636, 324 (from badwater at (181, 151) to clean water at (179, 149)) |
| moist ground | (136, 123) → 515, 381; (145, 125) → 541, 376; (121, 100) → 470, 436 |
| dry ground | (130, 127) → 497, 364; (126, 140) → 486, 343; (137, 141) → 517, 340 |
| contaminated ground | (148, 141) → 548, 340; (145, 106) → 543, 421; (155, 132) → 569, 360 |
| contaminated beside moist ground | (142, 106) → 534, 421; (156, 149) → 570, 323; (162, 109) → 593, 414 |
| living tree | (127, 127) → 489, 370 (Pine); (137, 131) → 517, 361 (Birch); (123, 118) → 477, 391 (Birch) |
| dead tree | (115, 148) → 455, 321 (Pine); (137, 151) → 516, 315 (Oak); (100, 134) → 411, 352 (Oak) |
| ruin | (196, 98) → 700, 441 (1 high); (116, 211) → 461, 192 (2 high); (79, 209) → 366, 198 (1 high) |
| the start | (117, 125) → 459, 370 |
| slope | (126, 117) → 486, 389 (rises toward the north); (138, 129) → 521, 359 (rises toward the east); (137, 118) → 518, 386 (rises toward the north) |
| dam site | (130, 122) → 497, 376; (135, 117) → 512, 396; (120, 114) → 468, 403 |
| tall cliff | not in view |

**start** (close to the start):

- before: [before/riverValley-256-start.jpg](before/riverValley-256-start.jpg)
- after: [after/riverValley-256-start.jpg](after/riverValley-256-start.jpg)
- after, greyscale: [after/riverValley-256-start-grey.jpg](after/riverValley-256-start-grey.jpg); protanopia: [after/riverValley-256-start-protanopia.jpg](after/riverValley-256-start-protanopia.jpg); deuteranopia: [after/riverValley-256-start-deuteranopia.jpg](after/riverValley-256-start-deuteranopia.jpg); tritanopia: [after/riverValley-256-start-tritanopia.jpg](after/riverValley-256-start-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (117, 113) → 651, 622; (116, 113) → 628, 635; (118, 113) → 672, 609 |
| badwater | (143, 131) → 859, 93; (143, 135) → 810, 49; (145, 131) → 888, 80 |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (108, 119) → 362, 599; (135, 121) → 876, 276; (99, 120) → 120, 699 |
| dry ground | (111, 131) → 303, 337; (110, 132) → 272, 330; (109, 131) → 260, 356 |
| contaminated ground | (151, 132) → 962, 23 |
| contaminated beside moist ground | not in view |
| living tree | (110, 122) → 368, 500 (Pine); (125, 127) → 624, 260 (Pine); (111, 119) → 434, 554 (Pine) |
| dead tree | (116, 130) → 413, 284 (Birch); (115, 132) → 376, 274 (Birch); (114, 133) → 341, 268 (Birch) |
| ruin | not in view |
| the start | (117, 125) → 490, 355 |
| slope | (116, 119) → 545, 490 (rises toward the north); (126, 117) → 776, 428 (rises toward the north); (121, 109) → 807, 657 (rises toward the south) |
| dam site | (120, 114) → 700, 562; (121, 113) → 736, 571; (130, 122) → 799, 248 |
| tall cliff | (128, 119) → 803, 356 (4 levels, about 11 px a level); (130, 119) → 841, 336 (4 levels, about 11 px a level); (126, 109) → 920, 578 (4 levels, about 8 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: [before/riverValley-256-badwater.jpg](before/riverValley-256-badwater.jpg)
- after: [after/riverValley-256-badwater.jpg](after/riverValley-256-badwater.jpg)
- after, greyscale: [after/riverValley-256-badwater-grey.jpg](after/riverValley-256-badwater-grey.jpg); protanopia: [after/riverValley-256-badwater-protanopia.jpg](after/riverValley-256-badwater-protanopia.jpg); deuteranopia: [after/riverValley-256-badwater-deuteranopia.jpg](after/riverValley-256-badwater-deuteranopia.jpg); tritanopia: [after/riverValley-256-badwater-tritanopia.jpg](after/riverValley-256-badwater-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | (193, 176) → 490, 355 (41% bad); (192, 175) → 482, 379 (41% bad); (194, 175) → 519, 362 (41% bad) |
| badwater meets clean water | not in view |
| moist ground | (196, 172) → 591, 389; (197, 173) → 597, 364; (195, 171) → 584, 414 |
| dry ground | (199, 170) → 670, 393; (198, 169) → 665, 418; (200, 171) → 675, 369 |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (187, 177) → 361, 383 (Pine); (191, 182) → 393, 273 (Pine); (183, 177) → 283, 416 (Pine) |
| dead tree | (224, 182) → 902, 60 (Pine); (227, 181) → 950, 53 (Pine) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | not in view |

**falls** (the tallest waterfall, from downstream):

- before: [before/riverValley-256-falls.jpg](before/riverValley-256-falls.jpg)
- after: [after/riverValley-256-falls.jpg](after/riverValley-256-falls.jpg)
- after, greyscale: [after/riverValley-256-falls-grey.jpg](after/riverValley-256-falls-grey.jpg); protanopia: [after/riverValley-256-falls-protanopia.jpg](after/riverValley-256-falls-protanopia.jpg); deuteranopia: [after/riverValley-256-falls-deuteranopia.jpg](after/riverValley-256-falls-deuteranopia.jpg); tritanopia: [after/riverValley-256-falls-tritanopia.jpg](after/riverValley-256-falls-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (84, 79) → 490, 350; (84, 78) → 449, 296; (83, 79) → 490, 270 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | (85, 75) → 317, 301; (87, 76) → 351, 360; (86, 75) → 311, 329 |
| dry ground | not in view |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | not in view |
| ruin | not in view |
| the start | not in view |
| slope | (81, 83) → 644, 201 (rises toward the north); (77, 74) → 317, 123 (rises toward the south) |
| dam site | not in view |
| tall cliff | not in view |

**meets** (close to where badwater meets clean water):

- before: [before/riverValley-256-meets.jpg](before/riverValley-256-meets.jpg)
- after: [after/riverValley-256-meets.jpg](after/riverValley-256-meets.jpg)
- after, greyscale: [after/riverValley-256-meets-grey.jpg](after/riverValley-256-meets-grey.jpg); protanopia: [after/riverValley-256-meets-protanopia.jpg](after/riverValley-256-meets-protanopia.jpg); deuteranopia: [after/riverValley-256-meets-deuteranopia.jpg](after/riverValley-256-meets-deuteranopia.jpg); tritanopia: [after/riverValley-256-meets-tritanopia.jpg](after/riverValley-256-meets-tritanopia.jpg)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (174, 152) → 557, 373; (175, 152) → 587, 360; (173, 151) → 545, 413 |
| badwater | (171, 155) → 415, 370; (170, 155) → 385, 384; (169, 154) → 364, 398 |
| water partly bad | (174, 154) → 519, 353 (26% bad); (173, 155) → 473, 343 (85% bad); (174, 155) → 502, 330 (63% bad) |
| badwater meets clean water | (173, 155) → 482, 341 (from badwater at (173, 156) to clean water at (173, 153)); (172, 155) → 452, 355 (from badwater at (171, 156) to clean water at (173, 153)); (180, 150) → 765, 353 (from badwater at (181, 151) to clean water at (179, 149)) |
| moist ground | (175, 163) → 411, 161; (173, 164) → 346, 163; (174, 164) → 372, 153 |
| dry ground | (164, 166) → 74, 221; (169, 169) → 186, 118; (163, 166) → 44, 232 |
| contaminated ground | (170, 158) → 333, 271; (174, 159) → 440, 245; (169, 158) → 302, 285 |
| contaminated beside moist ground | (175, 160) → 452, 215; (174, 161) → 411, 207; (176, 161) → 464, 186 |
| living tree | not in view |
| dead tree | (186, 152) → 873, 230 (Oak); (187, 151) → 921, 240 (Oak) |
| ruin | not in view |
| the start | not in view |
| slope | (175, 157) → 497, 273 (rises toward the north); (185, 160) → 694, 113 (rises toward the south) |
| dam site | (167, 147) → 418, 648; (168, 146) → 475, 652; (169, 145) → 535, 677 |
| tall cliff | not in view |

**cliff** (the tallest dry cliff, from in front):

- before: [before/riverValley-256-cliff.jpg](before/riverValley-256-cliff.jpg)
- after: [after/riverValley-256-cliff.jpg](after/riverValley-256-cliff.jpg)
- after, greyscale: [after/riverValley-256-cliff-grey.jpg](after/riverValley-256-cliff-grey.jpg); protanopia: [after/riverValley-256-cliff-protanopia.jpg](after/riverValley-256-cliff-protanopia.jpg); deuteranopia: [after/riverValley-256-cliff-deuteranopia.jpg](after/riverValley-256-cliff-deuteranopia.jpg); tritanopia: [after/riverValley-256-cliff-tritanopia.jpg](after/riverValley-256-cliff-tritanopia.jpg)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | not in view |
| dry ground | (129, 153) → 490, 482; (132, 153) → 490, 255; (129, 152) → 537, 482 |
| contaminated ground | (146, 141) → 820, 210; (147, 142) → 786, 201; (146, 140) → 848, 210 |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | (152, 143) → 736, 143 (Oak) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (131, 153) → 490, 366 (4 levels, about 40 px a level); (131, 152) → 536, 366 (4 levels, about 40 px a level); (131, 154) → 444, 366 (4 levels, about 40 px a level) |

### Beavertopia, 256×256 (workshop map, local only)

**overview** (the whole map from the south):

- before: `.scratch/map-look/before/beavertopia-256-overview.jpg` (local only)
- after: `.scratch/map-look/after/beavertopia-256-overview.jpg` (local only)
- after, greyscale: `.scratch/map-look/after/beavertopia-256-overview-grey.jpg` (local only); protanopia: `.scratch/map-look/after/beavertopia-256-overview-protanopia.jpg` (local only); deuteranopia: `.scratch/map-look/after/beavertopia-256-overview-deuteranopia.jpg` (local only); tritanopia: `.scratch/map-look/after/beavertopia-256-overview-tritanopia.jpg` (local only)

- Tall cliffs are in view, but each level takes under 6 pixels here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | (137, 170) → 516, 265; (153, 91) → 568, 471; (91, 26) → 363, 663 |
| badwater | (11, 64) → 108, 532 |
| water partly bad | (110, 184) → 444, 261 (25% bad); (106, 200) → 435, 232 (24% bad); (102, 216) → 427, 204 (25% bad) |
| badwater meets clean water | not in view |
| moist ground | (140, 160) → 525, 284; (161, 114) → 590, 399; (174, 137) → 622, 355 |
| dry ground | (163, 106) → 597, 419; (99, 95) → 401, 439; (165, 96) → 606, 444 |
| contaminated ground | (121, 198) → 473, 223; (57, 102) → 275, 427; (49, 97) → 248, 439 |
| contaminated beside moist ground | (106, 184) → 434, 260; (131, 226) → 499, 173; (103, 238) → 431, 167 |
| living tree | (127, 127) → 489, 378 (Pine); (133, 134) → 506, 353 (Pine); (122, 139) → 475, 335 (Birch) |
| dead tree | (133, 123) → 506, 386 (Oak); (141, 120) → 529, 393 (Oak); (151, 127) → 557, 376 (Oak) |
| ruin | (140, 112) → 527, 412 (5 high); (131, 100) → 501, 443 (3 high); (247, 153) → 820, 319 (2 high) |
| the start | (96, 161) → 403, 287 |
| slope | (191, 64) → 697, 537 (rises toward the south); (249, 149) → 829, 323 (rises toward the west); (248, 82) → 871, 481 (rises toward the south) |
| dam site | not in view |
| tall cliff | not in view |

**start** (close to the start):

- before: `.scratch/map-look/before/beavertopia-256-start.jpg` (local only)
- after: `.scratch/map-look/after/beavertopia-256-start.jpg` (local only)
- after, greyscale: `.scratch/map-look/after/beavertopia-256-start-grey.jpg` (local only); protanopia: `.scratch/map-look/after/beavertopia-256-start-protanopia.jpg` (local only); deuteranopia: `.scratch/map-look/after/beavertopia-256-start-deuteranopia.jpg` (local only); tritanopia: `.scratch/map-look/after/beavertopia-256-start-tritanopia.jpg` (local only)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (117, 167) → 811, 50; (119, 168) → 829, 24 |
| badwater | not in view |
| water partly bad | (109, 184) → 486, 74 (40% bad); (109, 186) → 470, 55 (35% bad); (108, 189) → 434, 33 (30% bad) |
| badwater meets clean water | not in view |
| moist ground | (90, 176) → 250, 279; (89, 177) → 225, 274; (88, 178) → 201, 268 |
| dry ground | (96, 157) → 540, 440; (92, 161) → 405, 408; (96, 165) → 444, 300 |
| contaminated ground | (106, 179) → 484, 135 |
| contaminated beside moist ground | (107, 185) → 450, 69 |
| living tree | (107, 153) → 826, 384 (Pine); (93, 176) → 300, 247 (Oak); (102, 146) → 843, 589 (Birch) |
| dead tree | (89, 164) → 304, 371 (Birch); (90, 167) → 294, 315 (Birch); (87, 161) → 284, 451 (Pine) |
| ruin | not in view |
| the start | (96, 161) → 490, 355 |
| slope | not in view |
| dam site | not in view |
| tall cliff | (90, 183) → 187, 147 (4 levels, about 9 px a level); (89, 184) → 149, 107 (3 levels, about 9 px a level); (94, 185) → 233, 62 (3 levels, about 9 px a level) |

**badwater** (close to the badwater, where it meets clean water if it does):

- before: `.scratch/map-look/before/beavertopia-256-badwater.jpg` (local only)
- after: `.scratch/map-look/after/beavertopia-256-badwater.jpg` (local only)
- after, greyscale: `.scratch/map-look/after/beavertopia-256-badwater-grey.jpg` (local only); protanopia: `.scratch/map-look/after/beavertopia-256-badwater-protanopia.jpg` (local only); deuteranopia: `.scratch/map-look/after/beavertopia-256-badwater-deuteranopia.jpg` (local only); tritanopia: `.scratch/map-look/after/beavertopia-256-badwater-tritanopia.jpg` (local only)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | (101, 245) → 490, 361 (41% bad); (100, 244) → 482, 384 (41% bad); (102, 246) → 498, 338 (41% bad) |
| badwater meets clean water | not in view |
| moist ground | (104, 242) → 579, 373; (103, 241) → 572, 398; (105, 243) → 585, 349 |
| dry ground | (85, 250) → 53, 291 |
| contaminated ground | (101, 237) → 583, 484; (100, 236) → 576, 513; (101, 235) → 609, 521 |
| contaminated beside moist ground | (101, 238) → 571, 467; (103, 238) → 609, 447 |
| living tree | (95, 241) → 416, 461 (Birch); (94, 246) → 335, 361 (Birch); (94, 251) → 284, 259 (Birch) |
| dead tree | (97, 250) → 362, 279 (Oak); (98, 254) → 339, 201 (Birch); (92, 254) → 198, 182 (Birch) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | not in view |

**falls** (the tallest waterfall, from downstream):

- before: `.scratch/map-look/before/beavertopia-256-falls.jpg` (local only)
- after: `.scratch/map-look/after/beavertopia-256-falls.jpg` (local only)
- after, greyscale: `.scratch/map-look/after/beavertopia-256-falls-grey.jpg` (local only); protanopia: `.scratch/map-look/after/beavertopia-256-falls-protanopia.jpg` (local only); deuteranopia: `.scratch/map-look/after/beavertopia-256-falls-deuteranopia.jpg` (local only); tritanopia: `.scratch/map-look/after/beavertopia-256-falls-tritanopia.jpg` (local only)

| Meaning | Tile → position in the image |
|---|---|
| clean water | (113, 105) → 442, 677; (114, 104) → 490, 721 |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | not in view |
| dry ground | not in view |
| contaminated ground | not in view |
| contaminated beside moist ground | not in view |
| living tree | (114, 110) → 485, 390 (Oak); (116, 108) → 579, 457 (Oak); (118, 107) → 691, 495 (Oak) |
| dead tree | not in view |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (111, 110) → 339, 303 (12 levels, about 37 px a level) |

**meets** (close to where badwater meets clean water):

- before: `.scratch/map-look/before/beavertopia-256-meets.jpg` (local only)
- after: `.scratch/map-look/after/beavertopia-256-meets.jpg` (local only)
- after, greyscale: `.scratch/map-look/after/beavertopia-256-meets-grey.jpg` (local only); protanopia: `.scratch/map-look/after/beavertopia-256-meets-protanopia.jpg` (local only); deuteranopia: `.scratch/map-look/after/beavertopia-256-meets-deuteranopia.jpg` (local only); tritanopia: `.scratch/map-look/after/beavertopia-256-meets-tritanopia.jpg` (local only)

- No dry cliff of three levels or more faces the camera here: count levels in the cliff pose.

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | (110, 179) → 474, 356 (7% bad); (109, 179) → 445, 369 (71% bad); (110, 184) → 400, 251 (25% bad) |
| badwater meets clean water | (110, 178) → 490, 366 (from badwater at (109, 177) to clean water at (111, 179)) |
| moist ground | not in view |
| dry ground | (98, 171) → 92, 704 |
| contaminated ground | (106, 179) → 355, 402 |
| contaminated beside moist ground | (106, 184) → 287, 288; (107, 185) → 303, 256 |
| living tree | (103, 180) → 229, 379 (Birch); (118, 175) → 832, 132 (Oak); (100, 178) → 161, 501 (Oak) |
| dead tree | (102, 194) → 34, 57 (Oak) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | not in view |

**cliff** (the tallest dry cliff, from in front):

- before: `.scratch/map-look/before/beavertopia-256-cliff.jpg` (local only)
- after: `.scratch/map-look/after/beavertopia-256-cliff.jpg` (local only)
- after, greyscale: `.scratch/map-look/after/beavertopia-256-cliff-grey.jpg` (local only); protanopia: `.scratch/map-look/after/beavertopia-256-cliff-protanopia.jpg` (local only); deuteranopia: `.scratch/map-look/after/beavertopia-256-cliff-deuteranopia.jpg` (local only); tritanopia: `.scratch/map-look/after/beavertopia-256-cliff-tritanopia.jpg` (local only)

| Meaning | Tile → position in the image |
|---|---|
| clean water | not in view |
| badwater | not in view |
| water partly bad | not in view |
| badwater meets clean water | not in view |
| moist ground | not in view |
| dry ground | (64, 136) → 490, 164; (63, 135) → 463, 155; (63, 137) → 517, 155 |
| contaminated ground | (69, 136) → 490, 580; (70, 137) → 516, 597; (70, 138) → 543, 597 |
| contaminated beside moist ground | not in view |
| living tree | not in view |
| dead tree | (60, 133) → 412, 114 (Birch); (64, 143) → 687, 166 (Pine); (65, 149) → 843, 257 (Pine) |
| ruin | not in view |
| the start | not in view |
| slope | not in view |
| dam site | not in view |
| tall cliff | (65, 136) → 490, 367 (15 levels, about 23 px a level); (65, 137) → 516, 367 (15 levels, about 23 px a level); (67, 135) → 463, 405 (14 levels, about 24 px a level) |

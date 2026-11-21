# Ruins in the opening view (D493's first step)

Forces play, for planning's ruling (B) on #236 of 2026-11-20. Generator 0.10.54, branch `gen/ruins-frame`.

## The view

D493's frame, the opening camera pulled back: `src/core/analysis/opening.ts` defines it as "the default zoom's widest
(CameraService.blueprint.json `DefaultZoomLimits.Max`): the opening camera pulled back, which the opening frame is judged
at" (`VISTA_ZOOM` = 6, about 154 tiles from the start's target, the same turn and target as the game's first camera).

## What the bundled maps do (19 maps, read locally, numbers only)

- Nearest stand of ruins from the start: median 42 tiles, none within 30; 21 columns (2–75), long axis over short 1.6,
  3 levels over the start, on dry ground.
- A stand whole in the pulled-back view at 100 px or more of a 1600 × 900 frame: **14 of 19**.

## What was built

`src/core/gen/frameStand.ts` `planFrameStand`, called last in `planResources` (not with Easy start). Ahead along the
look and raised first; within that a step's foot, a rise, a rim, the far side of the water; never on green, never
between the start and its water, past Normal's clear distance, past the two-ways intention's reach where a map draws it
(`TWO_WAYS_REACH`, measured from the start's middle as the check measures). The prototype's switch is gone.

## The bars (84 maps: seven themes, seeds 1–12, 256², Normal; dev 0.10.53 against the branch)

| Bar | dev 0.10.53 | 0.10.54 |
| --- | --- | --- |
| The map's planned stand whole in the pulled-back view, 100 px or more (bar 75 of 84) | none planned | **84 of 84** (median 694 px, least 362) |
| Any stand of the map's ruins whole there, 100 px or more | 70 | 84 |
| Easy's metal row met (a measure, not a bar) | 2 (82 missed) | 4 (80 missed) |
| Maps with an Easy row worse | | 0 |
| Maps whose start, land or attempts changed | | 0 |
| Maps whose room fell under 400 | | 0 |
| Checks failing | none | none |

The stands: 18 columns median (12–36), long axis over short 1.7 median (2.3 at most), 43 tiles out, 2 levels up; 74 of
84 ahead within 45° of the look, 67 raised. The map's scrap stays level: 1,395,360 → 1,395,015 over the 84 (at most
0.41 % on a map, Delta 10), ruins 30,111 → 30,034 columns. The stand's scrap comes out of the map's: the other fields
give it back a column at a time from their edges, the farthest from the start first (`giveBackScrap`). It cannot be
kept from the fields before they are planned, since the stand is planned last and a smaller field budget would move
the ground the groves and berries after them take; trimming the fields after everything is planned moves nothing else.

How it got there: placed after the other fields it reshuffled their berries and groves (44 maps lost an Easy row, mostly
wood); planned last, only Delta 4 changed, its start moving 4 tiles because a stand 59.7 tiles out tipped the two-ways
intention's sides and set off a re-steer. Keeping the stand past that intention's reach, measured from the start's
middle as the check measures (`TWO_WAYS_REACH`, 60), keeps Delta 4 as it was.

The first sheet showed a Highlands stand as a strip along a terrace (long axis 2.9 × the short); the cap went from 3 to
the bundled stands' 2.4, which re-placed the 16 stands over it and moved no bar.

A review then found the stand's scrap added on top of the map's (+5 %) and its column count not held to 12–36 (a stand
of 11 had passed). The fields now give back its scrap, and a stand outside 12–36 is tried again; no bar moved.

Sheet: `C:\dgm-showcase\ruins-frame2\sheet.jpg` (local; 8 maps at 256², the page's own render of the pulled-back view).

## Still short

- Easy's metal row is still missed on 80 of 84 maps: the stand stands about 42 tiles out, past Easy's 25-tile walk,
  and Easy start keeps its own field (the stand is not planned with Easy start).
- The bundled maps hold 14 of 19 on the same bar; the generator now places one on every map, so a map whose view
  offers no place would keep its ruins as they are (none of the 84).

# Showcase craft (progress)

ROADMAP Wave 1: showcase-quality maps made by hand with the editor, to find what the tools can't yet do. Each round
makes maps in a real browser against the dev server (Generate, then the forces, brushes, Block tool and water tools),
logs every gap, closes the page's gaps and sends the rest to their owners on #236.

## The maps

| Round | Map | Theme | Character | Picture |
|---|---|---|---|---|
| 1 | Twin Falls Gorge | Canyon, 128² | A river gorge between mesas; two falls drop off the mesas, one onto a green terrace, one into the side channel; start on the high mesa with berries and oaks | [view](../sheets/showcase-1-twin-falls-gorge.jpg) |
| 1 | Caldera Lake | Highlands, 128² | Craterize on the high plateau, filled by two sources; a breach through the west wall drops the lake to level 11, so the central peak stands as an island and the terraces show as shores; the outflow joins the river below | [view](../sheets/showcase-2-caldera-lake.jpg) |
| 1 | Glacier Hollow | Highlands, 128² | Glaciate drawn down an existing valley in the high block: a U-trough with a chain of lakes and green benches, woods painted on them | [view](../sheets/showcase-3-glacier-hollow.jpg) |
| 2 | Glacier Hollow | Highlands, 128² | The trough rebuilt: four lakes stepping down it (8.2, 7.2, 5.5, 4.3) with a short fall between each, shores made irregular with freehand bays, woods on the moist rim | [view](../sheets/showcase-r2-glacier-hollow.jpg) |
| 2 | Twin Falls Gorge | Canyon, 128² | Each fall now fed by a winding stream 4–5 tiles wide and a level deep (bed two down, a lip at the fall); the upper sources moved back across the plateau | [view](../sheets/showcase-r2-twin-falls-gorge.jpg) |
| 2 | Caldera Lake | Highlands, 128² | The island raised to a peak 4.8 levels above the lake, its outline broken up; the straight breach replaced by one that winds through the rim at 11, falls 3 levels, then runs at 8 to the drop | [view](../sheets/showcase-r2-caldera-lake.jpg) |

## The gap log

One line per gap: where, what was meant, what happened, the cost to a player. Owner: page (this stream), milestone
(core, water, generator) or forces play (the look). Status: open, fixed (PR), sent (#236 comment).

| # | Where | Meant | Happened | Cost | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | Carve, drawn from the mesa down into the gorge | A cut with a waterfall where it leaves the mesa | A bowl 20 tiles long and 5 deep, graded into a ramp; no fall | A waterfall needs Lower and a source placed by hand (3 tools, ~6 steps) | milestone | sent (#236, milestone) |
| 2 | Unleash on a source at the mesa's edge | Water runs off the edge as a fall | A click sent it the other way, over the mesa; the drawn course (drag from the button) bowled 12 tiles wide and left a 4-level step, no fall; the drag gesture is found only by reading the plan | Undo, then by hand as in 1 | milestone (course), page (gesture) | sent (#236, milestone: the course); the gesture fixed (#789: Unleash's tooltip says to drag onto the map) |
| 3 | Smart Lower from a source on flat ground | A channel one level below the ground, leading the water off | It read the source's 0.1-deep sheet as the pond and cut 2 tiles; message "Lower 2 tiles" | Undo the source, cut the channel dry, place the source again | page | fixed (#784) |
| 4 | Lower, Size 1.5, along a line | An even channel | Dotted edges: every third tile keeps the old level as a knob | A Smooth pass or hand clicks on each knob | page (core brush) | fixed (#787) |
| 5 | Moving the start | Press the house and drag it | Pressing the house model picks the ground 2 tiles behind it and starts a selection; with the Select tool open the start can't be grabbed at all | Close Select (X), find the start's own tile and press there | page | fixed (#771) |
| 6 | A way down from a 4-level mesa | A walkable ramp from the start to the land below | No ramp tool: a Slope is one level; a stair needs each tile lowered by hand (a second Lower pass on a tile already below its neighbours misses it) and 4 Slopes placed and turned one by one (~15 strokes, 4 items) | Start left on the mesa without a path down (380 walkable tiles, 2 mine sites out of reach) | page | fixed (#779: the Slope dragged down lays a stair) |
| 7 | Checks list fixes | Fix the three problems one after another | Each fix closes the list | Reopen the list for each fix | page | closed: doesn't happen on dev |
| 8 | Share link, Canyon 128² | A link in a moment | ~35 s on the third try | Waiting; looks broken | milestone (#672) | sent (#236, milestone) |
| 9 | Moisture green around water | Green that follows the water's shape | Near-perfect discs around sources and ponds | Looks stamped next to the game's irregular wet ground | forces play | sent (#236, forces play) |
| 10 | The hero picture (.timber thumbnail) | The map's best side | About 45% sky, the map corner-on from high up; the falls can't be seen | The map's picture in the game's list sells it short | forces play | sent (#236, forces play) |
| 11 | Flatten (Level 11, Ground) across a lake's rim | Cut a notch through the rim | Tiles under the lake's 0.1-deep edge count as wet, so the stroke skipped the rim (D322: Ground is dry tiles only) | One wasted stroke; redo in Both | page | closed: by design (D322) |
| 12 | Naturalize (Size 4, Strength 5) along a Flatten-cut outlet | Rough, natural banks | It changed 6 tiles; the banks stay ruler-straight | An outlet that looks dug by hand | milestone (D399) | sent (#236, milestone) |
| 13 | Flatten with a set Level below the ground under the pointer | The dab lands on the tile under the pointer | It aims on the target level's plane: top-down, dabs landed 1–2 tiles off and left one-tile pillars; at a low angle a dab on a 13 tile at Level 10 changed nothing | Undo; precise notches can't be dabbed | page | fixed (#783) |
| 14 | Glaciate, Size Auto (30) at 128² | A U-trough down the drawn valley | It lowered nearly the whole 45×60 high block into one basin lake; Size 14 gives the trough | Undo, then guess a Size | milestone | sent (#236, milestone) |
| 15 | Reset view and middle-drag while Top-down is on | Reset to the usual angle; middle-drag tilts | Reset view stays top-down and middle-drag does nothing, with no hint | Confused several times; press Top-down again | page | fixed (#785: middle-drag orbits out of Top-down); Reset view keeps the mode by design (D184) |
| 16 | Esc while "Opening your map…" after Generate | Cancel and keep the settings just picked | It cancels, and the panel's Theme and seed go back to the old map's | Pick the settings again | page | fixed (#786) |
| 17 | Rectangle selection in the orbit view | A one-row box | It took 6 rows: the box is drawn on the screen, not on the ground | Undo; every exact box made in Top-down | page | open |
| 18 | A box dragged in Select, zoomed out in Top-down, starting 2–3 tiles from a water source | A selection | The drag grabbed and moved the source (4 times in one session) | A silent change to the water, seen only in History; worked round with Hide objects | page | fixed (with Select open, a box begun beside a source selects; a press on the source still takes it) |
| 19 | Building lakes that step down a trough | Each lake one level below the last | A lake stands at its notch plus the flow's head (a notch at 5 gave 5.5); the only readout of a lake's level is hovering one tile; two lakes ended level with each other until the outlet's own spill was cut | About 12 Flatten and Fill edits and many height readings for one chain of 4 lakes | page (idea: the Wand on water says the lake's level) | open |
| 20 | A stream cut one level into a plateau | Water that reads as a stream | 0.08 deep, a wet sheet: a stream needs its bed two levels down and a one-level lip where it falls | One more pass for each stream, found only by reading the depths | page (idea: Smart Lower leaves a lip) | open |
| 21 | Mixed woods painted on a dry plateau | Woods on the rim | They're drawn withered (dry soil), with no note while painting; the checks report them afterwards | Undo, then repaint on moist ground | page | closed, no gap: the ring turns amber and says "dry ground: these will die" (D235); missed while painting by script |
| 22 | A freehand outline traced along a lake's sill | Bays along the shore | The outline's own tiles are always taken, so Fill up filled the sill's notch | Three notches cut again | page | open |
| 23 | Naturalize (Size 4, Strength 5) over a stepped island, inside a selection, in Top-down | A rougher, natural island | No change, nothing in History, no word why | The island roughened by hand (9 Cut down and Fill up edits) | page | fixed: by design moist ground keeps its height (an island in a lake is all moist); a stroke that changes nothing now says so beside the pointer |
| 24 | Caldera Lake's round-1 project | A source on the ground | A Water source at 62,86 stands at z 3 under ground at 13, with water drawn on top at 14 and 17 | A buried source the game may not run | milestone | closed, no bug: the map's own spring cave (D488), floor 3, its water drawn at 4.1; the dump misread it |
| 25 | Craterize's rim (Caldera Lake) | A volcano's rim | Concentric terraces of even width all round: the reviewer read it as a stadium or a quarry | Hand work all round the rim to break it up | milestone (force shape) | sent (#236, milestone) |
| 26 | Highlands plateau after Glaciate (Glacier Hollow) | Benches carved by ice | 1–2-tile pillars and stair-stepped bands across the east plateau: the reviewer read them as noise | Smoothing tile by tile | milestone (force shape) | sent (#236, milestone) |

Round 2's look review (a fresh reviewer, against PERFECT): Twin Falls Gorge reaches the bar (left to fix: a ruler-straight
north cliff and 1-tile notches on the east rims). Caldera Lake doesn't: its island reads as a stepped pyramid. Glacier
Hollow is close: its trough needs to read as one U-shape. Round 3 takes these on.

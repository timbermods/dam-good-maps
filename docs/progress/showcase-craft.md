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

## The gap log

One line per gap: where, what was meant, what happened, the cost to a player. Owner: page (this stream), milestone
(core, water, generator) or forces play (the look). Status: open, fixed (PR), sent (#236 comment).

| # | Where | Meant | Happened | Cost | Owner | Status |
|---|---|---|---|---|---|---|
| 1 | Carve, drawn from the mesa down into the gorge | A cut with a waterfall where it leaves the mesa | A bowl 20 tiles long and 5 deep, graded into a ramp; no fall | A waterfall needs Lower and a source placed by hand (3 tools, ~6 steps) | milestone | open |
| 2 | Unleash on a source at the mesa's edge | Water runs off the edge as a fall | A click sent it the other way, over the mesa; the drawn course (drag from the button) bowled 12 tiles wide and left a 4-level step, no fall; the drag gesture is found only by reading the plan | Undo, then by hand as in 1 | milestone (course), page (gesture) | open |
| 3 | Smart Lower from a source on flat ground | A channel one level below the ground, leading the water off | It read the source's 0.1-deep sheet as the pond and cut 2 tiles; message "Lower 2 tiles" | Undo the source, cut the channel dry, place the source again | page | open |
| 4 | Lower, Size 1.5, along a line | An even channel | Dotted edges: every third tile keeps the old level as a knob | A Smooth pass or hand clicks on each knob | page (core brush) | open |
| 5 | Moving the start | Press the house and drag it | Pressing the house model picks the ground 2 tiles behind it and starts a selection; with the Select tool open the start can't be grabbed at all | Close Select (X), find the start's own tile and press there | page | open |
| 6 | A way down from a 4-level mesa | A walkable ramp from the start to the land below | No ramp tool: a Slope is one level; a stair needs each tile lowered by hand (a second Lower pass on a tile already below its neighbours misses it) and 4 Slopes placed and turned one by one (~15 strokes, 4 items) | Start left on the mesa without a path down (380 walkable tiles, 2 mine sites out of reach) | page | open |
| 7 | Checks list fixes | Fix the three problems one after another | Each fix closes the list | Reopen the list for each fix | page | open |
| 8 | Share link, Canyon 128² | A link in a moment | ~35 s on the third try | Waiting; looks broken | milestone (#672) | open |
| 9 | Moisture green around water | Green that follows the water's shape | Near-perfect discs around sources and ponds | Looks stamped next to the game's irregular wet ground | forces play | open |
| 10 | The hero picture (.timber thumbnail) | The map's best side | About 45% sky, the map corner-on from high up; the falls can't be seen | The map's picture in the game's list sells it short | forces play | open |
| 11 | Flatten (Level 11, Ground) across a lake's rim | Cut a notch through the rim | Tiles under the lake's 0.1-deep edge count as wet, so the stroke skipped the rim (D322: Ground is dry tiles only) | One wasted stroke; redo in Both | page | open |
| 12 | Naturalize (Size 4, Strength 5) along a Flatten-cut outlet | Rough, natural banks | It changed 6 tiles; the banks stay ruler-straight | An outlet that looks dug by hand | milestone (D399) | open |
| 13 | Flatten with a set Level below the ground under the pointer | The dab lands on the tile under the pointer | It aims on the target level's plane: top-down, dabs landed 1–2 tiles off and left one-tile pillars; at a low angle a dab on a 13 tile at Level 10 changed nothing | Undo; precise notches can't be dabbed | page | open |
| 14 | Glaciate, Size Auto (30) at 128² | A U-trough down the drawn valley | It lowered nearly the whole 45×60 high block into one basin lake; Size 14 gives the trough | Undo, then guess a Size | milestone | open |
| 15 | Reset view and middle-drag while Top-down is on | Reset to the usual angle; middle-drag tilts | Reset view stays top-down and middle-drag does nothing, with no hint | Confused several times; press Top-down again | page | open |
| 16 | Esc while "Opening your map…" after Generate | Cancel and keep the settings just picked | It cancels, and the panel's Theme and seed go back to the old map's | Pick the settings again | page | open |

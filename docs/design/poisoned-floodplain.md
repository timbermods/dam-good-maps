# The poisoned floodplain: the full design

Planning's design of 2026-11-15 for the premise sketched in [PREMISES.md](../PREMISES.md) §5.4. It is the next premise
after the wall with one gate. This page is what a builder builds from; where it leaves a number to be measured, it
says so and says what to do with the result. The verb is *turn*.

**The line:** "The widest flat on the map is dead along a red stream. Turn the stream into the old dry valley and
bring the river in behind it: the best land is yours."

Id `poisonedPlain`. The card's names: the Red Fall, the Stain (the gulch), the Dry Fork (the old valley), the Slough.

## 1. The land, as geology makes it

A river valley with one broad floor. Everything below is a landform a river makes; nothing is laid along a line
(PREMISES §5.1, "Land first, story second"). The plan says where; stage 2 shapes it by noise and distance.

The valley is not a corridor. Its axis is a wandering line, off the grid by 10° to 35° with one or two gentle bends,
and its walls are not parallel: the floor's width, taken as its mean over any stretch one `P` long, varies along its length between 0.8 and 1.3
of its mean `P` (a spur or a re-entrant may pinch or widen it more for a few tiles).
Each wall wanders by its own line, as the river does and not as an offset of the axis: spurs that step out onto the
floor and re-entrants that step back, 0.15 to 0.3 of `P` either way, a spur and its re-entrant together 1.5 to 3 `P` long (a spur that long by itself
has a flank straight for more than the rule below allows). No wall's foot stays
within 2 tiles of one straight line for longer than 1.2 `P` (`wall.wanders`, a plan invariant; stage 2 holds the same
of the ground). The land's warp moves the foot a tile or two either way, and where it moves against a bend the foot
reads straighter on the ground than drawn, so the plan judges each wall on its foot as the ground will draw it
(`wallFoot`, step 5: the line read through the floor's warp, `FLOOR_WARP`, whose seeds are the spec's alone) and draws
it (up to 32 times, its little noise 3 tiles over 0.3 `P`) until no run of 1.2 `P` of that foot stays within 3 tiles of
a line (the rule's 2 and a tile for the ground's rounding); where no draw does, the straightest is given a spur of 5
tiles, a sine's arch half its straightest run long, at that run's middle and bowed the way the line already bows, up to
4 times (`spurWhereStraight`). Round 3 judged the line itself with a tile and a half's slack for the warp; at 128², the
plain at its least width, the flank between two arches read straight on the ground on every draw of seeds 7 and 9. The
frames' captions give each wall's longest run. The backswamp and the red stream follow the far wall's foot, so they wander as it does.

Across the valley, from the near wall to the far wall:

| Landform | What it is in life | How it is made | Numbers |
|---|---|---|---|
| The near wall | The valley's side the river hugs | Crags and benches from its foot, its crest 4 to 6 over the plain; past it the theme's upland, softened (its plates' straight sides read through noise) | 4 or more over the plain where the first frame sees it |
| The river | The trunk stream, clean, the map's strong springs at its head | Stage 1's course, meandering by flow; it stays in the near third of the floor and leaves by an edge | Width by flow as the lake stair's channels; bed two under the plain |
| The levees | The banks a river builds from its own floods: highest at the channel, uneven, with low places where old floods broke out | A bank along both sides of the river whose height is noise along the course: one level over the plain for most of its length, level with the plain at 2 to 4 low places (each 4 to 8 tiles long). Its width is noise too, 3 to 6 tiles. It follows the meanders, so it is never straight | No stretch of crest at one height longer than a fifth of the river's length on the plain |
| The plain | The floodplain: the largest level land on the map | One level, `L`, falling one level down the valley every 40 to 60 tiles as the river's own profile falls (a riser that wanders across the floor, never a straight step: the scar the river's old bends cut into the higher plain, a chain of arcs 16 to 30 tiles across, each bowed 3 to 8 tiles up the valley, meeting in cusps); at most as many risers as leave the Red Fall's 6 or 7 levels under the water's ceiling of 16 (two), farther apart on a longer plain | Mean width `P` across the valley (§2); its length 0.7 to 0.85 of the side along the axis; the floor (plain and backswamp) 20 to 30 % of the map at every size |
| The backswamp | The floor's lowest strip, under the far wall, where the plain's water gathers | A strip one level under the plain, `L − 1`, 7 to 10 tiles wide at 128² and up to 0.06 of the side on larger maps, its edge with the plain a wandering riser | It carries the red stream, which wanders within it |
| The slough | An old channel a flood cut from a low place in the levee across the plain to the backswamp | A dry bed one level under the plain, 2 or 3 wide, winding (a bend every 6 to 10 widths), from a low place in the levee's middle third (the upper half of it where the red stream joins the river) to the backswamp: of the low places the land offers there, the one at the lower end of the plain's highest level (§6, planning's ruling of 2026-11-17). One at 128²; at 192² and 256² a second a third of the plain or more above it, from a low place the land offers there (a layout with none is drawn again) | Dry on day 1; it is the river-in's way, already in the land |
| The far wall | The valley's other side, the edge of a plateau | Big crags and narrow benches from its foot to a crest 9 to 13 over the plain; past it a plateau that rolls by noise and sinks a few levels toward the edge, its side valleys and old valleys cut in it; hard rock at the gulch's mouth | 8 or more over the plain wherever the first frame sees it (within 60 tiles of the start); sheer only at the Red Fall |
| The side valleys | Hanging valleys of both walls; never a comb | Each a wander: mouths spaced by noise (0.4 to 2.5 of the mean), each off its wall's normal by its own heading (within 35°, its neighbour's never within 10° for more than 12 tiles), turning along it by noise; lengths and widths from wide ranges; some branch, some are alcoves. The far wall's hang at the Red Fall's height | Cut by distance from their wandering lines, their edges jagged by noise |
| The gulch (the Stain) | A hanging side valley: its stream never cut down to the main floor | A side valley of the far wall found by search (§3), its floor 6 or 7 levels over the backswamp at its mouth (D510), narrow (4 to 7 wide), with a narrows 3 or fewer wide within its lower half | The red source at its head |
| The col | A low saddle between the gulch and the next side valley | Found with the gulch: the lowest point of the ridge between them, 2 levels over the gulch's floor at the narrows | Never under 2 |
| The old valley (the Dry Fork) | A dry side valley with its own way out | The neighbour of the gulch on its downstream or upstream side, falling from the col to a map edge of its own, never opening onto the plain | Bare, a few dead trees, no water on day 1 |
| The start's terrace | A river terrace: an older, higher floor the river left when it cut down | A bench 2 levels over the plain at the plain's upstream end, on the plain's side of the river, upstream of the gulch's mouth by the badwater distance or more | Room by the shared floors (D515); its own brook from a spring in the slope behind it |

## 2. The three bands, by the game's soil rules

The numbers come from the core's own soil model (`sim/contamination.ts`, `sim/soil3d.ts`), which is the game's.

- **The dead band.** Water at contamination 0.5 or more poisons soil: pure badwater reaches 7 tiles on the level and
  loses 5/7 for every level climbed, so it climbs one level only within 2 tiles of the water. The red stream runs in
  the backswamp in a bed one level under it, so its water stands at the backswamp's level and poisons the whole strip
  (7 tiles each side, cut by the far wall on one side). The riser up to the plain stops it within 2 tiles. **The dead
  band is the backswamp**, and its edge is the land's own riser, not a distance from a line. The plan counts its share
  from the river's levee foot, the ground from the near wall's, so along the red stretch the land lays the backswamp a
  quarter wider than the plan's line; where the red stream crosses the plain to its join, the ground within 5 to 7
  tiles of it (by noise) lies at its water's level, its wash, a level under the plain, as the plan's arithmetic counts
  it (a bank a level high stopped its poison at 2 tiles).
- **The green band.** The river's moisture crosses the levee onto the plain as far as the soil's reach allows. Measure
  it on the first land (`gameMoistureReach` on a levee one level over the water): call it `M`. The design assumes 8
  to 14 tiles of plain; if the measure is under 6, the levee's low places are widened until the band's mean is 6,
  and no further.
- **The dry band.** What lies between: at least 30 % of the plain and the backswamp together on day 1.

So the plain's width is at least `(M + 9) / 0.7`, about 28 to 34 tiles, which is why the premise needs a side of 128
or more. Above that floor it grows with the map: `P` is 0.28 to 0.36 of the side (planning's ruling of 2026-11-15 on
the first plans, whose floor was 6 to 11 % of the larger maps). The dead and green bands are set by the soil's reach,
so on a larger map it is the dry band that grows: more land to win.

**Day 1's shares of the valley floor** (plain and backswamp): dead 8 to 25 %, dry 30 % or more, green the rest.
Dead trees stand on the dead band (the file's dead state) at the wood budget's density for the land it was; the
green band carries the map's wood by budget; the dry band is open ground with the dry land's dress.

**A badtide.** The river runs red inside its levees. A levee one level over the river's water, 3 tiles wide or more,
holds the poison on the levee itself (1 − 5/7 = 2/7 at its first tile, gone by the third). At a low place the poison
reaches up to 7 tiles onto the plain: a red tongue at each low place for the badtide's days, which the player sees
coming in the Weather view and can close with a levee of their own (the first rung). The green band dries for the
badtide and is not poisoned behind a whole levee.

*As built (step 3):* the river stands up to two deep on its bed (two under the plain) and at its head, where the
longest level reach ends at its springs, at the plain's level or a little over: a river perched between its banks, as
a floodplain's is. So every bank has a core: within 3 tiles of the river's water it stands at least a level over the
land wherever its crest does, whatever its edge's noise (the noise alone left gaps a tile wide), its crest three over
the river's highest bed within those 3 tiles where the land past a riser lies low; the core runs the river's whole
length, and round the springs the ground stands a level over the plain 2 tiles out (`LEVEE_CORE`). In a badtide the
poison stays on the banks and reaches the plain at the low places only, up to 7 tiles from the river there
(`levee.holds`).

**A drought.** The river's springs stop; the red source does not. The only water that runs in a drought is the red
stream. Nothing is designed around this beyond saying it on the card's second line when the map's hazards include
droughts; it is the game's own behaviour.

## 3. The search: found, not laid

Stage 2 makes the valley and its floor from the plan, then searches the far wall for the gulch, the col and the old
valley in the land the shared relief made:

1. Candidates: side valleys of the far wall whose mouths open on the backswamp downstream of the start by the
   badwater distance (D469) or more, and no farther down than 75 % of the plain's length; the nearest that holds is
   preferred, so the Red Fall stays inside the first frame (§5). (A window from 25 % of the length stood 68 to 77
   tiles from the start at 256², beyond the vista camera's 60.)
2. For each, its neighbours along the wall; the pair with the lowest ridge between them and a neighbour that already
   falls to a map edge without touching the plain scores best.
3. The mend, by taking ground away only: the gulch's floor is cut to a steady fall with its hanging mouth kept; the
   narrows is cut to 3 wide or fewer; the col is cut to 2 over the gulch's floor at the narrows; the old valley's bed
   is cut to fall the whole way to its edge. No ground is raised except the least rise that keeps the old valley from
   opening onto the plain (the Gate's `mendFlood`: a swell with a wandering outline, never a bead).
4. A land with no pair within the mend's budget (no more than 4 % of the map's tiles changed) is refused in one line
   and the plan is drawn again; after the bounded tries the generator falls back to the theme, as every premise does.
5. The gulch is also made where the search would find none (planning's verdict on round 2): one far side valley is
   drawn at the plan's gulch (`SideValley.planned`), its length the plan's (16 tiles or more), its mouth's hang the
   plan's, its narrows 0.6 to 0.9 half-wide 7 tiles or more up it (past the Red Fall's hanging valley, which stage 1
   lays as wide as the lip for 5 rows behind it) and so in its lower half, its head 12 tiles in from the map's edge and
   18 from the terrace brook's spring. Round it and the first 24 tiles of its Dry Fork (drawn on the side away from the
   floor, parting from the gulch) the plateau stands as rock a level over the col (`MASSIF`), the col a saddle between
   them at its level; no other side valley is cut within 8 tiles of the Dry Fork. The search then finds it as it finds
   any (the same judge, the same mend). Where a wall's side valleys read as a comb, the wall is drawn again (up to 12
   times), then its last valleys dropped until the comb measure passes; the start's terrace grows down the valley (2
   tiles a time, 30 at most) until its bench holds the start's level land with a margin; and a bank's foot that runs
   along one row for 6 tiles steps out a tile.

## 4. The water story

- **Sources.** The river's springs at its head (the map's strong sources). The start's brook: one small spring. The
  red source: one badwater source at the gulch's head, its strength a fifth (Badwater low), a quarter (medium) or a third (high) of the river's; its stream's bed
  as wide as its flow asks, 3 tiles or more (4 at a quarter), so it runs 0.6 deep or less in a bed a level under the
  backswamp (a bed 2 wide ran it over 1 deep, its water over the backswamp's floor and into the sloughs; 3 wide at a
  quarter, 0.7, and the Red Pool, whose water is its stream's head, stood deeper over its sill than a sill's 0.6 and
  the Red Fall fell short of its height: `RED_BED`). On the backswamp the bed widens at the stream's bends, as a stream
  on a flat scours its bends: by up to 2 tiles either side, by how sharply it turns over two of its points either way
  (50° or more, the whole widening), never within a tile of the backswamp's edges; where it runs straight it keeps its
  own width, and so below the Red Pool and across the plain to its join (`RED_POOLS`, `redHalves`; step 5: the red
  stream read as a one-tile thread in the whole-map frame at 192² and 256²). No width is laid where it does not turn.
- **Courses.** The river: in at one edge, out at another, between its levees. The red stream: down the gulch, over the
  Red Fall (a fall of 6 or 7 levels, the landmark, D510: the gulch's mouth stands that far over the backswamp), along the backswamp, then by the seed either into the river in the river's
  last 30 % (D476, D498: the river is never red above the join) or out by the edge on its own. The start's brook: down
  the terrace into the river. Stage 1 lays each body and channel apart; where a course leaves a body or joins the river
  through ground left between them, that ground is cut to its bed (`courseGaps`): the Red Pool's outlet as wide as
  its stream and at the stream's bed, so the pool's water stands at the stream's head, a level under the backswamp,
  and the Red Fall drops its whole height onto it; where stage 1 lays the pool touching its stream, the floor round
  their meeting cut to that bed too, a tile each way, the walls left (they met on a corner a tile wide and the pool
  stood a level over its stream); the brook's mouth through the river's bank, a tile wide, at the lowest of the brook's own tiles beside it; the red
  stream's last reach and its mouth through the levee as wide as its bed (a mouth a tile wide, or a reach thinned to
  two on its turn into the river, held its water at the backswamp's floor). The Red Pool's sill is its stream's head
  bed, a level under the backswamp (a pool's rim stands at its sill: at the backswamp's level its water stood over
  the floor and ran out across it), so the Red Fall's height reaches a level under its drop on the ground. The gulch's
  floor holds its stream to the lip: a floor tile beside a drop off the floor stands a level over it (`bankGulch`).
- **The river's steps (step 3, round 2).** Width follows flow (the river and the brook, and the red stream's share
  below a join: 6 wide over 18 a second, else 5), never length. A longer river needs more fall: its bed steps down a
  level at natural riffles (where its bends cross over, `riffles`), as few as hold its water `RIVER_STAGE.margin` under
  its ceiling everywhere: the lowest plain within its levees' reach beside it, and at a join the red stream's bed, two
  under the plain (`riverSteps`, a step at the farthest riffle that holds). The stage is measured on the settle: about 1.6 deep over a
  step's lip and 0.0055 deeper a tile up the reach for 15.7 a second on a bed 5 wide, scaled by flow over width to the
  2/3 (`riverStage`). The red stream joins 5 to 9 tiles below one of those steps (a yazoo: it keeps to the backswamp
  until the river has dropped), so its mouth stands wholly below the step with two tiles of the river between (red
  water at a step's foot climbs its first tile). Its last reach is short and falls (step 3, round 3): its way square
  across the river's bank from the plain's side, its bed a level under the backswamp to within `JOIN.drop` (4) tiles of
  the river's middle, then through the levee at the riffle's foot down a level or more to the river's bed, so the red
  water falls into the river and the trunk's water, standing under the red bed, cannot back up it. Its water touches
  the river's nowhere else (`redClear`: stage 1 parts two waters that touch where no link joins them, and once the
  river gave up its tiles across its width there, a dam), nor any reach standing over its bed.
- **The height budget (step 3, round 3).** The plain sits as high as its river's fall needs: its level `L` is 6
  (`PLAIN_LEAST`) plus its risers, plus a level a join keeps for the river's step under the red bed (`JOIN.levels`),
  under the water ceiling less the Red Fall (6 or more) and the gulch's rise (`mostRisersUnder`), so the rim and the
  Red Fall keep their drop above the plain. Joins are drawn at every size.
- **The brook's site (step 3, round 3).** The brook crosses the terrace `brookAt` from its head, and the start is
  taken only among the terrace's sites that already have the brook within the start's walk (the shared gate's 20
  tiles, measured as the walk is: four ways at 1, diagonals at √2): found, not laid.
- **Hazards.** The premise plans the map's badwater. `land/hazards.ts` places none of its own on a map of this
  premise. The start keeps its badwater distance and its clean water (D469, D85).
- **Settings.** Badwater off, Rivers 0 or a side under 128 make the premise ineligible, each with its one-line
  reason. Badwater distance moves the start's terrace up the valley. River flow sets the river's width and `M`.
  Forest density, berries and ruins act as on any map. The controls the premise does not read are greyed by
  `premiseSettings`, as the lake stair's are.

## 5. The start and the first frame

The terrace sits at the plain's head, between a third and a half of the way across from the river, and the gulch is
searched for nearest-first from the badwater distance on, so that the Red Fall stays within the vista camera's 60
tiles; a plan that cannot frame it is drawn again. The start stands on the terrace's lip, looking down the valley
across the plain. By the frame's arithmetic
(`frame.ts`): the terrace's meadow and the river's shine in the near third; the plain's green and dry bands across the
middle; the grey band of dead trees and the red thread beyond; the Red Fall under the far wall, inside the frame and
no smaller than 3 tiles tall on the screen at the opening distance. The fall is the landmark link (`frame.landmark`).
On a long terrace the start stands nearer its brook than the lip, 13 tiles down the valley from where the brook crosses
(`TERRACE.brook`, step 5: at 128² the start's bench needs a long terrace on the narrow floor, and from the lip the
brook ran an 11 to 17 tiles' walk off, the berries by it at the walk's edge), and the gulch's search window is still
measured from the lip, so the Red Fall stays where the plain below the lip frames it. The works must leave the start's ground dry (§7 `riverIn.green`).

The start's numbers are the shared floors and nothing lower. Its reach is the plain, which is why this start should
be among the best the generator makes: every verdict on a map of this premise opens with reach, level land, farmland,
wood and water in reach.

## 6. The ladder

Each rung is a work the land already offers a site for; `gives` is measured as `ladder.ts` measures, at two thirds of
the first build's mean gain, per tile of the side.

| Rung | The work | What it gives |
|---|---|---|
| Small | A notch and a pond on the start's brook | A reserve for the first drought |
| Small | A levee of 4 to 8 tiles across the nearest low place | The green band there kept from a badtide's tongue |
| Small | A levee along 20 tiles of the backswamp's riser where the dead band laps onto the plain | A field won back |
| Medium, **the turn** | A dam of 6 tiles or fewer at the gulch's narrows (or, where the narrows' shoulders stand too low, the gulch's narrowest line below the col's way), below the red source and a level over the col: the red water rises over the col and runs down the Dry Fork to its own edge | The Red Fall stops; the stream's bed in the backswamp goes dry; the dead band's soil clears |
| Large, **the river in** | A weir on the river just below the slough's low place lifts the river one level; it runs through the low place, down the slough and along the old red bed. A gate at the low place shuts it for a badtide | The dry band and the old dead band watered: the floor's green 60 % or more (planning's ruling of 2026-11-17); the dry floor left, by ditch and by pump, is shown on the ladder as what is left to win |
| Either order | The river in before the turn dilutes the red stream below the slough's mouth. Where the mix settles under 0.5, the soil below the mouth clears and the band above it stays dead | A second answer; never required, never refused |

After the turn the gulch behind its dam and the Dry Fork are the places that stay red. The Dry Fork was bare, so
nothing the player valued is spent.

*As built (step 4, `plainWorks.ts`).* The dam stands a level over the col, not at it: at the col's own level the pond
behind it spills both ways and the stream splits (seed 1 at 128²: 500 of 501 red tiles stayed on the floor). The
river in's weir stands at the first slough's bed, a level under the plain, and the slough's mouth is cut to that bed
through its low place to the river (`plainLand.ts` `sloughMouths`; the river's day-1 stage held under it, so the slough
is dry until the weir): a mouth level with the plain let a weir lift the river over the plain as a sheet (seed 1 at
128²: 1,573 tiles). The backswamp's levee stands on whichever riser the dead band laps over most. Each rung's floor
is two thirds of its mean measured gain per tile of the side (`poisonedPlain.ts` `GIVES`), the levees' gains read on
the settled water (`settledClears`).

*Planning's ruling of 2026-11-17 (step 4, rounds 2 and 3).* The river in does not water the whole floor, and should
not: §2's dry band is "more land to win", and dry land that a player can irrigate is the game. So the river in proves
itself by the floor's green, 60 % or more after the weir, and the start not flooded; nothing else. Two further
conditions ruled for round 2 were withdrawn on its results: three times day 1's green (it cannot hold where day 1 is
already a quarter green, and a map that starts greener is not a worse map), and 90 % of the dry floor left ditchable
from the new course (it measured the wrong thing: dry floor on the river's near side is watered from the river, and
plain above a riser or beside the deep lower river is land for a pump, which is play, not a fault). The measure is kept
and shown without a bar: on each map's ladder, what is left to win (`plainMap.ts` `leftToWin`, `Ladder.left`): the
floor's dry share after both works, and of it the share a ditch from any clean water reaches and the share that needs a
pump. Of the low places and sloughs the land offers, the river in takes the one whose course and the old red bed part
the dry band nearest its middle; a second slough only where the land offers a second low place, never drawn. A map
under 60 % green is drawn again. And the map lists a rung only where it pays its floor (`works.paid`), the pond on
every map.

*As built (round 2).* The slough's water reaches every level of the plain under its own and none above it (a riser up
stops it and a player's ditch alike), and the weir backs the river up 70 to 100 tiles, over a second slough's mouth
above the first but never one below it (on 5 of the 7 maps under 60 % in round 1 the second slough lay below the
first and stayed dry). So the first slough leaves from the highest level of the plain its range offers 12 tiles of the
river on, at that level's lower end (`SLOUGH.reach`, `SLOUGH.near`): it and the old red bed then part the dry band
the river in can water nearest its middle (seed 6 at 128²: a slough just past a riser left the level above it dry;
round 1's first slough early in its level left the level below it dry). The second, at 192² and over, stands a third
of the plain or more above the first, at a low place the land offers there; a layout with no room for it is drawn
again (one slough there instead cost three of the first attempts at 192², their clean river and their green). A map whose
floor is under 60 % green with both works built (`riverIn.green`: the weir and the dam raised on the built ground, the
core's settle and soil, the proof's own green) is drawn again. The map lists the levees only where they clear their
floor (`listPaid`), and the pond, the turn and the river in always; the pond is dug wider, a step at a time, until it
holds its floor (`POND`). The turn's pond spills only over the col: its rim at the col's level beside it, but the col's
own way, is raised a level where it runs on to lower ground (`holdTurn`; seed 11 at 128²: a dam at the gulch's mouth
left a shelf of the wall at the col's level, and 400 red tiles stood on the floor), and the way up to the col is cut
three tiles wide (seed 2 at 256²: a notch a tile wide ran the red stream a level deep over the col, so the pond stood
over the dam's crest and a film over it kept the old red bed's water standing on 323 tiles). The dam's line runs square
to the gulch or along a row or a column of the map, whichever is shorter: square to a slanting gulch it steps
diagonally and takes a corner tile at each step (seeds 5 and 12 at 128²: 7 tiles where a row takes 5). The gulch's
floor beside the Red Fall's lip stands a level over the lip wherever it would pour, onto dry ground or onto the Red
Pool's stream running within the gulch's width below the lip (`bankGulch`; seed 6 at 128² poured a second curtain
there), so the lip is the gulch's water's only sill and the fall one curtain (`fall.whole`).

## 7. The invariants

Stage as PREMISES §1.4; each with a hand-broken case in its test.

- **plan:** `plain.levels` (the river's bed, the levee, `L`, the backswamp, the gulch's mouth and the col by number);
  `plain.width` (`P` against §2); `stream.join` (the join in the river's last 30 %, its last reach 4 tiles or less
  and falling a level or more into the river, or the stream's own exit); `start.badwater` (the terrace upstream of
  the mouth by the distance, and of every red water by the distance and the 7 tiles its soil's poison reaches,
  `BAD_SOIL`: the gate counts poisoned soil as badwater); `frame.fall` (the Red Fall in the first frame);
  `poisoned.ladder` (every rung has a site); with §1.4's shared plan checks.
- **land:** `gulch.found` (the pair within the mend's budget); `fall.drop` (the Red Fall 6 or 7 on the ground, from the
  gulch's mouth to the backswamp: the level most of the backswamp's tiles round the mouth's foot stand at, under the
  crest, the water's and the gaps' tiles out); `wall.height` (the far wall 8 or more over the plain, the near wall 4 or more,
  wherever the first frame sees them: the highest ground within 16 tiles out from the foot, 4 either way, the foot
  within 60 tiles of the start); `col.over` (2 or more over the narrows' floor, and the
  lowest way out of the gulch other than its mouth); `fork.own` (the Dry Fork reaches its edge and no tile of the
  plain by `flowThrough` from the col); `levee.wanders` (§1's crest rule, and no straight run of bank over 8 tiles);
  `plain.bands` by the soil's reach on stage 2's ground (dead 8 to 25 %, dry 30 % or more); `terrain.ruled_land`
  (the shared look check, and each wall's side valleys never a comb: `combOf`).
- **settled** (`plainMap.ts`, on the map built and settled once, its life and dead trees in): `source.niche` (step 5:
  the red source's 3 × 3 within `NICHE_NEAR` of the plan's source point, all nine tiles on the Red Spring's pool, else
  on the pool and the Red Fall's bed, else its middle tile on the pool; a land with none is drawn again, where the
  niche fell back to the 3 × 3 round the point unchecked); `river.clean` (no tile
  of the clean water, the river above the join, the brook, the springs and the terrace's pool, red as the game loads
  it: read on the map file's own values, `fileContamination`, whose one threshold is the file's rounding of 1e-6 or
  less to 0, `WATER_CONTAMINATION_LEAST`; "above the join" is
  above the middle of the river's last step over the join and above every river tile beside the red stream's cut,
  `joinEdge`; below it the mix is reported per map, `redMix`, with no bound); `water.leaks` (no settled water off its courses: stage 1's bodies and channels, the gaps cut between them and
  the gulch's floor); `plain.bands` again on the settled water and the game's soil; `fall.settled` (the Red Fall
  drops its drop over the backswamp less the veil's half level, lip to the Red Pool's water, as settled); `fall.whole`
  (planning's ruling of 2026-11-17: the Red Fall one whole curtain as settled by the shared fall judge, `curtain.ts`;
  the pool's only sill is the lip, the gulch's floor beside it, as far as its water reaches, a level over it, as
  `plainLand.ts` `bankGulch` stands it, the Red Pool's stream below the lip included); `levee.holds` (the river's
  water made red as settled, the game's soil: no tile of the plain past the banks poisoned farther than 7 tiles from the
  river along a low place, its half-width and a tile added); every blocking check of the shared gate, the start's
  among them; `riverIn.green` (the floor 60 % green or more with both works built, the core's settle on the built
  ground, and the start's ground, its middle tile and `START_KEEP` (3) tiles round it, dry: a start the river's rise
  covers is no start; step 5, the proof's own condition, which the generator had not checked). A map that fails one is
  drawn again, within 3 settles.
- **works, by number at generate time** (`hold.ts` and `flowThrough`, no settle: speed is a feature): `works.sites`
  (the pond, the turn and the river in sited on every map, the pond holding its floor, the turn 6 tiles or fewer);
  `works.paid` (said: the levees under their floor leave the map's list); `turn.byNumber`
  (with the dam's tiles raised, water behind it stands at the col or over and the col's flow reaches the Dry Fork's
  edge; no path to the plain, nor to the map's edge off the Dry Fork's, `FORK_EDGE`: step 5, where 256² seed 4's
  second land sent a sheet of red water over the plateau to another edge, which `turn.proved` counts a leak); `riverIn.byNumber` (with the weir's tiles raised, the river stands at the low
  place's level or over and the slough carries it to the backswamp, read on the slough's way: from the mouth the tiles
  within its width no higher than the river's level there reach the backswamp's floor at its end. Step 5: `flowThrough`
  sends a pond's water out by one outlet, and where the slough's flat had two at one level it read the slough as dry,
  seed 10 at 128², whose settle greened 60.5 %).
- **proof, offline over seeds** (`tools/plain-works.ts` and `premisePlainWorks.heavy.test.ts`; the generator never
  loads the session, so no map is proved after it opens, which this line said until step 5): `turn.proved` (settled with the dam in: no
  water at 0.5 or more on the valley floor, the Dry Fork carrying the whole source, nothing else flooded);
  `riverIn.proved` (settled with both works, planning's ruling of 2026-11-17, `plainProof.ts` `RIVER_IN`: the floor's
  green 60 % or more, the start not flooded; the 70 % of the first build and round 2's two further conditions are
  withdrawn, §6). Beside it, shown and never a bar, what is left to win (`leftToWin`): of the dry floor, the share a
  ditch a level deep dug from any clean water over dry ground reaches (no tile on the way, itself among them, more than
  a level over the water's surface where the ditch leaves it: a riser up stops it, ground falling away does not), and the
  share that needs a pump.

## 8. What is new in the code

- Soil contamination counted in the spectrum and in a work's gain: `estimateGain` reads moisture today; it gains the
  contaminated share, so the turn's gain is tiles cleared.
- A levee as a form (`raster/`): a bank whose height and width are noise along a course, with low places.
- The sited search of §3 (`siting.ts`, the Gate's range-and-gap search turned to a side valley and its neighbour).
- A work proved by moving water from one way out to another (`turn.byNumber`, `turn.proved`).
- The premise owns the map's hazard plan.

## 9. The build order

One PR a step, each leaving dev green; each sheet is whole maps and starts, the start's numbers first, at most 12
frames, judged by planning.

| # | Step | The sheet |
|---|---|---|
| 1 | The plan: `premises/poisonedPlain.ts`, its diagram, the plan invariants; listed in `premises/dev.ts`, not offered | Diagrams of six seeds at 128², 192², 256² |
| 2 | The land: the valley floor, levees, backswamp, slough, the search and the mend, the land invariants | Six whole maps, north up, and the first frame of each; `M` measured and reported |
| 3 | The water and the hazard: the three sources, the courses, the bands settled, dead trees and wood by budget | The same six settled, with each map's band shares |
| 4 | The works and the ladder: sites, `gives`, the checks by number, the two proofs as a heavy test | Before and after the turn, and after the river in, on three maps |
| 5 | Offered: the card, the words, `PREMISE_IDS`, pairing with River Valley and Delta | The card and the first frame on a phone and a desktop |

## 10. Open, and what closes it

- *Answered (step 3)*: how fast the game clears poisoned soil once the stream is turned. The core's soil rule
  (`sim/soil3d.ts`, the game's): only water at contamination 0.5 or more poisons, and soil with no such water beside
  it loses 0.033 a second, so soil at full contamination clears in about 50 ticks, some 30 game seconds (0.07 of a
  day). What holds it is the water: the red stream's bed drains once the source stops. Measured on the settled maps of
  seeds 1 and 2 at 128² with the red source shut (`WaterSim` on, the game's soil each day): the red water fell from
  about 370 tiles to 9 in a quarter of a day, and the floor's dead tiles (500 to 750 as the bed drained) to none by
  then (the 9, puddles off the floor in the gulch, dried by day 12). So the dead band clears within the first day after
  the turn; the player sees the plain green as soon as the river in waters it. No probe batch: the rule and
  the settled maps agree.
- *Ruled (planning, 2026-11-17), and answered (step 4, round 3).* Whether the river in greens enough of the floor.
  Round 1 measured the 70 % of the first build short on 19 of 36 maps; planning ruled it the wrong bar (§6): the river
  in is proved by the floor 60 % green or more and the start dry, and what is left to win is shown, not barred. Round
  2's two further conditions (three times day 1's green, 90 % ditchable from the new course) were withdrawn on its
  results (§6). The two proofs on seeds 1 to 12 (`tools/plain-works.ts`, round 3, one run after another):

  | Size | First attempt holds | `turn.proved` | `riverIn.proved` | Red Fall whole | Seconds, least to most (mean) |
  |---|---|---|---|---|---|
  | 128² | 6 of 12 | 12 of 12 | 12 of 12 | 12 of 12 | 2.1 to 5.7 (3.4) |
  | 192² | 10 of 12 | 12 of 12 | 12 of 12 | 12 of 12 | 3.8 to 6.3 (4.5) |
  | 256² | 9 of 12 | 12 of 12 | 12 of 12 | 12 of 12 | 6.1 to 16.0 (9.8) |

  Green after the river in, seeds 1 to 12 (%): 128² 67.0, 80.6, 79.1, 71.5, 86.4, 72.6, 91.7, 82.4, 62.4, 86.8, 62.5,
  69.8; 192² 92.2, 75.4, 80.4, 68.8, 73.7, 86.7, 86.1, 72.2, 73.7, 71.6, 80.6, 86.6; 256² 70.6, 75.9, 63.9, 76.7, 61.5,
  63.2, 92.1, 69.0, 66.1, 64.8, 62.6, 72.3. Left to win (`leftToWin`): the floor's dry share after both works 5 to
  33 %; of it a ditch from clean water reaches 97 % or more on 28 of 36, and the pump's share is over a third on 4
  (seeds 3 and 11 at 128², 5 and 11 at 256²: plain above a riser over the slough's level, or beside the lower river
  cut three levels under the plain). The heavy test holds every map to every check and the first attempts to a floor
  (`premisePlainWater.heavy.test.ts` `FIRST`: 9 of 12 at 192² and 256², 6 at 128² as measured).

  *The six first attempts refused at 128², for step 5's decision whether 128² is offered.* Each map holds on a later
  attempt (2 or 3; a generate of 3.4 s on the mean). One is the side's own room, five are the search's:
  (1) seed 1, `plain.bands`: day 1's dead band 7.6 % of the floor, under 8 %; the plan's own count passes, the ground
  reads under it once the slough sits at its level's lower end and the red stream turns off the backswamp below it. A
  margin on the plan's count would draw the plan again instead of the land: the search could do better.
  (2) seed 3, `levee.holds`: a badtide poisons 21 tiles past the levee's low places, beside the map's south edge (y
  121): the levee's core where the river runs near the edge; the search could do better.
  (3, 4) seeds 7 and 9, `wall.wanders`: a wall's foot within 2 tiles of a line for 47 and 45 tiles, the most 43; the
  limit is a share of the plain's width, which stands at its floor at 128², so the bar is tightest there while the
  walls' wander is drawn as at every size: the search could do better (the wander drawn to the limit).
  (5) seed 10, `riverIn.byNumber`: by number the slough does not carry the river to the backswamp, but the settle does,
  60.5 % green: the check by number is stricter than the core; the search could do better.
  (6) seed 11, `riverIn.green`: 51 % green; at 128² one slough only (no room for a second a third of the plain above
  it) on a plain at its narrowest, its far side out of the slough's reach: the side's own room.
- *Answered (step 5): the start, the fixable refusals and 128².* Planning's order: the start first. The generator's
  `riverIn.green` now refuses a start the works flood (§7), as the proof always did. On seeds 1 to 12, all of step 5 in
  (`tools/plain-works.ts`, run beside a capture: alone, the run before the last mend took 2.3, 3.8 and 7.6 s on the mean):

  | Size | First attempt holds | `turn.proved` | `riverIn.proved` | Red Fall whole | Seconds, least to most (mean) |
  |---|---|---|---|---|---|
  | 128² | 8 of 12 | 12 of 12 | 12 of 12 | 12 of 12 | 1.9 to 6.0 (3.1) |
  | 192² | 12 of 12 | 12 of 12 | 12 of 12 | 12 of 12 | 3.5 to 6.1 (4.6) |
  | 256² | 9 of 12 | 12 of 12 | 12 of 12 | 12 of 12 | 5.9 to 17.8 (8.8) |

  Green after the river in, seeds 1 to 12 (%): 128² 62, 65, 83, 76, 71, 76, 88, 76, 61, 71, 96, 70; 192² 73, 73, 85,
  73, 76, 61, 73, 74, 89, 67, 84, 81; 256² 70, 75, 61, 66, 65, 77, 71, 65, 71, 65, 73, 69. The heavy test's floor at
  128² is now 8 (`FIRST`).

  The start, against the shared floors (level land 640, wood 200, berries 30 within the walk, clean water within a
  20-tile walk, reach 1300): at 128² level land 714 to 1034, wood 273 to 542, berries 46 to 90, the clean water a 3 to
  11 tiles' walk (step 4: 11 to 17, berries 33 to 63), reach 2971 to 6111; at 192² 734 to 1162, 258 to 512, 50 to 134,
  4 to 11.4; at 256² 879 to 1551, 240 to 541, 82 to 197, 5 to 13.7. The 128² start stands beside the larger sizes'
  but for berries, which scale with the terrace. Its water walk came from standing the start nearer its brook on a
  long terrace (§5, `TERRACE.brook`).

  Round 3's six 128² refusals: (1) seed 1, `plain.bands`: its land moved with the walls and its bands hold; its first
  attempt is refused now by `riverIn.byNumber`, rightly: its slough runs inside the plain's levee bank, which stands
  over it, and carries nothing (taking the bank off the slough's tiles drained the slough into the river, 32 % green;
  withdrawn). (2) seed 3, `levee.holds`: its land moved with the walls; it holds on its first attempt. (3, 4) seeds 7
  and 9, `wall.wanders`: mended at the cause, the walls judged on their foot as the ground draws it and spurred where
  straight (§1); seed 7 holds first; seed 9's walls hold, and its first attempt is refused by `fall.drop` (no gulch's
  mouth over the backswamp to read the Red Fall from, its far wall drawn anew). (5) seed 10, `riverIn.byNumber`: mended at the
  cause, the slough's carry read on its bed (§7); it holds first. (6) seed 11, `riverIn.green`: its land moved and it
  holds first, 96 % green. Seeds 2 (`fork.own`: the col's water reaches the floor at the map's edge) and 8 (no layout
  in 24 with room for the red stream's join below the sloughs) held first in round 3 and do not now: the walls' new
  draws move the far wall, and with it the gulch and the Dry Fork. Mended besides: seed 6's red source fell back to a
  3 × 3 off the Red Spring's pool (`source.niche`); and 256² seed 4's second land, whose turn sent a sheet of red
  water over the plateau to another edge (`turn.proved` false on 1 of 36), is refused by `turn.byNumber` and holds on
  its third.

  The red stream: its bends widened on the backswamp (§4, `RED_POOLS`) read as a stream in the whole-map frame at
  128² and 256², by the land's own shape. Open: at 256² the stream's own meander can read regular over a long reach
  (seed 2), the plan's meander and not its width.
- *Findings (step 4).* (1) The red source's niche took the bed's first 3 × 3 wherever it lay; on seed 4 at 128² that
  was the gulch's mouth, under the dam, so the dam held nothing back. It now stands within `NICHE_NEAR` of the plan's
  source point, and `turn.byNumber` runs the red water from the niche. (2) Where the narrows' shoulders stand under the
  dam's level, the turn's dam takes the gulch's narrowest line below the col's way; a land whose narrowest line is
  over 6 tiles (seeds 3, 5 and 12 at 128², among others) or whose gulch spills before the col (`turn.byNumber`) is
  drawn again: these cost the first attempt on 12 of 36. (3) Mended in round 2 at their causes (§6 "As built (round 2)"): seed 2 at
  256²'s 323 standing red tiles (the col's notch a tile wide; the turn is proved on 36 of 36); the Red Fall's splits
  (the gulch's floor beside the lip a level over it, onto the Red Pool's stream too; `fall.whole` now refuses a split,
  and none of the 36 is kept split); and the turn's pond spilling beside the col (`holdTurn`: the 9 first attempts
  `turn.byNumber` refused in round 1 hold now). (4) The small rungs are uneven, so the map lists only those that pay:
  of seeds 1 to 12 the low place's levee is listed on 9, 9 and 8 maps at 128², 192² and 256², the backswamp's levee on 8,
  8 and 2, the pond on all 36.
- Pairing beyond River Valley and Delta: after step 5, on the judged maps.
- *Findings (step 3, round 2).* (1) A step of one level does not cut the reach above it off from the red water: the
  river stands about 1.5 deep, over the reach above's bed, and the settle's eddies carry traces up it, 1e-39 to 1e-323
  as far as 47 to 93 tiles above the step on the joined maps at 256² (seeds 3, 5, 7). The file writes them as 0, so
  the game loads that river clean; in the core's doubles they are not 0 (`river.clean` reads the file's values,
  `fileContamination`, round 3). (2) Joins were rare in round 2 (only at 256², seeds 3, 5 and 7): the level budget left
  too few levels for the river's steps and a join. Round 3's budget keeps a level for the join (`JOIN.levels`): on
  seeds 1 to 12 the first attempt joins at 128² 6 times, at 192² twice, at 256² 6 times. (3) The red water stood over
  the backswamp four ways in round 2, each a first-attempt miss, and round 3 mends each at its cause: the Red Pool's
  sill at the backswamp's own level (a pool's rim stands at its sill; now the stream's head bed); the mouth through the
  levee a tile wide, and the last reach thinned to two on its turn into the river (now as wide as its bed); the red
  channel touching the river away from its end, where stage 1's parting gave up the river's tiles across its width and
  dammed it (now its last way square across the bank, `redClear`); the red mouth at a step's foot, where its water
  climbed the step's first tile (now two tiles of the river between). (4) The whole-map frame: the renderer draws
  poisoned soil from afar as its crack pattern's mean, a 20 % tint toward a dull brown (`render3d/palette.ts`
  `contaminationMean`, `materials.ts` `groundColor`): the cracks are 4 texels of the 128 a tile has
  (`soilTexture.ts`), so they fall under a pixel once a tile is drawn under about 32 pixels, and the light look draws
  only the mean at every distance. The dead band then reads as dry ground. Passed to the renderer's owner; no look
  is invented here.
- *Findings (step 3, round 3).* On seeds 1 to 12 at each size the first attempt holds 11 of 12 at 128², 12 of 12 at
  192² and 11 of 12 at 256², in 0.8 to 2.4 s, 1.9 to 2.2 s and 3.6 to 4.8 s; the red stream joins the river on 6, 2
  and 7 of them. (1) The start's walk is the shared gate's (four
  ways at 1, diagonals at √2, from the district's middle), and the start is taken only where the brook already runs
  within it. (2) The gate reads poisoned soil as badwater: the start keeps its badwater distance and the 7 tiles the
  soil's poison reaches on the level (`BAD_SOIL`) from every red water. (3) The plan's dead band now reads the
  ground's floor (the river's side in, the courses' water out) and the poison's reach by level (7 tiles on the
  backswamp's level, 5 less a level up): within 3 points of the ground's share on all 36 maps, under it on the exits,
  where round 2's whole-backswamp count read 11 % for 7 %. (4) The gulch's floor spilled down the face beside the lip
  where the mouth ran wider than it, and a gap's side left at its bed let the brook out behind the levee: the gulch's
  floor and every gap now have banks. (5) Open: 256² seed 3, whose window holds two side valleys and neither holds
  (one's Dry Fork does not keep its water once mended, the other's fall no start can frame); its second attempt holds.
  128² seed 3, whose one layout in 24 that fitted with a 3-wide red stream reads a dead band of 7.6 % with the 4-wide
  one (8 % least: the stream runs near the far wall and its bed takes the floor the poison held), and whose second
  attempt's far wall reads 46 tiles straight on the ground against 44 (below); its third holds. 128² seed 12's
  Red Fall is split by one tile, where the red stream's 4-wide bed cuts the gulch's bank beside the lip. A wall's foot
  on the ground can still read a tile straighter than its plan line (128² seed 2's earlier layout: 51
  tiles against 50, `wall.wanders`); it costs 128² seed 3 its second attempt.
  (6) The heavy test's Red Fall, judged by the shared curtain rule (its height, to the Red Pool's sill, less the veil's
  half level), fell short on 12 of 36 maps: the pool's water is its stream's head, and the 3-wide stream ran it 0.62 to
  0.83 over the sill, 1.0 where the pool met its stream on one corner. The stream is now sized for 0.6 deep (4 wide at
  a quarter of the river's flow) and the pool's meeting with it is cut a tile each way; the gap's cut is left out of
  `fall.drop`'s read of the backswamp, which reads only ground under the crest (the floor's mask takes in the gulch's
  spurs). A brook's mouth gap at its last path tile's bed stood a level over the brook's own tile beside it and let
  it out over the levee (256² seed 9); it is cut at the lowest of them.

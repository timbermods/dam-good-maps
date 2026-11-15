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
and its walls are not parallel: the floor's width varies along its length between 0.8 and 1.3 of its mean `P`.

Across the valley, from the near wall to the far wall:

| Landform | What it is in life | How it is made | Numbers |
|---|---|---|---|
| The near wall | The valley's side the river hugs | The shared relief | As the theme's |
| The river | The trunk stream, clean, the map's strong springs at its head | Stage 1's course, meandering by flow; it stays in the near third of the floor and leaves by an edge | Width by flow as the lake stair's channels; bed two under the plain |
| The levees | The banks a river builds from its own floods: highest at the channel, uneven, with low places where old floods broke out | A bank along both sides of the river whose height is noise along the course: one level over the plain for most of its length, level with the plain at 2 to 4 low places (each 4 to 8 tiles long). Its width is noise too, 3 to 6 tiles. It follows the meanders, so it is never straight | No stretch of crest at one height longer than a fifth of the river's length on the plain |
| The plain | The floodplain: the largest level land on the map | One level, `L`, falling one level down the valley every 40 to 60 tiles as the river's own profile falls (a riser that wanders across the floor, never a straight step) | Mean width `P` across the valley (§2); its length 0.7 to 0.85 of the side along the axis; the floor (plain and backswamp) 20 to 30 % of the map at every size |
| The backswamp | The floor's lowest strip, under the far wall, where the plain's water gathers | A strip one level under the plain, `L − 1`, 7 to 10 tiles wide at 128² and up to 0.06 of the side on larger maps, its edge with the plain a wandering riser | It carries the red stream, which wanders within it |
| The slough | An old channel a flood cut from a low place in the levee across the plain to the backswamp | A dry bed one level under the plain, 2 or 3 wide, winding (a bend every 6 to 10 widths), from the lowest low place on the plain's side to the backswamp. One at 128², two at 192² and 256² | Dry on day 1; it is the river-in's way, already in the land |
| The far wall | The valley's other side | The shared relief, higher than the near wall; hard rock at the gulch's mouth | Sheer only at the Red Fall |
| The gulch (the Stain) | A hanging side valley: its stream never cut down to the main floor | A side valley of the far wall found by search (§3), its floor 3 to 5 levels over the backswamp at its mouth, narrow (4 to 7 wide), with a narrows 3 or fewer wide within its lower half | The red source at its head |
| The col | A low saddle between the gulch and the next side valley | Found with the gulch: the lowest point of the ridge between them, 2 levels over the gulch's floor at the narrows | Never under 2 |
| The old valley (the Dry Fork) | A dry side valley with its own way out | The neighbour of the gulch on its downstream or upstream side, falling from the col to a map edge of its own, never opening onto the plain | Bare, a few dead trees, no water on day 1 |
| The start's terrace | A river terrace: an older, higher floor the river left when it cut down | A bench 2 levels over the plain at the plain's upstream end, on the plain's side of the river, upstream of the gulch's mouth by the badwater distance or more | Room by the shared floors (D515); its own brook from a spring in the slope behind it |

## 2. The three bands, by the game's soil rules

The numbers come from the core's own soil model (`sim/contamination.ts`, `sim/soil3d.ts`), which is the game's.

- **The dead band.** Water at contamination 0.5 or more poisons soil: pure badwater reaches 7 tiles on the level and
  loses 5/7 for every level climbed, so it climbs one level only within 2 tiles of the water. The red stream runs in
  the backswamp in a bed one level under it, so its water stands at the backswamp's level and poisons the whole strip
  (7 tiles each side, cut by the far wall on one side). The riser up to the plain stops it within 2 tiles. **The dead
  band is the backswamp**, and its edge is the land's own riser, not a distance from a line.
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

**A drought.** The river's springs stop; the red source does not. The only water that runs in a drought is the red
stream. Nothing is designed around this beyond saying it on the card's second line when the map's hazards include
droughts; it is the game's own behaviour.

## 3. The search: found, not laid

Stage 2 makes the valley and its floor from the plan, then searches the far wall for the gulch, the col and the old
valley in the land the shared relief made:

1. Candidates: side valleys of the far wall whose mouths open on the backswamp between 25 % and 75 % of the plain's
   length, downstream of the start by the badwater distance (D469) or more.
2. For each, its neighbours along the wall; the pair with the lowest ridge between them and a neighbour that already
   falls to a map edge without touching the plain scores best.
3. The mend, by taking ground away only: the gulch's floor is cut to a steady fall with its hanging mouth kept; the
   narrows is cut to 3 wide or fewer; the col is cut to 2 over the gulch's floor at the narrows; the old valley's bed
   is cut to fall the whole way to its edge. No ground is raised except the least rise that keeps the old valley from
   opening onto the plain (the Gate's `mendFlood`: a swell with a wandering outline, never a bead).
4. A land with no pair within the mend's budget (no more than 4 % of the map's tiles changed) is refused in one line
   and the plan is drawn again; after the bounded tries the generator falls back to the theme, as every premise does.

## 4. The water story

- **Sources.** The river's springs at its head (the map's strong sources). The start's brook: one small spring. The
  red source: one badwater source at the gulch's head, its strength a fifth (Badwater low), a quarter (medium) or a third (high) of the river's, enough for a
  stream 2 wide the length of the backswamp.
- **Courses.** The river: in at one edge, out at another, between its levees. The red stream: down the gulch, over the
  Red Fall (a fall of 3 to 5 levels, the landmark: the gulch's mouth stands that far over the backswamp), along the backswamp, then by the seed either into the river in the river's
  last 30 % (D476, D498: the river is never red above the join) or out by the edge on its own. The start's brook: down
  the terrace into the river.
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
| Medium, **the turn** | A dam of 6 tiles or fewer at the gulch's narrows, two levels high: the red water rises over the col and runs down the Dry Fork to its own edge | The Red Fall stops; the stream's bed in the backswamp goes dry; the dead band's soil clears |
| Large, **the river in** | A weir on the river just below the slough's low place lifts the river one level; it runs through the low place, down the slough and along the old red bed. A gate at the low place shuts it for a badtide | The dry band and the old dead band watered: the floor's green 70 % or more |
| Either order | The river in before the turn dilutes the red stream below the slough's mouth. Where the mix settles under 0.5, the soil below the mouth clears and the band above it stays dead | A second answer; never required, never refused |

After the turn the gulch behind its dam and the Dry Fork are the places that stay red. The Dry Fork was bare, so
nothing the player valued is spent.

## 7. The invariants

Stage as PREMISES §1.4; each with a hand-broken case in its test.

- **plan:** `plain.levels` (the river's bed, the levee, `L`, the backswamp, the gulch's mouth and the col by number);
  `plain.width` (`P` against §2); `stream.join` (the join in the river's last 30 %, or the stream's own exit);
  `start.badwater` (the terrace upstream of the mouth by the distance); `frame.fall` (the Red Fall in the first
  frame); `poisoned.ladder` (every rung has a site); with §1.4's shared plan checks.
- **land:** `gulch.found` (the pair within the mend's budget); `col.over` (2 or more over the narrows' floor, and the
  lowest way out of the gulch other than its mouth); `fork.own` (the Dry Fork reaches its edge and no tile of the
  plain by `flowThrough` from the col); `levee.wanders` (§1's crest rule, and no straight run of bank over 8 tiles);
  `plain.bands` by the soil's reach on stage 2's ground (dead 8 to 25 %, dry 30 % or more); `terrain.ruled_land`
  (the shared look check).
- **settled:** `river.clean` (no tile of the river above the join at contamination over 0); `plain.bands` again on
  the settled water; `levee.holds` (in a badtide's water, soil contamination on the plain only within 7 tiles of a
  low place); every blocking check of the shared gate.
- **works, by number at generate time** (`hold.ts` and `flowThrough`, no settle: speed is a feature): `turn.byNumber`
  (with the dam's tiles raised, water behind it stands at the col or over and the col's flow reaches the Dry Fork's
  edge; no path to the plain); `riverIn.byNumber` (with the weir's tiles raised, the river stands at the low
  place's level or over and the slough carries it to the backswamp).
- **proof, offline over seeds and in the background after the map opens:** `turn.proved` (settled with the dam in: no
  water at 0.5 or more on the valley floor, the Dry Fork carrying the whole source, nothing else flooded);
  `riverIn.proved` (settled with both works: the floor's green 70 % or more, the start not flooded). If the first
  build's table shows under 70 % on more than a quarter of the seeds, the builder reports the distribution and the
  second slough's sizes it tried; planning rules the number. It is not lowered silently.

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

- How fast the game clears poisoned soil once the stream is turned: read from the core's soil rules in step 3. A
  probe batch only if the core's rule and a settled map disagree.
- Whether moisture from the old red bed climbs the backswamp's riser far enough for 70 %: step 4's table decides
  (§7, `riverIn.proved`).
- Pairing beyond River Valley and Delta: after step 5, on the judged maps.

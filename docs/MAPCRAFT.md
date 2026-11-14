# Mapcraft: what makes a Timberborn map good, from first principles

Why this exists (Kyler, 2026-11-10): "break down what makes a map good to first principles, and then build back up from
there, as a professional map maker would do step by step, so we can understand and create what a perfect or magical map
requires." [PERFECT.md](PERFECT.md) says what perfect means for the whole product; this page says how a map earns it.
Every map we make by hand, every generator rule and every check is judged against it. The numbers come from the study
of 130 loved Workshop maps (`investigation/WORKSHOP.md`) and from the hand-built map Four Lakes
([progress/showcase-craft.md](progress/showcase-craft.md)), seen in the game itself.

## 1. What the player is doing

A Timberborn player keeps a colony alive and growing through cycles of good weather, droughts (the sources stop) and
badtides (the sources run bad). Everything they do comes down to a few verbs:

- **Hold water**: dams, reservoirs and tanks, sized for the longest drought so far.
- **Lead water**: irrigate dry land so food and trees grow; send badwater somewhere harmless.
- **Reach**: paths, stairs, bridges and platforms to new ground, up and across.
- **Harvest**: wood (which regrows only where the ground is moist), food, metal from ruins and mines.
- **Harness**: flowing water and wind for power.
- **Reshape**: levees, dynamite, later tunnels and great works, until the land does what they want.

The fun is the moment the land stops being an obstacle and becomes the solution: the valley that became a reservoir,
the dry plateau that turned green. **A map is the problem the player solves and the canvas their answer is drawn on.**
A map that hands over the answer (water everywhere, wood everywhere, flat ground everywhere) has nothing left to play;
a map with no way to an answer is a wall.

## 2. The first principles

A map is good to the degree that all ten hold. Each is stated so that it can be checked.

1. **A problem you can say in one line.** Not scenery, a verb: "the badtide comes down the whole stair unless you close
   the gates and send it round." *Check: a stranger who sees the first frame and the far view can say what the map asks.*
2. **More than one answer.** At every stage at least two workable ways forward that cost different things (a short dam
   now or a long one later; open the gate or go round). *Check: name them; neither is strictly better.*
3. **A curve: generous, then earned.** The start is safe through the first cycles without expert play; after that each
   longer drought asks for a bigger work, and each work opens the next ground. Near is small and easy, far is large,
   hard and rich. *Check: the first ten cycles by the model and by play; a ladder of works from a few tiles to a megaproject.*
4. **Room to transform.** The player's work must show: dry land that turns green, a basin that fills, a fall they
   tamed. So the map keeps land that is *irrigable by design*, sites that are *dammable by design*, and space to build.
   *Check: for each dry region, the work that waters it; at hour forty the far view differs from hour zero.*
5. **Scarcity is designed, not accidental.** Water, wood, food, metal, power, level ground: each has a budget:
   generous at the start, then something to manage and travel for. *Check: the budgets in section 4.*
6. **Legible.** The player can read where water comes from and goes, what is high and low, and where an answer might
   be, from the first frame and from far. An answer that can't be seen doesn't exist. *Check: dry beds read as beds,
   dam sites as gaps between shoulders, ways up as ways up, in the game's own view.*
7. **One sight, and a composition.** One dominating landmark, big against the map, in the game's first frame; contrast
   that carries the picture (wet and dry, high and low, clean and bad); land that looks made by water and time, not by
   a program; an edge that ends on purpose; a best side. *Check: the first five seconds, in the game.*
8. **Something to find.** Things not seen at first that play or weather reveals: a cave the drought uncovers, a relic,
   an aquifer, a buried channel. *Check: at least three, each tied to the premise or a region.*
9. **Fair and true.** No dead ends: every resource the game needs is reachable; the start survives for either faction;
   water behaves in the game as the editor showed it; the map runs smoothly. *Check: the checks, the weather model,
   a load and a capture in the game.*
10. **Its own identity.** A name, a place, a story that is not another map's. *Check: put its far view among ten
    others; it is told apart at a glance.*

**Magic** is what the player feels when these agree with each other: everything on the map has a reason, the world
seems to have existed before them (principles 7, 8, 10), and it changes because of them (3, 4).

## 3. The craft, step by step

How a professional builds a map. Each step has an output and a test, and no step starts before the one above it passes.
The order matters: ideas at the scale of the whole map first, detail last. (The three first showcase maps were built
the other way round, a detail dug into a finished seed, and failed for it.)

| # | Step | Output | Test before going on |
|---|---|---|---|
| 0 | **The brief** | Size, difficulty, the feeling in three words | It fits one line |
| 1 | **The premise** | The one-line problem and its fantasy | A stranger can repeat it; it is a verb |
| 2 | **The water story** | A diagram, before any terrain: sources and their strength, the path down, the exits; what dries first in a drought; where the red goes in a badtide; the answers | Two answers exist; the numbers of section 4 close |
| 3 | **The skeleton** | The big forms at map scale; three to five regions, each with a role, a problem and a prize; the landmark; the edges | The landmark is a real share of the map; each region differs in what it gives |
| 4 | **The start** | Where the colony begins, and its first frame | The landmark is in the game's first camera; the start's budget holds for the first cycles; the first decision is in sight |
| 5 | **The ladder** | The works in order of cost, each with what it buys: small (a few tiles), medium (a region), large (a megaproject); the natural gates between regions | Each rung is visible, different, and worth it; no rung gives the map away |
| 6 | **Relief** | The ground itself: grade, benches to build on, shoulders for dams, gradients for flow, crags and skyline | Section 5's measures; nothing reads as stairs, rings, pillars or noise |
| 7 | **Life and resources** | Plants where the water is; wood, food and metal by budget; ruins as architecture; dry land dressed on purpose | The budgets; green ground does not need a tree |
| 8 | **Secrets and set pieces** | The cave, the relics, aquifers, cores, blockages, the timed spring | Each is tied to the premise or a region, and something reveals it |
| 9 | **Simulate** | Settled water; every drought and badtide of the first ten cycles; each answer tried | The premise is true both ways; nothing floods or dries that shouldn't; every place is reachable |
| 10 | **See it in the game** | Captures: first frame, far view, each landmark, the worst day of the first drought and badtide | It stops the eye in five seconds; dry land reads as land with answers; nothing the editor hid |
| 11 | **Play it** | Ten cycles played | The curve is felt as designed; fix and return to 9 |
| 12 | **The page** | Name, the premise in two lines, what to build, the screenshots | It sells the map that is there |

Steps 9 to 11 are a loop. Four Lakes went round it eleven times in a day, and each pass through the game found
something the editor's view and the model had not shown.

## 4. The budgets

What "generous, then earned" means in numbers. They are starting points to tune by play, not laws.

| Resource | At the start (no work) | Earned |
|---|---|---|
| **Water held** | The start's water lasts the first droughts (3–5 days) with a pump and a tank or two | Each longer drought needs the next reservoir: a mended weir, a raised sill, the megadam; each a bigger prize for a longer dam |
| **Green ground** | The start's own meadow and the map's living core; it stays green through the first drought | Dry land with a named work each: six to eight small works of a few hundred tiles, then regions, then the great ones; one part dry for good, on purpose |
| **Level ground to build on** | 640–980 tiles round the start (what loved maps give) | Benches and meadows up the map, each behind a gate (a climb, a crossing, a work) |
| **Wood** | A finite, generous stand in easy reach: more than a forester's first needs | Stands at each region, and dead stands on the dry land where forest was (about 40 per 1,000 dry tiles in two to four old woods a 128² map, 300 to 900 logs, none in the start's walk; D516); wood is managed and travelled for, never a carpet |
| **Food** | Berries in the start's walk through the first cycles | Farmland as irrigation spreads |
| **Metal** | A little, in a ruin near the start | The rest in ruins with a reason, further up |
| **Power** | One fall or run of flow in reach | Greater falls further on; the landmark fall tamed late |
| **Badwater** | Kept away from the start on day 1, or plainly manageable | The map's question: where to send it |

The start's column is a floor every map meets in the shared playability gate (D515: the bench, the walkable land, a
fast species among the wood, a forester's plot; `validate/playability.ts` `START_FLOORS`). No generator path, a theme,
a premise or one still to come, may carry its own, lower playability floor.

## 5. The measures we hold a map to

- **The first frame**: the landmark whole in the game's first camera, and the start in front of it.
- **Falls**: a landmark fall of 6 levels or more and wide (loved maps' tallest: median 6.1); lesser falls of about 4.
- **Ground**: under half the tiles dead flat; 60–80 % of height steps one level; no two or three levels holding most
  of the map. Bold scarps and broad benches, not thin contour bands. Every level's edge follows the land's warped
  contours, never a lattice or a rectangle, and no one-level step runs ruler-straight: no run of one row or column
  past 8 tiles, its edge jogging a tile every few tiles as a contour does (D518, the look round), and rises stand in
  two or three nested one-level rings, as the game's hills do (D518).
- **Water and green are a spectrum, set by the premise**, not targets to maximise: a living core, veins toward the
  rim, and dry land that is irrigable by design. What is measured is the ladder (what each work turns green), not a
  bare-ground share.
- **Wood**: living trees near the official maps' count to about half the Workshop's (roughly 350–700 per 10,000
  tiles), as stands with a purpose; and dead trees on the dry land as the game's maps have them (36 to 124 per 1,000
  dry tiles; ours at least 28, 30 to 34 where the bare land's share holds it: the cover limit and the spread that make
  a stand a wood allow no more, D516's floor, D518), in two to four old woods where forest was: the old water line, dry beds, a mesa top,
  dry hollows; pines on the tops, birches by old water, a few old oaks. The rest of the dry land is bare: at most a
  quarter of it within 6 tiles of a dead tree, the count giving way first. A wood is dense inside its outline. A stand is irregular knots of 3 to 8
  trunks, each its own shape, with gaps, never a filled square, thinning to single trees at its edge, its outline the land's (a rim, a bank, the old
  water line), a third of its trees shorter (died young; D518). A dead tree keeps its logs and grows none back: wood
  travelled for, none in the start's walk.
- **Ruins**: a field of ruins lies along the land, never in a filled box: a band 2 to 4 tiles wide along a contour, a
  rise's edge or a shore, ragged, with gaps; the ruins on a natural rise stand on a disc broken at its edge (D518, the
  look round). Their count, kinds and heights are the official maps' (D488).
- **Dry washes**: one or two long winding dry beds across the dry land, as each of the game's maps has (D517): 60 to
  150 tiles on a 128² map, 3 wide (a branch 2), a level or two deep, its banks long straight treads (each reach 3 tiles
  at least before it steps aside, no teeth; D518), where rain would run, with side branches and fords every
  15 to 25 tiles where the bank slopes down and up again, ending at water behind a lip, in a dry hollow that fills if
  water is led in, or (the old bed, one a map) behind a lake's lip, one notch from running again. A dam at a wash's mouth or a
  canal into it greens its floor first: irrigation the land offers, never water it gives. Canyon's side canyons are
  deeper washes (D518): two or three a 128² map, walls of three levels or four, 4 wide, deepening from the head,
  dry unless they reach the river.
- **Weather**: by the model and in the game: the start's days of water in each early drought; the day badwater reaches
  the start, left alone and with each answer built.
- **Reach**: every region walkable by natural ways or by a crossing the land plainly asks for.
- **Nothing ruled**: `terrain.ruled_land` (PLAN §11.2) measures land and water drawn with a ruler: edges and shores in
  straight runs, strips of even width, square corners, water in straight reaches of even width (a river of even width
  that winds is natural; even width in straight reaches meeting at sharp bends is not; water under 5 wide is a reach
  only past five times its width where it crosses between two bends, a meander's crossing being 3 to 4 widths, and a
  straight link from a lake or a spring at 12 rows whatever its width: the reach rule, D520, PLAN §11.2). Limits 17 % / 3 % / 3, channels reported with no limit,
  the straight edges' aim 8 % (the built-in maps' median). Measured (`tools/ruled-land.ts`; straight % / bands % /
  corners per 1,000 edges / channels %):

  | Maps | Straight | Bands | Corners | Channels |
  |---|---|---|---|---|
  | The game's 19 named maps (planning, dev 97ff769d) | 4–16, median 7.5 | 0–3, median 1 | 0–2.2, median 0.1 | Nomads 39, Meander 38, Waterfalls and Pressure 33, Hollows 29, Beaverome 21, six others 15–18 |
  | (highest: Beaverome, a built dome, 16 / 3 / 0.1; Pressure 13; Waterfalls and Meander 11; Cliffside's corners 2.2) | | | | |
  | The game's 3 flat test maps (00, 08, 09) | 32–52 | 1–14 | 5–11.5 | 00: 94 |
  | Loved Workshop maps, aggregate only (p10–p90, 130 maps) | 1.1–9.8 | – | – | – |
  | Themes at 128², seeds 1–12 (72 maps) | 0.8–12.2 (Islands 5.5–12.2) | 0–2.0 | 0–1.5 | 0–8.1 |
  | Themes at 256², seeds 1–3 (18 maps) | 1.8–8.0 | 0–0.4 | 0–0.3 | 0–8.5 |
  | Lake stair 128², seeds 1–3 in Any (D518) | 8.9, 3.1, 5.6 | 0.8, 0.4, 0.0 | 1.1, 1.8, 2.0 | – |
  | (before D518: seeds 1, 2; seed 3 in Canyon or Highlands style) | 11.7, 11.5; 7.8 | 1.7, 0.8; 0.5 | **5.4, 3.9; 3.7–3.8** | 0, 3.5; 1.7 |
  | Four Lakes plan, 192² | 9.8 | 1.0 | 2.8 | 2.3 |
  | The Gate as laid, 128² seeds 1, 2 | 38.4, 34.4 | 7.6, 4.1 | 9.0, 4.6 | 57.6, 45.1 |

  The channels column was measured before the reach rule (D520), every run of 12 rows a reach whatever its width. The
  rule's first reading (2026-11-13: five widths for all narrow water) let 15 straight links between the lake stair's
  lakes through (seeds 1 to 12, its mean 4.7 to 4.4 % at 128², 3.5 to 2.9 % at 192², 3.7 to 3.3 % at 256²); they read
  as drawn with a ruler, so the widths are for a crossing between two bends only (2026-11-14), and the lake stair
  measures as before the rule again: 4.7, 3.5 and 3.7 %, every reach the same.
  Channels has no limit: the game's own rivers lie in straight reaches of even width as much as the laid Gate's
  trenches do, so the number tells what a map's water is like and is never failed on. Every theme map passes. The
  lake stair failed on its corners alone (rectangular plates of one level, 6 to 15 tiles, half of them on the outlands'
  rim) until D518 turned its plates' scatter off the grid and bent its benches' sides; at 128² it passes now. The real places (`places/`) are warned only. The game's maps are run on the
  machine that holds them: `npx tsx tools/ruled-land.ts <folder>/*.timber`.

**Land first, story second** (planning's ruling of 2026-11-11, for every path: themes, premises, hand maps). Every
landform is one geology makes, shaped by the shared natural relief. A premise is found in or cut into natural land by a
natural agent, and its gameplay constraint is checked on that land and mended by the least change, never drawn: a wall
is a mountain range, a gate is the gap an old river cut at its lowest saddle, a basin is a dry lake in a natural
depression, and a valley held at a dam's water is flooded to it and closed where it spills by the least rise. A
premise holds no geometry of its own, as it holds no playability floor of its own. Nothing ruled, nothing in bands.

What The Gate's seven rounds added (2026-11-11, judged in the game each round; [progress/showcase-craft.md](progress/showcase-craft.md));
the rule above replaces the first three, which describe the laid wall Kyler judged "artificial, rigid, mechanical and
fake":

- **A barrier faces the camera and runs along the grid.** The opening camera shows one face of a ridge: a wall built
  as a diagonal band reads as a staircase of one-tile jogs with a plateau's edge, and a ledge on its face doubles the
  line. Built along the grid in straight runs joined by bold jogs, its face toward the camera and sheer from crest to
  floor, it is one dark band across the widest view, and a notch cut through it to the floor is a gate.
- **A basin needs a far side.** A dry floor that runs off the map reads as plates; a rim along its far edges, its cliff
  facing the camera, makes it a bowl, and the picture reads valley, wall, floor, far cliff.
- **Steps follow the water's bed, never the barrier.** A floor's relief is river terraces along its bed (the bed cut
  two below a low terrace that follows its bends, one more above, then broad unequal flats), not rolls parallel to the
  wall and not plates.
- **The start's water has a neck.** The start drinks from a side pool joined to the river by an inlet no wider than
  three, so a few levees close it before the first badtide and it holds clean water through it; the meadow beside the
  red river goes bad, and that is the game.
- **A closed hollow fills to its flat whatever its depth**, so a seep in one wets a disc of the flat thirty tiles across;
  a gully to the nearest bed keeps the pond under the flat and the oasis small.

## 6. What this asks of Dam Good Maps

The generator and the editor exist to take a player through section 3. Where each step stands:

| Step | The generator | The editor |
|---|---|---|
| 1–2 Premise and water story | Missing: it starts from noise, not from an idea. Needs a small library of premises, each a water story with its numbers | Missing: a sketch start (ridges, the water's course and lake outlines drawn at map scale, then made natural) |
| 3 Skeleton | Themes give forms, but features stay small on big maps and regions don't differ by role | Forces make landforms; each is being rebuilt to read as one |
| 4 Start | Opens toward the map (D507) with the game's true camera (0.10.14); not yet on a landmark | The start can be moved; the first frame can be predicted |
| 5 Ladder | Missing | Missing: a readout of what each work would turn green |
| 6 Relief | Ground with grade (0.10.16): tableland and rolling ground by region, benches at many levels; roughly half the height steps one level, under half dead flat | Brushes; lakes by number (merged); a fall in one stroke (in review) |
| 7 Life and resources | Official mixes; not yet by budget or by region | Paint and groves; no budgets shown |
| 8 Secrets | Places the shelf's objects; not tied to a premise | The shelf |
| 9 Simulate | Settles and checks every map; no weather gate on the premise | Drought and Badtide day by day; the first-ten-cycles report is in work |
| 10 See it in the game | The capture kit (merged) can run on any map; not yet part of judging seeds | The same kit |
| 11–12 Play and page | Not yet | The description; the thumbnail |

The order of work in [ROADMAP.md](../ROADMAP.md) follows from this table: the hand-built map proves each step, and
each proven step becomes a tool, then a rule the generator follows.

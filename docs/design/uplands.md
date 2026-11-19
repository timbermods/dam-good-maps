# Uplands with a shape

Planning's design, 2026-11-19. The generator's next line of work after the fault fixes (ruled water, level edges, the
flood check, the start pick). Those removed what read as fake. This adds what makes someone stop and stare.

## What is wrong

Twelve unpicked maps of dev at generator 0.10.47 (six themes, seeds 1 and 2, 256², Normal, defaults), seen whole from
an oblique camera:

- **No map has a skyline.** Each is a slab whose top is level from edge to edge. The land spans about 10 levels
  (5th to 95th percentile), but the height is spread across the map as a mottle of one-level steps, so nothing rises
  and nothing falls away.
- **No form can be named.** Away from the water, a player cannot point at a ridge, a wall, a tableland or a peak. The
  themes differ by how the water is arranged and by nothing else: Highlands has nothing high, Canyon's gorge is a
  river with banks, a Lake Basin's shore has no heights behind it, an island is a pancake.
- **Flat in the small as well:** 52–67 % of land is dead flat on ten of the twelve (the bar is under half), one level
  holds 24 % of Highlands seed 2, and Lake Basin and Islands have 4–5 levels of relief.
- **Verticality does almost nothing:** its whole range moves the cliff share by about .03.

The generator does not lack forms. The genome already draws ridges, troughs, basins, calderas, mesas, plateaus,
escarpments, cones and knolls, with caprock, erosion and weathering. They do not survive to the widest frame at 256².
Why they do not is the first thing to find, not to assume.

## What a map must have

1. **One large form a player can name, at the scale of the whole map.** It spans at least a third of the map's side,
   stands or falls at least 6 levels against the ground beside it, and breaks the skyline of the widest frame. The
   theme promises which:
   - **Highlands:** a massif: two or three tablelands stacked, each wall 4–6 levels, the highest in the top levels.
   - **Canyon:** a gorge through a tableland: walls on both sides for most of its length, 8 or more levels rim to bed.
   - **River Valley:** a broad floor between two valley sides that step up 6 or more levels to the uplands, notched
     by side valleys.
   - **Lake Basin:** heights behind one side of the shore (an amphitheatre), open low ground on the other.
   - **Islands:** at least one island with a peak or a cliffed coast; the rest low.
   - **Delta:** stays low and wide; a bluff line inland, where the channels leave the upland.
2. **The drop gathered into a few long faces.** Between the faces, broad tops and floors that roll gently. A face is
   a wall you can follow with a finger across the map, not a scatter of two-level nicks.
3. **The water belongs to the form.** The river leaves the massif, the gorge holds the river, the lake lies under the
   heights. The form is never a prop set beside a river system that ignores it.
4. **Land first, nothing ruled** (Kyler, 2026-11-11). The forms come from the land's own processes (uplift at the
   map's scale, hard rock, erosion). Nothing is stamped, no wall runs straight, no rim is banded, and no form is a
   disc.
5. **Dry and irrigable stays the game.** The tops are dry by design. A large form adds places to dam, divert and
   terrace; it must not turn dry land a player could water into land a player cannot reach.

## What must not fall

The start comes first in every verdict: level room at the start, wood, the walk to water, the nearest badwater, and
no start that fails, on the same sets the land-edges work measured (84 maps at 256², 42 at 128², 258 small). Irrigable
dry land, the generator's attempts and its seconds per map do not get worse. Speed is a feature (D453).

## Measures

Few, and each one decides something. All on the built map, at 256² first.

- **Regional relief:** the 10th to 90th percentile of the mean land level of 16-tile blocks. It says whether height
  is organised at the map's scale. Dev's value is measured first; the target is set from it and from the loved maps
  where their files are at hand.
- **Form share:** the variance of 32-tile block means over the variance of all land tiles. A mottled slab is low; a
  massif beside a lowland is high.
- **The longest face:** the longest connected run of edges that drop 3 or more levels, in tiles, and the levels it
  drops. Target for Highlands, Canyon and River Valley: at least 0.6 of the map's side.
- **Verticality:** 10 → 90 moves the cliff share by at least .06 over 24 seeds. When it does, the settings test's
  threshold rises to match.
- **The budgets already in MAPCRAFT §5:** under half the land dead flat; no two or three levels holding most of the
  map.
- **The eye:** the same twelve maps from the same camera, before beside after. The question of each frame: can the
  theme be said from the picture with the label covered, and does it make someone want to play it?

## How it is built

- **Round 1: find and show.** Take one 256² land apart by stage (regional uplift, the genome's parts, noise, erosion
  and weathering, the grade and the snap to levels, the washes and the water's cuts) and say where the large form is
  lost: sizes held in tiles while the map grew, amplitudes, the top of 16, a stage that flattens. Then the smallest
  change that gives the twelve maps their form. One sheet and the measures. No test is re-pinned and nothing is
  polished: planning judges the sheet first.
- **Round 2 onward:** what the verdict asks for, then the pins, the documents and the PR. Other sizes follow 256².

A landmark by design in the first camera (the intentions work, PR #1170) comes after this, on the new land.

## Round 1 findings

Three 256² lands taken apart by stage (River Valley seed 1, Highlands seed 2, Canyon seed 2; Normal, defaults; each the
land its map was built on), with the design's measures at every stage. A float stage is put in levels as `snapLevels`
does, without the grade. Base: generator 0.10.48 (gen/terrace-edges 29e054f1).

- **The large form is never made; no later stage loses it.** In the uplift, in levels at the snap's scale, the
  map-scale parts are weak: the tilt's spread is 0.04–0.17 levels (standard deviation), the regional field's 0.7–2.0.
  The genome's parts carry the land: 2.6–3.2. And the parts are a 128²'s: sizes held in tiles (a mesa's radius 8–20,
  a plateau's 14–32, a cone's 10–18) while their count grows with the area, so a 256² map stands 20–30 of them, four
  128² maps' forms side by side. The share of the height at a quarter of the map's side is the same at both sizes
  (form share of 32-tile blocks at 128², 0.36–0.43; of 64-tile blocks at 256², 0.31–0.46): the 256² land is a 128²
  land repeated, with nothing at its own scale.
- **Erosion and weathering do not flatten it** (regional relief within ±0.3 levels, form share within ±0.03), **nor do
  the water's stages**: from the snapped land to the built map, regional relief moves −0.8 to +0.6 and form share
  ±0.05. The rivers follow the land they are given (inflows at the low points of the upstream edges, courses down the
  field), so they ignore no form: there was none to follow.
- **Equalization spreads it.** `hyps.eq` (0.52–0.87 on these) blends the field toward equal area per level. It does not
  lower the regional relief (it raises it 0.8–2.3 levels over a linear snap) but gives every level the same area, so no
  level holds a broad top or floor.
- **The faces are the benches.** Only the terrace benches gather the drop, three levels apart at 256² (Highlands since
  its size round, River Valley as drawn) or two (Canyon seed 2): the longest face drops three levels, a scatter round
  every small form. The grade's rolling adds 0.8–1.2 levels over 16–18 tiles (its own form share 0.07–0.21): a mottle,
  but a small one.
- **The top of 16** leaves 10–12 levels above the base (3.5–6; Canyon's 6). No smooth form across 256 tiles shows that
  from the widest frame: height reads only where it is gathered into faces.

Round 1's change (generator still 0.10.48, nothing re-pinned): above 128² the genome's landforms stand at the map's
scale (`genome.ts` `atMapScale`: of the ridges, mesas, plateaus, escarpments, cones, calderas, mesa fields and spirals
drawn, one in `formScale`² stays, its size grown by `formScale`, the map's narrower side over 128; basins, troughs,
knolls and islands keep their tile sizes), and Highlands from 256² stands its benches five apart with tops that roll
(`highlands.ts`). Lake Basin and Islands draw almost none of those forms, so their land is as it was: their promised
forms (the amphitheatre, the island's peak) need their own shaping (`lakeBasin.ts`, the sea layouts), round 2's. The
numbers and the sheets are in `C:/dgm-showcase/gen/uplands1/`.

## Round 1 verdict and round 2 (planning, 2026-11-19)

**Verdict.** Round 1 found the cause and is kept: the genome's forms stand at the map's scale above 128². The sheet
does not pass. From the low frame every map is still a block with a level top; the walls that came are short and
scattered, and no frame can be named with its label covered. The finding says why, and it sets round 2: **the large
form is never made.** Scaling small forms up does not make one. The land needs a plan at its own scale, and a
hypsometry that leaves room for broad tops and floors.

**Round 2 builds three things, for Highlands, Canyon and River Valley** (Lake Basin, Islands and Delta are round 3,
with their own shaping; a Delta bluff line may come with this if it falls out for free).

1. **The plan of the land.** Before the parts, the uplift gets a structure at the map's own scale: two or three tiers
   (a floor, sometimes a bench, a top) laid out by a slow field whose wavelength is the map's side, warped, and tied
   to the regional slope so the water still runs off it. It is a field like the others, not a drawn outline: where it
   crosses a threshold the land steps from one tier to the next, so the step wanders as the field does. The tiers take
   most of the height there is: the floor within about 3 levels of the base, the top tier in the top 3–4 levels, 6 or
   more levels between them. The theme sets the layout:
   - **Highlands:** a massif off the middle on 35–50 % of the land, in two stacked tablelands; valleys cut into it.
   - **Canyon:** tableland on 70 % or more, the trunk's gorge and its side canyons cut through it rim to bed.
   - **River Valley:** a floor along the trunk on 35–45 %, upland on both sides.
2. **A hypsometry by theme.** The equalization blends toward a tiered curve, not toward equal area per level: most of
   the land in the tiers, little between them. What lies between is the faces.
3. **Faces with ways through.** The step between tiers is taken in walls of 4–6 levels that run long, broken where
   side valleys and ramps of one-level steps come down, so a colony can walk up without a staircase of its own
   everywhere. A wall no path crosses for its whole length is a fault.

**What a tier is not.** Not a tabletop: a tier is a band of 3–4 levels that rolls in one-level steps and holds knolls,
hollows and the genome's forms. "No two or three levels holding most of the map" (MAPCRAFT §5) still stands, and so does
"nothing ruled": no tier edge runs straight, none is a disc, none is banded.

**Verticality sets the plan's strength:** at 10, low walls (2–3) and wide ramps; at the theme's default, the figures
above; at 90, walls of 6–8 and the top above 16 as today. That is what gives the setting something a player can see.

**Bars for round 2's sheet** (the six maps: Highlands, Canyon, River Valley × seeds 1, 2, at 256²):
- From the low frame, the top tier stands above the floor across at least a third of the frame; the theme can be said
  with the label covered.
- Longest face at least 0.6 of the side, dropping 4 or more; regional relief at least 8 (base median 6.6); under half
  the land dead flat; no level holding more than 12 % of the map.
- Starts first: no start fails; on each of the six, reach from the start is not under the base's, and level room, wood
  and the nearest badwater are not under the Easy targets where the base met them. A fall is named with its cause.
- Seconds per map not more than 10 % over the base.

## Round 2 findings

Built on round 1 (generator still 0.10.48, nothing re-pinned); numbers and sheets in `C:/dgm-showcase/gen/uplands2/`.

- **The plan** (`src/core/land/plan.ts`, drawn in `genome.ts`, laid in `field.ts` `layPlan`): a slow warped field at
  the map's side, on its own random stream, cut into tiers by quantile so each tier gets its theme's share (Highlands
  floor .56, bench .22, top .22, the top its own off-centre field so the bench is no ring; Canyon floor .2 along the
  trunk, tableland .8; River Valley floor .42 along the trunk, uplands .58). The trunk's line meanders along the slope
  (1-D noise, not a 2-D contour, which made loops and straight edges); side valleys are ridged-noise fingers kept only
  where they reach the lower tier. It is added on top of the uplift's tilt, which it keeps, so the water still runs
  off it; the genome's forms stay on every tier, damped to a fifth on the floor so a gorge's bed is not raised.
  Planned lands take a linear tilt, and erosion's outlet is the far edge only (a radial tilt and side outlets let the
  trunk leave the gorge across the tableland). River Valley's own genome floor is half as wide under a plan.
- **The hypsometry** (`levels.ts`): rank equalization blends 85 % toward a tiered curve (`tieredCurve`) whose bands
  are the tiers; the gap between bands is the wall, 6 levels for one gap, 4.5 each for two, times the plan's
  strength. `gatherFaces` pushes steep tiles in a gap toward the nearer band, so the drop gathers into walls. Under a
  plan the terrace step is 1, the grade's calm at most .25 and its roll doubled: the tiers roll in one-level steps.
  Canyon's base is 4 under a plan (6 at 256² before), for the gorge's depth.
- **Strength** grows from 0 at 128² to full at 256², and with Verticality (0.35 at 10, 1 at the theme's default,
  1.35 at 90). At 128² and under, and for Lake Basin, Islands and Delta, nothing moves (their maps are byte-identical).
- **What it gives** (six maps): regional relief 10.5–11 on Highlands and River Valley, 8.8 on Canyon 1 (base 6–8.6);
  dead flat 43–47 % on Highlands and Canyon (base 46–58 %). River Valley's back wall reads across the low frame, and
  Canyon 1's gorge holds the trunk between walls. No start fails.
- **What falls short.** The longest dry face reaches 0.6 of the side only on River Valley (256, 169); Highlands 72 and
  125, Canyon 143 and 48. Before the water the faces are longer (Canyon 161–254): the trunk and tributaries at the wall
  foot break them, and Canyon 2's gorge fills with a lake, which also takes its relief (6.15). River Valley stays
  51–54 % dead flat (its floor is the flat). Highlands' massif does not break the low frame's skyline: two 5-level
  steps over 100+ tiles read as a rise, not a wall, from that camera. Three Easy-target falls: Highlands 2's wood
  (246), Canyon 1's badwater (31.6, a source in a side canyon), River Valley 2's reach (start on the upland above the
  wall).
- **Verticality now moves the land** (land-only, 8 seeds): Canyon's longest face 98/5 levels at 10 → 222/7 at 90,
  relief 8.3 → 9.8. The cliff share falls (Canyon 9.7 → 5.9 %, Highlands 10.2 → 8.1 %): gathering the drop into
  fewer, taller walls leaves fewer tiles beside a 2+ step. The design's "+.06 cliff share" reads the plan backwards and
  needs a measure of the walls (their length and drop) instead.

## Round 2 verdict and round 3 (planning, 2026-11-19)

**Verdict.** Round 2 is the first land with a form and is kept: River Valley reads as a walled valley from the low frame,
and Canyon seed 1 has a gorge with two walls. It does not pass: Highlands shows nothing rising (seed 1 a broad green
floor, seed 2 a grey flat), Canyon seed 2's gorge is drowned, the uplands before every wall are still a mottle, and the
walls have few ways through. Stopping at the trade was right.

**Rulings.** Canyon and River Valley take variant B; the variants are per theme. A lake in a gorge is a fault of the
water: a gorge drains, its trunk's bed grading down to where it leaves the map. The level bar is read literally: no
level holds more than 18 % of the land, the three commonest under 45 % (the connected-area figure is a second number).
Verticality's measure is chosen in the PR round; report the share of land beside a drop of 4 or more, and the regional
relief, beside the cliff share.

**Round 3, in order.** (1) Canyon: the gorge drains, both seeds a two-walled gorge 8+ rim to bed for most of the trunk,
with side canyons. (2) Highlands: the massif stands above a floor on 50–65 % of the land, two stacked tiers, walls
facing the floor; the floor stays mostly dry (the green share rises no more than a few points over the base's). Going
above 16 at default Verticality is allowed only if nothing forbids it (checked first). (3) Ways through: every long
wall notched by side valleys or ramps of one-level steps about every 40–70 tiles; reach from the start not under the
base's on any of the six, and no wall over 80 tiles without a way. (4) Tiers roll: the level bar, and under half the
land dead flat on all six. Reported, not fixed: straight runs, the trunk's share near a map edge, the start's tier.

## Round 3 findings

Generator still 0.10.48, nothing re-pinned; numbers and sheets in `C:/dgm-showcase/gen/uplands3/`.

- **The gorge drains** (`hydro.ts`): under a gorge plan the trunk's course takes no hollow as a lake and no valley or
  chain lake is deepened in it, so its bed grades down to where it leaves the map. Canyon 2's drowned gorge is gone.
- **Tiers on the land's tilt** (`levels.ts` `planeOf`): the plane that best fits the field is taken out before the
  ranks and put back after (2 levels on a massif, 3 on a valley), so a tier rolls down the slope through more levels
  and a wall keeps its height. With this, Highlands' commonest level holds 15–16 % of the dry land (round 2: 25–32 %).
  A gorge takes none: tilted, its rim stood 8 over its bed along less of the trunk and its levels spread no wider.
- **Ways through** (`levels.ts` `notchWalls`): along every wall of 2+ levels 40 tiles or longer, a notch is cut into
  the higher ground every 32–48 tiles, graded in one-level steps 2 tiles long, up the land's own slope and bent by a
  slow noise. No wall over 80 tiles is left without a way on the six (the base had two). Highlands 1's land is 95 %
  one walkable area (base 45 %). `plan.ts` also widens the plan's step at spaced points along each wall (`WAY_EVERY`).
- **A dry floor on Highlands** (`genome.ts`): the floor the rivers clear is half as wide under a massif, as under a
  valley. The green share of Highlands' dry land is 4–5 % (base 15 %, round 2 up to 22 %).
- **What falls short.** Highlands' massif still does not read from the low frame: two walls of about 4 and a top 7–8
  over the floor, across 256 tiles, under the tiers' roll. D132 forbids land above 16 below Verticality 70, so the top
  stays at 16. Canyon's gorge is 8 deep along only 26–31 % of the trunk (median 4–5): in 12 levels a deeper gorge
  narrows the tableland's band and its levels pile up. River Valley misses the level bar (its cleared floor at the
  base level, its uplands in levels 12–14). Reach falls on Highlands 1 and both River Valleys: the trunk splits the
  valley into banks, and the walls lengthen the walk. Highlands 1's wood falls to 236 on its dry floor.
- **Verticality** (land-only, 8 seeds): from 10 to 90 the land beside a 4+ drop moves only 1.65 → 1.83 % (Canyon) and
  1.88 → 2.10 % (Highlands); the relief moves 8.7 → 10.2 and 8.1 → 9.6. The cliff share falls (9.6 → 6.6, 11.3 → 9.8).

## Round 3 verdict, the reference, and round 4 (planning, 2026-11-19)

**Round 3 did not improve on round 2,** and three rounds of trading one bar against another showed the bars themselves
were in doubt. So planning took ground truth: the game's 19 bundled maps, drawn by our renderer from our own review
cameras and measured with our measures (kept on the build machine only; never in the repository).

**What the reference shows.**
- Two of this design's bars were wrong. From the whole-map camera most bundled 256² maps are level-topped slabs too:
  **a skyline is not what makes a map read.** And their dead-flat share is ours (52 %), as are their one-level steps
  and their 2+ cliff share: **"under half dead flat" pushed the land toward more mottle.** Both bars are withdrawn.
- What separates them is how the steps are drawn. **Their land is long, smooth, nested contour rings round forms 30–80
  tiles across that can each be named:** a knoll in four rings, a terraced bowl, a ring mesa, a spiral mountain, with
  calm flats between. Ours holds the same amount of step in short jagged pieces.
- In numbers, the measure that separates is **fine relief** (the share of the land's height variance that lives under
  a 5×5 and a 9×9 box): bundled medians 2.5 % and 5.3 %, ours 5.1 % and 9.2 % at the base, 3.3 % and 6.1 % after round
  3. Round 3 also raised the step edge per 100 land tiles from 27 to 36 (bundled 28) and doubled the land in patches
  under 40 tiles. Corner counts separate nothing.
- They use the whole height: the lowest level is 0 (ours 3.5), relief p5–p95 12 (ours 10), regional relief 9.3 (ours
  7.3), the commonest level 15.5 % of land (ours 19.3). They are mostly dry, green only by the water.

**Round 4: the land is drawn in rings.**
1. **Nothing fine goes into the snap.** The field that is snapped to levels carries no height under about 8 tiles
   except where a face is meant: the noise's fine octaves, the grade's roll at its present cell, and any warp that
   jitters a level's edge are cut, coarsened or smoothed until the level lines run long and curved. Specks go.
2. **Forms make the rings.** The genome's knolls, cones, bowls, calderas, mesas, benches and spirals stand 30–80 tiles
   across with a smooth profile 3–6 levels tall, so the snap draws each as 3–6 nested rings; each stands clear of the
   next with calm ground between. Round 1's scaling above 128² already puts them at that size: keep it.
3. **The floor comes down.** The land uses the levels under the present base where the water's beds allow it.
4. **Kept from rounds 2 and 3:** River Valley's valley sides, Canyon's gorge that drains, a way through every long
   wall. **Dropped:** the massif as Highlands' promise (Highlands is stacked ring terraces and big ringed hills, as the
   reference's Terraces, Pressure and Mountain Range are), the tiered hypsometry wherever it fragments the levels, the
   dead-flat and skyline bars.

**Bars for round 4's sheet** (the same six maps, medians unless said):
- Fine relief at most 3.0 % (5×5) and 6.0 % (9×9); step edge 24–30 per 100 land tiles; land in patches under 40 tiles
  at most 10 %.
- Regional relief at least 8.5; the commonest level at most 17 % of the land; dead flat between 45 and 60 %.
- Starts first, as before: no start fails, reach not under the base's on any of the six, a fall named with its cause.
  Seconds not more than 10 % over the base.
- The eye: on one sheet beside the reference's frames, ours are not picked out as the generated ones by their
  texture, and each of ours has at least three forms a player could name.

### Round 4 findings (2026-11-19)

**Where the fine height came from.** Measured stage by stage on Highlands 256² seed 1 (fine relief 5×5 / 9×9 %): the
contour field was clean (0.53 / 1.20) and the snap's hypsometry kept it so (0.98 / 2.19). The grade's roll at its
128²-sized cell (5.8 levels over 20 tiles) brought it to 1.83 / 3.69, and the edge warp, grown to 8.5 tiles over a
6-tile cell, to 2.98 / 5.70 with the step edge from 33 to 48 per 100 land tiles and the land in patches under 40 tiles
from 8 % to 20 %: the warp was a third of the land's fine relief and most of its specks. The water's stage added the
rest (4.87 / 8.37 built).

**What round 4 does, above 128² only** (128² and under are byte for byte round 3's):
- `levels.ts` `RINGS`: the levels' field is smoothed at the map's scale before its faces are gathered; the grade's
  roll and rises stand at the map's scale (their cells × `formScale`); a planned land's walls are gathered on the
  smoothed land, its tiers tilted 3 levels (a valley's) and rolled 3 times its theme's grade; the edge warp is a slow
  one (4 tiles over an 18-tile cell, one octave) that bends the lines without jagging them; every land's long walls
  get their ways through (`notchWalls`), not only a planned land's.
- `rings.ts` (new): the named forms, hills, ring mesas, stepped hills and terraced hills 30–80 tiles across and 3.5–6
  levels tall, 4–5 a 128² on these three themes (1–2 on Lake Basin and Any), clear of each other, standing in the top levels the land leaves them.
- Highlands: benches two apart, so its ring terraces stand behind two-level walls (with one-level rings 88–90 % of its
  steps were one level, against about half on the game's Terraces, Nomads and Oasis, and its promise's cliffs and
  plateaus never held); its tops roll half again as much.
- Removed from rounds 2–3: the massif (Highlands' plan, its bench and top, `PLAN_TILT.massif`), `PLAN_TILT`,
  `PLAN_ROLL`, the fine gather (`GATHER`), the edge warp's square-root growth above 128² (`EDGE_WARP.most`).

**The six (256², Normal, defaults; medians, base → round 4; bundled 256² medians):** fine relief 5.05 → 2.74 %
(2.11) and 9.23 → 4.94 % (4.26); step edge 27.0 → 24.2 (27.0); land in patches under 40 tiles 9.8 → 6.8 % (8.2);
regional relief 7.26 → 7.98 (9.2), short of 8.5; commonest level 19.3 → 16.6 % (14.0); dead flat 52.2 → 56.7 %
(52.4). Straight runs stay under the bundled maps' (longest 17, theirs 15–27). Every start passes; reach falls under
the base's on Highlands 1 (12,631 → 8,071), Highlands 2 (5,577 → 3,157) and River Valley 2 (18,093 → 4,571): the
ringed land's flats are terraces of 1,000–2,000 tiles where the base's starts stood on flats of 3,000–5,500, joined
by slopes only near the start (§7.5), and River Valley 2's start stands on a valley side's tier, not the floor.
Highlands still takes six attempts: its promise misses (seed 1 a plateau short, seed 2 the "high" share, as the
base's did; the bundled Terraces, Pressure and Mountain Range miss it too). The six generate 9 % faster than the base.

**What it leaves.** Regional relief: the land is still spread over too few levels at the map's scale (the floor
cannot come down: the land stands a level over the beds' floor, item 47, at 4). Reach on three of the six. Lake
Basin, Islands, Delta and Any above 128² move too (the smoothing, the slow warp, the map-scale grade, and forms on
Lake Basin and Any): on seed 1 Islands' and Delta's fine relief fall (9.8 → 5.3 %, 5.0 → 3.2 %), Lake Basin's rises
(6.0 → 7.4 %).

## Round 4 verdict and round 5 (planning, 2026-11-19)

**Verdict.** Round 4 is the first round that changes the land's class, and it is kept whole. On the shuffled
sheet of six of ours and six bundled maps I could no longer pick ours by texture: I took Canyon 2 for a bundled
map and could not place Pressure or Plains. The mottle is gone, the steps run long, six of the seven bars pass.
Three things still fall short.

1. **Starts.** Reach fell on three of the six (Highlands 1 12,631 → 8,071, Highlands 2 5,577 → 3,157, River
   Valley 2 18,093 → 4,571). Reach is the walk over level ground and the generator's own slopes, so a land of
   many 1,000 to 2,000 tile terraces needs more slopes than a land of few large flats, and the slope rules
   (`src/core/features/slopes.ts`, `SLOPE_RULES`, called from `src/core/gen/settler.ts`) were sized for the old
   land. Level room is under 400 on five of six (as base).
2. **Every map of ours is now the gentle kind.** The bundled maps come in two families, and the pictures and
   the numbers agree on which is which:

   | family | maps | one-level share of steps | land beside a 4+ drop | longest 3+ face (drop) |
   |---|---|---|---|---|
   | bold | Terraces, Oasis, Hollows, Canyon, Pressure | 44–62 % | 4.3–9.2 % | 61–103 tiles (5; Hollows 9), Canyon 128² 29 (5) |
   | gentle | Plains, Lakes, Meander, Helix Mountain, Mountain Range | 72–86 % | 0.7–2.7 % | 18–50 tiles (4–5) |

   What the bold family has and round 4 has not is **bunching**: in places the rings close up into a wall 4 to 6
   levels tall within one to three tiles, round a form with a name (Terraces' mesas, Hollows' ringed hollows with
   green floors, Canyon's gorge whose sides are two tall faces with a bench between), and between the walls the
   ground is as calm as on the gentle maps. Round 4's rings are evenly spaced and one level tall everywhere, so
   Highlands 2 and Canyon 1 read as plains. River Valley is rightly gentle; Highlands and Canyon are not.
   The bold bundled maps also carry more fine relief (Terraces 3.9, Pressure 3.9, Hollows 6.7 %), because a tall
   wall counts as fine height: the 3.0 % bar was right for the gentle family only.
3. **Lake Basin got rougher** (fine relief 6.0 → 7.4 %, runs of 12+ from 2 to 5, reach 13,232 → 9,340), and
   Islands and Delta moved without being judged.

**Round 5, in this order, each part its own commit so that a part that fails can be left out.**

**A. The start's ways out.** Do not touch the start's pick (another session is changing it). Take ground truth
first: run the same reach measure on the ten bundled 256² maps from their own starting location and write down
reach as tiles and as a share of land, beside ours at base and at round 4. Then make the slopes fit a ringed
land above 128² (the terraces round the start joined to their neighbours, the count and spacing scaled to the
length of ring, never a slope on a wall of 2+). Bar: reach on each of the six at or over base, and, if the
bundled maps give more than base does, at least the bundled median's share of land; no start fails; seconds as
before.

**B. Lake Basin, Islands, Delta.** None of the three may be worse than base 0.10.48 at 256² seeds 1 and 2 on
fine relief, runs of 12+, reach or the start's rows. Find why Lake Basin's fine relief rose; fix it, or leave
that theme on its base path above 128² and say so.

**C. The bold family for Highlands and Canyon.** Target pictures: `Terraces-low.jpg`, `Hollows-low.jpg`,
`Canyon-low.jpg`, `Oasis-low.jpg` in `C:/dgm-showcase/ref/official/`. What is built: the rings **bunch**.
- Highlands: two to four mesas or plateaus 40 to 80 tiles across, each with a wall 4 to 6 levels tall round
  most of its rim and one or two graded ways up, standing on the ring terraces round 4 made; the tops level
  enough to build on.
- Canyon: the gorge 6 or more deep where it is deepest, its sides two tall faces (3 and 3, or 4 and 2) with a
  bench between wide enough to build on; one or two hollows (a ring wall 3 to 5 tall round a floor that takes
  water or green) off the gorge.
- River Valley stays as it is.
- Walls come from the smooth field (a steep band in a form's profile before the snap), never from noise, so
  the wall's line is as smooth as the rings; the ways through every long wall stay.

Bars for Highlands and Canyon (each of the four maps): one-level share of steps 45–65 %; land beside a 4+
drop 4–9 %; a longest 3+ face of 60 tiles or more at a median drop of 4 or more, round a form; fine relief
5×5 at most 4.5 % and 9×9 at most 8.5 %; land in patches under 40 tiles at most 12 %; step edge 21–30 per 100
land. For all six: regional relief median 8.5 or more; commonest level at most 17 % at the median; dead flat
45–61 %; reach as in A; Highlands' own promise (high share, plateaus, cliffs) met in at most three attempts on
both seeds. River Valley's two maps keep round 4's bars.

**The eye.** The same shuffled sheet, with Highlands and Canyon beside the bold bundled maps: each of the four
has a wall I can see from the low camera and a form I can name, and none is picked out by texture.

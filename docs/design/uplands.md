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

### Round 5 findings (2026-11-19)

Three commits, each droppable on its own: A the start's ways out, B Lake Basin and Islands, C the bold family. Every
map at 128² and under is byte for byte round 4's (six themes compared); the six generate 6.5 % faster than base.

**A. The start's ways out** (`features/slopes.ts` `RING_SLOPES`, PLAN §7.5). The bundled 256² maps' starts walk to
little: 639–5,657 dry tiles from their own start, a median of 1,202 (2.95 % of land), so the bar is base's. Above 128²
on ringed land the slopes' core grows with the map (80 tiles at 256²), a long step of the tree gets a slope per 70
tiles of it (up to 4), a step the spacing rule left bare gets its nearest pair, and every 400+ region beside the joined
ground is joined before rule 4. Reach (base → round 4 → round 5): Highlands 1 12,631 → 8,071 → 16,167; Highlands 2
5,577 → 3,157 → 12,453; Canyon 1 6,261 → 10,922 → 17,402; Canyon 2 5,439 → 15,327 → 15,902; River Valley 1
13,822 → 20,573 → 30,716; River Valley 2 18,093 → 4,571 → 35,716. Every start passes. The rules are the generator's
ringed land's only (`SlopeRules.ringed`, the field's `ringSlopes`, kept in the project): a premise's land and the two
themes B leaves keep theirs.

**B. Lake Basin, Islands, Delta.** Lake Basin's fine relief rose with round 1's map-scale forms and round 4's ringed
path (the smoothing, the slow warp, its ring forms), which its few forms do not need: its land is mostly the lakes'
basins. Islands' straight runs rose the same way. Both stay on 0.10.48's path above 128² (`genome.ts`
`UPLANDS_BASE_PATH`: no map-scale forms, the levels at a 128²'s scale, 0.10.48's edge warp, its slopes), and their
256² maps are byte for byte 0.10.48's. Delta stays on the ringed path, better than base on every measure: fine relief
seed 1 6.8 → 3.2 %, seed 2 3.5 → 1.2 %, runs of 12+ 2 → 1 and 1 → 0, reach 3,159 → 39,066 and 11,256 → 49,866, its
start's missed rows a subset of base's.

**C. The bold family** (`land/bold.ts`). Highlands: two to four mesas 42–68 tiles across, their walls a steep band of a
smooth profile 4–6 levels over the rings round their rim, one or two ways up of one-level treads, tops level in
patches, the field the water is planned on raised under them, their rims left by `notchWalls`; the land leaves its
forms 4 levels (`ROOM`), and mesas are 35 % of its ring forms. Canyon: a bench cut into the gorge's wall 4 levels over
the floor where the wall is steep, wandering in width (none in places), one or two hollows off the gorge, the gorge's
grade rolled 1.5 times its theme's (3 left 75–81 % of its steps one level), and mesas 50 % of its ring forms.
Highlands passes every per-map bar on both seeds (one-level share 64.8 and 64.6 %, beside a 4+ drop 5.5 and 4.4 %,
longest face 98 tiles at 5 and 71 at 6, fine relief 4.4/7.7 and 3.0/5.4 %). Canyon passes all but one: its longest 3+
face is 61 and 69 tiles at a median drop of 3, not 4 (the longest faces are the tableland's 3-level walls, longer than
the gorge's benched sides; buttes held to 4+ levels moved Canyon's steps back over 65 % one level and did not move the
face). Across the six: regional relief's median 7.98 → 8.20 (bar 8.5), the commonest level's 16.6 → 18.1 % (bar 17:
Canyon's tableland, 18.4 and 18.9 %), dead flat 59.0 % (in 45–61). Highlands' promise takes 9 and 5 attempts (bar 3):
it fails on the planned land's "high" share (0.29–0.52 against 0.6), not on its plateaus or cliffs: the planned lakes
stand on the terraces and lift the water's median level; on the built land the same attempts read 0.92–0.97. Three
mesas or more (a trial) took the start of Highlands 2 onto a mesa top (reach 2,884) and was dropped.

**What it leaves.** Highlands' planned promise (where its lakes stand, or reading "high" over the rivers' level and
not every lake's); Canyon's face drop and commonest level; regional relief at the map's scale.

## Round 5 verdict and the PR round (planning, 2026-11-19)

**Verdict: rounds 1 to 5 go to dev as one change, the bold walls included.** Starts first: all six pass, and
reach is over base on every one (Highlands 12,631 → 16,167 and 5,577 → 12,453; Canyon 6,261 → 17,402 and
5,439 → 15,902; River Valley 13,822 → 30,716 and 18,093 → 35,716). On the shuffled sheet none of ours is
picked out by texture, Highlands 2 shows mesas and Canyon 1 a gorge. Lake Basin and Islands stay on
0.10.48's land above 128² until their own round; Delta is better on every measure.

**What falls short, named.**
- Level room at the start is under base on four of six (Canyon 255 → 241 and 388 → 309, River Valley 304 → 207
  and 391 → 284) and under the 400 asked on all six, as at base. The land now has the terraces (1,000 to 2,000
  tiles); the start's pick does not yet choose one. That is the start-pick change's first job on this land.
- Highlands takes 9 and 5 attempts (base 5 and 5); seed 1 takes 51 s against 31. Its promise's "high" share
  fails on the ringed land, and the bundled Terraces, Pressure and Mountain Range fail it too: the ask is not
  what the game's own highlands give. The PR round measures them and sets the ask from them.
- Canyon's longest face has a median drop of 3, not 4: the bar contradicted the design (two faces of 3 with a
  bench is what was asked). The bar is withdrawn.
- Regional relief 8.2 (8.5 asked), commonest level 18.1 % (17 asked): near, not met.
- Canyon 2's nearest badwater is 37.9 tiles (40 asked; base 72), and Canyon 1 has a wide badwater pool at the
  gorge's mouth. Canyon 2 at round 5 is a plainer picture than at round 4.
- Highlands is less bold than Terraces. Lake Basin and Islands are not yet drawn in rings.

## The PR round (2026-11-19)

Generator 0.10.49 (D547); numbers in `C:/dgm-showcase/gen/uplands-pr/`.

- **Highlands' promise.** Read the same way as a built map, the bundled highlands' high share is Terraces 0.52, Pressure
  0.18, Mountain Range 0.45, Helix Mountain 0.29, Oasis 0.65 (their plateaus 9, 0, 0, 1, 3; cliffs .110, .087, .054,
  .079, .093; only Oasis keeps the promise whole). Above 128² the ask is the lowest rounded down, held to 0.35
  (`gen/outcomes.ts` `HIGH_RINGED`). Highlands 256² seed 1 now takes 2 attempts (base 5), 15.2 s against base 28; seed 2
  takes 4 (base 5), 28.2 s against 31.4: the promise holds on every attempt, its first three fail on the start's place
  ("one place for a start", "no start" twice), which is the start-pick change's. Both maps are other lands than round
  5's: Highlands 1's reach 16,167 → 15,547 (base 12,631), Highlands 2's 12,453 → 3,439 (base 5,577, under it) with
  its nearest badwater 29.1 (base 67.7), level room 485; C's bars on Highlands 2 move to one-level share 67.8 % (bar
  45–65) and land beside a 4+ drop 3.7 % (bar 4–9), Highlands 1's longest 3+ face to 56 tiles (bar 60).
- **Canyon's badwater.** No change. On Normal the hollows are sited from the plan's start at Normal's Badwater distance
  (15) plus 11 (`hazards.ts` `planBadwater`, the candidates' aim), never at Easy's 40: the 40 row is Easy start's,
  read on a Normal map. The base's 72 on Canyon 2 was where its start stood (168, 161, the hollows by the east edge);
  on the ringed land the start stands at (38, 189) by the west edge, a falls start, and the nearest hollow at (16, 156)
  is 37.9 tiles off, 17 more than the rule's 21. Canyon 1's wide red pool is the soil one badwater course soaks where
  it joins the main water at its lower reach (D476, by design) on the gorge's broad floor by the map's edge. Holding
  Normal's hollows at 40+ above 128² would change the Badwater distance rule, not the land.
- **Other sizes** (seed 1, base → 0.10.49): every start passes. 512×128 (and 128×256) are not "above 128²" (the
  narrower side is 128): their maps are 0.10.48's byte for byte. Reach rises on all six ringed maps (192²: Highlands
  3,342 → 12,479, Canyon 3,545 → 16,207, River Valley 7,818 → 16,787; 384²: 3,431 → 22,751, 13,775 → 106,811, 5,771 →
  98,398). Highlands 192² takes 12 attempts (base 4): four fail the planned promise, whose attempts' cliff share reads .069–.079
  on the built land against .082 asked at 192² (high .94–1, plateaus 4–13;
  Highlands' two-apart benches start at 256², `highlands.ts`), five a river's water leaving its course. Seconds over base by more than 10 %: Canyon 192² 21.0 → 24.1 (+15 %), Canyon 384² 91.2 → 127.1 (+39 %, in
  2 attempts against 4: 64 s an attempt against 23).

## Slopes on ringed land: placement time (2026-11-19)

A CPU profile of one Canyon 384² seed 1 map at 0.10.49 (117 s): placing slopes is about 1 s of it, the start's walks
over them (`startWalks`) another 1 s. The reading that ringed slopes were the cost was wrong. The map takes two
attempts. The first fails ("no place for badwater") after 30 s, 20 of them in six searches for a badwater site
(`planBadwater`), every one failing. The second takes 84 s: the water's settle 51 s and the water's runs 19 s (the Rust
water in WebAssembly), the badwater search 6 s, the start's pick 4 s. At 0.10.48 the same map took four attempts,
three of them failing cheaply at the land stage, and its shown attempt spent the same on the water (49 and 18 s).
Measured in turn on this machine, one map at a time, by CPU time: 0.10.48 127.0 and 129.8 s, 0.10.49 124.6 and
132.1 s. The map is no slower; "64 s an attempt against 23" divided one map's time by two attempts against four.

What changed (no map moves: 41 maps' project and file hashes the same before and after, the six themes at 136, 192
and 256 seeds 1 and 2, Canyon and Highlands 384 seed 1, three maps at 128² and under): the slopes placed are kept by
square of 12 tiles, so the spacing rule reads only those near a candidate (it read every slope placed for every
candidate); the badwater search's spread from the water and the edge is written out four neighbours by hand, and a
pit is dug into its copy of the ground over the pit's 17×17 square, not the whole map. CPU seconds before → after,
measured in turn: Canyon 384² 133.5, 121.2, 127.5 → 117.0, 123.6, 116.0 (wall 95.9–239.8 → 93.2–103.1 s);
Canyon 192² 45.1, 47.1, 44.7 → 44.4, 45.7, 46.4; Highlands 384² 66.0 → 64.7. Canyon 384² stays near 50 s an attempt,
not 30: its shown attempt's water alone is about 70 s, and the first attempt's failing badwater searches 20 s. Either
is its own work: the Rust water's settle, or a badwater search that finds no site sooner.

## Round 6: Highlands stands up (2026-11-19)

Generator 0.10.52 (first numbered 0.10.51), on pickStart (0.10.50, D545); D547 amended. Numbers and sheets in
`C:/dgm-showcase/gen/uplands6/`. Highlands above 128² only (`bold.ts` `standsUp`): every other theme, and Highlands at
128² and under, is 0.10.50's byte for byte.

**What was built** (`land/bold.ts` `STAND`, `standValley`, `lowerValley`, `standMesas`; `levels.ts` `snapLevels`;
`highlands.ts`; `hydro.ts`).
- **The valley.** A lobed bowl near the map's middle (radius 14–18 % of the side, its middle within 6 % of the map's),
  and a channel through it along the water's way from the upstream edge to the downstream one, wandering (11 % of the
  side over a cell of 30 %) and varying in width. Its floor is the base, a level higher where the water enters, never
  rising downstream, so it holds no lake. The bowl's rim falls over one to four tiles as a slow noise has it: a wall in
  places, a slope in others. The field the water is planned on is sunk with it (`lowerValley`), and the main water
  enters by the upstream edge (`inflows` at least 1), so the river runs through the valley and the start, picked on
  the water, stands in it.
- **The floor.** Four levels over the base, four levels deep, rising away from the valley (half its rank, half its
  distance from the valley eased over half the side), in two-level benches with no roll, no riser and no drift (the
  roll added after the bench broke the benches into one-level steps). The ring forms on it are few (1.25 a 128²), hills
  and stepped hills, no mesas among them (`rings.ts`), and stand under 3 levels of room.
- **The mesas.** Five to nine a 256² (by area), 35–80 tiles across, lobed and stretched up to a third along a turned
  axis, the first the largest; clear of the valley and 8 tiles from each other, partly off the map's edge where they
  fall there. Each stands 4–6 levels (5 and 6 the commoner) over the 75th percentile of the ground round its rim, kept
  only where at least 60 % of its rim stands 3.5–7.5 levels under its top and its own ground stays 2.5 levels under it.
  One or two arcs of the rim (an eighth to a quarter of it, the first toward the valley) are broken: the edge eaten in
  up to 7 tiles, then a level every 1.8–4.5 tiles, irregular, down to the mesa's foot and no further, so the slopes find
  their way up there (no ramp is laid). Half have one inner ring 1–2 levels higher over 40–60 % of the radius. The rims
  are kept from `notchWalls`; the field the water is planned on stands high under each, and no spring or reach spring
  is drawn on a top (`Genome.dryTops`): the tops are dry ground for a dam, a pump or a channel to water.
- **Elsewhere.** Highlands above 128² has its grade's roll, riser and drift at 0 and its terrace share 1, so its
  floor's steps stand two levels where they gather (`highlands.ts`). Its promise asks four plateaus and a cliff share of
  0.06 at 128² (falling as the square root of the side), not three and 0.1 (`gen/outcomes.ts`, below).

**Measures** (256², Normal, seeds 1–6, base 0.10.50 → 0.10.52; bars in brackets; all in
`C:/dgm-showcase/gen/uplands6/numbers.md`). Regional relief 6.5–8.2 → 7.0–9.2 [≥ 12]; relief p5–p95 10 → 11–12 [≥ 10];
land beside a 4+ drop 3.5–5.1 → 2.7–6.1 % [6–9]; one-level share of steps 56.9–67.8 → 50.0–57.6 % [44–55]; longest 3+
face 63–198 → 83–209 tiles at a median drop of 5–7 [≥ 85, ≥ 5]; plateaus 2–6 → 5–14 [4–9]; fine relief 2.7–5.8 →
2.4–4.1 % [≤ 3.5]; land in patches under 40 tiles 6.4–10.3 → 3.0–4.3 % [≤ 7.5]. Two bars were read from the wrong
columns: Terraces' and Oasis' "regional relief 18.2 / 18" is their land beside a 2+ drop (their regional relief is 9.12
and 9.29; of the bundled 256² maps only Spillage passes 12, at 12.08; a land from base 4 to top 16 that keeps a valley
floor cannot), and Terraces' "fine relief 2.72" is its land in patches under 10 tiles (its fine relief is 3.91).

**The start** (seeds 1–6 at 256², seed 1 at 192² and 384², Normal and Easy: 16 maps, base → head). Every start
passes; attempts 118 → 52 (most 18 → 11); CPU 839.7 → 559.1 s; level room 400 or more on 6 → 13; reach least 5,302;
Easy rows missed 70 → 59. Short of the bars: the start stands in the valley in the middle third on 8 of 16 (Normal 256² seeds 1
and 2, 192², 384²; Easy 256² seeds 1, 2, 4, 384²); on Normal seeds 3–6 the pick takes a place on the floor beside a lake, whose water lasts a drought
where the valley's river does not. More Easy rows missed than base on five maps (256² seeds 1 and 5, Easy 256² seeds
1 and 2, Easy 192²: calm where the start stands within 8 tiles of the valley's rim, water and drought by the river);
room under 400 on Easy 256² seeds 1 and 2 and Easy 192²; Easy 256² seed 3 takes 11 attempts; CPU over base by more than
15 % on three maps (256² seed 1 +76 % in 4 attempts against 2, seed 6 +66 %, Easy seed 6 +54 %). Tried and dropped: a
softer bowl rim (two to six tiles: the calm row held on Easy 1 and 2, the one-level share rose to 58–60 %); a pull of
the start's preference into the valley (`generate.ts`, as D357's along a long map: 3 of 16 starts in the middle);
a level bowl floor; a hollow in the bowl's field for a lake (the water's plan fills it). Holding the start in the valley
needs water there that lasts a drought: a lake the valley's river runs through, which is the hydrology's to plan.

**The promise** (`gen/outcomes.ts`). Above 128²: high share 0.35 (kept), plateaus 3 → 4, cliffs 0.1 → 0.06 × √(128 /
side) (.0707 → .0424 at 256²). Standing up gathers the drops into a few tall walls and leaves the floor in broad
benches, so less land stands beside a 2+ drop: .044–.063 on the planned lands of seeds 1 and 5 (13 lands) and
.040–.066 on the built maps, against .0707; every land missed it and each map spent its screens on it. The game's own
read .087–.110. The ask is the lowest seen, rounded down; four plateaus asks that the mesas stand (5–17 on the built
maps). At 128² and under nothing changes.

**Every other theme, and Highlands at 128² and under, is 0.10.50's byte for byte**: project and `.timber` (read back,
the version neutralised) identical on 52 maps (Canyon, River Valley, Lake Basin, Islands, Delta at 136², 192², 256²,
seeds 1, 2; Any seeds 1–4; Highlands 128² seeds 1, 2, 7, 96² seed 1, 64² seed 2; and the small sizes of earlier proofs).

**What it leaves.** The start in the valley on every seed (a lake in the bowl); the Easy rows on five maps; regional
relief (a bar the reference does not meet); the land beside a 4+ drop under 6 % on five seeds (6.1 on seed 5); the
one-level share over 55 % on seed 1; the longest face 83 tiles on seed 4; plateaus over 9 on four seeds; the fine
relief of seeds 1, 3 and 5 (4.1, 3.8, 3.7 %).

### Round 6b: a lake in the bowl, a bench beside it (2026-11-19)

Still generator 0.10.52 (unreleased), on pickStart (89d6887e). The starts before and after:
`C:/dgm-showcase/hl6b/sheet-starts.jpg`. Highlands above 128² only; every other theme, and
Highlands at 128² and under, is 0.10.50's byte for byte (below).

**What was built.**
- **The bench and the lake** (`bold.ts` `STAND.lake`, `standValley`). The bowl's floor is a level bench two levels over
  the base. A lobed hollow two levels deeper lies along the water's line: its middle is 0.7 of the radius up the line
  from the downstream rim, and it is read at 0.6 scale down the line, so it is longer along the line than across it.
  It takes 35 % of the bowl, and never more than 60 % of the plan's lake budget. The water's plan finds the hollow on
  its river's way and fills it to the sill, the stretch of the bowl's rim the channel crosses at the bench's level
  for 4 tiles before it falls to the downstream edge. Nothing here lays water. The bench lies beside the lake on both
  sides, and the river reaches the lake at the bowl's upstream end, not across the bench. Upstream, the channel falls
  to the bench from 2 levels over it (`valley.rise`). `lowerValley` sinks the field to the water's line, so the
  river keeps to the middle.
- **The sill holds** (`hydro.ts` `profileOf`, `Genome.rockSill`). On such a land, a river leaving a lake holds the
  lake's outlet bed while it crosses the sill's rock (the valley's tiles from 0.45 of the radius up the line from the
  rim to 6 past it; since step 3, from the lake's middle to 0.2 of the radius past that). Inside the lake its bed is
  the outlet bed. Without this, the main river's cut (incision and hanging drops, up to 6 levels) drained the lake to
  its bed. Other lands have no `rockSill` and are unchanged.
- **No second lake, no drowned head** (`highlands.ts`, stand lands only). No troughs: a "valley lake" dug a second
  hollow into the bench. No hanging cut, and incision at most 1.4: the entrenched main river put its tributaries'
  mouths two levels under the lake, which failed as "a river's head under a lake".
- **The pick is untouched.** `settler.ts` and `generate.ts` pass only the lake budget to `standValley`.

**The start** (seeds 1–6 at 256², seed 1 at 192² and 384², Normal and Easy, base 89d6887e → 6b. Each map was
generated one at a time, base and head in turn; CPU is `process.cpuUsage` for the whole generation).

| map | attempts | room | reach | Easy rows missed (base → 6b) | calm | water / drought | CPU s |
|---|---|---|---|---|---|---|---|
| 256² s1 | 2 → 2 | 543 | 26,826 | 3 → 3 (water, drought, metal) | 0 | 6.2 / – | 20.6 → 27.3 |
| 256² s2 | 4 → 1 | 541 | 35,826 | 5 → 3 (water, drought, metal) | 0 | 7.2 / – | 34.5 → 25.2 |
| 256² s3 | 7 → 2 | 549 | 9,567 | 6 → 4 (water, drought, food, metal) | 0 | 7 / – | 48.7 → 27.7 |
| 256² s4 | 6 → 1 | 475 | 28,795 | 5 → 3 (water, drought, metal) | 0 | 6.7 / – | 73.3 → 26.7 |
| 256² s5 | 4 → 1 | 476 | 7,458 | 3 → 1 (metal) | 0 | 4 / 4 | 39.5 → 25.3 |
| 256² s6 | 4 → 2 | 439 | 6,658 | 6 → 4 (water, drought, food, metal) | 0 | 6.7 / – | 26.5 → 25.2 |
| Easy 256² s1 | 18 → 2 | 453 | 30,489 | 3 → 2 (food, metal) | 0 | 3 / 4.2 | 64.3 → 25.8 |
| Easy 256² s2 | 4 → 1 | 405 | 26,004 | 2 → 3 (drought, food, metal) | 0 | 3.4 / 11.2 | 33 → 23 |
| Easy 256² s3 | 8 → 2 | 438 | 9,542 | 4 → 2 (food, metal) | 0 | 3 / 3 | 52 → 28 |
| Easy 256² s4 | 10 → 1 | 489 | 21,602 | 5 → 2 (food, metal) | 0 | 2.8 / 7.7 | 108.4 → 26.4 |
| Easy 256² s5 | 6 → 1 | 468 | 7,489 | 4 → 2 (food, metal) | 0 | 3 / 3 | 43.3 → 24.2 |
| Easy 256² s6 | 5 → 2 | 445 | 7,249 | 7 → 3 (drought, food, metal) | 0 | 3.4 / 27.2 | 27.3 → 24.8 |
| 192² s1 | 12 → 7 | 526 | 3,650 | 5 → 3 (water, drought, metal) | 0 | 6.8 / – | 30.8 → 26.9 |
| 384² s1 | 2 → 3 | 528 | 37,846 | 5 → 4 (water, drought, food, metal) | 0 | 6.8 / – | 45.5 → 63.9 |
| Easy 192² s1 | 12 → 7 | 431 | 3,646 | 2 → 2 (food, metal) | 0 | 2.8 / 2.8 | 31 → 25.6 |
| Easy 384² s1 | 14 → 4 | 455 | 28,479 | 5 → 2 (food, metal) | 0 | 2.8 / 2.8 | 110.7 → 69.7 |

Every start passes. Every start stands on the valley's bench (level 6), with no rim wall (3+ levels over it) within
9.8 tiles. The nearest walls are 10–30 tiles off on 13 maps, and 36, 39 and 51 tiles off on Normal 256² s1, Easy 256²
s1 and Normal 384². Summed: attempts 118 → 39, CPU 789 → 496 s (−37 %), Easy rows missed 70 → 42. Room is 405 or
more on all 16. Calm is 0 on all 16 (it failed on four of round 6's maps). No draw is for a leak: base drew 16 lands
again for "a river's water leaves its course", 6b none. Fine relief is 2.1–3.4 % on 256² Normal s1–s6 [≤ 3.9].
Regional relief is 7.08–8.22 [≥ 8.5].

**Short of the bars.**
- Regional relief 7.1–8.2 on all six seeds (round 6: 7.0–9.2; base: 6.5–8.2). The bench and the channel above it
  stand two levels over the base, where round 6's valley floor stood at the base. The land's top is 16, so the
  valley's blocks set the 10th percentile. A lower bench (sill 1, lake 1 deep, rise 1) moved the starts out of the
  valley on 4 of 16 maps and still read 5.4–8.6.
- Easy 256² s2 misses one more row than base: the drought row, a pump 11.2 tiles' walk away after the drought
  (bar 10). Its start is 3.4 tiles from a tributary that dries; the lake is farther.
- 192² (Normal and Easy): 7 attempts (base 12) and reach 3,650 (base 12,424). At 192² the lake along the line
  leaves two benches, each walled by the floor four levels up, so less land is walked to. The planned water story
  also reads only 14–30 % of the land near water on the lands it screens (asked 35 %).
- CPU over base by more than 15 % on Normal 256² s1 (+33 %, 2 attempts each) and Normal 384² (+40 %, 3 attempts
  against 2). Each attempt on a land that stands up costs more than one of base's.
- On Normal, the water row (≤ 6 tiles' walk) misses on 7 of 8 maps, at 6.2–7.2. The drought row reads only bodies
  within that walk, so it misses with it. The pick aims Normal's start 6.75 tiles from its water (`settler.ts`
  `walkWant`, from Normal's water rule of 20). That aim is the pick's own, so it was left alone. Base's starts passed
  the row on s1 and s5, at 5.2–5.4.

**Tried and dropped.** A round lake against the downstream rim (`lake.at` 0.45, no stretch): the river crossed the
bench to reach it in a one-level channel. The starts sat between that river and the rim: room 361 on 192², 399 on Easy
256² s3, and one more row than base on Normal 256² s1 and s5. A softer lake shore (2.5 tiles): the start stood off
the lake on 192². Troughs on (a second lake ate the bench); incision and hanging drops left as the theme has them
("a river's head under a lake" on 14 draws); a sill mask only on the channel (the river left the lake sideways and
cut it). A lake 0.25 of the bowl, and stretches of 0.45 and 0.75–0.8: 192² stayed at 7 attempts, or its start lost
room.

**The hash proof.** Project JSON and `.timber` (read back, the version neutralised) sha256 identical, base 89d6887e
and 6b, each side run alone, on round 6's 52 maps: Canyon, River Valley, Lake Basin, Islands, Delta × 136/192/256 ×
seeds 1, 2; Any × 136/192/256 × seeds 1–4; Highlands 128² seeds 1, 2, 7, 96² seed 1, 64² seed 2; Canyon 128² seed 2,
River Valley 128² seed 5, Islands 128² seed 3, Lake Basin 96² seed 1, Delta 64² seed 2.

### Round 6b step 2: the look (2026-11-19, pushed as a branch and held: the start's bars failed)

Still generator 0.10.52, on step 1's a5d893b5; Highlands above 128² only (`standsUp`). Top views and notes in the
worktree's `.scratch/notes-6b2.md`; numbers in `C:/dgm-showcase/gen/uplands6b/numbers.md`.

**What was built.**
- **The lake's shore** (`bold.ts` `lakeShore`): the bowl's tiles nearest a deep-lobed outline (`lake.lobes` 2.6) read
  half as far down the water's line as across it, through a slow warped noise (`lake.bays`), so the shore has bays, a
  spit or a horseshoe round a point, and no two lakes share an outline. Tried first and dropped: a lake grown from its
  middle by a priority flood on a tapering, noisy cost (narrow upstream, broad at the sill). It read found (arms,
  bays, a narrow end) but cut the bench into strips: the start lost room and its drought row on 8 of 16 maps.
- **Green as a pocket** (`highlands.ts`): one inflow, `STAND.springs` 3 at the most, and no reach springs (D504's,
  `hydro.ts`) on a land that stands up. Moist share of land 17–36 % → 9–22 % (bundled 1.7–11.7 %, below).
- **Benches** (`bold.ts` `benchValley`, `STAND.bench`): round the bowl and the channel past the sill, the floor steps
  down to the valley in up to three rings, 5–13 tiles broad as a noise has it, two levels each (one level a ring put
  the one-level share at 63–75 %). **Mesas** four to six a 256², radius 24–46 (`STAND.mesa`), each on a plinth two
  levels high and 4–9 tiles broad where its wall keeps 5 levels over it, and four in five with an inner ring two levels
  up. The floor's relief stays 4 over 4 (3 over 3 left the upstream channel over the floor and the lake dry).

**The bundled range** (stored soil and water, one script, `.scratch/moist.ts`; water: stored 0.1 deep or more; moist:
land whose top stores moisture). Terraces 10.7 % moist / 14.1 % water, Oasis 1.7 / 0.6, Pressure 5.1 / 12.7,
Spillage 11.7 / 9.0 (Hollows 20.1 / 9.5, Canyon 16.6 / 9.6). Step 1's seeds 1–6: 17.0–36.1 / 7.9–12.3.

**Land, 256² seeds 1–6** (this head): regional relief 8.19–8.93 [≥ 8.5: seeds 1–4 short, 8.19–8.47]; p5–p95 10 [≥ 10];
beside a 4+ drop 2.0–3.0 % [5–9: all short]; one-level share 49.5–59.9 % [44–55: seeds 3, 4, 5 over]; longest 3+
face 64–104 tiles, drop 4–6 [≥ 85: seeds 1, 5, 6 short]; plateaus 4–8, 13 on seed 6 [4–9]; fine relief 1.7–2.3 %;
patches under 40 tiles 2.5–3.5 %; moist 9.3–21.9 % [1.7–11.7: seeds 2, 3 inside]; water 7.6–13.3 % [0.6–14.1].

**Short of the bars: why it was held.** The start's rows move with the bowl's shape, and no shape tried keeps
every map's. With this head, against a5d893b5, on the eleven maps measured: Easy rows missed worse on Normal 256² s1
(3 → 4) and s5 (1 → 3), Easy s3 and s4 (2 → 4, room 226 and 361); better on Easy s1 and s2 and Normal s6; Normal s4's
start leaves the valley for the downstream river. With the flooded lake, before: 43 → 48 rows on all 16, food lost
on most, 384² at 11 attempts (planned promise, straight channels, the water story), 192² and 384² starts off the
bench. With step 1's own lake and everything else of step 2, the Easy rows held on five of six maps (Easy s1: room
195). Also short: the land beside a 4+ drop (the plinths eat the walls' height under the top of 16), the one-level
share on three seeds, the longest face on three, moist share on four; ruled bits (item 4) were not worked: only the
channel past the sill now leaves in rings, not a chute.

### Round 6b step 3: the lake keeps the bench (2026-11-19, pushed as a branch and held: the start's bars failed)

Still generator 0.10.52, on step 2's 1404903f; Highlands above 128² only (`standsUp`). Before/after sheet (step 2 and
step 3 round the start, four maps): `C:/dgm-showcase/hl6c/sheet-step2-vs-step3.png`.

**The base count is 43, not 42.** Measured again on a5d893b5 with the same script (16 maps, `pr/gen.ts`, rows from
each map's JSON): 43 Easy rows missed, and step 1's own table's step-1 column sums to 43; "70 → 42" was a slip in
the sum.

**Why step 2's starts left the bench: the lake drained.** On step 2 the lake stood at 3.4–4.4 on Normal s3, Easy s4,
Easy 192² and Normal 384² (5.1–5.7 on a5d893b5): two levels under the bench, whose moisture (2 × saturation, less 6
a level over the water) then reached no land, so the pick left the valley or took a dry corner. Three ways out, all
in `hydro.ts` `profileOf` and the sill's mask: the river left the lake by a lobe before the sill's rock began (0.45
of the radius up the line from the rim); it crossed a bar or a spit and came back into the same lake, cutting
through its floor; and it left past the sill's end (4 + 2 tiles past the rim on the line, short of where a 384²
lake reaches).

**What was built.**
- **The bench first** (`bold.ts` `lakeShore`, `STAND.lake.shift`, `bench*`). The bench lies on the side of the
  water's line where the bowl is broader beside the lake's middle, and the lake's middle lies 0.12 of the radius off
  the line away from it. Facing the bench the shore is read from an outline of gentle lobes (1.5, read 0.6 as far down
  the line as across); turning away from it, from step 2's deep lobes and bays, so the bays, the spit and the narrow
  end lie on the far shore and at the ends.
- **The sill holds wherever the river leaves** (`bold.ts` `standValley`, `STAND.lake.sillPast`; `hydro.ts`
  `profileOf`, rock-sill lands only). The sill's rock reaches from the lake's middle to 0.2 of the radius past the
  channel's run, within 1.2 radii of the line. A river that comes back into the lake it left is in it again. Leaving,
  it takes the outlet's bed, not a lower bed it ran on upstream. Every lake now stands at 5.2–5.8 (in the middle
  half; small side ponds at 3.4–4.7).

**The start** (base a5d893b5 → step 3; base run alone earlier, head two maps at a time while another builder ran, so
CPU is rough).

| map | attempts | room | reach | Easy rows missed (a5d893b5 → step 3) | calm | water / drought | CPU s |
|---|---|---|---|---|---|---|---|
| 256² s1 | 2 → 2 | 468 | 53,567 | 3 → 3 (water, drought, metal) | 0 | 7.4 / – | 39.4 → 32.3 |
| 256² s2 | 1 → 1 | 515 | 52,833 | 3 → 4 (water, drought, food, metal) | 0 | 6.7 / – | 37 → 28.5 |
| 256² s3 | 2 → 1 | 531 | 48,026 | 4 → 3 (water, drought, metal) | 0 | 7.1 / – | 44.8 → 28.7 |
| 256² s4 | 1 → 1 | 454 | 35,908 | 3 → 4 (water, drought, food, metal) | 0 | 6.7 / – | 42.3 → 39.6 |
| 256² s5 | 1 → 2 | 531 | 33,569 | 1 → 4 (water, drought, food, metal) | 0 | 7 / – | 38.7 → 33.1 |
| 256² s6 | 2 → 1 | 521 | 38,957 | 4 → 3 (water, drought, metal) | 0 | 6.8 / – | 38.2 → 32.3 |
| Easy 256² s1 | 2 → 2 | 458 | 46,922 | 2 → 2 (food, metal) | 0 | 3 / 3 | 40.3 → 30.9 |
| Easy 256² s2 | 1 → 1 | 467 | 50,338 | 3 → 2 (food, metal) | 0 | 3.4 / 6.2 | 35.2 → 25.5 |
| Easy 256² s3 | 2 → 1 | 470 | 48,589 | 2 → 2 (food, metal) | 0 | 2.8 / 2.8 | 44.5 → 29 |
| Easy 256² s4 | 1 → 1 | 389 | 39,912 | 2 → 4 (room, badwater, food, metal) | 0 | 3 / 3 | 41.3 → 40.6 |
| Easy 256² s5 | 1 → 2 | 447 | 33,518 | 2 → 2 (food, metal) | 0 | 3.4 / 3.8 | 38.3 → 32.2 |
| Easy 256² s6 | 2 → 1 | 443 | 15,804 | 3 → 1 (metal) | 0 | 3 / 3 | 38 → 32.4 |
| 192² s1 | 7 → 4 | 309 | 26,136 | 3 → 5 (room, water, drought, food, metal) | 0 | 9 / – | 39 → 41.8 |
| 384² s1 | 3 → 7 | 516 | 111,141 | 4 → 3 (water, drought, metal) | 0 | 6.7 / – | 108.8 → 100.6 |
| Easy 192² s1 | 7 → 7 | 408 | 28,672 | 2 → 1 (metal) | 0 | 3 / 3 | 38.1 → 47 |
| Easy 384² s1 | 4 → 6 | 407 | 111,762 | 2 → 2 (food, metal) | 0 | 2 / 2 | 108.3 → 91.4 |

Summed: Easy rows missed 43 → 45 (step 2: 53), attempts 39 → 40, CPU 772 → 666 s. No draw is for a leak; the extra
draws are planned promise (8), the start's water moved (8), straight channels (4, 384² only: spring rivers on the
open floor, not the lake's) and the water story (2). Every start stands on the valley's bench (level 6) but Normal
192²'s (level 11, room 309).

**Short of the bars: why it was held.**
- Easy rows worse on five maps: Normal s2, s4, s5 and 192², Easy s4. CPU over 15 % on Easy 192² (38.1 → 47 s). Normal's misses swing with the pick's
  draw: it aims its walk at 6.75 tiles, past the water row's 6, so the water, drought and food rows of a Normal map
  come and go with which of the best few places it draws (the same lake gave Normal s1 3 or 4 and s5 3 or 4 across
  variants). Nothing in the lake decides it, and the pick is not to be pulled.
- Room under 400 on Normal 192² (309, start off the valley: the seed's draw prefers another kind of place; base
  stood on a different land, its seventh draw) and Easy s4 (389, the start against the bench's shore).
- Attempts over base on s5 (2: the first land's cliffs 0.0410 under 0.0424, the plinths eating the walls) and 384²
  (7 and 6: straight spring channels on the floor, ~145 tiles from the valley). Both are step 2's land, step 4's.
- The bench's shore is too even on Easy s4 and Normal 384²: a long, nearly straight stretch reads ruled. A gentler
  near outline is what keeps the bench's room; with deeper lobes there the bench is cut again.

**The hash proof.** Base 89d6887e and this head, each side run alone, round 6's 52 maps (step 1's list): 52 of 52
identical.

**Tried and dropped.** Step 1's round outline on the bench side with step 2's lobes beyond (43 → 46, the lake half
round); the lake's middle 0.2 of the radius off the line (50: the far shore pinned against the rim); holding the river's bed at the lake's level while the ground round it stands at the bench's
(49, and 45 with the middle 0.12 off, but Easy s4's lake became a reservoir down the channel); the sill reaching only the bowl's rim, not past it
(44, Normal 384²'s lake at 4.7: the river left past the sill's end). Turning off the rings round the downstream
channel left 384²'s attempts at 7: they are not the rings'.

### Round 6b step 4: walls, green, the start (2026-11-20, pushed as a branch and held: the start's bars fail)

Generator 0.10.52 (planning, 11-20: another session's pick PR takes 0.10.51), on step 3's d86a318b with origin/dev
merged. Highlands above 128² only (`standsUp`). Sheets and numbers: `C:/dgm-showcase/gen/uplands6c/`.

**What was built.**
- **The wall rises from the floor** (`bold.ts` `standMesas`). A mesa's top is the 75th percentile of the ground round
  its rim plus its wall (4–6), and its wall rises from the floor in one face; the plinth (two levels, 4–9 tiles a
  ring) is kept only under its stepped side, where the steps end on it. Its wall is a band of `wall` 0.5 tiles (1.2),
  its outline lobed twice as deep as a ring form's (1.5 before), and the first mesa is drawn from the top 15 % of the
  radii (`first`, 30 % before). An inner ring rises `tier` 4 where the top leaves room, else 2 (the tops stand at 16
  on these seeds, so it stays 2). In the levels' edge warp (`levels.ts`) a wall of 4 levels or more on such a land is
  read from its nearest tile, not eased across, which split a face into a 2 and a 3.
- **Green a pocket** (`STAND.springs` 3 → 1): one spring at the most. Moist share of land 9.3–21.9 → 6.5–11.3 %.

**Land, 256² Normal seeds 1–6** (bars in brackets): regional relief 8.04–8.88 [≥ 8.5: seeds 2, 3, 6 short]; p5–p95
10; beside a 4+ drop 2.0–3.3 % [5–9: all short]; one-level share 49.9–59.4 % [44–55: seeds 3, 4, 5 over]; longest 3+
face 71–109 tiles, drop 4–6 [≥ 85: seeds 4, 5, 6 short; seed 5's drop 4]; plateaus 4–8 [4–9]; fine relief 1.9–2.6 %;
patches under 40 tiles 2.2–3.0 %; moist 6.5–11.3 % [≤ 12]; water 6.9–10.9 %.

**The start** (base a5d893b5 → head; one map at a time, base and head in turn, on a loaded machine).

| map | attempts | room | reach | Easy rows missed (a5d893b5 → head) | water / drought | CPU s |
|---|---|---|---|---|---|---|
| 256² s1 | 2 → 2 | 477 | 34,632 | 3 → 4 (water, drought, food, metal) | 7 / – | 41.3 → 35.7 |
| 256² s2 | 1 → 1 | 563 | 54,883 | 3 → 3 (water, drought, metal) | 7 / – | 37.8 → 27.1 |
| 256² s3 | 2 → 3 | 530 | 38,506 | 4 → 3 (water, drought, metal) | 7 / – | 42.4 → 50.4 |
| 256² s4 | 1 → 2 | 499 | 45,708 | 3 → 3 (water, drought, metal) | 6.7 / – | 41.5 → 45.4 |
| 256² s5 | 1 → 2 | 529 | 36,751 | 1 → 3 (water, drought, food) | 6.7 / – | 40.2 → 35.8 |
| 256² s6 | 2 → 1 | 549 | 32,629 | 4 → 3 (water, drought, metal) | 7.1 / – | 39.1 → 27.8 |
| 192² s1 | 7 → 2 | 515 | 25,773 | 3 → 3 (badwater, food, metal) | 5.7 / 8.7 | 39.9 → 25.8 |
| 384² s1 | 3 → 5 | 533 | 92,358 | 4 → 4 (water, drought, food, metal) | 6.7 / – | 119.4 → 109 |
| Easy 256² s1 | 2 → 2 | 310 | 49,338 | 2 → 4 (room, food, metal, hazards) | 3.8 / 3.8 | 42.2 → 36.4 |
| Easy 256² s2 | 1 → 1 | 508 | 48,361 | 3 → 2 (food, metal) | 3 / 5 | 37.7 → 29.1 |
| Easy 256² s3 | 2 → 3 | 439 | 32,920 | 2 → 1 (metal) | 3 / 3 | 47.1 → 48.1 |
| Easy 256² s4 | 1 → 2 | 401 | 45,380 | 2 → 3 (food, metal, hazards) | 3 / 3 | 45.2 → 42.8 |
| Easy 256² s5 | 1 → 2 | 403 | 32,365 | 2 → 2 (food, metal) | 2.8 / 2.8 | 44 → 40.4 |
| Easy 256² s6 | 2 → 1 | 435 | 29,169 | 3 → 2 (food, metal) | 3.4 / 3.4 | 33.1 → 26.3 |
| Easy 192² s1 | 7 → 2 | 457 | 23,556 | 2 → 1 (metal) | 2.4 / 4.8 | 37.6 → 26.3 |
| Easy 384² s1 | 4 → 7 | 416 | 98,173 | 2 → 2 (food, metal) | 2.8 / 2.8 | 106.8 → 132 |

Summed: attempts 39 → 38, Easy rows missed 43 → 43, CPU 795 → 738 s. Every start passes and stands on the valley's
bench (level 6), Normal 192²'s too (room 515; it stood at level 11, room 309, on step 3). Reach is over base on all
16. **The hash proof**: base a5d893b5 and this head, round 6's 52 maps, 52 of 52 identical.

**Short of the bars: why it is held.**
- Easy 256² s1: room 310 and four Easy rows against two (room and hazards added); Easy 256² s4: three against two
  (hazards). Normal's rows are reported, not a bar (the pick's `walkWant`).
- Attempts over base on eight maps: Normal 256² s3, s4, s5 and 384²; Easy 256² s3, s4, s5 and 384². The extra draws
  are "promise (planned)" (the planned land's cliff share under .0424: with no plinth on the wall side less land
  stands beside a 2+ drop), "source in a flow" (s3) and, at 384², the water story and badwater sites.
- CPU over 15 %: Normal 256² s3 (+19 %, 3 attempts against 2) and Easy 384² (+24 %, 7 against 4).
- The walls: land beside a 4+ drop stays 2.0–3.3 %. The mesas' perimeter sets it: four to six mesas of radius 24–46
  give about 1,100 tile edges of 4+ on a 256², and 5 % asks about 1,700. Tried and dropped: floor benches gathered in
  faces of 4 (beside a 4+ drop 3.7–5.6 %, but regional relief 6.1–8.5, one-level share to 60.5 %, the calm row lost
  on Normal s2 and 2–4 attempts on every seed); five to seven mesas of radius 20–46 (no gain: 2.1–3.3 %, plateaus 11
  on seed 6, one-level share 64 % on seed 2).
- Not worked: straight spring channels at 384² (with one spring the floor draws fewer; the 384² draws now fail on the
  water story and badwater, not straight channels); the ruled bits (the bench-side shore of Easy s4 and Normal 384²,
  seed 2's notch, the stepped sides' staircases, seed 4's front notch).

### Round 6b step 5: the start's view, the chute, the notches, the ask (2026-11-20)

Generator 0.10.53 (planning, 11-20: #1202 took 0.10.51, the pick-walk PR #1261 takes 0.10.52), on step 4's be21043b
with origin/dev merged (#1202, D530). Highlands above 128² only (`standsUp`). Sheets: `C:/dgm-showcase/gen/uplands6e/`.

**What was built.**
- **Badwater out of the valley and the start's view** (`bold.ts` `standBadKeep`, `STAND.badView`, `badBeside`,
  `badJoin`, `badFar`; `gen/settler.ts` `badView`). On such a land the badwater keeps off the bowl and 0.08 of the side
  round it, off the channel and 6 tiles beside it but within 6 tiles of the water a ditch joins (the main water's lower
  reach, D476), and 60 tiles from the plan's start (the opening view pulled back, `VISTA_ZOOM`, reaches about that far
  to each side whatever the side). The settler turns the start to the view with the least badwater in it, the opening
  shot choosing among those, and the frame's swap to another of the good few never takes one showing more. Before it,
  the badwater stood in the start's view on 8 of the 16 maps (51–434 tiles of it), on seeds 1 and 5 a stream down the
  channel beside the river; now on none.
- **The chute winds** (`standValley`'s `offAt`, `valley.bend` 0.09 of the side over a cell of 0.16): seed 3's channel
  past the sill ran straight, 19 tiles wide and 4–6 levels deep at the base. The bend starts 1.5 radii out, so the bowl
  and its lake keep their shape; the upstream channel takes rings too.
- **Notches as gullies** (`levels.ts` `notchWalls`' `found`): broad at the foot and narrowing up, each side wandering
  on its own, never under 2 tiles from its line, treads `NOTCH_RUN` (2). Drawn narrower (1.2) or with treads 2–3 tiles
  long, their steps took no slope (the spacing rule), and the colony could not walk out of the bowl: seed 1's reach
  fell to 18,000–21,000 against base's 26,826 and 30,489.
- **The ask re-set** (`gen/outcomes.ts` `CLIFFS_STAND`): this round's planned lands read .036–.057 at 256²
  (.0537–.075 at 128²); seed 5's first land and the 192²'s were drawn again under .06. By round 6's rule (the lowest,
  rounded down) the cliff share asked at 128² is **.06 → .05** (.0354 at 256²). Plateaus stay at 4.

**The start** (base a5d893b5 → head 0.10.53; one map at a time, base and head in turn, two streams).

| map | attempts | room | reach | Easy rows missed | CPU s |
|---|---|---|---|---|---|
| 256² s1 | 2 → 1 | 543 → 538 | 26,826 → 46,984 | 3 → 4 (water, drought, food, metal) | 39.2 → 27.3 |
| 256² s2 | 1 → 1 | 541 → 533 | 35,826 → 51,484 | 3 → 3 (water, drought, metal) | 36.9 → 26.7 |
| 256² s3 | 2 → 1 | 549 → 543 | 9,567 → 47,917 | 4 → 4 (water, drought, food, metal) | 42.2 → 38.0 |
| 256² s4 | 1 → 1 | 475 → 541 | 28,795 → 34,891 | 3 → 4 (water, drought, food, metal) | 39.2 → 28.4 |
| 256² s5 | 1 → 1 | 476 → 536 | 7,458 → 48,789 | 1 → 4 (water, drought, food, metal) | 36.1 → 25.1 |
| 256² s6 | 2 → 1 | 439 → 518 | 6,658 → 40,083 | 4 → 3 (water, drought, metal) | 36.2 → 26.3 |
| 192² s1 | 7 → 1 | 526 → 443 | 3,650 → 20,184 | 3 → 1 (metal) | 37.4 → 19.3 |
| 384² s1 | 3 → 1 | 528 → 489 | 37,846 → 102,105 | 4 → 2 (food, metal) | 106.8 → 50.8 |
| Easy 256² s1 | 2 → 1 | 453 → 463 | 30,489 → 50,139 | 2 → 2 (food, metal) | 39.6 → 25.3 |
| Easy 256² s2 | 1 → 1 | 405 → 444 | 26,004 → 50,631 | 3 → 2 (food, metal) | 32.9 → 25.8 |
| Easy 256² s3 | 2 → 1 | 438 → 461 | 9,542 → 54,011 | 2 → 2 (food, metal) | 39.6 → 35.5 |
| Easy 256² s4 | 1 → 1 | 489 → 454 | 21,602 → 39,826 | 2 → 2 (food, metal) | 38.2 → 26.4 |
| Easy 256² s5 | 1 → 1 | 468 → 524 | 7,489 → 48,677 | 2 → 2 (food, metal) | 35.5 → 24.3 |
| Easy 256² s6 | 2 → 1 | 445 → 449 | 7,249 → 25,458 | 3 → 2 (food, metal) | 33.8 → 28.6 |
| Easy 192² s1 | 7 → 1 | 431 → 407 | 3,646 → 19,125 | 2 → 2 (food, metal) | 37.4 → 17.8 |
| Easy 384² s1 | 4 → 1 | 455 → 507 | 28,479 → 66,770 | 2 → 2 (metal, hazards) | 92.6 → 45.9 |

Summed: attempts 39 → 16, Easy rows missed 43 → 41 (Easy maps 18 → 16, none worse; Normal's reported only), CPU
724 → 472 s. Every start passes on its first attempt and stands on the valley's bench (level 6) with room 407 or more;
ground 3+ levels over it is 11.7–44.6 tiles off. Reach is over base on all 16, badwater in the start's view (the
opening camera at `VISTA_ZOOM`) 0 tiles on all 16, no leak draw. The same 16 at the step's own head before the merge
read the same, map for map. **The hash proof**: round 6's 52 maps of the other themes and of Highlands at 128² and
under, this head run alone against a5d893b5's, the version neutralised: 52 of 52 identical.

**Short of the bars** (named, not fixed this round):
- The map is picked out of the blind mix by its composition: the same lake in the middle on every seed.
- The tops are broader and blanker than the game's dense terracing.
- The walls are short: land beside a 4+ drop 1.6–3.3 % on seeds 1–6 at 256² (bar 5–9 %); seed 2 the lowest
  (regional relief 6.97).

### Round 6b step 5 follow-ups (2026-11-20)

Planning's ruling on ecd24adf (start, look and ask accepted) asked two things more, and #1261 (generator 0.10.52, the
pick walks over the slopes, D545 rounds 3–4) merged in first. Generator 0.10.53.

**What was built.**
- **No badwater above the lake.** The highest contamination of the water within the start's walk, read through the
  first cycle and its first badtide (the settled water, then the badtide's run), is 0 on all 16 maps: the plume joins
  the main water below the lake's outlet (D476's lower reach), never above it.
- **The channel winds its whole length** (`standValley`'s `offAt`): past the sill a meander 0.28 of the side long with
  noise along its phase, from the end of the sill's run, under the noise from before; up the flow the noise from 1.5
  radii out, as step 5 drew it (a meander there drew seed 1's planned story reach under 0.35). Seed 3's line swings
  21 tiles where it swung 9.5, its water 14.5 tiles wide where it ran 20 (the other seeds' rivers 10–15 at 256²).
- **The way out stays in the valley** (`gen/generate.ts`): `widenOutlets` read the bowl's lake as a sea's basin and cut
  its way out 20–30 tiles wide beside the channel, across the floor; the land outside the valley is now kept from it.
- **Badwater off the start's view**: the plan's badwater keeps off the opening frame of the plan's start too
  (192²'s 49–73 tiles in view before), and where every turn of the place the settler draws shows some, the place among
  the good few that shows least is taken (seed 5's 27 tiles).
- **Thorns on a map Designed for Easy keep Easy's 30 tiles** (`extras.ts` `EASY_THORNS`): Easy 256² seed 1's new
  hazards miss (Easy start off, so read by this round's measures, not by the checks, which run Easy's rows only with
  Easy start on) was a belt in front of a small relic 27–30 tiles from the start, which moved with the land. Belts
  now keep 30 tiles where Easy start is on, as before, and on every map Designed for Easy; Normal maps keep 22.
  Measured on the twelve Easy 256² maps of the other six themes (seeds 1 and 2) against dev 18a6518a: no Easy row worse,
  every start, room, attempt count, land and water as they were; River Valley seed 1 alone moves, its belt (55 → 64
  thorns) and the trees and ruins drawn after it (its Easy rows 4 → 4, hazards met on both).

**The start** (base a5d893b5 with #1261's pick, head 0.10.53 merged with dev; one map at a time, base and head in
turn, two streams). Every row of Easy's counts on the Normal maps too.

| map | attempts | room | reach | Easy rows missed | contamination | CPU s |
|---|---|---|---|---|---|---|
| 256² s1 | 2 → 1 | 525 → 490 | 26,827 → 47,164 | 2 → 1 (metal) | 0 | 34.3 → 25.8 |
| 256² s2 | 1 → 1 | 496 → 522 | 35,836 → 50,066 | 1 → 3 (drought, food, metal) | 0 | 31.2 → 25.9 |
| 256² s3 | 2 → 1 | 493 → 532 | 9,380 → 46,664 | 1 → 2 (food, metal) | 0 | 50.4 → 28.1 |
| 256² s4 | 1 → 1 | 474 → 521 | 21,087 → 36,380 | 3 → 2 (food, metal) | 0 | 39 → 26.1 |
| 256² s5 | 1 → 1 | 476 → 545 | 7,458 → 42,864 | 1 → 1 (drought) | 0 | 36 → 25.4 |
| 256² s6 | 2 → 1 | 470 → 488 | 6,653 → 44,683 | 4 → 2 (food, metal) | 0 | 37.8 → 29.1 |
| 192² s1 | 7 → 2 | 476 → 488 | 3,647 → 8,721 | 1 → 2 (food, metal) | 0 | 44.2 → 23 |
| 384² s1 | 3 → 1 | 515 → 533 | 37,716 → 106,187 | 1 → 2 (food, metal) | 0 | 101 → 46.3 |
| Easy 256² s1 | 2 → 1 | 453 → 493 | 30,489 → 44,835 | 2 → 2 (food, metal) | 0 | 34.7 → 24.5 |
| Easy 256² s2 | 1 → 1 | 405 → 446 | 26,004 → 48,130 | 3 → 1 (metal) | 0 | 34.2 → 26.3 |
| Easy 256² s3 | 2 → 1 | 438 → 461 | 9,542 → 50,209 | 2 → 2 (food, metal) | 0 | 38.4 → 24.9 |
| Easy 256² s4 | 1 → 1 | 489 → 456 | 21,602 → 40,815 | 2 → 2 (food, metal) | 0 | 39.7 → 26.1 |
| Easy 256² s5 | 1 → 1 | 468 → 509 | 7,489 → 43,089 | 2 → 2 (food, metal) | 0 | 37 → 24.9 |
| Easy 256² s6 | 2 → 1 | 445 → 454 | 7,249 → 40,523 | 3 → 2 (food, metal) | 0 | 35.8 → 26.9 |
| Easy 192² s1 | 7 → 2 | 431 → 482 | 3,646 → 25,592 | 2 → 2 (food, metal) | 0 | 38.5 → 29.7 |
| Easy 384² s1 | 4 → 1 | 455 → 491 | 28,479 → 100,231 | 2 → 2 (food, metal) | 0 | 95.4 → 54.4 |

Summed: attempts 39 → 18 (the 192² maps take two: the first land misses the planned promise, 3 plateaus against 4),
Easy rows missed 32 → 30 (Easy maps 18 → 15, none worse; Normal maps 14 → 15), CPU 728 → 467 s. Every start passes on
the valley's bench (level 6), room 446 or more, reach over base on all 16, badwater in the start's view 0 and in the
water of the start's walk 0 on all 16, no leak draw.

**More rows than base on four Normal maps**: 256² s2 (food and the drought's walk, 10.7 tiles against 10), s3, 192²
and 384² (food). Easy's food row counts living bushes within 15 tiles' walk that stay moist through a drought (40).
On the head's open bench, with room to spread over the 20 tiles' walk Normal plants in (`resources.ts`), the start's
own patches stand 12–24 tiles from it, where base's tight floodplain packed them within 12 (s3: 57 of 76 within 12 tiles on base, 1 of 48 on
the head). Normal's own row, 48 bushes within 20 tiles, is met on all eight. Not changed here: drawing the start's
planting within Easy's 15 tiles is a rule for every theme's Normal maps.

**The hash proof**: the 52 maps of the other themes Designed for Normal and of Highlands at 128² and under, this head
against dev (18a6518a), the version neutralised: 52 of 52 identical.

### Round 6c: Highlands' maps differ from one another (2026-11-21, three rounds, pushed as findings/highlands-6c and findings/highlands-6d: the start's bars failed)

Planning's brief (#236, round 6c) named three shortfalls of 0.10.56's Highlands above 128²: every seed laid the same
map, the lake in the middle with high ground in a ring round it; the broad tops were blank; and the walls were short,
land beside a 3+ drop well under the game's 5–9 %. Generator 0.10.59 on the branch, on dev 5cb017b4 (0.10.56). Highlands above 128² only (`bold.ts` `standsUp`): the 20
maps sampled (every theme at 128² seeds 1–2, the other themes at 256² seed 1) hash as base's, the version aside.

**Measured first** (`.scratch` measures, the game's maps read locally and never copied): the main lake's centre, the
side its high ground stands on and how lopsided (the resultant of the unit vectors from the lake to the land at or over
the 85th percentile, 0 a ring, 1 all on one side), land beside a 3+ drop, and the largest dead-flat region above the
median level. The game's own: lopsidedness 0.3–0.8, 3+ faces 7.5–11.7 % of land, the largest dead-flat top 1–4 %. Base
(0.10.56) seeds 1–12: every lake within 0.39–0.58 of the map's middle, lopsidedness 0.14–0.75 (a ring on most),
3+ faces 2.0–3.8 %, the largest flat top 3.7–11.6 %.

**What was built** (`land/bold.ts` `STAND`, `standValley`, `lakeShore`, `standMassif`, `stepOf`, `standMesas`;
`levels.ts` `snapLevels`).
- **The bowl off the middle.** Its middle lies 0.1–0.26 of the side from the map's (near the middle on odd seeds, far
  on even ones, `valley.band`), its way the golden share of a turn on from the seed before (`GOLDEN`, `valley.spread`
  either way), never more than 0.14 of the side across the water's way (`valley.lat`), the rest laid along it, so
  both sides of the line keep room and the bowl keeps its distance. Drawn at random, seeds 3 and 4 laid their lakes
  within a tenth of the map of each other; laid against an edge across the flow, seed 4's start took the narrow side
  and seed 2's river went round its bowl.
- **The bench on the side with room** (`lakeShore`): where the map past the lake is broader on one side of the water's
  line by 0.12 of the side, the bench lies there; else, as before, where the bowl is broader.
- **The massif** (`standMassif`): the high ground stands on one or two sides of the bowl, across the lake from the
  bench, turned 0.03–0.11 of a turn (one way on odd seeds, the other on even), and where that side leaves under 0.22 of
  the map past the bowl, turned toward the side with room (the turns tried one way first on odd seeds, the other on
  even), never more than a quarter turn off it. On the bench's side of the water's line its front draws back 1.5
  tiles a tile (`massif.benchPush`), so a turned massif bows away from the bench: seed 2's flank stood six levels over
  its bench's edge and its start walked 2,243 tiles. Its front is a line
  0.75–1.05 radii past the bowl's middle, its flanks bowed back, swaying and bayed (20 tiles over 44), so it holds
  0.14–0.32 of the map. Behind it two tables, the front 4 under the map's top and the back 3 higher, in belts 26 tiles
  deep bent by a noise; the front table steps up 2 across itself and the back steps down 2 (`stepOf`), so each step
  stands as a table with its rim dropping all round; dry ravines a table deep, 60–160 tiles long, every ~52 tiles along
  the front, wander back into it. The floor falls to its lowest at its foot (26 tiles), so its wall stands its whole
  height, and the floor's rise away from the valley is a quarter as much across from it. The field the water is planned
  on stands high under it, and no spring is drawn on its top.
- **The mesas** stand on the massif's side of the bowl or beside it (`mesa.open`), one a butte anywhere but in front of
  the bench (`mesa.benchCos`, `benchFar`); their tops step down 2 across themselves where round 6 drew an inner ring.
- **The floor's top bench** steps up 2 across itself (`levels.ts`), and no spring is drawn in front of the bench
  (`Genome.dryTops`): seed 4's ran across its bench to the lake.

**The maps** (Highlands 256², Normal, seeds 1–12, base 0.10.56 → head; Easy rows and the second badwater count on the
same seeds made with Easy start; the three measures on the Normal maps; the lake's place a share of the map, +y north):

| seed | attempts | room | reach | Easy rows missed (Easy start) | badwater in view (Normal / Easy start) | moist % | lake x, y; high side (lopsidedness) | 3+ faces % | largest flat top % |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 → 1 | 490 → 533 | 42,686 → 24,777 | 0 → 0 | 0 / 0 → 0 / 0 | 8.6 → 9.3 | 0.46, 0.61; W (0.14) → 0.42, 0.48; N (0.66) | 3.7 → 4.3 | 9 → 4.5 |
| 2 | 1 → 2 | 522 → 439 | 45,613 → 5,705 | 0 → 0 | 0 / 106 → 0 / 0 | 7.8 → 13.1 | 0.44, 0.52; S (0.67) → 0.35, 0.65; E (0.47) | 2 → 4.5 | 3.7 → 2.7 |
| 3 | 1 → 1 | 532 → 503 | 43,003 → 26,029 | 0 → 0 | 0 / 0 → 0 / 0 | 8.1 → 7.5 | 0.39, 0.41; E (0.75) → 0.47, 0.40; W (0.62) | 3.2 → 4.5 | 11.4 → 2.9 |
| 4 | 1 → 2 | 521 → 418 | 31,006 → 16,287 | 0 → 0 | 0 / 0 → 0 / 0 | 8 → 11.7 | 0.52, 0.50; W (0.14) → 0.30, 0.62; E (0.55) | 3.5 → 4.7 | 11.6 → 2.7 |
| 5 | 1 → 2 | 545 → 501 | 38,354 → 33,970 | 0 → 0 | 0 / 0 → 0 / 0 | 8.1 → 8.1 | 0.58, 0.52; W (0.24) → 0.68, 0.54; W (0.58) | 3.2 → 4 | 11.2 → 3.1 |
| 6 | 1 → 1 | 488 → 402 | 39,907 → 30,410 | 0 → 0 | 0 / 0 → 0 / 0 | 12.1 → 9 | 0.52, 0.53; N (0.17) → 0.45, 0.30; E (0.69) | 3.2 → 4 | 8.1 → 2.7 |
| 7 | 1 → 1 | 530 → 517 | 32,554 → 32,750 | 0 → 0 | 0 / 9 → 0 / 41 | 12.6 → 15.8 | 0.53, 0.52; S (0.66) → 0.45, 0.61; S (0.56) | 3.6 → 4 | 5.2 → 1.3 |
| 8 | 1 → 1 | 401 → 538 | 2,901 → 29,947 | 0 → 0 | 0 / 9 → 0 / 99 | 10.6 → 10.8 | 0.54, 0.57; S (0.24) → 0.80, 0.51; W (0.73) | 3.5 → 4.4 | 8 → 2.1 |
| 9 | 1 → 1 | 528 → 492 | 33,816 → 31,126 | 0 → 0 | 0 / 89 → 0 / 0 | 10.6 → 14.5 | 0.53, 0.48; S (0.22) → 0.39, 0.44; E (0.64) | 3.1 → 3.5 | 6.1 → 3.7 |
| 10 | 1 → 2 | 462 → 511 | 21,405 → 23,337 | 0 → 0 | 0 / 0 → 0 / 0 | 10.7 → 10.2 | 0.48, 0.49; E (0.19) → 0.53, 0.72; S (0.75) | 3.4 → 4.8 | 9.7 → 3 |
| 11 | 1 → 1 | 457 → 526 | 40,840 → 19,446 | 0 → 0 | 0 / 0 → 0 / 0 | 8.4 → 9.7 | 0.49, 0.50; N (0.37) → 0.60, 0.34; N (0.73) | 2.9 → 4.8 | 5.1 → 2.5 |
| 12 | 1 → 2 | 464 → 500 | 21,747 → 13,791 | 0 → 0 | 0 / 0 → 0 / 0 | 10.5 → 13.1 | 0.56, 0.56; E (0.10) → 0.29, 0.62; E (0.59) | 3.7 → 4.8 | 7.4 → 2.7 |

**Where it falls short.** Every start passes (24 of 24) and no Easy row is missed, but:
- **Room** falls more than a tenth under base on seeds 2, 4 and 6 (439, 418, 402 against 522, 521, 488) and on Easy
  start seed 9 (468 against 532). **Reach** falls under base's floor of 8,721 on seed 2 (5,705; its second land's start
  stood at level 11 off the bench) and Easy start seed 10 (2,688), and falls on most maps (median about 25,000 against
  about 36,000): the steps on the floor's top bench and the massif's tables are walls the slopes must join.
- **Attempts** 12 → 17 on each set of twelve (seeds 1–6: 6 → 9): first lands miss the planned promise (seeds 4, 5;
  plateaus) or the planned water story (2, 10), or a river leaves its course (12). The land preview's promise read
  holds on all twelve, so the plan stage reads fewer plateaus than the land alone gives.
- **CPU** 416.8 → 436.3 s (+4.7 %) and 548.4 → 563.8 s (+2.8 %), from the second attempts.
- **Moist** rises more than 2 points on seeds 2, 4, 7 and 9 (and 12, +2.6).
- **Badwater in view** on Easy start seeds 7 and 8, 41 and 99 tiles (base 9 and 9); seeds 2 and 9 lose theirs (106, 89
  → 0).
- **Variety** holds on the first lands (the land preview: no two of seeds 1–6 within a tenth of the map with the same
  side high), but seeds 2 and 4 both took a second land, and those lie 0.06 apart, both high to the east.
- **Walls** rise from 2.0–3.7 % to 3.5–4.8 % of land beside a 3+ drop, short of the game's 5–9 %: the tops' steps of two
  levels (a step of one cost the promise its plateaus, every rim with a one-level step failing its drop share) take
  the place of three-level walls between the massif's tables. **Flat tops** 3.7–11.6 → 1.3–4.5 % (seed 1's 4.5 its
  floor). **Lopsidedness** 0.10–0.75 → 0.47–0.75, a ring on none.

**Lessons for the next round.**
- The composition moves the start, and every move cost room somewhere: a lake against an edge across the flow left the
  bench the narrow side (seed 4) or sent the river round the bowl (seed 2); a massif turned toward room walled the
  bench's flank (seed 2, six levels); a spring ran across the bench (seed 4). Each is ruled here (`valley.lat`,
  `lake.benchRoom` in round 1, `massif.benchPush`, the springs kept off the bench's front), but they are rules round a bowl drawn
  first. Draw the start's bench first, on the open side with room, then the lake beside it and the massif across.
- Relief on a top must stand as tables whose rims drop two or more all round, or the promise loses its plateaus; and
  relief on the floor the colony walks is walls: keep the floor's steps off the start's walk, or leave the floor to the
  rings.
- The variety rules (the golden way, near and far by parity, the turn's side by parity) hold for a seed's first land
  only; a second land re-draws its jitter and can land where another seed's did, so the attempts matter for variety
  too.

**Round 2** (planning, #236: draw the bench first, then the lake beside it, then the massif across; keep the variety on
the built maps; the same bars). What changed (`bold.ts` `standValley`, `lakeShore`; `levels.ts` `snapLevels`):
- **The composition is the seed's, not the attempt's**: the bowl's way, its distance and the massif's turn come from
  their own stream (`stand-compose`), so a second land keeps its seed's composition and the built maps keep their
  variety (seeds 5 and 10, both second lands, kept their first land's lake and side).
- **The bench faces the map's middle** (`lake.benchLean`, replacing round 1's `benchRoom`): the bowl lies off the
  middle across the water's way, so the bench is laid on the side toward the middle, and the channel's wander is turned
  so the bowl is broader there (`lake.benchAt`).
- **A plain in front of the bench** (`lake.plain`, 2.2 radii of the bowl, fading over half a radius and across the
  bench's front): the floor there lies at the bench's own level, so the start walks out over one plain; no floor step
  is laid on the bench's side within `mesa.benchFar` radii. Seed 4's bench had been a strip under a floor two levels
  higher, its walk 4,118 tiles; 11,973 with the plain. A plain of 3 radii cost seed 4 its plateaus and seed 10 its
  high share (0.342).
- **No badwater in the bench's view** (`Genome.benchView`, kept off in `standBadKeep`: within `badFar` and half the
  bowl's radius of the bench): the Easy starts of seeds 4, 5, 6 and 12 saw 21, 4, 16 and 75 tiles; none now.

| seed | attempts | room (Normal / Easy) | reach (Normal / Easy) | badwater in view (Normal / Easy) | moist % | lake x, y; high side (lopsidedness) | 3+ faces % | largest flat top % |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 536 / 530 | 30,792 / 27,915 | 0 / 0 | 7.2 | 0.47, 0.40; E (0.48) | 4.2 | 4.3 |
| 2 | 1 | 489 / 555 | 31,760 / 33,892 | 0 / 0 | 6.7 | 0.31, 0.71; E (0.63) | 4.5 | 2.6 |
| 3 | 1 | 513 / 577 | 20,380 / 18,712 | 0 / 0 | 5.6 | 0.60, 0.46; N (0.45) | 4.7 | 2.1 |
| 4 | 1 | 526 / 527 | 11,973 / 33,515 | 0 / 0 | 10.9 | 0.33, 0.59; S (0.44) | 4.7 | 3.3 |
| 5 | 2 | 522 / 571 | 23,880 / 23,768 | 0 / 0 | 7.1 | 0.64, 0.60; W (0.34) | 3.6 | 3.7 |
| 6 | 1 | 482 / 562 | 30,239 / 31,357 | 0 / 0 | 9.8 | 0.52, 0.35; N (0.42) | 4.5 | 1.9 |
| 7 | 1 | 574 / 495 | 25,953 / 35,823 | 0 / 0 | 13.7 | 0.47, 0.68; S (0.53) | 4.3 | 2.3 |
| 8 | 1 | 535 / 546 | 34,393 / 33,462 | 0 / 0 | 10 | 0.76, 0.49; N (0.55) | 4.6 | 1.7 |
| 9 | 1 | 433 / 413 | 32,893 / 31,577 | 0 / 0 | 11.2 | 0.41, 0.43; E (0.62) | 3.6 | 2.8 |
| 10 | 2 | 477 / 464 | 21,984 / 23,438 | 0 / 0 | 8.5 | 0.57, 0.74; S (0.67) | 4.1 | 1.9 |
| 11 | 1 | 423 / 510 | 27,594 / 3,968 | 12 / 76 | 8 | 0.38, 0.51; S (0.44) | 4.2 | 1.8 |
| 12 | 1 | 490 / 561 | 26,221 / 25,858 | 0 / 0 | 11.7 | 0.34, 0.71; E (0.80) | 3.7 | 3.6 |

**Where round 2 falls short.** Starts 24 of 24, no Easy start misses a row, CPU 416.8 → 421.4 s (+1.1 %) and
548.4 → 549.7 s (+0.2 %), lopsidedness 0.34–0.80 and no two of seeds 1–6 within a tenth of the map with the same side
high, on the built maps too. But:
- **Room** more than a tenth under base on seed 9 (433 against 528) and on Easy start seeds 7, 9 and 10 (495, 413, 464
  against 555, 532, 551).
- **Reach** under 8,721 on Easy start seed 11 (3,968).
- **Badwater in view** on seed 11 (12 tiles, Normal) and its Easy start (76): the main water itself, mildly
  contaminated (0.05–0.14) in the lake's lower lobe, from a ditch that joins the river upstream; no spring stands in view.
- **Moist** on seed 4, 8 → 10.9 (+2.9).
- **Attempts** 12 → 14 on each set: seed 5's first land reads a high share of 0.341 at the plan stage (0.75 on the land
  alone, so the plan's read of the high ground, not the land, is short), seed 10's water story finds 33 % of the land
  near clean water.
- **Walls** 3.6–4.7 % of land beside a 3+ drop (the game's 5–9 %, reported, not a bar).

**Lessons.** The plain in front of the bench is the lever for reach (seed 4, 4,118 → 11,973) but costs plateaus when it
is broad: size it from the start's own walk, not the bowl. The plan stage's promise read and the land's disagree
(seed 5, 0.341 against 0.75): mend the read before tuning the land to it. Badwater in view now comes from the main
water downstream of a ditch, not from springs: where the ditch joins is the next rule.

**Round 3** (planning, #236, 2026-11-21: generator 0.10.63 on dev 5c3694d7; pushed as findings/highlands-6d, the bars
failed). Built, each measured on Highlands 256² seeds 1–12, Normal and Easy start, against dev:
- **The plan's read of the high ground** was right: seed 5's first land, built without the screen, reads 0.344 on its
  settled water (0.341 planned); the land alone read 0.75 only on round 2's own measure, which took the lake for the
  water. The land was short: its floor's top bench stood dead flat 3.6 levels over the water's median. The floor now
  rises 5 levels (`floor.relief`), and seeds 3 and 5 keep their first lands; seed 10's first land still finds 33 % of
  its land near clean water (two springs gave 0.405 but cut the starts' walks to 5,000 tiles, so one stays).
- **The ditch joins out of the start's view**: on a land that stands up the main water's lower reach is open to a
  ditch only off `Genome.benchView` (`generate.ts` `lowReach`); where none is left the badwater drains on its own.
- **The plain from the start's walk** (`levels.ts` `benchPlain`): the bench's side of the water's line, out from the
  bowl's rim as far as holds a fifth of the map (`lake.walk`, at least `plainMin` 28 tiles). Every start now walks
  14,000+ tiles (Easy start seed 11, 3,968 → 28,613; seed 8, 2,901 → 24,457).

| bar | dev | round 3 |
|---|---|---|
| starts | 24 of 24 | 24 of 24 |
| attempts (Normal / Easy start) | 12 / 12 | 14 / 19 |
| room at least dev's | — | 9 of 24 (seed 7 427 against 530, Easy start seed 6 433 against 563) |
| reach at least dev's under 12,000 | — | all |
| badwater in view where dev has none | — | seed 11, 10 tiles |
| Easy rows missed (Easy start) | 0 | 0 |
| CPU (Normal / Easy start) | 409.2 / 542.0 s | 393.7 / 576.7 s (−4 %, +6 %) |

**Why the bars miss.** Room: dev's starts stand in open floor round a centred lake, a full 14-tile disc on most
(578 of the disc's 617); a start beside an off-centre lake, the massif across it and the floor rising behind it,
falls short of that on two thirds of the maps however broad the plain. Attempts: the plain the start's walk needs
lowers the ground the promise counts and the Easy starts' second places; seed 11's badwater drains on its own into the
main river where it enters and reaches the lake's outlet lobe in the start's view, which the join rule does not touch.

### Round 6c shipped: generator 0.10.63 (2026-11-21)

What shipped, on round 3's land (`benchPlain`, `floor.relief`, `lowReach`, `standBadKeep` with `Genome.benchView`):
- **The sill guard** (`hydro.ts`): on a land that stands up, no chain lake's deepened stretch is laid over the lake's
  sill rock (`Genome.rockSill`). Seed 11's cut its outlet three levels and its lake stood level with the river below;
  it now stands at its bench (a Normal drought's end 1,012 → 3,974 tiles of the start's lake).
- **The full-level join** (`generate.ts` `fullLevelUnder`): a badwater ditch joins the main river only where the
  river's planned water stands a full level or more under the last lake's surface, and off the bench's views; where no
  such reach is left the badwater drains on its own (D498).
- **The start turned from badwater** (`generate.ts`, the start's tries): the badwater is kept off the plan's start and
  the bench's views, but a start found on the settled water can stand past both. A start whose opening view shows
  badwater is turned to a level door that shows none, and gives way to the next only where no turn is clear. Seed 11's
  Easy start faced a spring's pool 75 tiles west (29 tiles); turned east it sees none.
- **The close district's debris keeps the start's walk** (`generate.ts`, the second district): its Blockage cuts off the
  site's pocket only, never leaving the start under the ground it was picked for (`minFoot`) or under half its walk.
  Seed 11's stood on the one neck from the bench's plain to the floor, and the start walked 6,771 tiles of 32,193.

Highlands 256², seeds 1–12, Normal and the same twelve with Easy start, against dev 0fc2390b (whose Highlands land is
0.10.56's):

| bar | dev | 0.10.63 |
|---|---|---|
| starts pass; Easy rows missed (Easy start) | 24 of 24; 0 | 24 of 24; 0 |
| room, least | 401 | 427 |
| reach 12,000+ or at least dev's | — | 24 of 24 (least 14,424, Easy start seed 6) |
| badwater in view where dev has none | — | none (and none on the four Easy starts where dev has 9–106) |
| CPU (Normal / Easy start) | 409.2 / 554.9 s | 408.9 / 600.6 s (−0.1 %, +8.2 %; no map over 1.7× dev's) |
| the start's lake at a Normal drought's end, at least round 3's (cb9b8e58) | — | 12 of 12 (seed 11 1,012 → 3,974) |
| other themes and Highlands at 128² and below (84 maps) | — | land, water and objects as dev's on all 84 |

## Islands' land above 128² (2026-11-21, generator 0.10.61)

Islands above 128² (a map whose narrower side is over 128 and that is not long) no longer draws 0.10.48's land: planning's
design of 2026-11-21, the start's ground first, is drawn in levels by `land/isleSea.ts` (rounds 9–11 drew an island big
enough to live on and never converged; this round turns that round). A mainland frames the sea on every side, its shore
bending in bays and headlands by 15–25 % of the basin's half-width; the start stands on a headland of the mainland reaching
into the sea a third of the way to the basin's middle, water on two or three sides and an island in view; 8–12 islands of
unlike sizes, none in the basin's middle, each a strait of 6 tiles or more from all other land; the mainland and every
island rise in one-level steps with benches 3–6 tiles deep and relief on their tops. The sea's bed is one level under its
spill level, drawn so before anything is placed (planning's sea-bed design, carried into the land); the sea leaves by one
strait to the map's edge, away from the headland, and no spring rises and no river enters within 100 tiles of the exit or
on the headland. The map's three outer rows stand a level over the mainland inside them: seed 9's river first ran along a
flat top to two edges, which are sinks, and its sea stood a 0.13 sheet at every Hard wet season's end. The start is picked
on the headland first (`generate.ts` `headStart`), ranked there as anywhere, and the badwater keeps 105 tiles off the
headland's bench.

Measured on Islands 256² seeds 1–12 against dev 5cb017b4 (0.10.56), base and branch run side by side, starts first.
Normal: every start passes, all twelve on the headland at level 8; reach 2,652–23,077 → 18,036–30,953; room 780–9,986 →
1,694–4,498; badwater in the opening view 0 on all twelve (dev 48, 20, 128, 69 on seeds 1, 2, 3, 5); attempts 46 → 29;
CPU 990 → 805 s. Easy start: every map passes, no Easy row lost on any map, attempts 44 → 35, CPU 1,697 → 1,398 s; the
opening view's badwater 0 on eleven and 12 tiles on seed 1 (dev 0 there, 69–168 on seven others). Land: 8–11 islands of
100 tiles or more, none in the basin's middle; no mesas; cliffs of three levels or more on islands only on seeds 3 (6) and
8 (1). The sea (one level under its spill everywhere, the start's water counted as pumpable clean tiles a pump on a
shore within 20 tiles' walk reaches): at every Hard wet season's end the start's water is its settled count on all twelve
(13–43 tiles); the sea's p50 at the wet season's end is within 0.03 of its settled depth on ten, 0.92 of 1.20 on seed 10
and 0.45 of 1.11 on seed 6, whose river mouth is 55 tiles from the exit (the rest 100–310; seed 7's mouth was not found
on the sea). Hard droughts empty the sea, as before. Normal never empties: its droughts end at p50 0.68–0.76 and the
9-day drought at 0.58–0.65. Extreme (report only): every drought empties the sea; wet ends 0.35–1.37, the start's water
its settled count each time. The 84 default maps (seven themes, seeds 1–6, 96² and 128²) hash as dev's.

The start's food row (40 lasting bushes within 15 tiles' walk, as Easy's row scores it) is short on four of twelve
(seeds 2, 4, 7 and 10: 18, 10, 21, 23; dev short on 6 and 12): only the shore bench one level over the sea's spill stays
moist through a Normal drought, and the start's bench a level above it never does (seed 4: 11 tiles of the shore bench
within the walk, 445 of the start's bench, none moist through the drought). A start on the sea's shore passes the row
only where its walk takes in enough of the shore bench.

Lessons for whoever takes the land up again:
- **River mouths stay away from the sea's exit.** On seed 4 the main river's mouth is 22 tiles from the exit, and its
  sea steps down over Hard cycles.
- **Shelves stand under the sea's spill level.**
- **A warm-started second settle can't ship under D455.** A saved project reopens by a fresh settle of the land it holds,
  so water that a settle warm from the first one reaches is not the water the project reopens to: the file's water must
  be a cold settle's.

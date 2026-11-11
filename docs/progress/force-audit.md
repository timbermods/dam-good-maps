# Force audit: every force but Craterize and Glaciate, judged by eye

2026-11-09, dev at `594a6dd5e`. No code changed, nothing pushed. Judged as a geomorphologist (does it look like the
landform?) and as a level designer (would someone settle here?), against the bar of the look reviews on #912 and #914.

**Verdict in one line:** only Carve is near showcase quality. Erupt, Rift, Quake and Deposit each fail at their default
setting on the first click, and three faults are shared by all of them, so they are best fixed once, in the shared core.

## How it was looked at

- The built editor (mode e2e) in headless Chrome on the GPU, driven as a player drives it: the force's key, the Power and
  Size sliders, a real click or drag, Try another, Ctrl+Z. Details left on Auto unless a case pins one. Water at the
  editor's own settle, waited until the header's dot left "Settling". 172 cases (no failures), each pictured before and after from two
  oblique sides and top-down (top-down pictures have +y up), with counts of tiles changed, water gained and lost,
  badwater, one-tile pillars and pits.
- Maps: River Valley 1, Lake Basin 3, Highlands 4242, Canyon 10, Islands 5 at 128²; Highlands 7 at 256².
- Cases per force: low, default and high Power; small and large Size; flat ground, a slope, a hilltop, the map's edge,
  across and along a river, a lake's shore and its middle; two rolls; applied twice; every pinned option; click and drag.
- The contact sheets and the 1,064 pictures behind this audit are on the dedicated machine, not in the repository;
  the findings below stand on their own (each names its case, what it should look like and the change that fixes it).

## Three faults every force shares (fix these once)

**S1. A smooth field rounded to whole levels gives even one-level, one-tile bands.** Erupt's cone is a ziggurat and its
broad and caldera forms are bullseyes; Quake's stepped scarp and its fade are parallel stripes; Rift's walls are
bleachers; Deposit's fan is a step pyramid. It is the same fault as Craterize's stadium. *Fix:* one shared benching
stage in `rust/forces` that every force's target surface passes through instead of `round()`: a few benches of uneven
width (2 to 6 tiles) parted by faces of 2 to 4 levels, in the generator's own terrace language (`land/levels.ts`
`dealTreads`, `shapeRamp`); bench edges warped by low-frequency noise so they are neither concentric nor parallel; no
tread under 2 tiles; a last pass that removes one-tile pillars and pits.

**S2. A force's reach does not know the map, and Sources: Clear then empties it.** Clear removes every source on ground
the force changes at all. Forces that change a third to nine tenths of a map (Erupt broad, caldera or Power 100; any
Quake Lift) therefore remove the map's river. Measured: Erupt Power 100 in the Islands lake, 9,175 wet tiles to 0 (with
Ride, 7,807 stay); Erupt in the Canyon river, 2,104 to 430; a Quake Lift over the River Valley's source row, 1,506 to 0,
every plant dead, at instant and at normal water speed. The player sees a small note. *Fix:* (a) cap Auto reach by the
map (below, per force); (b) under Clear, a source goes only where its own ground is destroyed (buried 3 levels or more,
cut away, or in a fault's crush zone); a source that only rides an intact block, or sits under a thin apron, rides.
**(b) done** (`feature/force-sources-clear`, 2026-11-11): Clear takes a source only where its ground is buried 3 or more, cut 2 or more away, or in a crush zone: within 2.5 tiles of a Quake's crack, or a Rift's
wall, where a tile's 3 × 3 moves differ by 2 or more (`clear.ts` `destroyedGround`; Carve's cut in Rust the same).
A Lift by River Valley 1's hillside spring now carries it up 4 levels, still flowing (sheet
`docs/sheets/force-sources-clear.jpg`). Glaciate's ice still takes what it reaches (item 10). (a), Auto reach capped
by the map, comes with each force.

**S3. No force plans with the water it will meet.** Results drain neighbours, drown valleys in thin sheets, or let
badwater into clean water (Rift Size 60: badwater 432 to 1,404 tiles; Unleash at its default: 432 to 1,349; Quake Lift
across the river: 432 to 1,314). Closed pits a force leaves on wet maps stand brim-full (Rift at every Power, Deposit's
donor pit, Erode's scour on the River Valley plain), which hides the landform; on dry ground (Canyon, Lake Basin flats)
the same pits stay dry. I did not establish whether the game itself would fill them: the editor's settle does. *Fix:*
each plan runs the forces' own water model on its result before it is kept and adjusts the shape, never refuses: keep a
sill between a badwater channel and clean water; give a pit an outlet at its low end; size a channel to its source.

## Ranked findings

Severity for a showcase map: **blocks** (the result cannot be kept), **hurts** (kept only with hand repair), **minor**.

| # | Force | Case | Should look like | What it does | Sev. | The change |
|---|---|---|---|---|---|---|
| 1 | Quake, Lift | any drag; 44-tile fault at Power 60 | A scarp along the line; ground moved most at the fault, fading within 10 to 20 tiles, nothing at the tips | A rigid block out to 1.3 times the line's length on both sides moves by a constant: 6,600 to 7,700 tiles (40 to 47 % of 128²), 38,454 (59 % of 256²). The far side drops 0.55 of the lift. Rivers 20 tiles off dry or dam; a lake grew from 3,954 to 9,360 wet tiles; sources cleared | blocks | Displacement = lift × an elliptical taper to zero at both tips × exp(−distance/λ), λ 8 to 14 tiles by Power; the down side a back-tilted trough at the scarp's foot (a sag pond at most), no drop beyond it; reach never past 20 tiles |
| 2 | Erupt | default click, Power 62, flat | A cone: a low wide apron, flanks steepening to a summit, lobes and a breached side, a crater 5 or more across | A step pyramid: one-tile treads, one-level risers on every bearing; ridges are diagonal saw-teeth; the crater a one-tile parapet round a 3 × 3 pit. Ceiling-limited to +12 on level-10 ground | blocks | S1 benching on the cone; outline lobes of ±25 to 30 % at seeded bearings and one sector breach (today ±11 %); height at most 0.6 × radius; crater at least 5 across with a 2-wide rim and one low notch |
| 3 | Erupt | broad, caldera, Power ≥ 80, Size large | A caldera a third of the edifice across, scalloped and breached, an uneven floor with a small cone; flanks still dominant | A flat round arena inside 3 to 5 concentric bench rings, or a bullseye of rings: 3,200 to 6,200 tiles at Power 62, 5,400 to 14,500 at Power 100. Try another flips steep to broad: 1,397 or 4,987 tiles from the same click | blocks | Auto radius capped at 18 % of the map's short side; broad at most 1.25 × steep; caldera radius ≤ 0.35 of the cone's, rim scalloped ±20 % with a breach, floor uneven with an off-centre cone; Auto draws caldera 1 in 3 above Power 70, not always above 80; Try another keeps the footprint within ±20 % |
| 4 | Deposit | click on flat ground or a slope, default | A fan fed from a gully cut back into the high ground behind its apex | The conserved "donor" cut is what reads: on flat ground a brim-full pond 4 to 5 deep (190 to 326 tiles) beside a low mound; on a slope a trench along the uphill half of the click circle, a perfect arc from above; at Size 64 crescent ponds round the circle | blocks | Take the sediment as a feeder gully: a V-notch 2 to 4 wide up the steepest ascent behind the apex, inside the outline, graded to the apex; on flat ground take nothing (the water brings it, as the plan already allows) |
| 5 | Deposit | every case | A low cone segment, 60 to 120° wide, 1 level per 4 to 8 tiles, arc-shaped contours, a feathered toe, 3 to 5 levels thick at the apex | A stepped mound or pyramid up to +13; dragged down a slope, a sheer block 13 high; in a river a +10 to +14 plug | blocks | Target surface = a cone from the apex (slope by Power); deposit = max(0, cone − ground) inside the sector, so nothing ever stands above the apex; arcs benched by S1 |
| 6 | Rift | any ground water reaches | Two fault scarps, a stepped or tilted floor, a stream running along the floor, a fall where it enters | A brim-full dark lake: no scarp, no floor, no fall. Power 10 is a 14 × 12 pond; Power 70 and 100 are both 9 deep on level-10 ground (the Floor) | blocks | Tilt the floor along the axis and notch its low end to the nearest lower ground, so water runs through and falls in at the high end; at most a 2-deep lake at the low end; default throw 4 to 5, Power 100 about 8 |
| 7 | Rift | click; straight drag | En-echelon scarps with relay ramps, pointed tips, one high wall and one stepped side | A click is an ellipse 38 × 22; a straight drag is a ruler-straight slot of even width with round ends; where dry, walls are even one-level stripes and the floor dead flat | blocks | Build from two border-fault lines of 12 to 20-tile segments offset 2 to 4 tiles; throw greatest mid-length and zero at the tips; main wall sheer 4 to 8, the other side 2 to 3 steps of 2 levels on benches 3 to 5 wide; floor in 2 to 3 blocks tilted to the main wall; a click at least 3 times as long as wide |
| 8 | Unleash, Carve | course meets an existing river | A tributary that joins and stops | It re-cuts the map's river all the way downstream, 12 to 14 deep and wider: 2,400 to 5,400 tiles. Unleash at its default takes in the badwater stream and turns the clean river bad (432 to 1,349) | blocks (Unleash), hurts (Carve) | End at the confluence with a graded junction over the last 4 to 6 tiles; cut downstream only where the added flow would overflow; route cost high across badwater, a sill kept where it must pass |
| 9 | Quake, Slide | across terraces or a river | Two rigid blocks; streams and ridges offset in a dog-leg at the trace; a narrow trough | Per-tile rounded offsets tear the ground: 130 one-tile pillars and 24 pits (Power 80), 53 and 65 on 256²; on flat ground nothing shows at the line while a hill beyond the line's end moves 13 to 20 tiles | blocks | Piecewise rigid motion: a block at most 15 tiles wide moves whole; a 2 to 3-tile crush zone along the trace rebuilt by interpolating heights and lowered a level; the far edge blended in height, never in position; S1's pillar pass |
| 10 | Erupt | in a lake | An island volcano | Power 62 in a 10-deep lake raises the bed 5: nothing breaks the surface. Power 100 clears the lake | blocks | A vent under water takes the water's surface as its datum, so at least a third of the cone stands above it; S2 for the sources |
| 11 | Erode | click or sweep on a cliff | Alcoves a third to a half of the cliff's height; an arch through any fin | Too timid to see at the zoom a player judges from: 0.3 % of the picture at Power 55, 0.6 % at 100; a 28 to 48-tile sweep leaves a one-block undercut that reads as a shadow. Close up the form is right. No arch in 19 cases | blocks | Opening height 40 % of the face at Power 55 and 70 % at 100, never under 2 blocks; width 3 to 8, depth 2 to 5; a sweep makes separate alcoves every 6 to 10 tiles of unequal size; a fin or promontory under 4 tiles is cut through |
| 12 | Quake, Lift | Power 10 | A 1 to 2-level scarp and nothing else | 4,455 tiles moved by 1 to 2: a dry plain floods into C-shaped ponds (595 tiles) | hurts | Follows from 1 |
| 13 | Erupt | flows, ridges | 2 to 4 tongues, 3 to 6 wide, 1 to 2 thick, run down the land's own low ground past the foot to lobate fronts | "Heavy flows" is a thicker skirt; nothing reads as a flow | hurts | Route each flow by steepest descent on the ground before the eruption from the crater's notch; lay 1 to 2 levels with a lobate toe; stop at water |
| 14 | Deposit | Channels: Few or Many | 1 to 3 shallow distributaries a level deep | No channel shows on any fan; Few and Many pinned give the same land (675 tiles each, pictures 0.06 % apart) | hurts | Incise 2 to 5 radial channels a level deep with one avulsion each; a stream at the apex runs down one |
| 15 | Deposit | shore to lake; in a river | A delta: a flat top at the water's level (farmland), a steep front under water, distributaries kept open | A step-pyramid island 6 above the lake with the shore behind eaten; in a lake 164 tiles under water, unseen | hurts | Delta mode: fill to the water's surface or one above over a lobate outline from the mouth; channels left at bed level; a 2 to 3-level front under water |
| 16 | Carve | every river | Level reaches parted by falls of 1 to 3 levels; a spring alcove at the head; narrow above, wide below | One level pool from head to mouth, 11 to 14 deep at the default, dark; a box head; full width from its first tile | hurts | Bed follows the land in reaches of 8 to 20 tiles with seeded drops where the old ground steepens; head a 3 to 5-wide alcove; width 0.5 at the head to 1.3 at the mouth; default depth nearer 6 |
| 17 | Carve, Unleash | Size 24; source strength 8; on a plain | A river inside its banks | The source outruns the cut: 1,506 to 4,133 or 4,444 wet tiles, thin water on 1,700 to 3,000 | hurts | S3: cut depth at least the flow's depth plus one along the whole course, or the source held to the channel's capacity |
| 18 | Unleash | default Power | "A spring's stream finding its way down" | The default equals Power 100 (2,439 against 2,461 tiles); Power 10 gives the brook the name promises (697 tiles) | hurts | Default 25 to 30; width and depth from the source's strength (a 1 to 2-wide brook, 1 to 2 deep) |
| 19 | Erupt | on a hill near the ceiling | A parasitic cone on the hill | The hill's terraces buried under a dome with one spiral step, 4,188 tiles, no summit | hurts | With under 60 % of its height free, grow narrower, not broader, and add to the peak that is there |
| 20 | Erupt | fissure | A row of 3 to 5 unequal spatter cones on a low rampart | One whaleback with even contour stripes, +8 to +17 | hurts | A small steep cone at each vent the plan already places, heights varied, saddles down to 30 % between |
| 21 | Quake, Lift | stepped scarp; straight drag; a click | 2 to 3 splays of unequal height; a trace that steps sideways | 3 to 6 parallel one-level benches 3 tiles wide; a straight drag is ruler-straight (the roughness is ±0.4 to 1.7 tiles) | hurts | S1; segments with 2 to 4-tile stepovers; height varied along the strike; 1 to 2 short splays |
| 22 | Naturalize | Size 40, Strength 10 | Softer edges on the same landform | Weathering only lowers: one stroke takes 5,700 to 9,900 levels of ground; the River Valley hill (level 16) is erased; an eruption 12 high is levelled to a mound | hurts | Weather the residual only (height minus its 15-tile mean), so the large shape stays; a cliff sheds at most half its height; what the top loses the foot gains |
| 23 | Rift | walls, objects | Objects ride the block down | 3 to 8 one-tile pillars and pits a drag; a ruin or source on the line keeps its ground as a pillar 9 high or a pedestal | hurts | Drop the whole footprint by the block's drop instead of keeping it; S1's pillar pass |
| 24 | Erode | open ground; a terraced slope | A blowout with a lag of stones; rills down the fall line | A round 2-deep dish that fills (139 tiles): "Wear caves and arches" makes a pond. A Power 100 sweep over terraces lowers 1,639 tiles into one-tile speckle | hurts | No face in the ring: reach for the nearest within twice the Size; else a 1-deep elongated scour that cannot hold water; on stepped slopes 2 to 4 rills, 1 to 2 wide |
| 25 | Naturalize | Size 20, Strength 5 on terraces | Wandering edges | Terraces merge into broad benches with long straight edges and square corners | hurts | After merging, edges wander at least 2 tiles at a wavelength of half the Size; no straight run over 6 tiles |
| 26 | Carve | drawn across a gorge with an overhang | A carve that goes round it | The whole 48-tile stroke is refused ("A carve leaves caves and overhangs as they are: there is one at X 66 · Y 66") | minor | Treat the kept tiles as hard rock and route round them |
| 27 | Unleash | dragged from the button | A stream that winds to the point | A ruler-straight slot | minor | Wander round the drawn line as Carve does |
| 28 | Rift, Deposit | Try another | A different rift or fan | The same outline, only the fray differs; Deposit the same arc | minor | Re-roll the segment offsets and which wall is the main one; re-roll the apex angle and channels |
| 29 | Rift | click at the edge | A notch open to the edge | A square-cornered flat pad | minor | Follows from 7 |
| 30 | Erode | Power 100 on a cliff | Clean rock | One-block grass ledges left hanging on the wall | minor | Remove remnants thinner than 2 blocks |

## Each force

### Carve: not yet, but close
The one force whose first click makes something worth keeping: a meandering river with green banks, a different course
on each roll, a good creek at Power 10, a good dry canyon, a broad settleable valley with Walls: Wide.
1. Give it a long profile: falls and level reaches, an alcove head, narrow above and wide below (16).
2. Stop at a confluence instead of re-cutting the river below it (8).
3. Keep the water in the channel at large Size, and cut about half as deep at the default (17, 16).

### Unleash: no
Carve's engine with the wrong defaults. At its default it cuts a 12-deep canyon, re-cuts the map's river and can poison
it; at Power 10 it is exactly the brook the name promises.
1. Default Power 25 to 30, the stream sized to the source (18).
2. Join and stop; never carry badwater into clean water (8).
3. A drag from the button winds (27).

### Erupt: no
Never a volcano to the eye: a ziggurat, a bullseye or an arena. At large settings it swallows the map and its water.
The Canyon flat case shows the scale is right when it stays small.
1. The cone: benching, lobes, a breach, a real crater, height tied to radius (2).
2. Caps on reach, a caldera that is a caldera, a steady footprint across rolls, sources that survive an apron (3, S2).
   **1 and 2 done** (`feature/force-erupt`, 2026-11-11): height at most 0.6 of the radius (0.4 broad); Auto's radius at
   most 18 % of the map's short side, broad 1.12 times steep; the outline lobed by up to 28 % at seeded bearings; one
   breach toward the lowest ground; a crater 6 or more across inside a 2-wide rim; a caldera 0.29 of the cone, its rim
   scalloped by a fifth, a small cone off its floor's centre, Auto's 1 in 3 above Power 70; the flanks benches on a
   seeded ladder of 2 to 4-level faces with warped edges, then `levels::whole` (a fissure's rampart through
   `levels::whole` as it is). The default click changes 1,040 to 1,600 tiles across 12 rolls at Power 62 on 128²
   (about ±20 %), at most about 1,650 at Power 100 (was 3,200 to 14,500 broad or caldera); sheet
   `docs/sheets/force-erupt.jpg`. Still open: the benches still read roughly concentric on a broad shield; near the
   ceiling it still grows broader (19); Power 100 with a peak on 256² reaches 3,900 tiles; the cursor ring and the
   row's Auto Size still show Power's breadth, not the map's cap (the page's `forceReach`).
3. Lava flows routed down the land; an island when it erupts in water; cones along a fissure (13, 10, 20).

### Rift: no
On any map with water it is a pond, a quarry lake or a canal. Where it stays dry the anatomy shows and is an
amphitheatre. The 100-tile drag on 256² (a ribbon lake) is the nearest to the real thing.
1. Drain it: a tilted floor, an outlet, a fall at the head, a shallow lake at most; half the default throw (6).
2. Build it from two en-echelon faults with pointed tips and an asymmetric cross-section (7).
3. Objects ride down; no pillars; no badwater let in (23, S3).
   **1, 2 and the first two of 3 done** (`feature/force-rift`, 2026-11-11): two border faults of 12 to 20-tile segments
   offset 2 to 4 tiles with relay ramps, pointed tips, the throw greatest mid-length (about 5 at the default, 8 at
   Power 100); Walls on Auto one sheer and one stepped in benches of about 2 levels, 3 to 5 wide; the floor in two or
   three pieces tilted to the sheer wall and down the axis to its low end, notched out to lower ground that drains;
   on a wet map the floor stands at or above its drain level in long treads, a lake at most 2 deep at the low end
   (deeper only where water already stood); then `levels::whole`. A click is 3.2 times as long as wide (Auto's width
   8 + 0.12 × Power, at most 0.16 of the map), running on past an edge (29). A multi-tile object rides down whole.
   The default click changes about 600 tiles on 128²; sheet `docs/sheets/force-rift.jpg`. Still open: on low wet
   ground (a river's own plain) it is only 1 to 2 levels deep, by the drainage rule; badwater it lets in (S3); the
   floor's pieces read as plates of a level more than as blocks; Try another re-rolls the walls' side and offsets
   but the click's bearing only by the seed (28); the cursor ring shows Power's width, not the map's cap.

### Quake: no
The wall of a sheer Lift is the most convincing single feature any of these forces makes. The trouble is everything
else: the rigid block re-levels half the map, and Slide tears it.
1. Lift decays from the fault and dies at its tips; nothing moves 20 tiles away (1, 12). **Done** (`feature/force-quake-lift`,
   2026-11-11): lift × an elliptical taper × exp(−distance/λ), λ 8 to 14 by Power, windowed to nothing at 20 tiles; the
   down side a trough at the foot, at most 2 levels and 6 tiles. A 44-tile fault at Power 60 changes 784 tiles (was 6,600
   to 7,700), the default click about 275 on 128²; sheet `docs/sheets/force-quake-lift.jpg`. Still open: its fade is
   whole-level stripes until S1, a lift across a river dams it (S3), and the tips read rounded rather than pointed.
2. Slide moves rigid blocks and rebuilds a narrow crush zone (9).
3. Stepped scarps and straight drags get splays, stepovers and uneven benches (21).

### Deposit: no
It never makes a fan. The player sees a pond or a trench (the donor cut) and a stepped pile; the Channels choice changes
nothing visible; a click on flat ground needs Undo and a guess.
1. Feed it from a gully behind the apex, or from the water on flat ground; never a pit or an arc (4).
2. Lay a true low cone with arc contours and a feathered toe (5).
3. Visible distributaries, and a flat-topped delta where it meets water (14, 15).
   **1, 2, the channels of 3 and Try another (28) done** (`feature/force-deposit`, 2026-11-11): a cone segment 60 to
   120° wide from an apex a few tiles behind the click, a level per 4 to 8 tiles, 3 to 5 thick at the default, laid
   only where it stands above the ground and never above its apex; drawn to a seeded 1 to 2-level ladder with warped
   edges, then `levels::whole`; a toe a level thick. Fed by a gully up the steepest ascent behind it, a V-notch 2 to 4
   wide at its floor, graded down to the fan and on through its head as a trench; on level ground it takes nothing
   (the sediment is no longer conserved). 2 to 5 channels a level deep, each with one avulsion; Try another turns it on
   level ground. Placed on dry ground it leaves water's beds alone and its gully keeps two tiles from any water (S3: a
   first click beside River Valley 1's hillside badwater pocket once cut its rim and ran badwater into the lake). The
   default click changes about 190 to 470 tiles on 128²; sheet `docs/sheets/force-deposit.jpg`. Still open: the delta
   where it meets water (15); a gully on a gentle slope is short or absent, since its bed is graded a level over the
   ground at the click; Auto Size is not yet capped by the map.

### Erode: no
Right close up, invisible from where a player judges; no arch seen; on open ground it makes a pond.
1. Scale the opening to the cliff (11).
2. Cut through fins for arches, and make separate alcoves along a sweep (11).
3. No dish ponds, no speckle: rills on slopes, the nearest face on flats (24).

**Done** (`feature/force-erode`, 2026-11-11): 1 to 3. A click wears one opening at the nearest face within twice its
Size, a sweep one every 6 to 10 tiles of unequal size; 40 % of the face high at Power 55, 70 % at 100, 3 to 8 wide, 2 to
6 deep; a fin under 4 tiles is cut through. Without a face in reach: 2 to 4 rills down a slope's fall line, or one scour
toward lower ground on the level, kept only where it drains (no pond). On generated maps a face is nearly always within
reach, so a click there makes an opening. A run costs about 130 to 180 ms at 256², 60 to 70 ms at 128². Sheet
`docs/sheets/force-erode.jpg` (Highlands 4242, Power 100: an alcove under an overhang at the cliff's foot). Still open:
Auto Size is not capped by the map (it needs none: 6 to 20 tiles); badwater is S3's (#1025).

### Naturalize: yes as a small brush, no as the forces' finisher
It never changes the water in any case, and at Size 14 to 20 on cliffs it does what it says (Highlands). At Size 40,
Strength 10 one stroke removes a hill or a volcano.
1. Weather the residual, not the landform (22).
2. Wandering edges after terraces merge (25).
3. A cliff's foot gains what its top loses.

## The order I would fix them in

1. **The shared benching stage (S1)**, in `rust/forces`, with the pillar pass. Every later item uses it, and it is the
   fix the #912 review already asked of Craterize.
2. **Quake Lift's decay** (finding 1). A small change to `Fault::movement`, and it removes the worst outcome there is: a
   dead map from one stroke.
3. **The Clear rule and the reach caps (S2).** A few lines each; ends the emptied maps.
4. **Erupt** (2, 3, then 13, 10, 20, 19). First in the bar, the force a showcase map most wants, and the furthest from
   its name.
5. **Unleash's default and the confluence stop** (18, 8), then **Carve's falls** (16, 17). Cheap, and they turn the one
   good force into a showcase one.
6. **Rift** (6, 7, 23).
7. **Deposit** (4, 5, 14, 15). The largest rewrite: the conserved donor has to become a gully.
8. **Erode's scale and arches** (11, 24).
9. **Quake Slide** (9).
10. **Naturalize at large sizes** (22, 25).

The water guard (S3) is best built with item 4 and reused by 5 to 7.

## What I did not settle

- Why closed pits on the River Valley plain fill and the same pits on the Canyon and Lake Basin flats stay dry, and
  whether the game would do the same. The pictures show the editor's own settled water.
- The Quake run that left the map dry was on ground holding the river's source row; I infer the sources were cleared
  (I counted sources only in later runs, where Clear against Ride on the Islands eruption is direct: 0 against 7,807).
- Erode's caves do not change surface heights, so its tile counts read 0 on cliffs; it was judged from the pictures and
  from before-and-after crops.
- Purple marks appear on cliff faces after some Naturalize strokes; I took them for an editing aid, not land.
- Rift's 100-tile drag on 256² had not settled after 120 s when pictured.

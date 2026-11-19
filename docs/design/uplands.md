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

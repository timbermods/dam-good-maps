# Water character audit: falls, rivers and badwater against the game

PERFECT's Water 3 asks that "falls pour, rivers wind, badwater looks poisonous". Planning's rule (#236, 2026-11-07):
that character comes from what the game draws (D496, D497): its flow direction, its edge where water meets land, its
badwater colour and contamination. It never comes from a term of our own. This page compares our moving water, in
Standard and High, with the game's. It ranks the gaps by what a player sees first on a showcase map. It changes no
code. Renderer forces-play audit, 2026-11-08, on `origin/dev` at f5fd6fa20.

## Sources

- **The game's water shaders:** `Shader Graphs/PhysicalWaterURP_Opaque` and `_Transparent` in `resources.assets`, read
  with `python tools/game-water-shader.py` (the forward pass's vertex and pixel programs and the material's values).
  `investigation/notes/water_and_soil.md` Q8 and Q9 already list most of the pixel terms; this audit cites them as
  "Q9 Pn".
- **The game's compute shader `WaterColumnPostprocessor`**, read in full for the first time here. It is in the same
  `resources.assets` (pathID 1892). It has six kernels (ProcessColumns, FindBestProperties, BreakCornerLinks,
  BreakCornerLinksReversed, CalculateHeights, FindWaterfalls), disassembled with `d3dcompiler_47`, as the tool does for
  the water shaders. The C# that drives it is decompiled `Timberborn.WaterSystemRendering` (`WaterMesh`,
  `WaterColumnPostprocessor`). Only numbers and rules are kept here; no game file is in git.
- **The game's frames:** the probe's shots in `C:\dgm-probe\shots\`. They are 1280 × 800 at about 150 units from the
  map, so a fall is a few pixels and no frame shows one up close. They confirm what can be seen from that distance, such
  as the river's flow-stretched texture and the badwater fronts. The measurements below come from the decompile, from
  our code and from our own renders.
- **Ours:** `src/render3d/` on dev. Our renders were made in real Chrome on the GPU (RTX 2070 SUPER, ANGLE D3D11), with
  the water's clock held. The scenes were the fall gallery (`tools/waterfall-gallery.ts`) and River Valley 128² seed 2
  at the game's 55° pitch. The scratch scripts were not committed.

## The ranking

| # | Gap | Looks | Kind | What a player sees | Fix cost |
|---|---|---|---|---|---|
| 1 | A fall is the lower tile's slope in the game, a vertical face in ours | both | the game's, different | the game's falls pour out over the tile below and their texture runs down them; ours are flat walls with still stripes | large |
| 2 | Foam threads, wakes and seams on rivers | both | ours only | white lines and chevrons on fast water | small |
| 3 | A badwater front spreads over about 4 tiles | both | ours only | a muddy halo two or three tiles into clean water; the game's front is about a tile wide | small |
| 4 | High's badwater falls and small steps use #38's colours | High | ours only | a flat crimson sheet over a dull pool, with no glowing lines | small |
| 5 | Fall faces are lit by which way they face | both | ours only | falls darken by up to half as the camera turns | small (free with 1) |
| 6 | Rings and bubbles on every source | both | ours only | pulsing white rings round sources the game leaves plain | small |
| 7 | The light band along a shore is on every bank | both | the game's, different | a light rim on both banks; the game's is on the bank facing the camera only | medium |
| 8 | A river's small steps are terraces | both | the game's, different | thin ledges across a river where the game's surface slopes on | part of 1 |
| 9 | A film's fade at the very edge | both | ours (anti-aliasing) | nothing at play distance | keep |

The ranking puts falls first because they are what Water 3 names and what a showcase frames. They are also where our
water departs most from the game: the shape is wrong, not only the shading. Foam is second because it shows on every
fast river at play zoom, and it is a term of our own. Badwater's halo is third because D469 and D476 put badwater into
most maps' main rivers, so its front is on screen.

## 1. A fall is the lower tile's slope, not a vertical face

- **The game.** `WaterMesh.BuildTileMesh` gives every water tile a 4 × 4 grid of vertices, at 0, ⅓, ⅔ and 1 across,
  plus four skirts. The vertex shader takes each vertex's height from `_Old/_NewWaterHeights`, which the compute
  kernel `CalculateHeights` writes. That kernel was read in full here.
  - An edge vertex takes the higher of its own surface and its linked neighbour's surface across that edge.
  - An inner vertex (at ⅓ or ⅔) takes max(its own, the neighbour's on its side − 0.3).
  - A corner vertex takes the highest of its three neighbours, each less 0.3 where the corner is inner on either axis.
  - So where a fall is, the upper tile stays flat right to the cliff. The tile below rises to meet it: its edge at the
    cliff is at the upper surface, its vertices ⅓ in are 0.3 lower, and from ⅔ in it is at its own surface.
  - A neighbour is linked when it has water, no barrier stands between them, their columns overlap and its surface is
    under the tile's ceiling (`ProcessColumns`). Falls are linked.
  - The skirts are vertical faces, but a skirt is visible only where a side has more than one overlapping neighbour
    column (`ProcessColumns`: stacked water). Elsewhere its floor vertex is held at min(its top, the neighbour's height
    there), and at a fall that is the upper surface, so the skirt collapses.
  - `FindBestProperties` hands the tile below its higher neighbour's outflow and contamination, weighted by
    saturate(the rise). So the slope carries the upper water's flow and colour.
  - The pixel shader lights every water pixel with the up normal plus the normal map: the vertex shader's normal output
    is the object's up axis, and the mesh normal is unused. The flow textures are sampled at the world xz (Q9 P5).
  - `FindWaterfalls` marks the tile below as the fall (Q9 P1). That tile is the slope.
- **Ours.** `waterMesh.ts` draws each wet tile as one flat quad at its surface (line 311). It hangs a vertical curtain
  from the upper surface down to the water below, 0.015 off the cliff (lines 312–344, `O` at 324), and calls it a fall
  from a 0.3 drop (`FALL`, line 87). The water shader samples the flow textures at the face's xz (materials.ts 2089,
  2093; waterTextures.ts `waterPhases`, 787). Along a vertical face xz does not change with height, so each column of
  the face shows one line of the texture drawn straight down it.
- **What a player sees.** The game's fall leans out from the lip and lands two thirds of a tile from the cliff. Its
  surface texture is stretched down the slope and runs down it with the current, so the water visibly pours. Ours is a
  flat wall against the cliff, striped top to bottom, and the stripes never move down. They only change as the flow
  shifts the sampled line sideways. A cascade is a stair of flat striped walls in ours and a chute of slopes in the
  game's.
- **Size.**
  - The lip drops 0.3 over the first third of a tile (42°). The rest of the drop is over the next third: 31° for a
    0.5 drop, 64° for 1 level, 81° for 2.5 and 88° for 11. The foot is ⅔ tile from the cliff in the game and 0.015 in
    ours.
  - The game's texture is stretched along the steep part by its length over ⅓ tile: 1.2× for a 0.5 drop, 2.3× for 1
    level, 6.7× for 2.5 and 32× for 11. It moves at about 13 × f tiles a second in xz (Q9 P5), so down the face at that
    times the stretch. Ours does not move down at all.
  - In our render of the gallery's badwater fall (Standard, 55° pitch), the face's mean pixel gradient across the face
    is 3.6 times that along it (2.36 against 0.66). The pool below it is even (3.11 against 3.47).
- **Fix.** Port `CalculateHeights` to the water mesh. A tile with a linked neighbour whose surface stands higher gets
  the game's 4 × 4 heights; every other tile keeps its one quad, so the vertex count grows only beside steps. The fall
  curtains go, and curtains stay only where water meets lower dry ground, the map's edge and stacked columns. The slope
  is then a top: it takes the up normal, the flow normal and the existing xz sampling, so it pours with no new shading
  term.
  - The slope's seen depth needs care. The game reads it from the depth buffer (Q9 P3), and behind the slope is the
    cliff, so its depth is shallow. Our vertex depth there would be the whole drop. Take the depth as the distance to
    the cliff behind the slope along the view (or cap it at the slope's height over the tile's floor × its horizontal
    distance from the cliff).
  - Also touched: the fall mask (already on the right tile), the layer cut's rule for falls (materials.ts 1972–1974,
    `cutWater.ts`), the caves' layers (`waterLayers.ts`), still films at the shore (`shoreFilm.ts`), picking, and the
    falls tests, re-based by D148.
  - D154's "the water mesh's own vertical faces … just off the cliff" and D201's 2026-10-29 amendment misread the
    game's mesh. Q9's table row already said "the game's mesh slopes over the step". The words need planning's
    amendment, by D496's rule.
  - Cost: large, one to two build-agent days with the tests and a sheet.

## 2. Foam threads, wakes and seams (ours only)

- **The game.** No foam of any kind. No foam term is in the water's programs; the material's `_Foam*`,
  `_ShorelineThreshold` and `_Waterfall*` values are leftovers that no program reads (Q9; #715, #740).
- **Ours.** `motion.ts` draws the "always-on foam" (lines 5–7, `cueMaterial` 45–111). The cues mesh is added at
  244–253 and only the Flow view's streaks have a switch (`setFlow`, 261). It is near-white (`WATER.foam`, High's
  `HIGH_WATER.foam`), 0.7–1.8 px wide, pulsing down the current's lanes, with chevron wakes where a bank opens or
  narrows and seams where currents join. `motionShapes.ts` 210–278 gives its opacity, up to 0.43 × √rush on a thread
  and 0.52 on a wake. D353 and D446 adopted it, and D154 restates it.
- **What a player sees.** White threads and chevrons on every fast river, in both looks, at any zoom.
- **Size.** River Valley 128² seed 2, the game's 55° pitch, the clock held, foam on against off: 4,700 pixels changed
  at 35 units and 5,500 at 70, in both looks. That is about 2.7% of the river's pixels at 35 units. They are lighter by
  9.5 L* on average, 20 at the 90th percentile and 40 at most. Slow water (under 0.14 tiles a second) shows none.
- **Fix.** Draw the cues only in the Flow view, the editing aid's own channel (D497), or remove them. D446 is Kyler's
  2026-10-02 ruling, so the change needs planning's ruling under D496's rule. Cost: small, hours, plus the tests that
  count lanes and wakes.

## 3. A badwater front spreads over about four tiles (ours only)

- **The game.** Per pixel it blends the contamination of the tile and its eight neighbours, from the vertex's nine
  values (Q9 P9). It samples at the pixel ± a margin of 0.45–0.5 tiles (`_Min/_MaxContaminationBlendingMargin`, with
  `_ContaminationBlendingMarginNoise` wobbling it), weights each sample by |dx| × |dy| and eases the result toward the
  tile's own value. That is a bilinear blend between tile centres, about one tile wide, centred on the tile edge.
  `FindBestProperties` does no smoothing beyond the fall rule. The simulation's own spread of contamination is the same
  in ours.
- **Ours.**
  - Standard blurs each tile's share with a binomial kernel out to 3 tiles each way (`BLEND_KERNEL` [20, 15, 6, 1],
    waterMesh.ts 89–93, σ ≈ 1.2 tiles), then shares it at corners.
  - High reads a contamination smoothed twice by a 3 × 3 [1, 2, 1] (`surfaceContamination`, high/flow.ts 19–23, σ ≈ 1
    tile; high/shaders.ts 312) through the texture's bilinear filter.
  - D154 asks for "a soft gradient over several tiles".
- **What a player sees.** Clean water next to badwater looks muddied two or three tiles out, a brown-grey halo at
  every place badwater joins a river. In the game, clean water a tile from the front is clean.
- **Size.** Across a straight front, at clean tile centres, the game's tint (`waterTint`, `smoothstep(0.01, 1, c)^0.25`)
  is 0 at every tile. Standard's is 0.72, 0.41 and 0.10 at 1, 2 and 3 tiles out; High's is 0.70, 0.30 and 0. On the
  bad side ours is 0.92 a tile in, against the game's 1.
- **Fix.** Blend as the game does: the tile's own share, eased toward its neighbours' within half a tile of an edge.
  Standard needs a one-element kernel, since its corner sharing already gives the bilinear part; High needs no
  smoothing passes. The margin noise is optional. D154's "several tiles" needs amending. Cost: small, plus re-basing
  the blend tests (`waterBlendWindow.test.ts` and the look tests that sample fronts).

## 4. High's badwater falls and small steps use #38's colours (ours only)

- **The game.** A fall's slope and a small step are the same surface with the same formula as the pool (Q9 P9): the
  contaminated colour by the pattern, the depth ramp, the glow, and the glowing lines as emission.
- **Ours, High only.**
  - On a face, high/shaders.ts 337–350 draws badwater as `HW_BAD × badwaterLight(0.05)`, #38's crimson with our own
    ramp and `BADWATER.floor`. It has no pattern and no emission, even though High's surface takes the game's formula
    (`GAME_BADWATER.use.high`).
  - A step under 0.3 (lines 364–377) draws #38's clean palette (`HW_SHALLOW`, `HW_BODY`, `HW_DEEP`) and `HW_BAD`,
    without the game's light or reflection.
  - Standard's faces use the formula (materials.ts 2124–2130, 2150–2151, 2193).
- **What a player sees.** In High, the default look, a badwater fall is a flat, red sheet over a dull brown pool, with
  no glowing lines.
- **Size.** Our render of the gallery's badwater fall, 55° pitch: High's face has a mean of 75/20/17 (L* 15.6) and is
  flat (pixel gradient 0.37 against Standard's 2.36). Its pool has a mean of 49/25/16 (L* 11.9). Standard's face is
  55/20/7 (L* 11.6). Before the light, a small step's colour is 2.2 to 4 times the formula's albedo in each channel at
  half a level to two levels deep. Its on-screen contrast was not measured.
- **Fix.** In High's face and step branches, take Standard's path: `gameBadwaterColour` and `gameWaterFormula` with the
  pattern, the light and the emission. Cost: an hour or two. `docs/progress/3d-view.md` already notes this as falling
  short.

## 5. Fall faces are lit by which way they face (ours only)

- **The game.** Every water pixel has the up normal plus the normal map (the vertex shader's normal output is the
  object's up axis), so a fall is lit as the surface is.
- **Ours.** The face's own horizontal normal lights it: Standard through `N = n` and `gameWaterFormula(…, N, …)` and
  the environment by N (materials.ts 2098–2133, 2142, 2179), High through `faceLight` and `waterEnvironment(n, …)`
  (high/shaders.ts 337–348).
- **What a player sees.** A fall's brightness changes with the camera's turn, because the game's sun turns with the
  camera (`RotateWithCameraOffset` 40°). Side-facing falls on the sun's far side go dark.
- **Size.** The diffuse light (`GAME_LIGHT`, the day's sun at 45°), as luma against the up normal: 0.91 for a face
  toward the camera, 0.85 for a face to the side on the sun's side, and 0.54 for a face to the side away from it. Our
  own environment term adds more at a face, with Fresnel (1 − N·V)⁴ of 0.034 against 0.001 at the 55° pitch. That part
  was not measured on screen.
- **Fix.** Light faces with the up normal (and the flow normal) in both looks. This comes free with fix 1. On its own it
  is a few lines in each look.

## 6. Rings and bubbles on every source (ours only, always on)

- **The game.** It draws its own pattern over a seep (2 × 2) and a badwater source (3 × 3) only (Q9 P7, followed in
  ours). It draws nothing over a plain water source.
- **Ours.** materials.ts 2265–2293 draws rings of `WATER_FOAM` mixed in by up to 0.44, 0.07 tiles wide, spreading 1.4
  tiles every 2.9 s, plus bubbles. They show over every source in Standard and High, at all times. D196 calls them an
  editing aid, but they have no channel of their own.
- **What a player sees.** Pulsing white rings in the water over each source.
- **Size.** Mixing 0.44 toward (0.9, 0.94, 0.95) lifts clean water near 0.1/0.2/0.25 to about 0.45/0.52/0.56 on a ring,
  roughly +30 L* (computed, not measured on screen).
- **Fix.** Draw them only with Markers or while a source tool is active, an editing aid in its own channel (D497).
  Amend D196. Cost: small.

## 7. The light band along a shore is on every bank

- **The game.** The depth is read from the depth buffer: the gap to what lies behind along the view, × the view's
  sine (Q9 P3). Behind water near the bank that faces the camera is that bank's wall, so the depth falls to 0 there.
  The band is about depth ÷ tan(pitch) wide: 0.7 tile per level of depth at 55°. On the near bank the view passes over
  the bank and the water is at full depth up to its edge. So the lighter, clearer rim (P4's ramp, P13's see-through)
  shows on the far bank only, and swaps sides as the camera turns.
- **Ours.** The depth is shallowed toward every shore side by the shore flags. Standard uses 0.3 of the depth at the
  bank, full by 0.45 tile (`WATER_SURFACE.bank`, `bankWidth`, waterPalette.ts 107–109; `waterSeenDepth`, 864;
  materials.ts 2061). High uses 0.1, full by 0.55 tile (high/shaders.ts 313).
- **What a player sees.** In ours every river has a light rim on both banks. In the game one bank is lit and the other
  is dark, which gives a channel its depth.
- **Size.** A 1-level river: the game's colour (P4) at the far bank's edge is 2.27 times its open water and 1.0 at the
  near bank's edge. Standard's is 1.65 on both banks. The game's band is 0.7 tile wide; Standard's 0.45 and High's 0.55.
- **Fix.** Take the seen depth along the view. Either use a depth texture (the refraction pass already copies the
  screen; the depth needs a target of its own), or march the view ray under the surface through the ground's heights
  for a tile or two. Cost: medium.

## 8. A river's small steps are terraces

- **The game.** `CalculateHeights` (gap 1) makes the surface continuous. A tile rises to a higher neighbour's surface
  at the shared edge, so a river that drops 0.05–0.3 a tile is one sloping sheet.
- **Ours.** Each tile is flat at its own surface (waterMesh.ts 311), with a vertical sliver at every step over 0.02
  (`STEP`, line 80). Standard colours it as the surface (materials.ts 2117–2122); High uses #38's palette (gap 4).
- **What a player sees.** Thin ledges across a descending river, instead of the surface running on.
- **Fix.** Part of fix 1.

## 9. A film's fade at the very edge

- **The game.** It clips hard at the column's floor (Q9 P14).
- **Ours.** `WATER_FILM.to` 0.03 fades the last sliver in (waterPalette.ts 474–496). It is anti-aliasing of a pixel or
  two at a shore, and nothing shows at play distance. Keep it as D154 records it.

## Terms we draw that the game doesn't

By D496 and D497 these go, or move into an editing aid's own channel:

1. The always-on foam threads, wakes and seams (`motion.ts` cues, `motionShapes.ts`): gap 2.
2. The rings and bubbles over every source (materials.ts 2265–2293): gap 6.
3. Badwater's blur beyond the game's one-tile blend (`BLEND_KERNEL`; High's `surfaceContamination` passes): gap 3.
4. High's #38 colours on faces and small steps (`HW_SHALLOW`, `HW_BODY`, `HW_DEEP`, `HW_BAD` × `badwaterLight`,
   `BADWATER.floor`; high/shaders.ts 337–377): gap 4.
5. Lighting a face by its own normal (both looks): gap 5.
6. The shore-flag shallowing (`WATER_SURFACE.bank`, `bankWidth`; High's 0.10 and 0.55): gap 7. It stands in for the
   game's view-dependent depth and differs from it.
7. Code with no visible effect: High's `referenceLight`, `rippleLight` and `shade` (high/shaders.ts 243–245) and
   Standard's `light` (materials.ts 2136). The formula divides by them and multiplies them back, so they cancel. They
   still decide light under a roof (materials.ts 2204–2209). Tidy them when either changes.

Kept by need: the side and section at the map's edge (the game has no cut edge); the clear water view, the Flow
view's streaks, the highlight and the overlays (editing aids with their own switches); the film's fade (gap 9).

## Checked and matching

These were checked and match the game, so they are not gaps:

- The flow textures' two phases and numbers (Q9 P5).
- The flow from each column's outflow ÷ 14 (`gameFlowOf`).
- The still detail albedo (P6) and the clean colour formula (P4).
- Badwater's formula, pattern, emission, glow, smoothness and normals × (1 + c), on the surface in both looks (P9).
- The sources' own pattern (P7).
- The refraction and the fall mask (P2, P1).
- The see-through (P13) and the light (P15).

Not followed, and too small to rank: `_Contamination_Flow_Distortion` (0.00125, a drift of badwater's pattern of about
0.02 tiles a second).

## Not measured

- **Motion on screen.** Our renders held the water's clock. The claim that ours never moves down a face rests on the
  shader (xz is constant down a face), not on frames.
- **The game's falls up close.** No probe frame shows one. Gap 1 rests on the decompile. A probe pose close to a fall
  would show the slope and the pour directly, if planning wants it seen in the game's own frame.
- **The on-screen contrast** of gap 4's small steps, and of gap 5's environment term at a face.

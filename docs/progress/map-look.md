# Map look

**Built** (branch `dev`; no map file changes, so the generator stays 0.6.0). The 3D view looks
much closer to Timberborn, and every map meaning stays readable (PLAN §20 D86, D110). The first
independent review failed on ten findings; the fix round below (D114) answers them. Kyler's ten
in-game reference screenshots arrived during the step (ML-1, kept on Kyler's machine only) and
set the ground, walls, water, light and models:
- **Ground by soil** (`src/render3d/palette.ts`, `materials.ts`): moist ground a vivid
  yellow-green grass whose edge bleeds onto the earth in patches; dry ground cracked earth, warm
  grey-brown, violet in shadow (Kyler's correction to Delivers 1: not sandy); contaminated
  ground rusty red-brown with glowing cracks; a dark bed under water. Soil blends between tiles
  of one height, never over a cliff, and each tile's middle shows its own soil. **Height
  colours** switches the tops back to the height ramp; the browser remembers the choice.
- **Walls:** dark charcoal-green cobbles, with a groove and a change of shade at every level so
  levels can be counted, and a lip of the top's ground.
- **Light, baked when the mesh is built** (`src/render3d/light.ts`): sky visibility per tile,
  and soft sun shadows from two sweeps (the sun 6° higher and lower), cast by the ground, trees,
  ruins and the start. The shader adds contact shadows at the foot of walls, a blue-grey haze far
  off and a warm grade. The same map always bakes the same bytes.
- **Water:** teal to navy by depth, see-through near the shore; ripples, pale streaks and small
  glints that move at up to 30 frames a second (still for reduced motion, in software rendering,
  and when the view is hidden); a foam line on shores; falls drawn down the cliff to the lower
  water, with white water down them and below. Badwater is murky red-brown with slow glowing
  veins, and blends into clean water where they meet.
- **Models**, our own (`src/render3d/entities3d.ts`): pine, birch, oak and succulent, dead ones
  bare and pale; berry bushes dark green with blue flowers; ruins as rusty scaffold storeys with
  beige panels, one per level, with ivy on moist ground; a timber lodge with a banner for the
  district center, its door toward the entrance; badwater sources a brown swirl in a pit; mine
  sites a square pit in an orange frame; slopes with two chevrons pointing uphill.
- **Camera:** the default is the game's angle, 30° east of north and 70° down (the game's camera
  settings), over the whole map (decisions-pending #49).
- **No image files:** the patterns (noise, cracks, cobbles) are drawn once by a shader into a
  small tiling texture when the view starts.
- **Software rendering:** where the browser draws WebGL in software (CI's SwiftShader, a machine
  without a GPU), the view drops multisampling, the patterns, the shadows and the soil's
  blending, uses models of a few triangles (dead trees still bare), and the water holds still.
  It then draws faster than before Map look: 36 frames a second in SwiftShader here, against 22.
  The full look had halved CI's software frame rate, and `render3d.spec.ts`'s orbit failed once
  (4 frames in 1.5 s); this fixed it.
- **The page:** a legend on the 3D view says what each colour means; the hover text names the
  soil (moist, dry, contaminated); the generator's 3D preview marks the best dam site, as the 2D
  preview does. The worker sends the soil with the water, so the ground follows both of an edit's
  water updates (M8). Imported maps show the soil their file stores.
- **Tools:** `tools/capture-look.ts` (the captures, their greyscale and colour-blind versions,
  and [map-look/captures.md](../map-look/captures.md)); `npm run bench:3d` takes `--configs`,
  `--maps`, `--seeds` and `--out`, and keeps covered windows drawing.
- **Tests:**
  - `tests/unit/look.test.ts` (17): the soil colours and their order in greyscale, the legend,
    wall bands, baked light and its determinism, water foam flags, models by species and dead
    state, the light models, a file's soil, the hover text;
  - `tests/contract/look.test.ts` (2): the soil comes with the map and with both water updates,
    and an import shows its own soil;
  - `tests/e2e/look.spec.ts` (2): the legend, **Height colours** and its memory, the hover text,
    the game's camera, the worker's soil in the editor, still water for reduced motion.
- **New npm dependencies:** none.

**Acceptance:**

| Criterion | Result |
|---|---|
| Before and after captures of the same maps from the same camera angles | **pass**. Seed 4242 in all six themes at 128², River Valley 4242 at 256², and Beavertopia: 4 poses each (overview; the start; the badwater, where it meets clean water on maps that have that; the tallest waterfall, from downstream; Delta has no fall), plus the page's own view from its default camera. The before captures come from `m8-done` (cfa5990) through a worktree, with the same tool and poses. 28 before and 28 after for our maps in [map-look/](../map-look/) (Beavertopia's 8 stay in `.scratch/map-look/`, never committed) |
| Greyscale and colour-blind versions of the after captures | **pass**. 84 for our maps (greyscale, protanopia, deuteranopia, tritanopia of every pose but the falls; Machado, Oliveira and Fernandes 2009 at full severity, in linear RGB), and 12 for Beavertopia, locally |
| A reviewer can tell each meaning apart in the after captures | **for the independent reviewer**. [map-look/captures.md](../map-look/captures.md) lists every capture and, for each, up to three tiles of each meaning with their positions in the image: water, badwater, badwater meeting clean water, moist, dry and contaminated ground, contaminated beside moist ground, living and dead trees, the start, slopes and the way they rise, dam sites. The colours are chosen so the meanings also differ in brightness and pattern: moist grass is the lightest ground, dry earth darker with dark cracks, contaminated earth darkest with light cracks, and badwater darker than clean water of the same depth (a unit test checks the order) |
| Build under 1.5 s at 256² | **pass**. `npm run bench:3d` in D46's three setups, 15 maps at 256² (3 generated, 12 official and workshop): worst 482 ms (Beavertopia, 795,730 triangles, on the integrated Radeon with the CPU 4× slower on a 1080p laptop screen at 150%), median 324 ms in that setup; on the RTX 4080, median 112 ms and worst 265 ms. M4 had 445 ms worst. Results: [out/map-look/bench3d.json](../../out/map-look/bench3d.json) |
| 60 fps on the integrated GPU with the CPU slowed 4×, including Beavertopia | **pass**. Every map orbits at 111 fps or more in every setup (the display ran at 127–129 Hz). With the CPU 4× slower on the Radeon, the slowest is Beavertopia at 111 fps, and 14 of 15,222 frames took longer than 1/60 s (15 of 45,924 in all three setups; M4 had none). The Radeon needs at most 8.23 ms per frame (median; 9.01 ms at the 95th percentile), for Beavertopia, against 4.3 ms before Map look. A first run while other agents' batches kept the CPU at 100% passed too (worst build 828 ms, slowest orbit 86 fps) |
| The 3D chunk stays lazy-loaded; its size | **pass**. `View3D` is loaded only by **3D** or the editor, as before: 560.26 KB (143.46 KB gzipped) before, 588.27 KB (153.13 KB gzipped) after. The page's own script is unchanged (93.89 KB) |
| Every existing test passes unchanged | **pass**. No existing test was changed. Typecheck passes; the 357 unit and contract tests pass (28 files, 185 s); the 54 browser tests pass, twice in a row; CI passes (below). Earlier, while other agents kept the CPU at 100%, six heavy tests hit vitest's 120 s timeout and `tests/e2e/preview.spec.ts` went over its 2 s local budget for an edit; the same browser test on `m8-done` went over it under that load too, and the worker's time for the same Islands edit was equal before and after (1.85 and 1.87 s against 1.86 and 1.76 s). On the quieter machine every one passes |
| No map file changes: every sha256 equal | **pass**. No generation, validation or format output code changed (`src/core`: only a new reader of a file's soil and a session method that calls it). The golden water hashes, Node = Chromium (`determinism.spec.ts`), share links (`share.spec.ts`), every investigation map exporting unchanged (`maps.spec.ts`) and the oracle's generated maps pass |
| The 2D preview keeps its height colours | **pass**. `src/core/render/shade.ts` is unchanged |

Also green:
- CI (run 36131877903, on the last code change): typecheck, 345 unit and contract tests (12
  local-only skipped), the build, 21 browser tests (Node = Chromium on 10 seeds, share links),
  the oracle on 18 seeds, the generation times and pass rates. In CI's software rendering the 3D view now draws 8 frames a
  second, against 5 before Map look.
- The full oracle (`npm run oracle`): 150 maps of the six themes pass `validate.py --load-only`
  and the round trip; parity on 50 generated and 19 official maps shows 0 disagreements.

Page weight: the 3D chunk grows by 28 KB (10 KB gzipped): the shaders, the models and the baking.

**Deviations** (the plan is updated to match): PLAN §20 D110.
- D110: Map look as built, with Kyler's correction from his reference (dry ground is cracked
  earth, not sandy; ROADMAP Delivers 1 changed to his wording). Beyond D86's list: ruins are
  rusty scaffolds (Kyler's reference) rather than scrap heaps; the tile grid is gone; the
  patterns are drawn by a shader into a texture once; a lighter look where the browser draws
  in software; the 3D preview marks the best dam site; the default camera frames the whole map
  (#49).

**Look at:**
- Try it: `npm run dev`, generate a map and click **3D**. The legend is at the bottom right;
  **Height colours** switches the ground. **Refine this map** shows the same look in the editor.
- Compare it with the game on the same map: in-game check ML-2 is pending in
  [ingame-log.md](../ingame-log.md).
- The default camera shows the whole map at the game's angle (#49). The game starts close on the
  district center.
- Other agents' batches kept this machine's CPU at 100% for most of the step. The final
  benchmark and test runs were made once it was quieter.

## Review fix round (PLAN §20 D114)

The first independent review of the captures failed on ten findings, so Map look was not tagged.
The fix round, on `dev` after the orchestrator's b879dfa, answers each; a fresh reviewer judges the
new captures. Where readability and Kyler's reference conflict, readability wins (D114).
1. **Dead trees** could not be seen from afar, and ruins looked like bare trees. Dead trees are
   now ashen: a nearly white trunk, a bleached body of bare wood and spiky branches poking out of
   it. From afar they grow, to at least 16 pixels per unit, up to 4 times. Ruins are solid rusty
   storeys with dark posts and a dark rim.
2. **Dam sites** faded on moist ground in protanopia and in greyscale, and shared orange with
   other objects. An overlay tile with alpha 255 is now hatched light yellow and near-black, with a
   dark rim just outside; from afar it is solid light with the rim. The editor's dam sites and the
   preview's best dam site use it. The legend names mine sites and geothermal fields.
3. **Beavertopia's contamination:** the view was right and the listing wrong. The file keeps soil
   for each column of a tile, and the tool took the highest value of any slot. At (96, 165),
   slot 0 is a badwater tunnel under the top (floor 5, contamination 1.0); the top, at 11, is
   dry. The listing now reads what the view draws. The pinkish zone was badwater's foam over
   badwater cascading down terraces; badwater now keeps only a thin shore line. The flat dark
   tiles were floors under overhangs (slabs with water on top), drawn with the top's under-water
   colour; they now show the top's soil in shade. The red-brown object came from a listing that
   pointed at the tree's foot; examples now point at the tree's crown.
4. **Slopes:** pale arrows rimmed dark, which grow from afar (to 30 pixels per unit, up to
   5 times) and rise over the ramp. The legend says they point uphill.
5. **Badwater:** near-black red, well darker than clean water at any depth and than contaminated
   ground. It keeps the ripples and reflections of water, with slow glowing bubbles. Water mixed
   with badwater is streaked with it, the streaks covering about the bad share. Ripples calm
   down from afar, so far water no longer shimmers.
6. **Moist and dry in greyscale:** moist grass lighter, dry earth darker; shadows keep about four
   fifths of the light (about half before), and the haze is lighter.
7. **The start:** pale walls, a dark roof and a pale deck, growing from afar (up to 3 times).
8. **Levels:** lighter grey-green walls in faint cobbles, every other level darker, a pale ledge
   and a dark groove at each level, each at least a pixel wide. Falls are a see-through veil.
9. **Legend:** every meaning, with small pictures, in two columns, and a note that dead trees,
   slope arrows and the start are drawn larger from afar. Its seven ground, water and wall
   swatches differ in greyscale by at least 8 L*: badwater 19, contaminated 33, dry 43, walls 51,
   water 65, moist 73, dead trees 94. It lets clicks through to the map, and the editor starts it
   closed.
10. **Positions:** the listing reads the renderer's own state. Each example is the visible point,
   checked by picking, with no object on the tiles in front of it.

Also: birch crowns are darker, so living trees stay dark against the grass. Objects are lit a
little more. Where the browser draws in software (the light look), a dead tree is a pale trunk, a
bleached body and one branch, nothing grows from afar, and a dam site is plain yellow, so the light
look stays light: 77,164 triangles for the render test's 256² map (62,008 before the fix round),
and a frame in SwiftShader on this machine takes 26 ms (25 ms before).

**Acceptance, after the fix round:**
- **Captures:** 28 after captures of our maps and 108 greyscale and colour-blind versions (the
  falls now have them too), plus Beavertopia's 4 and 16, locally. Every pose's camera is the
  before run's, checked equal.
- **Budgets** (`npm run bench:3d`, D46's three setups, 15 maps at 256²; results in
  [out/map-look/bench3d.json](../../out/map-look/bench3d.json)): **pass**.
  - Build: worst 529 ms (the run's first map, on the integrated Radeon with the CPU 4× slower),
    median 342 ms in that setup. On the RTX 4080: median 113 ms.
  - Orbit: every map at 100 fps or more in every setup. The slowest is Beavertopia on the Radeon
    with the CPU 4× slower (834,319 triangles; 795,730 before). 60 of 46,158 frames took longer
    than 1/60 s in all three setups (15 before).
  - GPU: the Radeon needs 9.23 ms per frame for Beavertopia (median; 10.07 ms at the 95th
    percentile), against 8.23 ms before the fix round. An A/B on this machine puts the fix
    round's cost at about 1 ms (8.21 against 9.22 ms).
- **Chunk:** `View3D` stays lazy-loaded: 596.71 KB (155.71 KB gzipped), against 588.27 KB
  (153.13 KB) after the first round and 560.26 KB (143.46 KB) before Map look. The page's own
  script is 93.92 KB (93.89 KB before).
- **Tests:** no existing test changed. Typecheck passes. The 363 unit and contract tests pass
  (29 files, 173 s), with `tests/unit/look-readable.test.ts` new (6: the order of lightness, the
  dam sites' hatch and its marks, minimum sizes, ashen dead trees, the legend). The 55 browser
  tests pass twice in a row, with `tests/e2e/look-readable.spec.ts` new (the legend's lines, the
  hatched best dam site). The larger legend first covered the map where three browser tests drag
  and click in the editor; it now lets clicks through, and the editor starts it closed.
- **No map file changes:** no generation, validation or format code changed, and every sha256
  stays equal.
- **CI:** green on the last code change (run 36156488581): typecheck, 351 unit and contract tests
  (12 local-only skipped), the build, 22 browser tests, the oracle and the generation checks. In
  CI's software rendering the render test's orbit draws 6 frames a second (8 and 9 after the first
  round, 4 and 5 on the fix round's first two commits; the test needs more than 5 frames in
  1.5 s).

**Look at:** where readability won over Kyler's reference: lighter walls, lighter shadows, solid
ruins, near-black badwater, and dead trees, slope arrows and the start drawn larger from afar
(`npm run dev`, generate a map, **3D**).

## Map look: independent reviews (not tagged yet)

- **First review: FAIL.** Dead trees, dam sites on moist ground (protanopia, greyscale), water vs
  badwater in greyscale, Beavertopia's listed contamination, slopes in overviews, tall-cliff level
  bands, the legend, and `captures.md` positions. The fix round addressed all ten findings (D114).
- **Second review, fresh reviewer: FAIL, narrowly** (2026-09-25). The core meanings read in all
  five variants (colour, greyscale, protanopia, deuteranopia, tritanopia), and every after capture
  is easier to read than its before. What fails:
  1. badwater meeting clean water is in no capture (`captures.md` marks it "not in view" for every
     pose);
  2. partly bad water at a low share (24–25%) can't be told from clean water in the Beavertopia
     overview (ΔE 4, no lightness difference; identical in greyscale), and 39–55% tiles in the
     River Valley 256² overview look plain blue at the listed points;
  3. slopes: the three listed slopes in the Beavertopia overview are 2–4 px specks with no arrow;
     two close-up slopes are slivers with no readable direction (River Valley 128² start (59,58),
     Highlands badwater (50,86)); arrows facing the camera flatten into a thin V, and some sit
     under dam-site markers;
  4. at 18 listed tall-cliff positions no wall is visible (under water, facing away, behind a
     waterfall); Lake Basin start and Islands falls show no countable tall cliff.
  Also noted: clean water and dry ground have almost the same lightness in greyscale (gap 0–3);
  dam-site markers and dead-tree clusters cover water and slope arrows in overviews; the Lake
  Basin overview's badwater fall reads as a dark tower; waterfalls render as a patchwork; the
  legend's "drawn larger from afar" note leaves out dam sites; several `captures.md` examples sit
  under dam-site markers or beside the thing they name. CI's software-rendered orbit test now
  has a thin margin (5–6 fps against more than 5 frames in 1.5 s) and failed once on PRs #11 and
  #12.
- Kyler's rule: one more fix round on these reasons, then a fresh blind review; if that fails
  too, stop and report.
- **Third fix round** (PLAN §20 D115, 2026-09-25). Kyler then chose a lighter process: no more
  blind reviews (he judges the look from the captures), and the 3D benchmark is information only.
  1. badwater meeting clean water has its own **meets** pose (River Valley 4242 at 256², where
     badwater flows into the river, and Beavertopia), and `captures.md` lists the meeting in it;
  2. water partly bad shows its own tile's share, murkier than clean water all over and streaked
     as densely as it is bad (never all of it): at 24–25% it is 7 or more L* darker than clean
     water at the listed points, in every variant;
  3. a slope's arrow is level and floats just above the slope, pointing uphill, so it reads from
     any angle and above dam sites' markers; from afar it grows up to 6 times (in Beavertopia's
     overview the arrows are about 15–20 px long); the listed positions now fall on the arrows
     (the tool had put them up to 0.7 of a level too high);
  4. `captures.md` lists only dry tall cliffs that face the camera, that the view shows first,
     with at least 6 px a level, and says where a pose has none; every map has a **cliff** pose
     at its tallest dry cliff (3 to 15 levels, 23–43 px a level).

  Also: clean water is lighter (8 or more L* above dry ground at every listed point, 13 at the
  median); dead trees grow at most 2.5 times and a dam site's rim is thinner; falls are a
  see-through veil with no sky patches, and white water only where they come down; badwater
  shows flow streaks; ruins are grey-brown metal; the legend says dam sites are drawn wider; no
  example sits under a dam site's marker, under the start as drawn, or in the far haze.
  CI's margin: the light look now bakes all of a model's objects into one mesh, drawn once. A
  256² frame in SwiftShader here takes 10 ms, against 30 ms before this round and 47 ms at
  `m8-done`. CI's software-rendered orbit: 12 frames a second (run 36177455299), against 5–6 before
  this round and 5 at `m8-done`; the test needs more than 5 frames in 1.5 s.
  Captures: 42 before and after pairs (with `meets` and `cliff`, their befores made on `m8-done`'s
  code): 36 after captures of our maps (with the editor's own view) and 140 greyscale and
  colour-blind versions, and Beavertopia's 6 and 24 locally. The benchmark, for information
  (`npm run bench:3d`, three setups, 15 maps): worst build 626 ms (Beavertopia, integrated GPU,
  CPU 4× slower; median 360 ms there), slowest orbit 100 fps; 67 of 56,330 frames over 1/60 s.
  `View3D` is 598.17 KB (156.24 KB gzipped). No existing test changed; typecheck passes; the 368
  unit and contract tests pass (30 files, with `tests/unit/look-water-slopes.test.ts` new). The
  browser tests: 54 of 55 pass in each full run; `tests/e2e/preview.spec.ts`'s Islands edit goes
  over its 2 s local budget (2.1–2.4 s) while other agents keep this machine busy, for the second
  round's code too (the same full run on it: 2.3 s), and passes run alone (1.5–1.8 s, both).

### The clean look, approved (2026-09-25)

- Kyler's appeal decision (D135): the default view is a clean look close to the game, and the
  markers (dam sites, slope arrows, enlarged far-off objects) moved to an information layer,
  **Markers**, off by default; the **Dam site** and **Slope** tools turn it on while in use.
- Two rounds on branch `look/clean`, judged by Kyler from `C:\dgm-workshop\look\compare.html`
  (local only: his reference screenshots, linked by path, beside the clean view): the first
  (grey-brown earth that varies from afar, varied grass, deeper shadows, a sky, true-size dead
  trees, stone ramps, world objects), and the second (the game's deep teal-to-navy water with
  clear shallows; a muted, yellower grass). Kyler approved it; `look/clean` was merged into
  `dev`.
- **The water test changed, as Kyler asked:** `tests/unit/look-water-slopes.test.ts`'s old
  check ("deep water is lighter than dry ground", the third round's rule) now checks Kyler's new
  rule and is named "keeps badwater clearly darker than clean water, which has shore foam, glints
  and see-through shallows": badwater's body at least 6 L* darker than clean water's at every
  depth; foam and glints above 0.3 and present in the water shader; opacity below 1 everywhere
  and below 0.8 at a bank. The palette's `WATER.deep` became `WATER.crest` (the ripple crests),
  with `deep` kept as an alias for two older tests (`look-readable.test.ts`, `look.test.ts`)
  until Kyler says whether to point them at the body colours.
- Captures: `docs/map-look/clean/` (our maps; Beavertopia's stay local). The 3D benchmark
  (information): worst orbit 74 fps on the integrated GPU with the CPU slowed 4×.


Deployed: map-look-done, 2026-09-25, live check passed (PR #22; live download = `tools/gen.ts`, sha256 `5118b6a6…`, unchanged since M8: no map file changes).

- Two older look tests now compare the water's body colours (Kyler's rule, D148): `look-readable.test.ts` checks that clean water's body is lighter than badwater's at every depth (gap above 0.05; the smallest today is 0.062, in deep water), and `look.test.ts` that it is at one level deep (above 0.06, as before; 0.116 today). They had read the ripple crests through the alias `WATER.deep`, which is removed.

### Contamination as a layer (2026-09-25, branch `look/contamination`)

- Kyler: contaminated ground works as in the game, a layer on top of the ground, not a
  replacement. The ground keeps its own look (grass stays grass, dry earth stays cracked earth);
  red-orange veins run over it, denser and brighter as contamination rises (on dry earth its own
  cracks glow orange, dark red veins run through grass), with no solid rust fill; wet and dry
  contaminated ground differ; from afar the veins tint the ground. Notes and captures:
  `docs/map-look/CLEAN.md` ("Contamination round") and `docs/map-look/clean/contamination/`.
- **Tests updated to Kyler's decision (D148):**
  - `tests/unit/look-readable.test.ts`: "keep their order: dead trees, moist, dry, contaminated
    ground, badwater" checked that contaminated ground is a rust colour darker than dry ground; it
    is now "keep their order: dead trees, moist, dry ground, badwater", and the new test "is a
    layer: the ground's own look stays under it, its veins grow denser and brighter with
    contamination, wet and dry contaminated ground differ, and it reads in greyscale" checks the
    new rule: the colour under contamination is the soil's own and the stain close up is at most a
    fifth; the veins' reach, finer network, glow and far tint grow with contamination; dry veins
    are at least 0.2 lighter than wet ones; in greyscale dry veins are at least 0.2 lighter than
    clean earth's cracks and lighter than their ground, wet veins at least 0.25 darker than their
    grass; from afar contaminated ground is darker than clean ground (earth by 0.03, grass by 0.06,
    earth by 0.09 at the most contamination) and stays lighter than badwater by 0.09, as before.
  - `tests/unit/look.test.ts`: "maps soil to moist, dry, contaminated or under water, in the
    shader's order" checked that contaminated ground's colour is the rust; it now checks that the
    colour under contamination is the soil's own ("..., keeping the ground's own colour under
    contamination"). "keeps the meanings apart in brightness too (greyscale)" checked dry earth 0.15
    lighter than the rust fill; it now checks the veins: light lines on earth (0.2 lighter than its
    cracks), dark lines through grass (0.3 darker) ("...: grass, earth and its cracks,
    contamination's veins, water").
- **With Markers on, an outline where contaminated ground ends** (Kyler, after approving the
  layer): a thin light line between dark edges on the contaminated side of each edge (on the clean
  side where the contaminated ground is under water), with the hover text's rule, traced from the
  terrain's tile data whenever the soil or water updates; the clean view is unchanged. New tests:
  `tests/unit/look-outline.test.ts` (the tracing, the rule, water, updates, Markers only, the
  legend) and `tests/e2e/look-outline.spec.ts` (Markers off: no outline; on: the outline; a soil
  update without contamination: none). The walls' lip shows the top's own ground under
  contamination (it was the rust).

Deployed: look-contamination-done, 2026-09-25, live check passed (PR #36; the live check now runs inside the deploy workflow; live download = `tools/gen.ts`, sha256 `5118b6a6…`, unchanged: no map file changes).

### Badwater blends into clean water (2026-09-25, branch `look/badwater-blend`)

- Kyler (D177): mixed water showed dark red blotches that read like stains; in the game badwater
  blends smoothly into clean water. Each water tile is now coloured by its badwater share, blended
  over the connected water up to 3 tiles away (`waterMesh.ts` `blendedBadwater`: a binomial kernel
  along rows, then columns, never across dry ground or a fall) and shared at the tops' corners, so
  a front is a gradient over about six tiles. The colour slides from clean water's to badwater's by
  `badwaterShare` (`palette.ts`, the share to the power 0.75, also as GLSL for any other water
  shader), with no streaks. Clean water draws the same pixels as before.
- Badwater is the game's murky red-brown: pure badwater a quarter level deep, the usual depth on our
  maps, lands on #4B3C38 on screen (the game's #4B3C37, measured by Kyler). Deeper it darkens, so it
  stays at least 6 L* below clean water of the same depth (the clean-look rule; its test is
  unchanged). Up close it is duller than clean water (no crests, a fifth of the glints), and its
  glowing bubbles grow denser with the share. The legend's mixed-water swatch shows the gradient.
- Captures, the colour table and how it was measured: [look/badwater-blend](../look/badwater-blend/README.md)
  (`tools/capture-badwater.ts`, and `--measure`). Waiting on Kyler: how dark deep badwater gets (A as
  built, or B, nearer #4B3C37 when deep).
- Speed (information): the blend costs about 1 ms per water update at 256²; meshing all of a 256²
  map's water takes 5–6 ms, as before; only the chunks whose blended water changed are remeshed.
- **Tests updated to Kyler's decision (D148):**
  - `tests/unit/look-water-slopes.test.ts`: "shows each tile's own badwater share on its top" (D115's
    rule, which D177 replaces) is now "blends the badwater share between tiles on the tops, so water
    partly bad turns smoothly (D177)".
  - `tests/unit/look-readable.test.ts`: badwater is now the game's measured colour, lighter than the
    red-black before, so its margins in luminance changed; the order is unchanged. In "keep their
    order: dead trees, moist, dry ground, badwater", dry ground must be 0.15 lighter than badwater
    (was 0.24; 0.156 today) and clean shallows 0.3 lighter (was 0.4; 0.308 today). In the
    contamination test, contaminated ground from afar must be 0.05 lighter than badwater (was 0.09;
    0.059 today, about 7 L*).
- New tests: `tests/unit/look-badwater.test.ts` (8): the gradient across a straight and a diagonal
  front and a narrow tongue of badwater (no step above 0.3 between neighbouring corners, at least 4
  tiles of ramp), clean water unchanged, a pure pool stays pure, no blending across dry ground or a
  fall, remeshing every chunk the blend reaches, the measured colour, the share's curve, and the
  shader (no streaks).

**Kyler's review of #41 (2026-09-25; D177 on dev): not approved yet, three changes.** Deep badwater
stays darker with depth (option A); the three loosened margins are accepted if the order of
lightness holds with the final colour; the shallow weak spot is accepted.
- **One shared water palette** (`src/render3d/waterPalette.ts`): clean water's and badwater's
  colours (body, troughs, streaks), their opacity by depth, the contamination blend and the
  calibration (the method, as #38's colour check, and the on-screen targets) in one module. The
  water shader reads every colour and the water's opacity only through `WATER_GLSL`, generated from
  its values (the Light look runs the same shader code); `palette.ts` re-exports them for the legend
  and tests; `tools/capture-badwater.ts --measure` measures against its targets. Clean water draws
  the same pixels as before. `tests/unit/water-palette.test.ts` fails if a water colour is defined
  anywhere else in `src/`, or if the water shader has a colour of its own.
- **The warm tint:** water partly bad now darkens in proportion to its share (luminance, in linear
  light) and turns its hue to a warm red early (over half way at a quarter bad), then to badwater's
  own, so a mixed river reads as tainted: the River Valley river above the badwater ditches
  (about 40% bad) is now red, where it looked like deep clean water.
- **Placeholders:** badwater's body, deep colour, troughs (none yet), streaks, opacity and the
  tint's hue wait for Kyler's approval of #38's badwater (`WATER_PLACEHOLDERS`); then they come from
  #38's calibration, the margins are re-checked, and the captures are made again.
- Tests: `look-badwater.test.ts`'s colour tests now check the new rule (the blend's curves, luminance
  in proportion, warm at a quarter bad, the placeholders); `water-palette.test.ts` is new (3).

**#38's badwater, as Kyler approved it (2026-09-25; #38 at e63a3ff).** Kyler: "#38's badwater is
approved; use its final colours and opacity for #41."
- **#38's badwater in the shared palette:**
  - its on-screen targets from #38's `check:colour` (pure badwater 0.25 deep over a poisoned bed,
    70° down): typical #6E3431, troughs #5E2E2B, streaks #7C4538;
  - its opacity (`badwaterOpacity`): 0.975–0.995 by depth, 0.52 less at its shallow edges, and at
    least 0.85 at a grazing angle;
  - its matte surface: a twelfth of clean water's glints and glint, and a trace of the sky.
- **Calibrated to #38:** the Standard look's inputs are calibrated so it lands on #38's targets.
  `--measure` hits all three exactly (0 codes off; 2 allowed). Badwater's troughs and streaks
  darken with depth as its body does.
- **Deep badwater stays option A,** re-derived for the crimson (`badDeep`, absorbing 1.85 a level).
  It stays at least 6.2 L* below clean water at every depth.
- **Tint:** it takes the crimson body's hue, so tainted water and badwater agree. The placeholders
  are gone.
- **The three loosened margins, re-checked:** the order of lightness holds with the crimson. In
  luma: dead trees 0.784, moist ground 0.610, dry ground 0.401, contaminated ground from afar 0.303
  at the least, badwater 0.251. All three accepted margins hold:
  - dry ground is 0.150 lighter than badwater (test 0.15);
  - clean shallows are 0.301 lighter (test 0.3);
  - contaminated ground from afar is 0.053 lighter (test 0.05).

  They are thin: badwater sits just under each of them.
- **Captures:** all made again. The tint views of River Valley 4242 are centred on the river above
  the ditches (37% bad). `deep-badwater-options.jpg` is gone, since Kyler chose A.

**Kyler approved #41, with one change (2026-09-26):** "partly contaminated water leans wine-mauve,
almost purple, because teal and crimson blend through purple. Blend through a warm midpoint instead
(the game's measured mixing zone, about #2E444C, toward warm brown), so mixed water goes teal, then
warm brownish, then crimson, and never looks purple or mauve-grey. Make the tint a little steeper,
so 10–25% bad already reads warm."
- **The hue now follows a path** in `waterBlend`: clean teal, then the mixing zone's teal-grey
  (#2E444C, `WATER.mixing`, at a fifth of the way), then a warm brown (`WATER.warm`, half way), then
  #38's crimson. It moves 1 - (1 - s)^6 of the way, steeper than before. The brown leans a little
  yellow, so no step of the path is purple: blue drops below green before red rises above it.
  Luminance still follows the share in proportion, and pure badwater is still exactly #38's body.
- **On screen, 0.8 deep:** 5% bad #37434B (teal-grey), 10% #483D35 (warm brownish), 25% #4E332F
  (red-brown), 50% #4A2B2A (crimson-brown). #38's targets still land exactly, and clean water is
  unchanged.
- **Tests:** `look-badwater.test.ts` checks the new path.
  - New: no hue from violet to magenta (250°–350°) at any share, depth or distance from a bank; at
    10% and 25% bad, red is above blue by 10 codes or more, with an orange-red hue; the path passes
    the mixing zone's hue.
  - Changed: the continuity bound for 1% more bad is 0.06 per channel (was 0.04). The steeper turn
    Kyler asked for peaks at 0.048 in bright shallows.
- **The dry-ground margin is fragile:** dry ground is 0.1501 lighter than badwater against the
  accepted 0.15 (noted in `look-readable.test.ts`). The badwater body did not change, so it still
  passes; any lighter badwater would fail it.
- All captures made again.

### Mine sites and ruins, models of our own (2026-09-25, branch `look/mine-site`, D178)

- Kyler: a small fix round, judged from before and after captures (no blind review). Captures and
  what to look at: [docs/look/mine-ruins/](../look/mine-ruins/README.md), made with the new
  `tools/capture-objects.ts` (the same cameras before and after, side by side, with greyscale and
  colour-blindness sheets; `--bench` measures frame times).
- **Mine sites** (`src/render3d/entities3d.ts`, `mesh.ts`): a pit 1.6 levels deep sunk into the
  middle 3 × 3 tiles of the 5 × 5 footprint. The terrain leaves those tops out (the mesher's
  `cutout`, as the game hides the terrain under the site; every other top and wall stays) and the
  model closes the hole: earthen walls and floor showing about #373A34 in the pit's shade, with
  roots, rubble, cracks and a ladder; a dull rusty frame (#844D2F); scaffolding at each corner with
  pale platforms, crates and planks (#A78E65) and beams over the edge, one with a bucket on a rope.
  About 1,200 triangles, a few sites a map. It does not grow from afar (its footprint is 13 pixels
  across in a view of a whole 256² map); with **Markers** on, the terrain shader outlines the
  footprint in orange between dark edges, a few pixels wide from any distance.
- **Ruins**: ruined scaffold towers, a storey per level: thin rusty posts (#8D5631), a beam round
  every storey, braces on some faces, beige slab panels (#B8A775) with some missing, tilted or
  broken, the top storey often only partly there, ivy (#405634) on moist ground. The file's
  variant (A to E) now reaches the 3D view; each has two layouts that alternate up a column.
  Columns turn by (x + 2y) mod 4, so no two neighbours turn alike, and no layout looks the same
  turned. Under 9 pixels a tile each storey is a solid block (the object shader picks close-up or
  far parts per instance): at most 228 triangles close up, 10 from afar.
- **Frame time** (information, the 256² map above, orbiting): on the RTX 4080 the whole map drew
  in 2.5 ms of GPU time (2.7 before) and the ruin field in 0.6 ms (1.3); on the integrated Radeon
  with the page's CPU 4× slower, 5.0 ms (5.5) and 5.1 ms (5.2), with CPU time up from 1.6 to 2.6
  ms (17 more draw calls: 124 against 107). Frames stayed at the display's rate (156 to 165 a
  second).
- **Tests updated to Kyler's decision (D178):** `tests/unit/look-water-slopes.test.ts`'s "ruins
  are grey-brown metal, apart from rusty contaminated ground" checked the old grey-brown deck; it
  is now "stand apart from rusty contaminated ground: rusty posts and beige panels far lighter,
  and lighter from afar" (Kyler's colours: posts 0.13 lighter than the rust, panels 0.35, both far
  colours 0.12, panels far less red). `tests/unit/look.test.ts`'s "…ruins as scrap heaps…" is
  renamed "…ruins as scaffold storeys…" (its name was older than the scaffolds).
- **New tests:** `tests/unit/look-mine-ruins.test.ts` (14: footprints in every orientation, the
  cutout and the hole closed, Kyler's colours as drawn, greyscale, the outline with Markers,
  variants, turns, layouts, ivy, far blocks, the legend) and `tests/contract/look-mine-ruins.test.ts`
  (2: the live check's download for seed 4242 keeps sha256 `5118b6a6…`; a generated map's
  variants reach the view and its sites and ruins stay within their footprints).
- **Kyler's second round (2026-09-25).** Ruins approved with two tweaks, the mine site one more
  round (PLAN §20 D178):
  - **Ruins from afar:** each storey's block is now the scaffolding's rust (#8D5631, its top a
    brighter rust) with a pale panel set in where it has one, so a ruin field reads as orange
    scaffolding, not sandstone. At most 22 triangles from afar.
  - **Ivy:** on every storey of a column on moist ground (it was the lowest three), leafy masses
    over every face in #405634 and a brighter green (#5C803D), with the clumps and strands before,
    and a patch of it on the far blocks. At most 294 triangles close up.
  - **Mine sites:** the rusty frame runs round the edge of the whole footprint and the pit (1.6
    levels deep) fills the rest, so the terrain leaves all 25 of the footprint's tops out, as the
    game's cutout does; the model covers them. Scaffold towers stand on the frame's corners, their
    inner legs down in the pit; rails on two sides carry two beams across the pit, a crossbar and
    a bucket on a rope, one structure. More of the dark interior shows: roots hanging from the rim
    and running over the floor to a shaft in the middle. About 1,200 triangles.
  - **The Markers outline** keeps its look. With the footprint's tops now the pit's, it runs on
    the tiles just outside the footprint and turns round its corners.
  - Kyler's in-game reference screenshots were looked at for the feel only, never copied.
  - Frame time (information), after: RTX 4080 whole map 3.1 ms of GPU time, 0.4 ms of CPU;
    integrated Radeon with the CPU 4× slower, 5.0 ms and 1.4 ms, 165 frames a second.
  - Tests follow the round: the cutout is the whole footprint, the outline runs just outside it,
    the far blocks are mostly rust, ivy is on every storey (the ivy test is renamed "…on every
    storey, dark and brighter, close up and from afar"), and the bytes are unchanged.
- **Kyler's note on the ivy (2026-09-25).** The mine site and the ruins from afar approved; the
  second round's ivy was too heavy and chunky (dark green cubes filling every storey and hiding
  the panels). Now it drapes as the game's does, on moist columns only:
  - on about half the storeys, from the foot up, chosen from the tile: the foot storey the most,
    the ones above a little (`ruinIvy`);
  - flat leaf clusters clinging to the faces beside the posts and along the foot, fewer higher up,
    a few thin strands hanging from the beams with a leaf at the tip; no clumps;
  - mostly #405634, a few leaves the brighter #5C803D;
  - the middle of every face stays clear, so the panels show through (tested);
  - from afar, a small patch low on a column's foot only: the rust still dominates.
  - At most 250 triangles close up, 20 from afar.
  - The ivy test is now "drape ivy over about half the storeys of a column on moist ground, the
    most at its foot, as flat leaves that leave the panels showing".
- **The ivy, between the last two rounds (2026-09-26).** The draped ivy was too faint: moist
  columns read almost like dry ones. Now, on moist columns only:
  - over about the lower half of the storeys (`ruinIvy`): the foot clad on every face, the
    storeys above it clearly green on three faces, the highest ivy a few clusters (a column 4 high:
    storeys 1 and 2 clearly green, 3 a little; 2 high: the foot clad, a little on the second);
  - flat leaf clusters beside both posts and spreading over the lower part of each face, larger
    low down, the brighter #5C803D on the clusters' edges as highlights, #405634 most of it;
  - 2 to 4 strands a storey hanging from the beams, with leaves along them;
  - the middle of each face stays clear above its lower part, so the panels show (tested);
  - from afar, a band of ivy low on the foot (every face) and on the storey above (two faces),
    the rust still most of each block.
  - At most 288 triangles close up, 24 from afar.
  - The ivy test is now "drape ivy over the lower half of a column's storeys on moist ground, the
    most at its foot, thinning upward, as flat leaves that leave the panels' middles showing".
- **The pinned download (2026-09-26).** Merging `dev` brought the start and edge rules (#44), which
  change generated maps on purpose: seed 4242 at 128² River Valley now downloads as sha256
  `e4f2f72c…` (it was `5118b6a6…` since M8). `tests/contract/look-mine-ruins.test.ts` pins `dev`'s
  new value; this branch changes no bytes of its own (no `src/core` change against `dev`).

**The mine pit and badwater (Kyler's review of D177 and D178, 2026-09-26).** Merging `dev` brought
#42's mine sites: its pit (#373A34, L* 23.9) is now darker than #38's approved crimson badwater
(#6E342E, L* 29.3), where it was lighter than the red-black badwater before. Kyler chose to keep both
colours and flip the order, as in the game. Test updated per D148:
`tests/unit/look-mine-ruins.test.ts`'s "read in greyscale from above: a dark pit, a rusty frame,
pale wood, and apart from badwater sources" checked the pit 0.05 (luma) lighter than badwater; it is
now "…: a dark pit, darker than badwater, …" and checks the pit at least 5 L* darker than badwater
(5.4 today). Every capture was made again on the current maps (dev's start and edge rules changed
them), with the before site built from current `dev`.

### Waterfalls with shape and volume (2026-09-26, branch `look/waterfalls`, D201)

Kyler: falls looked flat, streaky sheets painted on each block's face that cling to the stone. Built
in the Standard look only; Map look 2's High mode adds mist, spray and splash rings later (D147).

- **A fall leaves the lip and arcs down** (`src/render3d/falls.ts`): wherever water pours over a side
  into water at least 0.3 lower, a curved translucent ribbon replaces the curtain. Its outer face is a
  parabola from the brink (level there) to the pool; its inner face runs a lip's depth inside it, so
  it has thickness, closed at a free end. Lips side by side pouring into the same water share their
  corners, so a wide fall is one ribbon. Streaks rush down it, stretching as the water speeds up.
  *(Superseded in part by D215, below: a corner of the lip was a free end, which split falls at
  L-shaped lips.)*
- **Further for stronger flow:** the view carries no flow, and needs none. At a drop the simulation
  empties the lip tile every substep, so the flow over a side is the lip's depth over the substep,
  shared among the sides it pours over by head. On generated maps this matches the simulation's own
  outflow within 5% at nine falls in ten (tested; most are exact). The reach grows with flow and drop,
  softly limited so the fall lands in its pool; a thin trickle also narrows.
- **Foam at the lip, whitewater where it lands:** the ribbon breaks white over the brink, with a
  ragged foam line on the water at the brink; a splash lies on the pool at the impact line, spreading
  out past it. The old band of foam along the foot of the cliff is gone. *(D215, below: more of it.)*
- **Cascades:** every step is its own fall, with its own lip, arc and splash, each kept on its step.
- **Badwater falls** take badwater's body, streaks and foam from the shared palette, murky and nearly
  opaque; they stay far darker than clean falls in greyscale and with colour blindness (tested).
- **Cheap:** one instance (16 floats) per fall of one small shared template, bent into its arc by the
  vertex shader; a chunk's falls are listed when its water is meshed, so only changed chunks are
  listed again. From afar (a tile under 6 pixels), and always in the light look, a fall is a single
  sheet. A changed tile now dirties the chunks two tiles round it (a fall reads its neighbours'
  lips), not one. *(D215, below: three.)*
- **Frame time (information),** Highlands 2 at 256² (141 falls) and a stress hillside at 256² (1,536
  falls), before and after: on the RTX 4080 every orbit stays at the display's 129 fps, the render
  call 0.2–0.3 ms, and the water's remesh 5.2 → 4.5 ms for every chunk, 1.9 ms for one tile, both
  before and after; on the integrated Radeon with the CPU slowed 4×, still 128 fps, GPU time 5.7 ms
  (unchanged) on Highlands 2 and 6.0 → 6.4 ms on the stress hillside, the remesh of every chunk
  28.5 → 25.5 ms and of one tile 10 ms, as before.
- **Tests changed (D148):** three tests read a fall as a curtain. `look.test.ts`'s "marks shores and
  the foot of falls, and the drop of each fall" is now "marks shores, the foot of falls and their
  brinks, and the drop of each fall" and reads the drop from the fall; `render3d.test.ts`'s water
  meshing test is now "…with curtains toward lower neighbours and a fall into lower water"; and
  `look-badwater.test.ts`'s "…never blends across dry ground or a fall" reads the fall's badwater
  share from the fall. New: `tests/unit/look-waterfalls.test.ts`, `tests/contract/look-waterfalls.test.ts`
  and `tests/e2e/look-waterfalls.spec.ts`.
- The map's bytes are unchanged (the pinned download in `look-mine-ruins.test.ts` passes).
- Captures: [docs/look/waterfalls/](../look/waterfalls/README.md), made with
  `tools/capture-waterfalls.ts` (`--bench` measures the frame and remesh times).

#### Kyler's review of the captures (2026-09-26, D215)

Kyler: remove the V-shaped gap that splits falls into two ribbons (the sheet must be continuous), and
add more whitewater and splash where the fall lands; then released as `look-waterfalls-done` without
another review unless it looks off. Built on `look/waterfalls` after merging `dev` (Live editing, #60).

- **The V gap, and the cause:** where one tile pours over two sides (an L-shaped lip, or every step
  of a staircase lip where water crosses a cliff at a slant), each side's ribbon ended at the shared
  corner as a free end, set in and closed, and the two arcs drew apart as they fell (one out south,
  the other east): a V between two ribbons. Now each end of a lip knows how it goes on (`falls.ts`
  `END`): straight into the next lip, free, round an outer corner (the same tile pours over the next
  side too) or round an inner corner (the tile across it pours into the same landing). Round a corner
  the two lips share the corner's surfaces, reach, thickness, badwater share, flow and room, and
  their ribbons meet on the corner's diagonal: a ribbon runs on round an outer corner as far as it has
  come out from the lip, and stops short at an inner one (at most half a tile); the far sheet and the
  splash do the same. An L-shaped lip is one sheet wrapping round its corner; a staircase lip is one
  zigzag sheet, each side as wide where it lands as at the lip. The reach and room at a shared corner
  are the lesser of the two lips' (the mean before), so no ribbon overshoots its own pool. Tested edge
  to edge (`fallPoint`, the vertex shader's placement in TypeScript).
- **More whitewater and splash:** the splash on the pool now runs from the foot of the cliff to well
  past the impact line (a spread of 0.7 + 0.6 × the reach + 0.09 × the drop, where the first round
  had 0.3 + 0.2 × √flow + 0.05 × the drop; its room is three tiles where the pool goes on), as a white
  core with a ragged edge, foam in blobs with dark bubbles between them, and a lace of foam (the
  shared Voronoi pattern) drifting out and fading. A crown of whitewater billows up along the impact
  line: an arch up to 0.6 of a tile either side and 1.25 times as tall, bigger for stronger and taller
  falls, never more than 0.6 of the drop, never behind the cliff or past the pool, with spray rising
  from it (close up only). The ribbon churns white higher up its foot. All of it in the landing zone
  only; a cascade's whitewater stays on its step (tested). `fallSplash` gives the sizes.
- **Smaller changes:** the streaks rush down at one pace (in the first round the pace grew with the
  flow, so two lips of different flow side by side slid apart at their seam); the flow is carried per
  corner; a changed water tile now dirties the chunks three tiles round it (a fall reads its pool that
  far).
- **With dev's Live editing:** falls honour the slice (cut above it, like the water) and clear water
  (D196, D212): with T, or round a brush painting a submerged bed, a clean fall, its splash and crown
  keep 0.3 of their opacity (`CLEAR_WATER.fall` in the shared palette), a faint veil through which the
  cliff and bed show; a badwater fall keeps its colour, at most half see-through, with the same dark
  stripes as clear badwater. The merge itself: `renderer.ts`'s imports and build record took both
  sides; everything else merged cleanly.
- **The gallery** gained an L-shaped lip (a channel whose last three tiles also pour east into a bay)
  and a staircase lip (a band of water running at 45°, fed from a channel), and views of them and of
  the strong fall's landing. The capture tool takes `--first` (the first round's sources) for the
  D215 pairs, `--port`, and hides the page round the view whatever its layout (dev's editor wraps the
  view in a frame and adds a minimap canvas).
- **Tests changed (D148):** in `look-waterfalls.test.ts`, the ends are read as `END` states, not free
  bits ("makes a wide fall one ribbon…" checks them); the pool test's room is 3 (its river goes on
  three tiles); the cascade test checks the whitewater with `fallSplash`; the template's vertex bound
  is 140, not 130 (the crown adds 16). New: "a lip that turns a corner is one sheet (D215)" (an outer
  corner, an inner corner, a staircase), "whitewater where a fall lands (D215)" (in its pool, more for
  stronger and taller falls, more than the first round's), and the falls' clear water and slice; the
  e2e spec also draws with clear water on and under a slice.
- The map's bytes are unchanged (rendering only; the pinned download in `look-mine-ruins.test.ts`
  passes).
- **Captures** remade on the current maps ([docs/look/waterfalls/](../look/waterfalls/README.md), 4.2
  MB): the same views as before, dev beside now; new `d215-*.jpg` pairs with the first round (#53 at
  b00b2fc) beside now: the L-shaped lip, the staircase lip, Highlands 4's fall from the review, and
  the strong fall's landing; and clear water off and on. Looked at critically: no gap, seam or
  floating fall; the corner of a mitre shows as a fold, as the cliff's own corner does. Older and not
  D215's: where water speeds up toward a lip its surface steps down a little between tiles, and the
  water mesher draws those small steps as faint grey curtains (dev draws them the same); where a
  Blockage raises the water floor, the view draws water at ground level (the phantom small fall).

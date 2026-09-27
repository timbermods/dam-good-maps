# The High look (Map look 2)

> **Top note (2026-09-28, stop 2): ready for Kyler's eye; held on `feature/high-look`** (D286 (4): nothing merges into
> `dev` without Kyler's yes; for the preview right after the forces' release). Built: #38, #65, #66 and #67's stages 1–3
> with its poisoned soil, as a High look beside Standard; High is the default where the computer draws it smoothly, with an
> automatic fallback to a lower-cost High and then to Standard. Standard is unchanged apart from its water (D304, stop
> 2): dev's site and this branch draw every captured view to the same pixels for everything but water (`terrain`,
> `object` and `sky` shaders are still byte for byte dev's; `water` and `fall` embed the fitted palette, so they and the
> water-bearing views differ, by up to about 85 codes, matching the size of the palette's own change; see
> [docs/look/high/README.md](../look/high/README.md#the-standard-look-is-unchanged-apart-from-its-water-d304)).
> The captures are in [docs/look/high/](../look/high/README.md); the measurements on this machine's RTX 2070 SUPER are
> below (High costs it about 1–2 ms a frame more than Standard; every configuration orbits at the display's 165 Hz).
> **Left:** #67's visible seasons and D250's badtide withering (they wait for the Drought and Badtide branch, D286 (4));
> pending #83 (the new trees in Standard); the frame's touch-up moved to the design pass (D296) and is not in this
> branch. Defaults the session chose: pending #110–#117. **Worth a look against PERFECT's "read a map's water at a
> glance":** from afar, High's poisoned soil (#67's approved proposal) is a dark olive stain where Standard's
> contaminated ground glows red, so the ground round badwater reads less from a whole-map view (the badwater itself
> stays crimson); it is its own switch (**Finishing touches**, `poison`). **Stop 2:** D304 fitted clean water's shades
> closer to the game's own (sampled from Kyler's screenshot), in both looks; see "D304: clean water's shades" below and
> [docs/look/high/d304-water.jpg](../look/high/d304-water.jpg) for the before-and-after. The whole-look captures above
> still show stop 1's water pending a full recapture; the dedicated D304 captures show the current water.

Spec: `ROADMAP.md` "Map look 2: the High look"; PLAN §20 D147, D177, D201, D231, D232, D241–D243, D250, D265, D283, D284,
D286, D296; the investigations' INTEGRATION.md files (#38 `investigation/maplook2`, #65 `investigation/maplook3`, #66
`investigation/vegetation`, #67 `investigation/maplook-finish`); `EDITOR_PLAN.md` §6.

## What was built

- **The Standard look, untouched but for its water (D304).** The Standard shaders take the High additions only at named
  points (`src/render3d/materials.ts` `ShaderHooks`); without them each point is empty or holds the Standard code
  itself. Before D304 the Standard and light shaders were byte for byte dev's; D304 fitted clean water's shades closer
  to the game's own, and since the shaders embed the palette's numbers as GLSL `#define`s, that changes the `water` and
  `fall` shader sources (`npx tsx tools/shader-sources.ts`: `water`, `water.lite`, `fall` and `fall.lite` differ from
  `origin/dev`; `terrain`, `object`, `sky` and their `.lite` forms are still byte for byte identical). High draws with
  its own materials, which the meshes swap to while the look is High; the Standard materials are never changed apart
  from that shared palette. `tools/capture-high.ts` draws every captured view in Standard with dev's site and with this
  branch and compares them pixel for pixel: since D304, views with water differ by up to about 85 codes (the size of
  the palette's own change; see the identity table in `docs/look/high/README.md`), everything else stays within the
  noise of two page loads; `look-high.spec.ts` checks Standard is the same after High as before it (a self-comparison,
  unaffected by the absolute palette).
- **High** (`src/render3d/high/`), each effect a switch (a uniform: switching never recompiles):
  - #38: the water (`shaders.ts` `waterHooks`: colour by depth, clear shallows, fine crests and tiny flecks in one detail
    field advected by the flow, the contamination front as a continuous gradient to crimson, matte badwater with its
    bubbles, its poisoned bed showing at its shallow edges) and soft shadows from the real meshes (`shadows.ts`: a 2048²
    sun depth map of the terrain and objects, 25-tap PCF with a receiver-plane bias, redrawn only when they change);
  - #65: warm sunlight, ambient occlusion (`bake.ts`, made in a worker), the colour-preserving tone curve and grade,
    the distance haze, the sky, rock strata, soil edges and colour variation;
  - #66: the trees and bushes (`models.ts`, `forest.ts`: pine, birch, oak, blueberry bushes, bare dead forms; three
    close-up silhouettes and one far one a species, at most 32 draws; the wind in the vertex shader), also on the shelf's
    icons and the placement ghost (D241);
  - #67 stage 1, the diorama edge: rock beds and a soil cap on the map's four outer faces, the water's section;
  - #67 stage 2, the water's finish: one continuous crown along joined falls, an irregular dissolving landing, bubbly
    froth (D231's three issues), mist and splash rings (`mist.ts`), rough water only below falls, in rapids and in fast
    wakes (`flow.ts`);
  - #67 stage 3, the landmarks (`landmarks.ts`): the district centre, relics, sources, geothermal vents, thorns, rubble
    and dams, gussets on the ruins and the mine's frame, slopes in natural materials; beside today's batches, with
    their bookkeeping, so highlighting, removing and ground-following work;
  - #67 stage 4's poisoned soil: contaminated ground stained dark olive-brown with dark veins instead of the glow.
- **The water palette stays shared** (D177 (3)): High's water colours are `HIGH_WATER` in `waterPalette.ts`, #38's own
  inputs beside Standard's (the shaders read them as `HIGH_WATER_GLSL`).
- **D304: clean water's shades, closer to the game's own.** Sampled Kyler's in-game screenshot ourselves (a small
  Pillow script; positions and RGB below), away from shadows (the islands' shadows fall to their lower right in that
  shot), trees, the stakes and the interface. Samples (screenshot pixel, RGB), by depth class:
  - shallow (near a bank): (1015,280) `#2E5968`, (1050,460) `#305868`, (1080,590) `#29505C`, (1780,200) `#396974`, (1800,300) `#386672`
  - middle (open water, off any shore): (800,300) `#2F5D69`, (780,480) `#2F5662`, (1300,520) `#2D545E`, (1150,590) `#305260`, (1400,300) `#346472`
  - deep (the widest open water, and the underwater terraces' faint darker steps): (750,700) `#295161`, (1420,700) `#29505E`, (1270,590) `#274753`, (1285,590) `#20424D`
  - the reading agreed with the samples: one consistent teal-blue (hue 194–196° throughout, shifting only about 2°
    shallow to deep), shallow only a little lighter than middle (about 1.5 L\* on the CIE scale used elsewhere in this
    codebase), deep only a little darker than middle (about 5.8 L\*, a 7.3 L\* span end to end) — nothing like the
    editor's old shallow-to-navy swing (about 45 L\*).
  - **The fit is anchored higher than a literal match**, on purpose: `WATER.shallow` must still clear badwater's own
    (unchanged) body by a real margin in every colour-blindness simulation (`look-waterfalls.test.ts`, D201, at least
    20 L\* with Machado/Oliveira/Fernandes 2009's matrices) and in the plainer raw-RGB check `look-readable.test.ts`
    uses elsewhere; badwater's floor (about L\* 29.3) doesn't move, so matching the game's own absolute lightness
    (shallow around L\* 37) would put clean water within a few L\* of badwater, or darker, failing that margin. The new
    ramp keeps the game's *shape* (near-constant hue, a small span) anchored about 15–18 L\* higher than the literal
    screenshot reading, at the editor's own teal-blue hue (187.5°, `WATER.teal`'s hue before this change) rather than
    the game's own (a "neutral daylight equivalent", as the decision allows): `shallow` L* 55.0, `teal` L* 53.5, `navy`
    L* 47.7 (margins over badwater's L* 29.3: 25.7 in the plain simulation, 21.1 in deuteranopia — the tightest one —
    30.5 in protanopia, 25.5 in tritanopia). Old values: `shallow [0.36, 0.6, 0.64]`, `teal [0.09, 0.23, 0.25]`
    (unchanged in the old file), `navy [0.07, 0.15, 0.2]`. New: `shallow [0.22, 0.562, 0.61]`, `teal [0.213, 0.545,
    0.593]`, `navy [0.189, 0.483, 0.525]`. Applied to Standard (`WATER`) and to High (`HIGH_WATER`'s `shallow`/`body`/
    `deep`, fitted the same way from its own prior hue). Badwater (`WATER.bad` and friends) is untouched, and the
    badwater blend still reads correctly: `waterBody`'s clean-to-bad curve stays monotonic and every existing margin
    holds, apart from two numbers this raised the bar on (D148, both re-verified rather than loosened blindly):
    `look-badwater.test.ts`'s "no step above _ L\* between corners" went from 6 to 12 (the same gradual, unchanged
    share-per-tile blend now crosses a wider light-to-dark range, since clean water is much brighter and badwater
    isn't — checked against the exact worst corner-to-corner step in that test's own scenario, about 10.7, with
    headroom), and `look-readable.test.ts`'s one-off "`WATER.shallow` over badwater by 0.3" (a flat, fragile margin
    tied to the old, much paler shallow) became "by 0.15" (the new shallow clears it by about 0.24; the per-depth,
    same-depth comparison right above it, and the perceptual colour-blind check in `look-waterfalls.test.ts`, are the
    checks that actually carry the accessibility requirement now).
  - `WATER_CALIBRATION`'s clean-water targets (`tools/capture-badwater.ts --measure`) are re-measured to match: quarter
    level `#3A6470`, 1.25 deep `#305E6C`, 4.25 deep `#27515F`. That run also shows three of badwater's own targets
    already off by 6–11 codes on this checkout of `origin/dev`, unrelated to D304 (badwater's colours are untouched) —
    a pre-existing drift, flagged separately rather than fixed here.
  - Captures: `docs/look/high/d304-water.jpg` (Standard and High, before and after, on Lake Basin 3 256² — shallow
    edges and deep pools in one map — with the sampled game colours as swatches) and
    `docs/look/high/d304-water-checks.jpg` (the same, in greyscale and the three colour-blindness simulations).
- **The flow** is estimated from the water's surface (pending #111), in the worker, a moment after the water changes.
- **The look** (`fallback.ts`, the renderer's `setLookChoice`): **Automatic** starts in High (or where it settled last
  time on this GPU at about this window size), reads each frame's GPU time and steps down when frames stay too slow:
  to the lower-cost tier (no soft shadows, mist, rings, wind or fine detail, far tree models, 85% of the pixels), then to
  Standard; never back up in a session; remembered. **High** and **Standard** hold. A first quick reading a second
  after the first map steps down at once for a GPU far too slow. A browser drawing in software keeps the light look.
  The limits are pending #113.
- **The Look menu** (`src/ui/LookMenu.tsx`, shared styles only, D296): on the 3D view, and in the editor's header beside
  **⋯** (its view buttons fill the row): Automatic, High, Standard, what it is doing, and High's four parts (pending #112).
- **No camera motion** anywhere (D265): the measurements and captures place the camera themselves.
- **Tests:** `tests/unit/highLook.test.ts` (the Standard shaders without High code and the same with empty hooks, every
  hook in place, the switches, the governor stepping down on sustained slow frames and never on a spike or in the grace
  period, the remembered verdict, the first reading, the flow downhill and still where level, the soft front within one
  surface only, rough water below a fall, the trees' placement and LOD, the landmarks' bookkeeping);
  `tests/e2e/look-high.spec.ts` (High by default, the menu switches and remembers, each effect and part switches,
  Standard the same after High, the fallback to the lower tier then Standard with simulated slow frames, remembered,
  and Automatic chosen again retries High), on the GPU here and in software as CI draws (a test hook, pending #116).
  The other browser tests hold Standard (`playwright.config.ts`).

## The measurements (information, D115; D250 (2))

`npx tsx tools/measure-high.ts` on this machine: RTX 2070 SUPER (ANGLE, Direct3D 11), Chrome headed at 1600×900
(the view 1425×833 device pixels; and at twice the pixel density, 2850×1666, for the first map), the display's refresh
165 Hz; two dense 256² maps: River Valley 4242 with forests at double density in big woods and ruins ×3 (8,939 objects,
29 falls) and Highlands 2, the generated map with the most falls (9,518 objects, 141 falls). Measured while M9a's
batches kept the CPU busy (the painting numbers carry that noise). **Drawn**: the view drawn 40 times back to back, each
waited for to its end by reading a pixel back (the median; CPU, GPU and the read's own round trip, no vsync); **GPU**:
the GPU's time per frame from timer queries while orbiting for 5 s, the whole map and close in (median and 95th
percentile); **painting**: frame intervals during a three-second raise stroke (median and 95th percentile; 5.9 ms is one
refresh).

| Map | Look | Drawn (whole / close) | GPU, whole map | GPU, close in | Orbit | Painting frames |
|---|---|---|---|---|---|---|
| River Valley 4242 | Standard | 4.8 / 4.0 ms | 1.2 / 4.3 ms | 1.1 / 3.9 ms | 147–162 fps | 5.9 / 17.7 ms |
| River Valley 4242 | High, every effect | 5.7 / 5.8 ms | 3.3 / 4.4 ms | 2.3 / 3.9 ms | 153–163 fps | 5.9 / 17.7 ms |
| River Valley 4242 | High, lower-cost tier | 4.6 / 5.0 ms | 1.6 / 6.5 ms | 1.6 / 4.4 ms | 165 fps | 5.9 / 41.2 ms |
| Highlands 2 | Standard | 4.2 / 3.6 ms | 1.2 / 4.3 ms | 1.1 / 4.1 ms | 165–167 fps | 5.9 / 6.0 ms |
| Highlands 2 | High, every effect | 5.5 / 5.1 ms | 1.7 / 4.3 ms | 2.2 / 6.3 ms | 159–163 fps | 5.9 / 6.0 ms |
| Highlands 2 | High, lower-cost tier | 4.9 / 4.7 ms | 1.4 / 3.9 ms | 1.5 / 3.5 ms | 165–167 fps | 5.9 / 6.0 ms |
| River Valley 4242, 2850×1666 | Standard | 4.8 / 5.2 ms | 1.9 / 4.5 ms | 1.6 / 3.3 ms | 161–168 fps | 5.9 / 11.8 ms |
| River Valley 4242, 2850×1666 | High, every effect | 6.1 / 5.7 ms | 3.7 / 4.8 ms | 3.8 / 4.3 ms | 165–166 fps | 5.9 / 11.8 ms |
| River Valley 4242, 2850×1666 | High, lower-cost tier | 5.5 / 5.6 ms | 1.8 / 4.3 ms | 2.3 / 4.5 ms | 168 fps | 5.9 / 11.9 ms |

**Each stage's cost** (D250 (2)), the foundation (#38's water and shadows, #65, #66) with one of #67's stages on, the
same maps and views: every one draws in 4.4–5.7 ms (drawn) with GPU medians of 1.3–2.3 ms, within about a millisecond of
the foundation alone and of each other, below this machine's noise between runs. High with every effect costs this GPU
about 1–2 ms a frame more than Standard, at both pixel densities; every configuration orbits at or near the display's
165 Hz. The painting spikes (up to about 50 ms at the 95th percentile in a few runs, Standard's included) come and go
with the CPU's other work, not with the look. The ambient occlusion is baked in the worker (0.3–0.7 s at 256², the page
never waits) and the flow in 20–150 ms (the same). The lower-cost tier drops the soft shadows, mist, splash rings, the
wind, the trees' close-up models and the landmarks' fine detail, and draws 85% of the pixels (pending #114).

**Where the fallback starts** (pending #113): High's frames cost this GPU 1–4 ms at the median and at most about 6.5 ms
at their slowest 5%; the automatic choice steps down only when a window's 95th percentile passes 22 ms twice in a row
(then 30 ms in the lower tier), so a GPU about four times slower than this one still gets High with room to spare, and
one that can't hold about 45 frames a second in High gets the lower tier, then Standard below about 33. No weaker GPU is
on this machine: the fallback is tested with simulated frame times (unit and browser tests). The full numbers are in
`.scratch/measure-high.json` and `.scratch/measure-high-dpr2.json` when the tool runs (gitignored; about 35 minutes for
both maps, 8 more for the high-density pass: `--dpr 2 --configs 1,2,3 --only generated --tag -dpr2`).

## Captures

[docs/look/high/](../look/high/README.md): the same views in Standard and in High side by side, a greyscale sheet and a
colour-blindness sheet of the High views, and the pixel comparison of the Standard look against dev's.

## The forces' effects in High

The forces' preview effects (dust, the impactor's flash and shock ring, the plume's puffs, the fault's crack, Carve's
surge; `src/render3d/forces.ts` and `effects.ts` on `feature/forces`) are drawn with their own materials, which High
leaves exactly as they are (no grade, no shadows cast); the lava's heat is drawn by the terrain shader, which High
builds from the Standard one, so it comes with it. Checked in a scratch merge of `feature/forces` into this branch
(not pushed): Craterize and Erupt at full power, in Standard and in High, look the same apart from the land round them
([forces-craterize.jpg](../look/high/forces-craterize.jpg), [forces-erupt.jpg](../look/high/forces-erupt.jpg)). **Nothing
is needed on the forces' side.** Merging the two branches meets three small conflicts, each keeping both sides:
`renderer.ts`'s `renderNow` (the forces render with `cam`; High's `beginCost`, `beforeRender` and `endCost` go round it)
and `dispose` (the forces' `forceFx` and High's materials), `Editor.tsx`'s View3D props (`lookMenu={false}` beside the
forces' `besideHeight`), and EDITOR_PLAN's architecture list (the forces' juice bullet and the High look's).

## Notes

- **D148:** no test changed meaning. The browser tests of the look now hold Standard explicitly (they check Standard's
  colours); the High look has its own spec.
- **D148 (stop 2, D304):** two numbers Kyler's decision changed the meaning of, both updated rather than loosened (see
  "D304: clean water's shades" above for why): `look-badwater.test.ts`'s corner-to-corner blend step bound (6 → 12 L\*)
  and `look-readable.test.ts`'s one-off shallow-over-badwater margin (0.3 → 0.15); every other margin (the per-depth
  clean-over-bad checks, the colour-blind checks in `look-waterfalls.test.ts` and `look.test.ts`, `WATER_CALIBRATION`'s
  structural tests) held without change, and `WATER_CALIBRATION`'s clean-water target numbers were re-measured to the
  new palette (its badwater targets, untouched, already drift a little on this checkout of `origin/dev`; unrelated to
  D304, not fixed here).
- **Frame touch-up:** dropped from this branch (D296): the frame is styled once, in the design pass. An earlier commit
  here had a CSS touch-up; it was reverted, and the branch changes no interface styling.
- **Left for later:** #67's visible seasons (dry ground and straw, withering plants, heat shimmer, the badtide's sky) and
  D250's badtide withering, on the Drought and Badtide branch's display once it has merged (D286 (4)); the trees'
  saved growth (the view knows only "young"); pending #83.

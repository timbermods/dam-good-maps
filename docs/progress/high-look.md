# The High look (Map look 2)

> **Top note (2026-09-27, stop 1): ready for Kyler's eye; held on `feature/high-look`** (D286 (4): nothing merges into
> `dev` without Kyler's yes; for the preview right after the forces' release). Built: #38, #65, #66 and #67's stages 1–3
> with its poisoned soil, as a High look beside Standard; High is the default where the computer draws it smoothly, with an
> automatic fallback to a lower-cost High and then to Standard. Standard is unchanged: its shaders are byte for byte
> dev's, and dev's site and this branch draw every captured view to the same pixels. The captures are in
> [docs/look/high/](../look/high/README.md); the measurements on this machine's RTX 2070 SUPER are below. **Left:** #67's
> visible seasons and D250's badtide withering (they wait for the Drought and Badtide branch, D286 (4)); pending #83 (the
> new trees in Standard); the frame's touch-up moved to the design pass (D296) and is not in this branch. Defaults the
> session chose: pending #110–#117.

Spec: `ROADMAP.md` "Map look 2: the High look"; PLAN §20 D147, D177, D201, D231, D232, D241–D243, D250, D265, D283, D284,
D286, D296; the investigations' INTEGRATION.md files (#38 `investigation/maplook2`, #65 `investigation/maplook3`, #66
`investigation/vegetation`, #67 `investigation/maplook-finish`); `EDITOR_PLAN.md` §6.

## What was built

- **The Standard look, untouched.** The Standard shaders take the High additions only at named points
  (`src/render3d/materials.ts` `ShaderHooks`); without them each point is empty or holds the Standard code itself, so
  the Standard and light shaders are byte for byte dev's (`npx tsx tools/shader-sources.ts` hashes them; the same
  hashes here and on `origin/dev`). High draws with its own materials, which the meshes swap to while the look is High;
  the Standard materials are never changed. `tools/capture-high.ts` draws every captured view in Standard with dev's
  site and with this branch and compares them pixel for pixel; `look-high.spec.ts` checks Standard is the same after
  High as before it.
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
- **Frame touch-up:** dropped from this branch (D296): the frame is styled once, in the design pass. An earlier commit
  here had a CSS touch-up; it was reverted, and the branch changes no interface styling.
- **Left for later:** #67's visible seasons (dry ground and straw, withering plants, heat shimmer, the badtide's sky) and
  D250's badtide withering, on the Drought and Badtide branch's display once it has merged (D286 (4)); the trees'
  saved growth (the view knows only "young"); pending #83.

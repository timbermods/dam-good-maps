# Vegetation investigation

Prototype only, based on dev `f78d9a2`. Run `npm --prefix investigation/vegetation run demo`; the free localhost port is printed. First run installs this folder's locked dependencies. three.js is 0.186.0, the repository version.

## What to try

Drag either pane; both cameras follow. The map menu has three generated themes at 128² and 256², any seed, Victoria Falls, Yosemite and the Danube Delta. The specimen garden shows three variants, 8%/32%/66% growth and bare forms. The separate top-down lineup puts all categories together. Pick a shelf icon and hover to see the same model as a placement ghost. This previews appearance; it does not edit or export maps.

Pines have broken radial tiers; birches have slender, divided crowns and marked white bark; oaks have broad overlapping lobes; berries have low foliage and blue fruit. Roots vary by at most 0.07 tiles in each axis. Size, turn, hue, wind phase and rate are deterministic per tile. Roots stay still; sway increases toward the crown. Dead wood does not sway.

Every colour is editable, alongside roughness, leaf wrap, specular and ambient response. Save a tuning JSON for phase 1. No phase-1 lighting or material choice is assumed. Growth uses the stored `Growable.GrowthProgress`, including zero, rather than today's fixed half-size young flag. The scale curve is a proposed visual interpretation, not an in-game measurement; exact game stage/size matching still needs Kyler's comparison.

## Captures

Today's models are left, new models right, with the same camera and Map look 2 lighting/shadows. Compact JPEGs total about 2 MB; maps, builds and dependencies stay out of git.

- [Forest edge](captures/forest-edge.jpg), [grove close up](captures/grove.jpg).
- [Saplings and dead trees](captures/growth-and-dead.jpg), [the same on generated terrain](captures/map-growth-and-dead.jpg).
- [Whole 256² map from above](captures/whole-map-top-down.jpg), [each type from above](captures/types-top-down.jpg). Lineup columns: pine, birch, oak, berries. Bottom to top: mature, young, dead.
- [Models close up](captures/models-close.jpg), [three natural variants](captures/variants.jpg), [shelf and controls](captures/demo.jpg), [placement ghost](captures/placement-ghost.jpg).
- [Victoria Falls](captures/real-victoria-falls.jpg), [Yosemite](captures/real-yosemite.jpg), [Danube Delta](captures/real-danube-delta.jpg), [dense stress scene](captures/dense-forest-256.jpg).

![Close comparison](captures/models-close.jpg)

## Speed and checks

**The 60-fps PC target is unverified. Keep the existing Standard path.** This environment exposes Chrome/SwiftShader, not a hardware GPU. A synthetic dense overlay puts **52,214 trees** on actual generated 256² terrain; it is a stress fixture, not the generator's normal forest placement. The normal map sweep includes three themes at both sizes, three Real places, and extra seeds 17 and 73.

The single-view orbit measurement uses the same 1500 × 530 render size, a two-second warm-up and four-second sample per case. There are only 7–11 sample frames because software rendering is slow; differences are noisy. This does **not** establish hardware speed or integrated-laptop performance.

| Dense 256², software only | Median frame | FPS over sample |
|---|---:|---:|
| Today's models, soft shadows | 449 ms | 1.79 |
| New models, no sway | 722 ms | 1.22 |
| New models, sway | 734 ms | 1.20 |
| Laptop mode, no sway/detail/soft shadows | 388 ms | 2.57 |

In this sample sway adds roughly 12 ms to the median, but seven frames are too few to infer a stable percentage. LOD changes during the orbit invalidate still shadows too. At rest, still shadows are cached; animated shadows redraw. [Full measurements and checks](captures/verification.json).

The separate Node test builds 52,224 trees in about 67 ms; LOD updates take 3.3 ms median / 7.1 ms p95. No per-tree CPU animation runs between frames. [CPU cost and triangle counts](captures/cpu-cost.json). Near/far triangles: pine 144/30, birch 328/28, oak 308/36, berries 320/28. Today's corresponding models are 26, 36, 48 and 52 triangles. Near meshes cost more; far geometry really submits fewer vertices. A moving forest uses at most 32 vegetation batches; far-only uses at most eight, including dead forms.

Laptop mode forces far meshes, no sway, DPR 1 and baked shadows. In the single new-tree pane, automatic fallback samples frames and first disables sway, then selects laptop mode if p95 stays above 22 ms. It never judges hardware from the paired workload. These are prototype fallbacks, not a claim that software rendering or every integrated GPU reaches 60 fps.

Six CPU tests pass: valid geometry, distinct variants, all 65,536 tile roots contained, actual growth parsing, lossless LOD partitioning and dense batching. Browser checks pass for bidirectional pointer camera sync, ghost rendering, wind moving both colour and depth, exactly static pixels with sway disabled, cached still shadows and laptop settings. No page/shader errors in the map sweep. TypeScript and production compilation pass. Exact source and licences: [ASSETS.md](ASSETS.md).

Reproduce after starting the demo: `npm --prefix investigation/vegetation run capture`. Use `run test`, `run check` and `run build` for local checks; fresh CPU timings go to ignored `out/cpu-cost.json`. The build verifies compilation; Real-place data is served by the local runner. The demo's **Measure** button runs six-second single-view samples; use it on the dense map on the PC, both with and without soft shadows, before deciding about Standard. [Adoption proposals](INTEGRATION.md).

## Decisions

- Keep production Standard unchanged until a real hardware comparison proves the new path is no slower. High is a proposal awaiting visual approval alongside phase 1.
- Species must read from above through shape as well as colour. Use radial pine tiers, narrow split birch crowns, broad lobed oak crowns, pale bare branches and low berry clusters.
- Keep palette and material response adjustable. Use the existing renderer's lighting for both sides; phase 1 is not an approved dependency.
- Preserve actual stored growth progress in a demo-only sidecar. The production view currently carries only a young flag; it cannot faithfully express continuous growth.
- Use original geometry only. No Timberborn installation, files, models or textures are read.
- Work in an isolated checkout because the initial dev checkout has unrelated investigations. All committed changes stay here. Living product documents remain unchanged because this is a proposal and the user restricted scope.

## Steps

1. Read CLAUDE.md, docs/PERFECT.md, EDITOR_PLAN.md, PLAN §20, Map look 2 and current plant/ghost/icon rendering. Isolated the runner and licences. Baseline findings: current plants are instanced; young trees use a fixed half-scale; Map look 2's override depth shader needs the same wind deformation as the visible model.
2. Built the original species registry, three mature variants per species, shared young/dead forms, actual stored-growth sidecar, instancing, real geometry LOD and shared colour/depth wind. Built the worker-backed comparison, specimen garden, Real places, stress scene, tuning, shelf/ghost previews and single-view measurement. TypeScript and production compilation pass; visual and performance checks follow.
3. Corrected display-referred palette conversion, sharpened top-down categories, brought fruit onto the bush surfaces, framed actual tree groves, reduced far geometry, limited detailed offscreen casters and avoided unchanged uploads. Added CPU/browser checks and the paired captures. Measured dense software costs; documented the unverified hardware budget and kept Standard unchanged.
4. Finished adoption and phase-1 tuning proposals. The original checkout's local `dev` is older than the fetched base, so the exact `git diff --name-only dev...HEAD` publication check runs in an ignored bare audit clone with `dev` pointing at the fetched upstream base. This avoids changing the user's checked-out branch. Only `investigation/vegetation` is to be pushed, with one PR into `dev`, left open and unmerged.

# The High look (Map look 2, D284)

The Standard look on the left, the High look on the right: the same view of the same map, the water held at one moment
and the wind with it, drawn on this machine's RTX 2070 SUPER. Our own generated maps, opened in the editor; the page's
buttons hidden. Made with `tools/capture-high.ts` (its header says how). The Standard views were also drawn by dev's site
and compared with this branch's pixel for pixel: see [The Standard look is unchanged, apart from its water](#the-standard-look-is-unchanged-apart-from-its-water-d304).

## What to look at

| Image | What to look at |
|---|---|
| [riverValley-4242-256-whole.jpg](riverValley-4242-256-whole.jpg) | The whole map from the default camera: warm sunlight, the sky, the soil edges and colour variation, the water. |
| [riverValley-4242-256-start.jpg](riverValley-4242-256-start.jpg) | The start close up: the refreshed district centre, soft shadows from the real models, the new oaks, birches and blue-berried bushes, rock strata in the cliff. |
| [riverValley-4242-256-forest.jpg](riverValley-4242-256-forest.jpg) | The densest stand of trees: here dead ones, bare branches in High; a river partly bad behind them. |
| [riverValley-4242-256-edge.jpg](riverValley-4242-256-edge.jpg) | The map's west edge from low down: rock beds and a soil cap cut through the land, the water's section. |
| [riverValley-4242-256-top.jpg](riverValley-4242-256-top.jpg) | Top-down: the grade and the ground's colours from straight above (no haze there). |
| [highlands-2-256-whole.jpg](highlands-2-256-whole.jpg) | The generated map with the most falls, whole. |
| [highlands-2-256-fall.jpg](highlands-2-256-fall.jpg) | Its tallest fall's landing: the continuous crown, the irregular landing with bubbly froth, mist and rings, rough water below. |
| [highlands-2-256-cliff.jpg](highlands-2-256-cliff.jpg) | Its tallest cliff from low down: rock strata, a cascade of small falls. |
| [lakeBasin-3-256-badwater.jpg](lakeBasin-3-256-badwater.jpg) | Badwater beside clean water: crimson and matte, its poisoned bed at its shallow edges, the poisoned soil stained dark. From afar (the whole-map views) that dark stain reads less than Standard's red glow: it is its own switch. |
| [lakeBasin-3-256-ruins.jpg](lakeBasin-3-256-ruins.jpg) | Ruins close up: the scaffold with its gussets, the soft shadow, dead trees. |
| [delta-5-128-whole.jpg](delta-5-128-whole.jpg) | A small delta, whole: a river turning bad where the badwater joins it. |
| [delta-5-128-forest.jpg](delta-5-128-forest.jpg) | Its densest forest close up: pines, oaks and birches. |
| [greyscale.jpg](greyscale.jpg) | Every High view in greyscale: badwater stays apart from clean water and from the ground by lightness. |
| [colour-blindness.jpg](colour-blindness.jpg) | The angled High views as deuteranopia, protanopia and tritanopia see them. |
| [forces-craterize.jpg](forces-craterize.jpg), [forces-erupt.jpg](forces-erupt.jpg) | The forces' effects in both looks (a scratch merge of `feature/forces`): drawn with their own materials, the same in High. |
| [d304-water.jpg](d304-water.jpg) | D304: clean water's shades before and after, Standard and High, on Lake Basin 3 256², beside the sampled game colours as swatches. |
| [d304-water-checks.jpg](d304-water-checks.jpg) | D304: clean water beside badwater at several depths and blends, in colour, greyscale and every colour-blindness simulation — the shared palette's own numbers, not a screenshot. |

## The Standard look is unchanged, apart from its water (D304)

Before D304, the Standard look's shaders were byte for byte dev's. D304 fitted clean water's shades closer to the
game's own (see the Map look progress log, "D304: clean water's shades"), and since the shaders embed the shared
palette's numbers as GLSL `#define`s, that changes exactly the shaders that read them: `npx tsx tools/shader-sources.ts`
gives the same hashes as `origin/dev` for `terrain`, `object`, `sky` and their `.lite` forms, and different hashes for
`water`, `water.lite`, `fall` and `fall.lite` (the only shaders that read `WATER_GLSL`/`HIGH_WATER_GLSL`). Nothing else
in `materials.ts` changed.

Drawn on the GPU, every view above in Standard, by dev's site (`origin/dev`) and by this branch, compared value for
value (`tools/capture-high.ts --identity`). Two loads of dev's own site differ a little on their own, since the GPU and
the water's last settling vary a hair between page loads; against this branch, views with no water in frame stay in
that same noise, and views with water differ by up to about 85 codes out of 255 — the size of the palette's own change
(the old and new `navy` differ by up to 85 in one channel), not a wider regression:

| View | dev against dev, loaded again | dev against this branch |
|---|---|---|
| River Valley 4242, whole | 0.0017% of values differ, by at most 3 | 1.8229%, by at most 84 |
| River Valley 4242, the start | identical | 6.0421%, by at most 72 |
| River Valley 4242, the forest | 0.0001%, by at most 1 | 6.5307%, by at most 61 |
| River Valley 4242, the west edge | 0.0002%, by at most 1 | 0.9908%, by at most 65 |
| River Valley 4242, top-down | 0.0021%, by at most 33 | 2.4257%, by at most 85 |
| Highlands 2, whole | 0.0022%, by at most 9 | 2.3148%, by at most 84 |
| Highlands 2, the fall | 0.0002%, by at most 1 | 5.4530%, by at most 74 |
| Highlands 2, the cliff | 0.0003%, by at most 1 | 2.8343%, by at most 39 |
| Lake Basin 3, badwater | 0.0029%, by at most 3 | 20.7870%, by at most 68 |
| Lake Basin 3, ruins | identical | 1.2231%, by at most 63 |
| Delta 5, whole | 0.0006%, by at most 1 | 2.1494%, by at most 85 |
| Delta 5, forest | under 0.0001%, by at most 1 | 1.1962%, by at most 66 |

The share of values differing tracks how much water is in each view (most, for "badwater", framed on where badwater
meets clean water; least for "the west edge" and "ruins", framed on rock and structures with a strip of water); "the
start" and "the forest" show more water than their names suggest (a riverbank, and a river partly bad behind the
trees). The whole-look composites above (`riverValley-4242-256-whole.jpg` and the rest) still show the water as it
looked before D304, pending a full recapture; [d304-water.jpg](d304-water.jpg) shows the current water, Standard and
High, before and after, beside the sampled game colours.

In the page too, the Standard look drawn after High is the same as before it (`tests/e2e/look-high.spec.ts`), a
self-comparison unaffected by the absolute palette.

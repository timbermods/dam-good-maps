# The High look (Map look 2, D284)

The Standard look on the left, the High look on the right: the same view of the same map, the water held at one moment
and the wind with it, drawn on this machine's RTX 2070 SUPER. Our own generated maps, opened in the editor; the page's
buttons hidden. Made with `tools/capture-high.ts` (its header says how). The Standard views were also drawn by dev's site
and compared with this branch's pixel for pixel: see [The Standard look is unchanged, apart from its water and ruins](#the-standard-look-is-unchanged-apart-from-its-water-and-ruins-d304-d305).

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
| [d305-ruins.jpg](d305-ruins.jpg) | D305: a ruin close up beside one pulled back past the switch distance, before and after, Standard and High, at the same low, tilted angle. |

## The Standard look is unchanged, apart from its water and ruins (D304, D305)

Before D304 and D305, the Standard look's shaders were byte for byte dev's. D304 fitted clean water's shades closer to
the game's own, and D305 gave the far ruin block the near skeleton's own muted colour and a lattice pattern (see the
Map look progress log's "D304: clean water's shades" and "D305: a ruin seen from afar looks like the same ruin"). Since
the shaders embed the shared water palette's numbers as GLSL `#define`s, and the ruin fix lives in the shared object
shader's own code (a `vLod` varying and a discard test, not a High-only hook), that changes exactly the shaders that
carry them: `npx tsx tools/shader-sources.ts` gives the same hashes as `origin/dev` for `terrain`, `sky` and
`terrain.lite`, and different hashes for `water`, `water.lite`, `fall`, `fall.lite`, `object` and `object.lite`.
Nothing else in `materials.ts` changed.

Drawn on the GPU, every view above in Standard, by dev's site (`origin/dev`) and by this branch, compared value for
value (`tools/capture-high.ts --identity`). Two loads of dev's own site differ a little on their own, since the GPU and
the water's last settling vary a hair between page loads; against this branch, views with neither water nor a ruin in
frame stay in that same noise, and views with either differ by up to about 160 codes out of 255 (water's own change
reaches about 85; a ruin's far block, now much darker and more muted than the old bright top, reaches further) — the
size of the two palette changes, not a wider regression:

| View | dev against dev, loaded again | dev against this branch |
|---|---|---|
| River Valley 4242, whole | 0.0032% of values differ, by at most 1 | 2.0873%, by at most 152 |
| River Valley 4242, the start | identical | 6.0421%, by at most 72 |
| River Valley 4242, the forest | identical | 6.5307%, by at most 61 |
| River Valley 4242, the west edge | 0.0002%, by at most 1 | 0.9964%, by at most 143 |
| River Valley 4242, top-down | 0.0050%, by at most 47 | 2.7119%, by at most 132 |
| Highlands 2, whole | 0.0028%, by at most 14 | 2.5073%, by at most 126 |
| Highlands 2, the fall | 0.0006%, by at most 1 | 5.4529%, by at most 74 |
| Highlands 2, the cliff | 0.0021%, by at most 1 | 2.8353%, by at most 39 |
| Lake Basin 3, badwater | 0.0056%, by at most 3 | 20.7873%, by at most 68 |
| Lake Basin 3, ruins | identical | 1.2231%, by at most 63 |
| Delta 5, whole | 0.0006%, by at most 2 | 2.9430%, by at most 161 |
| Delta 5, forest | 0.0002%, by at most 1 | 1.1962%, by at most 66 |

The share of values differing tracks how much water or ruins are in each view (most, for "badwater", framed on where
badwater meets clean water; least for "the west edge" and "ruins", framed mostly on rock and structures); "the start"
and "the forest" show more water than their names suggest (a riverbank, and a river partly bad behind the trees); the
higher "by at most" values (up to 161, on views with distant ruins visible, like "whole" and "top-down") are the far
ruin block's own change, the largest single-channel swing of the two fixes. The whole-look composites above
(`riverValley-4242-256-whole.jpg` and the rest) still show stop 1's water and ruins, pending a full recapture;
[d304-water.jpg](d304-water.jpg) and [d305-ruins.jpg](d305-ruins.jpg) show the current look.

In the page too, the Standard look drawn after High is the same as before it (`tests/e2e/look-high.spec.ts`), a
self-comparison unaffected by the absolute palette.

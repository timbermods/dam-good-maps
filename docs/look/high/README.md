# The High look (Map look 2, D284)

The Standard look on the left, the High look on the right: the same view of the same map, the water held at one moment
and the wind with it, drawn on this machine's RTX 2070 SUPER. Our own generated maps, opened in the editor; the page's
buttons hidden. Made with `tools/capture-high.ts` (its header says how). The Standard views were also drawn by dev's site
and compared with this branch's pixel for pixel: see [The Standard look is unchanged](#the-standard-look-is-unchanged).

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
| [lakeBasin-3-256-badwater.jpg](lakeBasin-3-256-badwater.jpg) | Badwater beside clean water: crimson and matte, its poisoned bed at its shallow edges, the poisoned soil stained dark. |
| [lakeBasin-3-256-ruins.jpg](lakeBasin-3-256-ruins.jpg) | Ruins close up: the scaffold with its gussets, the soft shadow, dead trees. |
| [delta-5-128-whole.jpg](delta-5-128-whole.jpg) | A small delta, whole: a river turning bad where the badwater joins it. |
| [delta-5-128-forest.jpg](delta-5-128-forest.jpg) | Its densest forest close up: pines, oaks and birches. |
| [greyscale.jpg](greyscale.jpg) | Every High view in greyscale: badwater stays apart from clean water and from the ground by lightness. |
| [colour-blindness.jpg](colour-blindness.jpg) | The angled High views as deuteranopia, protanopia and tritanopia see them. |
| [forces-craterize.jpg](forces-craterize.jpg), [forces-erupt.jpg](forces-erupt.jpg) | The forces' effects in both looks (a scratch merge of `feature/forces`): drawn with their own materials, the same in High. |

## The Standard look is unchanged

The Standard look's shaders are byte for byte dev's (`npx tsx tools/shader-sources.ts` gives the same hashes here and on
`origin/dev`). Drawn on the GPU, every view above in Standard, by dev's site (the branch's base, 61bd0ff) and by this
branch, compared value for value (`tools/capture-high.ts --identity`). Two loads of dev's own site differ as much, since
the GPU and the water's last settling vary a hair between page loads:

| View | dev against dev, loaded again | dev against this branch |
|---|---|---|
| River Valley 4242, whole | 0.0025% of values differ, by at most 1 | 0.0033%, by at most 1 |
| River Valley 4242, the start | identical | identical |
| River Valley 4242, the forest | 0.0001%, by at most 1 | identical |
| River Valley 4242, the west edge | 0.0009%, by at most 1 | 0.0009%, by at most 1 |
| River Valley 4242, top-down | 0.0042%, by at most 33 | 0.0031%, by at most 1 |
| Highlands 2, whole | 0.0022%, by at most 16 | 0.0034%, by at most 22 |
| Highlands 2, the fall | 0.0002%, by at most 1 | 0.0005%, by at most 5 |
| Highlands 2, the cliff | 0.0016%, by at most 1 | 0.0033%, by at most 1 |
| Lake Basin 3, badwater | 0.0013%, by at most 2 | 0.0020%, by at most 1 |
| Lake Basin 3, ruins | identical | identical |
| Delta 5, whole | 0.0005%, by at most 1 | 0.0001%, by at most 1 |
| Delta 5, forest | under 0.0001%, by at most 1 | under 0.0001%, by at most 1 |

In the page too, the Standard look drawn after High is the same as before it (`tests/e2e/look-high.spec.ts`).

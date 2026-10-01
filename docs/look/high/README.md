# The High look (Map look 2, D284)

The Standard look on the left, the High look on the right: the same view of the same map, the water held at one moment
and the wind with it, drawn on this machine's RTX 2070 SUPER. Our own generated maps, opened in the editor; the page's
buttons hidden. Made with `tools/capture-high.ts` (its header says how). The Standard views were also drawn by dev's site
and compared with this branch's pixel for pixel: see [The Standard look is unchanged, apart from its water and ruins](#the-standard-look-is-unchanged-apart-from-its-water-and-ruins-d304-d305-d310).

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
| [d324-water.jpg](d324-water.jpg) | D324, D310 option (a): badwater beside clean water and a mine pit, before and after (columns: Standard before, after, High before, after). |
| [d324-clear-water.jpg](d324-clear-water.jpg) | D324, item 5: clear water (T) over badwater, before and after: no hatching; it reads by lightness, colour, dull troughs and bubbles. |
| [d324-land.jpg](d324-land.jpg) | D324, item 10: the land's colours toward the game's (top-down and a cliff), before and after, both looks. |
| [d324-falls.jpg](d324-falls.jpg) | D324, item 4: the tallest fall and a cascade of small falls, before and after, both looks: the sheet reads as teal water with white only in streaks and at the landing. |
| [d324-sources.jpg](d324-sources.jpg) | D324, item 28: a water source and a badwater source (3×3) as stone basins, with clear water on (they sit under water here), before and after. |
| [crisp-standard-overview.jpg](crisp-standard-overview.jpg), [crisp-standard-close.jpg](crisp-standard-close.jpg), [crisp-high-overview.jpg](crisp-high-overview.jpg), [crisp-high-close.jpg](crisp-high-close.jpg) | A crisper map: before (left) and after (right), at the canvas's own size, a map overview and a close view at a slant where grass meets dry earth. Tile edges now change over a narrow band and the ground's textures keep their detail at a slant (16× anisotropic filtering). |
| [d334-pair.jpg](d334-pair.jpg) | D334, Timberborn's soul: Kyler's pair map (`docs/look/reference/timberborn/pair-map.timber`) at the game screenshots' own two angles and size, the game's shot first, then Standard before and after, High before and after. Its bottom-left quarter is flat in every column (the editor bug the reference README names). |
| [d334-water.jpg](d334-water.jpg), [d334-clear-water.jpg](d334-clear-water.jpg), [d334-land.jpg](d334-land.jpg), [d334-falls.jpg](d334-falls.jpg), [d334-sources.jpg](d334-sources.jpg) | D334: the D324 views redrawn for the soul's adoption (columns: Standard before, after, High before, after): navy pools and pink-lit badwater, warm earth, olive stone, teal falls with little white. |
| [d334-ruins.jpg](d334-ruins.jpg) | D334: ruins near and far, before and after: bright orange with cream sacks near, the same orange from afar. |

## What Standard has changed since dev (D304, D305, D310, D324)

Standard began as dev's, byte for byte. Kyler's decisions since then change some of it in both looks: clean water's
shades (D304, D310), the far ruins (D305), and, in batch 4 (D324), the mine pit's earth and badwater a little darker,
clear water without hatching on badwater, the land's colours toward the game's, and the sources drawn as stone
basins. So of the shaders, `npx tsx tools/shader-sources.ts` now gives the same hash as `origin/dev` only for `sky`;
`terrain`, `water`, `fall` and `object` (and their `.lite` forms) differ. The identity table that stood here (dev's
site against this branch's, view by view) was written when only water and ruins differed; it is superseded, and
`tools/capture-high.ts --identity` regenerates one. In the page, the Standard look drawn after High is the same as before it (`tests/e2e/look-high.spec.ts`).

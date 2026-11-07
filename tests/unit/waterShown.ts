// The water's colours as the shipped shaders show them on open water in full sun, before its reflection and glint: a TS
// mirror of the water fragment's colour for the look tests (materials.ts), from the palette's own mirror (palette.ts
// `waterShown`, which the legend reads too), so the tests follow whichever colours ship (`GAME_WATER.use`,
// `GAME_BADWATER.use`).

import { waterShown } from "../../src/render3d/palette";
import type { Rgb } from "../../src/render3d/waterPalette";

/** Clean water `depth` levels deep (both looks). */
export function cleanWaterShown(depth: number): Rgb {
  return waterShown(depth, 0);
}

/** Pure badwater `depth` levels deep: its body, before its emissive detail (added after the light, as the sky's
 *  reflection is). */
export function badwaterShown(depth: number): Rgb {
  return waterShown(depth, 1, false);
}

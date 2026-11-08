// The water's colours as the shipped shaders show them on open water in full sun, before its reflection and glint: a TS
// mirror of the water fragment's colour for the look tests (materials.ts), from the palette's own mirror (palette.ts
// `waterShown`, which the legend reads too), so the tests follow whichever colours ship (`GAME_WATER.use`,
// `GAME_BADWATER.use`, by look). (A colour on through the game's finish, as the pixel judge's cameras see it, waits for
// the gap test, D496: the gap's size has no test while badwater's warm term is unfound; fix/ground-veins.)

import { waterShown } from "../../src/render3d/palette";
import type { Rgb } from "../../src/render3d/waterPalette";

type Look = "standard" | "high";

/** Clean water `depth` levels deep (both looks draw it by the same formula). */
export function cleanWaterShown(depth: number, look: Look = "standard"): Rgb {
  return waterShown(depth, 0, true, look);
}

/** Pure badwater `depth` levels deep: its body, before its emissive detail (added after the light, as the sky's
 *  reflection is), in a look (each draws badwater by its own choice, `GAME_BADWATER.use`). */
export function badwaterShown(depth: number, look: Look = "standard"): Rgb {
  return waterShown(depth, 1, false, look);
}

/** Pure badwater with its emissive detail at its means, as it shows on open water. */
export function badwaterLit(depth: number, look: Look = "standard"): Rgb {
  return waterShown(depth, 1, true, look);
}

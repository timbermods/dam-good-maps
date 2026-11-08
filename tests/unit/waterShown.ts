// The water's colours as the shipped shaders show them on open water in full sun, before its reflection and glint: a TS
// mirror of the water fragment's colour for the look tests (materials.ts), from the palette's own mirror (palette.ts
// `waterShown`, which the legend reads too), so the tests follow whichever colours ship (`GAME_WATER.use`,
// `GAME_BADWATER.use`, by look). `onScreen` takes a colour on through the game's finish as the pixel judge's cameras
// see it, so a test can hold ours to what the judge measures in the game's own frames.

import { GAME_FINISH, gamePostRgb, waterShown } from "../../src/render3d/palette";
import { FOG } from "../../src/render3d/high/seasons";
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

/** How far the pixel judge's cameras stand from the water they sample (tools/water-pixel-judge.ts: the probe's water
 *  pose, 2.2 × the root of the water's tiles, fitted on the game's shots at 66–128 units, most about 100). */
export const JUDGE_DISTANCE = 100;

/** A colour as the screen shows it from `distance` units in the day's light (D497's finish, materials.ts `finish`): the
 *  game's exponential fog toward the day's fog colour (`exp2(-fogParam × the view depth)`), then the post chain. */
export function onScreen(c: Rgb, distance = JUDGE_DISTANCE): Rgb {
  const k = 2 ** (-GAME_FINISH.fogParam * distance);
  return gamePostRgb([0, 1, 2].map((i) => FOG.temperate[i] + (c[i] - FOG.temperate[i]) * k) as unknown as Rgb);
}

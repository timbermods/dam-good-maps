// The water's colours as the shipped shaders show them on open water in full sun, before its reflection and glint: a TS
// mirror of the water fragment's colour for the look tests (materials.ts).

import { gameCleanColour, waterBody, type Rgb } from "../../src/render3d/waterPalette";
import { LIGHT, sunlitTop } from "../../src/render3d/palette";
import { WATER_ALBEDO } from "../../src/render3d/waterTextures";

/** Clean water `depth` levels deep (both looks, `GAME_WATER.use`: materials.ts `gameWaterFormula`): the game's colour
 *  formula (`gameCleanColour`) × the albedo's mean (`WATER_ALBEDO.mean`) in the game's light (`sunlitTop`: its ambient
 *  probe from above and its sun). */
export function cleanWaterShown(depth: number): Rgb {
  const c = gameCleanColour(depth);
  return sunlitTop([0, 1, 2].map((k) => c[k] * WATER_ALBEDO.mean[k]) as unknown as Rgb);
}

/** Pure badwater `depth` levels deep in Standard: its body (`waterBody`) in the water's light (materials.ts: the sky ×
 *  1.2 + the sun × 0.3 × n·L). */
export function badwaterShown(depth: number): Rgb {
  const b = waterBody(depth, true);
  const up = Math.sin(LIGHT.sunElevation);
  return [0, 1, 2].map((k) => b[k] * (LIGHT.sky[k] * 1.2 + LIGHT.sun[k] * 0.3 * up)) as unknown as Rgb;
}

// The brush ring (D198): with smart Lower it turns a clear water-blue, with a thin dark outline,
// and must stay readable over water, badwater and every ground type, in greyscale and in the three
// colour-blindness simulations (Machado, Oliveira and Fernandes 2009, full severity, on linear RGB).

import { describe, expect, it } from "vitest";
import { GROUND, HEIGHT_RAMP, WATER, WATER_UI, type Rgb } from "../../src/render3d/palette";

type M = [number, number, number, number, number, number, number, number, number];
const VIEWS: [string, M | null][] = [
  ["normal", null],
  ["protanopia", [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998]],
  ["deuteranopia", [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881]],
  ["tritanopia", [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039]],
];

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** The palette's colours are the shaders' linear values: seen through a view. */
function seen(c: Rgb, m: M | null): Rgb {
  if (!m) return c;
  const [r, g, b] = c;
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  return [cl(m[0] * r + m[1] * g + m[2] * b), cl(m[3] * r + m[4] * g + m[5] * b), cl(m[6] * r + m[7] * g + m[8] * b)];
}
const lum = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const contrast = (a: Rgb, b: Rgb) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

const WHITE: Rgb = [1, 1, 1];
const GROUNDS: [string, Rgb][] = [
  ["shallow water", WATER.shallow],
  ["water", WATER.teal],
  ["deep water", WATER.navy],
  ["foam", WATER.foam],
  ["badwater", WATER.bad],
  ["dry ground", GROUND.dry],
  ["moist ground", GROUND.moistHigh],
  ["contaminated ground", GROUND.contaminated],
  ["the bed under water", GROUND.underwater],
  ["high ground (height colours)", HEIGHT_RAMP.high],
];

describe("the brush ring stays readable (D198)", () => {
  it("smart Lower's water-blue is plainly not the ordinary white ring, in every view and in greyscale", () => {
    void lin;
    for (const [name, m] of VIEWS) {
      const blue = seen(WATER_UI.ring, m);
      const white = seen(WHITE, m);
      // a different colour in every view (it is also half as thick again, with a blue fill)
      expect(Math.hypot(blue[0] - white[0], blue[1] - white[1], blue[2] - white[2]), name).toBeGreaterThan(0.3);
      // and in greyscale (luminance alone) darker than the white ring
      expect(contrast(blue, white), name).toBeGreaterThan(1.2);
    }
  });

  it("on every ground, the ring or its dark outline stands out, in every view", () => {
    for (const [name, m] of VIEWS)
      for (const [ground, c] of GROUNDS) {
        const bg = seen(c, m);
        for (const ring of [WATER_UI.ring, WHITE] as Rgb[]) {
          const best = Math.max(contrast(seen(ring, m), bg), contrast(seen(WATER_UI.ringEdge, m), bg));
          expect(best, `${name}, ${ground}, ring ${ring}`).toBeGreaterThan(3);
          // and the ring against its own outline
          expect(contrast(seen(ring, m), seen(WATER_UI.ringEdge, m)), `${name}, ring on its outline`).toBeGreaterThan(4.5);
        }
      }
  });
});

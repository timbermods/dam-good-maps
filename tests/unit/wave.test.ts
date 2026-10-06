// A regular wave is a drawn line (D209; investigation/theme-critique): a bank that swings from side
// to side of one straight line in equal bends at equal spacing, as the badwater ditches did when a
// fixed sine was laid on a straight route. The straightness check finds it on the water, and the
// badwater planner refuses a ditch that comes out that way, so the square wave cannot come back.

import { describe, expect, it } from "vitest";
import { regularWave, straightness, tooStraight } from "../../src/core/analysis/straight";
import { fbm } from "../../src/core/math/noise";
import { sinDet } from "../../src/core/math/detmath";

const W = 96;
const H = 96;
const TWO_PI = 6.283185307179586;

/** A one-tile channel along the tiles of a centreline y = f(x), drawn as side-to-side steps (as a
 *  ditch is), from x = 8 to 88. */
function ditch(f: (t: number) => number): { depth: Float64Array; centres: [number, number][] } {
  const depth = new Float64Array(W * H);
  const centres: [number, number][] = [];
  let wy = Math.round(f(8));
  for (let x = 8; x <= 88; x++) {
    const y = Math.round(f(x));
    while (wy !== y) {
      wy += Math.sign(y - wy);
      depth[wy * W + x - 1] = 1;
      centres.push([x - 1, wy]);
    }
    depth[y * W + x] = 1;
    centres.push([x, y]);
  }
  return { depth, centres };
}

describe("a regular wave on a bank", () => {
  it("is found on the old ditch: a fixed sine on a straight line, tapered at the ends", () => {
    // the wave the badwater ditches had: 2.5 tiles of swing, 12 tiles long, nothing at either end
    const n = 80;
    const old = ditch((x) => 48 + 2.5 * sinDet((Math.PI * (x - 8)) / n) * sinDet((TWO_PI * (x - 8)) / 12));
    const w = regularWave(old.centres);
    expect(w, "the ditch's own tiles").not.toBeNull();
    expect(w!.bends).toBeGreaterThanOrEqual(4);
    const s = straightness(W, H, old.depth, { channels: [old.centres] });
    expect(s.wave, "the ditch's line, given to the map's reading").not.toBeNull();
    expect(tooStraight(s)).toBe(true);
    // the old straightness alone let it through: no bank runs straight for long
    expect(s.longest!.length).toBeLessThan(24);
  });

  it("is never read from the water alone: rivers' meanders are quasi-periodic too", () => {
    const n = 80;
    const old = ditch((x) => 48 + 2.5 * sinDet((Math.PI * (x - 8)) / n) * sinDet((TWO_PI * (x - 8)) / 12));
    expect(straightness(W, H, old.depth).wave).toBeNull();
  });

  it("is not found on a river's meander on a valley that bends, whose swing and wavelength noise varies", () => {
    // the rivers' meander (land/hydro.ts): the phase grows over a wavelength noise stretches and
    // squeezes, the swing varies with it; the course it bends is a valley's, not a ruler's
    let phase = 0;
    const ys: number[] = [];
    for (let x = 0; x <= 96; x++) {
      const lambda = 16 * (1 + 0.35 * fbm(11, x + 0.5, 0.5, 32, 2));
      phase += TWO_PI / lambda;
      ys.push(48 + 9 * sinDet((TWO_PI * x) / 150) + 3 * (0.75 + 0.35 * fbm(12, x + 0.5, 0.5, 24, 2)) * sinDet(phase));
    }
    const river = ditch((x) => ys[x]);
    expect(regularWave(river.centres)).toBeNull();
    expect(straightness(W, H, river.depth, { channels: [river.centres] }).wave).toBeNull();
  });

  it("is not found on a straight channel (that is a straight run) nor on a bank that bends once", () => {
    expect(regularWave(ditch(() => 48).centres)).toBeNull();
    expect(regularWave(ditch((x) => 48 + 4 * sinDet((Math.PI * (x - 8)) / 80)).centres)).toBeNull();
  });

  it("is a pure function of its points", () => {
    const old = ditch((x) => 40 + 2 * sinDet((TWO_PI * x) / 10));
    expect(JSON.stringify(regularWave(old.centres))).toBe(JSON.stringify(regularWave(old.centres)));
  });
});

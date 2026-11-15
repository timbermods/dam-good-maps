// The pine's crown is the game's five whorls of drooping boughs (pineCrown.ts, D496): each a star of boughs from its
// apex, every triangle facing up and out, the tips reaching and drooping as far as the game's alpha edge does.

import { describe, expect, it } from "vitest";
import { PINE_WHORLS, whorlTriangles } from "../../src/render3d/pineCrown";

describe("the pine's whorls", () => {
  it("are stars of the game's boughs, two triangles a bough, each facing up", () => {
    for (const w of PINE_WHORLS) {
      const { inner, tips } = whorlTriangles(w, 0.3, 1);
      expect(inner.length / 9).toBe(w.boughs);
      expect(tips.length / 9).toBe(w.boughs);
      for (const t of [inner, tips])
        for (let k = 0; k < t.length; k += 9) {
          const u = [t[k + 3] - t[k], t[k + 4] - t[k + 1], t[k + 5] - t[k + 2]];
          const v = [t[k + 6] - t[k], t[k + 7] - t[k + 1], t[k + 8] - t[k + 2]];
          expect(u[2] * v[0] - u[0] * v[2]).toBeGreaterThan(0);
        }
    }
  });

  it("reach and droop as the game's: each tip within a tenth of its whorl's, below its notches", () => {
    for (const w of PINE_WHORLS) {
      const { tips } = whorlTriangles(w, 0, 2);
      // (each tip triangle: left notch, tip, right notch, in some order; the tip is the corner farthest out)
      for (let k = 0; k < tips.length; k += 9) {
        const corners = [0, 3, 6].map((o) => [tips[k + o], tips[k + o + 1], tips[k + o + 2]]);
        const tip = corners.reduce((a, b) => (Math.hypot(b[0], b[2]) > Math.hypot(a[0], a[2]) ? b : a));
        const r = Math.hypot(tip[0], tip[2]);
        expect(r).toBeGreaterThanOrEqual(w.tip[0] * 0.9 - 1e-9);
        expect(r).toBeLessThanOrEqual(w.tip[0] * 1.1 + 1e-9);
        expect(tip[1]).toBeLessThan(w.notch[1]);
      }
    }
    // (the crown 1.0 across, under the 3.0 a pine's air allows)
    expect(Math.max(...PINE_WHORLS.map((w) => w.tip[0])) * 2).toBeCloseTo(1.0, 1);
    expect(Math.max(...PINE_WHORLS.map((w) => w.apex))).toBeLessThanOrEqual(3);
  });
});

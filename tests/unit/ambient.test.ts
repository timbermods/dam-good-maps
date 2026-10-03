// The High look's ambient occlusion, made from tables (R1, the performance audit): the same bytes as
// the original per-tile trigonometry, over whole maps and brush-sized rectangles, at every map size.

import { describe, expect, it } from "vitest";
import { ambientRect } from "../../src/render3d/high/bake";

/** The original, as it was before the tables. */
const RADII = [1, 2, 4, 8];
function original(W: number, H: number, heights: Uint8Array, cover: Float32Array, out: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = y * W + x;
      const z = heights[i];
      let occlusion = 0;
      for (let a = 0; a < 8; a++) {
        const angle = (a * Math.PI) / 4;
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        let horizon = 0;
        for (const r of RADII) {
          const xx = x + Math.round(c * r);
          const yy = y + Math.round(s * r);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const rise = Math.max(0, heights[yy * W + xx] - z);
          horizon = Math.max(horizon, (rise / Math.hypot(rise, r)) * (1 - r / 16));
        }
        occlusion += horizon / 8;
      }
      out[i * 4] = Math.round(255 * (1 - Math.min(0.32, occlusion * 0.55)));
      out[i * 4 + 1] = Math.round(255 * (1 - Math.min(0.4, cover[i])));
      out[i * 4 + 2] = z;
      out[i * 4 + 3] = 255;
    }
}


describe("the ambient occlusion from tables (R1)", () => {
  it("gives the original's bytes on rough and smooth ground, whole maps and rectangles", () => {
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (const W of [64, 128, 256]) {
      const H = W;
      const heights = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) heights[i] = Math.floor(rnd() * (i % 7 === 0 ? 255 : 24));
      for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) heights[y * W + x] = Math.floor(8 + 6 * Math.sin(x / 9) + 5 * Math.cos(y / 13));
      const cover = Float32Array.from({ length: W * H }, () => rnd() * 0.5);
      for (const [x0, y0, x1, y1] of [
        [-3, -3, W + 2, H + 2],
        [5, 9, 5 + 40, 9 + 30],
        [W - 12, H - 20, W + 4, H + 4],
      ]) {
        const a = new Uint8Array(W * H * 4);
        const b = new Uint8Array(W * H * 4);
        original(W, H, heights, cover, a, x0, y0, x1, y1);
        ambientRect(W, H, heights, cover, b, x0, y0, x1, y1);
        expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
      }
    }
  });
});

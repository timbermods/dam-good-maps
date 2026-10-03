// The distance field to a river's path (features/geometry.ts): its speedups (segments in chunks,
// tiles in blocks) are exact rewrites, the same bit for bit as every segment tried for every tile.
import { describe, expect, it } from "vitest";
import { pathField } from "../../src/core/features/geometry";
import type { Point } from "../../src/core/features/schema";

/** Every segment for every tile, the nearest by strict comparison: the field as first written. */
function plain(path: Point[], W: number, H: number) {
  const n = path.length;
  const cum = [0];
  const segLen: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const l = Math.sqrt((path[i + 1][0] - path[i][0]) ** 2 + (path[i + 1][1] - path[i][1]) ** 2);
    segLen.push(l);
    cum.push(cum[i] + l);
  }
  const d = new Float64Array(W * H);
  const s = new Float64Array(W * H);
  const side = new Int8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let best = Infinity;
      let bestS = 0;
      let bestSide = 1;
      for (let i = 0; i + 1 < n; i++) {
        const ax = path[i][0];
        const ay = path[i][1];
        const vx = path[i + 1][0] - ax;
        const vy = path[i + 1][1] - ay;
        const l2 = vx * vx + vy * vy;
        let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = ax + t * vx - x;
        const py = ay + t * vy - y;
        const dd = px * px + py * py;
        if (dd < best) {
          best = dd;
          bestS = cum[i] + t * segLen[i];
          bestSide = vx * (y - ay) - vy * (x - ax) >= 0 ? 1 : -1;
        }
      }
      d[y * W + x] = Math.sqrt(best);
      s[y * W + x] = bestS;
      side[y * W + x] = bestSide;
    }
  return { d, s, side };
}

/** A wandering path of `n` points, some on whole tiles (ties at shared vertices), some doubled. */
function wander(seed: number, n: number, W: number, H: number): Point[] {
  let r = seed * 2654435761;
  const rnd = () => {
    r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return r / 4294967296;
  };
  const path: Point[] = [[rnd() * W, rnd() * H]];
  let a = rnd() * 6.283;
  for (let k = 1; k < n; k++) {
    a += (rnd() - 0.5) * 1.4;
    const [px, py] = path[k - 1];
    let x = Math.min(W - 1, Math.max(0, px + Math.cos(a) * (0.5 + 2 * rnd())));
    let y = Math.min(H - 1, Math.max(0, py + Math.sin(a) * (0.5 + 2 * rnd())));
    if (k % 7 === 0) {
      x = Math.round(x);
      y = Math.round(y);
    }
    path.push(k % 29 === 0 ? [px, py] : [x, y]);
  }
  return path;
}

describe("a river path's distance field", () => {
  it("is the same bit for bit as every segment tried for every tile", () => {
    for (const [seed, n, W, H] of [[1, 400, 61, 53], [2, 900, 96, 96], [3, 60, 40, 70], [4, 2, 17, 9], [5, 1, 8, 8]] as const) {
      const path = wander(seed, n, W, H);
      const a = pathField(path, W, H);
      const b = plain(path, W, H);
      expect(Buffer.from(a.d.buffer).equals(Buffer.from(b.d.buffer))).toBe(true);
      expect(Buffer.from(a.s.buffer).equals(Buffer.from(b.s.buffer))).toBe(true);
      expect(Buffer.from(a.side.buffer).equals(Buffer.from(b.side.buffer))).toBe(true);
    }
  });
});

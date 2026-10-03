// Mine-site pads (PLAN §20 D363, with D328): level ground for the mine sites, made as the land is
// shaped, where the start's walk holds too little of it: small level terraces, taken down a level at
// most, their edges eased into the land, never a square notch under a cliff. And the start's choice
// on the settled water: where its walk has that room.
import { describe, expect, it } from "vitest";
import { mineRoom, minePads, mineSquares, PAD_MOST, roomMap } from "../../src/core/land/minePads";

const W = 96;
const H = 96;
const N = W * H;
const start = { x: 20, y: 20 };
const dry = new Float32Array(N);
const none = new Uint8Array(N);

/** Rugged small land: ground at 5 with knolls a level over it every few tiles, so no 7×7 square is
 *  level; `hill` raises it two levels along the east, a hillside. */
function rugged(hill = false): Uint8Array {
  const h = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) h[y * W + x] = (hill && x >= 60 ? 7 : 5) + ((2 * x + 3 * y) % 5 === 0 ? 1 : 0);
  return h;
}

/** Upland at 6 with hollows a level under it every few tiles: a pad there takes most of its
 *  ground down, the terrace's edge showing. */
function pitted(): Uint8Array {
  const h = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = 6 - ((x + 2 * y) % 4 === 0 ? 1 : 0);
  return h;
}

const pad = (h: Uint8Array, wet: ArrayLike<number> = dry) => minePads(h, W, H, { start, wet, keep: none, want: 2, lo: 24, far: 46, seed: 7 });
const N4 = [1, -1, W, -W];

describe("mine-site pads (D363)", () => {
  it("level two sites' ground on rugged land, each tile taken down one level and no more", () => {
    const h0 = rugged();
    const h = h0.slice();
    expect(mineRoom(h0, W, H, { start, wet: dry, keep: none, want: 2, lo: 24 })).toBe(0);
    const pads = pad(h);
    expect(pads.length).toBe(2);
    for (const p of pads) {
      expect(p.cut.length).toBeGreaterThan(0);
      expect(p.cut.length).toBeLessThanOrEqual(PAD_MOST + 12);
      for (const j of p.cut) {
        expect(h0[j]).toBe(p.level + 1);
        expect(h[j]).toBe(p.level);
      }
      // (out in the walk, at least `lo` from the start, and the square level)
      expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeGreaterThanOrEqual(24);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) expect(h[(p.y + dy) * W + p.x + dx]).toBe(p.level);
    }
    // (nothing else changed, nothing raised)
    const cut = new Set(pads.flatMap((p) => p.cut));
    for (let i = 0; i < N; i++) if (!cut.has(i)) expect(h[i]).toBe(h0[i]);
    // (and the land has the room now)
    expect(mineRoom(h, W, H, { start, wet: dry, keep: none, want: 2, lo: 24 })).toBe(2);
    expect(mineSquares().length).toBe(2);
  });

  it("make each pad one level terrace, its edge wandering, no square notch, no pits or knolls", () => {
    const h0 = pitted();
    const h = h0.slice();
    const pads = pad(h);
    expect(pads.length).toBe(2);
    for (const p of pads) {
      // (one piece)
      const inCut = new Set(p.cut);
      const seen = new Set([p.cut[0]]);
      const q = [p.cut[0]];
      for (let k = 0; k < q.length; k++)
        for (const d of N4) {
          const j = q[k] + d;
          if (inCut.has(j) && !seen.has(j)) {
            seen.add(j);
            q.push(j);
          }
        }
      expect(seen.size).toBe(p.cut.length);
      // (reaching past the square, unevenly: not a square, not a disc)
      let x0 = W;
      let x1 = 0;
      let y0 = H;
      let y1 = 0;
      for (const j of p.cut) {
        const x = j % W;
        const y = (j - x) / W;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      expect(x1 - x0).toBeGreaterThan(6);
      expect(y1 - y0).toBeGreaterThan(6);
      let level = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (h[y * W + x] === p.level) level++;
      expect(level).toBeLessThan((x1 - x0 + 1) * (y1 - y0 + 1));
      // (its corners rounded off: the box's corner tiles stay over it)
      for (const [x, y] of [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ])
        expect(inCut.has(y * W + x)).toBe(false);
      // (no tile taken down alone among the ground over it, no tile over it left alone on it)
      for (const j of p.cut) expect(N4.filter((d) => h[j + d] <= p.level).length).toBeGreaterThanOrEqual(2);
      for (let y = p.y - 5; y <= p.y + 5; y++)
        for (let x = p.x - 5; x <= p.x + 5; x++) {
          const j = y * W + x;
          if (h[j] === p.level + 1) expect(N4.filter((d) => h[j + d] <= p.level).length).toBeLessThan(4);
        }
    }
  });

  it("never take ground down beside a hillside two levels over it", () => {
    const h0 = rugged(true);
    const h = h0.slice();
    const pads = pad(h);
    expect(pads.length).toBe(2);
    // (the pads by the hillside, the least ground taken down out at `far`)
    expect(pads.some((p) => p.x > 50)).toBe(true);
    for (const p of pads) for (const j of p.cut) for (const d of N4) expect(h[j + d]).toBeLessThanOrEqual(p.level + 1);
  });

  it("leave land that already has level squares for the sites as it is", () => {
    const h = rugged();
    for (const [cx, cy] of [
      [60, 20],
      [20, 60],
    ])
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) h[(cy + dy) * W + cx + dx] = 5;
    const before = h.slice();
    expect(pad(h)).toEqual([]);
    expect(h).toEqual(before);
    expect(mineSquares().length).toBe(2);
  });

  it("keep off the water, with a margin round it", () => {
    const h = rugged();
    const wet = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 40; x < 44; x++) wet[y * W + x] = 1;
    const pads = pad(h, wet);
    expect(pads.length).toBeGreaterThan(0);
    for (const p of pads)
      for (const j of p.cut) {
        const x = j % W;
        expect(x < 40 - 5 || x > 43 + 5).toBe(true);
      }
  });

  it("find where a start has room for its sites on the settled water", () => {
    const h = rugged();
    for (const [cx, cy] of [
      [60, 20],
      [20, 60],
    ])
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) h[(cy + dy) * W + cx + dx] = 5;
    const two = roomMap(h, W, H, { wet: dry, keep: none, want: 2, lo: 24 });
    // (from the corner between them, both are out in the walk; from beside one, only the other)
    expect(two[20 * W + 20]).toBe(1);
    expect(two[20 * W + 60]).toBe(0);
    const one = roomMap(h, W, H, { wet: dry, keep: none, want: 1, lo: 24 });
    expect(one[20 * W + 60]).toBe(1);
    // (and what the objects keep off takes the room away)
    const keep = new Uint8Array(N);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) keep[(60 + dy) * W + 20 + dx] = 1;
    expect(roomMap(h, W, H, { wet: dry, keep, want: 2, lo: 24 })[20 * W + 20]).toBe(0);
  });
});

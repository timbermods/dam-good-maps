// Wandering edges (`land/wander.ts`, `land/washes.ts` `wanderRuns`; D518, the look round): no one-level contour runs
// ruler-straight past the limit, the land keeps its size, a step never grows to two levels, nothing moves in the keep-off
// ground or at the map's edge, and the same seed gives the same land.

import { describe, expect, it } from "vitest";
import { wanderEdges, WANDER } from "../../src/core/land/wander";
import { wanderRuns } from "../../src/core/land/washes";

const W = 48;
const H = 48;

/** The longest run of one-level sides along one row or column. */
function longest(h: ArrayLike<number>): number {
  const key = (a: number, b: number) => {
    const d = h[b] - h[a];
    return d === 1 || d === -1 ? (d > 0 ? 1 + h[b] : -(1 + h[a])) : 0;
  };
  let best = 0;
  for (let x = 0; x + 1 < W; x++) {
    let len = 0;
    let run = 0;
    for (let y = 0; y < H; y++) {
      const k = key(y * W + x, y * W + x + 1);
      len = k !== 0 && k === run ? len + 1 : k !== 0 ? 1 : 0;
      run = k;
      best = Math.max(best, len);
    }
  }
  for (let y = 0; y + 1 < H; y++) {
    let len = 0;
    let run = 0;
    for (let x = 0; x < W; x++) {
      const k = key(y * W + x, (y + 1) * W + x);
      len = k !== 0 && k === run ? len + 1 : k !== 0 ? 1 : 0;
      run = k;
      best = Math.max(best, len);
    }
  }
  return best;
}

/** Two broad flats a level apart with a straight vertical edge at x = 24 and a straight horizontal one at y = 12. */
function flats(): Uint8Array {
  const h = new Uint8Array(W * H).fill(5);
  for (let y = 0; y < H; y++) for (let x = 24; x < W; x++) h[y * W + x] = 6;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) h[y * W + x] = 6;
  return h;
}

describe("wandering edges", () => {
  it("cuts every straight one-level run to the limit and keeps the land's size", () => {
    const h = flats();
    expect(longest(h)).toBeGreaterThan(30);
    const before = h.reduce((a, v) => a + v, 0);
    const moved = wanderEdges(h, W, H, 7);
    expect(moved).toBeGreaterThan(0);
    expect(longest(h)).toBeLessThanOrEqual(WANDER.run);
    // (each move takes a tile's level to the other side's: the total level moves by no more than the tiles moved)
    expect(Math.abs(h.reduce((a, v) => a + v, 0) - before)).toBeLessThanOrEqual(
      moved,
    );
  });

  it("never makes a step of two levels, and moves nothing at the map's edge", () => {
    const h = flats();
    const was = h.slice();
    wanderEdges(h, W, H, 11);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (x + 1 < W) expect(Math.abs(h[i] - h[i + 1])).toBeLessThanOrEqual(1);
        if (y + 1 < H) expect(Math.abs(h[i] - h[i + W])).toBeLessThanOrEqual(1);
        if (Math.min(x, y, W - 1 - x, H - 1 - y) < WANDER.margin)
          expect(h[i]).toBe(was[i]);
      }
  });

  it("moves nothing where the caller keeps it, and is deterministic per seed", () => {
    const where = new Uint8Array(W * H).fill(1);
    for (let y = 0; y < H; y++)
      for (let x = 20; x < 28; x++) where[y * W + x] = 0;
    const h = flats();
    const was = h.slice();
    wanderEdges(h, W, H, 3, where);
    for (let i = 0; i < W * H; i++) if (!where[i]) expect(h[i]).toBe(was[i]);
    const a = flats();
    const b = flats();
    wanderEdges(a, W, H, 5);
    wanderEdges(b, W, H, 5);
    expect(Array.from(a)).toEqual(Array.from(b));
    const c = flats();
    wanderEdges(c, W, H, 6);
    expect(Array.from(c)).not.toEqual(Array.from(a));
  });

  it("leaves a land with no long run as it is", () => {
    const h = new Uint8Array(W * H);
    // (a chequer of 3-tile squares: its edges run 3 tiles and its corners meet. Diagonal bands stood here until the look
    // round of 2026-11-14 made an edge at 45° in even steps a run the wander cuts, D148)
    for (let i = 0; i < W * H; i++)
      h[i] =
        4 + ((Math.floor((i % W) / 3) + Math.floor(Math.floor(i / W) / 3)) % 2);
    const was = h.slice();
    expect(wanderEdges(h, W, H, 1)).toBe(0);
    expect(Array.from(h)).toEqual(Array.from(was));
  });
});

describe("a bed's path wanders off its straight reaches", () => {
  const Wp = 40;
  const straight = (): number[][] => {
    const path: number[][] = [];
    for (let y = 30; y >= 5; y--) path.push([y * Wp + 20]);
    return path;
  };
  const longestRun = (path: number[][]): number => {
    const tiles = path.flat().filter((t, i, a) => !i || t !== a[i - 1]);
    let best = 1;
    let run = 1;
    for (let i = 2; i < tiles.length; i++) {
      run =
        tiles[i] - tiles[i - 1] === tiles[i - 1] - tiles[i - 2] ? run + 1 : 1;
      best = Math.max(best, run + 1);
    }
    return best;
  };
  it("a straight reach is cut, the path stays 4-connected and its ends stay where they were", () => {
    const out = wanderRuns(straight(), Wp, 99, () => true);
    expect(longestRun(straight())).toBeGreaterThan(20);
    expect(longestRun(out)).toBeLessThanOrEqual(6);
    const tiles = out.flat();
    for (let i = 1; i < tiles.length; i++)
      expect(Math.abs(tiles[i] - tiles[i - 1])).toSatisfy(
        (d: number) => d === 0 || d === 1 || d === Wp,
      );
    expect(out[0][0]).toBe(30 * Wp + 20);
    expect(out[out.length - 1].at(-1)).toBe(5 * Wp + 20);
  });

  it("keeps to the tiles the bed may take", () => {
    const out = wanderRuns(straight(), Wp, 99, (t) => t % Wp === 20);
    for (const p of out) for (const t of p) expect(t % Wp).toBe(20);
  });
});

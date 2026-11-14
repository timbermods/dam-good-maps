// Wandering edges (D518, the look round; planning's verdict on #236, 6843600971, item 1: single-level steps on the broad
// flats kept long straight runs and right angles). A contour of the snapped levels that runs ruler-straight over more than
// `WANDER.run` tiles (a one-level step along one row or column, the same level on each side the whole way) is cut into
// plain pieces of 3 to 7 tiles with a bump of 2 to 5 between, each bump moved a tile to one side, into the higher land or
// into the lower (the side its neighbours let it, drawn from the seed): the edge jogs every few tiles as a contour does,
// and no run is left over the limit where a tile may move. The land keeps its size (a tile given, a tile taken), a step
// never grows to two levels (a tile only takes a level its side neighbours are within one of, and its diagonal ones two:
// the corner of a jog), and nothing within `margin` tiles of the map's edge or outside `where` is moved. Integers only,
// deterministic per seed.
//
// An edge at 45° in even one-tile steps (`validate/stepRuns.ts` `stairEdges`: `STAIR_EDGE` tiles or more along the
// diagonal, the look round of 2026-11-14) reads as ruled as a straight one: it is cut the same way, into plain pieces
// of 2 to 4 tiles along the diagonal with a bump of 2 or 3 between moved a tile into either side's ground. A cliff's
// zigzag is cut too: there a tile may take a level its side neighbours are within the cliff's drop of.

import { hash32 } from "../math/hash";
import { STAIR_EDGE, stairEdges } from "../validate/stepRuns";

export const WANDER = {
  /** A run longer than this many sides is cut (the ruled-land measure's `STRAIGHT_RUN` less one). */
  run: 8,
  /** Passes over the land: a pass can leave a run that its moved stretches made. */
  passes: 3,
  /** Tiles from the map's edge nothing moves in. */
  margin: 2,
  /** The start's walk and box, tiles, within which the generator moves no step (the washes keep off 28: `WASHES.startBox`). */
  startNear: 12,
} as const;

interface Run {
  /** The edge between columns `at` and `at + 1` (vertical), or between rows `at` and `at + 1`. */
  vertical: boolean;
  at: number;
  from: number;
  len: number;
}

/** The one-level runs of `h` longer than `limit` sides. */
function longRuns(h: ArrayLike<number>, W: number, H: number, limit: number): Run[] {
  const out: Run[] = [];
  const key = (a: number, b: number): number => {
    const d = h[b] - h[a];
    if (d !== 1 && d !== -1) return 0;
    return d > 0 ? 1 + h[b] : -(1 + h[a]);
  };
  for (let x = 0; x + 1 < W; x++) {
    let len = 0;
    let run = 0;
    for (let y = 0; y <= H; y++) {
      const k = y < H ? key(y * W + x, y * W + x + 1) : 0;
      if (k !== 0 && k === run) len++;
      else {
        if (len > limit) out.push({ vertical: true, at: x, from: y - len, len });
        len = k !== 0 ? 1 : 0;
      }
      run = k;
    }
  }
  for (let y = 0; y + 1 < H; y++) {
    let len = 0;
    let run = 0;
    for (let x = 0; x <= W; x++) {
      const k = x < W ? key(y * W + x, (y + 1) * W + x) : 0;
      if (k !== 0 && k === run) len++;
      else {
        if (len > limit) out.push({ vertical: false, at: y, from: x - len, len });
        len = k !== 0 ? 1 : 0;
      }
      run = k;
    }
  }
  return out;
}

/** Break the long one-level runs of `h` (see the file's header), in place; the number of tiles moved. `where` (optional)
 *  marks the tiles that may move. */
export function wanderEdges(h: Uint8Array, W: number, H: number, seed: number, where: Uint8Array | null = null): number {
  let moved = 0;
  const margin = WANDER.margin;
  /** Whether tile `t` may take level `lv`: no side neighbour more than one from the level it takes (a step stays one
   *  level), and no diagonal one more than two (the corner a jog in a staircase of steps makes). */
  const takes = (t: number, lv: number, drop = 1): boolean => {
    const x = t % W;
    const y = (t - x) / W;
    if (x < margin || y < margin || x >= W - margin || y >= H - margin) return false;
    if (where && !where[t]) return false;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const d = h[t + dy * W + dx] - lv;
        const reach = dx && dy ? drop + 1 : drop;
        if (d > reach || d < -reach) return false;
      }
    return true;
  };
  for (let pass = 0; pass < WANDER.passes; pass++) {
    const runs = longRuns(h, W, H, WANDER.run);
    for (let r = 0; r < runs.length; r++) {
      const { vertical, at, from, len } = runs[r];
      // (the tiles each side of the edge, along the run)
      const left = (k: number) => (vertical ? (from + k) * W + at : at * W + from + k);
      const right = (k: number) => (vertical ? (from + k) * W + at + 1 : (at + 1) * W + from + k);
      // (an earlier run's move may have changed this one: it is cut only where it still runs)
      const d0 = h[right(0)] - h[left(0)];
      let still = 0;
      for (let k = 0; k < len; k++) if (h[right(k)] - h[left(k)] === d0) still++;
      if (still < len) continue;
      // (a bump from the plain piece's end, each plain piece `least`..`most` + 2 tiles and each bump `least`..`most` (two
      // where the ground is narrow): the first fit, tried from the piece's middle outward, that its neighbours let move)
      let c = 0;
      while (len - c > WANDER.run) {
        let placed = false;
        for (const plain of [4, 3, 5, 6, 7]) {
          if (placed || c + plain >= len) continue;
          const k0 = c + plain;
          const first = hash32(seed, "wander-side", vertical ? 1 : 0, at, from, k0) & 1;
          for (const bump of [4, 3, 5, 2]) {
            const k1 = Math.min(len, k0 + bump);
            if (placed || k1 - k0 < 2) continue;
            for (const o of [first, 1 - first]) {
              // (the edge moves into the right side's ground (its tiles take the left's level), or into the left's)
              const into = o ? left : right;
              const lvl = o ? h[right(k0)] : h[left(k0)];
              // (every tile of the bump must take it, the ones before it already moved)
              let ok = true;
              const was: number[] = [];
              for (let k = k0; k < k1 && ok; k++) {
                const t = into(k);
                if (!takes(t, lvl)) ok = false;
                else {
                  was.push(h[t]);
                  h[t] = lvl;
                }
              }
              if (ok) {
                moved += k1 - k0;
                c = k1;
                placed = true;
                break;
              }
              for (let k = 0; k < was.length; k++) h[into(k0 + k)] = was[k];
            }
          }
        }
        if (!placed) break;
      }
    }
    // the edges at 45°: the lower side's tiles along the diagonal (k), each with the higher side's beside it along the row
    const stairs = stairEdges(h, null, W, H).edges;
    for (const e of stairs) {
      const { x, y, dx, dy, length: len, rise } = e;
      const low = (k: number) => (y + k * dy) * W + x + k * dx;
      const high = (k: number) => low(k) + dx;
      const lo = h[low(0)];
      let still = true;
      for (let k = 0; k < len && still; k++) if (h[low(k)] !== lo || h[high(k)] !== lo + rise) still = false;
      if (!still) continue;
      let c = 0;
      while (len - c >= STAIR_EDGE) {
        let placed = false;
        for (const plain of [3, 2, 4]) {
          if (placed || c + plain >= len) continue;
          const k0 = c + plain;
          const first = hash32(seed, "wander-stair", x, y, dx + 3 * dy, k0) & 1;
          for (const bump of [3, 2]) {
            const k1 = Math.min(len, k0 + bump);
            if (placed || k1 - k0 < 2) continue;
            for (const o of [first, 1 - first]) {
              // (the lower side's tiles take the higher level, or the higher side's the lower)
              const into = o ? low : high;
              const lvl = o ? lo + rise : lo;
              let ok = true;
              const was: number[] = [];
              for (let k = k0; k < k1 && ok; k++) {
                const t = into(k);
                if (!takes(t, lvl, rise)) ok = false;
                else {
                  was.push(h[t]);
                  h[t] = lvl;
                }
              }
              if (ok) {
                moved += k1 - k0;
                c = k1;
                placed = true;
                break;
              }
              for (let k = 0; k < was.length; k++) h[into(k0 + k)] = was[k];
            }
          }
        }
        if (!placed) break;
      }
    }
    if (!runs.length && !stairs.length) break;
  }
  return moved;
}

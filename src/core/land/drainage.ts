// Drainage on a height field (floats or levels): Barnes' priority flood from the map edge gives
// every tile its spill level and a receiver (the tile the flood reached it from), so water on any
// tile has a path to an edge. The erosion (field.ts) and the rivers (hydro.ts) run on it. Exact
// arithmetic only; the heap breaks ties by tile index, so every run agrees (PLAN §2.1).
//
// Ported from the M9 design prototype (investigation/generative/proto/erode.ts).

import { MinHeap } from "../math/grid";

const D8: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export interface Drainage {
  /** The filled surface: every tile at least its spill level. */
  filled: Float64Array;
  /** The receiver of each tile (-1 for an outlet on the edge). */
  rcv: Int32Array;
  /** Tiles in the order the flood reached them (outlets first). */
  order: Int32Array;
  /** Tiles draining through each tile, itself included. */
  area: Float64Array;
}

/**
 * The priority flood. `outlet(i)` says which border tiles drain (default: all of them). With `eight`
 * (the default), water moves to all eight neighbours, else only side to side (the game's water).
 * `epsilon` raises each filled tile a little over the one it drains to, so flats drain.
 */
export function drainage(h: ArrayLike<number>, W: number, H: number, opts: { outlet?: (i: number) => boolean; eight?: boolean; epsilon?: number } = {}): Drainage {
  const N = W * H;
  const filled = new Float64Array(N);
  const rcv = new Int32Array(N).fill(-2);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  const eps = opts.epsilon ?? 0;
  const nb = opts.eight === false ? D8.slice(0, 4) : D8;
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && (!opts.outlet || opts.outlet(i))) {
      rcv[i] = -1;
      filled[i] = h[i];
      heap.push(h[i], i);
    }
  }
  let n = 0;
  while (heap.size) {
    const c = heap.pop();
    const lv = heap.lastKey;
    if (lv > filled[c]) continue;
    order[n++] = c;
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of nb) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (rcv[j] !== -2) continue;
      rcv[j] = c;
      const f = h[j] > lv + eps ? h[j] : lv + eps;
      filled[j] = f;
      heap.push(f, j);
    }
  }
  const area = new Float64Array(N).fill(1);
  for (let k = n - 1; k >= 0; k--) {
    const i = order[k];
    const r = rcv[i];
    if (r >= 0) area[r] += area[i];
  }
  return { filled, rcv, order: n === N ? order : order.slice(0, n), area };
}

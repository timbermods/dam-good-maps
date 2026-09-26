// Which way water drains over a height field (the forces' downstream guide, D203): Barnes' priority
// flood from the map's edge gives every tile its spill level and a receiver, the tile the flood
// reached it from, so any tile has a way down to an edge, across flats and out of hollows. The
// heap breaks ties by tile index, so every run agrees. Ported from the generator's prototype
// (investigation/generative/proto/erode.ts `drainage`), as the carve prototype used it.

import { MinHeap } from "../math/grid";

const D8: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

export interface Drainage {
  /** The filled surface: every tile at least its spill level. */
  filled: Float64Array;
  /** The receiver of each tile (-1 for an outlet on the edge). */
  rcv: Int32Array;
  /** Tiles in the order the flood reached them (outlets first). */
  order: Int32Array;
}

/** The priority flood over all eight neighbours, from every edge tile; `epsilon` lifts each tile a
 *  little over the one it drains to, so flats still have a downhill way. */
export function drainage(h: ArrayLike<number>, W: number, H: number, epsilon = 0): Drainage {
  const N = W * H;
  const filled = new Float64Array(N);
  const rcv = new Int32Array(N).fill(-2);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
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
    for (const [dx, dy] of D8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (rcv[j] !== -2) continue;
      rcv[j] = c;
      const f = h[j] > lv + epsilon ? h[j] : lv + epsilon;
      filled[j] = f;
      heap.push(f, j);
    }
  }
  return { filled, rcv, order: n === N ? order : order.slice(0, n) };
}

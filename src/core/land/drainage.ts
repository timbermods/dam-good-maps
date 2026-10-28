// Drainage on a height field (floats or levels): Barnes' priority flood from the map edge gives
// every tile its spill level and a receiver (the tile the flood reached it from), so water on any
// tile has a path to an edge. The erosion (field.ts), the rivers (hydro.ts), the spill levels the
// land and the outlet wear read (`edgeSpill`) and Carve's downhill guide all run on it (the water
// keeps its own, sim/prefill.ts). Exact arithmetic only; the heap breaks ties by tile index, so every
// run agrees (PLAN §2.1).
//
// Ported from the M9 design prototype (investigation/generative/proto/erode.ts).

import { MinHeap } from "../math/grid";

/** The eight directions, sides first (the order the flood takes them in, which breaks its ties). */
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];

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
  // (the same ground and outlets as a recent flood: its answer, copied; the land stage floods one
  // ground several times over, `recent`)
  const eight = opts.eight !== false;
  const eps = opts.epsilon ?? 0;
  let outlets: Uint8Array | null = null;
  if (opts.outlet) {
    outlets = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const x = i % W;
      const y = (i - x) / W;
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && opts.outlet(i)) outlets[i] = 1;
    }
  }
  const hit = recentFlood(h, W, H, eight, eps, outlets);
  if (hit) return copyOf(hit.out);
  const out = flood(h, W, H, eight, eps, outlets);
  remember({ h: Float64Array.from(h), W, H, eight, eps, outlets, out: copyOf(out) });
  return out;
}

/** A recent flood: its input and its answer. */
interface Flood {
  h: Float64Array;
  W: number;
  H: number;
  eight: boolean;
  eps: number;
  outlets: Uint8Array | null;
  out: Drainage;
}

/** The recent floods, newest first, as many as `RECENT_CELLS` tiles hold (at most `RECENT`). */
const recent: Flood[] = [];
const RECENT = 8;
const RECENT_CELLS = 4 * 256 * 256;

function copyOf(d: Drainage): Drainage {
  return { filled: d.filled.slice(), rcv: d.rcv.slice(), order: d.order.slice(), area: d.area.slice() };
}

/** The same value, telling 0 from -0 (a border tile's filled level is its height as given). */
function same(a: number, b: number): boolean {
  return a === b ? a !== 0 || 1 / a === 1 / b : false;
}

function recentFlood(h: ArrayLike<number>, W: number, H: number, eight: boolean, eps: number, outlets: Uint8Array | null): Flood | null {
  const N = W * H;
  next: for (let k = 0; k < recent.length; k++) {
    const f = recent[k];
    if (f.W !== W || f.H !== H || f.eight !== eight || !same(f.eps, eps) || !f.outlets !== !outlets || h.length !== f.h.length) continue;
    if (outlets) for (let i = 0; i < N; i++) if (outlets[i] !== f.outlets![i]) continue next;
    for (let i = 0; i < h.length; i++) if (!same(h[i], f.h[i])) continue next;
    if (k > 0) {
      recent.splice(k, 1);
      recent.unshift(f);
    }
    return f;
  }
  return null;
}

function remember(f: Flood): void {
  recent.unshift(f);
  let cells = 0;
  for (let k = 0; k < recent.length; k++) {
    cells += recent[k].W * recent[k].H;
    if (k >= RECENT || cells > RECENT_CELLS) {
      recent.length = k;
      break;
    }
  }
}

/** The flood itself (`drainage`). */
function flood(h: ArrayLike<number>, W: number, H: number, eight: boolean, eps: number, outlets: Uint8Array | null): Drainage {
  const N = W * H;
  const filled = new Float64Array(N);
  const rcv = new Int32Array(N).fill(-2);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  const K = eight ? 8 : 4;
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && (!outlets || outlets[i])) {
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
    // (the directions by index, not destructured pairs: the flood runs about twice as fast, the
    // same tiles in the same order)
    for (let k = 0; k < K; k++) {
      const xx = x + DX[k];
      const yy = y + DY[k];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (rcv[j] !== -2) continue;
      rcv[j] = c;
      const hj = h[j];
      const f = hj > lv + eps ? hj : lv + eps;
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

/**
 * The spill level of every tile on whole levels, with water moving side to side as the game's does:
 * the lowest level water standing there drains at, through the border tiles not in `noOutlet`; -1
 * where no outlet is reached. The filled surface of `drainage(…, { eight: false })`.
 */
export function edgeSpill(h: ArrayLike<number>, W: number, H: number, noOutlet: ArrayLike<number> | null = null): Int16Array {
  const { filled, rcv } = drainage(h, W, H, { eight: false, outlet: noOutlet ? (i) => !noOutlet[i] : undefined });
  const spill = new Int16Array(W * H);
  for (let i = 0; i < spill.length; i++) spill[i] = rcv[i] === -2 ? -1 : filled[i];
  return spill;
}

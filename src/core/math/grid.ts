// Grid helpers shared by the build pipeline, analysis and validation. Arrays are row-major:
// index = y * W + x, with x east and y north (the game's grid axes).

import { analyze } from "../analysis/rust/bridge";

export const N4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const N8: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const SQRT2 = Math.SQRT2;

/** Chamfer (1, √2) distance in tiles from the nearest set tile; Infinity where none. In Rust
 *  (analysis/rust/bridge.ts, D391). */
export function distanceFrom(mask: Uint8Array, W: number, H: number): Float64Array {
  return analyze("distanceFrom", W, H, [], [mask]);
}

/** `distanceFrom` in TypeScript, the same bytes: the outcomes and M9b's descriptive rows keep it (D391). */
export function distanceFromInTs(mask: Uint8Array, W: number, H: number): Float64Array {
  const d = new Float64Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0) {
        const j = i - W;
        if (d[j] + 1 < v) v = d[j] + 1;
        if (x > 0 && d[j - 1] + SQRT2 < v) v = d[j - 1] + SQRT2;
        if (x + 1 < W && d[j + 1] + SQRT2 < v) v = d[j + 1] + SQRT2;
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (v === 0) continue;
      if (x + 1 < W && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y + 1 < H) {
        const j = i + W;
        if (d[j] + 1 < v) v = d[j] + 1;
        if (x + 1 < W && d[j + 1] + SQRT2 < v) v = d[j + 1] + SQRT2;
        if (x > 0 && d[j - 1] + SQRT2 < v) v = d[j - 1] + SQRT2;
      }
      d[i] = v;
    }
  }
  return d;
}

/** Same-height regions, 4-connected. Returns labels and each region's level and size. */
export function levelRegions(h: Uint8Array, W: number, H: number): { labels: Int32Array; level: number[]; size: number[] } {
  const labels = new Int32Array(W * H).fill(-1);
  const level: number[] = [];
  const size: number[] = [];
  const queue = new Int32Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (labels[start] >= 0) continue;
    const lab = level.length;
    const lv = h[start];
    labels[start] = lab;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      const y = (i - x) / W;
      if (x + 1 < W && labels[i + 1] < 0 && h[i + 1] === lv) { labels[i + 1] = lab; queue[tail++] = i + 1; }
      if (x > 0 && labels[i - 1] < 0 && h[i - 1] === lv) { labels[i - 1] = lab; queue[tail++] = i - 1; }
      if (y + 1 < H && labels[i + W] < 0 && h[i + W] === lv) { labels[i + W] = lab; queue[tail++] = i + W; }
      if (y > 0 && labels[i - W] < 0 && h[i - W] === lv) { labels[i - W] = lab; queue[tail++] = i - W; }
    }
    level.push(lv);
    size.push(tail);
  }
  return { labels, level, size };
}

/** Binary min-heap of (key, index) pairs; ties break by index so pops are deterministic. */
export class MinHeap {
  private keys: number[] = [];
  private items: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, item: number): void {
    const keys = this.keys;
    const items = this.items;
    let i = keys.length;
    keys.push(key);
    items.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] < key || (keys[p] === key && items[p] <= item)) break;
      keys[i] = keys[p];
      items[i] = items[p];
      i = p;
    }
    keys[i] = key;
    items[i] = item;
  }

  /** Removes the smallest entry; returns its item. Read `lastKey` for its key. */
  pop(): number {
    const keys = this.keys;
    const items = this.items;
    const topItem = items[0];
    this.lastKey = keys[0];
    const key = keys.pop()!;
    const item = items.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        let c = l;
        if (r < n && (keys[r] < keys[l] || (keys[r] === keys[l] && items[r] < items[l]))) c = r;
        if (keys[c] > key || (keys[c] === key && items[c] >= item)) break;
        keys[i] = keys[c];
        items[i] = items[c];
        i = c;
      }
      keys[i] = key;
      items[i] = item;
    }
    return topItem;
  }

  lastKey = 0;
}

/** Run-length encoding of a tile set, row by row: [y, x0, x1] with x1 inclusive. Areas of
 *  features (forests, ruin fields, berry patches) are stored this way in the document. */
export type Runs = [number, number, number][];

export function tilesToRuns(tiles: readonly number[], W: number): Runs {
  const sorted = [...tiles].sort((a, b) => a - b);
  const runs: Runs = [];
  for (const t of sorted) {
    const x = t % W;
    const y = (t - x) / W;
    const last = runs[runs.length - 1];
    if (last && last[0] === y && last[2] === x - 1) last[2] = x;
    else runs.push([y, x, x]);
  }
  return runs;
}

export function runsToTiles(runs: Runs, W: number): number[] {
  const out: number[] = [];
  for (const [y, x0, x1] of runs) for (let x = x0; x <= x1; x++) out.push(y * W + x);
  return out;
}

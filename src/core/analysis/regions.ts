// Regions (PLAN §3 analysis/): connected tile sets for reachability, water bodies and ruin fields.
// Ports of prototype/analysis.py `walk_regions` and `components`; labels are assigned in index
// order, so both implementations number regions alike.

import { N4 } from "../math/grid";

/** Land walkable on foot: 4-neighbour moves between tiles of the same level, plus slope links
 *  (low tile ↔ high tile). `blocked` tiles (Thorns, Blockage, relics, ...) are never entered. */
export function walkRegions(h: Uint8Array, W: number, H: number, blocked: Uint8Array | null, links: readonly [number, number][]): Int32Array {
  const N = W * H;
  const labels = new Int32Array(N).fill(-1);
  // adjacency of the slope links, in insertion order (a CSR list)
  const count = new Int32Array(N + 1);
  for (const [a, b] of links) {
    count[a + 1]++;
    count[b + 1]++;
  }
  for (let i = 0; i < N; i++) count[i + 1] += count[i];
  const fill = count.slice(0, N);
  const adj = new Int32Array(count[N]);
  for (const [a, b] of links) {
    adj[fill[a]++] = b;
    adj[fill[b]++] = a;
  }
  const queue = new Int32Array(N);
  let lab = 0;
  for (let s = 0; s < N; s++) {
    if (labels[s] >= 0 || (blocked && blocked[s])) continue;
    labels[s] = lab;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const c = queue[head++];
      const x = c % W;
      const y = (c - x) / W;
      const hc = h[c];
      for (let k = 0; k < 4; k++) {
        let n: number;
        if (k === 0) n = y + 1 < H ? c + W : -1;
        else if (k === 1) n = y > 0 ? c - W : -1;
        else if (k === 2) n = x + 1 < W ? c + 1 : -1;
        else n = x > 0 ? c - 1 : -1;
        if (n >= 0 && labels[n] < 0 && h[n] === hc && !(blocked && blocked[n])) {
          labels[n] = lab;
          queue[tail++] = n;
        }
      }
      for (let k = count[c]; k < count[c + 1]; k++) {
        const n = adj[k];
        if (labels[n] < 0 && !(blocked && blocked[n])) {
          labels[n] = lab;
          queue[tail++] = n;
        }
      }
    }
    lab++;
  }
  return labels;
}

/** Land a colony reaches without crossing water or climbing a cliff (item 47's reachable mine
 *  sites): dry tiles 4-connected by steps of at most one level (the map's slopes, or one flight of
 *  player stairs). Labels −1 on wet tiles. */
export function landRegions(h: ArrayLike<number>, W: number, H: number, wet: ArrayLike<number>): Int32Array {
  const N = W * H;
  const labels = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  let lab = 0;
  for (let s = 0; s < N; s++) {
    if (labels[s] >= 0 || wet[s]) continue;
    labels[s] = lab;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const c = queue[head++];
      const x = c % W;
      const y = (c - x) / W;
      for (let k = 0; k < 4; k++) {
        const n = k === 0 ? (y + 1 < H ? c + W : -1) : k === 1 ? (y > 0 ? c - W : -1) : k === 2 ? (x + 1 < W ? c + 1 : -1) : x > 0 ? c - 1 : -1;
        if (n >= 0 && labels[n] < 0 && !wet[n] && Math.abs(h[n] - h[c]) <= 1) {
          labels[n] = lab;
          queue[tail++] = n;
        }
      }
    }
    lab++;
  }
  return labels;
}

/** Connected set tiles (4- or 8-connected). Labels −1 on unset tiles; sizes per label, numbered in
 *  index order of each one's first tile; `order`, every set tile as the flood reached it, one
 *  component after another (4-connected: neighbours in `N4`'s order). The one flood of a mask's
 *  components: the bodies of water (`walk.ts` `startWaterShore`, `storage.ts` `runningFlow`) and
 *  the wet systems (`story.ts` `wetSystems`) are this flood. */
export function components(mask: ArrayLike<number>, W: number, H: number, eight = false): { labels: Int32Array; sizes: number[]; order: Int32Array } {
  const N = W * H;
  const labels = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const order = new Int32Array(N);
  let tail = 0;
  for (let s = 0; s < N; s++) {
    if (!mask[s] || labels[s] >= 0) continue;
    const lab = sizes.length;
    labels[s] = lab;
    const first = tail;
    let head = tail;
    order[tail++] = s;
    while (head < tail) {
      const c = order[head++];
      const x = c % W;
      const y = (c - x) / W;
      if (!eight) {
        for (const [dx, dy] of N4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const n = yy * W + xx;
          if (mask[n] && labels[n] < 0) {
            labels[n] = lab;
            order[tail++] = n;
          }
        }
        continue;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
          const n = yy * W + xx;
          if (mask[n] && labels[n] < 0) {
            labels[n] = lab;
            order[tail++] = n;
          }
        }
      }
    }
    sizes.push(tail - first);
  }
  return { labels, sizes, order: order.subarray(0, tail) };
}

// Blob growth and seed picking for planning areas (groves, berry patches, ruin fields). Weights come
// from literal tables so the picks are the same in every engine (no Math.pow).

import type { Rng } from "../math/rng";
import { N4, N8 } from "../math/grid";

/** count^c for c in {0.8, 1.5, 2}, count 0..8 (computed once, stored as literals). */
const WEIGHTS: Record<string, number[]> = {
  "0.8": [0, 1, 1.7411011266, 2.4082246853, 3.031433133, 3.6238983184, 4.1929627126, 4.7432763938, 5.2780316431],
  "1.5": [0, 1, 2.8284271247, 5.1961524227, 8, 11.1803398875, 14.6969384567, 18.5202591775, 22.627416998],
  "2": [0, 1, 4, 9, 16, 25, 36, 49, 64],
};

/** Grow a connected blob of up to n tiles from `seed` over allowed tiles (8-connected). Frontier
 *  tiles with more blob neighbours are preferred (weight = neighbours^compactness), which keeps
 *  blobs solid with ragged edges. Returns tile indices in growth order. */
export function growBlob(rng: Rng, allowed: Uint8Array, W: number, H: number, seed: number, n: number, compactness: 0.8 | 1.5 | 2): number[] {
  const table = WEIGHTS[String(compactness)];
  const blob = new Set<number>([seed]);
  const order = [seed];
  const frontier = new Map<number, number>();
  const push = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N8) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue;
      const j = yy * W + xx;
      if (!allowed[j] || blob.has(j)) continue;
      frontier.set(j, (frontier.get(j) ?? 0) + 1);
    }
  };
  push(seed);
  while (order.length < n && frontier.size > 0) {
    let total = 0;
    for (const c of frontier.values()) total += table[Math.min(8, c)];
    let r = rng.float() * total;
    let pick = -1;
    for (const [tile, c] of frontier) {
      r -= table[Math.min(8, c)];
      if (r < 0) {
        pick = tile;
        break;
      }
    }
    if (pick < 0) pick = [...frontier.keys()].pop()!;
    frontier.delete(pick);
    blob.add(pick);
    order.push(pick);
    push(pick);
  }
  return order;
}

/** Remove about share·n interior tiles (3+ of 4 neighbours in the blob): the gaps official ruin
 *  fields have between broken columns. */
export function punchHoles(rng: Rng, tiles: number[], W: number, share: number): number[] {
  const set = new Set(tiles);
  const interior = tiles.filter((i) => {
    const x = i % W;
    let k = 0;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      if (xx < 0 || xx >= W) continue;
      if (set.has(i + dx + dy * W)) k++;
    }
    return k >= 3;
  });
  const k = Math.round(share * tiles.length);
  rng.shuffle(interior);
  for (const i of interior.slice(0, k)) set.delete(i);
  return tiles.filter((i) => set.has(i));
}

/** Up to `count` seed tiles with probability ~ weight, at least `gap` apart. */
export function pickSeeds(rng: Rng, weight: Float64Array | Uint8Array, W: number, count: number, gap: number): number[] {
  const cand: number[] = [];
  let wmax = 0;
  for (let i = 0; i < weight.length; i++) {
    if (weight[i] > 0) {
      cand.push(i);
      if (weight[i] > wmax) wmax = weight[i];
    }
  }
  if (!cand.length) return [];
  rng.shuffle(cand);
  const seeds: number[] = [];
  const g2 = gap * gap;
  for (const i of cand) {
    if (weight[i] < wmax && rng.float() >= weight[i] / wmax) continue;
    const x = i % W;
    const y = (i - x) / W;
    let ok = true;
    for (const s of seeds) {
      const sx = s % W;
      const sy = (s - sx) / W;
      if ((x - sx) * (x - sx) + (y - sy) * (y - sy) < g2) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    seeds.push(i);
    if (seeds.length >= count) break;
  }
  return seeds;
}

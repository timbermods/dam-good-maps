// Water storage near the start (`water.storage_possible`, D111: it replaces `water.reservoir`; the
// workshop study's W1 rule, investigation/WORKSHOP-INTEGRATION.md §2). Information the generator
// prefers, never a guard (D209, decisions-pending #67): engineering water is the player's job. It
// asks that the land lets the player store a drought's water near the start, not that the map holds
// its water (D152):
// 1. running water: the clean water the start's pump shore touches is part of a body fed by clean
//    sources of at least need ÷ (2 × 460) blocks per second, so it refills the colony's drought need
//    in two game days;
// 2. storage is possible within 40 tiles of the start by any one of: a straight dam whose reservoir
//    holds the need (the validator's dam sampling); natural water kept through the drought; or
//    levees: water within 40 tiles of the start, raised by a crest of 1–3 levels (never above the
//    start's own level), floods ground within 60 tiles of the start, off the map's edge, that holds
//    the need, with the levee line (where the fill would run past the 60-tile box or onto the edge
//    ring) at most a quarter of the flooded area's perimeter.
// prototype/playability.py `storage_possible` is the same rule; the oracle compares them. Ported from
// the design prototype (investigation/generative/proto/storage.ts).

import type { Emitter } from "../sim/water";

/** A game day in seconds of water flow (the simulator's day). */
export const SECONDS_PER_DAY = 460;

/** Clean strength feeding the water body that `tile` belongs to (4-connected, any depth). */
export function runningFlow(W: number, H: number, depth: ArrayLike<number>, emitters: readonly Emitter[], tile: number): number {
  const N = W * H;
  const body = new Uint8Array(N);
  const q = [tile];
  body[tile] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    const y = (i - x) / W;
    const nb = [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1];
    for (const j of nb) {
      if (j < 0 || body[j] || !(depth[j] > 0.001)) continue;
      body[j] = 1;
      q.push(j);
    }
  }
  let running = 0;
  for (const e of emitters) {
    if (e.contamination > 0 || !(e.strength > 0)) continue;
    if (e.cells.some((c) => body[c])) running += e.strength;
  }
  return running;
}

/** The most a dam and levees can hold near the start (rule 2's levees), up to `enough`. */
export function leveeStorage(h: ArrayLike<number>, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>, start: { x: number; y: number; z: number }, enough: number): number {
  const N = W * H;
  let best = 0;
  const inBox = (x: number, y: number) => Math.max(Math.abs(x - start.x), Math.abs(y - start.y)) <= 60 && x > 0 && y > 0 && x < W - 1 && y < H - 1;
  const R = new Int32Array(N).fill(-1);
  let stamp = 0;
  const seeds: number[] = [];
  for (let y = Math.max(1, start.y - 40); y <= Math.min(H - 2, start.y + 40); y += 3)
    for (let x = Math.max(1, start.x - 40); x <= Math.min(W - 2, start.x + 40); x += 3) {
      const i = y * W + x;
      if (D[i] > 0.05 && C[i] < 0.05) seeds.push(i);
    }
  const tried = new Set<string>();
  for (const s0 of seeds) {
    for (let crest = 1; crest <= 3; crest++) {
      const lambda = h[s0] + crest;
      if (lambda > start.z) break;
      stamp++;
      if (R[s0] >= 0 && tried.has(`${R[s0]}:${lambda}`)) continue;
      const q = [s0];
      R[s0] = stamp;
      let cut = 0;
      let perim = 0;
      let vol = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        const x = i % W;
        const y = (i - x) / W;
        const sfc = h[i] + D[i];
        if (lambda > sfc) vol += lambda - sfc;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (R[j] === stamp) continue;
          if (h[j] >= lambda) {
            perim++;
            continue;
          }
          if (!inBox(xx, yy)) {
            cut++;
            perim++;
            continue;
          }
          R[j] = stamp;
          q.push(j);
        }
      }
      tried.add(`${stamp}:${lambda}`);
      if (cut <= 0.25 * perim && vol > best) best = vol;
      if (best >= enough) return best;
    }
  }
  return best;
}

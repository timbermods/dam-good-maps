// Delta 1 (prototype): the start's ground drawn first. A Delta's start stands on a dry terrace with room beside the
// fan's head, the trunk's clean water at its foot and the fan's moist ground, the arms and the wet flats, below it. On
// dev the start stood 13–127 tiles from the fan's wet ground (its shallow arms are no pump's water, its lower reach
// takes the map's badwater, and the land beside it rolls: no 400-tile level ground stands there).
//
// (1) When the land is drawn, its water is planned once to find the trunk (`generate.ts`), and the place for the
// terrace is chosen beside the trunk's stretch where the fan may open (`headSite`); (2) the terrace is laid into the
// levels' field before the edge warp (`layHead`, `levels.ts`), its outline a noised blob, its rim graded to the land a
// level every two to four tiles, so the snap and the warp draw it as the land's own ground; (3) the fan opens beside it
// (`hydro.ts`: the apex is the trunk's point just below the terrace); (4) the settler is pulled onto its middle and the
// badwater kept off it (`generate.ts`).

import { distanceFrom } from "../math/grid";
import { fbm } from "../math/noise";
import { hash32 } from "../math/hash";
import { mapShape } from "./shape";
import type { Hydro } from "./hydro";

export const DELTA_HEAD = {
  /** The terrace's radius before its lobes, tiles (Easy's room reads 400 within 14 of the start's middle). */
  radius: 15,
  /** How far its lobes push its outline in or out, a share of the radius, and their noise cell. */
  lobe: 0.18,
  lobeCell: 14,
  /** Its middle `nearLo`–`nearHi` tiles past its radius from the trunk. */
  nearLo: 3,
  nearHi: 10,
  /** Planned water kept this far outside its outline. */
  waterGap: 2,
  /** The trunk's stretch it stands beside: where the fan may open (`hydro.ts`' apex band). */
  band: [0.33, 0.65] as const,
  /** The grade round it: a level every `treadLo`–`treadHi` tiles (noised), out to `grade` tiles. */
  treadLo: 2,
  treadHi: 4,
  grade: 14,
  /** The badwater's pits and gullies keep this far from its middle. */
  badKeep: 46,
} as const;

export interface HeadSite {
  x: number;
  y: number;
  level: number;
  /** The noise seed of its outline. */
  ns: number;
}

export interface DeltaHead extends HeadSite {
  /** 1 on the terrace's level ground. */
  mask: Uint8Array;
}

/** Whether a Delta of this size draws its start's terrace: square-ish maps of 128² and up (smaller and long maps keep
 *  their bytes). */
export function headWanted(theme: string, W: number, H: number): boolean {
  return theme === "delta" && Math.min(W, H) >= 128 && !mapShape(W, H).long;
}

const rOf = (ns: number, x: number, y: number) => DELTA_HEAD.radius * (1 + DELTA_HEAD.lobe * fbm(ns, x, y, DELTA_HEAD.lobeCell, 2));

/** The place for the terrace on a land whose water `pre` planned: beside the trunk's stretch where the fan may open, its
 *  outline and the gap clear of the planned water, where it moves the least ground (filling counting more than cutting).
 *  Null where the land has no trunk to an edge or no such place. */
export function headSite(h: Uint8Array, pre: Pick<Hydro, "water" | "rivers">, W: number, H: number, seed: number): HeadSite | null {
  const main = pre.rivers.find((r) => r.role === "river/main");
  if (!main || !("edge" in main.params.exit)) return null;
  const N = W * H;
  const P = DELTA_HEAD;
  const R = P.radius;
  const path = main.params.path;
  const trunk = new Uint8Array(N);
  const k0 = Math.floor(P.band[0] * (path.length - 1));
  const k1 = Math.ceil(P.band[1] * (path.length - 1));
  for (let k = k0; k <= k1; k++) {
    const x = Math.round(path[k][0]);
    const y = Math.round(path[k][1]);
    if (x >= 0 && y >= 0 && x < W && y < H) trunk[y * W + x] = 1;
  }
  const dTrunk = distanceFrom(trunk, W, H);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (pre.water[i] === 1 || pre.water[i] === 2) wet[i] = 1;
  const dWater = distanceFrom(wet, W, H);
  // (the bed of the planned water nearest each tile: the terrace a level over its banks, a pump on its shore reaching it)
  const bedNear = new Int32Array(N).fill(-1);
  {
    const q: number[] = [];
    const seen = new Float64Array(N).fill(Infinity);
    for (let i = 0; i < N; i++)
      if (wet[i]) {
        bedNear[i] = h[i];
        seen[i] = 0;
        q.push(i);
      }
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (seen[j] > seen[i] + 1) {
            seen[j] = seen[i] + 1;
            bedNear[j] = bedNear[i];
            q.push(j);
          } else if (seen[j] === seen[i] + 1 && bedNear[i] < bedNear[j]) bedNear[j] = bedNear[i];
        }
    }
  }
  const ns = hash32(seed, "delta-head");
  const edge = R + Math.max(8, Math.round(Math.min(W, H) * 0.08));
  const reach = Math.ceil(R * (1 + P.lobe));
  let best = -1;
  let bestCost = Infinity;
  for (let cy = edge; cy < H - edge; cy++)
    for (let cx = edge; cx < W - edge; cx++) {
      const c = cy * W + cx;
      if (dTrunk[c] < R + P.nearLo || dTrunk[c] > R + P.nearHi || bedNear[c] < 0) continue;
      if (dWater[c] < R * (1 - P.lobe) + P.waterGap) continue;
      const level = bedNear[c] + 2;
      let cost = 0;
      let clear = true;
      for (let dy = -reach; dy <= reach && clear; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const r = rOf(ns, x, y);
          if (dx * dx + dy * dy > r * r) continue;
          const i = y * W + x;
          if (dWater[i] < P.waterGap) {
            clear = false;
            break;
          }
          cost += h[i] < level ? 1.5 * (level - h[i]) : h[i] - level;
        }
      if (!clear) continue;
      if (cost < bestCost || (cost === bestCost && c < best)) {
        bestCost = cost;
        best = c;
      }
    }
  if (best < 0) return null;
  const x = best % W;
  return { x, y: (best - x) / W, level: bedNear[best] + 2, ns };
}

/** Lays the terrace into the levels' field (before the edge warp and the rounding): its outline at its level, the land
 *  round it graded toward it a level every two to four tiles, raised or cut. */
export function layHead(level: Float64Array, site: HeadSite, W: number, H: number): void {
  const N = W * H;
  const P = DELTA_HEAD;
  const reach = Math.ceil(P.radius * (1 + P.lobe));
  const inside = new Uint8Array(N);
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const x = site.x + dx;
      const y = site.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const r = rOf(site.ns, x, y);
      if (dx * dx + dy * dy <= r * r) inside[y * W + x] = 1;
    }
  const d = distanceFrom(inside, W, H);
  for (let i = 0; i < N; i++) {
    if (inside[i]) {
      level[i] = site.level;
      continue;
    }
    if (d[i] > P.grade) continue;
    const x = i % W;
    const y = (i - x) / W;
    const tread = P.treadLo + ((P.treadHi - P.treadLo) * (fbm(site.ns + 7, x, y, 10, 2) + 1)) / 2;
    const k = d[i] / tread;
    if (level[i] < site.level - k) level[i] = site.level - k;
    else if (level[i] > site.level + k) level[i] = site.level + k;
  }
}

/** The terrace on the land as drawn (`h`, levels): its outline's tiles at its level. */
export function headOf(h: Uint8Array, site: HeadSite, W: number, H: number): DeltaHead {
  const mask = new Uint8Array(W * H);
  const reach = Math.ceil(DELTA_HEAD.radius * (1 + DELTA_HEAD.lobe));
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const x = site.x + dx;
      const y = site.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const r = rOf(site.ns, x, y);
      const i = y * W + x;
      if (dx * dx + dy * dy <= r * r && h[i] === site.level) mask[i] = 1;
    }
  return { ...site, mask };
}

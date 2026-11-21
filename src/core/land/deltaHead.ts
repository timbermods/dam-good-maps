// D549: a Delta's start stands on a dry terrace with room on the trunk's bank, just above where the fan opens: the
// trunk's clean water at its foot, a pump on its bank reaching it, and the fan's arms, its moist ground and its wet flats
// opening below it. On 0.10.56 the start stood 13–127 tiles from the fan's wet ground: nothing pulled it there, the
// fan's shallow arms are no pump's water, its lower reach took the map's badwater, and the land beside it rolls.
//
// (1) Once the water is planned (`generate.ts` `planLandStage`), the place for the terrace is chosen on the trunk's bank
// above the fan's head (`headSite`): its outline meets the trunk's channel, or a lake on it the land holds, keeps off
// every other water, on the land joined without stairs, where the water planned at its foot passes the settler's shore
// rule (`settler.ts` `shoreWalkFrom`: 0.35 deep, its surface 0.05–1.9 levels under the bank), moving the least ground
// nearest the fan's head. (2) It is cut into the land there (`cutHead`): its lobed outline levelled, the ground behind
// it graded down to it a level every two to four tiles (noised), never raised but where the terrace itself is filled,
// so it reads as a bench the river left in its valley side; a staircase climbs the grade each way it faces, a slope on
// every step (`headStairs`). (3) Once the land has settled, a terrace whose foot's water stands lower than the rule is
// cut down to it (`refitHead`). (4) The settler takes it as its start (`generate.ts` `settlerOn`, as a sea's start takes
// its island), anywhere else only where no place on it passes. (5) The badwater keeps off it: its pits and gullies
// `badKeep` tiles from its middle, its join to the main water (D476, D498) off the stretch round it (`joinOffHead`).

import { distanceFrom } from "../math/grid";
import { landRegions } from "../analysis/regions";
import { fbm } from "../math/noise";
import { hash32 } from "../math/hash";
import { mapShape } from "./shape";
import { drainage } from "./drainage";
import type { Hydro } from "./hydro";

export const DELTA_HEAD = {
  /** The terrace's radius before its lobes, tiles: its level ground holds the start's bench (D515's `start.level_land`,
   *  704 with the settler's margin) and Easy's room (400 within 14 of the start's middle). */
  radius: 20,
  /** How far its lobes push its outline in or out, a share of the radius, and their noise cell. */
  lobe: 0.18,
  lobeCell: 14,
  /** Water other than the trunk's kept this far outside its outline (its outline cut back from it), and its middle
   *  `core` tiles from it; its ground `least` tiles at the least. */
  waterGap: 3,
  core: 8,
  least: 820,
  /** The land joined without stairs it stands on, a share of the largest such piece at the least; and of the largest
   *  such piece any place that passes stands on, so it takes the bank with more reach (D549 (7)). */
  joined: 0.8,
  bankNear: 0.9,
  /** Its tiles within a tile and a half of the trunk's channel, at the least: its bank on the trunk. */
  touch: 8,
  /** How far up the trunk from the fan's head its outline may meet the trunk, in radii. */
  upstream: 4,
  /** Each tile of the trunk between where it meets the trunk and the fan's head costs this many levels moved. */
  apexPull: 3,
  /** Its level: the trunk's surface planned at its foot about `under` levels under it, all of it `shoreUnder`–
   *  `shoreReach` under (the settler's shore rule, `settler.ts` `SHORE_*`), `touch` of its tiles' water at least
   *  `shoreDepth` deep. */
  under: 0.5,
  shoreDepth: 0.35,
  shoreUnder: 0.05,
  shoreReach: 1.9,
  /** The ground behind it: a level every `treadLo`–`treadHi` tiles (noised), out to `grade` tiles, cut only. */
  treadLo: 2,
  treadHi: 4,
  grade: 14,
  /** The most levels it is cut down once the land has settled (`refitHead`): a terrace whose foot's water stands
   *  further under is a pit in its valley side, not a bench, and the settler stands elsewhere. */
  refitMost: 1,
  /** The share of its level ground the settled water may lie on (round 3): more, and the settled water's place is taken. */
  wetMost: 0.05,
  /** The badwater's pits and gullies, and its join to the main water, keep this far from its middle. */
  badKeep: 46,
} as const;

export interface HeadSite {
  x: number;
  y: number;
  level: number;
  /** The noise seed of its outline. */
  ns: number;
  /** 1 on its outline's ground, clear of every water but the trunk's. */
  tiles: Uint8Array;
  /** The land joined without stairs it stands on (`landRegions`), tiles: its bank. */
  bank?: number;
  /** The ground its cut changed, `[tile, before, after]` in a row (`cutHead`), so a terrace moved leaves no trace. */
  undo?: Int32Array;
  /** Its staircases' steps (`headStairs`), taken off the ramps when it moves. */
  stairs?: [number, number][];
}

export interface DeltaHead extends HeadSite {
  /** 1 on the terrace's level ground. */
  mask: Uint8Array;
}

/** Whether a Delta of this size has its start's terrace: square-ish maps of 128² and up (smaller and long maps keep
 *  their bytes). */
export function headWanted(theme: string, W: number, H: number): boolean {
  return theme === "delta" && Math.min(W, H) >= 128 && !mapShape(W, H).long;
}

const rOf = (ns: number, x: number, y: number) => DELTA_HEAD.radius * (1 + DELTA_HEAD.lobe * fbm(ns, x, y, DELTA_HEAD.lobeCell, 2));

type Pt = readonly [number, number];

/** Marks the tiles within `r` of the points `k0`–`k1` of a course. */
function markAlong(pts: readonly Pt[], k0: number, k1: number, r: number, into: Uint8Array, W: number, H: number): void {
  const rr = Math.ceil(r);
  for (let k = Math.max(0, k0); k <= Math.min(pts.length - 1, k1); k++) {
    const px = pts[k][0];
    const py = pts[k][1];
    for (let y = Math.max(0, Math.round(py) - rr); y <= Math.min(H - 1, Math.round(py) + rr); y++)
      for (let x = Math.max(0, Math.round(px) - rr); x <= Math.min(W - 1, Math.round(px) + rr); x++) if ((x - px) * (x - px) + (y - py) * (y - py) <= r * r) into[y * W + x] = 1;
  }
}

/** The place for the terrace on a land whose water `hy` planned (`h` with its courses cut, `est` the water planned on
 *  it, `generate.ts` `plannedWater`): see the head of this file. Null where the land has no fan, or no such place. */
export function headSite(h: Uint8Array, hy: Pick<Hydro, "water" | "rivers" | "arms">, est: ArrayLike<number>, held: ArrayLike<number>, W: number, H: number, seed: number, settled: { depth: ArrayLike<number>; contamination: ArrayLike<number> } | null = null): HeadSite | null {
  const main = hy.rivers.find((r) => r.role === "river/main");
  const mouths = hy.arms.filter((a) => a.kind === "mouth" && a.river === main?.id);
  if (!main || !("edge" in main.params.exit) || !mouths.length) return null;
  const N = W * H;
  const P = DELTA_HEAD;
  const R = P.radius;
  const path = main.params.path;
  // (the fan's head: the point of the main river's course nearest where its arms leave it)
  const [ax, ay] = mouths[0].path[0];
  let kApex = 0;
  for (let k = 1, bd = Infinity; k < path.length; k++) {
    const d = (path[k][0] - ax) * (path[k][0] - ax) + (path[k][1] - ay) * (path[k][1] - ay);
    if (d < bd) {
      bd = d;
      kApex = k;
    }
  }
  const half = main.params.width / 2 + 1.5;
  // (the water: as planned, or as settled (round 3, D549 (7)), any tile 0.05 deep)
  const wetAt = (i: number) => (settled ? settled.depth[i] > 0.001 || hy.water[i] === 1 || hy.water[i] === 2 : hy.water[i] === 1 || hy.water[i] === 2);
  // (the trunk's water along the stretch above the head, its channel or a lake it runs through)
  const trunk = new Uint8Array(N);
  const upTo = Math.max(0, kApex - Math.round(P.upstream * R));
  markAlong(path, upTo, kApex, half + (settled ? 1.5 : 0), trunk, W, H);
  for (let i = 0; i < N; i++) if (!wetAt(i)) trunk[i] = 0;
  const course = new Uint8Array(N);
  markAlong(path, 0, kApex, half + (settled ? 2.5 : 1), course, W, H);
  // (a lake the trunk runs through there is the trunk's water, all of it)
  // (on the settled water, the water joined to the trunk's within a radius of its stretch)
  const near = settled ? new Uint8Array(N) : null;
  if (near) markAlong(path, upTo, kApex, half + R, near, W, H);
  {
    const q: number[] = [];
    for (let i = 0; i < N; i++) if (trunk[i] && (settled || hy.water[i] === 2)) q.push(i);
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      course[i] = 1;
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || trunk[j] || (near ? !near[j] || !wetAt(j) : hy.water[j] !== 2)) continue;
        trunk[j] = 1;
        q.push(j);
      }
    }
  }
  const other = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (wetAt(i) && !course[i]) other[i] = 1;
  const dOther = distanceFrom(other, W, H);
  // (the water at the terrace's foot: the trunk's channel, as planned, or a lake on it where the land as it stands
  // holds it (`held`, `generate.ts` `plannedWater`), at the surface it holds; a lake the land doesn't hold is no one's
  // water)
  const chan = new Uint8Array(N);
  const surf = new Float64Array(N);
  const deepAt = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!trunk[i]) continue;
    const d = settled ? settled.depth[i] : hy.water[i] === 1 ? est[i] : held[i];
    if (!settled && hy.water[i] !== 1 && !(d >= P.shoreDepth)) continue;
    chan[i] = 1;
    surf[i] = h[i] + d;
    if (d >= P.shoreDepth) deepAt[i] = 1;
  }
  const dTrunk = distanceFrom(chan, W, H);
  // (each trunk tile's distance above the head, in points of the course)
  const above = new Float64Array(N).fill(Infinity);
  for (let k = upTo; k <= kApex; k++) {
    const px = Math.round(path[k][0]);
    const py = Math.round(path[k][1]);
    for (let y = Math.max(0, py - 3); y <= Math.min(H - 1, py + 3); y++)
      for (let x = Math.max(0, px - 3); x <= Math.min(W - 1, px + 3); x++) if (chan[y * W + x]) above[y * W + x] = Math.min(above[y * W + x], kApex - k);
  }
  // (the land joined without stairs, D515's reach: the terrace stands on the largest piece of it, or one nearly as
  // large, so the start's walk is the land's)
  const wetAll = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (wetAt(i)) wetAll[i] = 1;
  const lab = landRegions(h, W, H, wetAll);
  const size: number[] = [];
  for (let i = 0; i < N; i++) if (lab[i] >= 0) size[lab[i]] = (size[lab[i]] ?? 0) + 1;
  let largest = 0;
  for (const n of size) if (n > largest) largest = n;
  // (on the settled water, the badwater kept `badKeep` / 2 from its middle: none in its foot's water or its view)
  let dBad: Float64Array | null = null;
  if (settled) {
    const bad = new Uint8Array(N);
    let any = false;
    for (let i = 0; i < N; i++)
      if (settled.depth[i] > 0.05 && settled.contamination[i] > 0.05) {
        bad[i] = 1;
        any = true;
      }
    if (any) dBad = distanceFrom(bad, W, H);
  }
  const ns = hash32(seed, "delta-head");
  const reach = Math.ceil(R * (1 + P.lobe));
  const edge = reach + 3;
  const rField = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rField[y * W + x] = rOf(ns, x, y);
  // (every place that passes, its cost and its bank; the bank with more reach first: D549 (7))
  const passing: { c: number; cost: number; level: number; bank: number }[] = [];
  const tiles: number[] = [];
  const count = new Map<number, number>();
  for (let cy = edge; cy < H - edge; cy++)
    for (let cx = edge; cx < W - edge; cx++) {
      const c = cy * W + cx;
      if (dTrunk[c] < R * (1 - P.lobe) - 2 || dTrunk[c] > reach + 1) continue;
      if (dOther[c] < P.core) continue;
      if (dBad && dBad[c] < P.badKeep / 2) continue;
      // (its tiles: the lobed disc's ground, clear of other water by the gap; where it meets the trunk, the trunk's
      // surface there, its depth, and how far above the fan's head)
      let lo = Infinity;
      let hi = -Infinity;
      let up = Infinity;
      let deep = 0;
      let touch = 0;
      let lakeHi = -Infinity;
      tiles.length = 0;
      count.clear();
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          const i = c + dy * W + dx;
          if (dx * dx + dy * dy > rField[i] * rField[i] || dOther[i] < P.waterGap || wetAt(i)) continue;
          tiles.push(i);
          if (lab[i] >= 0) count.set(lab[i], (count.get(lab[i]) ?? 0) + 1);
          for (const j of [i - 1, i + 1, i - W, i + W]) if (trunk[j] && !chan[j] && held[j] > 0.001) lakeHi = Math.max(lakeHi, h[j] + held[j]);
          if (dTrunk[i] > 1.5) continue;
          touch++;
          for (const j of [i - 1, i + 1, i - W, i + W]) {
            if (!chan[j]) continue;
            const sf = surf[j];
            lo = Math.min(lo, sf);
            hi = Math.max(hi, sf);
            up = Math.min(up, above[j]);
            if (deepAt[j]) deep++;
          }
        }
      if (tiles.length < P.least) continue;
      // (its bank: the land joined without stairs most of its ground stands on)
      let most = 0;
      let bank = 0;
      for (const [l, n] of count)
        if (n > most) {
          most = n;
          bank = size[l];
        }
      if (bank < P.joined * largest) continue;
      if (touch < P.touch) continue;
      if (deep < P.touch) continue;
      // (its level: the trunk's surface at its foot about `under` levels under it, the whole of it in the shore's band)
      const level = Math.ceil(hi + P.under);
      if (lo < level - P.shoreReach || hi > level - P.shoreUnder || lakeHi > level - P.shoreUnder) continue;
      let cost = P.apexPull * (up < Infinity ? up : P.upstream * R);
      for (const i of tiles) cost += h[i] < level ? 1.5 * (level - h[i]) : h[i] - level;
      passing.push({ c, cost, level, bank });
    }
  let bankMost = 0;
  for (const p of passing) bankMost = Math.max(bankMost, p.bank);
  let best = -1;
  let bestCost = Infinity;
  let bestLevel = 0;
  let bestBank = 0;
  for (const p of passing)
    if (p.bank >= P.bankNear * bankMost && (p.cost < bestCost || (p.cost === bestCost && p.c < best))) {
      bestCost = p.cost;
      best = p.c;
      bestLevel = p.level;
      bestBank = p.bank;
    }
  if (best < 0) return null;
  const x = best % W;
  const y = (best - x) / W;
  const mask = new Uint8Array(N);
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++) {
      const i = best + dy * W + dx;
          if (dx * dx + dy * dy <= rField[i] * rField[i] && dOther[i] >= P.waterGap && !wetAt(i)) mask[i] = 1;
    }
  return { x, y, level: bestLevel, ns, tiles: mask, bank: bestBank };
}

/** Cuts the terrace into the land: its outline's ground (not its water) at its level, filled or cut; the ground behind
 *  it within `grade` tiles cut to rise from it a level every two to four tiles (noised), never raised, and the ground
 *  within `waterGap` of the water left as it is. */
export function cutHead(h: Uint8Array, water: Uint8Array, site: HeadSite, W: number, H: number, depth: ArrayLike<number> | null = null): Int32Array {
  const N = W * H;
  const P = DELTA_HEAD;
  const reach = Math.ceil(P.radius * (1 + P.lobe));
  const inside = site.tiles;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (water[i] === 1 || water[i] === 2) wet[i] = 1;
  const dWet = distanceFrom(wet, W, H);
  const d = distanceFrom(inside, W, H);
  const span = reach + P.grade + 1;
  const undo: number[] = [];
  // (round 3: with the water's depth, the ground behind is never cut under `shoreUnder` above water within three tiles,
  // so no water held behind it runs down onto it)
  const under = (x: number, y: number): number => {
    if (!depth) return -Infinity;
    let m = -Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const j = (y + dy) * W + x + dx;
        if (wet[j] && h[j] + depth[j] > m) m = h[j] + depth[j];
      }
    return Math.ceil(m + P.shoreUnder);
  };
  for (let y = Math.max(0, site.y - span); y <= Math.min(H - 1, site.y + span); y++)
    for (let x = Math.max(0, site.x - span); x <= Math.min(W - 1, site.x + span); x++) {
      const i = y * W + x;
      if (inside[i]) {
        if (h[i] !== site.level) undo.push(i, h[i], site.level);
        h[i] = site.level;
        continue;
      }
      if (wet[i] || d[i] > P.grade || dWet[i] < P.waterGap) continue;
      const tread = P.treadLo + ((P.treadHi - P.treadLo) * (fbm(site.ns + 7, x, y, 10, 2) + 1)) / 2;
      const most = Math.max(site.level + Math.floor(d[i] / tread), under(x, y));
      if (h[i] > most) {
        undo.push(i, h[i], most);
        h[i] = most;
      }
    }
  return Int32Array.from(undo);
}

/** The land with a terrace's cut taken back (`undo`): each tile its cut changed, where it still stands as cut. */
export function uncutHead(h: Uint8Array, undo: Int32Array): void {
  for (let k = 0; k < undo.length; k += 3) if (h[undo[k]] === undo[k + 2]) h[undo[k]] = undo[k + 1];
}

/** The share of its level ground the water `depth` lies on. */
export function headWet(depth: ArrayLike<number>, head: { mask: Uint8Array }): number {
  let n = 0;
  let wet = 0;
  for (let i = 0; i < head.mask.length; i++) {
    if (!head.mask[i]) continue;
    n++;
    if (depth[i] > 0.001) wet++;
  }
  return n ? wet / n : 1;
}

/** Its foot's tiles whose water, `shoreDepth` deep, stands in the shore rule's band under it on `depth` (the settled
 *  water): `touch` of them and the terrace serves its start. */
export function headServed(h: ArrayLike<number>, depth: ArrayLike<number>, head: DeltaHead, W: number, H: number): number {
  const N = W * H;
  const P = DELTA_HEAD;
  let served = 0;
  for (let i = 0; i < N; i++) {
    if (!head.mask[i]) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || head.mask[j] || depth[j] < P.shoreDepth) continue;
      const sf = h[j] + depth[j];
      if (sf >= head.level - P.shoreReach && sf <= head.level - P.shoreUnder) served++;
    }
  }
  return served;
}

/** The terrace on the land as it stands (`h`): its tiles at its level. */
export function headOf(h: Uint8Array, site: HeadSite, W: number, H: number): DeltaHead {
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (site.tiles[i] && h[i] === site.level) mask[i] = 1;
  return { ...site, mask };
}

/** The terrace brought down to the water its foot holds once the land has settled (D549 (5)): where the settled
 *  water beside it, `shoreDepth` deep, stands more than `shoreReach` under it (a lake the plan held drained, a river
 *  lower than planned), it and the ground behind it are cut down to the least level that keeps every such water's
 *  surface `shoreUnder` under it, where fewer than `touch` of its foot's tiles pass the rule as it stands. Only dry ground over every water beside it is cut, so the water stays as it settled;
 *  a tile that would sink under water beside it stays. Null where nothing is cut: no water at its foot, or none lower
 *  than the rule. */
export function refitHead(h: Uint8Array, depth: ArrayLike<number>, head: DeltaHead, W: number, H: number): DeltaHead | null {
  const N = W * H;
  const P = DELTA_HEAD;
  let lo = Infinity;
  let hi = -Infinity;
  let served = 0;
  for (let i = 0; i < N; i++) {
    if (!head.mask[i]) continue;
    const x = i % W;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
      if (j < 0 || j >= N || head.mask[j] || depth[j] < P.shoreDepth) continue;
      const sf = h[j] + depth[j];
      lo = Math.min(lo, sf);
      hi = Math.max(hi, sf);
      if (sf >= head.level - P.shoreReach && sf <= head.level - P.shoreUnder) served++;
    }
  }
  // (none, or its foot's water already in the rule's band along `touch` tiles: it stays)
  if (!(lo < Infinity) || served >= P.touch) return null;
  const level = Math.ceil(hi + P.shoreUnder);
  if (level >= head.level || level < head.level - P.refitMost || lo < level - P.shoreReach) return null;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (depth[i] > 0.001) wet[i] = 1;
  const d = distanceFrom(head.mask, W, H);
  const reach = Math.ceil(P.radius * (1 + P.lobe));
  const span = reach + P.grade + 1;
  const was = new Map<number, number>();
  for (let y = Math.max(0, head.y - span); y <= Math.min(H - 1, head.y + span); y++)
    for (let x = Math.max(0, head.x - span); x <= Math.min(W - 1, head.x + span); x++) {
      const i = y * W + x;
      if (wet[i] || d[i] > P.grade) continue;
      const tread = P.treadLo + ((P.treadHi - P.treadLo) * (fbm(head.ns + 7, x, y, 10, 2) + 1)) / 2;
      const most = head.mask[i] ? level : level + Math.floor(d[i] / tread);
      if (h[i] > most) {
        was.set(i, h[i]);
        h[i] = most;
      }
    }
  // (a cut tile under the surface of water beside it goes back, until none is: raising dry ground never lets water in)
  for (let changed = true; changed; ) {
    changed = false;
    for (const [i, old] of was) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || !wet[j] || h[j] + depth[j] <= h[i] - P.shoreUnder) continue;
        h[i] = old;
        was.delete(i);
        changed = true;
        break;
      }
    }
  }
  if (!was.size) return null;
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (head.tiles[i] && h[i] === level) mask[i] = 1;
  return { ...head, level, mask };
}

/** The terrace's stairs (D549 (6)): its graded ground rises a level every few tiles, nearer together than the derived
 *  slopes stand (`features/slopes.ts`, 12 apart), so it is given its own staircases as a natural ramp is, a slope on
 *  every step (`[low, high]` pairs, `generate.ts` `standingSteps`): up to one each way it faces, straight up the grade
 *  from its edge to the land past it, the one nearest its middle line where several climb the whole way. */
export function headStairs(h: ArrayLike<number>, wet: ArrayLike<number>, head: DeltaHead, W: number, H: number): [number, number][] {
  const N = W * H;
  const P = DELTA_HEAD;
  const d = distanceFrom(head.mask, W, H);
  const out: [number, number][] = [];
  const reach = Math.ceil(P.radius * (1 + P.lobe));
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    let best: [number, number][] | null = null;
    let bestOff = Infinity;
    for (let off = -reach; off <= reach; off++) {
      if (Math.abs(off) >= bestOff) continue;
      // (the terrace's last tile along this line, from its middle outward)
      let x = head.x + (dx ? 0 : off);
      let y = head.y + (dy ? 0 : off);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || !head.mask[y * W + x]) continue;
      while (x + dx > 0 && y + dy > 0 && x + dx < W - 1 && y + dy < H - 1 && head.mask[(y + dy) * W + x + dx]) {
        x += dx;
        y += dy;
      }
      const steps: [number, number][] = [];
      let ok = false;
      for (let k = 0; k < P.grade + 12; k++) {
        const c = y * W + x;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) break;
        const n = ny * W + nx;
        if (wet[n]) break;
        if (h[n] === h[c]) {
          if (d[n] > P.grade) {
            ok = steps.length > 0;
            break;
          }
        } else if (h[n] === h[c] + 1 && h[c - dy * W - dx] === h[c] && !(steps.length && steps[steps.length - 1][0] === c)) steps.push([c, n]);
        // (ground the grade left lower, a step down: its slope on the low tile, facing back up)
        else if (h[n] === h[c] - 1 && nx + dx > 0 && ny + dy > 0 && nx + dx < W - 1 && ny + dy < H - 1 && h[n + dy * W + dx] === h[n] && !wet[n + dy * W + dx] && !(steps.length && steps[steps.length - 1][0] === c)) steps.push([n, c]);
        else break;
        x = nx;
        y = ny;
      }
      if (ok && N > 0) {
        best = steps;
        bestOff = Math.abs(off);
      }
    }
    if (best) out.push(...best);
  }
  return out;
}

/** What the settler keeps off to stand on the terrace (`generate.ts` `settlerOn`): what it keeps off anyway, and every
 *  tile but the terrace's level ground. */
export function offHead(head: { mask: Uint8Array }, avoid: Uint8Array | null, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = head.mask[i] && !(avoid && avoid[i]) ? 0 : 1;
  return out;
}

/** The badwater's join (`hazards.ts` `joinReach`) on a Delta with the start's terrace: the main water's lower reach but
 *  the stretch within `badKeep` of the terrace's middle, below it where the fan opens. */
export function joinOffHead(join: Uint8Array, head: { x: number; y: number }, W: number, H: number): Uint8Array {
  const out = join.slice();
  const r = DELTA_HEAD.badKeep;
  for (let y = Math.max(0, head.y - r); y <= Math.min(H - 1, head.y + r); y++)
    for (let x = Math.max(0, head.x - r); x <= Math.min(W - 1, head.x + r); x++) if ((x - head.x) * (x - head.x) + (y - head.y) * (y - head.y) <= r * r) out[y * W + x] = 0;
  return out;
}

/** D549 (8): a Delta's banks grown, not ruled (round 3): where the land stands sheer over its water (a crater lake's
 *  walls, Delta 256² seed 2; a lake planned on the trunk deeper than its land holds, drained to a pit, seed 5), the ground
 *  is cut to rise from the water a level every `treadLo`–`treadHi` tiles (noised over `cell`), from `over` above the
 *  water's surface, the least such rise from any water, until it meets the land (`grade` tiles at the most), so no cut
 *  ends in a wall; gentler ground is left as it is. Cut only, never under `over` above water within two tiles, nor above
 *  a pool of `pool` tiles or more the land holds within `guard` but on its own banks (so no rim is lowered under the
 *  water it holds), and never raised. */
export const GROWN_BANKS = { grade: 48, guard: 14, treadLo: 1.2, treadHi: 2.6, over: 0.6, cell: 9, pool: 12 } as const;

/** Grows the banks (`GROWN_BANKS`) on `h` beside the water `water` plans (1 its channels, 2 its lakes) at the depth
 *  `est` (`generate.ts` `plannedWater`). Returns the tiles cut. */
export function growBanks(h: Uint8Array, water: ArrayLike<number>, est: ArrayLike<number>, W: number, H: number, seed: number): number {
  const N = W * H;
  const P = GROWN_BANKS;
  // (the water: the channels at their planned depth, and a lake's tiles where the land holds it, at the level it fills
  // to, or its bed, its lowest tiles, where a river runs through a lake planned deeper than its land holds)
  const filled = drainage(h, W, H, { eight: false }).filled;
  const lid = new Int32Array(N).fill(-1);
  const bed = new Float64Array(N).fill(Infinity);
  {
    const seen = new Uint8Array(N);
    let lakes = 0;
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || water[s0] !== 2) continue;
      const pool = [s0];
      seen[s0] = 1;
      let lo = h[s0];
      for (let k = 0; k < pool.length; k++) {
        const c = pool[k];
        const x = c % W;
        for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
          if (n < 0 || n >= N || seen[n] || water[n] !== 2) continue;
          seen[n] = 1;
          pool.push(n);
          if (h[n] < lo) lo = h[n];
        }
      }
      for (const c of pool) {
        bed[c] = lo;
        lid[c] = lakes;
      }
      lakes++;
    }
  }
  const wet = new Uint8Array(N);
  const surf = new Float64Array(N).fill(-Infinity);
  for (let i = 0; i < N; i++) {
    if (water[i] === 1) surf[i] = h[i] + Math.max(0, est[i]);
    else if (water[i] === 2 && (filled[i] > h[i] + 0.05 || h[i] <= bed[i])) surf[i] = Math.max(filled[i], h[i] + P.over);
    else continue;
    wet[i] = 1;
  }
  // (the least rise from any water: each tile's height allowed, from `over` above a water's surface, a level more every
  // tread walked, a step's length over the tread where it is (Dijkstra over the eight neighbours); `from`, the lake the
  // least rise climbs from)
  const ns = hash32(seed, "delta-banks");
  const cost = new Float64Array(N).fill(Infinity);
  const walked = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const tread = new Float64Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tread[y * W + x] = P.treadLo + ((P.treadHi - P.treadLo) * (fbm(ns, x, y, P.cell, 2) + 1)) / 2;
  const heap: number[] = [];
  const less = (a: number, b: number) => cost[a] < cost[b] || (cost[a] === cost[b] && a < b);
  const push = (i: number) => {
    heap.push(i);
    for (let k = heap.length - 1; k > 0; ) {
      const p = (k - 1) >> 1;
      if (!less(heap[k], heap[p])) break;
      [heap[k], heap[p]] = [heap[p], heap[k]];
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const a = 2 * k + 1;
        const b = a + 1;
        let m = k;
        if (a < heap.length && less(heap[a], heap[m])) m = a;
        if (b < heap.length && less(heap[b], heap[m])) m = b;
        if (m === k) break;
        [heap[k], heap[m]] = [heap[m], heap[k]];
        k = m;
      }
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    if (!wet[i]) continue;
    cost[i] = Math.ceil(surf[i] + P.over) - 1 / tread[i];
    walked[i] = 0;
    from[i] = lid[i];
    push(i);
  }
  const done = new Uint8Array(N);
  while (heap.length) {
    const c = pop();
    if (done[c]) continue;
    done[c] = 1;
    if (walked[c] >= P.grade) continue;
    const x = c % W;
    const y = (c - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const n = c + dy * W + dx;
        if (wet[n] || done[n]) continue;
        const len = dx && dy ? Math.SQRT2 : 1;
        const v = cost[c] + len / tread[n];
        if (v < cost[n]) {
          cost[n] = v;
          walked[n] = walked[c] + len;
          from[n] = from[c];
          push(n);
        }
      }
  }
  // (every pool of `pool` tiles or more the land holds keeps the ground within `guard` of it over its surface, but where
  // that ground is its own lake's bank)
  const R = P.guard;
  const floor = new Float64Array(N).fill(-Infinity);
  {
    const seen = new Uint8Array(N);
    const at = new Int32Array(N).fill(-1);
    let mark = 0;
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || water[s0] !== 2 || !(filled[s0] > h[s0] + 0.05)) continue;
      const pool = [s0];
      seen[s0] = 1;
      for (let k = 0; k < pool.length; k++) {
        const c = pool[k];
        const x = c % W;
        for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
          if (n < 0 || n >= N || seen[n] || water[n] !== 2 || !(filled[n] > h[n] + 0.05) || filled[n] !== filled[s0]) continue;
          seen[n] = 1;
          pool.push(n);
        }
      }
      if (pool.length < P.pool) continue;
      const top = filled[s0];
      const own = lid[s0];
      mark++;
      const base = mark * (R + 2);
      const ring = pool.slice();
      for (const c of ring) at[c] = base;
      for (let r = 0; r < ring.length; r++) {
        const c = ring[r];
        if (from[c] !== own && top > floor[c]) floor[c] = top;
        const sc = at[c] - base;
        if (sc >= R) continue;
        const x = c % W;
        for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
          if (n < 0 || n >= N || (at[n] >= base && at[n] < base + R + 2)) continue;
          at[n] = base + sc + 1;
          ring.push(n);
        }
      }
    }
  }
  let cut = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (wet[i] || !(cost[i] < Infinity)) continue;
      // (water within two tiles stays under the bank)
      let close = -Infinity;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
          const j = i + dy * W + dx;
          if (wet[j] && surf[j] > close) close = surf[j];
        }
      const cap = Math.max(Math.floor(cost[i]), Math.ceil(close + P.over), Math.ceil(floor[i] + P.over));
      if (h[i] > cap) {
        h[i] = cap;
        cut++;
      }
    }
  return cut;
}

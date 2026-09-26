// The settler, design version 2: version 1's (../proto/start.ts) with four additions.
// - Kyler's start water rule (amends D85; rules.ts): the water need not be on the start's own level.
//   A place qualifies when a walk over the map's own terrain and slopes reaches a pump shore within
//   the rule; the settler screens with an optimistic walk (steps of one level allowed anywhere) and
//   then walks the best places over the slopes the build would derive.
// - Drought-aware start water (task e, decisions-pending #59): with `drought`, a place counts as
//   drought-safe when clean water within the water rule stays pumpable through the first Normal
//   drought (the analytic drought over its days); "prefer" weights such places up, "require"
//   takes only them.
// - Reachable land (Verticality): the place's ground, joined by steps of one level, must hold
//   `minFoot` tiles, so the start and its first resources stand on land reached without stairs.
// - Intentions (D138): a preference per place (intentions.ts `startPreference`), added to the score.
// Version 1's notes follow.
//
// The settler: where to put the district center on a terrain that already has its water. It reads
// the land the way a player would (D85's requirements are hard limits, never traded): level ground
// whose own level walks to a shore of clean pumpable water within the water rule, dry round the
// center, moist land near for trees and berries, room to grow. Among the places that qualify, the
// genome's settler preferences (a lake shore, a river bank, a confluence, below a fall, a high
// bench, a spring's stream) and the seed choose, so starts differ as much as the land does.

import { distanceFrom, levelRegions, MinHeap } from "../../../src/core/math/grid";
import { coordinatesForMinCorner, ORIENTATIONS, rotate, slopeHighSide, type Orientation } from "../../../src/core/format/footprints";
import type { Rng } from "../../../src/core/math/rng";
import { placeSlopes, SLOPE_RULES } from "../../../src/core/features/slopes";
import { walkDistance } from "../../../src/core/analysis/walk";
import type { Hydro } from "./hydro";
import { pumpShores, shoreWalkAny } from "./rules";

export interface StartPick {
  x: number;
  y: number;
  level: number;
  orientation: Orientation;
  /** The kind of place: lake, river, confluence, falls, bench, stream. */
  kind: string;
  shoreWalk: number;
  /** The 5×5 round the center had to be levelled (a relaxed pick). */
  levelled: boolean;
  /** A shore point the ground is levelled to, from the center (the last resort). */
  shore?: [number, number];
  /** Clean water within the rule stays pumpable through the first drought (when measured). */
  droughtOk?: boolean;
  /** The intentions' preference at this place (0–1). */
  intent?: number;
}

export interface SettlerOptions {
  avoid?: Uint8Array | null;
  /** Depth left after the first drought (analytic), for `drought`. */
  kept?: ArrayLike<number> | null;
  drought?: "off" | "prefer" | "require";
  /** The intentions' preference for a place (0–1). */
  prefer?: ((x: number, y: number, L: number, walk: number) => number) | null;
  /** Land joined by one-level steps, and the fewest tiles the start's ground must hold. */
  foot?: { lab: Int32Array; size: number[] } | null;
  minFoot?: number;
  /** Moist dry land within 20 tiles' walk, with the slopes the build would derive for a start
   *  here (features/slopes.ts), must reach `min` tiles: food and wood grow there (D85). */
  moistWalk?: { min: number } | null;
}

/** Moist dry tiles within 20 tiles' walk of a start at (x, y), over the slopes the build derives. */
export function moistWithinWalk(h: Uint8Array, W: number, H: number, D: ArrayLike<number>, M: ArrayLike<number>, x: number, y: number): number {
  return startWalks(h, W, H, D, null, M, x, y, 0).moist;
}

/** From a start at (x, y), over the slopes the build derives for it: moist dry tiles within 20
 *  tiles' walk, and (with `C`) the walk to the nearest pump shore (Kyler's start water rule). */
export function startWalks(h: Uint8Array, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number> | null, M: ArrayLike<number>, x: number, y: number, rule: number): { moist: number; water: number } {
  const occ = new Uint8Array(W * H);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) occ[(y + dy) * W + x + dx] = 1;
  const slopes = placeSlopes(h, W, H, { x, y }, occ, { ...SLOPE_RULES, bigRegion: 0 });
  const links: [number, number][] = [];
  for (const s of slopes) {
    const [dx, dy] = slopeHighSide(s.orientation);
    const hx = s.x + dx;
    const hy = s.y + dy;
    if (hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([s.y * W + s.x, hy * W + hx]);
  }
  const d = walkDistance(h, W, H, null, links, { x, y }, Math.max(20, rule));
  let n = 0;
  for (let i = 0; i < W * H; i++) if (d[i] <= 20 && M[i] > 0 && !(D[i] > 0.001)) n++;
  let water = Infinity;
  if (C) {
    const shore = pumpShores(h, D, C, W, H);
    for (let i = 0; i < W * H; i++) if (shore[i] && d[i] < water) water = d[i];
  }
  return { moist: n, water };
}

const S2 = Math.SQRT2;
const DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Walking distance on each level from that level's shores of pumpable water (no slopes). */
export function shoreWalkFrom(h: Uint8Array, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>, limit: number): Float64Array {
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const L = h[i];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const s = h[j] + D[j];
      if (D[j] >= 0.35 && C[j] < 0.03 && s >= L - 1.9 && s <= L - 0.05) {
        d[i] = 0;
        heap.push(0, i);
        break;
      }
    }
  }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > d[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    const lv = h[c];
    for (const [dx, dy] of DIRS) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (h[n] !== lv) continue;
      if (dx && dy && !(h[y * W + xx] === lv && h[yy * W + x] === lv)) continue;
      const nd = k + (dx && dy ? S2 : 1);
      if (nd < d[n] && nd <= limit) {
        d[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return d;
}

export function pickStart(
  h: Uint8Array,
  W: number,
  H: number,
  water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number> },
  hydro: Hydro,
  prefs: number[],
  rng: Rng,
  waterRule: number,
  opts: SettlerOptions = {},
): StartPick | null {
  const avoid = opts.avoid ?? null;
  const N = W * H;
  const D = water.depth;
  const walk = shoreWalkFrom(h, W, H, D, water.contamination, waterRule);
  // Kyler's rule: shores on other levels count when a walk over the map's own slopes reaches them
  const walkAny = shoreWalkAny(h, W, H, D, water.contamination, waterRule);
  const walkKept = opts.kept && opts.drought && opts.drought !== "off" ? shoreWalkAny(h, W, H, opts.kept, water.contamination, waterRule) : null;
  const wetNear = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (D[i] > 0.02 || hydro.water[i] === 1 || hydro.water[i] === 2) wetNear[i] = 1;
  const dWet = distanceFrom(wetNear, W, H);
  const moist = new Uint8Array(N);
  for (let i = 0; i < N; i++) moist[i] = water.moisture[i] > 0 && !(D[i] > 0) ? 1 : 0;
  // moist land a level either side of each level (slopes join one-level steps), per level
  const satFor = new Map<number, Int32Array>();
  const satOf = (L: number) => {
    let t = satFor.get(L);
    if (t) return t;
    t = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const v = moist[i] && h[i] >= L - 1 && h[i] <= L + 1 ? 1 : 0;
        t[(y + 1) * (W + 1) + x + 1] = v + t[y * (W + 1) + x + 1] + t[(y + 1) * (W + 1) + x] - t[y * (W + 1) + x];
      }
    satFor.set(L, t);
    return t;
  };
  const boxSum = (L: number, x0: number, y0: number, x1: number, y1: number) => {
    const s2 = satOf(L);
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(W - 1, x1);
    y1 = Math.min(H - 1, y1);
    return s2[(y1 + 1) * (W + 1) + x1 + 1] - s2[y0 * (W + 1) + x1 + 1] - s2[(y1 + 1) * (W + 1) + x0] + s2[y0 * (W + 1) + x0];
  };
  const regions = levelRegions(h, W, H);
  // what each place is near
  const lakeT = new Uint8Array(N);
  for (const lk of hydro.lakes) for (const i of lk.tiles) lakeT[i] = 1;
  const dLake = distanceFrom(lakeT, W, H);
  const fallT = new Uint8Array(N);
  for (const f of hydro.falls) fallT[f.y * W + f.x] = 1;
  const dFall = distanceFrom(fallT, W, H);
  const joinT = new Uint8Array(N);
  for (const r of hydro.rivers) {
    if (!("river" in r.params.exit)) continue;
    const p = r.params.path[r.params.path.length - 1];
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x >= 0 && y >= 0 && x < W && y < H) joinT[y * W + x] = 1;
  }
  const dJoin = distanceFrom(joinT, W, H);
  const springT = new Uint8Array(N);
  for (const r of hydro.rivers) if ("spring" in r.params.entry) for (const p of r.params.path.slice(0, 20)) {
    const x = Math.round(p[0]);
    const y = Math.round(p[1]);
    if (x >= 0 && y >= 0 && x < W && y < H) springT[y * W + x] = 1;
  }
  const dSpring = distanceFrom(springT, W, H);
  const sorted = Array.from(h).sort((a, b) => a - b);
  const medianLevel = sorted[N >> 1];
  const margin = Math.max(8, Math.round(Math.min(W, H) * 0.08));
  const cands: { i: number; score: number; kind: string; o: Orientation; walk: number; levelled: boolean; droughtOk?: boolean; intent: number; sameLevel: boolean }[] = [];
  // first pass: level ground as it is; second pass (when the first finds nothing): a 5×5 within a
  // level of the center is levelled, as a player would level a spot for the district center
  for (let pass = 0; pass < 2 && !cands.length; pass++)
  for (let y = margin; y < H - margin; y++) {
    for (let x = margin; x < W - margin; x++) {
      const i = y * W + x;
      const L = h[i];
      if (avoid?.[i]) continue;
      // the 5×5 round the center: level ground, dry, no channel
      let ok = true;
      let uneven = false;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const j = (y + dy) * W + x + dx;
          if (D[j] > 0.001 || hydro.water[j] === 1 || hydro.water[j] === 2) ok = false;
          else if (h[j] !== L) {
            if (pass === 0 || Math.abs(h[j] - L) > 1 || Math.max(Math.abs(dx), Math.abs(dy)) <= 1) ok = false;
            uneven = true;
          }
        }
      if (!ok || dWet[i] < 3.5) continue;
      // the walk from the 3×3 to a shore on its own level, or (Kyler's rule) to one on another level
      // over steps of one level; the second is checked over the derived slopes below
      let w = Infinity;
      let wa = Infinity;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          w = Math.min(w, walk[(y + dy) * W + x + dx]);
          wa = Math.min(wa, walkAny[(y + dy) * W + x + dx]);
        }
      const sameLevel = w <= waterRule - 5;
      if (!sameLevel && !(wa <= waterRule - 5)) continue;
      if (!sameLevel) w = wa;
      // the ground reached without stairs
      if (opts.foot && opts.minFoot && opts.foot.size[opts.foot.lab[i]] < opts.minFoot) continue;
      // drought-aware: pumpable water within the rule after the first drought
      let droughtOk: boolean | undefined;
      if (walkKept) {
        let wk = Infinity;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) wk = Math.min(wk, walkKept[(y + dy) * W + x + dx]);
        droughtOk = wk <= waterRule;
        if (opts.drought === "require" && !droughtOk) continue;
      }
      // a door on the side nearest the water, onto level ground
      let o: Orientation | null = null;
      let best = Infinity;
      for (const oo of ORIENTATIONS) {
        const [X, Y] = coordinatesForMinCorner(3, 3, x - 1, y - 1, oo);
        const [ex, ey] = rotate(oo, 1, -1);
        const e = (Y + ey) * W + X + ex;
        if (h[e] !== L) continue;
        if (dWet[e] < best) {
          best = dWet[e];
          o = oo;
        }
      }
      if (!o) continue;
      const moistNear = boxSum(L, x - 14, y - 14, x + 14, y + 14);
      if (moistNear < (pass === 0 ? 160 : 110)) continue;
      const room = Math.min(1, regions.size[regions.labels[i]] / 900);
      const kinds: [string, number][] = [
        ["lake", dLake[i] < 12 ? prefs[0] : 0],
        ["river", dLake[i] >= 12 ? prefs[1] * 0.8 : 0],
        ["confluence", dJoin[i] < 14 ? prefs[2] : 0],
        ["falls", dFall[i] < 16 ? prefs[3] : 0],
        ["bench", L >= medianLevel + 2 ? prefs[4] : 0],
        ["stream", dSpring[i] < 14 ? prefs[5] : 0],
      ];
      let kind = "river";
      let pref = 0.3;
      for (const [k, v] of kinds) if (v > pref) {
        pref = v;
        kind = k;
      }
      const intent = opts.prefer ? opts.prefer(x, y, L, w) : 0;
      const dry = droughtOk === undefined ? 1 : droughtOk ? 1.25 : 0.8;
      const score = pref * (0.5 + 0.5 * room) * (0.6 + 0.4 * Math.min(1, moistNear / 500)) * dry + 0.8 * intent + 0.25 * rng.float();
      cands.push({ i, score, kind, o, walk: w, levelled: uneven, droughtOk, intent, sameLevel });
    }
  }
  if (!cands.length) return bankStart(h, W, H, water, hydro, rng, margin, avoid);
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  // one of the best few, far enough apart that the choice matters
  const top: typeof cands = [];
  let tested = 0;
  for (const c of cands) {
    if (top.length >= 6) break;
    const x = c.i % W;
    const y = (c.i - x) / W;
    if (top.some((t) => Math.abs((t.i % W) - x) + Math.abs(Math.floor(t.i / W) - y) < 20)) continue;
    if (opts.moistWalk || !c.sameLevel) {
      if (tested >= 40) break;
      tested++;
      const sw = startWalks(h, W, H, D, c.sameLevel ? null : water.contamination, water.moisture, x, y, waterRule);
      if (opts.moistWalk && sw.moist < opts.moistWalk.min) continue;
      if (!c.sameLevel) {
        if (!(sw.water <= waterRule - 2)) continue;
        c.walk = sw.water;
      }
    }
    top.push(c);
  }
  if (!top.length) return bankStart(h, W, H, water, hydro, rng, margin, avoid);
  const c = top[rng.int(0, top.length)];
  const x = c.i % W;
  const y = (c.i - x) / W;
  return { x, y, level: h[c.i], orientation: c.o, kind: c.kind, shoreWalk: c.walk, levelled: c.levelled, droughtOk: c.droughtOk, intent: c.intent };
}

/** The last resort, as the current generator does (D97): beside clean pumpable water, a 5×5 pad and a
 *  3-wide path to the shore, levelled one level above the water, on ground within two levels of it. */
function bankStart(
  h: Uint8Array,
  W: number,
  H: number,
  water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number> },
  hydro: Hydro,
  rng: Rng,
  margin: number,
  avoid: Uint8Array | null,
): StartPick | null {
  const N = W * H;
  const D = water.depth;
  const C = water.contamination;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (D[i] > 0.001 || hydro.water[i] === 1 || hydro.water[i] === 2) wet[i] = 1;
  const dWet = distanceFrom(wet, W, H);
  const cands: [number, number, number, number][] = [];
  for (let i = 0; i < N; i++) {
    if (!(D[i] >= 0.4 && C[i] < 0.03)) continue;
    const L = Math.floor(h[i] + D[i]) + 1;
    const wx = i % W;
    const wy = (i - wx) / W;
    for (const [ox, oy] of [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]] as const) {
      const x = wx + ox;
      const y = wy + oy;
      if (x < margin || y < margin || x >= W - margin || y >= H - margin) continue;
      const c = y * W + x;
      if (avoid?.[c] || dWet[c] < 4) continue;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const j = (y + dy) * W + x + dx;
          if (wet[j] || Math.abs(h[j] - L) > 2) ok = false;
        }
      if (!ok) continue;
      cands.push([rng.float() + 0.02 * water.moisture[c], c, i, L]);
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const [, c, w, L] = cands[0];
  const x = c % W;
  const y = (c - x) / W;
  const wx = w % W;
  const wy = (w - wx) / W;
  // the door faces the water
  const o: Orientation = Math.abs(wx - x) > Math.abs(wy - y) ? (wx > x ? "Cw270" : "Cw90") : wy > y ? "Cw180" : "Cw0";
  // the shore point: the last dry tile before the water along the line
  const steps = Math.max(Math.abs(wx - x), Math.abs(wy - y));
  let sx = x;
  let sy = y;
  for (let k = 0; k <= steps; k++) {
    const px = Math.round(x + ((wx - x) * k) / steps);
    const py = Math.round(y + ((wy - y) * k) / steps);
    if (wet[py * W + px]) break;
    sx = px;
    sy = py;
  }
  return { x, y, level: L, orientation: o, kind: "bank", shoreWalk: steps, levelled: true, shore: [sx, sy] };
}

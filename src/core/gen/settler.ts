// The settler (docs/m9-design.md §7): where to put the district center on land that already has
// its water. It reads the land the way a player would. The start requirements are hard limits, never
// traded: a shore of clean water a pump reaches within the water rule's walk over the map's own
// slopes (D153; on the start's own level with 5 tiles to spare, on another level over the slopes the
// build would derive with 2 to spare), the 3×3 and its ring dry, the door onto level ground facing
// the water, the start's ground joined by one-level steps to a large share of the map (reach), and
// moist land within 20 tiles' walk for food and wood. Among the places that qualify, the genome's
// preferences (a lake shore, a river bank, a confluence, below a fall, a high bench, a spring's
// stream), the intentions' preferences, the drought-aware preference (#59: water that stays
// pumpable through the first Normal drought, preferred on Normal and Hard, required on Easy) and the
// seed choose among the best few, kept 20 tiles apart, so starts differ as much as the land does.
// If no place qualifies, a 5×5 within a level is levelled; as a last resort a pad and a path to the
// water (D97).
//
// Ported from the design version 2 prototype (investigation/generative/v2/start.ts, rules.ts).

import { PUMP_CLEAN, PUMP_DEPTH, PUMP_REACH, walkDistance } from "../analysis/walk";
import { placeSlopes, SLOPE_RULES } from "../features/slopes";
import { coordinatesForMinCorner, ORIENTATIONS, rotate, slopeHighSide, type Orientation } from "../format/footprints";
import type { Hydro } from "../land/hydro";
import { distanceFrom, levelRegions, MinHeap } from "../math/grid";
import type { Rng } from "../math/rng";
import { WET } from "../validate/playability";

const N4: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface StartPick {
  x: number;
  y: number;
  level: number;
  orientation: Orientation;
  /** The kind of place: lake, river, confluence, falls, bench, stream, bank. */
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

export type DroughtPolicy = "off" | "prefer" | "require";

export interface SettlerOptions {
  avoid?: Uint8Array | null;
  /** Depth left after the first drought (analytic), for `drought`. */
  kept?: ArrayLike<number> | null;
  drought?: DroughtPolicy;
  /** The intentions' preference for a place (0–1). */
  prefer?: ((x: number, y: number, L: number, walk: number) => number) | null;
  /** Land joined by one-level steps, and the fewest tiles the start's ground must hold. */
  foot?: { lab: Int32Array; size: number[] } | null;
  minFoot?: number;
  /** The land the start's ground should join (Buildable land's walkable land, twice its least):
   *  more is preferred up to it. */
  footWant?: number;
  /** Moist dry land within 20 tiles' walk, with the slopes the build would derive for a start
   *  here, must reach `min` tiles: food and wood grow there. */
  moistWalk?: { min: number } | null;
  /** The level ground a place should have round it (Start area: small, normal, large), in tiles. */
  room?: number;
  /** The start's bench: tiles at its level within 8 tiles it should have (Start area: radius 5 /
   *  6 / 8, PLAN §5.7). */
  bench?: number;
  /** Water kept through the difficulty's worst drought (depth per tile) and the stored water the
   *  start should have within 40 tiles (the colony's need times the Drought reserve, PLAN §11.4):
   *  places with more are preferred (#67: information the generator prefers, never a guard). */
  storage?: { kept: ArrayLike<number>; want: number } | null;
  /** Where the start was expected (the guess the badwater hollows were planned from): among the
   *  places nearly as good as the best, the one nearest it, so the hollows keep the distance the
   *  settings asked for. Without it, one of them at random. */
  near?: { x: number; y: number } | null;
}

/** Shore tiles: dry ground beside clean water 0.3+ deep whose surface a pump on that ground
 *  reaches (0 to PUMP_REACH levels below the ground's own level), as `pumpShoreDistance` reads them. */
export function pumpShores(h: ArrayLike<number>, D: ArrayLike<number>, C: ArrayLike<number>, W: number, H: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (D[i] > WET) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const s = h[j] + D[j];
      if (D[j] >= PUMP_DEPTH && C[j] < PUMP_CLEAN && s >= h[i] - PUMP_REACH && s <= h[i] + 0.01) {
        out[i] = 1;
        break;
      }
    }
  }
  return out;
}

/** An optimistic estimate of the water rule's walk for the settler, before the slopes exist: the
 *  walk from every pump shore over steps of at most one level (a slope could join them), up to
 *  `limit` tiles. */
export function shoreWalkAny(h: ArrayLike<number>, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>, limit: number): Float64Array {
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  const shore = pumpShores(h, D, C, W, H);
  for (let i = 0; i < N; i++)
    if (shore[i]) {
      d[i] = 0;
      heap.push(0, i);
    }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > d[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (D[n] > WET || Math.abs(h[n] - h[c]) > 1) continue;
      const nd = k + 1;
      if (nd < d[n] && nd <= limit) {
        d[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return d;
}

/** From a start at (x, y), over the slopes the build derives for it: moist dry tiles within 20
 *  tiles' walk, and (with `C`) the walk to the nearest pump shore (the water rule, D153). */
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
  hydro: Pick<Hydro, "water" | "lakes" | "falls" | "rivers">,
  prefs: number[],
  rng: Rng,
  waterRule: number,
  opts: SettlerOptions = {},
): StartPick | null {
  const avoid = opts.avoid ?? null;
  const N = W * H;
  const D = water.depth;
  const walk = shoreWalkFrom(h, W, H, D, water.contamination, waterRule);
  // the water rule: shores on other levels count when a walk over the map's own slopes reaches them
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
  for (const r of hydro.rivers)
    if ("spring" in r.params.entry)
      for (const p of r.params.path.slice(0, 20)) {
        const x = Math.round(p[0]);
        const y = Math.round(p[1]);
        if (x >= 0 && y >= 0 && x < W && y < H) springT[y * W + x] = 1;
      }
  const dSpring = distanceFrom(springT, W, H);
  const sorted = Array.from(h).sort((a, b) => a - b);
  const medianLevel = sorted[N >> 1];
  const margin = Math.max(8, Math.round(Math.min(W, H) * 0.08));
  // stored water within 40 tiles (a box of 81), from a summed-area table of what the drought keeps
  let storeSum: Float64Array | null = null;
  if (opts.storage && opts.storage.want > 0) {
    storeSum = new Float64Array((W + 1) * (H + 1));
    const k = opts.storage.kept;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) storeSum[(y + 1) * (W + 1) + x + 1] = k[y * W + x] + storeSum[y * (W + 1) + x + 1] + storeSum[(y + 1) * (W + 1) + x] - storeSum[y * (W + 1) + x];
  }
  const storedNear = (x: number, y: number): number => {
    if (!storeSum) return 0;
    const x0 = Math.max(0, x - 40);
    const y0 = Math.max(0, y - 40);
    const x1 = Math.min(W - 1, x + 40) + 1;
    const y1 = Math.min(H - 1, y + 40) + 1;
    return storeSum[y1 * (W + 1) + x1] - storeSum[y0 * (W + 1) + x1] - storeSum[y1 * (W + 1) + x0] + storeSum[y0 * (W + 1) + x0];
  };
  const roomWant = opts.room ?? 900;
  const benchWant = opts.bench ?? 113;
  const walkWant = Math.max(2, Math.min(9, 0.45 * (waterRule - 5)));
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
        // the walk from the 3×3 to a shore on its own level, or to one on another level over steps
        // of one level; the second is checked over the derived slopes below
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
        const room = Math.min(1, regions.size[regions.labels[i]] / roomWant);
        // the land the start's ground joins, against what Buildable land asks for (PLAN §5.2)
        const footFit = opts.foot && opts.footWant ? Math.min(1, opts.foot.size[opts.foot.lab[i]] / opts.footWant) : 1;
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
        for (const [k, v] of kinds)
          if (v > pref) {
            pref = v;
            kind = k;
          }
        const intent = opts.prefer ? opts.prefer(x, y, L, w) : 0;
        const dry = droughtOk === undefined ? 1 : droughtOk ? 1.25 : 0.8;
        // the Start area's bench: level ground at the start's own level within 8 tiles
        let bench = 0;
        for (let dy = -8; dy <= 8; dy++)
          for (let dx = -8; dx <= 8; dx++) {
            if (dx * dx + dy * dy > 64) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && h[yy * W + xx] === L) bench++;
          }
        // (Small asks for a small bench: a much larger one is a start area of another size)
        const benchFit = Math.min(1, bench / benchWant) * (benchWant < 100 ? Math.min(1, (1.6 * benchWant) / Math.max(1, bench)) : 1);
        // the water rule sets how far the start stands from its water, not only how far it may
        // (Water without stairs, PLAN §5.6; D59)
        const walkFit = 1 - Math.min(1, Math.abs(w - walkWant) / 5);
        // the stored water the Drought reserve and the difficulty ask for (PLAN §5.3, §11.4)
        const storeFit = storeSum ? Math.min(1, storedNear(x, y) / opts.storage!.want) : 1;
        // the player's settings weigh on the intentions' preference too: they are asked for
        const settingsFit = (0.3 + 0.7 * benchFit * benchFit) * (0.3 + 0.7 * walkFit) * (0.4 + 0.6 * storeFit) * (0.5 + 0.5 * footFit);
        const score = (pref * (0.5 + 0.5 * room) * (0.6 + 0.4 * Math.min(1, moistNear / 500)) * dry + 0.8 * intent) * settingsFit + 0.25 * rng.float();
        cands.push({ i, score, kind, o, walk: w, levelled: uneven, droughtOk, intent, sameLevel });
      }
    }
  if (!cands.length) return bankStart(h, W, H, water, hydro, rng, margin, avoid);
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  // the best few, far enough apart that the choice matters
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
  // one of the best few, among those nearly as good as the best (the settings' preferences hold):
  // the one nearest where the start was expected, else one at random
  const good = top.filter((t) => t.score >= 0.7 * top[0].score);
  let c = good[rng.int(0, good.length)];
  const near = opts.near;
  if (near) {
    const d2 = (t: (typeof good)[number]) => {
      const tx = t.i % W;
      const ty = (t.i - tx) / W;
      return (tx - near.x) * (tx - near.x) + (ty - near.y) * (ty - near.y);
    };
    for (const t of good) if (d2(t) < d2(c) || (d2(t) === d2(c) && t.i < c.i)) c = t;
  }
  const x = c.i % W;
  const y = (c.i - x) / W;
  return { x, y, level: h[c.i], orientation: c.o, kind: c.kind, shoreWalk: c.walk, levelled: c.levelled, droughtOk: c.droughtOk, intent: c.intent };
}

/** The last resort, as the old generator did (D97): beside clean pumpable water, a 5×5 pad and a
 *  3-wide path to the shore, levelled one level above the water, on ground within two levels of it,
 *  where most ground round it stands at the pad's level. */
function bankStart(
  h: Uint8Array,
  W: number,
  H: number,
  water: { depth: ArrayLike<number>; contamination: ArrayLike<number>; moisture: ArrayLike<number> },
  hydro: Pick<Hydro, "water">,
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
      // ground at the pad's level round it: the colony's first land (a pad on a ledge joins little)
      let near = 0;
      for (let dy = -8; dy <= 8; dy++)
        for (let dx = -8; dx <= 8; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && !wet[yy * W + xx] && h[yy * W + xx] === L) near++;
        }
      cands.push([rng.float() + 0.02 * water.moisture[c] + 1.5 * Math.min(1, near / 150), c, i, L]);
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

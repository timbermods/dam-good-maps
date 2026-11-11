// Stage 2, relief between (docs/PREMISES.md §2.2; four-lakes-design's `designLand` main loop, `rise` and `tidy`): the
// whole map's ground round stage 1's water. The land is the lower envelope of every water's bowl: beside each water a
// level meadow one level over it, then a crag, a bench and a second crag; a higher water's rim is kept from the
// waters below it; far from water the outlands follow the stair's level and fall away to the edges. Ground no day-1
// water reaches is broad benches divided by bold scarps, in threes (the game has one dry tone: thin bands on it read
// as contour lines); ridges and spurs are crags; an empty basin's beach stands at its sill + 1. Stage 1's fixed tiles
// stand as they are and every other tile stands at least at its guard, so the water stands where the table says.
//
// Distances are one transform a water (`distanceFrom`), each water's bowl read from it; the land wanders by reading
// a bowl's distance a few tiles off (a warp), so no contour follows a ruler. Noise is `fbm` on the plan's own seeds
// (named stream `premise.relief`). Integer or portable maths only (D366).

import { hash32 } from "../../math/hash";
import { distanceFrom } from "../../math/grid";
import { fbm } from "../../math/noise";
import { sqrt } from "../../math/portable";
import { BED_FLOOR } from "../../land/genome";
import { widenBenches } from "../../land/benches";
import { HEADING_DIR } from "../geom";
import type { Edge, PremisePlan } from "../types";
import type { StageWater } from "../water";
import { near4, type WaterRaster } from "./field";

/** A body's or channel's rim, kept from the waters below it: within this many tiles of a water, no lower water's
 *  bowl digs (four-lakes-design's `rim`). */
const RIM = 3.2;
/** A brook's or leat's rim: it runs on a terrace of its own, never on a dyke over a lower water's meadow. */
const CHANNEL_RIM = 4;
const LEAT_RIM = 6;
/** The landmark's hanging valley stands in its own upper world: its rim this wide behind its lip, so it runs on high
 *  ground and leaves it by a cliff (never on a dyke over a lower lake's meadow). */
const VALLEY_RIM = 8;
/** Meadows beside channels, tiles (four-lakes-design's `Channel.brook.meadow`). A living brook's is narrow: it is a
 *  thread of green, never a valley of it (§4.2: the map is not handed over watered). */
const MEADOW = { valley: 6, neck: 6, wetBrook: 4, dryBrook: 12, leat: 10, gorge: 1 };
/** The side bodies (§4.2's templates): a spring tarn sits in a bowl, a narrow meadow under a crag of two, so its green
 *  is a spot and its notch's bed leaves it for dry benches; an empty basin's beach at its sill + 1 under a bank two
 *  levels high at the old waterline (§4.5), so a levee's water rises over the beach and no further. */
const TARN = { meadow: 4, crag: 2, rim: 6 };
const BASIN = { beach: 3, crag: 2, rim: 6 };
/** The bypass follows the land (its plan's `bed: { under }`): its bed this many levels under the land beside it, the
 *  land read this far out from its bed; the old channel's floor beside its bed (a wadi) a level over it, this wide. */
const BYPASS_UNDER = 2;
const BYPASS_LOOK = 3;
const WADI = 1.7;
/** Beyond this many tiles from any water the outlands take over (§2.2). */
const OUTLANDS = 30;
/** Dry ground: farther than this from day-1 water (and from the start) it is benches in threes. */
const DRY_FROM = 19;
const DRY_FROM_START = 30;
/** How far the land falls toward an edge that falls away, levels a tile over the last `EDGE_RUN` tiles. */
const EDGE_RUN = 10;
const EDGE_FALL = 0.35;
/** The outlands' stair: water levels averaged in cells this many tiles across, then weighted by nearness. */
const STAIR_CELL = 8;

/** How far the land has risen `t` tiles beyond a meadow's edge: a crag (`c1` levels in a tile), a bench `w1` wide that
 *  climbs a level, a second crag (`c2`), then benches and crags of two. Where `c1` is 1 the crag is a plain step: a
 *  way up (four-lakes-design's `rise`). */
export function rise(t: number, c1: number, w1: number, c2: number): number {
  if (!(t > 0)) return 0;
  // (far out the land is the outlands': a bowl stops rising there)
  if (t > 200) t = 200;
  if (t < 1.2) return (c1 * t) / 1.2;
  t -= 1.2;
  if (t < w1) return c1 + t / w1;
  t -= w1;
  let base = c1 + 1;
  let c = c2;
  for (;;) {
    if (t < 1.2) return base + (c * t) / 1.2;
    t -= 1.2;
    base += c;
    if (t < w1) return base + (0.6 * t) / w1;
    t -= w1;
    base += 0.6;
    c = 2;
  }
}

/** One water's bowl: the tiles of a water at one level, its meadow and its rim. */
interface Bowl {
  level: number;
  meadow: number;
  rim: number;
  /** Carries water on day 1 (its meadow is green ground). */
  wet: boolean;
  /** An empty basin: its beach keeps the sill + 1. */
  basin: boolean;
  /** Its walls rise faster (the gorge, the bypass's wadi). */
  steep: boolean;
  /** The least crag past its meadow, levels (a side body's bowl). */
  crag?: number;
  /** Only behind this line (a point on it and the way out of it, the landmark's lip and its face). */
  cut: { x: number; y: number; nx: number; ny: number } | null;
  mask: Uint8Array;
  d: Float64Array;
}

/** A seed of the relief's own for one field of noise (named stream `premise.relief`). */
function seedOf(plan: PremisePlan, name: string): number {
  return hash32(plan.seed, plan.W, plan.H, "premise.relief", name);
}

/** The bowls of stage 1's water, one a water a level. */
function bowlsOf(plan: PremisePlan, w: StageWater): Bowl[] {
  const r = w.raster;
  const { W, H } = r;
  const N = W * H;
  const byKey = new Map<string, Bowl>();
  const add = (i: number, key: string, make: () => Omit<Bowl, "mask" | "d">) => {
    let b = byKey.get(key);
    if (!b) {
      b = { ...make(), mask: new Uint8Array(N), d: new Float64Array(0) };
      byKey.set(key, b);
    }
    b.mask[i] = 1;
  };
  const level = (i: number) => (Number.isNaN(r.surface[i]) ? r.heights[i] : Math.floor(r.surface[i] + 0.15));
  for (let i = 0; i < N; i++) {
    if (r.lake[i]) {
      const k = r.lake[i] - 1;
      const b = plan.bodies[k];
      const side = b.kind === "tarn" ? TARN : b.kind === "basin" ? { meadow: BASIN.beach, crag: BASIN.crag, rim: BASIN.rim } : null;
      add(i, `b${k}`, () => ({ level: b.sill, meadow: side ? side.meadow : b.meadow, rim: side ? side.rim : b.kind === "pool" ? 4 : RIM, wet: !b.dry, basin: b.dry, steep: false, cut: null, ...(side ? { crag: side.crag } : {}) }));
      continue;
    }
    if (!r.channel[i]) continue;
    const li = r.channel[i] - 1;
    const l = plan.links[li];
    const shut = w.table.links[l.id]?.shut ?? false;
    const wet = l.wet && !shut;
    if (l.kind === "gorge") {
      const v = level(i);
      add(i, `l${li}:${v}`, () => ({ level: v, meadow: MEADOW.gorge, rim: 2, wet: true, basin: false, steep: true, cut: null }));
    } else if (l.kind === "fall" && l.fall) {
      // the landmark's hanging valley: its own upper world behind its lip
      const v = level(i);
      const [p0, p1] = l.fall.lip;
      const n = HEADING_DIR[l.fall.face];
      add(i, `l${li}:${v}`, () => ({ level: v, meadow: MEADOW.valley, rim: VALLEY_RIM, wet, basin: false, steep: false, cut: { x: (p0[0] + p1[0]) / 2, y: (p0[1] + p1[1]) / 2, nx: n[0], ny: n[1] } }));
    } else if (l.kind === "bypass") {
      // (cut into the land afterwards: `followLand`)
      continue;
    } else if (l.kind === "channel") {
      const v = level(i);
      add(i, `l${li}:${v}`, () => ({ level: v, meadow: MEADOW.neck, rim: 4, wet, basin: false, steep: false, cut: null }));
    } else {
      // brooks and leats: a dry bed is two deep (its valley floor a level over its bed + 1, §4.2's dam to pond)
      const v = wet ? level(i) : r.heights[i] + (l.kind === "brook" ? 1 : 0);
      const meadow = l.kind === "leat" ? MEADOW.leat : wet ? MEADOW.wetBrook : MEADOW.dryBrook;
      add(i, `l${li}:${v}`, () => ({ level: v, meadow, rim: l.kind === "leat" ? LEAT_RIM : CHANNEL_RIM, wet, basin: false, steep: false, cut: null }));
    }
  }
  const out = [...byKey.values()];
  for (const b of out) {
    b.d = distanceFrom(b.mask, W, H);
    if (b.cut) {
      const { x: cx, y: cy, nx, ny } = b.cut;
      for (let i = 0; i < N; i++) {
        const x = i % W;
        const y = (i - x) / W;
        if ((x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny > 0.5 && !b.mask[i]) b.d[i] = Infinity;
      }
    }
  }
  return out;
}

/** The outlands' stair level at each tile: the water's levels, averaged in cells, weighted by nearness
 *  (four-lakes-design's anchors). */
function stairField(r: WaterRaster, bowls: Bowl[]): Float64Array {
  const { W, H } = r;
  const cw = Math.ceil(W / STAIR_CELL);
  const ch = Math.ceil(H / STAIR_CELL);
  const sum = new Float64Array(cw * ch);
  const cnt = new Float64Array(cw * ch);
  const sx = new Float64Array(cw * ch);
  const sy = new Float64Array(cw * ch);
  for (const b of bowls)
    for (let i = 0; i < W * H; i++) {
      if (!b.mask[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      const c = Math.floor(y / STAIR_CELL) * cw + Math.floor(x / STAIR_CELL);
      sum[c] += b.level;
      cnt[c]++;
      sx[c] += x + 0.5;
      sy[c] += y + 0.5;
    }
  const anchors: [number, number, number][] = [];
  for (let c = 0; c < cw * ch; c++) if (cnt[c]) anchors.push([sx[c] / cnt[c], sy[c] / cnt[c], sum[c] / cnt[c]]);
  // (read on a coarse grid, then between its points)
  const G = 4;
  const gw = Math.ceil(W / G) + 1;
  const gh = Math.ceil(H / G) + 1;
  const grid = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      let sw = 0;
      let sv = 0;
      for (const [ax, ay, lv] of anchors) {
        const d2 = (gx * G - ax) * (gx * G - ax) + (gy * G - ay) * (gy * G - ay) + 60;
        const wt = 1 / (d2 * d2);
        sw += wt;
        sv += wt * lv;
      }
      grid[gy * gw + gx] = sw ? sv / sw : BED_FLOOR + 2;
    }
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const fx = x / G;
      const fy = y / G;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const g = (a: number, b: number) => grid[Math.min(gh - 1, b) * gw + Math.min(gw - 1, a)];
      out[y * W + x] = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
    }
  return out;
}

/** How far a tile is from each edge that falls away (the others count as far). */
function edgeNear(plan: PremisePlan, x: number, y: number): number {
  const { W, H } = plan;
  const falls = (e: Edge) => plan.edges[e] !== "ridge";
  let d = Infinity;
  if (falls("S")) d = Math.min(d, y);
  if (falls("N")) d = Math.min(d, H - 1 - y);
  if (falls("W")) d = Math.min(d, x);
  if (falls("E")) d = Math.min(d, W - 1 - x);
  return d;
}

/** Stage 2: the whole map's ground round stage 1's water. Deterministic from the plan and its water. */
export function reliefBetween(plan: PremisePlan, w: StageWater): Uint8Array {
  const r = w.raster;
  const { W, H } = r;
  const N = W * H;
  const top = plan.top;
  const bowls = bowlsOf(plan, w);
  const stair = stairField(r, bowls);
  const S = (name: string) => seedOf(plan, name);
  const sWx = S("wx");
  const sWy = S("wy");
  const sWob = S("wob");
  const sOut1 = S("out1");
  const sOut2 = S("out2");
  const sLow = S("low");
  const sWarpA = S("warpA");
  const sWarpB = S("warpB");
  const sCrag = S("crag");
  const sBench = S("bench");
  const sCrag2 = S("crag2");
  const sMeadow = S("meadow");
  const sDry = S("dry");
  const sKnoll = S("knoll");
  const sScarp = S("scarp");
  const sScarp2 = S("scarp2");
  const sThrees = S("threes");
  const sPhase = S("phase");
  const sKnob = S("knob");
  const sBeach = S("beach");
  const sRidge = S("ridge");
  const sCrest = S("crest");
  const { x: stx, y: sty } = plan.frame.start;

  const f = new Float64Array(N);
  const nearAll = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // a wandering of the whole picture, so no contour follows a ruler or a compass
      const wx = Math.round(7 * fbm(sWx, x, y, 36, 3));
      const wy = Math.round(7 * fbm(sWy, x, y, 36, 3));
      const j = Math.min(H - 1, Math.max(0, y + wy)) * W + Math.min(W - 1, Math.max(0, x + wx));
      const wob = fbm(sWob, x, y, 16, 3);
      let near = Infinity;
      let nearWet = Infinity;
      let nearBasin = Infinity;
      let lift = -Infinity;
      for (const b of bowls) {
        const d = b.d[i];
        if (d < near) near = d;
        if (b.wet && d < nearWet) nearWet = d;
        if (b.basin && d < nearBasin) nearBasin = d;
        if (d < b.rim && b.level > lift) lift = b.level;
      }
      nearAll[i] = near;

      // the outlands: a little over the stair near the valley, falling away far from it and toward the edges
      const st = stair[i];
      const far = Math.max(0, near - OUTLANDS);
      let out = st + 4.6 + 3.4 * Math.max(0, 1 - st / 10) - 0.3 * Math.max(0, st - 8) + 2.6 * fbm(sOut1, x, y, 46, 4) + 1.0 * fbm(sOut2, x, y, 13, 3) - 0.06 * far;
      out -= EDGE_FALL * Math.max(0, EDGE_RUN - edgeNear(plan, x, y));
      if (out > top) out = top;
      if (out < BED_FLOOR + 2) out = BED_FLOOR + 2 + 0.6 * fbm(sLow, x, y, 9, 2);

      // the lower envelope of every water's bowl, a higher water's rim kept from the waters below it
      const warpA = fbm(sWarpA, x, y, 34, 3);
      const warpB = fbm(sWarpB, x, y, 19, 3);
      const c1 = Math.max(1, Math.min(4, Math.round(2.4 + 3.2 * fbm(sCrag, x, y, 31, 2))));
      const c2 = Math.max(1, Math.min(3, Math.round(1.9 + 2.4 * fbm(sCrag2, x, y, 24, 2))));
      const w1 = 10 + 6 * fbm(sBench, x, y, 27, 2);
      const meadowN = fbm(sMeadow, x, y, 27, 2);
      let land = out;
      for (const b of bowls) {
        if (b.level < lift || b.d[i] === Infinity) continue;
        // (the meadow is measured true from the shore: water reaches 16 tiles over level ground and stops at the
        // first step up; the hillside beyond it wanders)
        const d = b.d[i] < 6 ? b.d[i] + 0.8 * wob * Math.min(1, b.d[i] / 3) : Math.max(6, Math.min(b.d[j], b.d[i] + 12) + 0.8 * wob);
        const meadow = b.meadow + (b.meadow > 4 ? 3 * meadowN : 0);
        const hill = Math.max(0, d - meadow);
        const dw = hill * (1 + 0.3 * warpA) + 5 * warpB * Math.min(1, hill / 6);
        const v = b.level + 1 + (b.steep ? rise(Math.max(0, dw), 4, 3, 3) : rise(Math.max(0, dw), Math.max(c1, b.crag ?? 0), w1, c2));
        if (v < land) land = v;
      }

      // (ground no day-1 water reaches is broad flat benches divided by bold scarps, in threes; the land near water
      // keeps a few knolls and its scarps)
      const fromStart = Math.max(Math.abs(x - stx), Math.abs(y - sty));
      const dryLand = nearWet > DRY_FROM + 4 * fbm(sDry, x, y, 23, 2) && fromStart > DRY_FROM_START;
      if (!dryLand) land += 0.7 * fbm(sKnoll, x, y, 21, 3) * Math.min(1, Math.max(0, (near - 18) / 6));
      const scarp = Math.max(-1, Math.min(1, fbm(sScarp, x, y, 44, 2) * 60));
      land += 1.3 * scarp * Math.min(1, Math.max(0, (near - 22) / 5));
      const scarp2 = Math.max(-1, Math.min(1, fbm(sScarp2, x, y, 26, 2) * 60));
      if (!dryLand) land += 1.0 * scarp2 * Math.min(1, Math.max(0, (near - 19) / 4));
      // (the benches' levels step by three from a phase that drifts across the map, so the dry benches do not all
      // stand on the meadows' levels: no two or three levels hold most of the map)
      const phase = Math.floor(1.5 + 1.5 * fbm(sPhase, x, y, 40, 2));
      const threes = (v: number) => Math.round((v - phase) / 3) * 3 + phase;
      if (dryLand) {
        // (round an empty basin its old beach keeps its level, the sill + 1, a few tiles wide)
        if (near > 0.5 && !(nearBasin < 3.5 + 2 * fbm(sBeach, x, y, 8, 2))) land = threes(land);
      } else {
        if (near > 21) land = fbm(sThrees, x, y, 50, 2) > -0.25 ? threes(land) : Math.round(land / 2) * 2;
        if (near > 4 && near < 9 && fromStart > 12 && fbm(sKnob, x, y, 9, 2) > 0.42) land += 1;
      }
      // ridges and spurs: crags, a crest and one ledge, never a slope of a level a tile
      for (const rg of plan.ridges) {
        const t = ridgeDist(rg.path, x + 0.5, y + 0.5) - rg.half + 0.9 * fbm(sRidge, x, y, 6, 2);
        const crest = rg.top + rg.rough * fbm(sCrest, x, y, 9, 2);
        const v = t <= 0 ? crest : t <= rg.ledge ? crest - rg.drop : -Infinity;
        if (v > land && near > 2.5) land = v;
      }
      f[i] = Math.min(top, land);
    }

  // the bypass's bed follows the land, and the ground stage 1 fixed or guards with it
  const base = followLand(plan, w, f, sBeach);
  const h = new Uint8Array(N);
  const keep = r.fixed;
  for (let i = 0; i < N; i++) h[i] = keep[i] ? base[i] : Math.max(base[i], Math.max(BED_FLOOR + 1, Math.min(top, Math.round(f[i]))));
  // the bench-width floor on the land away from the water, then the guard again, then no pits, spikes or tongues
  const where = new Uint8Array(N);
  for (let i = 0; i < N; i++) where[i] = !keep[i] && nearAll[i] > 3 ? 1 : 0;
  tidy(h, r, base);
  widenBenches(h, W, H, where);
  for (let i = 0; i < N; i++) if (!keep[i] && h[i] < base[i]) h[i] = base[i];
  tidy(h, r, base);
  return h;
}

/** Stage 1's ground with the bypass's bed following the land (its plan's `bed: { under }`; stage 1 laid it falling
 *  evenly from the pool's sill to its end): past its head and first row, never rising, `BYPASS_UNDER` under the
 *  lowest land within `BYPASS_LOOK` of it, never under its end's level; a wadi a level over its bed beside it, and the
 *  guard beside it read again from its new bed. Fixed tiles hold their ground; every other tile its least. */
function followLand(plan: PremisePlan, w: StageWater, f: Float64Array, sWadi: number): Float64Array {
  const r = w.raster;
  const { W, H } = r;
  const N = W * H;
  const base = Float64Array.from(r.heights);
  const li = plan.links.findIndex((l) => l.kind === "bypass");
  if (li < 0) return base;
  const id = plan.links[li].id;
  const mine: number[] = [];
  for (let i = 0; i < N; i++) if (r.channel[i] === li + 1) mine.push(i);
  if (!mine.length) return base;
  // its head (the pool's sill, held to past its first row) stands as stage 1 laid it
  let head = 0;
  for (const i of r.rows[id]?.[0] ?? []) head = Math.max(head, r.along[i]);
  head += 2;
  let len = 0;
  let end = Infinity;
  for (const i of mine) {
    len = Math.max(len, r.along[i]);
    end = Math.min(end, r.heights[i]);
  }
  const bins = Math.floor(len) + 2;
  const want = new Float64Array(bins).fill(Infinity);
  for (const i of mine) {
    const x = i % W;
    const y = (i - x) / W;
    let low = Infinity;
    for (let dy = -BYPASS_LOOK; dy <= BYPASS_LOOK; dy++)
      for (let dx = -BYPASS_LOOK; dx <= BYPASS_LOOK; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (r.lake[j] || r.channel[j]) continue;
        if (f[j] < low) low = f[j];
      }
    const b = Math.max(0, Math.floor(r.along[i]));
    const v = Math.min(r.heights[i], Math.floor(low) - BYPASS_UNDER);
    if (v < want[b]) want[b] = v;
  }
  // (never rising along it, never under its end)
  let run = Infinity;
  for (let b = 0; b < bins; b++) {
    if (b > head && want[b] < run) run = want[b];
    want[b] = Math.max(end, run);
  }
  const surface = new Float64Array(N).fill(NaN);
  const moved = new Uint8Array(N);
  for (const i of mine) {
    if (r.along[i] <= head) continue;
    const v = Math.min(r.heights[i], want[Math.max(0, Math.floor(r.along[i]))]);
    if (v >= r.heights[i]) continue;
    base[i] = v;
    surface[i] = r.surface[i] - (r.heights[i] - v);
    moved[i] = 1;
  }
  // the wadi and the guard beside the moved bed
  const near = distanceFrom(moved, W, H);
  const nb = new Int32Array(4);
  for (let i = 0; i < N; i++) {
    if (r.fixed[i] || r.lake[i] || r.channel[i] || near[i] > WADI + 1.5) continue;
    near4(W, H, i, nb);
    let need = 0;
    let bed = Infinity;
    for (const j of nb) {
      if (j < 0 || !(r.lake[j] || r.channel[j])) continue;
      const s = moved[j] ? surface[j] : r.surface[j];
      if (!Number.isNaN(s)) need = Math.max(need, Math.floor(s + 0.15) + 1);
      if (moved[j]) bed = Math.min(bed, base[j]);
    }
    base[i] = need;
    // (a ragged strip a level over the bed, then the walls as the land stands)
    const x = i % W;
    const y = (i - x) / W;
    if (near[i] < WADI + 1.3 * fbm(sWadi, x, y, 7, 2)) {
      let b = bed;
      if (b === Infinity) {
        // (the nearest moved bed tile's level)
        let bd = Infinity;
        for (let dy = -3; dy <= 3; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (moved[j] && dx * dx + dy * dy < bd) [bd, b] = [dx * dx + dy * dy, base[j]];
          }
      }
      if (b !== Infinity && f[i] > b + 1) f[i] = Math.max(need, b + 1);
    }
  }
  return base;
}

/** A point's distance to a ridge's line. */
function ridgeDist(path: readonly [number, number][], px: number, py: number): number {
  let best = Infinity;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[k + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L = dx * dx + dy * dy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    const ex = px - ax - t * dx;
    const ey = py - ay - t * dy;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) best = d2;
  }
  return sqrt(best);
}

/** One-tile pits and spikes on the land go, and one-tile tongues (four-lakes-design's `tidy`); stage 1's tiles stand,
 *  and no tile goes under its guard. */
export function tidy(h: Uint8Array, r: WaterRaster, least: ArrayLike<number> = r.heights): void {
  const { W, H } = r;
  const nb = new Int32Array(4);
  const v = [0, 0, 0, 0];
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (let i = 0; i < W * H; i++) {
      if (r.fixed[i] || r.lake[i] || r.channel[i]) continue;
      near4(W, H, i, nb);
      let n = 0;
      for (const j of nb) if (j >= 0) v[n++] = h[j];
      if (n < 4) continue;
      const lo = Math.min(v[0], v[1], v[2], v[3]);
      const hi = Math.max(v[0], v[1], v[2], v[3]);
      let to = h[i];
      if (h[i] < lo) to = lo;
      else if (h[i] > hi) to = hi;
      else {
        let up = 0;
        let down = 0;
        for (const a of v) {
          if (a > h[i]) up++;
          else if (a < h[i]) down++;
        }
        const s = v.slice().sort((p, q) => p - q);
        if (up >= 3 && down === 0) to = s[1];
        else if (down >= 3 && up === 0) to = s[2];
      }
      to = Math.max(to, least[i]);
      if (to !== h[i]) {
        h[i] = to;
        changed++;
      }
    }
    if (!changed) break;
  }
}

/** Where the permanent badwater source stands (D200): a niche in the wall of its link's bed (the gorge), its 3 × 3
 *  floor two levels over the bed beside it, so its water falls into the gorge and leaves by the exit (D498) while no
 *  other source's water reaches it (D171: a source never stands in a flow). Cut into `h`; each source's 3 × 3
 *  south-west corner, by the source's id. A source with no room for a niche is left out (its reason in `notes`). */
export function badwaterNiches(plan: PremisePlan, w: StageWater, h: Uint8Array, notes: string[]): Record<string, [number, number]> {
  const r = w.raster;
  const { W, H } = r;
  const out: Record<string, [number, number]> = {};
  const isWater = (i: number) => r.lake[i] !== 0 || r.channel[i] !== 0;
  for (const s of plan.sources) {
    if (!s.bad) continue;
    const li = plan.links.findIndex((l) => l.id === s.into);
    if (li < 0) continue;
    let best: { x: number; y: number; floor: number; d: number } | null = null;
    for (let y = 1; y + 4 < H; y++)
      for (let x = 1; x + 4 < W; x++) {
        // (the niche's 3 × 3 at (x + 1, y + 1), its ring round it; the ring's side toward the bed opens onto it)
        let bed = -1;
        let ok = true;
        for (let dy = 0; dy < 5 && ok; dy++)
          for (let dx = 0; dx < 5 && ok; dx++) {
            const i = (y + dy) * W + x + dx;
            const inner = dx > 0 && dx < 4 && dy > 0 && dy < 4;
            if (inner) ok = !isWater(i) && !r.fixed[i];
            else if (r.channel[i] === li + 1 && (dx === 0 || dx === 4) !== (dy === 0 || dy === 4)) bed = Math.max(bed, r.heights[i]);
          }
        if (!ok || bed < 0) continue;
        const d = (x + 2.5 - s.at[0]) * (x + 2.5 - s.at[0]) + (y + 2.5 - s.at[1]) * (y + 2.5 - s.at[1]);
        if (!best || d < best.d) best = { x: x + 1, y: y + 1, floor: bed + 2, d };
      }
    if (!best) {
      notes.push(`the badwater source ${s.id} finds no room for a niche beside ${s.into}`);
      continue;
    }
    const { x, y, floor } = best;
    for (let dy = -1; dy <= 3; dy++)
      for (let dx = -1; dx <= 3; dx++) {
        const i = (y + dy) * W + x + dx;
        const inner = dx >= 0 && dx <= 2 && dy >= 0 && dy <= 2;
        if (inner) h[i] = floor;
        else if (!isWater(i) && !r.fixed[i] && h[i] <= floor) h[i] = floor + 1;
      }
    out[s.id] = [x, y];
  }
  return out;
}

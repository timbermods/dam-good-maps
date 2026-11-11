// Stage 2, relief between (docs/PREMISES.md §2.2; four-lakes-design's `designLand` main loop, `rise` and `tidy`): the
// whole map's ground round stage 1's water. Near the water the land is the lower envelope of every water's bowl: beside
// each water a level meadow one level over it, then a crag, a bench and a second crag; a higher water's rim is kept
// from the waters below it. Past the first bench of every water the land is the uplands: plates, broad benches of
// ragged outline, each one level, set from the outlands' surface (which follows the stair's level and falls away to
// the edges) with a lift of its own, so they meet in scarps that run every way: never a terrace ringing a water, nor a
// band along an edge (the game's one dry tone shows those as contour lines). Ridges and spurs are crags; an empty
// basin's beach stands at its sill + 1. Stage 1's fixed tiles stand as they are and every other tile stands at least
// at its guard, so the water stands where the table says.
//
// Distances are one transform a water (`distanceFrom`), each bounded to the box its bowl can reach; the land wanders
// by reading a bowl's distance a few tiles off (a warp), so no contour follows a ruler. Noise is `fbm` on the plan's
// own seeds (named stream `premise.relief`), each field once, the broad ones read on a coarse grid. Integer or portable
// maths only (D366).
//
// The rim is cut by the same plates as the interior: the outlands' fall toward a falling edge and far from the water
// is a plate's mean, never a tile's distance (a tile at a time, it ran in bands along the edge). An empty basin's bank
// stands whole over a broad bench (never a half-step ring round its beach).
//
// The style seam (PREMISES §1.5, `style.ts`): given a theme's style, the uplands take the theme's form in the room
// between the stair's ground and the highest ground, the plan's `sky` (Highest terrain, 22 from Verticality 70, while
// the stair stays under 16) (`styledUplands`): Canyon's mesas, tables in three heights cut by deep dry canyons;
// Highlands' peaks, cones on two in five of the plates' points with level summits, rolling heights between; River
// Valley's terraces, climbing with the distance from the lakes so their steps run along the valley; Lake Basin's low
// rolling floor inside one bold rim along the edges. The hollow behind the skyline (`hollowsOf`) is a level floor in
// a rim of its own, a dry place stage 6 dresses. Past the green of day 1's
// water the ground comes down by the form's `deep` (Canyon's canyons and Highlands' valleys toward the floor); by it,
// a plate stands no higher than the premise's own and the hillsides' cap only comes down (the style's height there
// took the green off the first benches). The hillsides past each meadow take the theme's crags and benches; the
// uplands are graded by the theme's grade (`land/levels.ts` `grader`, #956), Canyon's canyons cut after it. Day 1's
// water, the meadows and the start's ground are the premise's whatever the style.

import { hash32 } from "../../math/hash";
import { distanceFrom } from "../../math/grid";
import { fbm } from "../../math/noise";
import { smoothstep } from "../../math/clamp";
import { hypot, sqrt } from "../../math/portable";
import { BED_FLOOR } from "../../land/genome";
import { widenBenches } from "../../land/benches";
import { THIN } from "../../analysis/ground";
import { grader } from "../../land/levels";
import type { ReliefStyle } from "../style";
import { bodyDist, HEADING_DIR, pathDist, pathLength, pointAt } from "../geom";
import type { Link, PremisePlan } from "../types";
import type { StageWater } from "../water";
import { near4, type WaterRaster } from "./field";

/** A lake's rim, kept from the waters below it: within this many tiles of it no lower water's bowl digs. At 3.2 (the
 *  script's `rim`) a lower meadow came to three tiles of a higher lake, and with the lake's floor deep the rim stood as
 *  a dam wall (`terrain.dam_wall`, seed 3 at 128²). */
const RIM = 6;
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
const TARN = { meadow: 4, crag: 2, rim: 12 };
const BASIN = { beach: 3, crag: 2, rim: 12, bench: 8 };
/** The bypass follows the land (its plan's `bed: { under }`): its bed this many levels under the land beside it, the
 *  land read this far out from its bed; the old channel's floor beside its bed (a wadi) a level over it, this wide. */
const BYPASS_UNDER = 2;
const BYPASS_LOOK = 3;
/** A dry brook's last tiles, where it falls the last level into the water it reaches. */
const MOUTH = 3;
const WADI = 1.7;
/** A hollow behind a ridge (§4.4's dry places): a level floor `under` levels under the ridge's ledge, of radius `r`
 *  tiles (`rBig` past 192², down to `least` where room is short), its outline wandering `wob`, held in a rim a level
 *  over it `rim` tiles wide; none of it within `gap` tiles of a water or bed, its middle `edge` past its radius from
 *  the map's edge. */
const HOLLOW = { r: 7, rBig: 10, least: 4, under: 2, wob: 1.6, rim: 2.5, gap: 5, edge: 2 };
/** Beyond this many tiles from any water the outlands fall away a little more (§2.2). */
const OUTLANDS = 30;
/** How far the land falls toward an edge that falls away, levels a tile over the last `EDGE_RUN` tiles. */
const EDGE_RUN = 10;
const EDGE_FALL = 0.35;
/** The outlands' stair: water levels averaged in cells this many tiles across, then weighted by nearness. */
const STAIR_CELL = 8;
/** The uplands' plates: they begin `from` tiles past the nearest water's meadow (± `wander`, by noise: past its first
 *  crag) and no nearer the start than `start`. A plate is the tiles nearest one of a scatter of points 8 + side ÷ 16
 *  tiles apart (16 at 128², 24 at 256²), read through the land's wander so its sides are ragged; it stands at the
 *  outlands' mean over it, rounded after a lift of its own, up to `lift` levels either way, so neighbours meet in a
 *  step of none to three. */
const PLATE = { from: 5, wander: 3, start: 16, lift: 1.2 };
/** Highlands' peaks: `share` of the plates' points a cone, its summit `low` to 1 of the form's span and level for
 *  `flat` tiles round its point (a summit narrower than the bench-width floor's 5 tiles is worn down by it), falling a
 *  span's height over `reach` plates' widths; between them rolling heights at `base` of the span, `roll` either way
 *  by broad noise; the land the highest of the cones near it and the heights. */
const PEAK = { share: 0.4, low: 0.6, reach: 1.1, flat: 3.5, base: 0.35, roll: 0.2 };
/** A style's uplands stand at least `near` levels over the stair's ground within `green` tiles of day 1's water (a
 *  hillside under it stood as a meadow a level higher, and the green spread past the meadow's width: the soil reaches 16
 *  tiles over level ground), and `far` past it, coming down over `fade` tiles: past the green the land may lie low. */
const FLOOR = { near: 3.5, far: 0.5, green: 16, fade: 12, least: 2 };
/** Canyon's dry canyons: about this share of the plates' edges is cut, this deep under the lower mesa beside it (no
 *  deeper than the ground under the tables) and about this wide across (± by noise), tiles. */
const CANYON = { share: 0.75, depth: 8, wide: 3.4 };
/** Lake Basin's rim: the basin's floor stands at `floor` of the form's span, rolling, and the rim at the top of the
 *  span within `width` of the map's side of each edge: one bold scarp between two broad levels, its line wandering
 *  `wander` tiles, never the steps of River Valley's terraces. */
const BASIN_RIM = { floor: 0.1, width: 0.15, wander: 6 };
/** Canyon's tables: their heights in `tiers`, read from noise `scale` tiles across at each plate's point. */
const MESA = { tiers: 3, scale: 40 };
/** River Valley's terraces: the form's span climbed over `run` tiles from `from` tiles off the stair's water,
 *  wandering by `wander` of it; benched over `benched` times Terracing's share (the terraces are the form: at the
 *  preset's 45 nine tenths of the uplands step). */
const TERRACE = { from: 14, run: 40, wander: 0.1, benched: 2 };
/** How far over the stair the outlands may stand, as a share of the room left under the highest ground. */
const OUTLAND_ROOM = 0.75;
/** A style comes in over this many tiles past the start's own ground (`PLATE.start`), so the start's ground, its frame
 *  and its walk are the premise's own in every theme. */
const STYLE_FROM = 10;
/** The style comes in from `from` tiles off day 1's water over `over` more (its crags and benches by the meadows keep
 *  the theme's). */
const STYLE_GREEN = { from: 4, over: 8 };
/** How far past its meadow a bowl's distance is worked out: its first crag, its bench and second crag, the plates'
 *  start and the land's wander (past it a bowl's land is the uplands'). */
const BOWL_REACH = 30;

/** How far the land has risen `t` tiles beyond a meadow's edge: a crag (`c1` levels in a tile), a bench `w1` wide that
 *  climbs a level, a second crag (`c2`), then benches and crags of `cn` (two). Where `c1` is 1 the crag is a plain
 *  step: a way up (four-lakes-design's `rise`). */
export function rise(t: number, c1: number, w1: number, c2: number, cn = 2): number {
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
    c = cn;
  }
}

/** One water's bowl: the tiles of a water at one level, its meadow and its rim; its distance worked out in its box. */
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
  tiles: number[];
  /** Its box (first and last column and row) and the distance from its water inside it, row by row. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  d: Float64Array;
}

/** A seed of the relief's own for one field of noise (named stream `premise.relief`). */
function seedOf(plan: PremisePlan, name: string): number {
  return hash32(plan.seed, plan.W, plan.H, "premise.relief", name);
}

/** A field of `fbm` over the map, read every `step` tiles and between them (a broad field changes little in a few
 *  tiles). */
function field(seed: number, W: number, H: number, cell: number, octaves: number, step: number): Float64Array {
  return shared(`f${seed}:${W}:${H}:${cell}:${octaves}:${step}`, () => fieldOf(seed, W, H, cell, octaves, step));
}

/** The noise fields worked out so far, by their seed, size and shape: a field depends on the plan's seed and size
 *  alone, so a skeleton's land, its plan's and every re-roll's read the same fields. Never written to. */
const fields = new Map<string, Float64Array>();
function shared(key: string, make: () => Float64Array): Float64Array {
  let f = fields.get(key);
  if (!f) {
    if (fields.size >= 64) fields.clear();
    f = make();
    fields.set(key, f);
  }
  return f;
}

/** `fbm` at every tile of the map (each tile's own value, as `fbm(seed, x, y, cell, octaves)` reads it). */
function fbmField(seed: number, W: number, H: number, cell: number, octaves: number): Float64Array {
  return shared(`t${seed}:${W}:${H}:${cell}:${octaves}`, () => {
    const out = new Float64Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = fbm(seed, x, y, cell, octaves);
    return out;
  });
}

function fieldOf(seed: number, W: number, H: number, cell: number, octaves: number, step: number): Float64Array {
  const out = new Float64Array(W * H);
  const gw = Math.floor((W - 1) / step) + 2;
  const gh = Math.floor((H - 1) / step) + 2;
  const g = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) g[gy * gw + gx] = fbm(seed, gx * step, gy * step, cell, octaves);
  for (let y = 0; y < H; y++) {
    const iy = Math.floor(y / step);
    const ty = (y - iy * step) / step;
    for (let x = 0; x < W; x++) {
      const ix = Math.floor(x / step);
      const tx = (x - ix * step) / step;
      const k = iy * gw + ix;
      out[y * W + x] = (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - ty) + (g[k + gw] * (1 - tx) + g[k + gw + 1] * tx) * ty;
    }
  }
  return out;
}

/** The bowls of stage 1's water, one a water a level, each with its distance in its box. */
function bowlsOf(plan: PremisePlan, w: StageWater): Bowl[] {
  const r = w.raster;
  const { W, H } = r;
  const N = W * H;
  const byKey = new Map<string, Bowl>();
  const add = (i: number, key: string, make: () => Omit<Bowl, "tiles" | "x0" | "y0" | "x1" | "y1" | "d">) => {
    let b = byKey.get(key);
    if (!b) {
      b = { ...make(), tiles: [], x0: 0, y0: 0, x1: 0, y1: 0, d: new Float64Array(0) };
      byKey.set(key, b);
    }
    b.tiles.push(i);
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
    } else if (followsLand(l, wet)) {
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
    // (its box: its water, and as far past its meadow as its land reaches)
    let x0 = W;
    let y0 = H;
    let x1 = -1;
    let y1 = -1;
    for (const i of b.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    const m = Math.ceil(b.meadow + 3 + Math.max(b.rim, BOWL_REACH));
    b.x0 = Math.max(0, x0 - m);
    b.y0 = Math.max(0, y0 - m);
    b.x1 = Math.min(W - 1, x1 + m);
    b.y1 = Math.min(H - 1, y1 + m);
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    const mask = new Uint8Array(bw * bh);
    for (const i of b.tiles) mask[(Math.floor(i / W) - b.y0) * bw + (i % W) - b.x0] = 1;
    b.d = distanceFrom(mask, bw, bh);
    if (b.cut) {
      const { x: cx, y: cy, nx, ny } = b.cut;
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++) {
          const k = (y - b.y0) * bw + x - b.x0;
          if ((x + 0.5 - cx) * nx + (y + 0.5 - cy) * ny > 0.5 && !mask[k]) b.d[k] = Infinity;
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
    for (const i of b.tiles) {
      const x = i % W;
      const y = (i - x) / W;
      const c = Math.floor(y / STAIR_CELL) * cw + Math.floor(x / STAIR_CELL);
      sum[c] += b.level;
      cnt[c]++;
      sx[c] += x + 0.5;
      sy[c] += y + 0.5;
    }
  // (each anchor's point and level, in the cells' order)
  let na = 0;
  for (let c = 0; c < cw * ch; c++) if (cnt[c]) na++;
  const ax = new Float64Array(na);
  const ay = new Float64Array(na);
  const al = new Float64Array(na);
  for (let c = 0, a = 0; c < cw * ch; c++)
    if (cnt[c]) {
      ax[a] = sx[c] / cnt[c];
      ay[a] = sy[c] / cnt[c];
      al[a++] = sum[c] / cnt[c];
    }
  // (read on a coarse grid, then between its points)
  const G = 4;
  const gw = Math.ceil(W / G) + 1;
  const gh = Math.ceil(H / G) + 1;
  const grid = new Float64Array(gw * gh);
  for (let gy = 0; gy < gh; gy++)
    for (let gx = 0; gx < gw; gx++) {
      let sw = 0;
      let sv = 0;
      const px = gx * G;
      const py = gy * G;
      for (let a = 0; a < na; a++) {
        const d2 = (px - ax[a]) * (px - ax[a]) + (py - ay[a]) * (py - ay[a]) + 60;
        const wt = 1 / (d2 * d2);
        sw += wt;
        sv += wt * al[a];
      }
      grid[gy * gw + gx] = sw ? sv / sw : BED_FLOOR + 2;
    }
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    const iy = Math.floor(y / G);
    const ty = y / G - iy;
    const r0 = Math.min(gh - 1, iy) * gw;
    const r1 = Math.min(gh - 1, iy + 1) * gw;
    for (let x = 0; x < W; x++) {
      const ix = Math.floor(x / G);
      const tx = x / G - ix;
      const a = Math.min(gw - 1, ix);
      const b = Math.min(gw - 1, ix + 1);
      out[y * W + x] = (grid[r0 + a] * (1 - tx) + grid[r0 + b] * tx) * (1 - ty) + (grid[r1 + a] * (1 - tx) + grid[r1 + b] * tx) * ty;
    }
  }
  return out;
}

/** How far a tile is from each edge that falls away (the others count as far). */
function edgeNear(plan: PremisePlan, x: number, y: number): number {
  const { W, H, edges } = plan;
  let d = Infinity;
  if (edges.S !== "ridge") d = Math.min(d, y);
  if (edges.N !== "ridge") d = Math.min(d, H - 1 - y);
  if (edges.W !== "ridge") d = Math.min(d, x);
  if (edges.E !== "ridge") d = Math.min(d, W - 1 - x);
  return d;
}

/** A style's value in its range `r` at a noise `n` (−0.5 to 0.5 spans it). */
const inRange = (r: readonly [number, number], n: number): number => r[0] + (r[1] - r[0]) * Math.max(0, Math.min(1, n + 0.5));

/** Stage 2: the whole map's ground round stage 1's water. Deterministic from the plan, its water and the style (none:
 *  the premise's own uplands). */
export function reliefBetween(plan: PremisePlan, w: StageWater, style?: ReliefStyle): Uint8Array {
  const r = w.raster;
  const { W, H } = r;
  const N = W * H;
  const top = plan.top;
  // (the land away from the water may rise past the stair's highest ground, to Highest terrain: the plan's `sky`)
  const sky = Math.max(top, plan.sky ?? top);
  const bowls = bowlsOf(plan, w);
  const stair = stairField(r, bowls);
  const S = (name: string) => seedOf(plan, name);
  // the noise fields, each once (the broad ones read every 4 tiles, the middling every 2)
  const wxF = field(S("wx"), W, H, 36, 3, 4);
  const wyF = field(S("wy"), W, H, 36, 3, 4);
  const wobF = field(S("wob"), W, H, 16, 3, 2);
  const out1F = field(S("out1"), W, H, 46, 4, 4);
  const out2F = field(S("out2"), W, H, 13, 3, 2);
  const warpAF = field(S("warpA"), W, H, 34, 3, 4);
  const warpBF = field(S("warpB"), W, H, 19, 3, 4);
  const cragF = field(S("crag"), W, H, 31, 2, 4);
  const crag2F = field(S("crag2"), W, H, 24, 2, 4);
  const benchF = field(S("bench"), W, H, 27, 2, 4);
  const meadowF = field(S("meadow"), W, H, 27, 2, 4);
  const sLow = S("low");
  const sKnob = S("knob");
  const sBeach = S("beach");
  const sRidge = S("ridge");
  const sCrest = S("crest");
  const sPlate = S("plate");
  const { x: stx, y: sty } = plan.frame.start;
  const hollows = hollowsOf(plan);

  // how near each tile is to any water and to an empty basin (one transform each), and the highest water whose rim
  // it is in (its bowl no lower water's digs)
  const maskAll = new Uint8Array(N);
  const maskBasin = new Uint8Array(N);
  for (const b of bowls)
    for (const i of b.tiles) {
      maskAll[i] = 1;
      if (b.basin) maskBasin[i] = 1;
    }
  const nearAll = distanceFrom(maskAll, W, H);
  const nearBasin = distanceFrom(maskBasin, W, H);
  // (and from the water day 1 holds: a style's land stands low only past the green it gives)
  const maskWet = new Uint8Array(N);
  if (style) for (const b of bowls) if (b.wet) for (const i of b.tiles) maskWet[i] = 1;
  const nearWet = style ? distanceFrom(maskWet, W, H) : nearAll;
  // (and from the stair's own water, its lakes, pool and the falls, neck and gorge between them: River Valley's
  // terraces climb from it, so their steps run along the valley and never ring a side body)
  let nearValley = nearWet;
  if (style?.form === "terraces") {
    const maskValley = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const b = r.lake[i] ? plan.bodies[r.lake[i] - 1] : null;
      const l = r.channel[i] ? plan.links[r.channel[i] - 1] : null;
      if ((b && (b.kind === "lake" || b.kind === "pool")) || (l && (l.kind === "gorge" || l.kind === "fall" || l.id === "neck"))) maskValley[i] = 1;
    }
    nearValley = distanceFrom(maskValley, W, H);
  }
  const lift = new Float64Array(N).fill(-Infinity);
  for (const b of bowls) {
    const bw = b.x1 - b.x0 + 1;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0, k = (y - b.y0) * bw; x <= b.x1; x++, k++) {
        const i = y * W + x;
        if (b.d[k] < b.rim && b.level > lift[i]) lift[i] = b.level;
      }
  }

  // the plates: every tile belongs to one, the tiles nearest one point of a scatter read through the land's wander,
  // so whatever is set a plate at a time meets its neighbours along ragged lines that run every way
  const P = 8 + Math.round(W / 16);
  const pw = Math.ceil(W / P) + 3;
  const ph = Math.ceil(H / P) + 3;
  const px = new Float64Array(pw * ph);
  const py = new Float64Array(pw * ph);
  const plift = new Float64Array(pw * ph);
  for (let cy = 0; cy < ph; cy++)
    for (let cx = 0; cx < pw; cx++) {
      const k = cy * pw + cx;
      px[k] = (cx - 1 + (hash32(sPlate, cx, cy, 0) % 1000) / 1000) * P;
      py[k] = (cy - 1 + (hash32(sPlate, cx, cy, 1) % 1000) / 1000) * P;
      plift[k] = PLATE.lift * ((2 * (hash32(sPlate, cx, cy, 2) % 1000)) / 999 - 1);
    }
  // (each plate's draw for a peak, once a plate rather than once a tile and neighbour)
  const coneHash = new Float64Array(style?.form === "peaks" ? pw * ph : 0);
  for (let k = 0; k < coneHash.length; k++) coneHash[k] = (hash32(sPlate, k, 3) % 1000) / 1000;
  const plateOf = new Int32Array(N);
  // (the next nearest plate, and how much nearer the nearest's point is, tiles: a tile beside its plate's edge has a
  // small `edge`; and the peaks' height, the highest of the nearby points' cones)
  const plate2 = new Int32Array(N);
  const edge = new Float64Array(N);
  const cone = style?.form === "peaks" ? new Float64Array(N) : null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const qx = x + 0.5 + 7 * wxF[i] + 2 * wobF[i];
      const qy = y + 0.5 + 7 * wyF[i] - 2 * wobF[i];
      const gx = Math.floor(qx / P) + 1;
      const gy = Math.floor(qy / P) + 1;
      let best = 0;
      let bd = Infinity;
      let next = 0;
      let nd = Infinity;
      let c = -Infinity;
      for (let cy = Math.max(0, gy - 1); cy <= Math.min(ph - 1, gy + 1); cy++)
        for (let cx = Math.max(0, gx - 1); cx <= Math.min(pw - 1, gx + 1); cx++) {
          const k = cy * pw + cx;
          const dd = (px[k] - qx) * (px[k] - qx) + (py[k] - qy) * (py[k] - qy);
          if (dd < bd) {
            next = best;
            nd = bd;
            bd = dd;
            best = k;
          } else if (dd < nd) {
            nd = dd;
            next = k;
          }
          const hv = cone ? coneHash[k] : 1;
          if (hv < PEAK.share) {
            const ck = PEAK.low + ((1 - PEAK.low) * hv) / PEAK.share - Math.max(0, sqrt(dd) - PEAK.flat) / (PEAK.reach * P);
            if (ck > c) c = ck;
          }
        }
      plateOf[i] = best;
      plate2[i] = next;
      edge[i] = sqrt(nd) - sqrt(bd);
      if (cone) cone[i] = c;
    }
  // how far the outlands fall away, a plate at a time: far from every water, and toward an edge that falls away, as
  // the mean of its tiles' fall (a tile at a time, the fall's contours ran parallel to the edge: bands along the rim)
  const fsum = new Float64Array(pw * ph);
  const fcnt = new Float64Array(pw * ph);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = plateOf[i];
      fsum[k] += 0.06 * Math.max(0, nearAll[i] - OUTLANDS) + EDGE_FALL * Math.max(0, EDGE_RUN - edgeNear(plan, x, y));
      fcnt[k]++;
    }
  const pfall = new Float64Array(pw * ph);
  for (let k = 0; k < pw * ph; k++) if (fcnt[k]) pfall[k] = fsum[k] / fcnt[k];

  // the outlands: a little over the stair near the valley (less where the stair nears the highest ground, so the
  // uplands keep levels to step between, never one flat at the top), falling away far from it and toward the edges
  // a plate at a time
  const outland = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const st = stair[i];
      const over = Math.min(4.6 + 3.4 * Math.max(0, 1 - st / 10) - 0.3 * Math.max(0, st - 8), OUTLAND_ROOM * (top - st));
      let o = st + over + 2.6 * out1F[i] + 1.0 * out2F[i] - pfall[plateOf[i]];
      if (o > top) o = top;
      if (o < BED_FLOOR + 2) o = BED_FLOOR + 2 + 0.6 * fbm(sLow, x, y, 9, 2);
      outland[i] = o;
    }
  // a style's outlands (PREMISES §1.5): the theme's form in the room between the stair's ground and the highest ground,
  // a plate at a time (the peaks a tile at a time, the cones of the plates' points), coming in over `STYLE_FROM` tiles
  // past `PLATE.start`, so the start's ground, its frame and its walk keep the premise's own
  // (and from `THIN` past it: the bench-width floor reads the land that far across, and carried the style's steps in)
  const sk = (x: number, y: number) => (style ? smoothstep((Math.max(Math.abs(x - stx), Math.abs(y - sty)) - PLATE.start - THIN) / STYLE_FROM) : 0);
  // (and within `STYLE_GREEN` of day 1's water the land stays the premise's: the style's uplands took the green off
  // its first benches, and a map past 128² fell under the spectrum's 30 % of moist ground)
  const gk = (i: number) => smoothstep((nearWet[i] - STYLE_GREEN.from) / STYLE_GREEN.over);
  // (the plates stand at the premise's own outlands: one by the start's ground, its mean read on the style's cap past
  // it, took the style's height into that ground)
  const ownOut = outland.slice();
  const styled = style ? styledUplands(style, { W, H, top, sky, pw, ph, px, py, plateOf, plate2, edge, cone, stair, nearWet, nearValley, pfall, seed: S("form") }) : null;
  if (styled)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const k = sk(x, y) * gk(i);
        // (the hillsides' cap only comes down with a style: raised, it took the green off the first benches)
        if (k > 0 && styled.hill[i] < outland[i]) outland[i] += (styled.hill[i] - outland[i]) * k;
      }

  // the lower envelope of every water's bowl, each rising from its meadow to the outlands and no further, never under
  // its meadow; a higher water's rim kept from the waters below it; and how far past the nearest meadow each tile
  // lies (the uplands begin past it). Where no bowl reaches, the outlands.
  const land = new Float64Array(N).fill(Infinity);
  const inner = new Float64Array(N).fill(Infinity);
  // (both are least values over the bowls, so the order they are read in changes nothing: the lowest first, since a
  // bowl's ground never stands under its level + 1, and a tile a lower bowl already brought that low needs no more of
  // a higher one than its distance)
  for (const b of [...bowls].sort((p, q) => p.level - q.level)) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * W + x;
        const di = b.d[(y - b.y0) * bw + x - b.x0];
        if (di === Infinity || b.level < lift[i]) continue;
        const wob = wobF[i];
        let d: number;
        if (di < 6) d = di + 0.8 * wob * Math.min(1, di / 3);
        else {
          // (the hillside wanders: its distance read a few tiles off)
          const xj = x + Math.round(7 * wxF[i]) - b.x0;
          const yj = y + Math.round(7 * wyF[i]) - b.y0;
          const dj = xj >= 0 && yj >= 0 && xj < bw && yj < bh ? b.d[yj * bw + xj] : Infinity;
          d = Math.max(6, Math.min(dj, di + 12) + 0.8 * wob);
        }
        // (the meadow is measured true from the shore: water reaches 16 tiles over level ground and stops at the
        // first step up; the hillside beyond it wanders)
        // (an empty basin's beach wanders from one tile to `BASIN.beach`, so its old shore never runs as a ring)
        const meadow = b.basin ? Math.max(1, Math.min(BASIN.beach, BASIN.beach - 1 + 2.5 * meadowF[i])) : b.meadow + (b.meadow > 4 ? 3 * meadowF[i] : 0);
        const hill = Math.max(0, d - meadow);
        if (hill < inner[i]) inner[i] = hill;
        if (b.level + 1 >= land[i]) continue;
        const dw = hill * (1 + 0.3 * warpAF[i]) + 5 * warpBF[i] * Math.min(1, hill / 6);
        // (a style's crags stand `crag` levels taller, its benches `bench` times as wide, its later crags `later`)
        // (a style's hillside: its crags and benches drawn in the theme's ranges, coming in with the style)
        const k = style ? sk(x, y) : 0;
        let c1 = Math.max(1, Math.min(4, Math.round(2.4 + 3.2 * cragF[i])));
        let c2 = Math.max(1, Math.min(3, Math.round(1.9 + 2.4 * crag2F[i])));
        let w1 = 10 + 6 * benchF[i];
        let cn = 2;
        if (style && k > 0) {
          c1 = Math.round(c1 + (inRange(style.crag, cragF[i]) - c1) * k);
          c2 = Math.round(c2 + (inRange(style.crag2, crag2F[i]) - c2) * k);
          w1 += (inRange(style.bench, benchF[i]) - w1) * k;
          cn += (style.later - cn) * k;
        }
        // (an empty basin's bank: one wall and a broad bench over it, so its bed reads as a lake's that went dry and
        // its hillside never rings it a level a tile or two at a time)
        if (b.basin) w1 = Math.max(w1, BASIN.bench);
        // (an empty basin's bank stands whole at its old waterline, never a half-step ring round its beach)
        const up = b.steep ? rise(Math.max(0, dw), 4, 3, 3) : rise(b.basin && dw > 0 ? Math.max(1.2, dw) : Math.max(0, dw), Math.max(c1, b.crag ?? 0), w1, c2, cn);
        const v = b.level + 1 + Math.min(up, Math.max(0, outland[i] - b.level - 1));
        if (v < land[i]) land[i] = v;
      }
  }
  for (let i = 0; i < N; i++) if (land[i] === Infinity) land[i] = outland[i];

  // the uplands: past the first bench of every water, the plates, each standing at the land's mean over it with a lift
  // of its own
  const plate = new Int32Array(N).fill(-1);
  const psum = new Float64Array(pw * ph);
  const pcnt = new Float64Array(pw * ph);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (inner[i] <= PLATE.from + PLATE.wander * warpBF[i]) continue;
      if (Math.max(Math.abs(x - stx), Math.abs(y - sty)) < PLATE.start) continue;
      const best = plateOf[i];
      plate[i] = best;
      psum[best] += ownOut[i];
      pcnt[best]++;
    }
  const plevel = new Float64Array(pw * ph);
  for (let k = 0; k < pw * ph; k++) if (pcnt[k]) plevel[k] = Math.max(BED_FLOOR + 1, Math.min(top, Math.round(psum[k] / pcnt[k] + plift[k])));
  // with a style the uplands are its form, graded by the theme's grade (#956): benched `step` levels apart over
  // Terracing's share, rolling elsewhere
  const grade = style ? grader(style.grade, plan.seed, 0, W, H) : null;
  const terraceF = style && style.step > 1 ? field(S("terrace"), W, H, 24, 2, 2) : null;
  const benched = style ? Math.min(1, style.benched * (style.form === "terraces" ? TERRACE.benched : 1)) : 0;
  const phase = style ? hash32(S("terrace"), 1) % style.step : 0;

  // (each ridge's box, and the square of its reach past it: its half, its ledge and two tiles)
  const ridgeBox = plan.ridges.map((rg) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [px, py] of rg.path) {
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
    const reach = rg.half + rg.ledge + 2;
    return [x0, y0, x1, y1, reach * reach];
  });
  const knobF = fbmField(sKnob, W, H, 9, 2);
  const ridgeF = plan.ridges.length ? fbmField(sRidge, W, H, 6, 2) : knobF;
  const crestF = plan.ridges.length ? fbmField(sCrest, W, H, 9, 2) : knobF;
  const f = new Float64Array(N);
  const narrow = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const near = nearAll[i];
      let v = land[i];
      if (plate[i] >= 0) {
        v = plevel[plate[i]];
        if (grade && styled) {
          const k = sk(x, y) * gk(i);
          const own = v;
          // (the grade comes in with the style too: graded at the start's ground, a plate by it took the theme's steps
          // where the premise's own land stands, and the bench-width floor carried them in)
          const graded = grade(v + (styled.up[i] - v) * k, x, y, terraceF && (terraceF[i] + 1) / 2 > 1 - benched ? style!.step : 1, phase);
          v = k >= 1 ? graded : Math.round(own + (graded - own) * k);
          // (by day 1's water a plate stands no higher than the premise's own, the style's height coming in over the
          // green: a higher plate took the green off the benches under it)
          if (v > own && nearWet[i] < FLOOR.green) v = Math.round(own + (v - own) * smoothstep((nearWet[i] - FLOOR.green / 2) / (FLOOR.green / 2)));
          // (Canyon's canyons cut after the grade, and kept narrow: the bench-width floor leaves them)
          if (k > 0.5 && styled.cut[i] < v) {
            v = styled.cut[i];
            narrow[i] = 1;
          }
        }
      }
      else if (near > 4 && near < 9 && !(nearBasin[i] < 6) && Math.max(Math.abs(x - stx), Math.abs(y - sty)) > 12 && knobF[i] > 0.42) v += 1;
      // ridges and spurs: crags, a crest and one ledge, never a slope of a level a tile
      if (near > 2.5)
        for (let q = 0; q < plan.ridges.length; q++) {
          const rg = plan.ridges[q];
          // (a tile whose distance to the ridge's box is a tile past its ledge is past it: no root to read)
          const bx = ridgeBox[q];
          const ex = Math.max(0, bx[0] - x - 0.5, x + 0.5 - bx[2]);
          const ey = Math.max(0, bx[1] - y - 0.5, y + 0.5 - bx[3]);
          if (ex * ex + ey * ey > bx[4]) continue;
          const t0 = ridgeDist(rg.path, x + 0.5, y + 0.5) - rg.half;
          if (t0 > rg.ledge + 1) continue;
          const t = t0 + 0.9 * ridgeF[i];
          const crest = rg.top + rg.rough * crestF[i];
          const cv = t <= 0 ? crest : t <= rg.ledge ? crest - rg.drop : -Infinity;
          if (cv > v) v = cv;
        }
      // the hollows behind the ridges: a level floor in a rim of its own (§4.4's dry places)
      if (near >= HOLLOW.gap)
        for (const hl of hollows) {
          const dd = hollowDist(plan, hl, x, y);
          if (dd < 0) v = hl.floor;
          else if (dd < HOLLOW.rim && v < hl.floor + 1) v = hl.floor + 1;
        }
      f[i] = Math.min(sky, v);
    }

  // the dry beds follow the land, and the ground stage 1 fixed or guards with it
  const base = followLand(plan, w, f, sBeach);
  const h = new Uint8Array(N);
  const keep = r.fixed;
  for (let i = 0; i < N; i++) h[i] = keep[i] ? base[i] : Math.max(base[i], Math.max(BED_FLOOR + 1, Math.min(sky, Math.round(f[i]))));
  // the bench-width floor on the land away from the water, then the guard again, then no pits, spikes or tongues
  const where = new Uint8Array(N);
  // (never on the start's ground: the floor reads the land a run of treads across, and carried a style's steps into the
  // ground every theme keeps as the premise's own; its benches there are the bowls' own, ten tiles wide and more)
  for (let i = 0; i < N; i++) where[i] = !keep[i] && nearAll[i] > 3 && !narrow[i] && Math.max(Math.abs((i % W) - stx), Math.abs(Math.floor(i / W) - sty)) >= PLATE.start ? 1 : 0;
  tidy(h, r, base);
  widenBenches(h, W, H, where);
  for (let i = 0; i < N; i++) if (!keep[i] && h[i] < base[i]) h[i] = base[i];
  tidy(h, r, base);
  return h;
}

/** A style's uplands (PREMISES §1.5), unrounded: `hill`, what the hillside past a meadow rises to (the bowls' cap), and
 *  `up`, the uplands themselves (Canyon's canyons cut into its mesas). Each plate stands at its form's share of the
 *  room between its ground (the stair's mean over it, plus `FLOOR`) and the highest ground: Canyon's mesas a share
 *  drawn high for each; Highlands' peaks the cones of the plates' points, a tile at a time; River Valley's terraces
 *  higher the farther the plate lies from the lakes; Lake Basin's low floor inside a rim along the edges. Relief widens the
 *  span about its middle. */
function styledUplands(
  style: ReliefStyle,
  g: { W: number; H: number; top: number; sky: number; pw: number; ph: number; px: Float64Array; py: Float64Array; plateOf: Int32Array; plate2: Int32Array; edge: Float64Array; cone: Float64Array | null; stair: Float64Array; nearWet: Float64Array; nearValley: Float64Array; pfall: Float64Array; seed: number },
): { hill: Float64Array; up: Float64Array; cut: Float64Array } {
  const { W, H, top, sky, pw, ph, plateOf } = g;
  const N = W * H;
  const M = pw * ph;
  // each plate's ground and its distance from day 1's water, as means over its tiles
  const sSum = new Float64Array(M);
  const nSum = new Float64Array(M);
  const cnt = new Float64Array(M);
  for (let i = 0; i < N; i++) {
    const k = plateOf[i];
    sSum[k] += g.stair[i];
    nSum[k] += Math.min(g.nearWet[i], 80);
    cnt[k]++;
  }
  const [lo, hi] = style.span;
  const mid = (lo + hi) / 2;
  const share = (u: number) => Math.max(0, mid + (u - mid) * style.amp);
  // (past the green the floor comes down to the stair's ground, and by the form's `deep` toward the map's floor: a
  // mesa's table keeps the stair's, its canyons go down)
  const floorOf = (st: number, wet: number, deep = style.deep) => {
    const far = st + FLOOR.far - deep * Math.max(0, st + FLOOR.far - BED_FLOOR - FLOOR.least);
    return Math.max(BED_FLOOR + FLOOR.least, Math.min(top, st + FLOOR.near + (far - st - FLOOR.near) * smoothstep((wet - FLOOR.green) / FLOOR.fade)));
  };
  const level = new Float64Array(M);
  const base = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    if (!cnt[k]) continue;
    const st = sSum[k] / cnt[k];
    const near = nSum[k] / cnt[k];
    // (a mesa's table: its height read from broad noise at its point, in three heights, so neighbours often share one
    // and the tables run wide)
    const t = (fbm(g.seed + 3, g.px[k], g.py[k], MESA.scale, 2) + 1) / 2;
    const u = style.form === "mesas" ? lo + (hi - lo) * Math.min(1, Math.floor(t * MESA.tiers) / (MESA.tiers - 1)) : mid;
    const fl = floorOf(st, near, style.form === "mesas" ? 0 : style.deep);
    base[k] = floorOf(st, near);
    level[k] = fl + share(u) * (sky - fl) - 0.5 * g.pfall[k];
  }
  const hill = new Float64Array(N);
  const up = new Float64Array(N);
  const cut = new Float64Array(N).fill(Infinity);
  const roll = style.form !== "mesas" ? fbmField(g.seed + 5, W, H, 22, 3) : null;
  const rimF = style.form === "basin" ? fbmField(g.seed + 9, W, H, 17, 2) : null;
  const wideF = style.form === "mesas" ? fbmField(g.seed + 7, W, H, 9, 2) : null;
  // (each edge between two plates draws whether it is a canyon once, not once a tile along it)
  const canyons = new Map<number, number>();
  const canyonDraw = (a: number, b: number): number => {
    const key = a * M + b;
    let v = canyons.get(key);
    if (v === undefined) {
      v = (hash32(g.seed, a, b, 1) % 1000) / 1000;
      canyons.set(key, v);
    }
    return v;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = plateOf[i];
      let v = level[k];
      if (style.form !== "mesas") {
        // (a tile at a time: the peaks the cones; the terraces climbing with the distance from the stair's water, so
        // their steps run along the valley; the basin's floor low and rolling, its rim rising toward the map's edges)
        const wet = g.nearWet[i];
        const fl = floorOf(g.stair[i], wet);
        const n = roll![i];
        let u: number;
        if (g.cone) u = Math.max(g.cone[i], PEAK.base + PEAK.roll * n);
        else if (style.form === "terraces") u = (g.nearValley[i] - TERRACE.from) / TERRACE.run + TERRACE.wander * n;
        else {
          const e = Math.min(x, y, W - 1 - x, H - 1 - y) + BASIN_RIM.wander * rimF![i];
          u = BASIN_RIM.floor * (0.5 + 0.5 * n) + (e < BASIN_RIM.width * W ? 1 - BASIN_RIM.floor : 0);
        }
        // (the basin's rim stands round the map: its edges never fall away)
        v = fl + share(lo + (hi - lo) * Math.max(0, Math.min(1, u))) * (sky - fl) - (style.form === "basin" ? 0 : 0.5 * g.pfall[k]);
        // (a terrace's tread is level and its riser a crisp step of the form's own, up from the stair's ground)
        if (style.form === "terraces") v = fl + style.step * Math.floor((v - fl) / style.step + 0.5);
      }
      hill[i] = v;
      up[i] = v;
      // (a canyon: along most of the edges between tables, cut deep toward their ground, its walls the tables' own)
      if (style.form === "mesas") {
        const k2 = g.plate2[i];
        const wide = CANYON.wide * (1 + 0.45 * wideF![i]);
        if (g.edge[i] < wide && canyonDraw(Math.min(k, k2), Math.max(k, k2)) < CANYON.share) cut[i] = Math.max(Math.min(base[k], base[k2]), Math.min(level[k], level[k2]) - CANYON.depth);
      }
    }
  return { hill, up, cut };
}

/** The dry beds that follow the land at stage 2 (their plan's bed is where stage 1 laid them, falling evenly): the
 *  bypass (its `bed: { under }`), and every dry brook, a notch's bed or a basin's spill, so the bed runs two deep in
 *  the land it crosses, its bench at its bed + 2 (§4.2: a dam to pond's, and the bench a notch's thread greens), never
 *  on a dyke over lower ground. */
export function followsLand(l: Link, wet: boolean): boolean {
  return l.kind === "bypass" || (l.kind === "brook" && !wet);
}

/** Stage 1's ground with each dry bed that follows the land (`followsLand`) cut into it: past its head and first row,
 *  never rising, `BYPASS_UNDER` under the lowest land within `BYPASS_LOOK` of it, never under its end's level; a wadi
 *  a level over its bed beside it (stage 1's strip lowered with its bed), and the guard beside it read again from its
 *  new bed. Fixed tiles hold their ground; every other tile its least. */
function followLand(plan: PremisePlan, w: StageWater, f: Float64Array, sWadi: number): Float64Array {
  const r = w.raster;
  const { W, H } = r;
  const N = W * H;
  const base = Float64Array.from(r.heights);
  const surface = new Float64Array(N).fill(NaN);
  const moved = new Uint8Array(N);
  plan.links.forEach((l, li) => {
    if (!followsLand(l, l.wet && !(w.table.links[l.id]?.shut ?? false))) return;
    const id = l.id;
    const mine: number[] = [];
    for (let i = 0; i < N; i++) if (r.channel[i] === li + 1) mine.push(i);
    if (!mine.length) return;
    // its head (its body's sill, held to past its first row) stands as stage 1 laid it
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
    // (never rising along it, never under its end; a brook a level over the lake it falls into but for its last
    // tiles, so the lake's water stays out of it)
    const into = plan.bodies.some((b) => b.id === l.to && !b.dry);
    let run = Infinity;
    for (let b = 0; b < bins; b++) {
      if (b > head && want[b] < run) run = want[b];
      want[b] = Math.max(l.kind === "brook" && into && b < len - MOUTH ? end + 1 : end, run);
    }
    for (const i of mine) {
      if (r.along[i] <= head) continue;
      const v = Math.min(r.heights[i], want[Math.max(0, Math.floor(r.along[i]))]);
      if (v >= r.heights[i]) continue;
      base[i] = v;
      surface[i] = r.surface[i] - (r.heights[i] - v);
      moved[i] = 1;
    }
  });
  // the wadi and the guard beside the moved beds
  const near = distanceFrom(moved, W, H);
  const nb = new Int32Array(4);
  /** The nearest moved bed tile's level within 3 tiles, or Infinity. */
  const bedNear = (x: number, y: number): number => {
    let b = Infinity;
    let bd = Infinity;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (moved[j] && dx * dx + dy * dy < bd) [bd, b] = [dx * dx + dy * dy, base[j]];
      }
    return b;
  };
  for (let i = 0; i < N; i++) {
    if (r.lake[i] || r.channel[i] || near[i] > WADI + 1.5) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (r.fixed[i]) {
      // (stage 1's strip beside a moved bed goes down with it, a level over it; any other fixed tile stands)
      if (r.crest[i] || r.pool[i] || near[i] > WADI + 1.3) continue;
      let wet = false;
      for (let dy = -1; dy <= 1 && !wet; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (r.lake[j] || (r.channel[j] && !moved[j])) wet = true;
        }
      if (wet) continue;
      const b = bedNear(x, y);
      if (b !== Infinity && base[i] > b + 1) base[i] = b + 1;
      continue;
    }
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
    if (near[i] < WADI + 1.3 * fbm(sWadi, x, y, 7, 2)) {
      const b = bed !== Infinity ? bed : bedNear(x, y);
      if (b !== Infinity && f[i] > b + 1) f[i] = Math.max(need, b + 1);
    }
  }
  return base;
}

/** A hollow behind a ridge (`hollowsOf`): its middle, its radius and its floor's level. */
export interface Hollow {
  x: number;
  y: number;
  r: number;
  floor: number;
}

/** The hollow behind the skyline (`HOLLOW`; PREMISES §4.4's dry places), where it fits: on the skyline's side away
 *  from the map's middle (as `placeRidges` set it), along it from its middle out, the largest whose middle lies inside
 *  the map and its own radius or more from every water and bed, clear of the other ridges and the start; its floor
 *  two levels over the highest water, so no water ever reaches it. Where a water or bed comes nearer than `gap`, the
 *  land stands as it was (stage 2 reads `nearAll`, stage 6 the moisture), so the hollow is the dry ground's part of
 *  it. Stage 2 shapes it and stage 6 dresses it, from this one reading. */
export function hollowsOf(plan: PremisePlan): Hollow[] {
  const { W, H } = plan;
  const g = plan.ridges.find((o) => o.role === "skyline");
  if (!g || g.path.length < 2) return [];
  const floor = g.top - g.drop - HOLLOW.under;
  if (floor < Math.max(...plan.bodies.map((b) => b.sill)) + 2 || floor <= BED_FLOOR) return [];
  const len = pathLength(g.path);
  for (let r = W > 192 ? HOLLOW.rBig : HOLLOW.r; r >= HOLLOW.least; r--)
    for (const at of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const { p, dir } = pointAt(g.path, len * at);
      let nx = -dir[1];
      let ny = dir[0];
      if ((p[0] - W / 2) * nx + (p[1] - H / 2) * ny < 0) [nx, ny] = [-nx, -ny];
      const off = g.half + g.ledge + 2 + r;
      const x = p[0] + nx * off;
      const y = p[1] + ny * off;
      if (Math.min(x, y, W - x, H - y) < r + HOLLOW.edge) continue;
      if (Math.max(Math.abs(x - plan.frame.start.x), Math.abs(y - plan.frame.start.y)) < r + HOLLOW.rim + PLATE.start) continue;
      if (plan.bodies.some((b) => bodyDist(x, y, b) < r)) continue;
      if (plan.links.some((l) => l.path && pathDist(x, y, l.path).d < r)) continue;
      if (plan.ridges.some((o) => o !== g && ridgeDist(o.path, x, y) < r + HOLLOW.rim + o.half + o.ledge)) continue;
      return [{ x, y, r, floor }];
    }
  return [];
}

/** How far a tile lies outside a hollow's wandering outline, in tiles (under 0 inside it). */
export function hollowDist(plan: PremisePlan, hl: Hollow, x: number, y: number): number {
  const d = hypot(x + 0.5 - hl.x, y + 0.5 - hl.y) - hl.r;
  return d > HOLLOW.wob + HOLLOW.rim ? d : d + HOLLOW.wob * fbm(hollowSeed(plan), x, y, 7, 2);
}

/** The hollows' noise seed (`seedOf(plan, "hollow")`), worked out once a plan's seed and size. */
const hollowMemo = { seed: NaN, W: 0, H: 0, value: 0 };
function hollowSeed(plan: PremisePlan): number {
  const m = hollowMemo;
  if (m.seed !== plan.seed || m.W !== plan.W || m.H !== plan.H) {
    m.value = seedOf(plan, "hollow");
    m.seed = plan.seed;
    m.W = plan.W;
    m.H = plan.H;
  }
  return m.value;
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

/** The `k`th smallest of four (1 or 2). */
function nth(v: number[], k: number): number {
  const a = Math.min(v[0], v[1]);
  const b = Math.max(v[0], v[1]);
  const c = Math.min(v[2], v[3]);
  const d = Math.max(v[2], v[3]);
  if (k === 1) return Math.min(Math.max(a, c), Math.min(b, d));
  return Math.max(Math.max(a, c), Math.min(b, d));
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
        // (the second lowest of the four, or the second highest)
        if (up >= 3 && down === 0) to = nth(v, 1);
        else if (down >= 3 && up === 0) to = nth(v, 2);
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

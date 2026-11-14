// The wall with one gate's look, measured (docs/PREMISES.md §5.1 "Measured, the land round"; planning's verdict of
// 2026-11-14 on the first sheet: the wall a ruler line, the lake a canal lake, the brooks stripes, the dry side a blank
// plain). Four readings of a built map, reported with every sheet and held by the heavy maps test: the longest straight
// run of the range's foot line, the lake's shore along the wall and its width's range, the brooks' orders and how long
// two run side by side, and the dry side's share a canal from the Gate can water.

import { atan2, cos, hypot, sin } from "../math/portable";
import { rangeAt, type GateRange } from "./gateRange";
import { besideRun, BROOK_MEANDER, brookBends } from "./gateBrooks";
import { gateOf, onLocal, onMap, turnOf } from "./premises/wallGate";
import type { Point, PremisePlan } from "./types";
import type { StageWater } from "./water";

/** The foot line is straight where it keeps within this many tiles of the line between a run's ends. */
export const FOOT_STRAIGHT = 2;
/** The valley's ground by the wall, read in each column of u this far before the spine (× the range's width's growth
 *  with the map), four tiles off the spine. */
const FOOT_REACH = 22;

/** The range's foot toward the valley, a local v for each tile of u: the valley's ground by the wall there is the
 *  lower quarter of the column's heights within `FOOT_REACH` tiles before the spine, the plan's beds left out (read
 *  with the beds of the plunge pool and the lake's arms, the ground stood two levels under their banks and the foot
 *  was read at the water's edge, the pool's shore for the wall's, 128²), and the foot is the first tile, walking from
 *  the spine toward the valley, that stands within a level of it (the Veil's cleft is the wall's: the line crosses its
 *  mouth on the face);
 *  the line is then read as the median of five neighbouring columns (a gully a tile or two wide is not a turn of the
 *  wall). And the longest run of it that keeps within `FOOT_STRAIGHT` tiles of the line between its ends, in tiles of
 *  map, with the u it starts at. */
export function wallFoot(plan: PremisePlan, heights: ArrayLike<number>, water: StageWater): { foot: number[]; run: number; at: number } {
  const g = gateOf(plan)!;
  const T = turnOf(plan, g);
  const N = plan.W;
  const tile = (u: number, v: number): number => {
    const [x, y] = onMap(T, [u, v]);
    const xi = Math.max(0, Math.min(N - 1, Math.floor(x)));
    const yi = Math.max(0, Math.min(N - 1, Math.floor(y)));
    return yi * N + xi;
  };
  const at = (u: number, v: number): number => heights[tile(u, v)];
  const r = water.raster;
  const wet = (u: number, v: number): boolean => r.lake[tile(u, v)] > 0 || r.channel[tile(u, v)] > 0 || r.pool[tile(u, v)] > 0;
  const reach = FOOT_REACH * (0.6 + (0.4 * N) / 128);
  const raw: number[] = [];
  for (let k = 0; k < N; k++) {
    const u = k + 0.5;
    const top = Math.floor(rangeAt(g.range, u).v) + 0.5;
    const col: number[] = [];
    for (let v = top - 4; v > Math.max(0, top - reach); v -= 1) if (!wet(u, v)) col.push(at(u, v));
    if (!col.length) for (let v = top - 4; v > Math.max(0, top - reach); v -= 1) col.push(at(u, v));
    col.sort((a, b) => a - b);
    const ground = col.length ? col[col.length >> 2] : 0;
    let f = top;
    while (f > 1 && (at(u, f) > ground + 1 || (f >= g.face && wet(u, f)))) f -= 1;
    raw.push(f);
  }
  const foot = raw.map((_, k) => {
    const w = raw.slice(Math.max(0, k - 2), Math.min(N, k + 3)).sort((a, b) => a - b);
    return w[w.length >> 1];
  });
  let run = 0;
  let from = 0;
  for (let a = 0; a < N; a++)
    for (let b = N - 1; b > a; b--) {
      const len = hypot(b - a, foot[b] - foot[a]);
      if (len <= run) break;
      let ok = true;
      for (let k = a + 1; k < b && ok; k++) {
        const line = foot[a] + ((foot[b] - foot[a]) * (k - a)) / (b - a);
        // (its distance from the line, not its offset along v: a foot that runs at 45° is as straight)
        if ((Math.abs(foot[k] - line) * (b - a)) / len > FOOT_STRAIGHT) ok = false;
      }
      if (ok) {
        run = len;
        from = a;
        break;
      }
    }
  return { foot, run, at: from };
}

/** A lake's shore lies along the wall where it is the lake's side toward the range and runs within this angle of the
 *  range's own line there (radians: 30°). */
export const SHORE_ALONG = 0.5236;

/** The valley's lake as stage 1 laid it: the share of its shore that lies along the wall (its side toward the range,
 *  running within `SHORE_ALONG` of the range's spine there; a round lake has a sixth of its shore so, a lake laid
 *  along the wall's foot near half), and its width's range along its long axis (the tiles across it at each tile of
 *  its length, its two ends' tenths left out). */
export function lakeShape(plan: PremisePlan, water: StageWater): LakeShape {
  const g = gateOf(plan)!;
  const T = turnOf(plan, g);
  const r = water.raster;
  const li = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  return lakeShapeOn(r.W, r.H, (i) => r.lake[i] === li, (x, y) => onLocal(T, [x, y]), g.range);
}

export type LakeShape = { byWall: number; width: [number, number]; shore: number };

/** A canal lake (planning's verdict of 2026-11-14): more than `byWall` of its shore along the wall, or its width
 *  varying less than `varies`-fold along it. */
export const LAKE_CANAL = { byWall: 1 / 3, varies: 2 } as const;

/** What is wrong with a lake's shape by `LAKE_CANAL`, in a line, or null. */
export function lakeCanal(shape: LakeShape, tighter = 0): string | null {
  if (shape.byWall > LAKE_CANAL.byWall - tighter) return `${Math.round(100 * shape.byWall)} % of its shore lies along the range (a third at most)`;
  if (shape.width[1] < (LAKE_CANAL.varies + 4 * tighter) * shape.width[0]) return `it is ${shape.width[0]} to ${shape.width[1]} tiles across along its length (${LAKE_CANAL.varies}-fold or more)`;
  return null;
}

/** `lakeShape` of the tiles `lake` says are the lake's, on a grid `W` by `H` whose points `toLocal` gives in the
 *  range's frame (the map's tiles through the plan's turn; the layout's own grid as it is). */
export function lakeShapeOn(W: number, H: number, lake: (i: number) => boolean, toLocal: (x: number, y: number) => Point, range: GateRange): LakeShape {
  const on = (x: number, y: number): number => (x >= 0 && y >= 0 && x < W && y < H && lake(y * W + x) ? 1 : 0);
  const tiles: Point[] = [];
  let shore = 0;
  let near = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!on(x, y)) continue;
      const [u, v] = toLocal(x + 0.5, y + 0.5);
      tiles.push([u, v]);
      if (on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) continue;
      shore++;
      // the shore's outward normal there: away from the lake's tiles within six tiles (a cove of a few tiles is not a
      // turn of the shore)
      let [nx, ny] = [0, 0];
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++)
          if (on(x + dx, y + dy)) {
            nx -= dx;
            ny -= dy;
          }
      const [u1, v1] = toLocal(x + 0.5 + nx, y + 0.5 + ny);
      const [du, dv] = [u1 - u, v1 - v];
      const dl = hypot(du, dv);
      if (!(dl > 0)) continue;
      // the range's line there, over 16 tiles of u
      const slope = (rangeAt(range, u + 8).v - rangeAt(range, u - 8).v) / 16;
      const wl = hypot(1, slope);
      // (the normal toward the range, and square to the range's line within `SHORE_ALONG`)
      const toward = (-slope * du + dv) / (wl * dl);
      if (toward >= cos(SHORE_ALONG)) near++;
    }
  if (!tiles.length) return { byWall: 0, width: [0, 0], shore: 0 };
  // its long axis: the direction of its tiles' greatest spread
  let [mu, mv] = [0, 0];
  for (const [u, v] of tiles) {
    mu += u;
    mv += v;
  }
  mu /= tiles.length;
  mv /= tiles.length;
  let [suu, svv, suv] = [0, 0, 0];
  for (const [u, v] of tiles) {
    suu += (u - mu) * (u - mu);
    svv += (v - mv) * (v - mv);
    suv += (u - mu) * (v - mv);
  }
  const th = 0.5 * atan2(2 * suv, suu - svv);
  const [ax, ay] = [cos(th), sin(th)];
  const across = new Map<number, number>();
  for (const [u, v] of tiles) {
    const t = Math.round((u - mu) * ax + (v - mv) * ay);
    across.set(t, (across.get(t) ?? 0) + 1);
  }
  const ts = [...across.keys()].sort((a, b) => a - b);
  const cut = Math.floor(ts.length / 10);
  const mid = ts.slice(cut, ts.length - cut).map((t) => across.get(t)!);
  return { byWall: near / shore, width: [Math.min(...mid), Math.max(...mid)], shore };
}

/** The southern brooks as a tree: its highest order (Strahler's: a spring's brook is 1; where two of one order meet,
 *  the bed below is one more), its ranks (the most brooks in one chain of joins), and the longest stretch of any brook that runs beside another (`gateBrooks.ts`
 *  `besideRun`: within 12 tiles of it and heading as it does), in tiles along it. */
export function brookTree(plan: PremisePlan): { orders: number; ranks: number; beside: number; brooks: number; joins: number } {
  const brooks = plan.links.filter((l) => /^brook\d/.test(l.id) && l.path);
  const order = new Map<string, number>();
  const orderOf = (id: string): number => {
    const had = order.get(id);
    if (had !== undefined) return had;
    order.set(id, 1);
    let o = 1;
    const into = brooks.filter((b) => b.joins?.link === id).sort((a, b) => a.joins!.at - b.joins!.at);
    for (const t of into) {
      const ot = orderOf(t.id);
      o = ot === o ? o + 1 : Math.max(o, ot);
    }
    order.set(id, o);
    return o;
  };
  let orders = 0;
  for (const b of brooks) orders = Math.max(orders, orderOf(b.id));
  // (its ranks: the most brooks in a chain of joins, a twig into a branch into a trunk is three)
  const rankOf = (id: string, seen = 0): number => (seen > brooks.length ? 0 : 1 + Math.max(0, ...brooks.filter((b) => b.joins?.link === id).map((b) => rankOf(b.id, seen + 1))));
  const ranks = Math.max(0, ...brooks.map((b) => rankOf(b.id)));
  let beside = 0;
  for (const a of brooks) for (const b of brooks) if (a !== b) beside = Math.max(beside, besideRun(a.path!, b.path!));
  return { orders, ranks, beside, brooks: brooks.length, joins: brooks.filter((b) => b.joins).length };
}

/** The dry side within reach of a canal: of the tiles past the range's crest line, the share standing at the lake's
 *  sill or up to `DRY_UNDER` levels under it (water led through the Gate runs there by gravity). */
export const DRY_UNDER = 3;

export function drySide(plan: PremisePlan, heights: ArrayLike<number>): { share: number; tiles: number; levels: number } {
  const g = gateOf(plan)!;
  const T = turnOf(plan, g);
  const { W, H } = plan;
  let all = 0;
  let low = 0;
  const seen = new Set<number>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      if (v <= rangeAt(g.range, u).v) continue;
      all++;
      const h = heights[y * W + x];
      seen.add(h);
      if (h <= g.sill && h >= g.sill - DRY_UNDER) low++;
    }
  return { share: all ? low / all : 0, tiles: all, levels: seen.size };
}

// ------------------------------------------------- round 3 (planning's look verdict of 2026-11-14 on round 2, 1c351722)

/** The range's crest by the gate (planning's look verdict of 2026-11-14 on round 2: nothing towered over the gate):
 *  each column of local u, the highest dry ground of the range there; the gap is the columns the Gate's gorge crosses
 *  the range in (its channel's tiles within half the range's widths of its spine). `gate` is the least crest
 *  over the lake's sill within `GATE_CREST.near` columns either side of the gap, `peak` the highest there, `least`
 *  the least crest over the sill along the whole range (the gap and the map's last two columns at each end aside),
 *  `gap` the gap's columns, and `notch` those of them whose crest stands under the least beside it (the gate as the
 *  crest line shows it: where the gorge winds along the range, its walls stand as high as the crest beside it). */
export const GATE_CREST = { near: 12 } as const;

export function gateCrest(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): { gate: number; peak: number; least: number; gap: number; notch: number } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = water.raster;
  const T = turnOf(plan, g);
  const gi = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const best = new Array<number>(W).fill(-1);
  const gorge = new Uint8Array(W);
  for (let i = 0; i < W * H; i++) {
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    const k = Math.floor(u);
    if (k < 0 || k >= W) continue;
    const ra = rangeAt(g.range, u);
    if (v < ra.v - ra.front || v > ra.v + ra.back) continue;
    if (r.channel[i] === gi && v >= ra.v - ra.front / 2 && v <= ra.v + ra.back / 2) gorge[k] = 1;
    if (r.lake[i] || r.channel[i] || r.pool[i]) continue;
    if (heights[i] > best[k]) best[k] = heights[i];
  }
  let g0 = W;
  let g1 = -1;
  for (let k = 0; k < W; k++) if (gorge[k]) [g0, g1] = [Math.min(g0, k), Math.max(g1, k)];
  let lo = Infinity;
  let hi = -Infinity;
  let least = Infinity;
  for (let k = 2; k < W - 2; k++) {
    if (best[k] < 0 || (k >= g0 && k <= g1)) continue;
    least = Math.min(least, best[k]);
    if (k >= g0 - GATE_CREST.near && k <= g1 + GATE_CREST.near) [lo, hi] = [Math.min(lo, best[k]), Math.max(hi, best[k])];
  }
  let notch = 0;
  for (let k = g0; k <= g1; k++) if (best[k] < lo) notch++;
  return { gate: lo - g.sill, peak: hi - g.sill, least: least - g.sill, gap: g1 - g0 + 1, notch };
}

/** The lake's shore traced round (its tiles 8-connected, the outer edge), and the longest stretch of it that keeps within
 *  `SHORE_STRAIGHT` tiles of the line between its ends: its length (the line's), and that as a share of the main arm's
 *  length (its spine's). */
export const SHORE_STRAIGHT = 1.5;

export function lakeStraight(plan: PremisePlan, water: StageWater): { run: number; share: number; arm: number } {
  const g = gateOf(plan)!;
  const { W, H } = plan;
  const r = water.raster;
  const li = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  const main = plan.bodies[li - 1].arms[0];
  let arm = 0;
  for (let k = 1; k < main.length; k++) arm += hypot(main[k][0] - main[k - 1][0], main[k][1] - main[k - 1][1]);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && r.lake[y * W + x] === li;
  // the outer edge, by Moore's neighbour tracing from the first tile in reading order
  let s = -1;
  for (let i = 0; i < W * H && s < 0; i++) if (r.lake[i] === li) s = i;
  if (s < 0) return { run: 0, share: 0, arm };
  const dirs: Point[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const loop: Point[] = [];
  const [sx, sy] = [s % W, Math.floor(s / W)];
  let [x, y] = [sx, sy];
  let d = 0;
  // (round until it leaves the first tile again the way it first left it: Jacob's stopping criterion)
  let first = -1;
  for (let steps = 0; steps < 8 * W * H; steps++) {
    let next = -1;
    for (let k = 0; k < 8 && next < 0; k++) if (on(x + dirs[(d + 5 + k) % 8][0], y + dirs[(d + 5 + k) % 8][1])) next = (d + 5 + k) % 8;
    if (x === sx && y === sy && next === first && loop.length) break;
    loop.push([x + 0.5, y + 0.5]);
    if (next < 0) break;
    if (first < 0) first = next;
    [x, y, d] = [x + dirs[next][0], y + dirs[next][1], next];
  }
  const n = loop.length;
  let run = 0;
  for (let a = 0; a < n; a++) {
    for (let m = 2; m < n; m++) {
      const p = loop[a];
      const q = loop[(a + m) % n];
      const len = hypot(q[0] - p[0], q[1] - p[1]);
      let ok = len > 0;
      for (let k = 1; k < m && ok; k++) {
        const c = loop[(a + k) % n];
        if (Math.abs((q[0] - p[0]) * (p[1] - c[1]) - (p[0] - c[0]) * (q[1] - p[1])) / len > SHORE_STRAIGHT) ok = false;
      }
      if (!ok) break;
      run = Math.max(run, len);
    }
  }
  return { run, share: arm > 0 ? run / arm : 0, arm };
}

/** The dry side as a sheet: of the tiles past the range's spine, the share standing within a level of every tile
 *  `SHEET_REACH` tiles off along the map's rows and columns (those past the spine too). */
export const SHEET_REACH = 8;

export function drySheet(plan: PremisePlan, heights: ArrayLike<number>): number {
  const g = gateOf(plan)!;
  const T = turnOf(plan, g);
  const { W, H } = plan;
  const past = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      if (v > rangeAt(g.range, u).v) past[y * W + x] = 1;
    }
  let all = 0;
  let flat = 0;
  const R = SHEET_REACH;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!past[i]) continue;
      all++;
      let ok = true;
      for (const [dx, dy] of [[R, 0], [-R, 0], [0, R], [0, -R]] as const) {
        const [xx, yy] = [x + dx, y + dy];
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || !past[yy * W + xx]) continue;
        if (Math.abs(heights[yy * W + xx] - heights[i]) > 1) ok = false;
      }
      if (ok) flat++;
    }
  return all ? flat / all : 0;
}

/** The Gate's dry valley across the basin: its bed past the range's back foot cut in `VALLEY_SPANS` pieces along it,
 *  and each piece's depth, the lower quartile of the ground `VALLEY_RING` tiles off the bed (nearest this bed of all
 *  the plan's channels) over the median of the bed's own level there. */
export const VALLEY_SPANS = 5;
export const VALLEY_RING = [8, 12] as const;

export function dryValley(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>): number[] {
  const g = gateOf(plan)!;
  const T = turnOf(plan, g);
  const { W, H } = plan;
  const r = water.raster;
  const gi = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const N = W * H;
  const dist = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const queue: number[] = [];
  let a0 = Infinity;
  let a1 = -Infinity;
  for (let i = 0; i < N; i++) {
    if (!r.channel[i]) continue;
    const [u, v] = onLocal(T, [(i % W) + 0.5, Math.floor(i / W) + 0.5]);
    const ra = rangeAt(g.range, u);
    // (every channel seeds the field, so the ring is this bed's alone; only the Gate Bed past the back foot is read)
    dist[i] = 0;
    from[i] = r.channel[i] === gi && v > ra.v + ra.back ? i : -2;
    queue.push(i);
    if (from[i] >= 0) [a0, a1] = [Math.min(a0, r.along[i]), Math.max(a1, r.along[i])];
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const [xx, yy] = [x + dx, y + dy];
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const dd = dist[i] + (dx && dy ? 1.4142 : 1);
        if (dd < dist[j] - 1e-6) {
          dist[j] = dd;
          from[j] = from[i];
          queue.push(j);
        }
      }
  }
  if (!(a1 > a0)) return [];
  const span = (i: number) => Math.min(VALLEY_SPANS - 1, Math.floor(((r.along[i] - a0) / (a1 - a0)) * VALLEY_SPANS));
  const ring: number[][] = Array.from({ length: VALLEY_SPANS }, () => []);
  const bed: number[][] = Array.from({ length: VALLEY_SPANS }, () => []);
  for (let i = 0; i < N; i++) {
    if (from[i] < 0) continue;
    if (dist[i] === 0) bed[span(i)].push(heights[i]);
    else if (dist[i] >= VALLEY_RING[0] && dist[i] <= VALLEY_RING[1]) ring[span(from[i])].push(heights[i]);
  }
  // (the ring's lower quartile: the valley is as deep as its lower wall, and a ring that reaches the range's back slope
  // or a mesa on one side is not the deeper for it)
  const at = (a: number[], q: number) => {
    const s = [...a].sort((p, q2) => p - q2);
    return s[Math.floor(q * (s.length - 1))];
  };
  return ring.map((rg, k) => (rg.length && bed[k].length ? at(rg, 0.25) - at(bed[k], 0.5) : NaN));
}

/** A trunk's bends (planning's verdict of 2026-11-14: a real course has a straight reach, then a tight loop): for each
 *  brook another joins, `TRUNK_LEAST` tiles long or more, its bends (`gateBrooks.ts` `brookBends`) read for its
 *  straightest reach (the longest run of bends turning under twice the ruling's least swing, its heading swung under
 *  the least to each side; in tiles, and in its own mean wavelengths) and its tightest bend (the most turn a tile)
 *  against the next tightest; its first and last bends (out of its head, into its end) aside. */
export const TRUNK_LEAST = 60;

export type TrunkBends = { id: string; length: number; straight: number; waves: number; tight: number; next: number };

export function trunkBends(plan: PremisePlan): TrunkBends[] {
  const brooks = plan.links.filter((l) => /^brook\d/.test(l.id) && l.path);
  const out: TrunkBends[] = [];
  for (const b of brooks) {
    if (!brooks.some((t) => t.joins?.link === b.id)) continue;
    const p = b.path!;
    let length = 0;
    for (let k = 1; k < p.length; k++) length += hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
    if (length < TRUNK_LEAST) continue;
    const bends = brookBends(p);
    const wave = (2 * bends.reduce((s, x) => s + x.length, 0)) / Math.max(1, bends.length);
    let straight = 0;
    let runAt = 0;
    const inner = bends.slice(1, -1);
    for (const x of inner) {
      runAt = x.swing < 2 * BROOK_MEANDER.swing[0] ? runAt + x.length : 0;
      straight = Math.max(straight, runAt);
    }
    const tight = inner.map((x) => x.swing / Math.max(1, x.length)).sort((p2, q) => q - p2);
    out.push({ id: b.id, length, straight, waves: straight / Math.max(1, wave), tight: tight[0] ?? 0, next: tight[1] ?? 0 });
  }
  return out;
}

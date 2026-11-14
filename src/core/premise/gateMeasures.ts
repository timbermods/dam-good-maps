// The wall with one gate's look, measured (docs/PREMISES.md §5.1 "Measured, the land round"; planning's verdict of
// 2026-11-14 on the first sheet: the wall a ruler line, the lake a canal lake, the brooks stripes, the dry side a blank
// plain). Four readings of a built map, reported with every sheet and held by the heavy maps test: the longest straight
// run of the range's foot line, the lake's shore along the wall and its width's range, the brooks' orders and how long
// two run side by side, and the dry side's share a canal from the Gate can water.

import { atan2, cos, hypot, sin } from "../math/portable";
import { rangeAt, type GateRange } from "./gateRange";
import { besideRun } from "./gateBrooks";
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
 *  the bed below is one more), and the longest stretch of any brook that runs beside another (`gateBrooks.ts`
 *  `besideRun`: within 12 tiles of it and heading as it does), in tiles along it. */
export function brookTree(plan: PremisePlan): { orders: number; beside: number; brooks: number; joins: number } {
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
  let beside = 0;
  for (const a of brooks) for (const b of brooks) if (a !== b) beside = Math.max(beside, besideRun(a.path!, b.path!));
  return { orders, beside, brooks: brooks.length, joins: brooks.filter((b) => b.joins).length };
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

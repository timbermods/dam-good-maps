// Badwater found in the terrain (docs/m9-design.md §4.8; D200: badwater on every map). Badwater
// rises in a hollow on high ground (a pit dug two levels into the rock, its outline irregular) and
// drains by its own winding ditch down the slope into a river or a lake, as most maps' badwater
// does (Kyler, 2026-10-03, D469: contamination is part of the game's challenge, and working out how
// to deal with it is the pleasure), on most maps one of them into the theme's main water (D476),
// and to the map's edge only where it can reach no water it may join; never into nor across the
// start's own clean water, which stays pumpable (D85). A levee on
// the ditch is the counterplay (`water.badwater_contained` is information, D469). The set piece
// carries the pit's source, floor and outlet; the pit's own shape is the
// terrain's, which the generated field holds.
//
// Every map gets `count` hollows unless its player chose No badwater (D200), each beyond the
// difficulty's badwater distance from the start (plus the reach of its water and soil), apart from
// each other. The ditch follows the land the way a river's course does (investigation/theme-critique:
// a ditch routed straight across a flat and wound by a fixed sine read as a square wave, the one
// drawn line on every third map): its way down is the eroded field's own drainage from the pit's
// rim, else the cheapest way that keeps off what it must with the field's fall in its cost, then
// smoothed and bent by the rivers' meander (hydro.ts `meanderPath`, a swing and a wavelength noise
// varies); it never runs ruler-straight nor in a regular wave (D209, analysis/straight.ts).
//
// Ported from the design version 2 prototype (investigation/generative/v2/hazards.ts).

import * as portable from "../math/portable";
import { featureId } from "../features/ids";
import { OFFICIAL_BADWATER as B } from "../gen/calibrated";
import { channelTiles } from "../features/route";
import type { Feature, SetPieceFeature } from "../features/schema";
import { hash32 } from "../math/hash";
import { distanceFrom, MinHeap, N4 } from "../math/grid";
import { fbm } from "../math/noise";
import { stream, type Rng } from "../math/rng";
import { walkRoute } from "./wind";
import { meanderPath, smoothPath } from "./hydro";
import { regularWave } from "../analysis/straight";
import type { Point } from "../features/schema";
import type { Drainage } from "./drainage";
import { basinLeak } from "../validate/playability";
import { drainage } from "./drainage";
import type { Hydro } from "./hydro";
import { BED_FLOOR } from "./genome";
import { mouthTilesOf } from "../features/raster/terrain";
import { LIP_REACH } from "../water/edgeLip";
import { dist } from "./num";

export interface Hazards {
  /** Hollows planned (0 when none fits, or No badwater). */
  count: number;
  features: Feature[];
  /** The terrain with the pits and their ditches dug (the input when there are none). */
  heights: Uint8Array;
  /** Tiles the objects and resources keep off (the pits, their rims and their ditches). */
  avoid: Uint8Array;
  /** The join to the main water runs into water that passed the start planned from (D476): the start
   *  is then found by other clean water (a reading for the generator's fixes). */
  past?: boolean;
}

export interface BadwaterAsk {
  /** Hollows to plan (at least one unless No badwater). */
  count: number;
  /** Each source's strength, blocks per second over its 3×3. */
  strength: number;
  /** No badwater within this many tiles of the start: the larger of the Badwater distance setting
   *  and the start rule's (D85, D200). */
  distance: number;
  /** Tiles no pit or ditch may take (the weir's pool). */
  keepOff?: Uint8Array | null;
  /** The eroded field the land was snapped from (levels, floats): a ditch follows its drainage as
   *  the rivers do. Without it the ditch takes the cheapest way. */
  field?: Float64Array | null;
  /** The theme's main water (`mainWater`), on the maps whose badwater joins it (D476, most maps): the
   *  first hollow's ditch joins it or water that flows into it, below the start's water where it can,
   *  else beyond the badwater distance with the start then found by other clean water (D85); where
   *  none can, the badwater drains where the land takes it. Without it the ditches go to the nearest
   *  water, seldom the main (#265's sheets: 0 of 20 Delta maps). */
  join?: Uint8Array | null;
}

/** The theme's main water, which badwater joins on most maps (D476), from the hydrology's own plan:
 *  Lake Basin's main lake (`mainLake`, its largest planned lake); on every other theme the main river
 *  (`mainRiver`: River Valley's, Canyon's and Highlands' "river/main" with its lakes and the rivers
 *  joining it, Delta's trunk and own channel, Islands' sea, which its main river drains, Any's as its
 *  land made it). Each falls back on the other where the map has none. */
export function mainWater(theme: string, hy: Pick<Hydro, "water" | "rivers" | "lakes" | "arms">, W: number, H: number): Uint8Array {
  const lake = () => mainLake(hy.water, W, H);
  const river = () => mainRiver(hy, W, H);
  const first = theme === "lakeBasin" ? lake() : river();
  return first.some((v) => v) ? first : theme === "lakeBasin" ? river() : lake();
}

/** The main river's water: the planned water (channels and lakes) of the river the hydrology names
 *  "river/main", from its head to where it leaves the map, with the arms it splits round an island
 *  and the lakes it runs through; on a delta its trunk and its own channel below the fan's apex, not
 *  the fan's other arms (side channels, which badwater may join too, D469); and the water of every
 *  river that joins it, whose badwater runs on into it below the junction. Empty on a map without a
 *  main river. */
export function mainRiver(hy: Pick<Hydro, "water" | "rivers" | "lakes" | "arms">, W: number, H: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  const main = hy.rivers.find((r) => r.role === "river/main");
  if (!main) return out;
  const isWater = (i: number) => hy.water[i] === 1 || hy.water[i] === 2;
  // each course's line, then the planned water within its half-width (and a tile) of it
  const near = new Float64Array(N).fill(Infinity);
  const mark = (path: readonly Point[], half: number) => {
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k];
      const [bx, by] = path[k + 1];
      const n = Math.max(1, Math.ceil(2 * Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
      for (let t = 0; t <= n; t++) {
        const px = ax + ((bx - ax) * t) / n;
        const py = ay + ((by - ay) * t) / n;
        const R = Math.ceil(half);
        for (let y = Math.max(0, Math.round(py) - R); y <= Math.min(H - 1, Math.round(py) + R); y++)
          for (let x = Math.max(0, Math.round(px) - R); x <= Math.min(W - 1, Math.round(px) + R); x++) {
            const d = Math.max(Math.abs(x - px), Math.abs(y - py));
            const i = y * W + x;
            if (d <= half && d < near[i]) near[i] = d;
          }
      }
    }
  };
  // (and the rivers that flow into it, by the hydrology's own joins: badwater in a tributary runs on
  // into the main river below the junction)
  const into = new Set([main.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const r of hy.rivers)
      if (!into.has(r.id) && "river" in r.params.exit && into.has(r.params.exit.river)) {
        into.add(r.id);
        grew = true;
      }
  }
  for (const r of hy.rivers) if (into.has(r.id)) mark(r.params.path, r.params.width / 2 + 1);
  for (const a of hy.arms) if (a.kind === "split" && a.river === main.id) mark(a.path, (0.6 * main.params.width) / 2 + 1);
  for (let i = 0; i < N; i++) if (Number.isFinite(near[i]) && isWater(i)) out[i] = 1;
  for (const lk of hy.lakes) if (lk.river && into.has(lk.river)) for (const i of lk.tiles) if (isWater(i)) out[i] = 1;
  return out;
}

/** The map's main lake: the largest body of the lakes the hydrology planned (side to side). */
export function mainLake(water: ArrayLike<number>, W: number, H: number): Uint8Array {
  const N = W * H;
  const label = new Int32Array(N).fill(-1);
  const stack: number[] = [];
  let best = -1;
  let bestSize = 0;
  for (let i = 0; i < N; i++) {
    if (water[i] !== 2 || label[i] >= 0) continue;
    let size = 0;
    label[i] = i;
    stack.push(i);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % W;
      const y = (c - x) / W;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const n = yy * W + xx;
        if (water[n] === 2 && label[n] < 0) {
          label[n] = i;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = i;
    }
  }
  const out = new Uint8Array(N);
  if (best >= 0) for (let i = 0; i < N; i++) if (label[i] === best) out[i] = 1;
  return out;
}

/** The field's own way down from the pit's rim (the drainage the rivers' courses are traced on):
 *  from each of the rim's lowest tiles in turn, the receivers in order until a tile the ditch may
 *  end on; null where every way runs into the pit, into ground the ditch keeps off, or on too long. */
function traceRoute(dn: Drainage, E: Float64Array, rim: readonly number[], pit: Uint8Array, goal: Uint8Array, avoid: Uint8Array, isEnd: (i: number) => boolean, limit: number): number[] | null {
  const starts = rim.filter((i) => !avoid[i]).sort((a, b) => E[a] - E[b] || a - b).slice(0, 6);
  for (const s of starts) {
    const tiles = [s];
    let ok = isEnd(s);
    for (let i = dn.rcv[s]; i >= 0 && !ok && tiles.length <= limit; i = dn.rcv[i]) {
      if (pit[i] || (avoid[i] && !goal[i])) break;
      tiles.push(i);
      ok = isEnd(i);
    }
    if (ok) return tiles;
  }
  return null;
}

/** The route of a ditch from the pit's edge down to a river or the map edge where the field's own
 *  way is barred: side-to-side steps, cheapest where the ground falls, never near the start; the
 *  field's rise in the cost keeps it to the land's own slope, and noise makes it wind where the
 *  field is flat. */
function ditchRoute(h: Uint8Array, E: Float64Array | null, W: number, H: number, from: number[], pit: Uint8Array, goal: Uint8Array, avoid: Uint8Array, sill: number, wander: number, toEdge: boolean): { tiles: number[]; end: number } | null {
  const N = W * H;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new MinHeap();
  for (const i of from) {
    cost[i] = 0;
    heap.push(0, i);
  }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > cost[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (goal[c] || (toEdge && border)) {
      const tiles: number[] = [];
      for (let i = c; i >= 0; i = prev[i]) tiles.push(i);
      return { tiles: tiles.reverse(), end: c };
    }
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (pit[n] || avoid[n]) continue;
      // (the border is where the water leaves: only a route that may end there steps onto it)
      if (!toEdge && (xx === 0 || yy === 0 || xx === W - 1 || yy === H - 1)) continue;
      // uphill is dear (the ditch must cut through it), downhill cheap
      const rise = Math.max(0, h[n] - Math.min(h[c], sill));
      // noise makes the ditch wind as a gully does, not run along the grid; climbing the field is
      // dear, so it keeps to the land's own slope
      const climb = E ? 6 * Math.max(0, E[n] - E[c]) : 0;
      const nk = k + 1 + 3 * rise + climb + 1.6 * (1 + fbm(wander, xx, yy, 5, 2)) + 1.4 * (1 + fbm(wander + 7, xx, yy, 13, 2));
      if (nk < cost[n]) {
        cost[n] = nk;
        prev[n] = c;
        heap.push(nk, n);
      }
    }
  }
  return null;
}

/** The longest straight stretch a ditch may run, in tiles (D209: a one-tile ditch's banks are a
 *  canal as long as the stretch; real terrain's and the official maps' longest are 34 and 44). */
const DITCH_STRAIGHT = 24;

/** The most tiles in a row of `tiles` whose middles all lie within 0.75 of one straight line (the
 *  line through the stretch's two ends): how far a ditch runs ruler-straight. */
export function straightStretch(tiles: readonly number[], W: number): number {
  const n = tiles.length;
  const px = tiles.map((i) => i % W);
  const py = tiles.map((i) => (i - (i % W)) / W);
  let best = Math.min(n, 2);
  for (let a = 0; a + best < n; a++) {
    for (let b = a + best; b < n; b++) {
      const vx = px[b] - px[a];
      const vy = py[b] - py[a];
      const l = portable.sqrt(vx * vx + vy * vy);
      if (!(l > 0)) continue;
      let ok = true;
      for (let k = a + 1; k < b && ok; k++) if (Math.abs((px[k] - px[a]) * vy - (py[k] - py[a]) * vx) / l > 0.75) ok = false;
      if (ok) best = b - a + 1;
    }
  }
  return best;
}

/** Whether a ditch swings in a regular wave (the reading the finished map's one-tile channels get,
 *  analysis/straight.ts). */
function wavy(tiles: readonly number[], W: number): boolean {
  return regularWave(tiles.map((i) => [i % W, (i - (i % W)) / W])) !== null;
}

/** A ditch's route bent as a river's course is: its line smoothed, then the rivers' meander on it
 *  (a swing up to 3.2 tiles, a wavelength of 13–20 tiles, both varied by noise as it goes), drawn
 *  again as side-to-side steps that end at the first tile `isEnd` names. A draw whose steps would
 *  still cross ground the ditch keeps off, or that comes out ruler-straight or in a regular wave (D209),
 *  is drawn again from the next seed, four times; then with a smaller swing; the route as traced
 *  is the last resort. Null where even that fails. */
function windDitch(tiles: readonly number[], h: Uint8Array, W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, seed: number, rng: Rng): number[] | null {
  const n = tiles.length;
  const pts: Point[] = tiles.map((i) => [i % W, (i - (i % W)) / W]);
  const tries: Point[][] = [];
  if (n >= 8) {
    const path = smoothPath(pts, 3, 1);
    const amp = Math.min(3.2, n / 7);
    for (const f of [1, 1, 1, 1, 0.6, 0.6]) {
      const a = f * amp;
      tries.push(meanderPath(path, h, W, H, { amp: a, minAmp: 0.6 * a, cell: 13 + 7 * rng.float(), widthVar: 0 }, hash32(seed, "draw", tries.length)));
    }
    tries.push(path);
  }
  tries.push(pts);
  for (const t of tries) {
    // (a bend's point on ground the ditch keeps off is left out, not the whole draw: a ditch beside
    // the start's water would otherwise fall back to its traced line)
    const along = t.slice(1).filter(([x, y]) => {
      const xx = Math.round(x);
      const yy = Math.round(y);
      return xx >= 0 && yy >= 0 && xx < W && yy < H && allowed(yy * W + xx);
    });
    const walked = walkRoute(tiles[0], along, W, H, allowed, isEnd);
    if (!walked || walked.length < 3) continue;
    if (straightStretch(walked, W) > DITCH_STRAIGHT) continue;
    // (the outlet stored drops the tile on the water it joins; the map's check reads that line)
    if (wavy(walked, W) || wavy(walked.slice(0, -1), W)) continue;
    return walked;
  }
  return null;
}

export function planBadwater(h: Uint8Array, W: number, H: number, wetNow: ArrayLike<number>, hy: Pick<Hydro, "water" | "rivers">, ask: BadwaterAsk, seed: number, attempt: number, start: { x: number; y: number }): Hazards {
  const N = W * H;
  const avoid = new Uint8Array(N);
  const out: Hazards = { count: 0, features: [], avoid, heights: h };
  if (!(ask.count > 0)) return out;
  const rng = stream(seed, "badwater", attempt);
  // the field's drainage, side to side as the game's water moves (a ditch is traced on it as a
  // river's course is; a little noise so it wanders where the field is flat, as the rivers' does;
  // `epsilon` so its flats drain too)
  let E: Float64Array | null = null;
  if (ask.field) {
    const rs = hash32(seed, "ditch-route", attempt);
    E = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) E[y * W + x] = ask.field[y * W + x] + 1.2 * fbm(rs, x, y, 14, 2);
  }
  const dnE = E ? drainage(E, W, H, { eight: false, epsilon: 1e-6 }) : null;
  const D = ask.distance;
  const sm = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) sm[y * W + x] = 1;
  const sd = distanceFrom(sm, W, H);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = wetNow[i] > 0.02 || hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
  const dWet = distanceFrom(wet, W, H);
  // the start's water and what flows past it: badwater must join below it
  const startWater = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (wet[i] && sd[i] <= 24) startWater[i] = 1;
  let hh = h;
  // (item 27: no ditch near a river's head at the edge, within the lip's reach: it took the head's
  // water off the map)
  const byMouth = new Uint8Array(N);
  for (const r of hy.rivers)
    for (const m of mouthTilesOf(r, W, H)) {
      const mx = m % W;
      const my = (m - mx) / W;
      for (let y = Math.max(0, my - LIP_REACH); y <= Math.min(H - 1, my + LIP_REACH); y++) for (let x = Math.max(0, mx - LIP_REACH); x <= Math.min(W - 1, mx + LIP_REACH); x++) byMouth[y * W + x] = 1;
    }
  // where a ditch may end: any river or lake beyond the badwater distance whose water never
  // passes the start (the water near the start, and what flows past it, stays clean: D85); and the
  // tiles it keeps off (the start's ground, the start's water, a river's head at the edge)
  // (`only`: the water a ditch must join this time, the theme's main water, D476, or water that
  // flows into it; any other water is kept off as water it may not join. `loose`: that water may
  // pass the start planned so far, which then gives way to another)
  const outlets = (dn: ReturnType<typeof drainage>, only: Uint8Array | null, loose: boolean): { goal: Uint8Array; keepOff: Uint8Array } => {
    // water on each tile goes side to side down the land's drainage: whether it passes the start,
    // and whether it ends in the water the ditch must join
    const reachesStart = new Uint8Array(N);
    const reachesOnly = new Uint8Array(N);
    for (let q = 0; q < dn.order.length; q++) {
      const j = dn.order[q];
      const r = dn.rcv[j];
      reachesStart[j] = sd[j] <= 26 || (r >= 0 && reachesStart[r]) ? 1 : 0;
      if (only) reachesOnly[j] = only[j] || (r >= 0 && reachesOnly[r]) ? 1 : 0;
    }
    const goal = new Uint8Array(N);
    for (let j = 0; j < N; j++) if ((hy.water[j] === 1 || hy.water[j] === 2) && (loose || (!startWater[j] && !reachesStart[j])) && sd[j] > D + 6 && (!only || reachesOnly[j])) goal[j] = 1;
    const keepOff = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (sd[j] < D + 6 || startWater[j] || avoid[j] || ask.keepOff?.[j] || byMouth[j]) keepOff[j] = 1;
    // (water it may not join, and the ring beside it, it never crosses on its way: that water
    // passes the start, D85, and a ditch through a sea or lake on its way to the edge raised the
    // whole of it, which then rose for days, water.settles)
    for (let j = 0; j < N; j++) {
      if (!(hy.water[j] === 1 || hy.water[j] === 2) || goal[j]) continue;
      const x = j % W;
      const y = (j - x) / W;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) if (!goal[yy * W + xx]) keepOff[yy * W + xx] = 1;
    }
    return { goal, keepOff };
  };
  const placed: [number, number][] = [];
  // the hollows, ranked and placed until `want` in all, each ditch to water it may join (`only`: to
  // that water alone, never the map's edge)
  const place = (only: Uint8Array | null, want: number, loose = false): void => {
    // how far a ditch from each tile would run to water it may join, standing below the pit's floor:
    // pits near such water rank first, so most badwater joins a river or a lake; then pits whose
    // ditch can reach the map's edge (a map whose water all passes the start, or stands above them),
    // so few run to the edge and none is left without a way out
    const o0 = outlets(drainage(hh, W, H, { eight: false }), only, loose);
    const spread = (seeds: (j: number) => boolean): Float64Array => {
      const d = new Float64Array(N).fill(Infinity);
      const q = new Int32Array(N);
      let head = 0;
      let tail = 0;
      for (let j = 0; j < N; j++) {
        if (seeds(j)) {
          d[j] = 0;
          q[tail++] = j;
        }
      }
      while (head < tail) {
        const c = q[head++];
        const x = c % W;
        const y = (c - x) / W;
        for (const [dx, dy] of N4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const n = yy * W + xx;
          if (o0.keepOff[n] || d[n] <= d[c] + 1) continue;
          d[n] = d[c] + 1;
          q[tail++] = n;
        }
      }
      return d;
    };
    const toEdge = spread((j) => {
      const x = j % W;
      const y = (j - x) / W;
      return !o0.keepOff[j] && (x === 0 || y === 0 || x === W - 1 || y === H - 1);
    });
    const toWater = new Map<number, Float64Array>();
    const toWaterAt = (i: number, floor: number): number => {
      let d = toWater.get(floor);
      if (!d) {
        d = spread((j) => o0.goal[j] === 1 && !o0.keepOff[j] && hh[j] + wetNow[j] < floor);
        toWater.set(floor, d);
      }
      return d[i];
    };
    const ditchEst = (i: number, floor: number): number => {
      const d = toWaterAt(i, floor);
      return Number.isFinite(d) ? d : W + toEdge[i];
    };
    // (a ditch runs as far as the land takes it to water; past the side's length it is no ditch)
    const limit = Math.max(W, H);
    // candidate pit centres: beyond the distance, off the water, on ground that stands above its
    // surroundings (a hollow dug there keeps a rim two levels high). They aim at about the distance
    // (its pit and the soil it soaks a few tiles further out): the Badwater distance setting is how
    // far the colony's first badwater lies, and moves it (ROADMAP M6)
    const cands: [number, number][] = [];
    for (let y = 8; y < H - 8; y++)
      for (let x = 8; x < W - 8; x++) {
        const i = y * W + x;
        if (sd[i] < D + 8 || dWet[i] < 9 || ask.keepOff?.[i]) continue;
        let lo = 99;
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
        // (its pit two below the lowest ground round it, never below the beds' floor, item 47)
        if (lo < BED_FLOOR + 2) continue;
        // (a ditch that must join one water: only pits whose way to it is open and short enough)
        if (only && !(toWaterAt(i, lo - 2) <= limit)) continue;
        cands.push([Math.abs(sd[i] - (D + 11)) + 8 * rng.float() - 0.3 * h[i] + 0.5 * Math.max(0, Math.min(ditchEst(i, lo - 2), 4 * W) - 10), i]);
      }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cached: { hh: Uint8Array; dn: ReturnType<typeof drainage>; outs: { goal: Uint8Array; keepOff: Uint8Array } } | null = null;
    // (60 pits tried at most; one too near a hollow already placed is passed over, not tried: the
    // pits by the nearest low water lie close together, and a second hollow was left unplaced)
    for (let c = 0, tried = 0; c < cands.length && tried < 60 && out.count < want; c++) {
      const i = cands[c][1];
      const cx = i % W;
      const cy = (i - cx) / W;
      if (placed.some(([px, py]) => Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 24)) continue;
      tried++;
      // where water on each tile goes (side to side, as the game's water moves), and where a ditch
      // may end: the same until a pit is dug (reused across candidates)
      if (!cached || cached.hh !== hh) {
        const d0 = drainage(hh, W, H, { eight: false });
        cached = { hh, dn: d0, outs: outlets(d0, only, loose) };
      }
      const dn = cached.dn;
      const passesStart = (from: number) => {
        for (let j = from, n = 0; j >= 0 && n < 4 * (W + H); j = dn.rcv[j], n++) if (sd[j] <= 26) return true;
        return false;
      };
      let lo = 99;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) lo = Math.min(lo, hh[(cy + dy) * W + cx + dx]);
      const floor = lo - 2;
      const s = hash32(seed, "pit", attempt, out.count);
      // the pit: the 3×3 source and an irregular blob round it, radius 2.5–4
      const pit = new Uint8Array(N);
      const r0 = 2.6 + 1.2 * rng.float();
      // the fall of the ground round the pit (from its high side to its low), else east
      let gx = 0;
      let gy = 0;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          gx -= dx * hh[y * W + x];
          gy -= dy * hh[y * W + x];
        }
      const gl = portable.sqrt(gx * gx + gy * gy);
      const fx = gl > 0 ? gx / gl : 1;
      const fy = gl > 0 ? gy / gl : 0;
      const elong = 1.5 + 0.6 * rng.float();
      for (let dy = -8; dy <= 8; dy++)
        for (let dx = -8; dx <= 8; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
          const inCore = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
          // (M9b, D294: the hollows read as round red discs: the pit is long along the fall of the
          // ground, 1.5–2.1 times as long as wide, so the soil it stains runs down toward its ditch)
          const along = (x - cx) * fx + (y - cy) * fy;
          const across = -(x - cx) * fy + (y - cy) * fx;
          const e = portable.sqrt((along / elong) * (along / elong) + across * across * elong * 0.5);
          if (inCore || e < r0 * (1 + 0.35 * fbm(s, x, y, 4, 2))) pit[y * W + x] = 1;
        }
      // the ditch: from the pit's edge to a river channel (not the start's reach) or the map edge
      const edge: number[] = [];
      for (let y = Math.max(1, cy - 9); y <= Math.min(H - 2, cy + 9); y++)
        for (let x = Math.max(1, cx - 9); x <= Math.min(W - 2, cx + 9); x++) {
          const j = y * W + x;
          if (pit[j]) continue;
          if (N4.some(([dx, dy]) => pit[(y + dy) * W + x + dx])) edge.push(j);
        }
      // (water it may join stands below the pit's floor, so the badwater runs down into it; water
      // standing higher would run back up the ditch into the pit, a source in another's flow, D171:
      // that water, and the ring beside it, the ditch keeps off)
      const goal = new Uint8Array(N);
      const keepOff = cached.outs.keepOff.slice();
      // (and never a tile it keeps off, a river's mouth or the player's keep-off: the trace, the
      // cheapest way and the drawn ditch all end only where the ditch may go)
      for (let j = 0; j < N; j++) if (cached.outs.goal[j] && !keepOff[j] && hh[j] + wetNow[j] < floor) goal[j] = 1;
      for (let j = 0; j < N; j++) {
        if (!cached.outs.goal[j] || goal[j] || cached.outs.keepOff[j]) continue;
        const x = j % W;
        const y = (j - x) / W;
        for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) if (!goal[yy * W + xx]) keepOff[yy * W + xx] = 1;
      }
      let clear = true;
      for (let j = 0; j < N && clear; j++) if (pit[j] && ask.keepOff?.[j]) clear = false;
      // (and the ground the basin keeps clear of resources, a square 5 tiles either way of its
      // middle, setpieces/badwaterBasin.ts `clears`: it took a player's forest beside the pit)
      if (ask.keepOff)
        for (let y = Math.max(0, cy - 5); y <= Math.min(H - 1, cy + 5) && clear; y++)
          for (let x = Math.max(0, cx - 5); x <= Math.min(W - 1, cx + 5) && clear; x++) if (ask.keepOff[y * W + x]) clear = false;
      if (!clear) continue;
      const onBorder = (i: number) => {
        const x = i % W;
        const y = (i - x) / W;
        return x === 0 || y === 0 || x === W - 1 || y === H - 1;
      };
      const isEnd = (i: number) => goal[i] === 1 || onBorder(i);
      // the way down: the field's own drainage from the rim, as a river's course, to the water it
      // meets; where that way leads off the map or into ground the ditch keeps off, the cheapest way
      // to water that keeps off it; to the edge only where no water can be reached (Kyler, 2026-10-03:
      // badwater draining off the map on its own is rare)
      let base = E && dnE ? traceRoute(dnE, E, edge, pit, goal, keepOff, (i) => goal[i] === 1, limit) : null;
      if (!base) base = ditchRoute(hh, E, W, H, edge, pit, goal, keepOff, floor + 1, hash32(seed, "ditch", attempt, c), false)?.tiles ?? null;
      if (!base && !only) base = ditchRoute(hh, E, W, H, edge, pit, goal, keepOff, floor + 1, hash32(seed, "ditch", attempt, c), true)?.tiles ?? null;
      if (!base || base.length < 3 || base.length > limit) continue;
      // bent as a river's course is (D209: a ditch that cannot be bent, running straight across a
      // flat or in a regular wave, is no gully: the pit goes elsewhere)
      const wound = windDitch(base, hh, W, H, (i) => !pit[i] && !keepOff[i], isEnd, hash32(seed, "ditch-meander", attempt, c), stream(seed, "ditch-wave", attempt, c));
      if (!wound) continue;
      const route = { tiles: wound, end: wound[wound.length - 1] };
      // its water must never pass the start's water on the way out
      if ((!loose && passesStart(route.end)) || (only && !goal[route.end])) continue;
      // bed levels: the sill one above the floor, then never rising, cut two below the ground beside
      // (M9b, D302: cut one below, the water refilling it after a drought rose over its banks and
      // spread a sheet of badwater over the flat beside it, which stayed until the badtide)
      const tiles = route.tiles.slice(0, goal[route.end] ? route.tiles.length - 1 : route.tiles.length);
      if (tiles.length < 2) continue;
      const onDitch = new Set(tiles);
      const levels: number[] = [];
      let run = floor + 1;
      for (let k = 0; k < tiles.length; k++) {
        const j = tiles[k];
        const x = j % W;
        const y = (j - x) / W;
        let ring = hh[j];
        for (const [dx, dy] of N4) {
          const n = (y + dy) * W + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
          if (pit[n] || onDitch.has(n) || hy.water[n] === 1 || hy.water[n] === 2) continue;
          ring = Math.min(ring, hh[n]);
        }
        run = Math.min(run, ring - 2);
        if (run < BED_FLOOR) run = BED_FLOOR;
        levels.push(run);
      }
      const outlet: number[] = [];
      for (const j of tiles) outlet.push(j % W, Math.floor(j / W));
      const plan = { mode: "basin", x: cx - 1, y: cy - 1, floor, strength: ask.strength, outlet, outletLevels: levels, outletWidth: 1, outletTo: goal[route.end] ? (hy.water[route.end] === 2 ? "lake" : "river") : "edge" };
      // dig it into a copy and prove it holds before touching the map
      const next = hh.slice();
      for (let j = 0; j < N; j++) if (pit[j]) next[j] = floor;
      for (let k = 0; k < tiles.length; k++) next[tiles[k]] = Math.min(next[tiles[k]], levels[k]);
      const bedKeys = channelTiles({ tiles: outlet, levels, width: 1, to: "" }, W, H).bed;
      let flat = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (next[(cy + dy) * W + cx + dx] !== floor) flat = false;
      if (!flat || basinLeak(plan, next, W, H)) continue;
      // banks: every tile beside the ditch stands above its bed
      let banks = true;
      for (let k = 0; k < tiles.length && banks; k++) {
        const j = tiles[k];
        const x = j % W;
        const y = (j - x) / W;
        for (const [dx, dy] of N4) {
          const n = (y + dy) * W + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
          if (pit[n] || bedKeys.has(n) || hy.water[n] === 1 || hy.water[n] === 2) continue;
          if (next[n] < levels[k] + 1) banks = false;
        }
      }
      if (!banks) continue;
      hh = next;
      for (let j = 0; j < N; j++) if (pit[j]) avoid[j] = 1;
      for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) if (x >= 0 && y >= 0 && x < W && y < H) avoid[y * W + x] = 1;
      for (const j of bedKeys.keys()) avoid[j] = 1;
      const role = `setpiece/badwaterBasin/${out.count}`;
      const f: SetPieceFeature = {
        id: featureId(seed, "setPiece", role),
        kind: "setPiece",
        origin: "generated",
        role,
        locked: false,
        params: { kind: "badwaterBasin", request: { mode: "basin", at: [cx, cy], strength: ask.strength }, plan, report: ["a hollow found in the land: badwater rises in its pit and leaves by a winding ditch"] },
      };
      out.features.push(f);
      out.count++;
      placed.push([cx, cy]);
    }
  };
  // (D476: the theme's main water takes the first hollow's badwater, where a ditch can reach it below
  // the start's water; where none can (the start planned beside the main river, most of it passing
  // the start), anywhere beyond the badwater distance, and the start is then found by other clean
  // water, its rules blocking as ever, D85; where none can at all, the badwater drains where the land
  // takes it. The rest join whatever water is nearest, as on any map)
  if (ask.join?.some((v) => v)) {
    place(ask.join, 1);
    if (!out.count) {
      place(ask.join, 1, true);
      if (out.count) out.past = true;
    }
  }
  place(null, ask.count);
  // fewer hollows fit than were asked for (a small map, few rises): the ones placed carry the
  // budget's total between them, each up to the builder's strongest, so the map's badwater stays
  // about what the official maps have for its size (D200)
  if (out.count > 0 && out.count < ask.count) {
    const each = Math.min(B.each.max, Math.max(ask.strength, Math.floor((ask.count * ask.strength) / out.count / B.each.step) * B.each.step));
    for (const f of out.features) {
      if (f.kind !== "setPiece") continue;
      (f.params.plan as { strength: number }).strength = each;
      (f.params.request as { strength: number }).strength = each;
    }
  }
  out.heights = hh;
  return out;
}

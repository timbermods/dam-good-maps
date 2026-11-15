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
// each other. The ditch takes a gully's shape (D(new-ditch), planning's ruling of 2026-11-14/15): a
// brook's width, wandering down the fall line to where D476 sends it. Its fall line is the eroded
// field's own drainage from the pit's rim, else the least cut along the lowest ground that keeps off
// what it must, with the field's fall in its cost (investigation/theme-critique: a ditch routed
// straight across a flat and wound by a fixed sine read as a square wave); the ditch is walked tile by
// tile toward that line smoothed and swung by a wander, never more than 4 tiles along a row or column,
// in an even 45° stair of 6, 9 straight at any angle nor in a regular wave (D209, analysis/straight.ts);
// its bed widens to 2 or 3 tiles where a noise along it says, and its banks step down to it a level a
// tile, a gully's sides, never a one-tile slot. A pit whose ditch can't be drawn so goes elsewhere.
// Planning's rulings of 2026-11-15 make the gully a tributary: (1) it ends in the nearest water its own
// fall line reaches, water D476 and D498 let it join (a fall line that runs first into other water is no
// site); (2) gullies join, never run abreast: a later gully may end in an earlier one's bed, which goes on a
// tile wider below the join, and none stays within 6 tiles of a river, a stream or another gully for 20
// tiles or more but its last 6; (3) its bed stays a level over the water it joins until its last 6 tiles,
// else the site is no site; (4) it is at most `DITCH_CAP` tiles long; (5) the sites are found from the water
// outward (the fall lines that reach such water), and the pits are drawn from them, those ending in a river or
// lake first, a join next, the map's edge last.
// Islands' ditches are drawn as before (`windDitch`), its own ruling to come (D498 (3)).
//
// Ported from the design version 2 prototype (investigation/generative/v2/hazards.ts).

import * as portable from "../math/portable";
import { featureId } from "../features/ids";
import { OFFICIAL_BADWATER as B } from "../gen/calibrated";
import { channelTiles } from "../features/route";
import type { BasinPlan as BadwaterPlan } from "../features/setpieces/badwaterBasin";
import type { Feature, SetPieceFeature } from "../features/schema";
import { hash32 } from "../math/hash";
import { distanceFrom, MinHeap, N4, N8 } from "../math/grid";
import { fbm } from "../math/noise";
import { stream, type Rng } from "../math/rng";
import { walkRoute } from "./wind";
import { meanderPath, smoothPath } from "./hydro";
import { regularWave } from "../analysis/straight";
import type { Point } from "../features/schema";
import type { Drainage } from "./drainage";
import { basinLeak } from "../validate/playability";
import { drainage } from "./drainage";
import type { Hydro, Lake } from "./hydro";
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
  /** No badwater within this many tiles of the start: the Badwater distance setting (D85, D200; the start
   *  rule beside it folded into it, D527), or Easy start's where it is farther. */
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
   *  water, seldom the main (#265's sheets: 0 of 20 Delta maps). Its lower reach (`joinReach`, D498). */
  join?: Uint8Array | null;
  /** Water no ditch ends in, nor in water that drains into it (D498): the theme's main water above
   *  its lower reach, which colonies draw on and whose standing water takes in the whole of any badwater;
   *  all of it where the badwater drains on its own, and on Lake Basin and Islands all their standing water
   *  with the water joined to it. */
  spare?: Uint8Array | null;
  /** Islands' sea (D498 (3)): `spare` reaches as far as the sea's own level, and its lakes', over the low ground beside
   *  them (`atStandingLevel`). The sea is the low water every stream on the land runs down to, so a stream that keeps out
   *  of it in the plan can still reach its level beside it; Lake Basin's lakes stand in their basins above the land
   *  around their outlets (its sea of badwater measured 0 without this). */
  sea?: boolean;
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

/** The share of the main water's course, from its end, where badwater joins it (D498); and how far
 *  below the last lake it runs through the reach begins, in tiles of the course: badwater joining just below a
 *  lake's outlet spread back into the lake's slow water (Lake Basin 128² seed 7, its whole lake at 0.29). */
const LOWER_REACH = 0.3;
const LAKE_GAP = 16;

/** Where badwater joins the theme's main water (D498): its lower reach, so the main water stays clean
 *  where colonies draw it and the badwater runs on off the map. The planned channel of "river/main" along the
 *  last `LOWER_REACH` of its course, `LAKE_GAP` and more below the last lake it runs through, never a lake's
 *  own tiles. Empty on a theme named for its standing water (`STANDING`), where the main river ends in a basin
 *  or leaves no such reach: badwater reaching standing or slow water mixes through the whole of it, and
 *  nothing carries it on, so there it drains on its own. */
export function joinReach(theme: string, hy: Pick<Hydro, "water" | "rivers" | "lakes" | "arms">, W: number, H: number): Uint8Array {
  const N = W * H;
  const out = new Uint8Array(N);
  // (a theme named for its standing water takes none: Lake Basin's lakes and Islands' sea; badwater joined below
  // a lake's outlet spread back up through its slow water into the lake, Lake Basin 128² seeds 1, 2 and 7)
  if (STANDING.has(theme)) return out;
  const river = hy.rivers.find((r) => r.role === "river/main");
  if (!river || !("edge" in river.params.exit)) return out;
  const path = river.params.path;
  if (path.length < 2) return out;
  const lake = new Uint8Array(N);
  for (const lk of hy.lakes) for (const i of lk.tiles) lake[i] = 1;
  for (let i = 0; i < N; i++) if (hy.water[i] === 2) lake[i] = 1;
  // (the last point of the course that stands in a lake)
  let last = -1;
  for (let k = 0; k < path.length; k++) {
    const x = Math.round(path[k][0]);
    const y = Math.round(path[k][1]);
    if (x >= 0 && y >= 0 && x < W && y < H && lake[y * W + x]) last = k;
  }
  // (the course's points are about a tile apart: the gap below the last lake is counted along them)
  let gapEnd = last + 1;
  if (last >= 0) {
    let run = 0;
    while (gapEnd < path.length - 1 && run < LAKE_GAP) {
      run += dist(path[gapEnd + 1][0], path[gapEnd + 1][1], path[gapEnd][0], path[gapEnd][1]);
      gapEnd++;
    }
  }
  const from = Math.max(gapEnd, Math.floor((1 - LOWER_REACH) * (path.length - 1)));
  if (from >= path.length - 1) return out;
  const half = river.params.width / 2 + 1;
  for (let k = from; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[k + 1];
    const n = Math.max(1, Math.ceil(2 * Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
    for (let t = 0; t <= n; t++) {
      const px = ax + ((bx - ax) * t) / n;
      const py = ay + ((by - ay) * t) / n;
      const R = Math.ceil(half);
      for (let y = Math.max(0, Math.round(py) - R); y <= Math.min(H - 1, Math.round(py) + R); y++)
        for (let x = Math.max(0, Math.round(px) - R); x <= Math.min(W - 1, Math.round(px) + R); x++) {
          const i = y * W + x;
          if (Math.max(Math.abs(x - px), Math.abs(y - py)) <= half && hy.water[i] === 1 && !lake[i]) out[i] = 1;
        }
    }
  }
  return out;
}

/** The themes named for their standing water (D498): their badwater drains on its own, into none of it. */
const STANDING = new Set(["lakeBasin", "islands"]);

/** Whether a theme is named for its standing water: Lake Basin's lakes, Islands' sea (D498). */
export function standingTheme(theme: string): boolean {
  return STANDING.has(theme);
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
function traceRoute(dn: Drainage, E: Float64Array, W: number, rim: readonly number[], pit: Uint8Array, goal: Uint8Array, avoid: Uint8Array, isEnd: (i: number) => boolean, limit: number, foreign?: Uint8Array): number[] | "water" | null {
  const starts = rim.filter((i) => !avoid[i]).sort((a, b) => E[a] - E[b] || a - b).slice(0, 6);
  // (`foreign`, a gully's: the water it may not join and the ring beside it. A fall line that runs into it
  // first is no gully's, D(new-ditch) (1): a gully ends in the nearest water its own fall line reaches)
  let blocked = false;
  for (const s of starts) {
    const tiles = [s];
    let ok = isEnd(s);
    for (let i = dn.rcv[s]; i >= 0 && !ok && tiles.length <= limit; i = dn.rcv[i]) {
      if (pit[i] || (avoid[i] && !goal[i])) {
        if (foreign?.[i]) blocked = true;
        break;
      }
      tiles.push(i);
      ok = isEnd(i);
      // (a gully's line ends beside the water it joins: the step into it is the last)
      if (!ok && foreign) {
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of N4) {
          const n = (y + dy) * W + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= W || n >= goal.length || !goal[n]) continue;
          tiles.push(n);
          ok = true;
          break;
        }
      }
    }
    if (ok) return tiles;
  }
  return blocked ? "water" : null;
}

/** `N8`'s steps as two lists, for the ditch's search loop. */
const DX8 = N8.map(([dx]) => dx);
const DY8 = N8.map(([, dy]) => dy);

/** What a ditch's search reads of the ground (`ditchRoute`), once per ground: each tile's height above
 *  the lowest ground two tiles round it, times 1.5 (a tile standing above it is a valley's side). */
function ditchGround(h: Uint8Array, W: number, H: number): Float64Array {
  const N = W * H;
  const side = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 255;
      for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++) m = Math.min(m, h[yy * W + xx]);
      side[y * W + x] = 1.5 * (h[y * W + x] - m);
    }
  return side;
}

/** The cheapness of the field's valleys for a ditch's search, per tile, from the field's drainage area. */
function ditchValleys(area: Float64Array): Float64Array {
  const out = new Float64Array(area.length);
  for (let n = 0; n < area.length; n++) out[n] = 2.5 / (1 + portable.sqrt(area[n]) / 2);
  return out;
}

/** What every ditch's search on one ground with one floor reads alike (`ditchRoute`): where it may
 *  end, the ground it keeps off and each tile's distance from it, the sill, and the least each tile's
 *  way to an end can cost. */
interface DitchWay {
  goal: Uint8Array;
  avoid: Uint8Array;
  sill: number;
  /** It may end on the map's edge. */
  toEdge: boolean;
  /** Each tile's distance from the ground it keeps off. */
  near: Float64Array;
  /** The least a route from each tile to an end can cost, whatever the noise (`ditchLower`); 0
   *  everywhere until it is worth working out, which makes the search Dijkstra's. */
  lower: Float64Array;
  /** The searches that have read it. */
  searches: number;
}

/** The search on one ground and floor from which the searches share a lower bound (`ditchLower`). */
const LED_FROM = 3;

/** A ditch's step from `c` to `n` but for the noise that makes it wind (`ditchRoute` adds that). */
function stepCost(h: Uint8Array, E: Float64Array | null, valleyOf: Float64Array | null, sideOf: Float64Array, near: Float64Array, c: number, n: number, diag: boolean, sill: number): number {
  const len = diag ? Math.SQRT2 : 1;
  const rise = Math.max(0, h[n] - Math.min(h[c], sill));
  const drop = Math.max(0, h[c] - h[n]);
  const cliff = drop >= 2 ? 4 * (drop - 1) * (drop - 1) : 0;
  const valley = valleyOf ? valleyOf[n] : 0;
  const climb = E ? 6 * Math.max(0, E[n] - E[c]) : 0;
  const hug = near[n] < 4 ? 1.5 * (4 - near[n]) : 0;
  return len * (1 + sideOf[n] + valley + hug) + 3 * rise + cliff + climb;
}

/** The least a ditch's route from each tile to an end can cost on this ground (Infinity where it can
 *  reach none), worked out once and read by every pit's search on it: the steps' costs without
 *  their noise, which only ever adds, searched back from the ends. The pit is not known here, and a
 *  pit only makes a route dearer. Shaved by a billionth, so the sums' last digits never make it more
 *  than a route costs. A pit's search led by it (A*) finds the route the full search found, reading a
 *  fraction of the map (#628: one Highlands land routed ~530 ditches, each search reading most of
 *  the map). */
function ditchLower(h: Uint8Array, E: Float64Array | null, valleyOf: Float64Array | null, sideOf: Float64Array, W: number, H: number, way: Omit<DitchWay, "lower" | "searches">): Float64Array {
  const N = W * H;
  const { goal, avoid, sill, toEdge, near } = way;
  const onBorder = (x: number, y: number) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
  const dist = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (goal[i] || (toEdge && onBorder(x, y))) {
      dist[i] = 0;
      heap.push(0, i);
    }
  }
  while (heap.size) {
    const n = heap.pop();
    const d = heap.lastKey;
    if (d > dist[n]) continue;
    const x = n % W;
    const y = (n - x) / W;
    // (a step onto `n`: never onto ground the ditch keeps off, nor onto the border unless it may end
    // there)
    if (avoid[n] === 1 || (!toEdge && onBorder(x, y))) continue;
    for (let k = 0; k < 8; k++) {
      const xc = x - DX8[k];
      const yc = y - DY8[k];
      if (xc < 0 || yc < 0 || xc >= W || yc >= H) continue;
      const c = yc * W + xc;
      const diag = DX8[k] !== 0 && DY8[k] !== 0;
      if (diag && (avoid[yc * W + x] === 1 || avoid[y * W + xc] === 1)) continue;
      const nd = d + stepCost(h, E, valleyOf, sideOf, near, c, n, diag, sill);
      if (nd < dist[c]) {
        dist[c] = nd;
        heap.push(nd, c);
      }
    }
  }
  for (let i = 0; i < N; i++) dist[i] *= 1 - 1e-9;
  return dist;
}

/** The route of a ditch from the pit's edge down to a river or the map edge where the field's own
 *  way is barred, as a stream finds its way down (Kyler, #330: the routed courses read as dug, a
 *  dead-straight trench through terraces, a long straight run with a right-angle turn): steps to all
 *  eight neighbours, so it runs at any angle, not along the grid; cheapest along the land's valleys
 *  (where the field's drainage gathers, `area`) and its low ground (the least height above the
 *  lowest ground two tiles round); down a terrace a level at a time, a drop of two levels or more in
 *  one step dear, so it goes round a cliff where it can rather than cutting a slot through it; uphill
 *  dear (the ditch must cut through it), never near the start; the field's rise keeps it to the
 *  land's own slope, and noise makes it wind where the field is flat. The cheapest route, searched
 *  in the order the ground's least cost to an end leads (`ditchLower`), so only the tiles such a
 *  route might take are read. */
function ditchRoute(h: Uint8Array, E: Float64Array | null, valleyOf: Float64Array | null, sideOf: Float64Array, W: number, H: number, from: number[], pit: Uint8Array, way: DitchWay, wander: number): { tiles: number[]; end: number } | null {
  const N = W * H;
  // (`near`: the ground it keeps off, kept at a distance: those zones are squares and rings, and a
  // route hugging their edges ran ruler-straight with a right-angle turn, #330)
  const { goal, avoid, sill, toEdge, near, lower } = way;
  const cost = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const wind1 = new Float64Array(N).fill(NaN);
  const wind2 = new Float64Array(N);
  const heap = new MinHeap();
  for (const i of from) {
    cost[i] = 0;
    if (lower[i] < Infinity) heap.push(lower[i], i);
  }
  while (heap.size) {
    const c = heap.pop();
    const k = cost[c];
    if (heap.lastKey > k + lower[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    if (goal[c] || (toEdge && border)) {
      const tiles: number[] = [];
      for (let i = c; i >= 0; i = prev[i]) tiles.push(i);
      return { tiles: tiles.reverse(), end: c };
    }
    for (let d = 0; d < 8; d++) {
      const dx = DX8[d];
      const dy = DY8[d];
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      // (and none from which no end can be reached)
      if (pit[n] === 1 || avoid[n] === 1 || !(lower[n] < Infinity)) continue;
      // (a diagonal step is walked side to side through one of the two tiles beside it: both open)
      const diag = dx !== 0 && dy !== 0;
      if (diag) {
        const a = y * W + xx;
        const b = yy * W + x;
        if (pit[a] === 1 || avoid[a] === 1 || pit[b] === 1 || avoid[b] === 1) continue;
      }
      // (the border is where the water leaves: only a route that may end there steps onto it)
      if (!toEdge && (xx === 0 || yy === 0 || xx === W - 1 || yy === H - 1)) continue;
      const len = diag ? Math.SQRT2 : 1;
      // uphill is dear (the ditch must cut through it), a terrace down a level at a time cheap, a
      // cliff dear: a way round it is taken where there is one
      const rise = Math.max(0, h[n] - Math.min(h[c], sill));
      const drop = Math.max(0, h[c] - h[n]);
      const cliff = drop >= 2 ? 4 * (drop - 1) * (drop - 1) : 0;
      // along the valleys and the low ground, as water finds its way (`ditchGround`, `ditchValleys`)
      const side = sideOf[n];
      const valley = valleyOf ? valleyOf[n] : 0;
      // noise makes the ditch wind as a gully does; climbing the field is dear, so it keeps to the
      // land's own slope
      const climb = E ? 6 * Math.max(0, E[n] - E[c]) : 0;
      const hug = near[n] < 4 ? 1.5 * (4 - near[n]) : 0;
      // (each tile's noise once, kept: a tile is reached from up to eight sides, D357's 512² maps)
      if (wind1[n] !== wind1[n]) {
        wind1[n] = 1.6 * (1 + fbm(wander, xx, yy, 5, 2));
        wind2[n] = 1.4 * (1 + fbm(wander + 7, xx, yy, 13, 2));
      }
      const nk = k + len * (1 + side + valley + hug + wind1[n] + wind2[n]) + 3 * rise + cliff + climb;
      if (nk < cost[n]) {
        cost[n] = nk;
        prev[n] = c;
        heap.push(nk + lower[n], n);
      }
    }
  }
  return null;
}

/** The longest straight stretch a ditch may run at any angle, in tiles (D209: a one-tile ditch's
 *  banks are a canal as long as the stretch; real terrain's and the official maps' longest are 34 and
 *  44, for rivers). 9 since #330: with most maps' badwater routed into the main water, a one-tile
 *  course 12 or more tiles straight read as dug, not a stream. */
const DITCH_STRAIGHT = 9;

/** The longest run a ditch may make along one row or column, in tiles, and the fewest tiles on one
 *  diagonal that make an even 45° stair it may not run (`ditchRuns`): a run along the grid reads as a
 *  ruled slot, an even stair as a ruled diagonal (D(new-ditch); the look round of 2026-11-14, item
 *  (c): Lake Basin 2's first pit drained by a ditch 7 tiles dead straight down a column). */
const DITCH_RUN = 4;
const DITCH_STAIR = 6;

/** The fewest tiles a ditch runs, its route as traced too: one shorter has no room to wander (the look
 *  round of 2026-11-14, item (c): Lake Basin 2's second pit drained by a 3-tile stub off the map's
 *  edge), and its pit goes elsewhere. */
const DITCH_LONG = 8;

/** Planning's ruling of 2026-11-15 on the gully (D(new-ditch)), its measures. `DITCH_CAP`, the longest gully in tiles
 *  (4): a pit whose gully would run longer is no site. `ABREAST_NEAR` and `ABREAST_RUN` (2): no gully stays within 6
 *  tiles of a river, a stream or another gully for 20 tiles or more, but for its last `MOUTH` before it joins. `MOUTH`
 *  (3): the bed stays above the water it joins until its last 6 tiles. */
export const DITCH_CAP = 40;
const ABREAST_NEAR = 6;
const ABREAST_RUN = 20;
const MOUTH = 6;
/** How far over the planned surface of the water it joins a gully's bed is held, in levels, before its mouth (3). */
const HOLD = 0;

/** The longest stretch of a gully's `tiles` (but its last `MOUTH`) within `ABREAST_NEAR` of a tile `near` names
 *  (a circle's reach, the tiles' middles). */
export function abreastRun(tiles: readonly number[], W: number, H: number, near: (i: number) => boolean): number {
  let run = 0;
  let best = 0;
  const r = ABREAST_NEAR;
  for (let k = 0; k < tiles.length - MOUTH; k++) {
    const x0 = tiles[k] % W;
    const y0 = (tiles[k] - x0) / W;
    let hit = false;
    for (let dy = -r; dy <= r && !hit; dy++)
      for (let dx = -r; dx <= r && !hit; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (dx * dx + dy * dy > r * r || x < 0 || y < 0 || x >= W || y >= H) continue;
        if (near(y * W + x)) hit = true;
      }
    run = hit ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** A ditch's longest run along one row or column (tiles), and its longest flight of even one-tile
 *  steps at 45° (the tiles on one diagonal line: the moves alternate two square ways). `tiles` join
 *  side to side. */
export function ditchRuns(tiles: readonly number[], W: number): { axis: number; stair: number } {
  const n = tiles.length;
  let axis = Math.min(n, 1);
  let stair = Math.min(n, 1);
  let same = 1;
  let alt = 0;
  for (let k = 1; k < n; k++) {
    const m = tiles[k] - tiles[k - 1];
    const p = k > 1 ? tiles[k - 1] - tiles[k - 2] : 0;
    const q = k > 2 ? tiles[k - 2] - tiles[k - 3] : 0;
    same = k > 1 && m === p ? same + 1 : 1;
    axis = Math.max(axis, same + 1);
    // (moves alternating two square ways: a, b, a, b: the tiles at every other step lie on a diagonal)
    alt = k > 1 && m !== p && m !== -p ? (k > 2 && m === q ? alt + 1 : 2) : 1;
    stair = Math.max(stair, (alt + 2) >> 1);
  }
  return { axis, stair };
}

/** The most tiles in a row of `tiles` whose middles all lie within 0.75 of one straight line (the
 *  line through the stretch's two ends): how far a ditch runs ruler-straight. With `above`, the first
 *  stretch found longer than that is the answer (the caller asks only whether it is). */
export function straightStretch(tiles: readonly number[], W: number, above = Infinity): number {
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
      // (a caller that asks only whether it runs straighter than `above` has its answer)
      if (best > above) return best;
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
 *  is the last resort. Null where even that fails. Islands' ditches only, as they were before the gully
 *  (D(new-ditch)): its own ruling is to come (D498 (3)). */
function windDitch(tiles: readonly number[], h: Uint8Array, W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, seed: number, rng: Rng): number[] | null {
  const n = tiles.length;
  const pts: Point[] = tiles.map((i) => [i % W, (i - (i % W)) / W]);
  const tries: Point[][] = [];
  if (n >= 8) {
    // (its corners rounded first: the route thinned to a point every few tiles, then cut as a
    // river's course is, so a turn bends over several tiles, never at a right angle, #330)
    const sparse = pts.filter((_, k) => k % 4 === 0 || k === n - 1);
    const path = smoothPath(sparse, 3, 1);
    const amp = Math.min(3.2, n / 7);
    for (const f of [1, 1, 1, 1, 0.6, 0.6]) {
      const a = f * amp;
      tries.push(meanderPath(path, h, W, H, { amp: a, minAmp: 0.6 * a, cell: 13 + 7 * rng.float(), widthVar: 0 }, hash32(seed, "draw", tries.length)));
    }
    tries.push(path, smoothPath(pts, 3, 1));
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
    if (straightStretch(walked, W, DITCH_STRAIGHT) > DITCH_STRAIGHT) continue;
    // (the outlet stored drops the tile on the water it joins; the map's check reads that line)
    if (wavy(walked, W) || wavy(walked.slice(0, -1), W)) continue;
    return walked;
  }
  return null;
}

/** How many gullies a ditch draws before its pit goes elsewhere (`gullyDitch`). */
const GULLY_DRAWS = 6;

/** How many sites a round of pits tries for gullies (`planBadwater`). */
const GULLY_TRIES = 120;

/** A ditch drawn as a gully (D(new-ditch), planning's ruling of 2026-11-14/15: "a brook's width,
 *  wandering down the fall line to where D476 sends it; it follows the fall, wanders, narrows and
 *  widens, never a straight stepped slot or a ruled trench"). Its route as traced (the field's own
 *  way down, else the least cut along the lowest ground) is its fall line: that line smoothed over
 *  9 tiles, so the grid's square and 45° steps of the search are gone, and moved to either side by a
 *  wander, a noise along its length (a swing up to 2.6 tiles, its wavelength drawn per draw, none at
 *  either end; where the swing would lie on ground the ditch keeps off, or more than a level up the
 *  valley's side, half as far, else on the line). The ditch is walked tile by tile, side to side,
 *  toward that wandering line a few tiles ahead, as water finds its way: each step the one nearest
 *  it, a rise dearer, with a little chance; never a step that would run it more than `DITCH_RUN`
 *  along a row or column, into an even 45° stair of `DITCH_STAIR`, or more than `DITCH_STRAIGHT`
 *  straight at any angle, nor one beside a tile it already took but the last (one tile wide, no
 *  loop); where it walks into a corner it steps back and takes its next choice. A walk that ends where
 *  it may, `DITCH_LONG` or longer and in no regular wave (D209), is kept; `GULLY_DRAWS` draws. Null
 *  where none is (a route under `DITCH_LONG` at once): the pit goes elsewhere. */
function gullyDitch(tiles: readonly number[], h: Uint8Array, W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, seed: number): number[] | null {
  const n = tiles.length;
  if (n < DITCH_LONG) return null;
  const px = tiles.map((i) => i % W);
  const py = tiles.map((i) => (i - (i % W)) / W);
  // the fall line: the route smoothed over 9 tiles (fewer at its ends, so it starts and ends where the route does)
  const sx: number[] = [];
  const sy: number[] = [];
  for (let k = 0; k < n; k++) {
    const r = Math.min(4, k, n - 1 - k);
    let ax = 0;
    let ay = 0;
    for (let j = k - r; j <= k + r; j++) {
      ax += px[j];
      ay += py[j];
    }
    sx.push(ax / (2 * r + 1));
    sy.push(ay / (2 * r + 1));
  }
  const at = (x: number, y: number): number => {
    const xx = Math.round(x);
    const yy = Math.round(y);
    return xx >= 0 && yy >= 0 && xx < W && yy < H ? yy * W + xx : -1;
  };
  const amp = Math.min(2.6, n / 7);
  for (let d = 0; d < GULLY_DRAWS; d++) {
    const ws = hash32(seed, "gully", d);
    const cell = 8 + (hash32(seed, "gully-cell", d) % 9);
    const a = amp * (d < 4 ? 1 : 0.6);
    // the wandering line
    const tx: number[] = [px[0]];
    const ty: number[] = [py[0]];
    for (let k = 1; k < n; k++) {
      const k0 = Math.max(0, k - 2);
      const k1 = Math.min(n - 1, k + 2);
      const vx = sx[k1] - sx[k0];
      const vy = sy[k1] - sy[k0];
      const vl = portable.sqrt(vx * vx + vy * vy) || 1;
      const taper = Math.min(1, k / 4, (n - 1 - k) / 4);
      const off = Math.max(-a, Math.min(a, 2.2 * a * fbm(ws, k, 0.5, cell, 2))) * taper;
      const line = at(sx[k], sy[k]);
      let p: [number, number] = [sx[k], sy[k]];
      for (const f of [1, 0.5]) {
        const x = sx[k] - (vy / vl) * off * f;
        const y = sy[k] + (vx / vl) * off * f;
        const i = at(x, y);
        // (on ground it may take, and not up the valley's side: never more than a level over its line)
        if (i >= 0 && allowed(i) && (line < 0 || h[i] <= h[line] + 1)) {
          p = [x, y];
          break;
        }
      }
      tx.push(p[0]);
      ty.push(p[1]);
    }
    const walked = gullyWalk(tiles[0], tx, ty, h, W, H, allowed, isEnd, stream(ws, "walk"));
    if (walked && walked.length >= DITCH_LONG && !wavy(walked, W) && !wavy(walked.slice(0, -1), W)) return walked;
  }
  return null;
}

/** Whether a stretch of `path` ending in the tile (`x`, `y`) after it runs straighter than
 *  `DITCH_STRAIGHT` (`straightStretch`'s reading: every tile's middle within 0.75 of the line through
 *  the stretch's ends), for stretches up to 40 tiles; the stretches before it the walk read already. */
function straightTo(path: readonly number[], x: number, y: number, W: number): boolean {
  const m = path.length;
  for (let a = Math.max(0, m - 39); a <= m - DITCH_STRAIGHT; a++) {
    const ax = path[a] % W;
    const ay = (path[a] - ax) / W;
    const vx = x - ax;
    const vy = y - ay;
    const l = portable.sqrt(vx * vx + vy * vy);
    if (!(l > 0)) continue;
    let ok = true;
    for (let k = a + 1; k < m && ok; k++) {
      const kx = path[k] % W;
      const ky = (path[k] - kx) / W;
      if (Math.abs((kx - ax) * vy - (ky - ay) * vx) / l > 0.75) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

/** A ditch walked tile by tile from `start` toward the line (`tx`, `ty`, one point per tile of the
 *  route it follows) a few points ahead of where it has come to (`gullyDitch` says how). */
function gullyWalk(start: number, tx: readonly number[], ty: readonly number[], h: Uint8Array, W: number, H: number, allowed: (i: number) => boolean, isEnd: (i: number) => boolean, rng: Rng): number[] | null {
  const n = tx.length;
  const path = [start];
  const taken = new Set(path);
  const along = [0];
  const choices: number[][] = [];
  const options = (cur: number, from: number): { g: number; next: number[] } => {
    const cx = cur % W;
    const cy = (cur - cx) / W;
    // (how far along the line it has come: the nearest of the next few points)
    let g = from;
    let gd = Infinity;
    for (let k = from; k < Math.min(n, from + 8); k++) {
      const d = (tx[k] - cx) * (tx[k] - cx) + (ty[k] - cy) * (ty[k] - cy);
      if (d <= gd) {
        gd = d;
        g = k;
      }
    }
    const t = Math.min(n - 1, g + 3);
    const scored: [number, number][] = [];
    for (const [dx, dy] of N4) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = y * W + x;
      const end = isEnd(c);
      if (taken.has(c) || !(end || allowed(c))) continue;
      // (one tile wide: no tile beside one already taken, but the last)
      let beside = false;
      for (const [ex, ey] of N4) {
        const xx = x + ex;
        const yy = y + ey;
        const j = yy * W + xx;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && j !== cur && taken.has(j)) beside = true;
      }
      if (beside && !end) continue;
      // (no run along the grid over `DITCH_RUN`, no even 45° stair of `DITCH_STAIR`, nothing straighter than
      // `DITCH_STRAIGHT` at any angle)
      const tail = path.slice(-12);
      tail.push(c);
      const r = ditchRuns(tail, W);
      if (r.axis > DITCH_RUN || r.stair >= DITCH_STAIR) continue;
      if (straightTo(path, x, y, W)) continue;
      const ahead = portable.sqrt((tx[t] - x) * (tx[t] - x) + (ty[t] - y) * (ty[t] - y));
      scored.push([(end ? -1 : 0) + ahead + 0.5 * Math.max(0, h[c] - h[cur]) + 0.5 * rng.float(), c]);
    }
    scored.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return { g, next: scored.map(([, c]) => c) };
  };
  choices.push(options(start, 0).next);
  // (no longer than half as long again as its route: a gully wanders, it does not loop)
  const most = n + (n >> 1) + 6;
  for (let step = 0; step < 16 * n + 60; step++) {
    const cur = path[path.length - 1];
    if (isEnd(cur)) return path;
    const next = path.length < most ? choices[choices.length - 1].shift() : undefined;
    if (next === undefined) {
      // (a corner: step back)
      if (path.length === 1) return null;
      taken.delete(path.pop()!);
      along.pop();
      choices.pop();
      continue;
    }
    path.push(next);
    taken.add(next);
    const o = options(next, along[along.length - 1]);
    along.push(o.g);
    choices.push(o.next);
  }
  return null;
}

/** Where a ditch's bed widens beside its route (D(new-ditch): a gully narrows and widens): a noise
 *  along its length gives each route tile a width of 1, 2 or 3 (about half its length 1), and a tile
 *  of 2 or 3 takes the lowest one or two of the tiles beside it that `may` allows (off its route, off
 *  water, ground the ditch keeps off and the pit's ring, not more than two levels over the route
 *  tile). None on its first 3 tiles nor its last 2. The tiles, as x, y pairs. */
function gullySides(tiles: readonly number[], h: Uint8Array, W: number, H: number, may: (i: number) => boolean, seed: number): number[] {
  const n = tiles.length;
  const onRoute = new Set(tiles);
  const taken = new Set<number>();
  const out: number[] = [];
  const cell = 6 + (hash32(seed, "gully-width-cell") % 7);
  for (let k = 3; k < n - 2; k++) {
    const v = fbm(hash32(seed, "gully-width"), k, 0.5, cell, 2);
    const w = v > 0.32 ? 3 : v > 0.05 ? 2 : 1;
    if (w === 1) continue;
    const c = tiles[k];
    const x = c % W;
    const y = (c - x) / W;
    const beside: [number, number][] = [];
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const i = yy * W + xx;
      if (onRoute.has(i) || taken.has(i) || !may(i) || h[i] > h[c] + 2) continue;
      beside.push([h[i], i]);
    }
    beside.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (const [, i] of beside.slice(0, w - 1)) {
      taken.add(i);
      out.push(i % W, (i - (i % W)) / W);
    }
  }
  return out;
}

/** The banks' widest step, in tiles either side of the bed (a cut of 4 below the ground beside). */
const STEP_REACH = 3;

/** A ditch's banks stepped down to its bed in `h` (a copy, changed in place; the look round of
 *  2026-11-14, item (c), and D(new-ditch): a gully's sides, never a one-tile slot cut two or three
 *  deep): the ground within `STEP_REACH` of the bed (`bed`: tile and level) lowered to at most its
 *  level plus how far it lies from it (the most of the two ways along the grid), so every bank falls a
 *  level a tile to the bed; a tile beside the bed (side or corner) stays at least a level over it.
 *  Ground `keep` names (ground the ditch keeps off) and ground `stays` names (the pit and its rim,
 *  water and the ground by it) is not lowered: a bank there stays as it stands. The tiles lowered. */
function stepBanks(h: Uint8Array, bed: ReadonlyMap<number, number>, W: number, H: number, keep: (i: number) => boolean, stays: (i: number) => boolean): number[] {
  const want = new Map<number, number>();
  const least = new Map<number, number>();
  for (const [t, lvl] of bed) {
    const x0 = t % W;
    const y0 = (t - x0) / W;
    for (let dy = -STEP_REACH; dy <= STEP_REACH; dy++)
      for (let dx = -STEP_REACH; dx <= STEP_REACH; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if ((!dx && !dy) || x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        if (bed.has(i)) continue;
        const r = Math.max(Math.abs(dx), Math.abs(dy));
        const lv = lvl + r;
        const w = want.get(i);
        if (w === undefined || lv < w) want.set(i, lv);
        // (never below a level over a bed tile it lies beside, where the bed winds past it lower down)
        if (r === 1) least.set(i, Math.max(least.get(i) ?? 0, lvl + 1));
      }
  }
  const lowered: number[] = [];
  for (const [i, w] of [...want].sort((a, b) => a[0] - b[0])) {
    const lv = Math.max(w, least.get(i) ?? 0);
    if (h[i] <= lv || keep(i) || stays(i)) continue;
    h[i] = lv;
    lowered.push(i);
  }
  return lowered;
}

/** Whether a tile within `r` of `i` (side or corner) is one `is` names. */
function nearOfAt(i: number, W: number, H: number, r: number, is: (j: number) => boolean): boolean {
  const x = i % W;
  const y = (i - x) / W;
  for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (is(yy * W + xx)) return true;
  return false;
}

/** Where the ditches of one floor on one ground may end and what they keep off, with what their
 *  searches share (`DitchWay`), worked out once and read only. */
interface Ends {
  goal: Uint8Array;
  keepOff: Uint8Array;
  floor: number;
  near: Float64Array | null;
  ways: [DitchWay | null, DitchWay | null];
  /** A gully's: the water it may not join and the ring beside it (`traceRoute`). */
  foreign: Uint8Array | null;
}

/** The spare water (`BadwaterAsk.spare`) and the ground at its standing water's own level beside it (D498 (3)): from each
 *  lake's tiles in `spare`, the land 4-joined to them standing no higher than the lake's outlet bed, which the lake stands
 *  just above (`Lake.outletBed`), and from its other water (channels joined to it), the land no higher than their beds. Water
 *  there stands at the sea's level along the sea and becomes part of it as the map settles: Islands 96² seed 7's ditch joined
 *  a stream that ran down to the sea's level beside the sea and out by the edge, never joined to it in the plan, and its
 *  badwater spread through the low ground into the sea. */
export function atStandingLevel(spare: Uint8Array, h: ArrayLike<number>, lakes: readonly Pick<Lake, "tiles" | "outletBed">[], W: number, H: number): Uint8Array {
  const N = W * H;
  const zone = spare.slice();
  const level = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (spare[i]) level[i] = h[i];
  for (const l of lakes) for (const i of l.tiles) if (spare[i]) level[i] = Math.max(level[i], l.outletBed);
  const q: number[] = [];
  for (let i = 0; i < N; i++) if (spare[i]) q.push(i);
  for (let k = 0; k < q.length; k++) {
    const c = q[k];
    const x = c % W;
    const y = (c - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (h[n] > level[c] || level[n] >= level[c]) continue;
      level[n] = level[c];
      zone[n] = 1;
      q.push(n);
    }
  }
  return zone;
}

export function planBadwater(h: Uint8Array, W: number, H: number, wetNow: ArrayLike<number>, hy: Pick<Hydro, "water" | "rivers" | "lakes">, ask: BadwaterAsk, seed: number, attempt: number, start: { x: number; y: number }): Hazards {
  const N = W * H;
  const avoid = new Uint8Array(N);
  const out: Hazards = { count: 0, features: [], avoid, heights: h };
  if (!(ask.count > 0)) return out;
  // (the gullies drawn so far, D(new-ditch) (2): a later gully may join one, which goes on below as one bed. `beds`: each
  // bed tile's level and its gully; `joinable`: their beds and stepped banks outside their pits' squares, which a later
  // gully may cut through to its join and the ground it keeps off leaves out)
  const gullies = !ask.sea;
  const beds = new Map<number, { g: number; lv: number }>();
  const drawn: { plan: BadwaterPlan; tiles: number[]; levels: number[]; pit: Uint8Array; cx: number; cy: number }[] = [];
  const joinable = new Uint8Array(N);
  // (D498 (3): on Islands the spare water reaches the sea's own level over the low ground beside it; no ditch runs
  // there, nor ends in water that drains there)
  const spare = ask.spare && ask.sea ? atStandingLevel(ask.spare, h, hy.lakes, W, H) : (ask.spare ?? null);
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
  // (what the ditches' searches read of the field and the ground, worked out once: the ground changes
  // only as a hollow is dug)
  const valleys = dnE ? ditchValleys(dnE.area) : null;
  let ground: { h: Uint8Array; side: Float64Array } | null = null;
  const groundOf = (g: Uint8Array): Float64Array => (ground && ground.h === g ? ground : (ground = { h: g, side: ditchGround(g, W, H) })).side;
  const D = ask.distance;
  const sm = new Uint8Array(N);
  for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) sm[y * W + x] = 1;
  const sd = distanceFrom(sm, W, H);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = wetNow[i] > 0.02 || hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
  const dWet = distanceFrom(wet, W, H);
  const wetAt = wet;
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
    const reachesSpare = new Uint8Array(N);
    for (let q = 0; q < dn.order.length; q++) {
      const j = dn.order[q];
      const r = dn.rcv[j];
      reachesStart[j] = sd[j] <= 26 || (r >= 0 && reachesStart[r]) ? 1 : 0;
      if (only) reachesOnly[j] = only[j] || (r >= 0 && reachesOnly[r]) ? 1 : 0;
      if (spare) reachesSpare[j] = spare[j] || (r >= 0 && reachesSpare[r]) ? 1 : 0;
    }
    const goal = new Uint8Array(N);
    for (let j = 0; j < N; j++) if ((hy.water[j] === 1 || hy.water[j] === 2) && (loose || (!startWater[j] && !reachesStart[j])) && sd[j] > D + 6 && (!only || reachesOnly[j]) && !(spare && !(only && only[j]) && reachesSpare[j])) goal[j] = 1;
    const keepOff = new Uint8Array(N);
    // (and the ground at the standing water's level beside it, D498 (3): a ditch there runs along the sea at its level)
    for (let j = 0; j < N; j++) if (sd[j] < D + 6 || startWater[j] || (avoid[j] && !joinable[j]) || ask.keepOff?.[j] || byMouth[j] || (ask.sea && spare?.[j] && !(only && only[j]))) keepOff[j] = 1;
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
  // (the ground no bed is widened on: the start's, its water's, a river's head at the edge, the player's keep-off and the
  // pits drawn)
  const keepGround = (j: number): boolean => sd[j] < D + 6 || startWater[j] === 1 || ask.keepOff?.[j] === 1 || byMouth[j] === 1 || (avoid[j] === 1 && !joinable[j]);
  const planned = (j: number): boolean => hy.water[j] === 1 || hy.water[j] === 2;
  // D(new-ditch) (2): below where a gully joins it, a gully goes on as one bed a tile wider: each of its route tiles
  // below the join takes the lowest tile beside it that its bed may take (off the beds, water, the ground it keeps off,
  // its pit's ring, at most two levels over the route tile), at the level of the lowest route tile beside it, where the
  // banks round that tile hold; its banks stepped as the rest. Where its pit would leak so, it stays as it was.
  const widen = (g: number, at: number): void => {
    const d = drawn[g];
    const n = d.tiles.length;
    const ax = at % W;
    const ay = (at - ax) / W;
    let from = -1;
    for (let k = 0; k < n && from < 0; k++) {
      const x = d.tiles[k] % W;
      const y = (d.tiles[k] - x) / W;
      if (Math.abs(x - ax) + Math.abs(y - ay) <= 1) from = k;
    }
    if (from < 0) return;
    const side = (d.plan.outletSide ?? []).slice();
    const lvAt = new Map<number, number>();
    for (let k = 0; k < n; k++) lvAt.set(d.tiles[k], Math.min(lvAt.get(d.tiles[k]) ?? Infinity, d.levels[k]));
    const next = hh.slice();
    const added = new Set<number>();
    const isBed = (j: number) => beds.has(j) || added.has(j);
    const ring3 = (i: number) => nearOfAt(i, W, H, 3, (j) => d.pit[j] === 1);
    for (let k = from + 1; k < n - 2; k++) {
      const c = d.tiles[k];
      const x = c % W;
      const y = (c - x) / W;
      let best = -1;
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        const i = yy * W + xx;
        if (isBed(i) || wetAt[i] || planned(i) || keepGround(i) || ring3(i) || next[i] > next[c] + 2) continue;
        if (best < 0 || next[i] < next[best] || (next[i] === next[best] && i < best)) best = i;
      }
      if (best < 0) continue;
      const bx = best % W;
      const by = (best - bx) / W;
      let lv = Infinity;
      for (const [dx, dy] of N4) {
        const v = lvAt.get((by + dy) * W + bx + dx);
        if (v !== undefined && v < lv) lv = v;
      }
      let holds = true;
      for (const [dx, dy] of N4) {
        const xx = bx + dx;
        const yy = by + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!isBed(j) && !wetAt[j] && !planned(j) && next[j] < lv + 1) holds = false;
      }
      if (!holds) continue;
      next[best] = Math.min(next[best], lv);
      added.add(best);
      side.push(bx, by);
    }
    if (!added.size) return;
    const trial: BadwaterPlan = { ...d.plan, outletSide: side };
    const bed = channelTiles({ tiles: trial.outlet, levels: trial.outletLevels, width: 1, to: "", side }, W, H).bed;
    for (const [j, lv] of bed) next[j] = Math.min(next[j], lv);
    const stepped = stepBanks(next, bed, W, H, (i) => keepGround(i) || nearOfAt(i, W, H, 1, (j) => beds.has(j) && beds.get(j)!.g !== g), (i) => nearOfAt(i, W, H, 1, (j) => d.pit[j] === 1) || nearOfAt(i, W, H, 2, planned));
    for (const [j, lv] of bed) {
      const x = j % W;
      const y = (j - x) / W;
      for (const [dx, dy] of N4) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        const m = (y + dy) * W + x + dx;
        if (d.pit[m] || bed.has(m) || planned(m) || beds.has(m)) continue;
        if (next[m] < lv + 1) return;
      }
    }
    if (basinLeak(trial, next, W, H)) return;
    hh = next;
    d.plan.outletSide = side;
    const offSquare = (j: number) => Math.max(Math.abs((j % W) - d.cx), Math.abs(Math.floor(j / W) - d.cy)) > 6;
    for (const j of added) {
      beds.set(j, { g, lv: bed.get(j)! });
      avoid[j] = 1;
      if (offSquare(j)) joinable[j] = 1;
    }
    for (const j of stepped) {
      avoid[j] = 1;
      if (offSquare(j)) joinable[j] = 1;
    }
  };
  // (where water on each tile goes on the ground as it stands, side to side: the same for every round
  // of candidates until a hollow is dug)
  let drained: { h: Uint8Array; dn: ReturnType<typeof drainage> } | null = null;
  const drainOf = (g: Uint8Array) => (drained && drained.h === g ? drained : (drained = { h: g, dn: drainage(g, W, H, { eight: false }) })).dn;
  // (the lowest ground within 5 tiles of each tile, on the land as it came: each round of candidates
  // reads it, worked out once, a row's minimum then a column's)
  let low5: Uint8Array | null = null;
  const lowAround = (): Uint8Array => {
    if (low5) return low5;
    const row = new Uint8Array(N).fill(99);
    for (let y = 0; y < H; y++)
      for (let x = 5; x < W - 5; x++) {
        let m = 99;
        for (let dx = -5; dx <= 5; dx++) m = Math.min(m, h[y * W + x + dx]);
        row[y * W + x] = m;
      }
    low5 = new Uint8Array(N).fill(99);
    for (let y = 5; y < H - 5; y++)
      for (let x = 5; x < W - 5; x++) {
        let m = 99;
        for (let dy = -5; dy <= 5; dy++) m = Math.min(m, row[(y + dy) * W + x]);
        low5[y * W + x] = m;
      }
    return low5;
  };
  // the hollows, ranked and placed until `want` in all, each ditch to water it may join (`only`: to
  // that water alone, never the map's edge)
  const place = (only: Uint8Array | null, want: number, loose = false): void => {
    // how far a ditch from each tile would run to water it may join, standing below the pit's floor:
    // pits near such water rank first, so most badwater joins a river or a lake; then pits whose
    // ditch can reach the map's edge (a map whose water all passes the start, or stands above them),
    // so few run to the edge and none is left without a way out
    const d0 = drainOf(hh);
    const o0 = outlets(d0, only, loose);
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
    // (a ditch runs as far as the land takes it to water; past the side's length it is no ditch; a gully no
    // further than `DITCH_CAP`)
    const limit = gullies ? DITCH_CAP : Math.max(W, H);
    // (D(new-ditch) (5): a gully's sites are found from the water outward: the places whose own fall line, the field's
    // drainage, reaches water it may join or a gully drawn before any other water and within `DITCH_CAP` of its pit's
    // rim; or the map's edge, where it may end there)
    // (planning's ruling of 2026-11-15, the edge ends last: each site's fall line ends in water it may join (1), an
    // earlier gully's bed (2) or the map's edge (3), 0 where it reaches none of them within the cap. The sites are
    // tried in that order, a river or lake below the start's reach first, a join next, the edge only where a pit has
    // no other: badwater that leaves the map at once is no hazard, the player never meets it. Worked out again as
    // the beds drawn grow)
    let falls: Uint8Array | null = null;
    let fallsAt = -1;
    const fallsNow = (): Uint8Array | null => {
      if (!gullies || !dnE) return null;
      if (falls && fallsAt === beds.size) return falls;
      const kind = new Uint8Array(N);
      const steps = new Int32Array(N);
      for (let q = 0; q < dnE.order.length; q++) {
        const j = dnE.order[q];
        const r = dnE.rcv[j];
        const x = j % W;
        const y = (j - x) / W;
        if (o0.goal[j]) kind[j] = 1;
        else if (beds.has(j)) kind[j] = 2;
        else if (wetAt[j]) kind[j] = 4;
        else if (x === 0 || y === 0 || x === W - 1 || y === H - 1) kind[j] = only ? 4 : 3;
        else if (r < 0) kind[j] = 4;
        else {
          kind[j] = kind[r];
          steps[j] = steps[r] + 1;
        }
      }
      falls = new Uint8Array(N);
      for (let j = 0; j < N; j++) if (kind[j] < 4 && steps[j] <= DITCH_CAP + 4) falls[j] = kind[j];
      fallsAt = beds.size;
      return falls;
    };
    const falls0 = fallsNow();
    // candidate pit centres: beyond the distance, off the water, on ground that stands above its
    // surroundings (a hollow dug there keeps a rim two levels high). They aim at about the distance
    // (its pit and the soil it soaks a few tiles further out): the Badwater distance setting is how
    // far the colony's first badwater lies, and moves it (ROADMAP M6)
    const cands: [number, number][] = [];
    for (let y = 8; y < H - 8; y++)
      for (let x = 8; x < W - 8; x++) {
        const i = y * W + x;
        if (sd[i] < D + 8 || dWet[i] < 9 || ask.keepOff?.[i]) continue;
        const lo = lowAround()[i];
        // (its pit two below the lowest ground round it, never below the beds' floor, item 47)
        if (lo < BED_FLOOR + 2) continue;
        // (a ditch that must join one water: only pits whose way to it is open and short enough)
        if (only && !(toWaterAt(i, lo - 2) <= limit)) continue;
        if (falls0 && !falls0[i]) continue;
        cands.push([Math.abs(sd[i] - (D + 11)) + 8 * rng.float() - 0.3 * h[i] + 0.5 * Math.max(0, Math.min(ditchEst(i, lo - 2), 4 * W) - 10), i]);
      }
    cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    // (the ground as this round began: its drainage and ends as worked out above)
    let cached: { hh: Uint8Array; dn: ReturnType<typeof drainage>; outs: { goal: Uint8Array; keepOff: Uint8Array }; floors: Map<number, Ends> } = { hh, dn: d0, outs: o0, floors: new Map() };
    // (what the searches on this ground with this floor read alike, worked out once: `DitchWay`. The
    // first two read no lower bound, which costs more than it saves for one or two; from the third
    // on, they share one, `ditchLower`. Either way the route is the same)
    const wayOf = (ends: Ends, toEdge: boolean): DitchWay => {
      const at = toEdge ? 1 : 0;
      let way = ends.ways[at];
      if (!way) {
        ends.near ??= distanceFrom(ends.keepOff, W, H);
        way = ends.ways[at] = { goal: ends.goal, avoid: ends.keepOff, sill: ends.floor + 1, toEdge, near: ends.near, lower: new Float64Array(N), searches: 0 };
      }
      if (++way.searches === LED_FROM) way.lower = ditchLower(hh, E, valleys, groundOf(hh), W, H, way);
      return way;
    };
    // (60 pits tried at most; one too near a hollow already placed is passed over, not tried: the
    // pits by the nearest low water lie close together, and a second hollow was left unplaced)
    // (a gully's sites: up to `GULLY_TRIES`, one within 3 tiles of a site already found wanting passed over, as it has
    // the same gully)
    // (a gully's sites in the order of their ends, `falls`, each kind up to `GULLY_TRIES`; once a pit is placed, from
    // the first kind again, as a new bed may give a site a join)
    const wanting: [number, number][] = [];
    const done = new Uint8Array(cands.length);
    const tries = [0, 0, 0, 0];
    let tier = falls0 ? 1 : 0;
    let at = 0;
    let count = out.count;
    const next = (): number => {
      if (out.count !== count) {
        count = out.count;
        tier = falls0 ? 1 : 0;
        at = 0;
      }
      for (;;) {
        const f = fallsNow();
        if (tries[tier] < (gullies ? GULLY_TRIES : 60))
          for (; at < cands.length; at++) {
            if (done[at] || (f && f[cands[at][1]] !== tier)) continue;
            done[at] = 1;
            return at++;
          }
        if (!f || tier >= 3) return -1;
        tier++;
        at = 0;
      }
    };
    for (let c = next(); c >= 0 && out.count < want; c = next()) {
      const i = cands[c][1];
      const cx = i % W;
      const cy = (i - cx) / W;
      if (placed.some(([px, py]) => Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 24)) continue;
      if (gullies && wanting.some(([px, py]) => Math.max(Math.abs(px - cx), Math.abs(py - cy)) < 4)) continue;
      tries[tier]++;
      if (gullies) wanting.push([cx, cy]);
      // where water on each tile goes (side to side, as the game's water moves), and where a ditch
      // may end: the same until a pit is dug (reused across candidates)
      if (cached.hh !== hh) {
        const dn = drainOf(hh);
        cached = { hh, dn, outs: outlets(dn, only, loose), floors: new Map() };
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
      // (the same for every pit with this floor on this ground: worked out once, read only)
      let ends = cached.floors.get(floor);
      if (!ends) {
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
        // (a gully's: the beds of the gullies drawn below its floor are water it may join, D(new-ditch) (2); every
        // other water, and their beds above it, with the ring beside them, `foreign`: its fall line may not run into it)
        let foreign: Uint8Array | null = null;
        if (gullies) {
          for (const [j, b] of beds) if (b.lv < floor && !keepOff[j]) goal[j] = 1;
          foreign = new Uint8Array(N);
          for (let j = 0; j < N; j++) {
            if (goal[j] || !(wetAt[j] || beds.has(j))) continue;
            const x = j % W;
            const y = (j - x) / W;
            for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
              for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
                if (goal[yy * W + xx]) continue;
                foreign[yy * W + xx] = 1;
                keepOff[yy * W + xx] = 1;
              }
          }
        }
        ends = { goal, keepOff, floor, near: null, ways: [null, null], foreign };
        cached.floors.set(floor, ends);
      }
      const { goal, keepOff, foreign } = ends;
      let clear = true;
      // (the pit lies within 8 tiles of its middle)
      if (ask.keepOff)
        for (let y = Math.max(0, cy - 8); y <= Math.min(H - 1, cy + 8) && clear; y++)
          for (let x = Math.max(0, cx - 8); x <= Math.min(W - 1, cx + 8) && clear; x++) if (pit[y * W + x] && ask.keepOff[y * W + x]) clear = false;
      // (and the ground the basin keeps clear of resources, a square 5 tiles either way of its
      // middle, setpieces/badwaterBasin.ts `clears`: it took a player's forest beside the pit)
      if (ask.keepOff)
        for (let y = Math.max(0, cy - 5); y <= Math.min(H - 1, cy + 5) && clear; y++)
          for (let x = Math.max(0, cx - 5); x <= Math.min(W - 1, cx + 5) && clear; x++) if (ask.keepOff[y * W + x]) clear = false;
      // (and, but on Islands, two tiles clear of another pit's ditch and the banks stepped to it: a gully
      // run past a pit let its water into it, Any 256² seed 2)
      if (!ask.sea)
        for (let y = Math.max(0, cy - 10); y <= Math.min(H - 1, cy + 10) && clear; y++)
          for (let x = Math.max(0, cx - 10); x <= Math.min(W - 1, cx + 10) && clear; x++) if (pit[y * W + x] && nearOfAt(y * W + x, W, H, 2, (j) => avoid[j] === 1)) clear = false;
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
      const traced = E && dnE ? traceRoute(dnE, E, W, edge, pit, goal, keepOff, (i) => goal[i] === 1, limit, foreign ?? undefined) : null;
      // (a gully whose own fall line runs first into water it may not join is no site, D(new-ditch) (1))
      if (traced === "water") continue;
      let base = traced;
      if (!base) base = ditchRoute(hh, E, valleys, groundOf(hh), W, H, edge, pit, wayOf(ends, false), hash32(seed, "ditch", attempt, c))?.tiles ?? null;
      if (!base && !only) base = ditchRoute(hh, E, valleys, groundOf(hh), W, H, edge, pit, wayOf(ends, true), hash32(seed, "ditch", attempt, c))?.tiles ?? null;
      if (!base || base.length < 3 || base.length > limit) continue;
      // drawn as a gully down that line (D(new-ditch): a ditch that cannot wander, running straight
      // along the grid or the diagonal or in a regular wave, is no gully: the pit goes elsewhere)
      // (Islands' ditches as they were, its own ruling to come, D498 (3))
      const gully = gullies;
      const allowed = (i: number) => !pit[i] && !keepOff[i];
      // (a gully ends where its route does: in the water it joins, never on the map's edge short of it)
      const toWater = goal[base[base.length - 1]] === 1;
      const wound = gully ? gullyDitch(base, hh, W, H, toWater ? (i) => allowed(i) && !onBorder(i) : allowed, toWater ? (i) => goal[i] === 1 : isEnd, hash32(seed, "ditch-gully", attempt, c)) : windDitch(base, hh, W, H, allowed, isEnd, hash32(seed, "ditch-meander", attempt, c), stream(seed, "ditch-wave", attempt, c));
      if (!wound) continue;
      const route = { tiles: wound, end: wound[wound.length - 1] };
      // its water must never pass the start's water on the way out
      if ((!loose && passesStart(route.end)) || (only && !goal[route.end])) continue;
      const tiles = route.tiles.slice(0, goal[route.end] ? route.tiles.length - 1 : route.tiles.length);
      if (tiles.length < 2) continue;
      // (a gully: no longer than `DITCH_CAP` (4), and never abreast of a river, a stream or another gully for
      // `ABREAST_RUN` tiles but its last `MOUTH` before it joins (2))
      if (gully && (tiles.length > DITCH_CAP || abreastRun(tiles, W, H, (j) => wetAt[j] === 1 || beds.has(j)) >= ABREAST_RUN)) continue;
      // (nor does it bring a gully drawn before abreast of it, its own mouth left out)
      if (gully && drawn.length) {
        const mine = new Set(tiles.slice(0, Math.max(0, tiles.length - MOUTH)));
        if (drawn.some((d, g) => abreastRun(d.tiles, W, H, (j) => wetAt[j] === 1 || mine.has(j) || (beds.has(j) && beds.get(j)!.g !== g)) >= ABREAST_RUN)) continue;
      }
      // (the gully it joins, if it joins one: its bed's tile and level there)
      const joins = gully ? beds.get(route.end) : undefined;
      // its bed widened beside its route where the gully widens (D(new-ditch)), else (where that
      // would not hold) one tile wide all along
      const ring3 = (i: number) => nearOfAt(i, W, H, 3, (j) => pit[j] === 1);
      const wet = (j: number) => hy.water[j] === 1 || hy.water[j] === 2;
      const bedNear = (i: number) => nearOfAt(i, W, H, 1, (j) => beds.has(j));
      let dug: { next: Uint8Array; plan: BadwaterPlan; bed: Map<number, number>; stepped: number[] } | null = null;
      // (D(new-ditch) (3): a gully's bed keeps its fall: it stays a level over the water it joins as it settles, the
      // planned surface beside its end, until its last `MOUTH` tiles, so nothing backs up it; over the bed it joins, a
      // level over that bed. Ground too low for that is no gully's: its banks don't hold, and the site is no site)
      let need = -Infinity;
      if (gully && goal[route.end]) {
        if (joins) need = joins.lv + 1;
        else {
          let S = -Infinity;
          const ex = route.end % W;
          const ey = (route.end - ex) / W;
          for (let y = Math.max(0, ey - 2); y <= Math.min(H - 1, ey + 2); y++)
            for (let x = Math.max(0, ex - 2); x <= Math.min(W - 1, ex + 2); x++) {
              const j = y * W + x;
              if (goal[j] && wetAt[j]) S = Math.max(S, hh[j] + wetNow[j]);
            }
          if (S > -Infinity) need = Math.floor(S + HOLD) + 1;
        }
      }
      for (const wide of gully ? [true, false] : [false]) {
        const side = wide ? gullySides(tiles, hh, W, H, (i) => !pit[i] && !keepOff[i] && !goal[i] && !wet(i) && !ring3(i) && !bedNear(i), hash32(seed, "ditch-width", attempt, c)) : [];
        const sideAt = new Map<number, number>();
        for (let k = 0; k + 1 < side.length; k += 2) sideAt.set(side[k + 1] * W + side[k], k >> 1);
        // bed levels: the sill one above the floor, then never rising, cut two below the ground beside
        // the route and its widenings (M9b, D302: cut one below, the water refilling it after a drought
        // rose over its banks and spread a sheet of badwater over the flat beside it, which stayed until
        // the badtide)
        const onDitch = new Set(tiles);
        const levels: number[] = [];
        let run = floor + 1;
        for (let k = 0; k < tiles.length; k++) {
          const j = tiles[k];
          const x = j % W;
          const y = (j - x) / W;
          let ring = hh[j];
          const cells = [j];
          for (const [dx, dy] of N4) {
            if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
            const n = (y + dy) * W + x + dx;
            if (sideAt.has(n)) cells.push(n);
          }
          for (const cc of cells) {
            const xc = cc % W;
            const yc = (cc - xc) / W;
            ring = Math.min(ring, hh[cc]);
            for (const [dx, dy] of N4) {
              if (xc + dx < 0 || yc + dy < 0 || xc + dx >= W || yc + dy >= H) continue;
              const n = (yc + dy) * W + xc + dx;
              if (pit[n] || onDitch.has(n) || sideAt.has(n) || wet(n) || beds.has(n)) continue;
              ring = Math.min(ring, hh[n]);
            }
          }
          run = Math.min(run, ring - 2);
          if (run < BED_FLOOR) run = BED_FLOOR;
          // (held over the water it joins until its mouth; at its mouth never under the bed it joins)
          levels.push(k < tiles.length - MOUTH ? Math.max(run, need) : joins ? Math.max(run, joins.lv) : run);
        }
        const outlet: number[] = [];
        for (const j of tiles) outlet.push(j % W, Math.floor(j / W));
        const plan: BadwaterPlan = { mode: "basin", x: cx - 1, y: cy - 1, floor, strength: ask.strength, outlet, outletLevels: levels, outletWidth: 1, outletTo: joins ? "ditch" : goal[route.end] ? (hy.water[route.end] === 2 ? "lake" : "river") : "edge" };
        if (side.length) plan.outletSide = side;
        // dig it into a copy and prove it holds before touching the map
        const next = hh.slice();
        for (let j = 0; j < N; j++) if (pit[j]) next[j] = floor;
        const bed = channelTiles({ tiles: outlet, levels, width: 1, to: "", side }, W, H).bed;
        for (const [j, lv] of bed) next[j] = Math.min(next[j], lv);
        // its banks stepped down to the bed a level a tile, a gully's sides (never the pit and its rim,
        // water or the ground by it, the gullies drawn and their banks, nor ground the ditch keeps off)
        const stepped = !gully ? [] : stepBanks(next, bed, W, H, (i) => keepOff[i] === 1 || bedNear(i), (i) => nearOfAt(i, W, H, 1, (j) => pit[j] === 1) || nearOfAt(i, W, H, 2, wet));
        let flat = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (next[(cy + dy) * W + cx + dx] !== floor) flat = false;
        // (the check of the map reads the route's bed alone as the levee: so does this one)
        if (!flat || basinLeak(plan, next, W, H)) continue;
        // banks: every tile beside the bed stands above it
        let banks = true;
        for (const [j, lv] of bed) {
          const x = j % W;
          const y = (j - x) / W;
          for (const [dx, dy] of N4) {
            if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
            const n = (y + dy) * W + x + dx;
            if (pit[n] || bed.has(n) || wet(n) || beds.has(n)) continue;
            if (next[n] < lv + 1) banks = false;
          }
        }
        if (!banks) continue;
        dug = { next, plan, bed, stepped };
        break;
      }
      if (!dug) continue;
      const { plan } = dug;
      hh = dug.next;
      for (let j = 0; j < N; j++) if (pit[j]) avoid[j] = 1;
      for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) if (x >= 0 && y >= 0 && x < W && y < H) avoid[y * W + x] = 1;
      for (const j of dug.bed.keys()) avoid[j] = 1;
      for (const j of dug.stepped) avoid[j] = 1;
      const role = `setpiece/badwaterBasin/${out.count}`;
      const f: SetPieceFeature = {
        id: featureId(seed, "setPiece", role),
        kind: "setPiece",
        origin: "generated",
        role,
        locked: false,
        params: { kind: "badwaterBasin", request: { mode: "basin", at: [cx, cy], strength: ask.strength }, plan: { ...plan }, report: ["a hollow found in the land: badwater rises in its pit and leaves by a winding ditch"] },
      };
      out.features.push(f);
      out.count++;
      placed.push([cx, cy]);
      if (gully) {
        wanting.pop();
        // (its bed, which a later gully may join, and its banks, which that one may cut through, off its pit's square)
        const g = drawn.length;
        drawn.push({ plan: f.params.plan as unknown as BadwaterPlan, tiles, levels: plan.outletLevels, pit, cx, cy });
        const offSquare = (j: number) => Math.max(Math.abs((j % W) - cx), Math.abs(Math.floor(j / W) - cy)) > 6;
        for (const [j, lv] of dug.bed) {
          beds.set(j, { g, lv });
          if (offSquare(j)) joinable[j] = 1;
        }
        for (const j of dug.stepped) if (offSquare(j)) joinable[j] = 1;
        // (the gully it joins goes on below as one bed, a tile wider, D(new-ditch) (2))
        if (joins) widen(joins.g, route.end);
      }
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

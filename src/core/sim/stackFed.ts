// Fed water, unfed water and Fill on a map with caves or overhangs (D120, D387, D394): the same questions
// sim/fed.ts and sim/fill.ts answer on a heightfield, asked of every water column, on the stacked engine's own
// geometry (stackWater.ts `stackGraph`: its columns, the edges between overlapping columns of neighbouring
// tiles, the map's edge where water leaves, the direction limiters, the columns a running emitter gives water
// into). A tile with a cave has several columns, one above another; water on one is not water on another.
//
// - Fed: from every running emitter's columns (and the seeds a question gives, the stored lakes kept), water
//   reaches a wet neighbouring column when the game's flow rule would carry it there: the neighbour's floor
//   stands no higher than the reached column's surface (a partial obstacle, a NaturalDam, only once
//   overtopped), along an edge the flow rules allow. Every other wet column is unfed: a cave pool nothing
//   feeds, a sealed lake, a Fill.
// - A Fill to a level from a column: the columns joined to it whose ground stands below the level, through
//   edges the flow rules allow, all of them standing at that level; a column whose roof is below the level is
//   full, under the pressure of the water above it, as the game holds it (prefill's rule). Refused with a
//   plain reason when the water would leave the map, or when no column of the hollow is open up to the level
//   (it is closed above: nothing stands at that level).
//
// A stored lake's entry names its column by its floor (rust/water/src/stack_prefill.rs `retained_column`: the
// tile's column with that floor, else its top column), so a lake in a cave is kept in the cave.

import { OPEN_CEILING } from "./columns";
import { NATURAL_DAM_HEIGHT } from "./model";
import type { RetainedWater } from "./water";

/** The game's pressure scale (rust/water/src/stack.rs `PRESSURE`): a full column's pressure `o` is the water
 *  standing `o · PRESSURE` above its roof. */
export const PRESSURE = 8;

/** The stacked engine's geometry of a map, as its questions walk it. Column id = slot·N + tile. */
export interface StackGraph {
  W: number;
  H: number;
  N: number;
  /** The most columns of any tile. */
  L: number;
  count: Uint8Array;
  floor: Int16Array;
  ceil: Int16Array;
  /** Each column's edges are `start[c]` up to `start[c + 1]`; an edge's `target` is the neighbouring column, or -1
   *  the map's edge (water leaves there). */
  start: Uint32Array;
  target: Int32Array;
  /** Per edge, 1 when the flow rules let water take it. */
  allowed: Uint8Array;
  /** Per column, 1 where a running emitter gives water. */
  emitting: Uint8Array;
  /** Partial obstacles by cell (z·N + tile): their height (rust/water/src/columns.rs). Null when none. */
  limit: Map<number, number> | null;
}

/** The partial obstacles of the objects the stacked engine takes (stackWater.ts `stackObjectRows`: eight numbers
 *  each, kind 2 a NaturalDam on its own cell), by cell. */
export function heightLimits(W: number, H: number, rows: ArrayLike<number>): Map<number, number> | null {
  let out: Map<number, number> | null = null;
  for (let k = 0; k + 8 <= rows.length; k += 8) {
    if (rows[k] !== 2) continue;
    const x = rows[k + 1];
    const y = rows[k + 2];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    (out ??= new Map()).set(rows[k + 3] * W * H + y * W + x, NATURAL_DAM_HEIGHT);
  }
  return out;
}

/** The partial obstacle water from column `c`, standing at `hc`, meets on its way into column `t` (the game's
 *  rule, rust/water/src/stack.rs `height_limit`), or -1. */
function limitOn(g: StackGraph, c: number, t: number, hc: number): number {
  if (!g.limit) return -1;
  const tile = t % g.N;
  const top = Math.ceil(hc);
  for (let z = Math.max(g.floor[c], g.floor[t]); z < top; z++) {
    const v = g.limit.get(z * g.N + tile);
    if (v !== undefined) return v;
  }
  return -1;
}

/** A column's ground: its floor, raised by a partial obstacle standing on it. */
function groundOf(g: StackGraph, c: number): number {
  const f = g.floor[c];
  return f + (g.limit?.get(f * g.N + (c % g.N)) ?? 0);
}

/** The columns (ids) water a running emitter gives, or a seed's (a mask by column), reaches (1), by the game's flow
 *  rule (see the file comment). `overflow`: a full column's pressure, which pushes its water over a partial
 *  obstacle as the game's does. */
export function fedColumns(g: StackGraph, depth: ArrayLike<number>, overflow?: ArrayLike<number> | null, seeds?: ArrayLike<number> | null): Uint8Array {
  const size = g.L * g.N;
  const fed = new Uint8Array(size);
  const queue = new Int32Array(size);
  let tail = 0;
  for (let c = 0; c < size; c++) {
    if (!g.emitting[c]) continue;
    fed[c] = 1;
    queue[tail++] = c;
  }
  if (seeds)
    for (let c = 0; c < size; c++) {
      if (!seeds[c] || fed[c] || !(depth[c] > 0)) continue;
      fed[c] = 1;
      queue[tail++] = c;
    }
  for (let h = 0; h < tail; h++) {
    const c = queue[h];
    const d = depth[c];
    if (!(d > 0)) continue;
    const hc = g.floor[c] + d;
    const head = hc + (overflow ? overflow[c] : 0) * PRESSURE;
    for (let e = g.start[c]; e < g.start[c + 1]; e++) {
      const t = g.target[e];
      if (t < 0 || !g.allowed[e] || fed[t] || !(depth[t] > 0)) continue;
      const ft = g.floor[t];
      // (level counts, as on a heightfield: a lake filled to its spill level stands exactly at its rim)
      if (!(ft <= hc)) continue;
      const lim = limitOn(g, c, t, hc);
      if (lim >= 0 && head - ft < lim) continue;
      fed[t] = 1;
      queue[tail++] = t;
    }
  }
  return fed;
}

/** The unfed water's bodies (columns joined by their edges, every one wet and unfed), each as its columns,
 *  ascending, in the order of their first column. With `inside` (a mask by tile), only the bodies with a column
 *  on a tile inside it, whole, and with them every body on a tile they share (a pool in a cave under a pool on
 *  its roof): a removal takes the unfed water of the tiles it names, so a body it touched goes whole. */
export function unfedColumnBodies(g: StackGraph, depth: ArrayLike<number>, overflow?: ArrayLike<number> | null, inside?: Uint8Array | null): number[][] {
  const { N } = g;
  const size = g.L * N;
  const fed = fedColumns(g, depth, overflow);
  const body = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  const all: number[][] = [];
  for (let s = 0; s < size; s++) {
    if (body[s] >= 0 || fed[s] || !(depth[s] > 0)) continue;
    const id = all.length;
    body[s] = id;
    queue[0] = s;
    let tail = 1;
    for (let h = 0; h < tail; h++) {
      const c = queue[h];
      for (let e = g.start[c]; e < g.start[c + 1]; e++) {
        const t = g.target[e];
        if (t < 0 || body[t] >= 0 || fed[t] || !(depth[t] > 0)) continue;
        body[t] = id;
        queue[tail++] = t;
      }
    }
    all.push(Array.from(queue.subarray(0, tail)).sort((a, b) => a - b));
  }
  if (!inside) return all;
  // the bodies with a tile inside, and every body sharing a tile with one taken, until none is added
  const take = new Uint8Array(all.length);
  const stack: number[] = [];
  all.forEach((b, k) => {
    if (b.some((c) => inside[c % N] === 1)) {
      take[k] = 1;
      stack.push(k);
    }
  });
  while (stack.length) {
    const k = stack.pop()!;
    for (const c of all[k]) {
      const i = c % N;
      for (let q = 0; q < g.count[i]; q++) {
        const o = body[q * N + i];
        if (o >= 0 && !take[o]) {
          take[o] = 1;
          stack.push(o);
        }
      }
    }
  }
  return all.filter((_, k) => take[k]);
}

/** The column a stored lake's entry stands in (rust/water/src/stack_prefill.rs `retained_column`): its tile's column
 *  with the entry's floor, else the tile's top column. */
export function retainedColumn(g: Pick<StackGraph, "N" | "count" | "floor">, tile: number, floor: number): number {
  const n = g.count[tile];
  for (let q = 0; q < n; q++) if (g.floor[q * g.N + tile] === floor) return q * g.N + tile;
  return (n - 1) * g.N + tile;
}

/** The stored lakes' columns a removal didn't drain, as a mask by column, or null when there are none: the seeds
 *  of the water a removal leaves (sim/fed.ts `keptSeeds`, on columns). */
export function keptColumnSeeds(g: StackGraph, retained: readonly RetainedWater[] | undefined, drained: readonly number[] | undefined): Uint8Array | null {
  if (!retained?.length) return null;
  const gone = new Uint8Array(g.N);
  for (const i of drained ?? []) gone[i] = 1;
  const mask = new Uint8Array(g.L * g.N);
  let any = false;
  for (const r of retained)
    for (let k = 0; k < r.tiles.length; k++) {
      const i = r.tiles[k];
      if (gone[i] || !g.count[i]) continue;
      mask[retainedColumn(g, i, r.floor[k])] = 1;
      any = true;
    }
  return any ? mask : null;
}

/** The unfed water on the drained tiles taken away, in place (`depth`, `overflow`, `contamination` by column; the
 *  momentum of their edges, when given): what a removal takes once the water has settled (stackWater.ts
 *  `canonicalStackRun`), and from the water carried over after an edit. Water a source or a kept lake feeds is never
 *  taken. Whether any was. */
export function drainColumns(g: StackGraph, water: { depth: Float64Array; overflow: Float64Array; contamination: Float64Array; momentum?: Float64Array | null }, drained: readonly number[], seeds: ArrayLike<number> | null): boolean {
  const fed = fedColumns(g, water.depth, water.overflow, seeds);
  let any = false;
  for (const i of drained) {
    if (i < 0 || i >= g.N) continue;
    for (let q = 0; q < g.count[i]; q++) {
      const c = q * g.N + i;
      if (!(water.depth[c] > 0) || fed[c]) continue;
      water.depth[c] = 0;
      water.overflow[c] = 0;
      water.contamination[c] = 0;
      if (water.momentum) for (let e = g.start[c]; e < g.start[c + 1]; e++) water.momentum[e] = 0;
      any = true;
    }
  }
  return any;
}

/** A stored lake's water on its columns as every settle starts it (rust/water/src/stack_prefill.rs `prefill`): on the
 *  column whose floor is the entry's, its depth, a full column under the pressure of the water above its roof; on
 *  another (the ground changed under it), up to the surface it had. */
export function placeLake(g: StackGraph, r: RetainedWater, k: number): { c: number; depth: number; overflow: number } {
  const i = r.tiles[k];
  const c = retainedColumn(g, i, r.floor[k]);
  const f = g.floor[c];
  const ce = g.ceil[c];
  const cap = ce - f;
  if (f === r.floor[k]) {
    if (r.depth[k] > cap) {
      const o = (r.floor[k] + r.depth[k] - ce) / PRESSURE;
      const most = (OPEN_CEILING - ce) / PRESSURE;
      return { c, depth: cap, overflow: o > most ? most : o };
    }
    return { c, depth: r.depth[k], overflow: 0 };
  }
  let d = r.floor[k] + r.depth[k] - f;
  if (d > cap) d = cap;
  return { c, depth: d > 0 ? d : 0, overflow: 0 };
}

/** The water a Fill to `level` stores, from the column at tile (x, y) with floor `floor` (none given: the tile's highest
 *  column whose ground stands below the level), as its entries, ascending by tile and then floor: each column's tile,
 *  floor and depth to the level (a full column's runs past its roof, its pressure), clean, with the floor of the column
 *  it was measured from. Or a plain one-line reason
 *  the hollow doesn't hold water at that level. With the water the map shows (`water`, by column), also refused where
 *  water already stands at that level. */
export function stackFillLake(g: StackGraph, x: number, y: number, level: number, floor?: number | null, water?: { depth: ArrayLike<number>; overflow: ArrayLike<number> } | null): { lake: RetainedWater; floor: number } | { reason: string } {
  const { W, H, N } = g;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return { reason: `X ${x} · Y ${y} is off the map` };
  if (!Number.isFinite(level)) return { reason: "the level must be a number" };
  if (level > OPEN_CEILING) return { reason: `level ${fmt(level)} is above the top of the map (${OPEN_CEILING})` };
  const at = y * W + x;
  let s = -1;
  if (floor !== undefined && floor !== null) {
    for (let q = 0; q < g.count[at] && s < 0; q++) if (g.floor[q * N + at] === floor) s = q * N + at;
    if (s < 0) return { reason: `there is no ground at level ${fmt(floor)} at X ${x} · Y ${y}` };
  } else {
    for (let q = g.count[at] - 1; q >= 0 && s < 0; q--) if (groundOf(g, q * N + at) < level) s = q * N + at;
    if (s < 0) s = at;
  }
  if (!(groundOf(g, s) < level)) {
    return { reason: g.floor[s] >= level ? `level ${fmt(level)} is at or below the ground at X ${x} · Y ${y}, which stands at ${fmt(g.floor[s])}` : `a natural dam at X ${x} · Y ${y} stands above level ${fmt(level)}` };
  }
  const size = g.L * N;
  const seen = new Uint8Array(size);
  const queue = new Int32Array(size);
  seen[s] = 1;
  queue[0] = s;
  let tail = 1;
  let open = false;
  let roof = -Infinity;
  for (let h = 0; h < tail; h++) {
    const c = queue[h];
    if (g.ceil[c] >= level) open = true;
    else if (g.ceil[c] > roof) roof = g.ceil[c];
    for (let e = g.start[c]; e < g.start[c + 1]; e++) {
      if (!g.allowed[e]) continue;
      const t = g.target[e];
      if (t < 0) {
        const i = c % N;
        return { reason: `at level ${fmt(level)} the water would spill off the map at X ${i % W} · Y ${Math.floor(i / W)}: the hollow doesn't hold it` };
      }
      if (seen[t] || !(groundOf(g, t) < level)) continue;
      seen[t] = 1;
      queue[tail++] = t;
    }
  }
  if (!open) return { reason: `the hollow is closed above at level ${fmt(roof)}: fill it to ${fmt(roof)} or lower` };
  const cols = Array.from(queue.subarray(0, tail)).sort((a, b) => a % N - (b % N) || g.floor[a] - g.floor[b]);
  if (water && cols.every((c) => g.floor[c] + water.depth[c] + water.overflow[c] * PRESSURE >= level - 1e-9)) return { reason: `water already stands at level ${fmt(level)} there` };
  return {
    floor: g.floor[s],
    lake: {
      tiles: cols.map((c) => c % N),
      floor: cols.map((c) => g.floor[c]),
      depth: cols.map((c) => level - g.floor[c]),
      contamination: cols.map(() => 0),
    },
  };
}

/** Why a stored Fill no longer fits the map (null when it does): its hollow at its level, measured on the map now,
 *  must be the columns it stores. */
export function stackFillProblem(g: StackGraph, at: readonly [number, number], level: number, lake: RetainedWater, floor?: number | null): string | null {
  const r = stackFillLake(g, at[0], at[1], level, floor);
  if ("reason" in r) return r.reason;
  const t = r.lake.tiles;
  if (t.length !== lake.tiles.length || t.some((i, k) => i !== lake.tiles[k] || r.lake.floor[k] !== lake.floor[k])) return "the hollow is no longer the one measured: measure the fill again";
  return null;
}

/** A Fill's water seen from above, one entry a tile (its highest column's: the open surface), for `fillDays`' rough
 *  answer of how long it lasts. */
export function lakeFromAbove(lake: RetainedWater): RetainedWater {
  const top = new Map<number, number>();
  for (let k = 0; k < lake.tiles.length; k++) {
    const j = top.get(lake.tiles[k]);
    if (j === undefined || lake.floor[k] > lake.floor[j]) top.set(lake.tiles[k], k);
  }
  const ks = [...top.values()].sort((a, b) => lake.tiles[a] - lake.tiles[b]);
  return { tiles: ks.map((k) => lake.tiles[k]), floor: ks.map((k) => lake.floor[k]), depth: ks.map((k) => lake.depth[k]), contamination: ks.map((k) => lake.contamination[k]) };
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** The stored lakes and removals on the water carried over after an edit, in place (`water` by column), as the settle
 *  will have them: each lake's columns hold at least the water it starts with (a Fill shows at once), and the unfed
 *  water on the drained tiles goes (a removal takes it at once, D260); the canonical settle follows. Whether any
 *  water changed. */
export function keptOnStack(g: StackGraph, water: { depth: Float64Array; overflow: Float64Array; contamination: Float64Array }, retained: readonly RetainedWater[] | undefined, drained: readonly number[] | undefined): boolean {
  let any = false;
  for (const r of retained ?? [])
    for (let k = 0; k < r.tiles.length; k++) {
      if (!g.count[r.tiles[k]]) continue;
      const w = placeLake(g, r, k);
      if (!(w.depth + w.overflow > water.depth[w.c] + water.overflow[w.c])) continue;
      water.depth[w.c] = w.depth;
      water.overflow[w.c] = w.overflow;
      water.contamination[w.c] = w.depth > 0 ? r.contamination[k] : 0;
      any = true;
    }
  if (drained?.length && drainColumns(g, water, drained, keptColumnSeeds(g, retained, drained))) any = true;
  return any;
}

/** An imported map's own standing water that no running source of its file feeds, on every column (D457: a pool in a
 *  cave included), as a stored lake's entries ascending by tile and then floor (a full cave's pressure as the water
 *  standing over its roof), or null when it has none. */
export function unfedOwnWater(g: StackGraph, water: { count: ArrayLike<number>; depth: ArrayLike<number>; overflow: ArrayLike<number>; contamination: ArrayLike<number> }): RetainedWater | null {
  const fed = fedColumns(g, water.depth, water.overflow);
  const tiles: number[] = [];
  const floor: number[] = [];
  const depth: number[] = [];
  const contamination: number[] = [];
  for (let i = 0; i < g.N; i++)
    for (let q = 0; q < g.count[i]; q++) {
      const c = q * g.N + i;
      if (!(water.depth[c] > 0) || fed[c]) continue;
      tiles.push(i);
      floor.push(g.floor[c]);
      depth.push(water.depth[c] + water.overflow[c] * PRESSURE);
      contamination.push(water.contamination[c]);
    }
  return tiles.length ? { tiles, floor, depth, contamination } : null;
}

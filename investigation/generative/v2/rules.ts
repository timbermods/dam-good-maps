// Kyler's start and edge rules (2026-09-25), applied by the prototype on top of the product's
// validators (no src/ change here). The design's batches ran before src/core carried them; the core
// rules reached dev with #44 (D151–D153, D164, D171), and M9a builds the generator on those:
// 1. No edge walls (extends D111): no map raises a wall along its edges to hold water. Blocking.
// 2. Maps need not hold their water: rivers leave and lakes may drain; nothing but the start's
//    requirements is guaranteed about water.
// 3. The start water rule (amends D85): clean water counts when a walking path from the start
//    reaches a shore tile over the map's own terrain and its own slopes (never player-built stairs),
//    within the difficulty's walk (12 / 20 / 28 tiles), and a pump on that shore reaches the water
//    (at least 0.3 deep, its surface 0–2 levels below the shore). The water no longer needs to be
//    on the start's own level.
// 4. Starting wood (D164): the start's trees requirement counts logs, not trees: every grown Pine,
//    Birch and Oak within 20 tiles' walk of the start, living or dead, at its species' yield (Oak 8,
//    Pine 2 plus resin, Birch 1). Saplings can't be cut until they grow, so they don't count; their
//    future wood is reported apart ("plus about N logs growing"). The difficulty's 60 / 40 / 20 trees become logs at the default species
//    mix's 2.8 logs a tree (Pine 47, Birch 27, Oak 20, Succulent 6): 170 / 110 / 55. The core rule
//    on dev (#44) asks for 120 / 80 / 40, which M9a takes (decisions-pending #68).

import { PUMP_REACH, reachAt, walkDistance } from "../../../src/core/analysis/walk";
import type { EntitySpec } from "../../../src/core/format/entities";
import { footprintTiles, slopeHighSide, FOOTPRINTS } from "../../../src/core/format/footprints";
import { MinHeap } from "../../../src/core/math/grid";
import type { Difficulty } from "../../../src/core/spec/mapspec";
import { BAD, NEAR, WALK_BLOCKERS, WET } from "../../../src/core/validate/playability";

const N4: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Shore tiles: dry ground beside clean water 0.3+ deep whose surface a pump on that ground
 *  reaches (0 to PUMP_REACH levels below the ground's own level). */
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
      if (D[j] >= 0.3 && C[j] < BAD && s >= h[i] - PUMP_REACH && s <= h[i] + 0.01) {
        out[i] = 1;
        break;
      }
    }
  }
  return out;
}

type Placed = Pick<EntitySpec, "template" | "x" | "y" | "orientation"> & { components?: Record<string, unknown> };

/** The walk from the start over the map's own slopes (its `Slope` objects), never stairs; walking
 *  blockers by footprint, as the validator reads them. */
export function startWalk(h: ArrayLike<number>, W: number, H: number, entities: readonly Placed[], start: { x: number; y: number }): Float64Array {
  const N = W * H;
  const blocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const o of entities) {
    if (o.template === "Slope") {
      const [dx, dy] = slopeHighSide(o.orientation);
      const hx = o.x + dx;
      const hy = o.y + dy;
      if (o.x >= 0 && o.x < W && o.y >= 0 && o.y < H && hx >= 0 && hx < W && hy >= 0 && hy < H) links.push([o.y * W + o.x, hy * W + hx]);
      continue;
    }
    if (!WALK_BLOCKERS.has(o.template) || !FOOTPRINTS[o.template]) continue;
    for (const [x, y] of footprintTiles(o.template, o as never)) if (x >= 0 && x < W && y >= 0 && y < H) blocked[y * W + x] = 1;
  }
  return walkDistance(h, W, H, blocked, links, start);
}

/** Kyler's start water rule: the walk to the nearest pump shore, the water tile its pump draws
 *  from, and whether the shore is on the start's own level. */
export function startWaterWalk(
  h: ArrayLike<number>,
  D: ArrayLike<number>,
  C: ArrayLike<number>,
  W: number,
  H: number,
  entities: readonly Placed[],
  start: { x: number; y: number },
  walk: Float64Array = startWalk(h, W, H, entities, start),
): { distance: number; tile: number; water: number; sameLevel: boolean } {
  const N = W * H;
  const shore = pumpShores(h, D, C, W, H);
  let distance = Infinity;
  let tile = -1;
  for (let i = 0; i < N; i++) if (shore[i] && walk[i] < distance) {
    distance = walk[i];
    tile = i;
  }
  let water = -1;
  if (tile >= 0) {
    const x = tile % W;
    const y = (tile - x) / W;
    for (const [dx, dy] of N4) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const s = h[j] + D[j];
      if (water < 0 && D[j] >= 0.3 && C[j] < BAD && s >= h[tile] - PUMP_REACH && s <= h[tile] + 0.01) water = j;
    }
  }
  return { distance, tile, water, sameLevel: tile >= 0 && h[tile] === h[start.y * W + start.x] };
}

/** Logs a tree of each species yields when cut (the game's Yielder:Cuttable). */
export const LOG_YIELD: Record<string, number> = { Oak: 8, Pine: 2, Birch: 1 };
/** Starting wood by difficulty (D164): the old tree counts (60 / 40 / 20) at 2.8 logs a tree. */
export const STARTING_WOOD: Record<Difficulty, number> = { easy: 170, normal: 110, hard: 55 };
/** Days a tree of each species takes to grow (regrowth: Oak slow, Birch fast). */
export const GROW_DAYS: Record<string, number> = { Birch: 7, Pine: 12, Oak: 30 };

export interface StartingWood {
  /** Logs of the grown trees (the requirement). */
  logs: number;
  /** Logs the saplings will yield once grown (shown apart, never counted). */
  growing: number;
  bySpecies: { Oak: number; Pine: number; Birch: number };
  trees: number;
  /** Oak's share of the logs: high is plenty of wood, slow to regrow. */
  oakShare: number;
}

/** Starting wood (D164): logs of every grown Pine, Birch and Oak, living or dead, within 20 tiles'
 *  walk of the start over the map's own slopes, at its species' yield; saplings' logs apart. */
export function startingWood(h: ArrayLike<number>, W: number, H: number, entities: readonly Placed[], start: { x: number; y: number }, walk: Float64Array = startWalk(h, W, H, entities, start)): StartingWood {
  const by = { Oak: 0, Pine: 0, Birch: 0 };
  let trees = 0;
  let growing = 0;
  for (const e of entities) {
    const y0 = LOG_YIELD[e.template];
    if (y0 === undefined || e.x < 0 || e.x >= W || e.y < 0 || e.y >= H) continue;
    if (reachAt(walk, W, H, e.y * W + e.x) > NEAR) continue;
    const amount = val((e.components?.["Yielder:Cuttable"] as { Yield?: { Amount?: unknown } } | undefined)?.Yield?.Amount, y0);
    const grown = val((e.components?.Growable as { GrowthProgress?: unknown } | undefined)?.GrowthProgress, 1) >= 1;
    if (!grown) {
      growing += amount;
      continue;
    }
    by[e.template as keyof typeof by] += amount;
    trees++;
  }
  const logs = by.Oak + by.Pine + by.Birch;
  return { logs, growing, bySpecies: by, trees, oakShare: logs ? Math.round((by.Oak / logs) * 1000) / 1000 : 0 };
}

/** A number from an entity component: a plain number, or the file format's float wrapper. */
function val(v: unknown, fallback: number): number {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "value" in v && typeof (v as { value: unknown }).value === "number") return (v as { value: number }).value;
  return fallback;
}

/** The wood a start offers, in a player's words. */
export function woodKind(w: StartingWood): string {
  if (!w.logs) return "no wood";
  if (w.oakShare >= 0.75) return "mostly oak: plenty of wood, slow to regrow";
  if (w.oakShare < 0.35) return "mostly pine and birch: little wood a tree, quick to regrow";
  return "mixed woods";
}

/** An optimistic estimate of the same walk for the settler, before the slopes exist: the walk from
 *  every pump shore over steps of at most one level (a slope could join them), `limit` tiles. */
export function shoreWalkAny(h: ArrayLike<number>, W: number, H: number, D: ArrayLike<number>, C: ArrayLike<number>, limit: number): Float64Array {
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  const shore = pumpShores(h, D, C, W, H);
  for (let i = 0; i < N; i++) if (shore[i]) {
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

export interface EdgeWall {
  edge: "west" | "east" | "south" | "north";
  from: number;
  to: number;
  /** The band's crest over the ground just inside it, in levels (the largest along the stretch). */
  rise: number;
}

/** Edge walls: 6+ consecutive tiles along a map edge where a thin band at the edge (its outer 2
 *  tiles) stands 2+ levels over all the ground 2–5 tiles in, with water lying behind it (2–10 tiles
 *  in, below the band's top): a raised rim that keeps water off the edge. Land that rises toward
 *  the edge (a valley side, a slope) is not a wall: its ground just inside rises too. */
export function edgeWalls(h: ArrayLike<number>, D: ArrayLike<number>, W: number, H: number): EdgeWall[] {
  const out: EdgeWall[] = [];
  const edges: [EdgeWall["edge"], number, (k: number, t: number) => number][] = [
    ["west", H, (k, t) => k * W + t],
    ["east", H, (k, t) => k * W + (W - 1 - t)],
    ["south", W, (k, t) => t * W + k],
    ["north", W, (k, t) => (H - 1 - t) * W + k],
  ];
  for (const [edge, len, at] of edges) {
    let run = 0;
    let rise = 0;
    for (let k = 0; k <= len; k++) {
      let wall = false;
      let r = 0;
      if (k < len) {
        const crest = Math.max(h[at(k, 0)], h[at(k, 1)]);
        let inner = -Infinity;
        for (let t = 2; t <= 5; t++) inner = Math.max(inner, h[at(k, t)]);
        let wet = false;
        for (let t = 2; t <= 10 && !wet; t++) {
          const i = at(k, t);
          if (D[i] >= 0.1 && h[i] + D[i] < crest) wet = true;
        }
        r = crest - inner;
        wall = r >= 2 && wet;
      }
      if (wall) {
        run++;
        rise = Math.max(rise, r);
      } else {
        if (run >= 6) out.push({ edge, from: k - run, to: k - 1, rise });
        run = 0;
        rise = 0;
      }
    }
  }
  return out;
}

/** D171: a water source starts a river: at the map edge where a river enters, or as a spring at a
 *  head, never inside a river or a lake and never downstream. Counts the planned springs that break
 *  it: a spring inside a planned lake, or within 1.5 tiles of another river's course (a river that
 *  joined it at its head would put the spring inside that river's flow). */
export function sourcesInFlow(rivers: readonly { params: { path: readonly (readonly [number, number])[]; entry: { spring?: readonly [number, number] } | object } }[], lakes: readonly { tiles: readonly number[] }[], W: number): number {
  const lake = new Set<number>();
  for (const lk of lakes) for (const i of lk.tiles) lake.add(i);
  let bad = 0;
  rivers.forEach((r, k) => {
    const e = r.params.entry as { spring?: readonly [number, number] };
    if (!e.spring) return;
    const [sx, sy] = e.spring;
    if (lake.has(Math.round(sy) * W + Math.round(sx))) {
      bad++;
      return;
    }
    const near = rivers.some((o, m) => m !== k && o.params.path.some(([x, y]) => (x - sx) * (x - sx) + (y - sy) * (y - sy) <= 2.25));
    if (near) bad++;
  });
  return bad;
}

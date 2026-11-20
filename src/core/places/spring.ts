// A spring by a real place's start (D245's water floor: "one natural spring stands where the land
// drains near the start, the smallest that works, in D314's grouped sources"). With the edges open
// (D151) the rivers run off the map instead of pooling behind the survey's sealed border, and a few
// starts lose the water they were put beside. Where no spot of the place's own land gives the start
// water (start.ts), a spring is offered where the colony walks to: the candidate rule the
// generator's spring by the start and the editor's water fix share (water/springSites.ts), as a
// group of sources by D314's rule (water/sourceGroups.ts), at the fix's strengths. Sources only,
// never land (D245). tools/real-places.ts builds each in turn and keeps the first the checks pass.
// Pure and deterministic.

import { components } from "../analysis/regions";
import { PUMP_CLEAN, PUMP_REACH, reachAt, tileShoreWalk, walkDistance } from "../analysis/walk";
import { FIX_STRENGTH, FIX_TRIES } from "../doc/waterFix";
import { hash32 } from "../math/hash";
import { placeSourceGroup } from "../water/sourceGroups";
import { springCandidates } from "../water/springSites";
import { decodeTiles, type PlaceData } from "./place";

/** Whether a spring at tile `i` stands above the start: on ground higher than the start's middle tile, so its water runs
 *  down across land the start can use (D537, planning's ruling of 2026-11-16: the start's spring). */
export function aboveStart(p: PlaceData, heights: ArrayLike<number>, i: number): boolean {
  return heights[i] > heights[(p.start[1] + 1) * p.W + p.start[0] + 1];
}

/** The pool the start's first settlers pump from (D537, planning's ruling of 2026-11-16): the nearest water,
 *  by the walk from the start (`walkDistance`), that a pump on a shore the walk reaches draws from (`tileShoreWalk`:
 *  clean, 0.3 deep or more, its surface 0 to 2 levels under the shore's ground, the Folktails WaterPump's pipe, the
 *  shorter of the two factions' first pumps; Iron Teeth's first is the DeepWaterPump), within `within` tiles, in a body
 *  that stands as a pool: a body of wet tiles (over `POOL_WET` deep) less than `thinShare` of whose tiles are `thin`
 *  deep or less (not a thin sheet, nor the edge's floor-0 sheet, which is thin). Its walk, tile, depth there, deepest depth of its body, the drop from
 *  the shore's ground to the water's surface (levels) and its body's tiles; null when there is none. */
/** A wet tile of a pool's body (the places' and the measure's wet line, `tools/lib/placeWater.ts` `WET`). */
const POOL_WET = 0.05;
export interface StartPool {
  walk: number;
  tile: number;
  depth: number;
  deepest: number;
  drop: number;
  tiles: number;
}
export function startPool(p: PlaceData, heights: ArrayLike<number>, depth: ArrayLike<number>, contamination: ArrayLike<number>, opts: { within?: number; thin: number; thinShare: number }): StartPool | null {
  const { W, H } = p;
  const N = W * H;
  const within = opts.within ?? 20;
  const walk = walkDistance(heights, W, H, null, [], { x: p.start[0] + 1, y: p.start[1] + 1 });
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (depth[i] > POOL_WET) wet[i] = 1;
  const { labels, sizes } = components(wet, W, H);
  const thin = new Array<number>(sizes.length).fill(0);
  const deepest = new Array<number>(sizes.length).fill(0);
  for (let i = 0; i < N; i++) {
    const b = labels[i];
    if (b < 0) continue;
    if (depth[i] <= opts.thin) thin[b]++;
    deepest[b] = Math.max(deepest[b], depth[i]);
  }
  let best: StartPool | null = null;
  for (let i = 0; i < N; i++) {
    const b = labels[i];
    if (b < 0 || thin[b] >= opts.thinShare * sizes[b]) continue;
    const w = tileShoreWalk(walk, heights, W, H, i, depth[i], contamination[i] < PUMP_CLEAN);
    if (!(w <= within) || (best && w >= best.walk)) continue;
    // (the shore the walk reaches it from: the drop from its ground to the water's surface)
    const x = i % W;
    const y = (i - x) / W;
    let drop = Infinity;
    for (const n of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1])
      if (n >= 0 && walk[n] === w && heights[i] + depth[i] >= heights[n] - PUMP_REACH && heights[i] + depth[i] <= heights[n] + 0.01) drop = Math.min(drop, heights[n] - (heights[i] + depth[i]));
    best = { walk: w, tile: i, depth: depth[i], deepest: deepest[b], drop, tiles: sizes[b] };
  }
  return best;
}

/** Springs to try by the place's start, best first: each the sources to add, [x, y, strength].
 *  `depth` is the place's settled water; `rule` the walk the start's water must lie within (20, Normal's), `tries` the places tried,
 *  `key` what the springs' shapes are seeded from (the place's id by default); `above`: only places above the start
 *  (`aboveStart`). */
export function placeSprings(p: PlaceData, heights: Uint8Array, depth: ArrayLike<number>, opts: { rule?: number; tries?: number; key?: string; above?: boolean } = {}): [number, number, number][][] {
  const { W, H } = p;
  const occupied = new Uint8Array(W * H);
  for (const [x, y] of p.sources) occupied[y * W + x] = 1;
  for (const gaps of [p.bushes, p.pines, p.birches, p.oaks, p.deadPines, p.deadBirches, p.deadOaks, p.ruins]) for (const i of decodeTiles(gaps)) occupied[i] = 1;
  const start = { x: p.start[0] + 1, y: p.start[1] + 1 };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupied[(start.y + dy) * W + start.x + dx] = 1;
  const walk = walkDistance(heights, W, H, null, [], start);
  const picks = springCandidates({ W, H, heights, water: depth, occupied, channel: new Uint8Array(W * H), start }, opts.rule ?? 20, opts.tries ?? FIX_TRIES, (i) => reachAt(walk, W, H, i), opts.above ? (i) => aboveStart(p, heights, i) : undefined);
  const out: [number, number, number][][] = [];
  const seed = hash32(opts.key ?? p.id, "place-spring");
  for (const i of picks)
    for (const strength of FIX_STRENGTH) {
      const x = i % W;
      const y = (i - x) / W;
      const g = placeSourceGroup({ kind: "water", x, y, strength, seed: hash32(seed, i) }, { W, H, heights, occupied, depth });
      if (g.refused || !g.sources.length) continue;
      out.push(g.sources.map((s) => [s.x, s.y, s.strength]));
    }
  return out;
}

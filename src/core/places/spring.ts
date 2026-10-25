// A spring by a real place's start (D245's water floor: "one natural spring stands where the land
// drains near the start, the smallest that works, in D314's grouped sources"). With the edges open
// (D151) the rivers run off the map instead of pooling behind the survey's sealed border, and a few
// starts lose the water they were put beside. Where no spot of the place's own land gives the start
// water (start.ts), a spring is offered where the colony walks to: the candidate rule the
// generator's spring by the start and the editor's water fix share (water/springSites.ts), as a
// group of sources by D314's rule (water/sourceGroups.ts), at the fix's strengths. Sources only,
// never land (D245). tools/real-places.ts builds each in turn and keeps the first the checks pass.
// Pure and deterministic.

import { walkDistance, reachAt } from "../analysis/walk";
import { FIX_STRENGTH, FIX_TRIES } from "../doc/waterFix";
import { hash32 } from "../math/hash";
import { placeSourceGroup } from "../water/sourceGroups";
import { springCandidates } from "../water/springSites";
import { decodeTiles, type PlaceData } from "./place";

/** Springs to try by the place's start, best first: each the sources to add, [x, y, strength].
 *  `depth` is the place's settled water; `rule` the walk the start's water must lie within (20, Normal's), `tries` the places tried. */
export function placeSprings(p: PlaceData, heights: Uint8Array, depth: ArrayLike<number>, opts: { rule?: number; tries?: number } = {}): [number, number, number][][] {
  const { W, H } = p;
  const occupied = new Uint8Array(W * H);
  for (const [x, y] of p.sources) occupied[y * W + x] = 1;
  for (const gaps of [p.bushes, p.pines, p.birches, p.oaks, p.deadPines, p.ruins]) for (const i of decodeTiles(gaps)) occupied[i] = 1;
  const start = { x: p.start[0] + 1, y: p.start[1] + 1 };
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occupied[(start.y + dy) * W + start.x + dx] = 1;
  const walk = walkDistance(heights, W, H, null, [], start);
  const picks = springCandidates({ W, H, heights, water: depth, occupied, channel: new Uint8Array(W * H), start }, opts.rule ?? 20, opts.tries ?? FIX_TRIES, (i) => reachAt(walk, W, H, i));
  const out: [number, number, number][][] = [];
  const seed = hash32(p.id, "place-spring");
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

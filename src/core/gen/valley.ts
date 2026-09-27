// What remains of the valley planner that M9a replaced (the generator grows the field now,
// gen/generate.ts). Two things stay because others still use them:
// - `startWalkable`, the planner's count of dry land the colony walks to from the start, which
//   design version 2's prototypes (investigation/generative/proto and v2, their generate.ts) import;
// - `PlanConflict`, the error a planner threw when it could not keep its layout off the player's
//   features; branches written against the old planners import it (feature/live-editing's
//   session.ts, through gen/riverValley.ts). Nothing on dev throws it: the generator reports that
//   case as a refusal ("no layout fits").

import { walkRegions } from "../analysis/regions";
import type { BuildResult } from "../features/build";
import { entityTiles } from "../features/edits";
import { slopeHighSide } from "../format/footprints";
import { WALK_BLOCKERS } from "../validate/playability";

/** A planner could not keep its layout off the player's features, locks and keep-out areas. */
export class PlanConflict extends Error {}

/** Dry tiles the colony walks on from the start: same level, the built slopes, round the objects
 *  that block walking (the `start.reach` rule of the playability checks). */
export function startWalkable(b: BuildResult): number {
  if (!b.start) return 0;
  const { W, H } = b;
  const N = W * H;
  const links: [number, number][] = [];
  const blocked = new Uint8Array(N);
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    const hx = e.x + dx;
    const hy = e.y + dy;
    if (e.x < 0 || e.y < 0 || e.x >= W || e.y >= H || hx < 0 || hy < 0 || hx >= W || hy >= H) continue;
    links.push([e.y * W + e.x, hy * W + hx]);
  }
  const labels = walkRegions(b.heights, W, H, blocked, links);
  const root = labels[b.start.y * W + b.start.x];
  let n = 0;
  for (let i = 0; i < N; i++) if (root >= 0 && labels[i] === root && !(b.water[i] > 0.05)) n++;
  return n;
}

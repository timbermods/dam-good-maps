// What remains of the valley planner that M9a replaced (the generator grows the field now,
// gen/generate.ts): `startWalkable`, the planner's count of dry land the colony walks to from the
// start. Only design version 2's prototypes import it (investigation/generative/proto and v2, their
// generate.ts), and the type-checked tools that run them (tools/carve-equiv.ts, tools/erupt-compare.ts,
// through investigation/carve/maps.ts and investigation/erupt/maps.ts) need it to compile.

import { walkRegions } from "../analysis/regions";
import { walkWorld } from "../analysis/walk";
import type { BuildResult } from "../features/build";

/** Dry tiles the colony walks on from the start: same level, the built slopes, round the objects
 *  that block walking (the `start.reach` rule of the playability checks). */
export function startWalkable(b: BuildResult): number {
  if (!b.start) return 0;
  const { W, H } = b;
  const N = W * H;
  const { blocked, links } = walkWorld(b.entities, W, H);
  const labels = walkRegions(b.heights, W, H, blocked, links);
  const root = labels[b.start.y * W + b.start.x];
  let n = 0;
  for (let i = 0; i < N; i++) if (root >= 0 && labels[i] === root && !(b.water[i] > 0.05)) n++;
  return n;
}

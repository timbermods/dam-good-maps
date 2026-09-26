// Landforms drawn in the editor before D182 become plain terrain (PLAN §20 D182: the brush kit is
// the editor's core, and hills and valleys come from the brushes). A project or an autosave that
// has them opens with its land exactly as it was: the drawn hills, plateaus, ridges, canyons,
// valleys and islands are taken out, and every tile they changed is set back to its level with a
// terrain edit, as one step of the history (so it undoes). The generator's own landforms stay:
// they are how it builds its terrain, and it recognises landforms by reading the ground.

import type { Feature } from "../features/schema";
import { tilesToRuns } from "../math/grid";
import type { EditOp } from "./ops";
import type { MapSession } from "./session";

/** The history's name for the step. */
export const BAKE_LABEL = "Turn the drawn landforms into terrain";

/** Bake the drawn landforms of the open map into terrain edits. Returns how many it baked (0: none,
 *  or the land would not have come out exactly the same, and the map is left as it was). */
export function bakeLandforms(s: MapSession): number {
  const drawn = s.features.filter((f) => f.kind === "landform" && f.origin !== "generated") as Feature[];
  if (!drawn.length) return 0;
  const { x: W } = s.size;
  const before = s.built.heights.slice();
  const ids = new Set(drawn.map((f) => f.id));
  const without = s.terrainWith(s.features.filter((f) => !ids.has(f.id)) as Feature[]).heights;
  // every tile they changed, back to its level, a level at a time
  const byLevel = new Map<number, number[]>();
  for (let i = 0; i < before.length; i++) {
    if (before[i] === without[i]) continue;
    const list = byLevel.get(before[i]) ?? [];
    list.push(i);
    byLevel.set(before[i], list);
  }
  const ops: EditOp[] = drawn.map((f) => ({ op: "deleteFeature", params: { id: f.id } }) as EditOp);
  for (const [level, tiles] of [...byLevel].sort((a, b) => a[0] - b[0])) ops.push({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles, W), level } } as EditOp);
  const r = s.applyAll(ops, "user", BAKE_LABEL);
  if (!r.ok) return 0;
  // the land must be exactly as it was; else the landforms stay as they were
  let same = s.built.heights.length === before.length;
  for (let i = 0; same && i < before.length; i++) if (s.built.heights[i] !== before[i]) same = false;
  if (!same) {
    s.undo();
    s.forgetRedo();
    return 0;
  }
  return drawn.length;
}

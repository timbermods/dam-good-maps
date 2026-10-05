// A brush stroke as the editor applies it (EDITOR_PLAN §4): a new ramped Flatten refused (D270, D322),
// and a stroke with Clear sources on taking the sources it pressed (D249). Plain questions on the
// session's map; the worker applies what they return.

import { entityTiles } from "../features/edits";
import { placementOf } from "../format/entities";
import type { EditOp } from "./ops";
import type { MapSession } from "./session";

/** A new ramped Flatten would lay Slope objects along its rim (D270). The editor has no such stroke
 *  (D322), and no brush places an object (D368 (10): only the player places objects): it is refused,
 *  with the way to a walkable edge. A stroke saved earlier, with its slopes recorded, replays as it
 *  always did, through the project and the history, never through here. */
export function newRampedStroke(op: EditOp): string | null {
  if (op.op !== "brush" || op.params.tool !== "flatten" || op.params.edges !== "ramped" || op.params.slopes !== undefined) return null;
  return "Flatten has no ramped edges: place a Slope from the shelf where you want a way up";
}

/** A brush stroke with **Clear sources** on (D249): the stroke and the removal of every water or
 *  badwater source standing on `tiles` (the tiles it pressed), one step. `cleared` counts the sources;
 *  with none it is the stroke alone, under its own label. Refused as `newRampedStroke` refuses. */
export function planStrokeClearing(s: MapSession, op: EditOp, label: string, tiles: readonly number[]): { ok: true; ops: EditOp[]; label: string; cleared: number } | { ok: false; errors: string[] } {
  const { x: W, y: H } = s.size;
  const want = new Set(tiles);
  const ids: string[] = [];
  for (const e of s.built.entities) {
    if (e.template !== "WaterSource" && e.template !== "BadwaterSource") continue;
    if (e.raw && !placementOf(e.raw)) continue;
    if (entityTiles(e).some(([tx, ty]) => tx >= 0 && ty >= 0 && tx < W && ty < H && want.has(ty * W + tx))) ids.push(e.id);
  }
  const refused = newRampedStroke(op);
  if (refused) return { ok: false, errors: [refused] };
  const ops: EditOp[] = [op];
  if (ids.length) ops.push({ op: "deleteEntities", params: { entities: ids } });
  return { ok: true, ops, label: ids.length ? `${label}, ${ids.length === 1 ? "a source" : `${ids.length} sources`} cleared` : label, cleared: ids.length };
}

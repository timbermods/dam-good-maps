// What the forces do to objects (PLAN §20 D202, D203, D206; from investigation/forces-core
// `core/objects.ts`): the shared part. Each force keeps its own physical policy (Carve takes what lost
// its ground, an impact or a vent erases or knocks down, uplift and a slide carry the survivors); the
// core owns the footprints, the knocked-down pose and the ride of a rigid object on its new ground.
// The start is not a force's concern (D257): the editor carries it to level ground.

import type { EntitySpec } from "../format/entities";
import { FOOTPRINTS } from "../format/footprints";
import { objectTile } from "../sim/model";

/** A tree a force knocked down: dead, and lying from (x, y) along (dx, dy). Its pose is the
 *  editor's view of it (project data, never the game's: a .timber map keeps it a dead tree). */
export interface Fallen {
  id: string;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  length: number;
}

export const isPlant = (e: EntitySpec) => /^(Pine|Birch|Oak|Succulent|BlueberryBush)$/.test(e.template);

/** The tiles an object stands on, and `margin` tiles round them. */
export function footprint(m: { W: number; H: number }, e: Pick<EntitySpec, "template" | "x" | "y" | "orientation" | "flipped">, margin = 0): number[] {
  const fp = FOOTPRINTS[e.template]?.size ?? [1, 1, 1];
  const out: number[] = [];
  for (let y = -margin; y < fp[1] + margin; y++)
    for (let x = -margin; x < fp[0] + margin; x++) {
      const [xx, yy] = objectTile(e as Parameters<typeof objectTile>[0], x, y);
      if (xx >= 0 && yy >= 0 && xx < m.W && yy < m.H) out.push(yy * m.W + xx);
    }
  return out;
}

/** Why the start can't stay where a force left it (null: it can): its ground must be flat under it,
 *  and dry. */
export function startProblem(m: { W: number; H: number; heights: Uint8Array; entities: readonly EntitySpec[]; water: { depth: ArrayLike<number> } }): string | null {
  for (const e of m.entities)
    if (e.template === "StartingLocation") {
      const tiles = footprint(m, e);
      const fp = FOOTPRINTS[e.template]?.size ?? [3, 3, 1];
      if (tiles.length !== fp[0] * fp[1] || tiles.some((i) => m.heights[i] !== e.z)) return "Start needs flat ground";
      if (tiles.some((i) => m.water.depth[i] > 0.05)) return "Water would cover the start";
    }
  return null;
}

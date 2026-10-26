// A brush stroke's plan (`gen/paint.ts`) as the operations of one undo step: a `placeEntity` for each
// object, with the components the game's editor would give it (PLAN §20 D235, D338).

import type { PlannedObject, PaintKind } from "../gen/paint";
import type { EditOp } from "./ops";
import { plantLabel } from "./labels";

/** The operations that place a plan. `newId` gives each object its Id (a random GUID, stored so replays give
 *  the same ones). `levels`: the level a tile's object stands on under a roof (D491), its `z`. */
export function paintOps(plan: readonly PlannedObject[], W: number, newId: () => string, levels: ReadonlyMap<number, number> = new Map()): EditOp[] {
  return plan.map((p): EditOp => ({
    op: "placeEntity",
    params: {
      id: newId(),
      template: p.template,
      x: p.tile % W,
      y: Math.floor(p.tile / W),
      ...(levels.has(p.tile) ? { z: levels.get(p.tile)! } : {}),
      orientation: p.orientation,
      ...(p.flipped ? { flipped: true } : {}),
      ...(p.components ? { components: p.components } : {}),
    },
  }));
}

const NAMES: Record<"ruins" | "thorns", [string, string]> = {
  ruins: ["a ruin", "ruins"],
  thorns: ["a thorn", "thorns"],
};

/** The history's words for a stroke: "Plant 18 pines", "Plant a berry bush", "Paint 31 ruins". */
export function paintLabel(kind: PaintKind, template: string, n: number): string {
  if (kind === "trees" || kind === "bushes" || kind === "succulents") return plantLabel(kind === "bushes" ? "BlueberryBush" : template, n);
  if (kind === "woods") return n === 1 ? "Plant a tree" : `Plant ${n} trees of mixed woods`;
  const [one, many] = NAMES[kind];
  return n === 1 ? `Place ${one}` : `Paint ${n} ${many}`;
}

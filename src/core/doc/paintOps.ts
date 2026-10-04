// A brush stroke's plan (`gen/paint.ts`) as the operations of one undo step: a `placeEntity` for each
// object, with the components the game's editor would give it (PLAN §20 D235, D338).

import type { PlannedObject, PaintKind } from "../gen/paint";
import type { EditOp } from "./ops";

/** The operations that place a plan. `newId` gives each object its Id (a random GUID, stored so replays give
 *  the same ones). */
export function paintOps(plan: readonly PlannedObject[], W: number, newId: () => string): EditOp[] {
  return plan.map((p): EditOp => ({
    op: "placeEntity",
    params: {
      id: newId(),
      template: p.template,
      x: p.tile % W,
      y: Math.floor(p.tile / W),
      orientation: p.orientation,
      ...(p.flipped ? { flipped: true } : {}),
      ...(p.components ? { components: p.components } : {}),
    },
  }));
}

const NAMES: Record<PaintKind, [string, string]> = {
  trees: ["a tree", "trees"],
  bushes: ["a blueberry bush", "blueberry bushes"],
  succulents: ["a succulent", "succulents"],
  woods: ["a tree", "trees"],
  ruins: ["a ruin column", "ruin columns"],
  thorns: ["a thorn", "thorns"],
};

/** The history's words for a stroke: "Plant 18 pines", "Paint 31 ruin columns". */
export function paintLabel(kind: PaintKind, template: string, n: number): string {
  if (kind === "trees" || kind === "bushes" || kind === "succulents") {
    const one = kind === "bushes" ? "blueberry bush" : template.toLowerCase();
    const many = kind === "bushes" ? "blueberry bushes" : `${one}s`;
    return n === 1 ? `Plant a ${one}` : `Plant ${n} ${many}`;
  }
  if (kind === "woods") return n === 1 ? "Plant a tree" : `Plant ${n} trees of mixed woods`;
  const [one, many] = NAMES[kind];
  return n === 1 ? `Place ${one}` : `Paint ${n} ${many}`;
}

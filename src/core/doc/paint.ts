// Painting objects on the map (PLAN §20 D235, D338, D342): the `paintObjects` operation. The plan is made on the
// map as it stands (its water, its objects, its caves), by `gen/paint.ts`; the objects go in as `placeEntity`
// operations, one undo step, one rebuild (`MapSession.applyBatch`). Plain in, plain out: it runs headless.

import { entityTiles } from "../features/edits";
import { guidFrom } from "../math/hash";
import { runsToTiles } from "../math/grid";
import { planPaint, type PaintGround, type PlannedObject } from "../gen/paint";
import type { ApplyResult, MapSession } from "./session";
import type { EditOp, OpOrigin } from "./ops";
import { paintLabel, paintOps } from "./paintOps";
import type { PaintParams } from "./paintParams";
import { waterDepth } from "./placing";

/** The templates a plant kind counts as already there: painting over them fills the gaps up to the density. */
const SAME: Record<string, readonly string[]> = { trees: [], bushes: ["BlueberryBush"], succulents: ["Succulent"], woods: ["Pine", "Birch", "Oak"] };

/** Where an object may stand on the map as it is: on the map, dry, no cave, nothing there. */
export function paintGround(s: MapSession): PaintGround {
  const { x: W, y: H } = s.size;
  const b = s.built;
  const free = new Uint8Array(W * H).fill(1);
  const depth = waterDepth(s);
  for (let i = 0; i < W * H; i++) if (depth[i] > 0.05) free[i] = 0;
  for (let i = 0; i < W * H; i++) if (!s.plainAt(i)) free[i] = 0;
  for (const e of b.entities) for (const [x, y] of entityTiles(e)) if (x >= 0 && y >= 0 && x < W && y < H) free[y * W + x] = 0;
  return { W, H, heights: b.heights, free };
}

export type PaintPlan = { ok: true; plan: PlannedObject[]; ops: EditOp[]; label: string } | { ok: false; errors: string[] };

/** What a stroke would place on this map: the objects, the operations and the history's words, or the plain
 *  reason nothing can be placed. (A question the page asks for its ghost; `applyPaintObjects` answers it and
 *  places the objects.) */
export function planPaintObjects(s: MapSession, p: PaintParams, nextSeq: number = s.nextSeq): PaintPlan {
  const errors = s.check({ op: "paintObjects", params: p });
  if (errors.length) return { ok: false, errors };
  const { x: W, y: H } = s.size;
  const region = runsToTiles(p.area, W).filter((i) => i >= 0 && i < W * H);
  const g = paintGround(s);
  let existing = 0;
  const same = p.kind === "trees" ? [p.template ?? ""] : (SAME[p.kind] ?? []);
  if (same.length) {
    const inRegion = new Set(region);
    for (const e of s.built.entities) if (same.includes(e.template) && inRegion.has(e.y * W + e.x)) existing++;
  }
  const plan = planPaint(g, { kind: p.kind, template: p.template ?? "", region, density: p.density, age: p.age ?? "grown", seed: p.seed, existing });
  if (!plan.length) return { ok: false, errors: [nothingReason(p, region, g, existing)] };
  let k = 0;
  const ops = paintOps(plan, W, () => guidFrom("paint", p.seed, nextSeq, k++));
  return { ok: true, plan, ops, label: paintLabel(p.kind, p.template ?? "", plan.length) };
}

function nothingReason(p: PaintParams, region: number[], g: PaintGround, existing: number): string {
  let free = 0;
  for (const i of region) if (g.free[i]) free++;
  if (!free) return "there is no free ground under the stroke: it is water, a cave or other objects";
  if (p.kind === "ruins") return "the ground under the stroke is too small or broken for a ruin field: a field stands on one level";
  if (p.kind === "thorns") return "the stroke is too small for a thorn patch";
  if (existing) return "the stroke already holds as many as its density asks for";
  return "the density asks for none on so little ground: raise it or paint more";
}

/** Apply a `paintObjects` operation: plan it on the map as it stands and place the objects as one step. */
export function applyPaintObjects(s: MapSession, p: PaintParams, origin: OpOrigin, label?: string): ApplyResult {
  const r = planPaintObjects(s, p);
  if (!r.ok) return { ok: false, errors: r.errors, applied: [], dirty: null };
  return s.applyBatch(r.ops, origin, label ?? r.label);
}

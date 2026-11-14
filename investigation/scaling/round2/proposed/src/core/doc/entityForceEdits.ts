import type {ForceOp,EntityOp} from "./ops";
import type {EntityEdit} from "../features/edits";
export function forceEntityEdits(op: ForceOp): EntityOp[] {
  const { seq, origin } = op;
  const out: EntityOp[] = [];
  const p = op.params;
  if (p.removed.length) out.push({ op: "deleteEntities", params: { entities: p.removed, quiet: true }, seq, origin });
  if (op.op === "forceResult") {
    for (const m of op.params.moved ?? []) out.push({ op: "moveEntity", params: { id: m.id, x: m.x, y: m.y, quiet: true }, seq, origin });
    for (const f of op.params.felled ?? []) out.push({ op: "setEntityProps", params: { id: f.id, components: { LivingNaturalResource: { IsDead: true } }, quiet: true }, seq, origin });
  }
  // a carve's source, and since D314 the rest of its row; Glaciate's springs (D246)
  for (const s of [...(p.source ? [p.source] : []), ...(("sources" in p ? p.sources : undefined) ?? [])])
    out.push({ op: "placeEntity", params: { id: s.id, template: "WaterSource", x: s.x, y: s.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: s.strength, CurrentStrength: s.strength } } }, seq, origin });
  return out;
}
export function* expandedEntityEdits(edits: readonly (EntityEdit | ForceOp)[]): Generator<EntityEdit> {
 for(const e of edits) {if(e.op==="forceResult"||e.op==="carve")yield* forceEntityEdits(e);else yield e;}
}

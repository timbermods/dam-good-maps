// A natural narrows on a river, as an edit (#63: no Dam site tool in the editor; the builder stays an
// internal operation for M12's Claude, ROADMAP M9a "Keep M12 ready"): the naturalNarrows set piece
// (features/setpieces/naturalNarrows.ts) planned on the map as it stands, with the settled water
// kept out of its spurs. The channel keeps its gap: a dam across it is the player's to build.

import type { SetPieceFeature } from "../features/schema";
import { planSetPiece } from "../features/setpieces";
import type { EditOp } from "./ops";
import type { MapSession } from "./session";
import { planContextOf } from "./tools";

export interface NarrowsEditRequest {
  /** The river's feature id. */
  river: string;
  /** Where along it, 0–1 of its length from its head (default 0.5). */
  at?: number;
  /** How far each spur reaches toward the river, 0.5–1 (default 0.8). */
  reach?: number;
  /** Levels the spurs stand above the channel's banks at their roots, 1–4 (default 2). */
  rise?: number;
}

export type NarrowsEdit = { ok: true; ops: EditOp[]; feature: SetPieceFeature; report: string[]; label: string; tiles: number[]; gap: number } | { ok: false; errors: string[] };

export function planNarrowsEdit(s: MapSession, req: NarrowsEditRequest, id: string, origin: SetPieceFeature["origin"] = "claude"): NarrowsEdit {
  const ctx = { ...planContextOf(s), water: s.built.water };
  const request: Record<string, number | string> = { river: req.river, at: req.at ?? 0.5 };
  if (req.reach !== undefined) request.reach = req.reach;
  if (req.rise !== undefined) request.rise = req.rise;
  const r = planSetPiece("naturalNarrows", request, ctx, { id, origin });
  if (!r.ok) return { ok: false, errors: r.errors.map((e) => e.replace(/^naturalNarrows\/(\w+): /, "$1 ")) };
  const plan = r.feature.params.plan as unknown as { tiles: number[]; gap: number };
  return { ok: true, ops: [{ op: "addFeature", params: { feature: r.feature } }], feature: r.feature as SetPieceFeature, report: r.feature.params.report, label: "Add a natural narrows", tiles: plan.tiles.slice(), gap: plan.gap };
}

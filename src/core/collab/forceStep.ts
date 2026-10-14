// A force as every peer keeps it: the same steps the editor's worker takes (worker/session.ts
// `startForce`, `forceStop`, `carryStart`), run headless from the gesture on the agreed map, to the
// operation the document keeps and the start carry in the same step. Nothing here reads a clock, a
// frame or a random number: the same map and gesture give the same operation on every peer, and no
// heights cross the wire.
//
// The map a force plans on has its water settled first (a barrier; the live animation is local
// presentation): hydrology, Auto geology and nearest-safe-start read it, and the host and a peer
// restored from a snapshot must read the same.

import type { ApplyResult, MapSession } from "../doc/session";
import { startCarry } from "../doc/start";
import { areaDepth } from "../features/raster/brush";
import { CarvePlay } from "../forces/carve/play";
import { keptForceParams } from "../forces/keep";
import { geology } from "../forces/random";
import { QuakeRun } from "../forces/runs";
import { fullForceMapOf, lavaOf, planForce, type ForceRequest } from "../forces/start";
import type { FullForceMap } from "../forces/force";
import { fallenPoses } from "./mapState";
import type { ForceGesture } from "./types";

/** The open map as a force starts from it (the worker's `sessionForceMap`, from the settled water). */
export function forceMapOfSession(s: MapSession): FullForceMap {
  if (s.waterPending) s.settleCanonical();
  const b = s.built;
  return fullForceMapOf(b, { rockLayers: geology(s.openedHeights), lava: lavaOf(s.state.sculpts, b.heights, b.W, b.H), down: fallenPoses(s), usedIds: s.usedEntityIds() });
}

export type ForceOutcome = { ok: true; applied: ApplyResult } | { ok: false; reason: string };

/** Plan, run and keep a force on the session: one history step (the force and the start's carry). */
export function applyForce(s: MapSession, g: ForceGesture): ForceOutcome {
  const base = forceMapOfSession(s);
  const request = { ...g.request, settings: { ...g.request.settings, seed: g.request.settings.seed ?? 0 } } as ForceRequest;
  const plan = planForce({
    base,
    request,
    caves: s.columns.keys(),
    state: s.terrainState(),
    newId: () => {
      if (!g.sourceId) throw new Error("A carve needs the id of its river source in the gesture");
      return g.sourceId;
    },
  });
  if (!plan.ok) return { ok: false, reason: plan.error };
  const req = plan.request;
  let play: CarvePlay | null = null;
  try {
    if (plan.carve) {
      play = new CarvePlay(plan.carve, req.verb === "carve" && req.shownFrom === "end");
      play.plan();
    } else if (!plan.staged!.done && !(plan.staged instanceof QuakeRun && plan.staged.painting)) plan.staged!.finishAll();
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  const kept = keptForceParams({ before: plan.before, request: req, carve: plan.carve, staged: plan.staged, standing: new Set(s.built.entities.map((e) => e.id)), ...(play ? { shownCleared: play.cleared } : {}) });
  if (!kept.ok) return { ok: false, reason: kept.error };
  const params = kept.params;
  const applied = s.applyAll([{ op: "forceResult", params }], "user");
  if (!applied.ok) return { ok: false, reason: applied.errors[0] ?? "The force could not be kept" };
  // a force that broke the start's own ground carries the start in the same step (D257)
  const carry = startCarry(s, params, { inside: req.area ? areaDepth(req.area, plan.before.W, plan.before.H) : null, cut: req.cut });
  if (carry) {
    const label = s.history().filter((h) => h.applied).at(-1)?.label;
    s.undo();
    const again = s.applyAll([{ op: "forceResult", params: carry.params }, ...carry.ops], "user", label);
    if (!again.ok) s.applyAll([{ op: "forceResult", params }], "user", label);
  }
  return { ok: true, applied };
}

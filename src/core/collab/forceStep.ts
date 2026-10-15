// A force as every peer keeps it: the same steps the editor's worker takes (worker/session.ts
// `startForce`, `forceStop`, `carryStart`), run headless from the gesture on the agreed map, to the
// operation the document keeps and the start carry in the same step. Nothing here reads a clock, a
// frame or a random number: the same map and gesture give the same operation on every peer, and no
// heights cross the wire.
//
// The basis is the CANONICAL water of the entry before the force (hydrology, Auto geology and
// nearest-safe-start read it). That is also what the author's preview must plan on: `forceBasis` says
// whether a session shows it yet, and `previewForce` plans without changing the map. The worker's
// preview plans on the live water today (worker/session.ts `sessionForceMap`), so it can differ from what
// is committed; moving it onto this basis is the page piece's change.

import type { ApplyResult, MapSession } from "../doc/session";
import { startCarry } from "../doc/start";
import { areaDepth } from "../features/raster/brush";
import { CarvePlay } from "../forces/carve/play";
import { keptForceParams } from "../forces/keep";
import type { ForceResultParams } from "../forces/op";
import { geology } from "../forces/random";
import { QuakeRun } from "../forces/runs";
import { fallsBeforePlay, fullForceMapOf, lavaOf, planForce, type ForceRequest } from "../forces/start";
import type { FullForceMap } from "../forces/force";
import { murmur3 } from "../math/hash";
import { fallenPoses, stable } from "./mapState";
import type { ForceGesture } from "./types";

/** Whether the session's water is the canonical settle of its ground: a force plans on it only then. */
export function forceBasis(s: MapSession): { ready: boolean } {
  return { ready: !s.waterPending };
}

/** The open map as a force starts from it (the worker's `sessionForceMap`), on its settled water. The water must have settled. */
export function forceMapOfSession(s: MapSession): FullForceMap {
  if (s.waterPending) throw new Error("The water has not settled: a force plans on the settled water");
  const b = s.built;
  const m = fullForceMapOf(b, { rockLayers: geology(s.openedHeights), lava: lavaOf(s.state.sculpts, b.heights, b.W, b.H), down: fallenPoses(s), usedIds: s.usedEntityIds() });
  // (a map with caves or overhangs: its voxels, which Erode reads and wears, D281)
  if (!s.columns.size) return m;
  const wet = s.caveWater();
  return { ...m, masks: s.terrain.mask, ...(wet ? { wet } : {}) };
}

/** What a force would keep: its operation, and a short hash of it (what the author's preview shows). */
export interface PlannedForce {
  params: ForceResultParams;
  request: ForceRequest;
  area: Uint8Array | null;
  /** The hash of the operation: equal on every peer that plans the gesture on the same map. */
  hash: string;
}

export type Planned = { ok: true; plan: PlannedForce } | { ok: false; reason: string };

/** The hash of a force's operation (the author's preview sends it with the gesture; the host compares it with the one it plans). */
export const forceHash = (p: ForceResultParams): string => murmur3(new TextEncoder().encode(stable(p)), 0x364).toString(16).padStart(8, "0");

/** Plan and run a force on the session's settled map and say what it would keep, changing nothing. */
export function planKeptForce(s: MapSession, g: ForceGesture): Planned {
  if (typeof g.request.settings.seed !== "number") return { ok: false, reason: "A force needs its seed in the gesture" };
  const base = forceMapOfSession(s);
  const plan = planForce({
    base,
    request: g.request,
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
    // (ground it would still leave falling: refused naming the place, as the author's preview is, D487)
    if (s.columns.size) {
      const why = fallsBeforePlay(plan, play, base.W, base.H, (h, m, e) => s.forceFalls(h, m, e));
      if (why) return { ok: false, reason: why };
    }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
  const kept = keptForceParams({ before: plan.before, request: req, carve: plan.carve, staged: plan.staged, standing: new Set(s.built.entities.map((e) => e.id)), ...(play ? { shownCleared: play.cleared } : {}) });
  if (!kept.ok) return { ok: false, reason: kept.error };
  return { ok: true, plan: { params: kept.params, request: req, area: req.area ? areaDepth(req.area, plan.before.W, plan.before.H) : null, hash: forceHash(kept.params) } };
}

export type ForceOutcome = { ok: true; applied: ApplyResult } | { ok: false; reason: string; stale?: boolean };

/** Keep a planned force: one history step (the force and the start's carry). */
export function keepForce(s: MapSession, plan: PlannedForce): ForceOutcome {
  const { params } = plan;
  const applied = s.applyAll([{ op: "forceResult", params }], "user");
  if (!applied.ok) return { ok: false, reason: applied.errors[0] ?? "The force could not be kept" };
  // a force that broke the start's own ground carries the start in the same step (D257)
  const carry = startCarry(s, params, { inside: plan.area, cut: plan.request.cut });
  if (carry) {
    const label = s.history().filter((h) => h.applied).at(-1)?.label;
    s.undo();
    const again = s.applyAll([{ op: "forceResult", params: carry.params }, ...carry.ops], "user", label);
    if (!again.ok) s.applyAll([{ op: "forceResult", params }], "user", label);
  }
  return { ok: true, applied };
}

/** Plan and keep a gesture. `expect`: the hash of the operation the author's preview showed; when the
 *  operation planned here differs the force is refused (the map changed under it) and nothing changes. */
export function applyForce(s: MapSession, g: ForceGesture, expect?: string): ForceOutcome {
  const planned = planKeptForce(s, g);
  if (!planned.ok) return { ok: false, reason: planned.reason };
  if (expect !== undefined && planned.plan.hash !== expect) return { ok: false, reason: STALE, stale: true };
  return keepForce(s, planned.plan);
}

export const STALE = "The map changed under the force: draw it again on the map as it is now";

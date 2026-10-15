// The editor's edits while a shared session is on (docs/COLLAB-BRIEF.md, D486): every one is ordered through the session instead of
// applied to the map here. The page calls the same functions as ever (`apply`, `applyAll`, `applyTool`, `undo`, the forces ...); the
// worker's API (generator.worker.ts) hands them to this module whenever a session exists (`collabActive`). Each plans its operations
// with the planner the direct edit uses (session.ts `planned`), orders them (`submit`, a command of the session) and answers with the
// session's verdict: ordered, or one plain line. The map's own news is the session's `update` event, never in the answer.
//
// A force is ordered as a gesture at the moment it is kept (the request with its seed), so there is no play-out on this side yet
// (the force playing out for both players comes with the claims and presence work, part 6b): the frames the page asks for are
// one finished one, and keeping it orders the gesture. Try another is not available in a session (a force that replaces another is
// not an entry kind, core/collab README).

import type { Command, ForceGesture, SubmitResult } from "../core/collab";
import type { EditOp, OpOrigin } from "../core/doc/ops";
import type { ForceCue } from "../core/forces/runs";
import type { Verb } from "../core/forces/op";
import { EVERY_KIND } from "../core/doc/remove";
import { collabApi } from "./collab";
import * as ed from "./session";

type Answer = ed.SessionUpdate;

const verdict = (r: SubmitResult): Answer => ed.collabAnswer(r.ok, r.ok ? [] : [r.reason]);

async function order(command: Command): Promise<Answer> {
  return verdict(await collabApi.submit(command));
}

/** An edit's operations ordered as one step, or the planner's refusal. */
async function edit(plan: { ok: true; ops: EditOp[]; label: string } | { ok: false; errors: string[] }): Promise<Answer> {
  if (!plan.ok) return ed.collabAnswer(false, plan.errors);
  return order({ kind: "edit", ops: plan.ops, label: plan.label });
}

const HISTORY = "The history can't be stepped through in a shared session. Undo takes back your own last action.";

export const collabEditApi = {
  apply(op: EditOp, _origin?: OpOrigin, label?: string): Promise<Answer> {
    const refused = ed.planned.stroke(op);
    if (refused) return Promise.resolve(ed.collabAnswer(false, [refused]));
    return order({ kind: "edit", ops: [op], label: label ?? op.op });
  },

  /** A slider's step: each step is its own action here (the steps cannot be joined into one undo step across two players). */
  applyStep(op: EditOp, label: string, _key: string): Promise<Answer> {
    return order({ kind: "edit", ops: [op], label });
  },

  applyAll(ops: EditOp[], label: string, _origin?: OpOrigin): Promise<Answer> {
    return order({ kind: "edit", ops: ed.planned.all(ops), label });
  },

  async applyTool(req: ed.ToolRequest, id: string): Promise<Answer & { plan: ed.ToolPlan }> {
    const plan = ed.planned.tool(req, id);
    return { ...(await edit(plan)), plan };
  },

  async plantAt(template: string, tiles: number[]): Promise<Answer & { planted: number[] }> {
    const p = ed.planned.plant(template, tiles);
    const a = await edit(p);
    return { ...a, planted: a.ok && p.ok ? p.planted : [] };
  },

  async removeAt(tiles: readonly number[], kinds: readonly ed.RemoveKind[], label?: string): Promise<Answer & { removed: number[] }> {
    const p = ed.planned.remove(tiles, kinds, label);
    const a = await edit(p);
    return { ...a, removed: a.ok && p.ok ? p.removed : [] };
  },

  clearEverything(): Promise<Answer & { removed: number[] }> {
    return collabEditApi.removeAt(ed.planned.everything(), EVERY_KIND, "Clear everything");
  },

  async moveObjectBy(id: string, dx: number, dy: number): Promise<Answer> {
    return edit(ed.planned.move(id, dx, dy));
  },

  async moveStartTo(x: number, y: number, orientation?: Parameters<typeof ed.planned.start>[2]): Promise<Answer> {
    return edit(ed.planned.start(x, y, orientation));
  },

  /** A Select action: one step, the start carried if its ground broke (the host works out the tiles it changed). */
  applySelection(ops: EditOp[], label: string, _tiles: number[]): Promise<Answer> {
    return order({ kind: "select", ops, label });
  },

  async strokeClearing(op: EditOp, label: string, tiles: number[]): Promise<Answer> {
    const refused = ed.planned.stroke(op);
    if (refused) return ed.collabAnswer(false, [refused]);
    const p = ed.planned.strokeClearing(op, label, tiles);
    if (!p.ok) return ed.collabAnswer(false, p.errors);
    return order({ kind: "edit", ops: p.cleared ? p.ops : [op], label: p.cleared ? p.label : label });
  },

  /** Undo takes back this player's own last action that nothing is built on; a blocked one is refused with what is in the way. */
  async undo(): Promise<Answer> {
    return verdict(await collabApi.undo());
  },
  async redo(): Promise<Answer> {
    return verdict(await collabApi.redo());
  },
  jump(_index: number): Answer {
    return ed.collabAnswer(false, [HISTORY]);
  },

  // ---- the forces: ordered as a gesture when they are kept

  forceShows(_water: unknown): void {},

  forceStart(req: ed.ForceRequest): ed.ForceStarted {
    const seeded = { ...req, settings: { ...req.settings, seed: req.settings.seed ?? 0 } } as ed.ForceRequest;
    routedForce = { gesture: req.gesture ?? ++gestureNames, request: seeded };
    return { ok: true, errors: [], frame: finishedFrame(seeded), settings: seeded.settings, verb: seeded.verb, gesture: routedForce.gesture };
  },

  forceAgain(_pins?: Record<string, unknown>, _gesture?: number): ed.ForceStarted {
    return { ok: false, errors: ["Try another isn't available in a shared session yet"], frame: null, settings: null };
  },

  forceAdvance(_steps: number): ed.ForceFrame | null {
    return routedForce ? finishedFrame(routedForce.request) : null;
  },

  /** A painted Lift: the fault as it is painted now (kept as it is when the pointer lets go). */
  forcePaint(path: ed.ForcePoint[], side: 1 | -1, power?: number): ed.ForceFrame | null {
    const f = routedForce;
    if (!f || f.request.verb !== "quake") return null;
    f.request = { ...f.request, path, side, ...(power !== undefined ? { settings: { ...f.request.settings, power } } : {}) } as ed.ForceRequest;
    return finishedFrame(f.request);
  },

  async forceStop(gesture?: number): Promise<Answer & { kept: boolean }> {
    const f = routedForce;
    if (!f || (gesture !== undefined && f.gesture !== gesture)) return { ...ed.collabAnswer(false, ["There is no force at work"]), kept: false };
    routedForce = null;
    const { gesture: _name, ...request } = f.request;
    const g: ForceGesture = {
      id: crypto.randomUUID(),
      // (a Lift is kept as the fault stands when the pointer lets go)
      request: (request.verb === "quake" ? { ...request, painting: false } : request) as ForceGesture["request"],
      ...(request.verb === "carve" ? { sourceId: crypto.randomUUID() } : {}),
    };
    const a = await order({ kind: "force", gesture: g });
    return { ...a, kept: a.ok };
  },

  /** Esc for a force not yet kept: it goes. One already ordered is undone like any action (Ctrl+Z). */
  forceCancel(gesture?: number): ed.ForceTakenBack {
    const f = routedForce;
    if (f && (gesture === undefined || f.gesture === gesture)) {
      routedForce = null;
      return { taken: "work" };
    }
    return { taken: null };
  },
};

/** The force the page is holding, until it is kept or dropped. */
let routedForce: { gesture: number; request: ed.ForceRequest } | null = null;
let gestureNames = 1_000_000;

/** The one frame a routed force shows: finished, with nothing to play (the result lands when the session orders it). */
function finishedFrame(req: ed.ForceRequest): ed.ForceFrame {
  const at = "origin" in req && req.origin ? req.origin : "path" in req && req.path?.[0] ? ([req.path[0].x, req.path[0].y] as [number, number]) : ([0, 0] as [number, number]);
  const cue: ForceCue = { verb: req.verb as Verb, phase: "done", progress: 1, x: at[0], y: at[1], z: 0, size: 1, power: (req.settings as { power?: number }).power ?? 50 };
  return {
    verb: req.verb as Verb,
    steps: 0,
    done: true,
    reason: "",
    planned: true,
    total: 0,
    shown: 0,
    head: { x: at[0], y: at[1], z: 0, dx: 1, dy: 0, width: 1, event: "surge", cut: 0 },
    trail: [],
    cue,
  };
}

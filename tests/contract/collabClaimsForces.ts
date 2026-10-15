// Shared by collabClaims.test.ts and collabClaims.heavy.test.ts: the forces run in the editor's worker the
// page's way, each one's completed plan as the operations it became, held against what the host will record
// as written (#397's touchesOf, plus the generated trees it fells) and against the cautious band.

import { expect } from "vitest";
import { footprintOf, forceBand, trialWrites, type TileMask } from "../../src/core/collab/footprint";
import type { Mask } from "../../src/core/collab/mask";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import * as ed from "../../src/worker/session";

export const open = (): MapSession => MapSession.open(decodeProject(ed.project().bytes));

/** The operations a force became (the force and, when it carried the start, the carry), run to its end in
 *  the worker; null when the force found nothing to do. */
export function planOf(req: ed.ForceRequest): EditOp[] | null {
  const n0 = decodeProject(ed.project().bytes).edits.length;
  if (ed.forceStart(req).errors.length) return null;
  for (let k = 0; k < 800 && !ed.forceAdvance(8)!.done; k++);
  if (ed.forceStop().errors.length) return null;
  return decodeProject(ed.project().bytes).edits.slice(n0).map((e) => ({ op: e.op, params: e.params }) as EditOp);
}

export const outsideOf = (a: Mask | TileMask, b: Mask | TileMask): number => {
  const N = "N" in a ? a.N : a.bits.length;
  let n = 0;
  for (let i = 0; i < N; i++) if (a.has(i) && !b.has(i)) n++;
  return n;
};

/** Run `req`, take it back, and hold its plan against the map it landed on: what the host records as written
 *  is inside the plan's footprint and inside the gesture's band (from the operation's record and from the
 *  page's request). Returns the label if it ran, null if the force found nothing to do. */
export function holdForce(req: ed.ForceRequest): string | null {
  const mirror = open();
  const ops = planOf(req);
  if (!ops) return null;
  ed.undo();
  const force = ops.find((o) => o.op === "forceResult");
  if (!force || force.op !== "forceResult") return null;
  const label = `${req.verb} ${(req.settings as { mode?: string }).mode ?? ""} power ${(req.settings as { power: number }).power}`;
  const fp = footprintOf(ops, mirror);
  const band = forceBand({ verb: req.verb, settings: force.params.settings, where: force.params.where }, mirror);
  const trial = trialWrites(mirror, ops);
  expect(trial.ok, label).toBe(true);
  if (!trial.ok) return null;
  expect(trial.writes.size, label).toBeGreaterThan(0);
  expect(outsideOf(trial.writes, fp.tiles), `${label}: a tile the host records escapes the plan's footprint`).toBe(0);
  expect(outsideOf(trial.writes, band.tiles), `${label}: a tile the host records escapes the gesture's band`).toBe(0);
  expect(outsideOf(trial.writes, forceBand(req as never, mirror).tiles), `${label}: ... or the band from the request`).toBe(0);
  return label;
}

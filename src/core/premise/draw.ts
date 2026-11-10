// Drawing a premise's plan (docs/PREMISES.md §2.2, stage 0): named random streams and attempts. A plan is pure
// arithmetic, so a plan that fails a `plan` invariant is simply drawn again (`attempt + 1`); after `PLAN_TRIES` plans
// the spec goes to the themes' path (stage 8), so "No valid map" never shows (D471).

import { stream, type Rng } from "../math/rng";
import type { MapSpec } from "../spec/mapspec";
import type { Invariant, PremiseDef, PremisePlan, Stage, StageContext } from "./types";

/** Plans drawn for one spec before it goes to the themes' path (PREMISES §2.2, stage 8). */
export const PLAN_TRIES = 8;

/** The stream of one stage (`premise.plan`, `premise.relief`, `premise.life`, `premise.pieces`), so a change to one
 *  stage never reshuffles another (PREMISES §1.3). `parts` name a draw inside the stage. */
export function premiseStream(spec: MapSpec, stage: "premise.plan" | "premise.relief" | "premise.life" | "premise.pieces", attempt: number, ...parts: (string | number)[]): Rng {
  return stream(spec.seed, stage, spec.size.x, spec.size.y, attempt, ...parts);
}

export interface Failure {
  id: string;
  reason: string;
}

/** The invariants of one stage that fail on a context, each with its one-line reason. */
export function failing(invariants: readonly Invariant[], at: Stage, ctx: StageContext): Failure[] {
  const out: Failure[] = [];
  for (const inv of invariants) {
    if (inv.at !== at) continue;
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}

/** One attempt's plan, checked against the premise's `plan` invariants. */
export function drawPlan(def: PremiseDef, spec: MapSpec, attempt: number): { plan: PremisePlan; failures: Failure[] } | { reason: string } {
  const why = def.eligible(spec);
  if (why) return { reason: why };
  const plan = def.draw(spec, attempt);
  if ("reason" in plan) return plan;
  return { plan, failures: failing(def.invariants, "plan", { spec, plan }) };
}

/** The first plan of a spec that passes every `plan` invariant, within `PLAN_TRIES` attempts, with the attempt it
 *  took; or why none did (the spec then goes to the themes). */
export function firstPlan(def: PremiseDef, spec: MapSpec): { plan: PremisePlan; attempt: number } | { reason: string } {
  let last = "";
  for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
    const r = drawPlan(def, spec, attempt);
    if ("reason" in r) {
      if (attempt === 0 && def.eligible(spec)) return r;
      last = r.reason;
      continue;
    }
    if (!r.failures.length) return { plan: r.plan, attempt };
    last = `${r.failures[0].id}: ${r.failures[0].reason}`;
  }
  return { reason: `No ${def.id} plan held in ${PLAN_TRIES} tries (${last})` };
}

// Compound requests: a proposal of several steps, applied in a fixed order to a preview, with every
// goal checked on the combined result and every interference between goals named.
//
// Order (the app enforces it and says when it reorders): settings changes and regeneration first
// (a regeneration plans the whole map again), then deletions, the start, moves, new rivers, lakes
// and landforms, dam sites and gorges, falls and cliffs, hazards (badwater: after the sites it must
// keep clean), sculpting, and resources last (they grow on the finished ground and water).
//
// Interference found on the combined preview:
// - badwater joining a river above a dam site poisons its reservoir;
// - less flow (a settings change) fills a reservoir more slowly, and a narrower channel can shrink it;
// - badwater near the start, or a moved start, breaks a start requirement (read from the validator);
// - a placement cuts the start off from its water (the water-without-stairs path);
// - a builder reduced what was asked, or cleared trees and ruins to make room.
// Guards (every check that passed before the proposal) are never traded away: a proposal that
// breaks one is not accepted, and the check names the step that broke it.

import type { MapSession } from "../../../src/core/doc/session";
import type { Feature } from "../../../src/core/features/schema";
import type { Conversation } from "./conversation";
import { checkExpectations, valuesBefore, type Checked, type Expectation } from "./intent";
import { guardsOf, measureFeature, measureMade, measureSession, reservoirTiles, type Guard, type Measured } from "./metrics";
import { locate, network } from "./flow";
import { compassWords } from "./places";
import { writeReport } from "./report";
import { checkStep, expandStep, MAX_AREA_SHARE, MAX_STEPS, type Expanded, type Step } from "./steps";
import { viewOf } from "./view";

export interface Goal {
  id: string;
  text: string;
}

export interface Proposal {
  /** The request in the player's words (for the history and the report). */
  request?: string;
  goals?: Goal[];
  steps: Step[];
  expectations?: Expectation[];
  /** Claude's own plain-language report (propose only). */
  report?: string;
}

export interface StepResult {
  index: number;
  op: string;
  ok: boolean;
  applied: boolean;
  errors: string[];
  report: string[];
  resolved: Record<string, unknown>;
  made: { handle: string; id: string; kind: string }[];
  alternative?: Expanded["alternative"];
  /** Guards that first failed after this step. */
  broke: string[];
}

export interface Tradeoff {
  kind: "badwater-poisons-reservoir" | "less-flow" | "guard" | "reduced" | "cleared" | "start-moved" | "map-wide" | "order";
  text: string;
  steps?: number[];
}

export interface ProposalResult {
  ok: boolean;
  mode: "dry_run" | "propose";
  accepted: boolean;
  errors: string[];
  order: { index: number; op: string }[];
  reordered: boolean;
  steps: StepResult[];
  expectations: Checked[];
  guards: { broken: (Guard & { causedBy: number | null })[]; startRequirements: { id: string; ok: boolean; value?: number | string; limit?: number | string; failedBefore?: boolean }[] };
  tradeoffs: Tradeoff[];
  notMet: { goal: string; text: string; why: string; alternative?: string }[];
  made: { handle: string; id: string; kind: string }[];
  measured: Record<string, unknown>[];
  /** The app's draft of the report: every trade-off and unmet goal, in plain words. */
  draft: string;
  undoSteps: number;
}

const PRIORITY: Record<string, number> = {
  changeSettings: 0,
  undoLast: 0,
  deleteFeature: 1,
  moveStart: 2,
  moveFeature: 3,
  addRiver: 4,
  "addSource:water": 4,
  "addSource:badwater": 8,
  // a spring that fills a hollow: after the brushes and sculpts that may have dug it
  "addSource:hollow": 9.5,
  setRiverBadwater: 4,
  changeSource: 4,
  addLake: 5,
  changeFeature: 3,
  "addSetPiece:damSite": 6,
  "addSetPiece:gorge": 6,
  changeSetPiece: 6,
  "addSetPiece:waterfall": 7,
  "addSetPiece:terracedCliffs": 7,
  "addSetPiece:badwaterBasin": 8,
  sculpt: 9,
  brush: 9,
  carve: 9,
  removeResources: 10,
  addResource: 10,
  // Remove first, then objects from the shelf on the ground as it ends up
  remove: 10,
  placeObject: 10.5,
};

function priority(step: Step): number {
  const key = step.op === "addSetPiece" ? `addSetPiece:${step.kind}` : step.op === "addSource" ? `addSource:${step.fillHollow ? "hollow" : step.kind}` : step.op;
  return PRIORITY[key] ?? 5;
}

/** The order the app applies a proposal's steps in (stable within a priority). */
export function orderSteps(steps: readonly Step[]): { index: number; step: Step }[] {
  return steps.map((step, index) => ({ index, step })).sort((a, b) => priority(a.step) - priority(b.step) || a.index - b.index);
}

function cloneConv(c: Conversation): Conversation {
  return JSON.parse(JSON.stringify(c)) as Conversation;
}

/** Apply a proposal to the session. `dry_run` measures it and takes it all back; `propose` keeps
 *  it when every step applied and no guard broke. */
export function runProposal(s: MapSession, conv: Conversation, p: Proposal, mode: "dry_run" | "propose"): ProposalResult {
  const { x: W, y: H } = s.size;
  const errors: string[] = [];
  const base: ProposalResult = { ok: false, mode, accepted: false, errors, order: [], reordered: false, steps: [], expectations: [], guards: { broken: [], startRequirements: [] }, tradeoffs: [], notMet: [], made: [], measured: [], draft: "", undoSteps: 0 };
  if (!Array.isArray(p.steps) || p.steps.length === 0) return { ...base, errors: ["a proposal needs at least one step"] };
  if (p.steps.length > MAX_STEPS) return { ...base, errors: [`a proposal has at most ${MAX_STEPS} steps; split the request`] };
  p.steps.forEach((st, k) => checkStep(st, W, H).forEach((e) => errors.push(`step ${k}: ${e}`)));
  if (errors.length) return base;
  if (p.steps.some((st) => st.op === "undoLast") && p.steps.length > 1) errors.push("undoLast takes back the whole last proposal and must be the only step; to remove one thing, use deleteFeature");
  if ((p.expectations?.length ?? 0) > 40) errors.push("at most 40 expectations");
  if (errors.length) return base;
  const work = mode === "dry_run" ? cloneConv(conv) : conv;
  const before = measureSession(s);
  // the reservoirs of the dam sites already on the map, to see whether this proposal shrinks one
  const damsBefore = new Map<string, number>();
  for (const f of s.features) if (f.kind === "setPiece" && f.params.kind === "damSite") damsBefore.set(f.id, Number((measureFeature(s, f).reservoir as { volume?: number } | undefined)?.volume ?? 0));
  const was = valuesBefore(s, work, before, p.expectations ?? []);
  const ordered = orderSteps(p.steps);
  const reordered = ordered.some((o, k) => o.index !== k);
  const results: StepResult[] = [];
  let applied = 0;
  let undone = 0;
  let areaUsed = 0;
  let guardsNow = before.guards;
  const undoTarget = p.steps[0].op === "undoLast" ? conv.accepted[conv.accepted.length - 1] : null;
  for (const { index, step } of ordered) {
    const res: StepResult = { index, op: step.op, ok: false, applied: false, errors: [], report: [], resolved: {}, made: [], broke: [] };
    results.push(res);
    if (step.op === "undoLast") {
      if (!undoTarget) {
        res.errors.push("nothing to undo in this conversation");
        continue;
      }
      for (let k = 0; k < undoTarget.undoSteps; k++) if (s.undo()) undone++;
      res.ok = true;
      res.applied = true;
      res.report.push(`took back "${undoTarget.text}"`);
      guardsNow = guardsOf(s.validate().report);
      continue;
    }
    const ex = expandStep(s, work, step);
    Object.assign(res, { errors: ex.errors, report: ex.report, resolved: ex.resolved, made: ex.made, ...(ex.alternative ? { alternative: ex.alternative } : {}) });
    if (!ex.ok) continue;
    areaUsed += ex.tiles;
    if (areaUsed > MAX_AREA_SHARE * W * H) {
      res.errors.push(`the proposal would change more than ${Math.round(MAX_AREA_SHARE * 100)}% of the map; split it`);
      continue;
    }
    if (!ex.ops.length) {
      res.ok = true;
      continue;
    }
    if (ex.ops[0].op === "specPatch") {
      const r = s.apply(ex.ops[0], "claude", "Change settings (Claude)");
      if (!r.ok) {
        res.errors.push(...r.errors);
        continue;
      }
      applied++;
      if (r.regeneration && r.regeneration.report && !r.regeneration.report.passed) {
        const failing = r.regeneration.report.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id);
        s.undo();
        applied--;
        res.errors.push(`no layout with these settings passes the map's checks (${failing.join(", ")}): settings unchanged`);
        continue;
      }
      if (r.regeneration?.unfit.length) res.report.push(`${r.regeneration.unfit.length} of your own resource areas no longer fit the new terrain`);
    } else {
      const r = s.applyAll(ex.ops, "claude", labelFor(step));
      if (!r.ok) {
        res.errors.push(...r.errors);
        continue;
      }
      applied++;
    }
    res.ok = true;
    res.applied = true;
    for (const m of ex.made) {
      work.handles[m.handle] = m.id;
      work.last = m.id;
      work.made.push({ ...m, request: p.request ?? "" });
    }
    const g = guardsOf(s.validate().report);
    const was = new Map(guardsNow.map((x) => [x.id, x.ok]));
    res.broke = g.filter((x) => !x.ok && x.applicable && was.get(x.id) !== false).map((x) => x.id);
    guardsNow = g;
  }
  const after = measureSession(s);
  const made = results.flatMap((r) => r.made);
  const expectations = checkExpectations(s, work, before, after, p.expectations ?? [], made, was);
  const beforeOk = new Map(before.guards.map((g) => [g.id, g.ok]));
  const broken = after.guards
    .filter((g) => !g.ok && g.applicable && beforeOk.get(g.id) !== false)
    .map((g) => ({ ...g, causedBy: results.find((r) => r.broke.includes(g.id))?.index ?? null }));
  const tradeoffs = interference(s, work, p, before, after, results, reordered, damsBefore);
  const measured = made.map((m) => {
    const f = measureMade(s, m.id);
    return f ? { handle: m.handle, ...f } : { handle: m.handle, gone: true };
  });
  // features a step changed or moved are measured too, under their handle when they have one
  const handleOf = (id: string) => Object.entries(work.handles).find(([, v]) => v === id)?.[0];
  for (const r of results) {
    const id = r.ok && (r.op === "changeSetPiece" || r.op === "changeFeature" || r.op === "moveFeature") ? r.resolved.target : undefined;
    if (typeof id !== "string" || measured.some((m) => (m as { id?: string }).id === id)) continue;
    const f = s.features.find((g) => g.id === id);
    if (f) measured.push({ handle: handleOf(id) ?? "", changed: true, ...measureFeature(s, f) } as (typeof measured)[number]);
  }
  const notMet = unmetGoals(p, results, expectations);
  const allSteps = results.every((r) => r.ok);
  const accepted = mode === "propose" && allSteps && broken.length === 0 && (applied > 0 || undone > 0);
  const result: ProposalResult = {
    ok: allSteps && broken.length === 0 && expectations.every((e) => e.pass),
    mode,
    accepted,
    errors,
    order: ordered.map((o) => ({ index: o.index, op: o.step.op })),
    reordered,
    steps: results,
    expectations,
    guards: { broken, startRequirements: after.guards.filter((g) => g.start).map((g) => ({ id: g.id, ok: g.ok, value: g.value, limit: g.limit, ...(!g.ok && beforeOk.get(g.id) === false ? { failedBefore: true } : {}) })) },
    tradeoffs,
    notMet,
    made,
    measured,
    draft: "",
    undoSteps: applied,
  };
  result.draft = writeReport(result, p, after);
  if (mode === "dry_run" || !accepted) {
    for (let k = 0; k < applied; k++) s.undo();
    for (let k = 0; k < undone; k++) s.redo();
  } else {
    if (undoTarget) conv.accepted.pop();
    else conv.accepted.push({ text: p.request ?? "", undoSteps: applied, handles: made.map((m) => m.handle) });
  }
  if (mode === "propose" && !accepted) {
    if (!allSteps) errors.push("not accepted: some steps could not be done (see steps)");
    if (broken.length) errors.push(`not accepted: it breaks ${broken.map((b) => b.id).join(", ")}, which passed before (guards are never traded away)`);
    // the handles made in a rejected proposal do not exist
    for (const m of made) delete conv.handles[m.handle];
  }
  return result;
}

function labelFor(step: Step): string {
  switch (step.op) {
    case "addSetPiece":
      return `Add ${step.kind} (Claude)`;
    case "moveStart":
      return "Move the start (Claude)";
    default:
      return `${step.op} (Claude)`;
  }
}

function unmetGoals(p: Proposal, results: StepResult[], checks: Checked[]): ProposalResult["notMet"] {
  const out: ProposalResult["notMet"] = [];
  for (const g of p.goals ?? []) {
    const failing = checks.filter((c) => c.goal === g.id && !c.pass);
    if (failing.length) out.push({ goal: g.id, text: g.text, why: failing.map((c) => `${c.subject} ${c.metric}: ${c.why}`).join("; "), alternative: results.find((r) => !r.ok && r.alternative)?.alternative?.note });
    // a goal the player asked for that no expectation checks: left out, or unmeasured; either way
    // the report must say what became of it
    else if (!checks.some((c) => c.goal === g.id)) out.push({ goal: g.id, text: g.text, why: "no expectation checks this goal: if no step does it, say why it was left out and what you offer instead" });
  }
  for (const r of results) {
    if (r.ok) continue;
    const goal = (p.goals ?? []).find((g) => checks.some((c) => c.goal === g.id && !c.pass));
    if (!out.some((o) => o.why.includes(r.errors[0] ?? "\u0000"))) out.push({ goal: goal?.id ?? `step ${r.index}`, text: goal?.text ?? r.op, why: r.errors.join("; "), ...(r.alternative ? { alternative: r.alternative.note } : {}) });
  }
  return out;
}

// ------------------------------------------------------------------------------- interference

const GUARD_WORDS: Record<string, string> = {
  "start.badwater": "badwater comes too near the start",
  "start.water": "the start loses its pumpable clean water",
  "start.reach_water": "the colony can no longer walk to its water",
  "start.food": "the start keeps too few berry bushes",
  "start.wood": "the start keeps too little wood",
  "start.reach": "the colony's walkable land shrinks below the rule",
  "start.dry": "water reaches the start",
  "water.reservoir": "the water stored near the start drops below the colony's drought need",
  "plants.survive": "some plants stand where they die",
};

/** Where a badwater basin's spring and outlet channel lie, as tile indices on a W-wide map. */
export function basinFootprint(b: Feature, W: number): { spring: number | null; outlet: number[] } {
  if (b.kind !== "setPiece") return { spring: null, outlet: [] };
  const at = (b.params.request.at ?? b.params.plan.at) as number[] | undefined;
  const flat = (b.params.plan.outlet as number[] | undefined) ?? [];
  const outlet: number[] = [];
  for (let k = 0; k + 1 < flat.length; k += 2) outlet.push(Math.round(flat[k + 1]) * W + Math.round(flat[k]));
  return { spring: at ? Math.round(at[1]) * W + Math.round(at[0]) : null, outlet };
}

function interference(s: MapSession, conv: Conversation, p: Proposal, before: Measured, after: Measured, results: StepResult[], reordered: boolean, damsBefore: Map<string, number>): Tradeoff[] {
  const out: Tradeoff[] = [];
  const v = viewOf(s);
  const net = network(v);
  const newIds = new Set(results.flatMap((r) => r.made.map((m) => m.id)));
  const nameOf = (id: string) => Object.entries(conv.handles).find(([, x]) => x === id)?.[0] ?? id;
  // badwater joining above a dam site
  const basins = s.features.filter((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin" && f.params.plan.mode === "basin");
  const dams = s.features.filter((f) => f.kind === "setPiece" && f.params.kind === "damSite");
  for (const b of basins) {
    if (b.kind !== "setPiece") continue;
    // a basin inside a dam site's reservoir: the water rises over it when the dam is built
    for (const d of dams) {
      if (d.kind !== "setPiece" || (!newIds.has(b.id) && !newIds.has(d.id))) continue;
      const res = reservoirTiles(s, d);
      const where = basinFootprint(b, v.W);
      const spring = where.spring !== null && res.has(where.spring);
      const channel = where.outlet.some((i) => res.has(i));
      if (spring || channel) out.push({ kind: "badwater-poisons-reservoir", text: spring ? `the badwater spring ${nameOf(b.id)} lies inside the reservoir the dam site ${nameOf(d.id)} would hold: a dam there floods it and the water turns to badwater` : `the badwater spring ${nameOf(b.id)} drains to the map edge by a channel that runs through the reservoir of the dam site ${nameOf(d.id)}: its water would be badwater` });
    }
    const to = b.params.plan.outletTo;
    const tiles = b.params.plan.outlet as number[];
    if (typeof to !== "string" || to === "edge" || !tiles?.length) continue;
    const c = net.byId.get(to);
    if (!c) continue;
    const l = locate(net, v.W, tiles[tiles.length - 2], tiles[tiles.length - 1], c);
    if (!l) continue;
    for (const d of dams) {
      if (d.kind !== "setPiece" || d.params.plan.river !== to) continue;
      if (!newIds.has(b.id) && !newIds.has(d.id)) continue;
      const at = Number(d.params.plan.at);
      const flowAt = c.reversed ? c.length - at : at;
      if (flowAt > l.s) {
        const m = measureFeature(s, d);
        out.push({
          kind: "badwater-poisons-reservoir",
          text: `the badwater from ${nameOf(b.id)} joins ${c.name} ${Math.round(l.frac * 100)}% of the way down, above the dam site ${nameOf(d.id)} (${Math.round((flowAt / c.length) * 100)}%): its reservoir would fill with badwater${m.reservoirClean === false ? " (the preview's water there is already contaminated)" : ""}`,
        });
      }
    }
  }
  // badwater rivers above dam sites
  for (const c of net.courses.filter((k) => k.badwater && k.outlet.kind === "river")) {
    for (const d of dams) {
      if (d.kind !== "setPiece" || d.params.plan.river !== c.outlet.river) continue;
      const t = net.byId.get(c.outlet.river!);
      if (!t) continue;
      const flowAt = t.reversed ? t.length - Number(d.params.plan.at) : Number(d.params.plan.at);
      if ((c.outlet.joinsAt ?? 0) < flowAt) out.push({ kind: "badwater-poisons-reservoir", text: `${c.name} carries badwater into ${t.name} above the dam site ${nameOf(d.id)}: its reservoir would hold badwater` });
    }
  }
  // a dam site already on the map that holds less now (a gorge or a fall built in its basin, a
  // lake or landform in the way); a settings change is reported as less-flow instead
  const regenerated = results.some((r) => r.op === "changeSettings" && r.applied);
  // a regenerated map places its own start again: say where it went
  const s0 = before.view.start;
  const s1 = after.view.start;
  if (regenerated && s0 && s1 && !results.some((r) => r.op === "moveStart" && r.applied)) {
    const d = Math.hypot(s1.x - s0.x, s1.y - s0.y);
    if (d >= 3) out.push({ kind: "start-moved", text: `the regenerated map put the start ${Math.round(d)} tiles from where it was, at (${s1.x}, ${s1.y}) in the ${compassWords(after.view, s1.x, s1.y)}: distances to the start changed` });
  }
  for (const d of dams) {
    const was = damsBefore.get(d.id);
    if (!was || d.kind !== "setPiece") continue;
    const now = Number((measureFeature(s, d).reservoir as { volume?: number } | undefined)?.volume ?? 0);
    if (now < was * 0.97) out.push({ kind: "reduced", text: `the dam site ${Math.round(((d.params.plan.at as number) / Math.max(1, net.byId.get(String(d.params.plan.river))?.length ?? 1)) * 100)}% down ${net.byId.get(String(d.params.plan.river))?.name ?? "the river"} now holds ${now} blocks instead of ${was}: ${regenerated ? "the new settings reshaped the land around it" : "the new work sits in its basin"}` });
  }
  // trees and berries near the start that the builders took without saying so
  const tb = before.map.treesNearStart;
  const ta = after.map.treesNearStart;
  const bb = before.map.bushesNearStart;
  const ba = after.map.bushesNearStart;
  const said = results.some((r) => r.report.some((l) => /^clears /.test(l)));
  if (!said && !regenerated && Number.isFinite(tb) && Number.isFinite(ta) && (ta < tb - 5 || ba < bb - 3)) {
    out.push({ kind: "cleared", text: `near the start there are now ${ta} trees (was ${tb}) and ${ba} berry bushes (was ${bb})` });
  }
  // less flow: reservoirs fill more slowly
  const settings = results.find((r) => r.op === "changeSettings" && r.applied);
  if (settings && after.map.cleanStrength < before.map.cleanStrength - 0.01) {
    const ratio = before.map.cleanStrength / Math.max(0.01, after.map.cleanStrength);
    const damMeasures = dams.filter((d) => newIds.has(d.id)).map((d) => measureFeature(s, d));
    const fill = damMeasures.find((m) => typeof m.fillMinutes === "number");
    out.push({
      kind: "less-flow",
      text: `the river now brings ${after.map.cleanStrength.toFixed(2)} blocks/s instead of ${before.map.cleanStrength.toFixed(2)}${fill ? `: the reservoir at ${nameOf(fill.id)} takes about ${fill.fillMinutes} minutes to fill, ${ratio.toFixed(1)}× as long as it would have` : ", so every reservoir fills more slowly"}${after.map.bestDam < before.map.bestDam ? `, and the best dam site near the start now holds ${Math.round(after.map.bestDam)} blocks (was ${Math.round(before.map.bestDam)})` : ""}`,
    });
  }
  // guards broken, by the step that broke them
  const beforeOk = new Map(before.guards.map((g) => [g.id, g.ok]));
  for (const g of after.guards) {
    if (g.ok || !g.applicable || beforeOk.get(g.id) === false) continue;
    const by = results.find((r) => r.broke.includes(g.id));
    const cause = by ? ` (step ${by.index}, ${by.op}${by.op === "addSetPiece" ? ` ${String((p.steps[by.index] as { kind?: string }).kind)}` : ""})` : "";
    const placement = by && by.op !== "changeSettings" && by.op !== "moveStart" && (g.id === "start.water" || g.id === "start.reach_water");
    out.push({ kind: "guard", text: `${placement ? "a placement cuts the start off from its water" : (GUARD_WORDS[g.id] ?? g.id)}${cause}: ${g.message}`, ...(by ? { steps: [by.index] } : {}) });
  }
  // what the builders reduced or cleared
  for (const r of results) {
    for (const line of r.report) {
      if (/reduced to|raised to|widened|moved \d+ tile|asked for \d|reaches level \d+ here, not|too narrow to|stop at level/.test(line)) out.push({ kind: "reduced", text: line, steps: [r.index] });
      else if (/^clears /.test(line)) out.push({ kind: "cleared", text: line, steps: [r.index] });
      else if (/plants (a berry patch|a grove)/.test(line)) out.push({ kind: "start-moved", text: line, steps: [r.index] });
    }
  }
  if (settings && /\b(valley|this area|here|part)\b/i.test(p.request ?? "")) out.push({ kind: "map-wide", text: "settings apply to the whole map, not one valley: the change reaches every part of it" });
  if (reordered) out.push({ kind: "order", text: "the steps were applied in the app's order: settings first, then the start, then sites, then hazards, then resources" });
  return out;
}

export type { Expectation };

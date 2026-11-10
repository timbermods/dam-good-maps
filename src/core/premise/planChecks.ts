// The checks every premise's plan passes (docs/PREMISES.md §1.4, `plan`): the levels fit, the bodies don't overlap,
// the graph closes, the works and the skeleton refer to what is there. Arithmetic on the plan, microseconds to
// milliseconds; each fails with one line naming what is wrong ("Lake 2's sill (6) is not below lake 3's (6)").

import { bodyGap, edgeGap, pathBodyGap, pathDist, pathGap, pathLength, subPath } from "./geom";
import type { Body, Invariant, InvariantResult, Link, PremisePlan } from "./types";

export const OK: InvariantResult = { ok: true };
export const fail = (reason: string): InvariantResult => ({ ok: false, reason });

/** The least gap between two bodies' outlines: a sill's crest two tiles thick and a tile of shore (assumption). */
export const BODY_GAP = 3;

/** A body's or a link's name for a reason. */
export function nameOf(plan: PremisePlan, id: string): string {
  return plan.names[id] ?? id;
}

export function bodyMap(plan: PremisePlan): Map<string, Body> {
  return new Map(plan.bodies.map((b) => [b.id, b]));
}

/** Where the water goes: each body's links out, for a walk of the graph. */
export function linksFrom(plan: PremisePlan): Map<string, Link[]> {
  const out = new Map<string, Link[]>();
  for (const l of plan.links) {
    const list = out.get(l.from) ?? [];
    list.push(l);
    out.set(l.from, list);
  }
  return out;
}

/** Every body and exit water reaches from `from` along the links `pass` lets through. */
export function reach(plan: PremisePlan, from: string[], pass: (l: Link) => boolean): Set<string> {
  const out = linksFrom(plan);
  const seen = new Set<string>(from);
  const queue = [...from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of out.get(id) ?? []) {
      if (!pass(l) || seen.has(l.to)) continue;
      seen.add(l.to);
      queue.push(l.to);
    }
  }
  return seen;
}

/** A link's bed at each point, where given as numbers. */
function bedOf(l: Link): number[] | null {
  return Array.isArray(l.bed) ? l.bed : null;
}

/** The levels fit: water runs down every link, every fall drops onto the water below it, every bed falls, and every
 *  water stands at least two levels under the highest ground (PREMISES §4.1). */
const levels: Invariant = {
  id: "plan.levels",
  at: "plan",
  test({ plan }) {
    const bodies = bodyMap(plan);
    for (const b of plan.bodies) {
      if (b.sill > plan.top - 2) return fail(`${nameOf(plan, b.id)}'s sill (${b.sill}) is over the highest ground less two (${plan.top - 2})`);
      if (b.deep < 1 || b.sill - b.deep < 0) return fail(`${nameOf(plan, b.id)}'s bed (${b.sill} less ${b.deep}) is not between its sill and level 0`);
    }
    for (const l of plan.links) {
      const from = bodies.get(l.from);
      const to = bodies.get(l.to);
      if (from && to && to.sill > from.sill) return fail(`${nameOf(plan, l.id)} runs uphill: ${nameOf(plan, to.id)}'s sill (${to.sill}) is over ${nameOf(plan, from.id)}'s (${from.sill})`);
      if (l.fall) {
        const f = l.fall;
        if (!(f.height > 0)) return fail(`${nameOf(plan, l.id)} drops ${f.height}`);
        if (from && f.crest > from.sill) return fail(`${nameOf(plan, l.id)}'s crest (${f.crest}) is over ${nameOf(plan, from.id)}'s sill (${from.sill})`);
        if (to && f.crest - f.height !== to.sill) return fail(`${nameOf(plan, l.id)} drops from ${f.crest} by ${f.height}, not onto ${nameOf(plan, to.id)}'s sill (${to.sill})`);
      }
      const bed = bedOf(l);
      if (bed) {
        if (!l.path || bed.length !== l.path.length) return fail(`${nameOf(plan, l.id)}'s bed has ${bed.length} levels for ${l.path?.length ?? 0} points`);
        for (let k = 1; k < bed.length; k++) if (bed[k] > bed[k - 1]) return fail(`${nameOf(plan, l.id)}'s bed rises from ${bed[k - 1]} to ${bed[k]}`);
        if (from && bed[0] > from.sill) return fail(`${nameOf(plan, l.id)}'s bed starts at ${bed[0]}, over ${nameOf(plan, from.id)}'s sill (${from.sill})`);
        if (to && bed[bed.length - 1] < to.sill) return fail(`${nameOf(plan, l.id)}'s bed ends at ${bed[bed.length - 1]}, under ${nameOf(plan, to.id)}'s sill (${to.sill})`);
      }
    }
    return OK;
  },
};

/** The bodies don't overlap: outlines `BODY_GAP` apart and on the map; channels pass between bodies, not through
 *  them, and don't cross each other; the start's 5 × 5 is dry. */
const overlap: Invariant = {
  id: "plan.overlap",
  at: "plan",
  test({ plan }) {
    const { W, H } = plan;
    for (let i = 0; i < plan.bodies.length; i++) {
      const a = plan.bodies[i];
      if (edgeGap(a, W, H) < 1) return fail(`${nameOf(plan, a.id)} runs off the map`);
      for (let j = i + 1; j < plan.bodies.length; j++) {
        const b = plan.bodies[j];
        const g = bodyGap(a, b);
        if (g < BODY_GAP) return fail(`${nameOf(plan, a.id)} and ${nameOf(plan, b.id)} stand ${g.toFixed(1)} tiles apart (at least ${BODY_GAP})`);
      }
    }
    const channels = plan.links.filter((l) => l.path && l.path.length > 1);
    // a channel's middle (two tiles in from each end) stays out of every body
    for (const l of channels) {
      const len = pathLength(l.path!);
      for (const b of plan.bodies) {
        const g = pathBodyGap(l.path!, b, 2, len - 2);
        if (g < 0) return fail(`${nameOf(plan, l.id)} runs through ${nameOf(plan, b.id)}`);
      }
    }
    // channels don't cross: their middles (four tiles in from each end) stay apart
    const mids = channels.map((l) => {
      const len = pathLength(l.path!);
      return len > 10 ? subPath(l.path!, 4, len - 4) : null;
    });
    for (let i = 0; i < channels.length; i++)
      for (let j = i + 1; j < channels.length; j++) {
        const p = mids[i];
        const q = mids[j];
        if (!p || !q) continue;
        if (pathGap(p, q) < 1.5) return fail(`${nameOf(plan, channels[i].id)} and ${nameOf(plan, channels[j].id)} cross`);
      }
    // the start's 5 × 5 is dry: no body or channel on it
    const s = plan.frame.start;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = s.x + dx;
        const y = s.y + dy;
        for (const b of plan.bodies) if (bodyGapToTile(b, x, y) < 0.5) return fail(`${nameOf(plan, b.id)} reaches the start's 5 × 5`);
        for (const l of channels) if (pathDist(x, y, l.path!).d < (l.half ?? 1) + 0.5) return fail(`${nameOf(plan, l.id)} crosses the start's 5 × 5`);
      }
    return OK;
  },
};

function bodyGapToTile(b: Body, x: number, y: number): number {
  return bodyGap(b, { arms: [[[x, y, 0]]] });
}

/** The graph closes: every link joins bodies or exits that exist, every source stands in one, water from every
 *  source reaches an exit, every exit lies on its edge and every body is fed (a dry one by a link a work opens). */
const graph: Invariant = {
  id: "plan.graph",
  at: "plan",
  test({ plan }) {
    const bodies = bodyMap(plan);
    const exits = new Map(plan.exits.map((e) => [e.id, e]));
    const links = new Map(plan.links.map((l) => [l.id, l]));
    const ids = new Set<string>();
    for (const x of [...plan.bodies, ...plan.links, ...plan.exits, ...plan.sources]) {
      if (ids.has(x.id)) return fail(`Two things share the id ${x.id}`);
      ids.add(x.id);
    }
    for (const l of plan.links) {
      if (!bodies.has(l.from)) return fail(`${nameOf(plan, l.id)} leaves ${l.from}, which is not a body`);
      if (!bodies.has(l.to) && !exits.has(l.to)) return fail(`${nameOf(plan, l.id)} ends at ${l.to}, which is neither a body nor an exit`);
    }
    for (const s of plan.sources) if (!bodies.has(s.into) && !links.has(s.into)) return fail(`Source ${s.id} stands in ${s.into}, which is not there`);
    for (const e of plan.exits) {
      const [x, y] = e.at;
      const on = e.edge === "S" ? y : e.edge === "N" ? plan.H - y : e.edge === "W" ? x : plan.W - x;
      if (Math.abs(on) > 1) return fail(`Exit ${e.id} is not on the ${e.edge} edge`);
    }
    // water from every source leaves the map (a wet way to an exit; the badwater source's link leads to one)
    const wet = (l: Link) => l.wet;
    for (const s of plan.sources) {
      const start = bodies.has(s.into) ? [s.into] : [links.get(s.into)!.to];
      const seen = reach(plan, start, wet);
      if (![...seen].some((id) => exits.has(id))) return fail(`The water of ${nameOf(plan, s.into)} never leaves the map`);
    }
    // every body is fed: wet from a source, or a dry body a link leads into
    const fed = reach(
      plan,
      plan.sources.filter((s) => bodies.has(s.into)).map((s) => s.into),
      wet,
    );
    for (const b of plan.bodies) {
      if (fed.has(b.id)) continue;
      if (!b.dry) return fail(`${nameOf(plan, b.id)} holds water on day 1 that nothing feeds`);
      if (!plan.links.some((l) => l.to === b.id)) return fail(`${nameOf(plan, b.id)} is an empty basin no work can fill`);
    }
    return OK;
  },
};

/** The works refer to what is there: each stands on a link or a body, needs only works that exist and come first,
 *  and states what it buys as a range. */
const works: Invariant = {
  id: "plan.works",
  at: "plan",
  test({ plan }) {
    const on = new Set([...plan.bodies.map((b) => b.id), ...plan.links.map((l) => l.id)]);
    const byId = new Map(plan.works.map((w) => [w.id, w]));
    const regions = new Set(plan.regions.map((r) => r.id));
    for (const w of plan.works) {
      if (!on.has(w.on)) return fail(`Work ${w.id} stands on ${w.on}, which is not there`);
      if (!regions.has(w.region)) return fail(`Work ${w.id} is in region ${w.region}, which is not there`);
      if (!(w.tiles > 0)) return fail(`Work ${w.id} asks for ${w.tiles} tiles`);
      if (w.gives.green[0] > w.gives.green[1] || (w.gives.reservoir && w.gives.reservoir[0] > w.gives.reservoir[1])) return fail(`Work ${w.id} gives a range upside down`);
      for (const n of w.needs) if (!byId.has(n)) return fail(`Work ${w.id} needs ${n}, which is not there`);
    }
    // no work needs itself through a chain
    const state = new Map<string, number>();
    const cyclic = (id: string): boolean => {
      const s = state.get(id);
      if (s === 1) return true;
      if (s === 2) return false;
      state.set(id, 1);
      for (const n of byId.get(id)!.needs) if (cyclic(n)) return true;
      state.set(id, 2);
      return false;
    };
    for (const w of plan.works) if (cyclic(w.id)) return fail(`Work ${w.id} needs itself through a chain of works`);
    return OK;
  },
};

/** The skeleton: three to five regions, each a different role, everything in one of them; every exit's edge lets
 *  water leave; every body and link named; the set pieces tied to something there. */
const skeleton: Invariant = {
  id: "plan.skeleton",
  at: "plan",
  test({ plan }) {
    if (plan.regions.length < 3 || plan.regions.length > 5) return fail(`${plan.regions.length} regions (three to five)`);
    const roles = new Set(plan.regions.map((r) => r.role));
    if (roles.size !== plan.regions.length) return fail("Two regions share a role");
    const regions = new Set(plan.regions.map((r) => r.id));
    for (const b of plan.bodies) if (!regions.has(b.region)) return fail(`${nameOf(plan, b.id)} is in region ${b.region}, which is not there`);
    for (const e of plan.exits) if (plan.edges[e.edge] !== "water leaves") return fail(`Water leaves by the ${e.edge} edge, which the plan calls ${plan.edges[e.edge]}`);
    for (const x of [...plan.bodies, ...plan.links]) if (!plan.names[x.id]) return fail(`${x.id} has no name`);
    const tied = new Set([...plan.bodies.map((b) => b.id), ...plan.links.map((l) => l.id), ...plan.works.map((w) => w.id)]);
    for (const p of plan.setPieces) if (!tied.has(p.on)) return fail(`Set piece ${p.id} is tied to ${p.on}, which is not there`);
    if (!plan.line.trim()) return fail("The plan has no line");
    return OK;
  },
};

/** The checks every premise's plan passes. */
export const PLAN_CHECKS: Invariant[] = [levels, overlap, graph, works, skeleton];

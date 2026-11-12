// Water by number (docs/PREMISES.md §2.2, stage 1): the water table of a plan. Each body's level and each link's flow
// and depth, from the plan's sources down its graph, before any land exists: arithmetic only, so a re-roll costs
// nothing. Stage 1's rasters build the land to this table (a lip's width from its flow), and the contract test that
// settles stage 1's water (tests/contract/premiseWater.test.ts) fits its constants: they are Four Lakes'
// measurements, not laws.
//
// The model: every outlet of a body is a weir. A lip tile (a fall's crest) carries `lipCarry` × the head over it, a
// channel's head `channelCarry` × its width × the head; a notch or a breach is a lip tile a level deeper. A body's
// level is where its outlets carry its inflow, so its water splits between them by what each carries at that level.
// A link shut by a row of Blockages carries nothing on day 1; a body nothing reaches is dry.

import { MAX_SILL_WIDTH, sillWidthFor } from "../sim/sill";
import type { Body, Fall, Link, PremisePlan } from "./types";

export const WATER = {
  /** Flow a lip tile carries for each level of head over its crest (blocks a second). Four Lakes: about 3.3; sim/sill.ts
   *  measured the settle's head as 0.33 × flow ÷ width. Fitted by the settle (premiseWater.test.ts). */
  lipCarry: 3.3,
  /** Flow a channel's bed carries a tile of its width for each level of depth. Fitted by the settle
   *  (premiseWater.heavy.test.ts): brooks 2.5 to 4.4, the neck and the hanging valley 2.1 to 3.1, the gorge 2.6; the
   *  lower end, so a channel is built for the deepest water it runs (the guard stands a level over it). */
  channelCarry: 2.5,
  /** A lip's least width (PREMISES §2.2: 8 to `MAX_SILL_WIDTH`). */
  lipLeast: 8,
  /** The depth a dry body or channel is designed for (the guard holds it when a work lets the water in). */
  designDepth: 0.3,
} as const;

/** A lake through a drought (PREMISES §4.4 `drought.lakes`): every source stops, a lake whose sill has a notch or a
 *  breach a level deep sinks to it, and the sun takes the rest off its surface. The lake keeps `keep` of its water at
 *  the drought's worst day when its floor stands `holdDeep` under its sill. */
export const HOLD = {
  /** The share of its day-1 water a lake keeps at the worst day of the difficulty's longest drought: most of it. */
  keep: 0.55,
  /** What the sun takes off a lake's open water a day (`sim/drought.ts`: 1e-4 a second × the saturation modifier,
   *  about 1.16 there, × `SECONDS_PER_DAY`). */
  sun: 0.0535,
  /** The head a lake stands over its sill on day 1 (0.1 to 0.35 by the table), as the drought counts it. */
  head: 0.2,
  /** The deepest a lake's floor goes under its sill. */
  most: 5,
} as const;

/** How deep under its sill a lake's floor stands to keep `HOLD.keep` of its water through `days` of drought, when its
 *  sill drops a level (a notch or a breach) or not: the least whole depth `d` with (d − drop − sun × days) ÷ (d + head)
 *  at least `keep`; 2 at least, `HOLD.most` at most. */
export function holdDeep(drops: boolean, days: number): number {
  const lost = (drops ? 1 : 0) + HOLD.sun * days + HOLD.keep * HOLD.head;
  return Math.max(2, Math.min(HOLD.most, Math.ceil(lost / (1 - HOLD.keep) - 1e-9)));
}

/** A lip's width for the flow over it: `sillWidthFor`, never over `MAX_SILL_WIDTH` (16), and never under 8 plus its
 *  piers, notch and breach (`stair.settled` asks 8 tiles that pour; a pier pours nothing, and at a step of 3 a notch
 *  or breach a level deeper drops 2 and some, a rapid, not the curtain). */
export function lipWidth(flow: number, fall?: Pick<Fall, "piers" | "notch" | "breach">): number {
  const least = WATER.lipLeast + (fall ? fall.piers + fall.notch + fall.breach : 0);
  return Math.max(least, Math.min(MAX_SILL_WIDTH, sillWidthFor(flow)));
}

export interface BodyLevel {
  id: string;
  sill: number;
  /** Where its water stands with its inflow over its outlets (the sill when dry). */
  level: number;
  /** Blocks a second reaching it on day 1, its badwater part. */
  inflow: number;
  bad: number;
  /** Nothing reaches it on day 1. */
  dry: boolean;
  /** Its open outlets (link ids). None on a fed body: it has no way out (a plan error). */
  outlets: string[];
}

export interface LinkFlow {
  id: string;
  /** Blocks a second through it on day 1, its badwater part. */
  flow: number;
  bad: number;
  /** A fall's lip as built (tiles), a channel's bed (tiles across). */
  width: number;
  /** A fall: the head over its crest; a channel: its water's depth on a level reach. */
  depth: number;
  /** Its water's depth on its channel's bed (a channel, the landmark's hanging valley, the gorge below its lip). */
  bedDepth: number;
  wet: boolean;
  /** A row of Blockages shuts it on day 1. */
  shut: boolean;
}

export interface WaterTable {
  bodies: Record<string, BodyLevel>;
  links: Record<string, LinkFlow>;
}

/** A channel's bed width, tiles across (its mouth where that is wider). */
export function channelWidth(l: Link): number {
  return Math.max(1, 2 * (l.half ?? 0.5));
}

/** A link's bed at its head: a fall's crest, a channel's first bed. */
function headBed(l: Link, from: Body): number {
  if (l.path && l.bed && Array.isArray(l.bed)) return l.bed[0];
  if (l.fall) return l.fall.crest;
  return from.sill;
}

/** The channels whose heads are weirs: where a lake's or the springs' pool's water splits between two ways out or
 *  more (the pool between its neck and the hanging valley, a lake between its fall and the valley), each channel starts
 *  with a weir its width across at its head bed and drops past it, so each carries as a lip does, whatever its length,
 *  course or turn, and the split is the table's. A channel's own course would set it instead: a long level reach
 *  carries half what a short one into a drop does. A side body's brooks carry a level's trickle and keep their beds. */
export function weirs(plan: PremisePlan): Set<string> {
  const out = new Set<string>();
  for (const b of plan.bodies) {
    if (b.kind !== "lake" && b.kind !== "pool") continue;
    const open = plan.links.filter((l) => l.from === b.id && l.rows.length === 0);
    if (open.length < 2) continue;
    for (const l of open) if (l.path && Array.isArray(l.bed) && !sizedLip(l)) out.add(l.id);
  }
  return out;
}

/** A weir's width in tiles across: its channel's, whole. */
export function weirWidth(l: Link): number {
  return Math.max(1, Math.round(channelWidth(l)));
}

/** What one outlet carries with its body's water at `level`: its lip tiles (a notch or breach a level deeper, a pier
 *  a level over), its weir's tiles, or its channel's width, each `carry` × the head over it. */
function carried(l: Link, from: Body, width: number, level: number, weir: boolean): number {
  if (sizedLip(l)) {
    const f = l.fall!;
    const low = f.notch + f.breach;
    const high = f.piers;
    const plain = Math.max(0, width - low - high);
    const h = level - f.crest;
    return WATER.lipCarry * (plain * Math.max(0, h) + low * Math.max(0, h + 1) + high * Math.max(0, h - 1));
  }
  if (weir) return WATER.lipCarry * weirWidth(l) * Math.max(0, level - headBed(l, from));
  // a channel, the landmark's hanging valley among them: its head is its bed where it leaves the body
  return WATER.channelCarry * width * Math.max(0, level - headBed(l, from));
}

/** The level at which a body's open outlets carry `q` (by halving: the carry rises with the level). */
function levelFor(q: number, outs: { l: Link; w: number; weir: boolean }[], from: Body): number {
  let lo = from.sill - 2;
  let hi = from.sill + 4;
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2;
    let c = 0;
    for (const o of outs) c += carried(o.l, from, o.w, mid, o.weir);
    if (c < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The water table of a plan: day 1's flows down its graph, each fall's lip sized by its flow. */
export function waterTable(plan: PremisePlan): WaterTable {
  const bodies = new Map(plan.bodies.map((b) => [b.id, b]));
  // a lip's width: the landmark's is the frame's (§4.3); every other fall's comes from its flow, found by settling
  // the table twice from the plan's widths
  const widths = new Map<string, number>();
  for (const l of plan.links) widths.set(l.id, sizedLip(l) ? l.fall!.width : channelWidth(l));
  let table = route(plan, bodies, widths);
  for (let pass = 0; pass < 2; pass++) {
    for (const l of plan.links) if (sizedLip(l)) widths.set(l.id, lipWidth(table.links[l.id].flow, l.fall));
    table = route(plan, bodies, widths);
  }
  return table;
}

/** A fall whose lip is sized by its flow: a stair fall, the lowest sill over the gorge (not the landmark, whose lip
 *  the first frame sizes). */
export function sizedLip(l: Link): boolean {
  return !!l.fall && (l.kind === "gorge" || !l.path);
}

function route(plan: PremisePlan, bodies: Map<string, Body>, widths: Map<string, number>): WaterTable {
  const inflow = new Map<string, number>();
  const badIn = new Map<string, number>();
  const add = (id: string, q: number, bad: number) => {
    inflow.set(id, (inflow.get(id) ?? 0) + q);
    badIn.set(id, (badIn.get(id) ?? 0) + bad);
  };
  for (const s of plan.sources) add(s.into, s.strength, s.bad ? s.strength : 0);
  const open = (l: Link) => l.rows.length === 0;
  const weir = weirs(plan);
  // the bodies in the order water reaches them (open links between bodies), the rest in the plan's order
  const indeg = new Map<string, number>(plan.bodies.map((b) => [b.id, 0]));
  for (const l of plan.links) if (open(l) && bodies.has(l.from) && bodies.has(l.to) && l.from !== l.to) indeg.set(l.to, (indeg.get(l.to) ?? 0) + 1);
  const order: string[] = [];
  const queue = plan.bodies.filter((b) => !indeg.get(b.id)).map((b) => b.id);
  const done = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (done.has(id)) continue;
    done.add(id);
    order.push(id);
    for (const l of plan.links) {
      if (l.from !== id || !open(l) || !bodies.has(l.to)) continue;
      const d = (indeg.get(l.to) ?? 0) - 1;
      indeg.set(l.to, d);
      if (d <= 0) queue.push(l.to);
    }
  }
  for (const b of plan.bodies) if (!done.has(b.id)) order.push(b.id);
  const out: WaterTable = { bodies: {}, links: {} };
  for (const l of plan.links) out.links[l.id] = { id: l.id, flow: 0, bad: 0, width: widths.get(l.id) ?? 1, depth: 0, bedDepth: 0, wet: false, shut: !open(l) };
  for (const id of order) {
    const b = bodies.get(id)!;
    const q = inflow.get(id) ?? 0;
    const bad = badIn.get(id) ?? 0;
    // (a link into a backwater takes no share: the backwater fills from it, then it carries nothing, `Body.backwater`)
    const back = plan.links.filter((l) => l.from === id && open(l) && bodies.get(l.to)?.backwater);
    const outs = plan.links.filter((l) => l.from === id && open(l) && !bodies.get(l.to)?.backwater).map((l) => ({ l, w: widths.get(l.id) ?? 1, weir: weir.has(l.id) }));
    const level = q > 0 && outs.length ? levelFor(q, outs, b) : b.sill;
    out.bodies[id] = { id, sill: b.sill, level, inflow: q, bad, dry: !(q > 0), outlets: outs.map((o) => o.l.id) };
    // (a backwater stands at its feeder's level, filled; its link is wet and carries nothing)
    if (b.backwater && !(q > 0)) {
      const feeder = plan.links.find((l) => l.to === id && open(l) && out.bodies[l.from] && !out.bodies[l.from].dry);
      if (feeder) out.bodies[id] = { ...out.bodies[id], level: out.bodies[feeder.from].level, dry: false };
    }
    for (const l of back) if (q > 0) out.links[l.id].wet = true;
    if (!(q > 0)) continue;
    let total = 0;
    for (const o of outs) total += carried(o.l, b, o.w, level, o.weir);
    for (const o of outs) {
      const share = total > 0 ? carried(o.l, b, o.w, level, o.weir) / total : 1 / outs.length;
      const lf = out.links[o.l.id];
      lf.flow += q * share;
      lf.bad += bad * share;
      lf.wet = lf.flow > 0;
      add(o.l.to, q * share, bad * share);
    }
  }
  // links a source stands in (the badwater spring in the gorge) carry it too
  for (const s of plan.sources) {
    const lf = out.links[s.into];
    if (!lf) continue;
    lf.flow += s.strength;
    if (s.bad) lf.bad += s.strength;
    lf.wet = true;
  }
  for (const l of plan.links) {
    const lf = out.links[l.id];
    if (!lf.wet) continue;
    const from = bodies.get(l.from);
    if (sizedLip(l) && from) lf.depth = out.bodies[from.id].level - l.fall!.crest;
    else if (l.kind === "fall" && l.fall) lf.depth = lf.flow / (WATER.lipCarry * l.fall.width);
    else lf.depth = lf.flow / (WATER.channelCarry * lf.width);
    if (l.path) lf.bedDepth = lf.flow / (WATER.channelCarry * channelWidth(l));
  }
  return out;
}

/** The surface a body's water is built for: its level, or a design depth over its sill when it is dry or stands
 *  under its sill on day 1 (its works let more in). */
export function designLevel(t: WaterTable, b: Body): number {
  const r = t.bodies[b.id];
  return Math.max(r ? r.level : b.sill, b.sill + WATER.designDepth);
}

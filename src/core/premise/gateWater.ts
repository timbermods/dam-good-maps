// Stage 1 of the wall with one gate (docs/PREMISES.md §5.1, §2.2): its water by number. The shared stage
// (`water.ts` `waterByNumber`) draws the gate's plan as it draws any plan: the lake and its trench, drain bay and gate
// arm, the Still Pool, the cleft's pool and the Veil over its lip, the Gate's slot and bed, the leat on the crest and
// the Pass Bed, the Low River's gorge, the brooks, the guard, the rows of Blockages, and a shut channel's head held at
// its body's water (the Gate's bar, a level over the lake's sill, as §5.1 asks). This adds what is the gate's own:
//
// - the leat's bar: its head, up to its row of Blockages, two over its bed (the springs' sill + 1), the bar a player
//   blasts a level at a time (round 8: a trickle, then the springs' share); the shared head holds only the pool's level;
// - the Veil's foot a level under the sill, so it carries the fall sideways to the drain bay past the start's bench;
// - the first frame's lake beds raised to hold their water under two (§5.1), as stage 3 does on the lake stair (the
//   plan fixes the gate's start, so its frame is known at stage 1); the drought hold's floor stays outside the frame;
// - the gate's `land` invariants: the shared ones, `water.levels` read for a backwater (the Still Pool stands at its
//   lake's level through its inlet, not at a rim), the day-1 water leaving only by the gorge with the basin dry
//   (`gate.dry`), and the first frame's water shallow on stage 1's own beds (`frame.water`);
// - `gateFirstWater`, `draw.ts` `firstWater` with this stage: `PremiseDef` has no seam for a premise's own stage 1
//   yet (PREMISES §5.1 "As built (water)" says the edit it needs).
//
// Judged alone, stage 1's ground is 0 wherever nothing is drawn, and the gate's waters close a loop (the cleft, the
// leat, the Pass Bed, the notch, the Gate Bed, the slot, the lake): the guard round them fences the basin into a pit
// the pre-fill fills to its lowest guard. `gateSettleModel` stands the undrawn ground over every water (stage 2 lifts
// every tile to at least its guard), so a settle judges the water's own beds.

import { frameAt, openingCamera } from "../analysis/opening";
import type { MapSpec } from "../spec/mapspec";
import type { WaterModel } from "../sim/water";
import { PLAN_TRIES, failing, type Failure } from "./draw";
import { dayOneWater, START } from "./frame";
import { stageFlow, levelsOf, LEVEL_SLACK, WATER_CHECKS } from "./waterChecks";
import { stageModel, waterByNumber, type StageWater } from "./water";
import { guardWater } from "./raster/guard";
import { dist, pointAt, spineDist } from "./geom";
import { SHORE_STRAIGHT, straightShores } from "./gateShore";
import type { Invariant, InvariantResult, PremiseDef, PremisePlan } from "./types";
import type { GateNumbers } from "./premises/wallGate";

/** The deepest water in the first frame, but the drowned river's ribbon (§5.1: "the water in the first frame stays
 *  under two but for the row that carries the fall to the drain"; the lake stair's is 1.2, `frame.ts` `START`). */
export const FRAME_DEEP = 1.9;

const OK: InvariantResult = { ok: true };
const fail = (reason: string): InvariantResult => ({ ok: false, reason });
const gateOf = (plan: PremisePlan): GateNumbers | null => (plan as unknown as { gate?: GateNumbers }).gate ?? null;

/** The first row's start along a link (its tiles before it are the head), or null. */
function headEnd(w: StageWater, plan: PremisePlan, id: string): number | null {
  const row = w.raster.rows[id]?.[0];
  if (!row?.length) return null;
  const li = plan.links.findIndex((l) => l.id === id) + 1;
  let a = Infinity;
  for (const i of row) if (w.raster.channel[i] === li) a = Math.min(a, w.raster.along[i]);
  return a === Infinity ? null : a;
}

/** Stage 1 of a gate plan: the shared stage, then the leat's bar. Deterministic from the plan alone. */
export function gateWater(plan: PremisePlan): StageWater {
  const w = waterByNumber(plan);
  const g = gateOf(plan);
  if (!g) return w;
  const r = w.raster;
  const bars: [string, number][] = [
    [g.leat, g.leatBar],
    [g.gate, g.bar.level],
  ];
  let raised = false;
  for (const [id, level] of bars) {
    const end = headEnd(w, plan, id);
    if (end === null) continue;
    const li = plan.links.findIndex((l) => l.id === id) + 1;
    for (let i = 0; i < r.W * r.H; i++) {
      // (its tiles out of its body, before the row: inside the body the head is the body's water)
      if (r.channel[i] !== li || r.along[i] < 0 || r.along[i] >= end || r.heights[i] >= level) continue;
      r.heights[i] = level;
      r.surface[i] = NaN;
      r.fixed[i] = 1;
      raised = true;
    }
  }
  // the Veil's foot a level under the lake's sill, a level and a half of water (§5.1, round 8): it carries the whole
  // fall sideways to the drain bay past the start's bench, where the lake stair's shelf at the sill (a third of a
  // level deep, two rows) stood its water over the bench
  const veil = plan.links.findIndex((l) => l.id === g.veil) + 1;
  const lake = plan.bodies.find((b) => b.id === g.lake)!;
  // (and its outer row, the start's side, two under: the row that carries the fall to the drain, the drowned river's
  // ribbon, which the frame lets stand 2.5 deep; the start's 5 × 5 stands a row beyond it, so the foot cannot widen)
  const fb = toLocal(plan, g, g.runs[g.bastion].from)[1];
  for (let i = 0; i < r.W * r.H; i++) {
    if (r.pool[i] !== veil || r.crest[i]) continue;
    const outer = toLocal(plan, g, [(i % r.W) + 0.5, Math.floor(i / r.W) + 0.5])[1] < fb - 1;
    const bed = lake.sill - (outer ? 2 : 1);
    if (r.heights[i] > bed) r.heights[i] = bed;
    if (outer) r.ribbon[i] = 1;
  }
  // the first frame's water under two by its beds (§5.1: water deeper than two reads near black in the game), as stage
  // 3 makes the lake stair's: the plan fixed the start, so its frame is known here. A lake bed in the frame rises to
  // hold its water at most `FRAME_DEEP`; the drowned river's ribbon (the row that carries the fall to the drain), the
  // crests and the Veil's foot keep theirs
  const cam = openingCamera(plan.frame.start);
  for (let i = 0; i < r.W * r.H; i++) {
    if (!r.lake[i] || r.crest[i] || r.pool[i] || r.ribbon[i]) continue;
    const s = r.surface[i];
    if (!(s - r.heights[i] > FRAME_DEEP)) continue;
    const p = frameAt(cam, (i % r.W) + 0.5, Math.floor(i / r.W) + 0.5, s);
    if (!p || Math.abs(p.u) > 1 || Math.abs(p.v) > 1) continue;
    r.heights[i] = Math.ceil(s - FRAME_DEEP);
  }
  if (raised) guardWater(r);
  return w;
}

/** A body with no way out fed by one wet link from a body at its own sill: a backwater, standing at its feeder's
 *  level (the Still Pool), not a pond a work fills to its rim. */
function backwater(plan: PremisePlan, id: string): boolean {
  if (plan.links.some((l) => l.from === id)) return false;
  const ins = plan.links.filter((l) => l.to === id && l.wet);
  const b = plan.bodies.find((x) => x.id === id);
  return ins.length === 1 && !!b && plan.bodies.find((x) => x.id === ins[0].from)?.sill === b.sill;
}

/** `water.levels` (§2.2, the shared check's reading but for a backwater): each body's spill level within half a level
 *  of its sill; a pond a work fills, of its rim; a backwater, of its feeder's sill. */
const gateLevels: Invariant = {
  id: "water.levels",
  at: "land",
  test(ctx) {
    if (!ctx.water) throw new Error("A land invariant needs stage 1's water");
    for (const b of levelsOf(ctx.plan, ctx.water)) {
      const want = backwater(ctx.plan, b.id) ? b.sill : b.want;
      if (!b.tiles) return fail(`${b.id} has no water tiles`);
      if (b.high - want > LEVEL_SLACK || want - b.low > LEVEL_SLACK) return fail(`${b.id} stands at ${b.low}–${b.high}, its ${want === b.sill ? "sill" : "rim"} ${want}`);
    }
    return OK;
  },
};

/** `gate.dry` (§5.1: the basin dry, the Gate and the leat shut on day 1): by `flowThrough` on stage 1's water, no
 *  water runs down the Gate or the leat past their bars and rows, none stands or runs on the basin's side of the wall
 *  but in the cleft, and the only water that leaves the map leaves by the Low River. */
const gateDry: Invariant = {
  id: "gate.dry",
  at: "land",
  test(ctx) {
    const g = gateOf(ctx.plan);
    if (!g || !ctx.water) return fail("The plan has no wall with one gate");
    const r = ctx.water.raster;
    const { W, H } = r;
    const { path } = stageFlow(ctx.water);
    const li = (id: string) => ctx.plan.links.findIndex((l) => l.id === id) + 1;
    const [gate, leat, low] = [li(g.gate), li(g.leat), li(g.low)];
    const pool = ctx.plan.bodies.findIndex((b) => b.id === g.pool) + 1;
    const ends = [headEnd(ctx.water, ctx.plan, g.gate) ?? 0, headEnd(ctx.water, ctx.plan, g.leat) ?? 0];
    for (let i = 0; i < W * H; i++) {
      if (!path[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (r.channel[i] === gate && r.along[i] >= ends[0]) return fail(`Water runs down the Gate past its bar at ${x}, ${y}`);
      if (r.channel[i] === leat && r.along[i] >= ends[1]) return fail(`Water runs down the leat past its bar at ${x}, ${y}`);
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && r.channel[i] !== low) return fail(`Water leaves the map at ${x}, ${y}, not by the Low River`);
      if (r.lake[i] === pool || r.pool[i]) continue;
      if (basinSide(ctx.plan, g, x + 0.5, y + 0.5)) return fail(`Water stands in the basin at ${x}, ${y}`);
    }
    return OK;
  },
};

/** Whether a point stands past the wall's back, on the basin's side (local v over the crest band's top). */
function basinSide(plan: PremisePlan, g: GateNumbers, x: number, y: number): boolean {
  const [u, v] = toLocal(plan, g, [x, y]);
  for (const r of g.runs) {
    const a = toLocal(plan, g, r.from);
    const b = toLocal(plan, g, r.to);
    if (u >= Math.min(a[0], b[0]) && u < Math.max(a[0], b[0])) return v > a[1] + r.thick;
  }
  return false;
}

/** A map point in the plan's local frame (`premises/wallGate.ts`: u along the wall, v toward the basin). */
function toLocal(plan: PremisePlan, g: GateNumbers, [x, y]: [number, number]): [number, number] {
  const N = plan.W;
  const [u, v]: [number, number] = g.turn === 0 ? [x, y] : g.turn === 1 ? [N - y, x] : g.turn === 2 ? [N - x, N - y] : [y, N - x];
  return [g.mirror ? N - u : u, v];
}

/** `frame.water` (§4.3, §5.1), on stage 1's own beds: 85 % of the day-1 water inside the first frame under two deep
 *  (`FRAME_DEEP`; the drowned river's ribbon 2.5). */
const frameWater: Invariant = {
  id: "frame.water",
  at: "land",
  test(ctx) {
    if (!ctx.water) throw new Error("A land invariant needs stage 1's water");
    const { shallow, all } = frameShallow(ctx.plan, ctx.water);
    if (all && shallow / all < START.shallowShare) return fail(`${Math.round((100 * shallow) / all)} % of the first frame's water is ${FRAME_DEEP} deep or less (${100 * START.shallowShare} % asked)`);
    return OK;
  },
};

/** The first frame's day-1 water tiles on stage 1's beds, and how many are shallow. */
export function frameShallow(plan: PremisePlan, w: StageWater): { shallow: number; all: number } {
  const r = w.raster;
  const depth = dayOneWater(plan, w, r.heights);
  const s = plan.frame.start;
  const cam = openingCamera(s);
  let all = 0;
  let shallow = 0;
  for (let i = 0; i < depth.length; i++) {
    if (!depth[i]) continue;
    const p = frameAt(cam, (i % r.W) + 0.5, Math.floor(i / r.W) + 0.5, r.heights[i] + depth[i]);
    if (!p || Math.abs(p.u) > 1 || Math.abs(p.v) > 1) continue;
    all++;
    if (depth[i] <= (r.ribbon[i] ? START.ribbon : FRAME_DEEP) + 1e-9) shallow++;
  }
  return { shallow, all };
}

/** `lake.shore` (planning 2026-11-11: "the water is canals"): Wall Lake has two bays or more, each reaching 4 or more
 *  past its main arm; its main arm's width swings two-fold or more along it; and no stretch of its shore runs straight
 *  for more than `SHORE_STRAIGHT` tiles, the Veil's trench, the Gate's arm and the Low River's lip (the works' sites)
 *  aside. Read on stage 1's water. */
const lakeShore: Invariant = {
  id: "lake.shore",
  at: "land",
  test(ctx) {
    const g = gateOf(ctx.plan);
    if (!g || !ctx.water) return fail("The plan has no wall with one gate");
    const r = ctx.water.raster;
    const { W, H } = r;
    const k = ctx.plan.bodies.findIndex((b) => b.id === g.lake);
    const lake = ctx.plan.bodies[k];
    const [main, trench, gateArm, ...rest] = lake.arms;
    // (the bays: the arms after the Gate's that run off the main arm; the one-point arms are the shore's points)
    const bays = rest.filter((b) => b.length > 1);
    const deep = bays.filter((b) => spineDist(b[b.length - 1][0], b[b.length - 1][1], main) >= BAY_REACH);
    if (deep.length < 2) return fail(`${ctx.plan.names[g.lake] ?? g.lake} has ${deep.length} bays (two or more)`);
    // (the main arm's width across it, every 3 tiles along it, its ends aside)
    const widths: number[] = [];
    let len = 0;
    for (let q = 0; q + 1 < main.length; q++) len += dist([main[q][0], main[q][1]], [main[q + 1][0], main[q + 1][1]]);
    const path = main.map((p) => [p[0], p[1]] as [number, number]);
    for (let t = 6; t < len - 6; t += 3) {
      const { p, dir } = pointAt(path, t);
      let w = 0;
      for (const side of [1, -1])
        for (let o = side > 0 ? 0 : 1; o < 40; o++) {
          const x = Math.floor(p[0] - dir[1] * o * side);
          const y = Math.floor(p[1] + dir[0] * o * side);
          if (x < 0 || y < 0 || x >= W || y >= H || r.lake[y * W + x] !== k + 1) break;
          w++;
        }
      if (w) widths.push(w);
    }
    if (widths.length >= 3 && Math.max(...widths) < 2 * Math.min(...widths)) return fail(`${ctx.plan.names[g.lake] ?? g.lake}'s main arm is ${Math.min(...widths)} to ${Math.max(...widths)} wide (its width swings two-fold or more)`);
    // (no straight shore: a run of shore tiles facing one way along one row or column; the Veil's trench under the lip
    // and the Gate's foot are works' sites, the drain bay's leg and the Gate's arm down to the lake are not)
    const gateEnd = gateArm[gateArm.length - 1];
    const aside = (i: number) => {
      const x = (i % W) + 0.5;
      const y = Math.floor(i / W) + 0.5;
      return spineDist(x, y, trench.slice(0, 4)) < 3 || dist([x, y], [gateEnd[0], gateEnd[1]]) < GATE_SITE || (r.lips[g.low] ?? []).some((j) => Math.abs((j % W) - (i % W)) + Math.abs(Math.floor(j / W) - Math.floor(i / W)) <= 4);
    };
    const runs = straightShores(W, H, [0, 0, W - 1, H - 1], (i) => r.lake[i] === k + 1, (i) => !!r.lake[i] || !!r.channel[i], aside);
    if (runs.length) return fail(`${ctx.plan.names[g.lake] ?? g.lake}'s shore runs straight for ${runs[0].len} tiles at ${runs[0].x}, ${runs[0].y} (${SHORE_STRAIGHT} at most)`);
    return OK;
  },
};
/** How far a bay reaches past the main arm's outline, at the least; the longest straight shore. */
const BAY_REACH = 4;
/** How far from the Gate's arm's end its shore is the Gate's site. */
const GATE_SITE = 7;

/** The gate's `land` invariants: the shared ones, `water.levels` read for a backwater, `gate.dry`, `frame.water` and
 *  `lake.shore`. */
export const GATE_WATER_CHECKS: Invariant[] = [...WATER_CHECKS.map((inv) => (inv.id === "water.levels" ? gateLevels : inv)), gateDry, frameWater, lakeShore];

/** `draw.ts` `firstWater` with the gate's stage 1: the first plan of a spec whose `plan` and `land` invariants hold,
 *  with the attempt it took, its water, and the attempts' failures before it. */
export function gateFirstWater(def: PremiseDef, spec: MapSpec): { plan: PremisePlan; water: StageWater; attempt: number; failed: Failure[] } | { reason: string } {
  const why = def.eligible(spec);
  if (why) return { reason: why };
  let last = "";
  const failed: Failure[] = [];
  for (let attempt = 0; attempt < PLAN_TRIES; attempt++) {
    const plan = def.draw(spec, attempt);
    if ("reason" in plan) {
      last = plan.reason;
      continue;
    }
    const pf = failing(def.invariants, "plan", { spec, plan });
    if (pf.length) {
      last = `${pf[0].id}: ${pf[0].reason}`;
      continue;
    }
    const water = gateWater(plan);
    const land = failing(def.invariants, "land", { spec, plan, water });
    if (!land.length) return { plan, water, attempt, failed };
    failed.push(land[0]);
    last = `${land[0].id}: ${land[0].reason}`;
  }
  return { reason: `No ${def.id} plan's water held in ${PLAN_TRIES} tries (${last})` };
}

/** Stage 1's water model for a settle (`water.ts` `stageModel`, rows shut), with the ground stage 1 did not draw
 *  standing over every water: the land is stage 2's, which lifts every tile to at least its guard. */
export function gateSettleModel(w: StageWater, top: number): WaterModel {
  const m = stageModel(w);
  const r = w.raster;
  for (let i = 0; i < m.floor.length; i++) if (!r.fixed[i] && !r.lake[i] && !r.channel[i] && !r.pool[i] && r.heights[i] === 0) m.floor[i] = top;
  return m;
}

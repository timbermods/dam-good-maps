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
// - the gate's `land` invariants: the shared ones (the Still Pool is a `Body.backwater`: it stands at its lake's level
//   through its inlet, read at its sill, not at a rim), the day-1 water leaving only by the gorge with the basin dry
//   (`gate.dry`), and the first frame's water shallow on stage 1's own beds (`frame.water`).
// `wallGate`'s `PremiseDef.water` is `gateWater`, so `draw.ts` `firstWater` draws its plans with this stage.
//
// Judged alone, stage 1's ground is 0 wherever nothing is drawn, and the gate's waters close a loop (the cleft, the
// leat, the Pass Bed, the notch, the Gate Bed, the slot, the lake): the guard round them fences the basin into a pit
// the pre-fill fills to its lowest guard. `gateSettleModel` stands the undrawn ground over every water (stage 2 lifts
// every tile to at least its guard), so a settle judges the water's own beds.

import { frameAt, openingCamera } from "../analysis/opening";
import type { WaterModel } from "../sim/water";
import { dayOneWater, START } from "./frame";
import { stageFlow, WATER_CHECKS } from "./waterChecks";
import { stageModel, waterByNumber, type StageWater } from "./water";
import { guardWater } from "./raster/guard";
import type { Invariant, InvariantResult, PremisePlan } from "./types";
import type { GateNumbers } from "./premises/wallGate";
import { rangeAt } from "./gateRange";

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

/** The plunge pool's level (planning's ruling of 2026-11-12: the table was written for a lake at a sill, not a pool
 *  under a fall): the pool leaves over a low lip into its brook, whose water on its own bed stands over the lip's crest
 *  (the brook's depth, `bedDepth`, from its bed: its width sets it), so the lip is drowned and the pool stands the
 *  lip's head over the brook's water, not over the crest. The table's level and the pool's planned surface are set so;
 *  the shared table (`levels.ts`, the lake stair's too) is left as it is. */
function plungePool(plan: PremisePlan, w: StageWater): void {
  const g = gateOf(plan);
  if (!g) return;
  const door = plan.bodies.find((b) => b.id === g.door);
  const out = plan.links.find((l) => l.from === g.door && l.fall);
  if (!door || !out) return;
  const t = w.table.bodies[door.id];
  const lf = w.table.links[out.id];
  if (!t || !lf) return;
  const head = Math.max(0, t.level - out.fall!.crest);
  // (the water it falls into: its own reach's bed (the one under the lip) and depth, or the body it runs into,
  // whichever stands higher)
  const below = w.table.bodies[out.to]?.level ?? -Infinity;
  const tail = Math.max(Array.isArray(out.bed) ? out.bed[0] + lf.bedDepth : -Infinity, below);
  const level = Math.max(t.level, tail + head);
  if (level === t.level) return;
  t.level = level;
  const r = w.raster;
  const di = plan.bodies.indexOf(door) + 1;
  for (let i = 0; i < r.W * r.H; i++) if (r.lake[i] === di && !Number.isNaN(r.surface[i])) r.surface[i] = level;
}

/** Stage 1 of a gate plan: the shared stage, then the leat's bar. Deterministic from the plan alone. */
export function gateWater(plan: PremisePlan): StageWater {
  const w = waterByNumber(plan);
  const g = gateOf(plan);
  if (!g) return w;
  const r = w.raster;
  plungePool(plan, w);
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
  // the Gate's bar stands across its wadi strips too, where they meet the lake (a strip a level over the bed lay under
  // the lake's water with the lake a level lower, and the lake ran round the bar into the channel)
  {
    const gi = plan.links.findIndex((l) => l.id === g.gate) + 1;
    const end = headEnd(w, plan, g.gate);
    if (end !== null) {
      const W = r.W;
      for (let i = 0; i < r.W * r.H; i++) {
        if (r.channel[i] !== gi || r.along[i] > end + 3) continue;
        const x = i % W;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx;
            const j = i + dy * W + dx;
            if (xx < 0 || xx >= W || j < 0 || j >= r.W * r.H || !r.fixed[j] || r.lake[j] || r.channel[j] || r.pool[j] || r.crest[j]) continue;
            if (r.heights[j] < g.bar.level) {
              r.heights[j] = g.bar.level;
              raised = true;
            }
          }
      }
    }
  }
  // the Veil's foot a level under the plunge pool's sill, a level and a half of water (§5.1, round 8): it carries the whole
  // fall sideways to the drain bay past the start's bench, where the lake stair's shelf at the sill (a third of a
  // level deep, two rows) stood its water over the bench
  const veil = plan.links.findIndex((l) => l.id === g.veil) + 1;
  const lake = plan.bodies.find((b) => b.id === g.door)!;
  // (and its outer row, the start's side, two under: the row that carries the fall to the drain, the drowned river's
  // ribbon, which the frame lets stand 2.5 deep; the start's 5 × 5 stands a row beyond it, so the foot cannot widen)
  const fb = g.face;
  for (let i = 0; i < r.W * r.H; i++) {
    if (r.pool[i] !== veil || r.crest[i]) continue;
    const outer = toLocal(plan, g, [(i % r.W) + 0.5, Math.floor(i / r.W) + 0.5])[1] < fb - 1;
    // (never deeper than the frame lets it stand on the plunge pool's own level: its brook's head stands it over its sill)
    const level = w.table.bodies[lake.id]?.level ?? lake.sill;
    const bed = Math.max(lake.sill - (outer ? 2 : 1), Math.ceil(level - (outer ? START.ribbon : FRAME_DEEP) - 1e-9));
    if (r.heights[i] > bed) r.heights[i] = bed;
    if (outer) r.ribbon[i] = 1;
  }
  // the first frame's water under two by its beds (§5.1: water deeper than two reads near black in the game), as stage
  // 3 makes the lake stair's: the plan fixed the start, so its frame is known here. A lake bed in the frame rises to
  // hold its water at most `FRAME_DEEP`; the drowned river's ribbon (the row that carries the fall to the drain), the
  // crests and the Veil's foot keep theirs
  const cam = openingCamera(plan.frame.start);
  const outflow = plan.links.findIndex((l) => l.id === "outflow") + 1 || -1;
  for (let i = 0; i < r.W * r.H; i++) {
    // (and the plunge pool's brook's bed, where it runs in the frame)
    // (the ribbon to its own 2.5: the plunge pool's brook's head stands its water over the sill, and the ribbon two under
    // it stood deeper)
    if ((!r.lake[i] && r.channel[i] !== outflow) || r.crest[i] || r.pool[i]) continue;
    const s = r.surface[i];
    const most = r.ribbon[i] ? START.ribbon : FRAME_DEEP;
    if (!(s - r.heights[i] > most)) continue;
    const p = frameAt(cam, (i % r.W) + 0.5, Math.floor(i / r.W) + 0.5, s);
    if (!p || Math.abs(p.u) > 1 || Math.abs(p.v) > 1) continue;
    r.heights[i] = Math.ceil(s - most);
  }
  if (raised) guardWater(r);
  return w;
}

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
    const [gate, leat, low, veil] = [li(g.gate), li(g.leat), li(g.low), li(g.veil)];
    const pool = ctx.plan.bodies.findIndex((b) => b.id === g.pool) + 1;
    const ends = [headEnd(ctx.water, ctx.plan, g.gate) ?? 0, headEnd(ctx.water, ctx.plan, g.leat) ?? 0];
    for (let i = 0; i < W * H; i++) {
      if (!path[i]) continue;
      const x = i % W;
      const y = (i - x) / W;
      if (r.channel[i] === gate && r.along[i] >= ends[0]) return fail(`Water runs down the Gate past its bar at ${x}, ${y}`);
      if (r.channel[i] === leat && r.along[i] >= ends[1]) return fail(`Water runs down the leat past its bar at ${x}, ${y}`);
      if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && r.channel[i] !== low) return fail(`Water leaves the map at ${x}, ${y}, not by the Low River`);
      // (the cleft, its Veil's mouth to the lip, and the fall's pool are the range's own water)
      if (r.lake[i] === pool || r.pool[i] || r.channel[i] === veil) continue;
      if (basinSide(ctx.plan, g, x + 0.5, y + 0.5)) return fail(`Water stands in the basin at ${x}, ${y}`);
    }
    return OK;
  },
};

/** Whether a point stands past the range's crest line, on the basin's side (two tiles past its spine). */
function basinSide(plan: PremisePlan, g: GateNumbers, x: number, y: number): boolean {
  const [u, v] = toLocal(plan, g, [x, y]);
  return v > rangeAt(g.range, u).v + 2;
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

/** The gate's `land` invariants: the shared ones (the Still Pool a `Body.backwater`, read at its sill), `gate.dry` and
 *  `frame.water`. */
export const GATE_WATER_CHECKS: Invariant[] = [...WATER_CHECKS, gateDry, frameWater];

/** Stage 1's water model for a settle (`water.ts` `stageModel`, rows shut), with the ground stage 1 did not draw
 *  standing over every water: the land is stage 2's, which lifts every tile to at least its guard. */
export function gateSettleModel(w: StageWater, top: number): WaterModel {
  const m = stageModel(w);
  const r = w.raster;
  for (let i = 0; i < m.floor.length; i++) if (!r.fixed[i] && !r.lake[i] && !r.channel[i] && !r.pool[i] && r.heights[i] === 0) m.floor[i] = top;
  return m;
}

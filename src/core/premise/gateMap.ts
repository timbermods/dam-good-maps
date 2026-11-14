// The wall with one gate's map (docs/PREMISES.md §5.1): its stages 0 to 3 and the shared map's build, as the
// generator's mode (`generate.ts` `generatePremise`) runs the lake stair's: its own loop until the Gate is offered and
// the mode builds it through the seams (§5.1 "As built (water)"). The plan and its water (`gateWater.ts` `gateWater`), the land
// (`gateLand.ts`), its land invariants, stage 3's start for the first frame (`frame.ts` `checkFrame`, with the shared
// rules' needs as the mode asks them), and one build with its checks (`map.ts` `premiseMap`, stages 5 and 6). The works
// (stage 4) are not laid yet: the ladder is the plan's, read on this land by `ladder.ts` `ladderOf` as the mode does.

import type { MapSpec } from "../spec/mapspec";
import { rulesFor } from "../validate/playability";
import { ruledLand, waterReaches, wetOf } from "../validate/ruledLand";
import { checkFrame, type FrameCheck } from "./frame";
import { gateLand, gateLandFailures } from "./gateLand";
import { gateWater } from "./gateWater";
import { failing, PLAN_TRIES } from "./draw";
import { gateOf, onLocal, sideOf, turnOf } from "./premises/wallGate";
import { gateCard, gateDamWords, megadamHolds, gateLadder, gateWorksFailures, type GateCard } from "./gateWorks";
import type { Ladder } from "./ladder";
import { premiseMap, type PremiseLand, type PremiseMap } from "./map";
import { wallGate } from "./premises/wallGate";
import type { StyleTheme } from "./choice";
import { premiseStyle } from "./style";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";

export interface GateMap {
  plan: PremisePlan;
  water: StageWater;
  land: PremiseLand;
  /** The land invariants the ground fails (`gateLand.ts` `GATE_LAND_CHECKS`), each with its line. */
  landFails: { id: string; reason: string }[];
  frame: FrameCheck;
  /** Stage 4: the ladder on this land (`gateWorks.ts` `gateLadder`), and the map card's words. */
  ladder: Ladder;
  card: GateCard;
  /** The works invariants the ladder fails (`gateWorks.ts` `GATE_WORKS_CHECKS`). */
  worksFails: { id: string; reason: string }[];
  /** The built map and its checks; absent when stage 3 found no start. */
  map?: PremiseMap;
  attempt: number;
}

/** The start's numbers planning asks every map report to open with (#236, 6800513400; D515's `START_FLOORS`: the bench,
 *  walkable land, wood, the fast wood's share, the forester's plot, farmland; and the wood's floor, the walk to clean
 *  water and the berries, as the brooks' round's report asks), from the map's checks: each check's value, its limit
 *  and whether it passed. */
export const START_CHECKS = ["start.level_land", "start.reach", "start.wood", "start.wood_fast", "start.wood_floor", "start.water", "start.food", "start.forester", "start.farmland"] as const;

export function startNumbers(m: PremiseMap): Record<(typeof START_CHECKS)[number], { value: number; limit: number; ok: boolean }> {
  const out = {} as Record<(typeof START_CHECKS)[number], { value: number; limit: number; ok: boolean }>;
  for (const id of START_CHECKS) {
    const c = m.report.checks.find((x) => x.id === id) as { value?: number; limit?: number; ok: boolean } | undefined;
    out[id] = { value: c?.value ?? NaN, limit: c?.limit ?? NaN, ok: !!c?.ok };
  }
  return out;
}

/** How much of the valley lies by its water (planning's ruling on the brooks: reported with every sheet, so a valley
 *  the brooks water from end to end is seen): of the dry ground on the valley's side of the range's foot, the share
 *  within `VALLEY_BY_WATER` tiles of settled water; and the same of its floor alone, the ground no higher than the
 *  start's bench. */
export const VALLEY_BY_WATER = 3;

export function valleyByWater(plan: PremisePlan, built: { W: number; H: number; heights: ArrayLike<number>; settle: { depth: ArrayLike<number> } }): { valley: number; floor: number; floorTiles: number } {
  const g = gateOf(plan)!;
  const T = turnOf(plan, g);
  const { W, H } = built;
  const wet = wetOf(built.settle.depth);
  const by = new Uint8Array(W * H);
  const R = VALLEY_BY_WATER;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!wet[y * W + x]) continue;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (dx * dx + dy * dy <= R * R && xx >= 0 && yy >= 0 && xx < W && yy < H) by[yy * W + xx] = 1;
        }
    }
  const bench = plan.frame.start.z;
  const n = [0, 0, 0, 0];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [u, v] = onLocal(T, [x + 0.5, y + 0.5]);
      if (wet[i] || sideOf(g.range, u, v) !== 0) continue;
      n[0]++;
      n[1] += by[i];
      if (built.heights[i] <= bench) {
        n[2]++;
        n[3] += by[i];
      }
    }
  return { valley: n[0] ? n[1] / n[0] : 0, floor: n[2] ? n[3] / n[2] : 0, floorTiles: n[2] };
}

/** How many settles a gate map may cost before it gives up (the mode's `PREMISE_SETTLES`). */
export const GATE_SETTLES = 3;

/** `veil.settled` (§5.1, planning's ruling: the Veil drops its height less 0.5): on the map's settled water, the median
 *  water surface over the Veil's lip less the median over its foot. */
export function veilDrop(plan: PremisePlan, water: StageWater, heights: ArrayLike<number>, depth: ArrayLike<number>): number {
  const r = water.raster;
  const g = gateOf(plan)!;
  const li = plan.links.findIndex((l) => l.id === g.veil) + 1;
  const med = (v: number[]) => (v.sort((a, b) => a - b), v.length ? v[v.length >> 1] : NaN);
  const lip = med((r.lips[g.veil] ?? []).map((i) => heights[i] + depth[i]));
  const foot: number[] = [];
  for (let i = 0; i < r.pool.length; i++) if (r.pool[i] === li && depth[i] > 0.05) foot.push(heights[i] + depth[i]);
  return lip - med(foot);
}
export const VEIL_SHORT = 0.5;

/** `gate.settled`: the Gate's channel tiles past its second row of Blockages that hold water on the settled map. */
export function gateWetPast(plan: PremisePlan, water: StageWater, depth: ArrayLike<number>): number {
  const g = gateOf(plan)!;
  const li = plan.links.findIndex((l) => l.id === g.gate) + 1;
  const past = Math.max(...(plan.links[li - 1]?.rows ?? [0])) + 1;
  const r = water.raster;
  let n = 0;
  for (let i = 0; i < r.channel.length; i++) if (r.channel[i] === li && r.along[i] > past && depth[i] > 0.05) n++;
  return n;
}
const GATE_WET_MOST = 0;

/** A gate map for a spec, in a theme's style (River Valley by default): the first plan, as the mode draws them, whose
 *  water, land and start hold and whose map passes every blocking check with its Veil pouring (at most `GATE_SETTLES`
 *  builds); or why none did. `failed` lists each refused plan's reason. */
/** The longest straight even reach of water a Gate map may hold, tiles (planning's ruling of the wander round). */
export const GATE_REACH = 40;

/** Of a channel that runs off the map, stage 1's water counts this many tiles past its head (the Low River's lip). */
const OFF_LIP = 6;

/** Stage 1's water as tiles: the bodies that hold water and the wet channels between them. A channel that runs off the
 *  map (the Low River, the bypass) counts its first `OFF_LIP` tiles only, its lip at the lake's end: past it the plan
 *  lays a gorge five wide and straight, 60 to 86 tiles of it at 192² and 256², and the settled map shows no such reach
 *  there. */
export function planWet(plan: PremisePlan, water: StageWater): Uint8Array {
  const r = water.raster;
  const wet = new Uint8Array(r.W * r.H);
  const off = new Set(plan.exits.map((e) => e.id));
  for (let i = 0; i < wet.length; i++) {
    if (r.lake[i]) wet[i] = water.table.bodies[plan.bodies[r.lake[i] - 1].id]?.dry ? 0 : 1;
    else if (r.channel[i]) {
      const link = plan.links[r.channel[i] - 1];
      const lf = water.table.links[link.id];
      // (a dry bed a wet link joins is wet from the join down)
      wet[i] = lf?.wet && r.along[i] >= (lf.wetFrom ?? -Infinity) && (r.along[i] <= OFF_LIP || !off.has(link.to)) ? 1 : 0;
    }
  }
  return wet;
}

export function gateMap(spec: MapSpec, theme: StyleTheme = "riverValley"): (GateMap & { failed: string[]; held: boolean }) | { reason: string } {
  const why = wallGate.eligible(spec);
  if (why) return { reason: why };
  const rules = rulesFor(spec);
  const failed: string[] = [];
  let settles = 0;
  let last: (GateMap & { failed: string[]; held: boolean }) | null = null;
  for (let attempt = 0; attempt < PLAN_TRIES && settles < GATE_SETTLES; attempt++) {
    const plan = wallGate.draw(spec, attempt);
    if ("reason" in plan) {
      failed.push(plan.reason);
      continue;
    }
    const pf = failing(wallGate.invariants, "plan", { spec, plan });
    if (pf.length) {
      failed.push(`${pf[0].id}: ${pf[0].reason}`);
      continue;
    }
    const water = gateWater(plan);
    const wf = failing(wallGate.invariants, "land", { spec, plan, water });
    if (wf.length) {
      failed.push(`${wf[0].id}: ${wf[0].reason}`);
      continue;
    }
    // (no straight even reach on the plan's own water either, the channels that run off the map past their lips left out: the settled
    // map's lie where stage 1's do (the lake's end before the Low River's lip, as wide as the lip; a trunk five wide),
    // so a plan refused here costs no land and no settle. The settled map is read again below)
    const laid = waterReaches(planWet(plan, water), plan.W, plan.H).worst;
    if (laid && laid.tiles > GATE_REACH) {
      failed.push(`water.straight: a straight even reach of ${laid.tiles} tiles of the plan's water at ${laid.x}, ${laid.y} (${GATE_REACH} at most)`);
      continue;
    }
    const style = premiseStyle(theme, spec, attempt);
    const land = gateLand(plan, water, style.relief);
    const landFails = gateLandFailures({ spec, plan, water, heights: land.heights });
    if (landFails.length) {
      failed.push(`${landFails[0].id}: ${landFails[0].reason}`);
      continue;
    }
    const frame = checkFrame(plan, water, land.heights, { bench: rules.levelLand, moist: rules.farmland + rules.forester, reach: rules.reachMin });
    if (frame.reason) {
      failed.push(`frame.start: ${frame.reason}`);
      continue;
    }
    const ladder = gateLadder(plan, water, land.heights);
    const worksFails = gateWorksFailures({ plan, water, heights: land.heights, ladder });
    // (a work with no site on the land: the plan is drawn again, never the land forced for it)
    const unsited = worksFails.find((f) => f.id === "works.sites");
    if (unsited) {
      failed.push(`${unsited.id}: ${unsited.reason}`);
      continue;
    }
    const out = { plan, water, land, landFails, frame, ladder, card: gateCard(plan, theme, ladder), worksFails, attempt, failed };
    const s: MapSpec = { ...JSON.parse(JSON.stringify(spec)), accepted: { attempt, candidate: 0 } };
    settles++;
    const map = premiseMap(s, plan, land, frame.start, ladder, style);
    last = { ...out, map, held: false };
    if (!map.report.passed) {
      const c = map.report.checks.find((x) => !x.ok && x.severity === "error");
      failed.push(`${c?.id}: ${c?.message}`);
      continue;
    }
    // (the Gate shut on day 1: settled, no water past its rows; the basin's dryness is the premise's promise)
    const wetGate = gateWetPast(plan, water, map.built.settle.depth);
    if (wetGate > GATE_WET_MOST) {
      failed.push(`gate.settled: ${wetGate} tiles of the Gate hold water past its rows settled`);
      continue;
    }
    const drop = veilDrop(plan, water, map.built.heights, map.built.settle.depth);
    const want = (plan.links.find((l) => l.id === gateOf(plan)!.veil)?.fall?.height ?? 0) - VEIL_SHORT;
    if (!(drop >= want)) {
      failed.push(`veil.settled: the Veil drops ${drop.toFixed(2)} settled (${want} or more)`);
      continue;
    }
    // (what the megadam buys, in days of drought, on the settled map's own land and objects)
    // (a megadam whose valley at its water walks round the spur's end to the map's edge buys nothing: the plan is drawn
    // again; 3 of 12 maps at 256² were so before the spur ran to 0.16 of the side)
    // (no water lies as a straight even reach of more than `GATE_REACH` tiles (planning's ruling on the brooks: a trunk that
    // still cannot bend is refused and another plan drawn, nothing eased)
    const reach = ruledLand(map.built.heights, wetOf(map.built.settle.depth), map.built.W, map.built.H).channel;
    if (reach && reach.tiles > GATE_REACH) {
      failed.push(`water.straight: a straight even reach of ${reach.tiles} tiles of water at ${reach.x}, ${reach.y} (${GATE_REACH} at most)`);
      continue;
    }
    const days = megadamHolds(plan, water, ladder, map.built.waterModel);
    if ("reason" in days) {
      failed.push(days.reason);
      continue;
    }
    return { ...out, card: { ...out.card, dam: gateDamWords(plan, days) }, map, held: true };
  }
  if (last) return last;
  // (each refusal's check and how often, then the last in full)
  const tally = new Map<string, number>();
  for (const f of failed) {
    const id = f.startsWith("No ") ? "layout" : f.split(":")[0];
    tally.set(id, (tally.get(id) ?? 0) + 1);
  }
  return { reason: `No wallGate map held in ${failed.length} plans and ${settles} settles (${[...tally].map(([k, n]) => `${k} ${n}`).join(", ")}; the last: ${failed[failed.length - 1] ?? ""})` };
}

// The wall with one gate's map (docs/PREMISES.md §5.1): its stages 0 to 3 and the shared map's build, as the
// generator's mode (`generate.ts` `generatePremise`) runs the lake stair's, until the mode can take a premise's own
// stages (§5.1 "As built (relief)" says the edits). The plan and its water (`gateWater.ts` `gateFirstWater`), the land
// (`gateLand.ts`), its land invariants, stage 3's start for the first frame (`frame.ts` `checkFrame`, with the shared
// rules' needs as the mode asks them), and one build with its checks (`map.ts` `premiseMap`, stages 5 and 6). The works
// (stage 4) are not laid yet: the ladder is the plan's, read on this land by `ladder.ts` `ladderOf` as the mode does.

import type { MapSpec } from "../spec/mapspec";
import { rulesFor } from "../validate/playability";
import { checkFrame, type FrameCheck } from "./frame";
import { gateLand, gateLandFailures } from "./gateLand";
import { gateWater } from "./gateWater";
import { failing, PLAN_TRIES } from "./draw";
import { gateOf } from "./premises/wallGate";
import { gateCard, gateLadder, gateWorksFailures } from "./gateWorks";
import type { PremiseCard } from "./card";
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
  card: PremiseCard;
  /** The works invariants the ladder fails (`gateWorks.ts` `GATE_WORKS_CHECKS`). */
  worksFails: { id: string; reason: string }[];
  /** The built map and its checks; absent when stage 3 found no start. */
  map?: PremiseMap;
  attempt: number;
}

/** The start's numbers planning asks every map report to open with (#236, 6800513400; D515's `START_FLOORS`: the bench,
 *  walkable land, wood, the fast wood's share, the forester's plot, farmland), from the map's checks:
 *  each check's value, its limit and whether it passed. */
export const START_CHECKS = ["start.level_land", "start.reach", "start.wood", "start.wood_fast", "start.forester", "start.farmland"] as const;

export function startNumbers(m: PremiseMap): Record<(typeof START_CHECKS)[number], { value: number; limit: number; ok: boolean }> {
  const out = {} as Record<(typeof START_CHECKS)[number], { value: number; limit: number; ok: boolean }>;
  for (const id of START_CHECKS) {
    const c = m.report.checks.find((x) => x.id === id) as { value?: number; limit?: number; ok: boolean } | undefined;
    out[id] = { value: c?.value ?? NaN, limit: c?.limit ?? NaN, ok: !!c?.ok };
  }
  return out;
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

/** A gate map for a spec, in a theme's style (River Valley by default): the first plan, as the mode draws them, whose
 *  water, land and start hold and whose map passes every blocking check with its Veil pouring (at most `GATE_SETTLES`
 *  builds); or why none did. `failed` lists each refused plan's reason. */
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
    const out = { plan, water, land, landFails, frame, ladder, card: gateCard(plan, theme, ladder), worksFails: gateWorksFailures({ plan, water, heights: land.heights, ladder }), attempt, failed };
    const s: MapSpec = { ...JSON.parse(JSON.stringify(spec)), accepted: { attempt, candidate: 0 } };
    settles++;
    const map = premiseMap(s, plan, land, frame.start, ladder, style);
    last = { ...out, map, held: false };
    if (!map.report.passed) {
      const c = map.report.checks.find((x) => !x.ok && x.severity === "error");
      failed.push(`${c?.id}: ${c?.message}`);
      continue;
    }
    const drop = veilDrop(plan, water, map.built.heights, map.built.settle.depth);
    const want = (plan.links.find((l) => l.id === gateOf(plan)!.veil)?.fall?.height ?? 0) - VEIL_SHORT;
    if (!(drop >= want)) {
      failed.push(`veil.settled: the Veil drops ${drop.toFixed(2)} settled (${want} or more)`);
      continue;
    }
    return { ...out, map, held: true };
  }
  if (last) return last;
  return { reason: `No wallGate map held in ${failed.length} plans and ${settles} settles (${failed[failed.length - 1] ?? ""})` };
}

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
import { gateFirstWater } from "./gateWater";
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
  /** The built map and its checks; absent when stage 3 found no start. */
  map?: PremiseMap;
  attempt: number;
}

/** The start's five numbers planning asks every map report to open with (#236, 6800513400), from the map's checks:
 *  each check's value, its limit and whether it passed. */
export const START_CHECKS = ["start.level_land", "start.farmland", "start.wood", "start.wood_floor", "start.reach"] as const;

export function startNumbers(m: PremiseMap): Record<(typeof START_CHECKS)[number], { value: number; limit: number; ok: boolean }> {
  const out = {} as Record<(typeof START_CHECKS)[number], { value: number; limit: number; ok: boolean }>;
  for (const id of START_CHECKS) {
    const c = m.report.checks.find((x) => x.id === id) as { value?: number; limit?: number; ok: boolean } | undefined;
    out[id] = { value: c?.value ?? NaN, limit: c?.limit ?? NaN, ok: !!c?.ok };
  }
  return out;
}

/** A gate map for a spec, in a theme's style (River Valley by default), or why no plan's water held. */
export function gateMap(spec: MapSpec, theme: StyleTheme = "riverValley"): GateMap | { reason: string } {
  const r = gateFirstWater(wallGate, spec);
  if ("reason" in r) return r;
  const style = premiseStyle(theme, spec, r.attempt);
  const land = gateLand(r.plan, r.water, style.relief);
  const landFails = gateLandFailures({ spec, plan: r.plan, water: r.water, heights: land.heights });
  const rules = rulesFor(spec);
  const frame = checkFrame(r.plan, r.water, land.heights, { level: rules.levelLand, farmland: rules.farmland });
  const out: GateMap = { plan: r.plan, water: r.water, land, landFails, frame, attempt: r.attempt };
  if (frame.reason) return out;
  const s: MapSpec = { ...JSON.parse(JSON.stringify(spec)), accepted: { attempt: r.attempt, candidate: 0 } };
  out.map = premiseMap(s, r.plan, land, frame.start, undefined, style);
  return out;
}

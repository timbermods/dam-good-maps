// What a premise map's water holds through the difficulty's longest drought (docs/PREMISES.md §4.4 `drought.lakes`):
// the settled water run day by day as the editor's Drought view runs it (`HazardRun`), each lake's volume (its stage 1
// tiles) at its worst day, and the day the start's water goes (D133's rule, `StartWaterDays`). Headless; the
// premise-map tool prints it and premiseMap.test.ts holds the rule. Generation gates the start's water with
// `startWaterGate` (PREMISES §2.2 stage 8): the same rule, the run cut short where the analytic drought vouches.

import { PUMP_CLEAN, tileShoreWalk } from "../analysis/walk";
import type { BuildResult } from "../features/build";
import { droughtStorage } from "../sim/drought";
import { startWalk } from "../sim/droughtLine";
import { StartWaterDays } from "../sim/startWaterDay";
import { TICKS_PER_DAY } from "../sim/water";
import { HazardRun, hazardDays } from "../sim/weather";
import { DIFFICULTY_RULES, type MapSpec } from "../spec/mapspec";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";

/** The start's water read by number (`startWaterGate`). Each tile of the start's lake falls from its depth now to its
 *  depth at the drought's end by the analytic rule (`sim/drought.ts` `droughtStorage`: the water over its spill level
 *  drains at once, every pool loses its surface's evaporation), and `margin` levels more; the fall is read at `steps`
 *  levels between, since a pump's shore is a band (0 to 2 levels over the water), not a floor. The rule reads the lake
 *  lower than the run: at the drought's end the run's water stood 0.03 to 0.43 over it on every tile of the start's
 *  lake (River Valley seeds 1 to 24 at 128², 1 and 3 at 256², the lakes 1.5 to 3.2 levels down), so the margin is for
 *  what it leaves out (a lake parted as it falls, its narrow parts drying faster). A fall of 1.5 read all over, as
 *  before, missed lakes that fell 2.4. */
export const START_SCREEN = { margin: 0.1, steps: 12 } as const;

/** Whether a pump on a shore within `within` tiles' walk reaches one of `tiles` at every level of their fall from
 *  `depth` through `days` more of drought by the rule (`START_SCREEN`). */
function screenFrom(b: BuildResult, walk: Float64Array, tiles: readonly number[], within: number, depth: ArrayLike<number>, contamination: ArrayLike<number>, days: number): boolean {
  const { W, H } = b;
  const kept = droughtStorage(b.waterModel, depth, days);
  for (let s = 0; s <= START_SCREEN.steps; s++) {
    const t = s / START_SCREEN.steps;
    let reached = false;
    for (const i of tiles) {
      if (tileShoreWalk(walk, b.heights, W, H, i, depth[i] - t * (depth[i] - kept[i] + START_SCREEN.margin), contamination[i] < PUMP_CLEAN) <= within) {
        reached = true;
        break;
      }
    }
    if (!reached) return false;
  }
  return true;
}

/** The start's water through the difficulty's longest drought, as generation gates it (D133's rule, `StartWaterDays`):
 *  the day it goes (`gone`, 0 when it holds) and the days the drought was run for it (`ran`). Read by number first
 *  (`START_SCREEN`); where that read cannot vouch for the start's lake, the drought is run a day at a time as the
 *  editor's Drought view runs it, the day's water judged by the rule, and read by number again for the days left, so
 *  the run stops once the lake's drain is past and the rule vouches for the rest. Only the run says the water goes. */
export function startWaterGate(spec: MapSpec, plan: PremisePlan, b: BuildResult, water: StageWater): { gone: number; days: number; ran: number } {
  const days = hazardDays(spec.designedFor, "drought");
  const st = b.start;
  const k = plan.bodies.findIndex((x) => x.id === plan.stair?.startLake) + 1;
  const within = spec.settings.start.rules.waterWithin ?? DIFFICULTY_RULES[spec.designedFor].waterWithin;
  const tiles: number[] = [];
  for (let i = 0; i < b.W * b.H; i++) if (water.raster.lake[i] === k) tiles.push(i);
  const walk = st ? startWalk(b.entities as never, b.heights, b.W, b.H, { x: st.x, y: st.y }) : null;
  if (walk && tiles.length && screenFrom(b, walk, tiles, within, b.water, b.contamination, days)) return { gone: 0, days, ran: 0 };
  const sw = new StartWaterDays("drought", { depth: b.water, contamination: b.contamination }, { W: b.W, H: b.H, heights: b.heights, objects: b.entities as never, start: st ? { x: st.x, y: st.y } : null, within });
  if (!sw.has) return { gone: 0, days, ran: 0 };
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: null } as never, "drought", days);
  try {
    for (let day = 1; day <= days; day++) {
      run.step(TICKS_PER_DAY);
      const w = run.water();
      sw.see(w);
      if (sw.day) return { gone: sw.day, days, ran: day };
      if (day < days && walk && tiles.length && screenFrom(b, walk, tiles, within, w.depth, w.contamination, days - day)) return { gone: 0, days, ran: day };
    }
  } finally {
    run.dispose();
  }
  return { gone: 0, days, ran: days };
}

export interface DroughtHold {
  days: number;
  /** Each lake and pool: its water on day 0 and at its worst day, in tile-levels. */
  lakes: { id: string; day0: number; worst: number }[];
  /** The day the start's water went (0: it held every day, or there was none a pump reaches on day 0: `has`). */
  gone: number;
  has: boolean;
}

export function droughtHold(spec: MapSpec, plan: PremisePlan, b: BuildResult, water: StageWater): DroughtHold {
  const days = hazardDays(spec.designedFor, "drought");
  const volume = (depth: ArrayLike<number>) => {
    const v = new Float64Array(plan.bodies.length);
    for (let i = 0; i < depth.length; i++) if (water.raster.lake[i]) v[water.raster.lake[i] - 1] += depth[i];
    return v;
  };
  const v0 = volume(b.water);
  const worst = Float64Array.from(v0);
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: null } as never, "drought", days);
  const st = b.start;
  const within = spec.settings.start.rules.waterWithin ?? DIFFICULTY_RULES[spec.designedFor].waterWithin;
  const sw = new StartWaterDays("drought", { depth: b.water, contamination: b.contamination }, { W: b.W, H: b.H, heights: b.heights, objects: b.entities as never, start: st ? { x: st.x, y: st.y } : null, within });
  try {
    for (let day = 1; day <= days; day++) {
      run.step(TICKS_PER_DAY);
      const w = run.water();
      sw.see(w);
      const v = volume(w.depth);
      for (let k = 0; k < v.length; k++) worst[k] = Math.min(worst[k], v[k]);
    }
  } finally {
    run.dispose();
  }
  const lakes = plan.bodies.flatMap((body, k) => (body.kind === "lake" || body.kind === "pool" ? [{ id: body.id, day0: v0[k], worst: worst[k] }] : []));
  return { days, lakes, gone: sw.day, has: sw.has };
}

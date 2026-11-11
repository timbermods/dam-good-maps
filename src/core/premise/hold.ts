// What a premise map's water holds through the difficulty's longest drought (docs/PREMISES.md §4.4 `drought.lakes`):
// the settled water run day by day as the editor's Drought view runs it (`HazardRun`), each lake's volume (its stage 1
// tiles) at its worst day, and the day the start's water goes (D133's rule, `StartWaterDays`). Headless; the
// premise-map tool prints it and premiseMap.test.ts holds the rule.

import type { BuildResult } from "../features/build";
import { StartWaterDays } from "../sim/startWaterDay";
import { TICKS_PER_DAY } from "../sim/water";
import { HazardRun, hazardDays } from "../sim/weather";
import { DIFFICULTY_RULES, type MapSpec } from "../spec/mapspec";
import type { PremisePlan } from "./types";
import type { StageWater } from "./water";

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

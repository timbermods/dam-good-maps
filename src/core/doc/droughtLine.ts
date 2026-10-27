// The drought line of the map as it stands (D133, D269): `sim/droughtLine.ts` read from the water the
// map shows, its start and its start's water rule, and the Drought view's last day. The worker asks
// it once the drought's last day is kept; contract tests ask it directly (D342). Every map has one,
// caves and overhangs included (#391: the Drought view runs on the stacked engine there).

import { DIFFICULTY_RULES } from "../spec/mapspec";
import { droughtLine, startWaterMask, type DroughtLine } from "../sim/droughtLine";
import { surfaceWater, type StackSettle } from "../sim/stackWater";
import type { MapSession } from "./session";

/** Water as the line reads it: per tile, or with every column (`stack`, a map with caves or overhangs). */
type LineWater = { depth: ArrayLike<number>; contamination?: ArrayLike<number>; stack?: StackSettle | null };

/** The drought line of `s` from `last`, the drought's last day (`days`) as the Drought view's run left it
 *  (a depth per tile, or its `HazardWater`), from `settled`: the water the run started from (default the
 *  water the map shows, `MapSession.waterShown`). With caves or overhangs both sides are read on the
 *  same column, the one standing on the map's ground (`surfaceWater`). */
export function mapDroughtLine(s: MapSession, last: ArrayLike<number> | LineWater, days: number, settled: LineWater & { contamination: ArrayLike<number> } = s.waterShown()): DroughtLine {
  const b = s.built;
  const lastWater: LineWater = "depth" in last ? last : { depth: last };
  const now = settled.stack ? surfaceWater(settled.stack, b.heights) : settled;
  const then = lastWater.stack ? surfaceWater(lastWater.stack, b.heights).depth : lastWater.depth;
  const within = s.effectiveSpec()?.settings.start.rules.waterWithin ?? DIFFICULTY_RULES[s.meta.designedFor ?? "normal"].waterWithin;
  const startWater = startWaterMask({
    W: b.W,
    H: b.H,
    heights: b.heights,
    depth: now.depth,
    contamination: now.contamination,
    objects: b.entities,
    start: b.start,
    within,
  });
  return droughtLine({
    W: b.W,
    H: b.H,
    heights: b.heights,
    settled: now,
    last: then,
    days,
    startWater,
  });
}

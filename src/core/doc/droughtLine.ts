// The drought line of the map as it stands (D133, D269): `sim/droughtLine.ts` read from the water the
// map shows, its start and its start's water rule, and the Drought view's last day. The worker asks
// it once the drought's last day is kept; contract tests ask it directly (D342). Every map has one,
// caves and overhangs included (#391: the Drought view runs on the stacked engine there).

import { DIFFICULTY_RULES } from "../spec/mapspec";
import { droughtLine, startWaterMask, type DroughtLine } from "../sim/droughtLine";
import type { MapSession } from "./session";

/** The drought line of `s` from `last`, the depth per tile (from above) on the drought's last day
 *  (`days`) as the Drought view's run left it, from `settled`: the water the run started from
 *  (default the water the map shows, `MapSession.waterShown`). */
export function mapDroughtLine(
  s: MapSession,
  last: ArrayLike<number>,
  days: number,
  settled: { depth: ArrayLike<number>; contamination: ArrayLike<number> } = s.waterShown(),
): DroughtLine {
  const b = s.built;
  const within = s.effectiveSpec()?.settings.start.rules.waterWithin ?? DIFFICULTY_RULES[s.meta.designedFor ?? "normal"].waterWithin;
  const startWater = startWaterMask({
    W: b.W,
    H: b.H,
    heights: b.heights,
    depth: settled.depth,
    contamination: settled.contamination,
    objects: b.entities,
    start: b.start,
    within,
  });
  return droughtLine({
    W: b.W,
    H: b.H,
    heights: b.heights,
    settled,
    last,
    days,
    startWater,
  });
}

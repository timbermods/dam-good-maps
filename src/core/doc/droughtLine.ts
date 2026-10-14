// The drought line of the map as it stands (D133, D269): `sim/droughtLine.ts` read from the session's
// settled water, its start and its start's water rule, and the Drought view's last day. The worker asks
// it once the drought's last day is kept; contract tests ask it directly (D342).

import { DIFFICULTY_RULES } from "../spec/mapspec";
import { droughtLine, emptyDroughtLine, startWaterMask, DROUGHT_LINE_CAVES, type DroughtLine } from "../sim/droughtLine";
import type { MapSession } from "./session";

/** Why the map has no drought line, or null: terrain above terrain (a stacked water model, or an
 *  imported map's caves and overhangs) has no drought rule yet. */
export function droughtLineRefusal(s: MapSession): string | null {
  return s.built.waterModel.stacked || s.columns.size ? DROUGHT_LINE_CAVES : null;
}

/** The drought line of `s` from `last`, the depth per tile on the drought's last day (`days`) as the
 *  Drought view's run left it from the session's settled water (`built.water`). */
export function mapDroughtLine(s: MapSession, last: ArrayLike<number>, days: number): DroughtLine {
  const b = s.built;
  const refused = droughtLineRefusal(s);
  if (refused) return emptyDroughtLine(b.W, b.H, days, refused);
  const within = s.effectiveSpec()?.settings.start.rules.waterWithin ?? DIFFICULTY_RULES[s.meta.designedFor ?? "normal"].waterWithin;
  const startWater = startWaterMask({
    W: b.W,
    H: b.H,
    heights: b.heights,
    depth: b.water,
    contamination: b.contamination,
    objects: b.entities,
    start: b.start,
    within,
  });
  return droughtLine({
    W: b.W,
    H: b.H,
    heights: b.heights,
    settled: { depth: b.water, contamination: b.contamination },
    last,
    days,
    startWater,
  });
}

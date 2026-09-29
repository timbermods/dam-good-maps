// The Floor (PLAN §20 D321, item 40): the lowest level any force ever cuts down to. One rule on the
// forces core, lifted from Erode round 6's Floor (investigation/erode, `erosionFloor` and its wash's
// clip), so every force that digs shares it (Carve, Craterize, Quake, Erupt, Glaciate; Erode and Spring
// adopt it when they are built): 1 by default, settable from 1 up to the map's height ceiling, pinned
// by the player (never Auto: it is a rule, not a flavour; Timberborn maps sometimes keep level 2 as
// their floor). Nothing a force does goes below it: where it would, the result simply runs shallower
// there (a carve, a crater, a glacier's floor), never stopping the force. Ground already below the
// floor is left as it is, never raised to it.

import { CEILING } from "../format/world";

/** The Floor when nobody set it. */
export const FLOOR_DEFAULT = 1;
export const FLOOR_MIN = 1;

/** A force's Floor from its settings: 1 when absent, a whole level from 1 to the ceiling. */
export function forceFloor(s: { floor?: number | null }, ceiling = CEILING): number {
  const v = s.floor;
  return Math.max(FLOOR_MIN, Math.min(ceiling, Math.round(typeof v === "number" && Number.isFinite(v) ? v : FLOOR_DEFAULT)));
}

/** Why `v` is not a Floor a force's row could set (null when it is, or absent). */
export function floorProblem(v: unknown, ceiling = CEILING): string | null {
  if (v === undefined || v === null) return null;
  return Number.isInteger(v) && (v as number) >= FLOOR_MIN && (v as number) <= ceiling ? null : `a force's floor is a level from ${FLOOR_MIN} to ${ceiling}`;
}

/** A force's result held at the floor: every tile it lowered below `floor` stops there instead (or
 *  where it was, when that was already lower). Returns how many tiles it held. */
export function holdAtFloor(before: ArrayLike<number>, after: Uint8Array, floor: number): number {
  let held = 0;
  for (let i = 0; i < after.length; i++)
    if (after[i] < floor && after[i] < before[i]) {
      after[i] = Math.min(before[i], floor);
      held++;
    }
  return held;
}

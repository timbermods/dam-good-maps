// A force's Size and Power set from the keyboard and the pointer (PLAN §20 D344, A1), exactly as a
// brush's, one key habit for every tool (D368 (1)): hold F and move the mouse to size its ring on the
// map (a click or letting go keeps it, Esc or a right click puts it back), { and } step its Size, [ and
// ] its Power (a brush's: its strength, on Smooth and Naturalize). Setting the Size by hand takes it off
// Auto. Pure logic: the page holds the state and shows the words beside the pointer
// (pointerWords.ts); tests/unit/forceSize.test.ts checks it.

import { ERUPT_SIZE_MAX, ERUPT_SIZE_MIN } from "../core/forces/erupt";
import { GLACIATE_SIZE_MAX, GLACIATE_SIZE_MIN } from "../core/forces/glaciate/model";
import type { Verb } from "../core/forces/op";

/** The forces with a Size (Quake's drawn line is its length: it has none). */
export type SizedForce = "carve" | "craterize" | "erupt" | "glaciate";

/** Each Size's range and step, in tiles across (Carve's is its width), as its slider has it. */
export const FORCE_SIZES: Readonly<Record<SizedForce, { min: number; max: number; step: number }>> = {
  carve: { min: 2, max: 24, step: 1 },
  craterize: { min: 4, max: 180, step: 2 },
  erupt: { min: ERUPT_SIZE_MIN, max: ERUPT_SIZE_MAX, step: 2 },
  glaciate: { min: GLACIATE_SIZE_MIN, max: GLACIATE_SIZE_MAX, step: 2 },
};

export const sized = (verb: Verb | string | null): verb is SizedForce => verb !== null && verb in FORCE_SIZES;

/** A Size on its slider's steps, within its range. */
export function snapSize(verb: SizedForce, size: number): number {
  const { min, max, step } = FORCE_SIZES[verb];
  return Math.max(min, Math.min(max, Math.round(size / step) * step));
}

/** The Size whose ring reaches `d` tiles from its middle (a force's reach is half its Size). */
export function sizeForReach(verb: SizedForce, d: number): number {
  return snapSize(verb, 2 * d);
}

/** What a key steps, the same for every tool (D368 (1)): { and } the Size, [ and ] the strength (a
 *  force's Power, Smooth and Naturalize's strength; Raise, Lower and Flatten have none: their target
 *  level is theirs). Null for any other key. */
export function keyHabit(key: string): { what: "size" | "strength"; dir: 1 | -1 } | null {
  if (key === "{" || key === "}") return { what: "size", dir: key === "}" ? 1 : -1 };
  if (key === "[" || key === "]") return { what: "strength", dir: key === "]" ? 1 : -1 };
  return null;
}

/** { or }: the Size a step smaller or larger, from the size it has now (on Auto: the one Power gives). */
export function stepSize(verb: SizedForce, now: number, dir: 1 | -1): number {
  const { step } = FORCE_SIZES[verb];
  const from = snapSize(verb, now);
  // (an Auto size between two steps goes to the step on that side)
  const next = from !== now && Math.sign(from - now) === dir ? from : from + dir * step;
  return snapSize(verb, next);
}

/** [ or ]: Power a slider's step (5) down or up, 0 to 100. */
export function stepPower(power: number, dir: 1 | -1): number {
  return Math.max(0, Math.min(100, Math.round(power / 5) * 5 + dir * 5));
}

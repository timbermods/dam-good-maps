// The wall with one gate's range in the plan's local frame (docs/PREMISES.md §5.1; `premises/wallGate.ts` draws it):
// read along it by stage 1's checks (`gateWater.ts`), stage 2 (`gateLand.ts`) and the plan's invariants. Its own file so
// stage 1 reads it without importing the premise (which imports stage 1's checks).

import type { Point } from "./types";

/** The range in the plan's local frame (u along it, v toward the basin), sampled every `step` tiles of u from 0: the
 *  spine's v (its crest line), the crest's level and the half-widths toward the valley (`front`) and the basin
 *  (`back`). The land is the shared relief's, shaped from these; nothing is laid along them. */
export interface GateRange {
  step: number;
  v: number[];
  crest: number[];
  front: number[];
  back: number[];
}

/** The range at local u: its spine's v, its crest and its half-widths, read between the plan's samples. */
export function rangeAt(R: GateRange, u: number): { v: number; crest: number; front: number; back: number } {
  const n = R.v.length - 1;
  const q = Math.max(0, Math.min(n, u / R.step));
  const k = Math.min(n - 1, Math.floor(q));
  const f = q - k;
  const at = (a: readonly number[]) => a[k] + (a[k + 1] - a[k]) * f;
  return { v: at(R.v), crest: at(R.crest), front: at(R.front), back: at(R.back) };
}

/** The range's spine as a local polyline. */
export const spineLocal = (R: GateRange): Point[] => R.v.map((v, k) => [k * R.step, v]);

/** Where a local point stands: 0 the valley (before the range's foot), 1 the range, 2 the basin (past its back foot). */
export function sideOf(R: GateRange, u: number, v: number): 0 | 1 | 2 {
  const r = rangeAt(R, u);
  return v < r.v - r.front ? 0 : v <= r.v + r.back ? 1 : 2;
}


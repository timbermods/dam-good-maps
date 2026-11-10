// The first frame's arithmetic (docs/PREMISES.md §4.3): how far in front of a start a landmark's lip may stand and
// still be whole in the game's first camera, derived from `analysis/opening.ts`'s camera, never retyped. Stage 0
// places the start and the lip together by it; stage 3 (`checkFrame`, later) reads the built land through the same
// camera.
//
// The camera looks down at 60° (`OPENING.pitch`) from `32 × 1.3^(0.1 z)` tiles (`baseDistance`, `zoomBase`,
// `zoomPerLevel`) away from its target, which lies `z × cot 60°` past the start's middle on level 0. A point at height
// `h`, `ahead` tiles in front of the start's middle along the look, is under the frame's top edge (v ≤ `vTop`) when
// the line to it dips at least `pitch − atan(vTop × tan(fov / 2))` below the horizon. Solved for `ahead`:
//
//   ahead ≤ reach × distance(z) + run × z − perLevel × h      (0.4342, 0.577 and 1.0788 at vTop 0.98)
//
// v does not depend on how far the point stands to the side, so the limit holds across the whole frame.

import { COS_P, frameAt, OPENING, openingCamera, SIN_P, TAN_H, TAN_V, type OpeningStart } from "../analysis/opening";
import { pow, sqrt } from "../math/portable";
import type { Point } from "./types";

export const FRAME = {
  /** The frame's top edge, as `frameAt`'s v, with a margin (the hand-built map's measure). */
  vTop: 0.98,
  /** Its sides, as |u|. */
  uSide: 0.95,
  /** The nearest a lip may stand: the start's 5 × 5 dry (`start.dry`) and a plunge pool two wide in front of the lip. */
  lipNearest: 5.5,
  /** The share of the frame's width the landmark's lip spans. */
  lipShare: [0.35, 0.56] as const,
  /** The lip runs across the look within this angle: its sine. */
  acrossSin: 0.25881904510252074, // sin 15°
  /** The water over a landmark's lip, added to its crest for the frame (PREMISES §4.3's 0.3). */
  overLip: 0.3,
} as const;

const TAN_PITCH = SIN_P / COS_P;

/** The frame's three coefficients at a top edge `v` (0.98 by default): `reach` per tile of camera distance, `run`
 *  per level of the start (cot 60°) and `perLevel` per level of the point's height. */
export function frameCoefficients(v: number = FRAME.vTop): { reach: number; run: number; perLevel: number } {
  // tan(pitch − b) with tan b = v × tan(fov / 2): the dip of the frame's edge row
  const tb = v * TAN_V;
  const dip = (TAN_PITCH - tb) / (1 + TAN_PITCH * tb);
  const perLevel = 1 / dip;
  return { reach: SIN_P * perLevel - COS_P, run: COS_P / SIN_P, perLevel };
}

/** The camera's distance from its target for a start on level `z`, at the game's first zoom (`z × 0.1`). */
export function firstDistance(z: number): number {
  return pow(OPENING.zoomBase, z * OPENING.zoomPerLevel) * OPENING.baseDistance;
}

/** How far in front of a start on level `z` (along the camera's look, from its middle) a point at height `h` may stand
 *  and stay under the first frame's top edge: PREMISES §4.3's `0.4342 × 32 × 1.3^(0.1 z) + 0.577 z − 1.0788 h`. */
export function frameLimit(z: number, h: number, v: number = FRAME.vTop): number {
  const c = frameCoefficients(v);
  return c.reach * firstDistance(z) + c.run * z - c.perLevel * h;
}

/** How far a point (tiles) stands in front of the start's middle along the camera's look, and to its right. */
export function aheadOf(start: OpeningStart, p: Point): { ahead: number; side: number } {
  const cam = openingCamera(start);
  const dx = p[0] - start.x;
  const dy = p[1] - start.y;
  return { ahead: dx * cam.look[0] + dy * cam.look[1], side: dx * cam.right[0] + dy * cam.right[1] };
}

/** The first frame's width in tiles, side to side at |u| = 1, at a point `ahead` in front of the start at height `h`. */
export function frameWidthAt(start: OpeningStart, ahead: number, h: number): number {
  const d = firstDistance(start.z);
  // the eye stands `d cos p` behind the target, which is `run × z` past the start's middle
  const fromEye = ahead - (start.z * COS_P) / SIN_P + d * COS_P;
  const zc = fromEye * COS_P - (h - d * SIN_P) * SIN_P;
  return 2 * zc * TAN_H;
}

export interface LipInFrame {
  /** The lip's ends ahead of the start, and the limit for its height. */
  ahead: [number, number];
  limit: number;
  /** Where its ends and its foot's ends fall in the first frame (u across, v up). */
  ends: { u: number; v: number }[];
  feet: { u: number; v: number }[];
  /** Its length over the frame's width at its depth. */
  share: number;
  /** The sine of its angle off square to the look. */
  skew: number;
}

/** A lip (two crest ends in tiles, the crest at `crest`) and its foot (`foot`, the water's level under it) as the
 *  start's first camera sees them. The foot is read 1.5 tiles toward the camera from each end. */
export function lipInFrame(start: OpeningStart, lip: [Point, Point], crest: number, foot: number): LipInFrame {
  const cam = openingCamera(start);
  const h = crest + FRAME.overLip;
  const a0 = aheadOf(start, lip[0]).ahead;
  const a1 = aheadOf(start, lip[1]).ahead;
  const at = (p: Point, z: number) => frameAt(cam, p[0] + 0.5, p[1] + 0.5, z) ?? { u: Infinity, v: Infinity };
  const ends = lip.map((p) => at(p, h));
  const feet = lip.map((p) => at([p[0] - 1.5 * cam.look[0], p[1] - 1.5 * cam.look[1]], foot));
  const lx = lip[1][0] - lip[0][0];
  const ly = lip[1][1] - lip[0][1];
  const across = Math.abs(lx * cam.right[0] + ly * cam.right[1]);
  const along = Math.abs(lx * cam.look[0] + ly * cam.look[1]);
  const len = sqrt(lx * lx + ly * ly);
  return {
    ahead: [a0, a1],
    limit: frameLimit(start.z, h),
    ends,
    feet,
    share: across / frameWidthAt(start, (a0 + a1) / 2, h),
    skew: len > 0 ? along / len : 0,
  };
}
